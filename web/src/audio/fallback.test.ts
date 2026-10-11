import { describe, expect, it, vi } from "vitest";
import {
  type AudioEngine,
  type AudioFailure,
  AudioUnavailableError,
  type Playback,
} from "./engine.ts";
import { FallbackAudioEngine } from "./fallback.ts";
import { WebAudioEngine } from "./webaudio.ts";

const A = "https://audio-ssl.itunes.apple.com/a.m4a";
const B = "https://audio-ssl.itunes.apple.com/b.m4a";

function playback(seconds: number): Playback {
  const result = { requested: seconds, played: seconds, interrupted: false };
  return { t0: 0, seconds, elapsed: () => 0, done: Promise.resolve(result) };
}

function engine(play: AudioEngine["play"] = async (_, __, s) => playback(s)) {
  return {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(play),
    stop: vi.fn(),
    retain: vi.fn(),
  } satisfies AudioEngine;
}

const failing = (kind: AudioFailure) => async () => {
  throw new AudioUnavailableError(kind, kind);
};

describe("FallbackAudioEngine (Web Audio, depois <audio>)", () => {
  it("com o Web Audio funcionando, a reserva nem toca", async () => {
    const primary = engine();
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    composite.unlock();
    await composite.play(A, 0, 1);
    composite.preload(B);
    expect(primary.play).toHaveBeenCalledWith(A, 0, 1);
    expect(reserve.play).not.toHaveBeenCalled();
    expect(primary.preload).toHaveBeenCalledWith(B);
    expect(reserve.unlock).toHaveBeenCalled(); // o <audio> nasce no clique, pronto para a reserva
  });

  it.each(["decode", "network"] as const)(
    "falha %s: toca no <audio> e fica nele a sessão inteira",
    async (kind) => {
      const primary = engine(failing(kind));
      const reserve = engine();
      const composite = new FallbackAudioEngine(primary, reserve);
      await expect(composite.play(A, 3, 2)).resolves.toMatchObject({ seconds: 2 });
      expect(reserve.play).toHaveBeenCalledWith(A, 3, 2);
      await composite.play(B, 0, 1);
      composite.preload(B);
      expect(primary.play).toHaveBeenCalledOnce(); // não tenta mais o Web Audio
      expect(primary.preload).not.toHaveBeenCalled();
      expect(reserve.play).toHaveBeenLastCalledWith(B, 0, 1);
    },
  );

  it("falha http: a reserva vale só para aquela URL", async () => {
    const primary = engine(async (url, _, s) => {
      if (url === A) throw new AudioUnavailableError("http", "HTTP 404");
      return playback(s);
    });
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    await composite.play(A, 0, 1);
    await composite.play(B, 0, 1);
    await composite.play(A, 0, 2);
    expect(primary.play).toHaveBeenCalledTimes(2); // A uma vez, B uma vez
    expect(reserve.play.mock.calls).toEqual([
      [A, 0, 1],
      [A, 0, 2],
    ]);
  });

  it.each(["simulated", "blocked"] as const)("falha %s não troca de motor", async (kind) => {
    const reserve = engine();
    const composite = new FallbackAudioEngine(engine(failing(kind)), reserve);
    await expect(composite.play(A, 0, 1)).rejects.toMatchObject({ kind });
    expect(reserve.play).not.toHaveBeenCalled();
  });

  it("erro que não é de áudio segue adiante", async () => {
    const composite = new FallbackAudioEngine(
      engine(async () => {
        throw new TypeError("bug");
      }),
      engine(),
    );
    await expect(composite.play(A, 0, 1)).rejects.toBeInstanceOf(TypeError);
  });

  it("Parar durante a espera: a falha que chega depois não liga a reserva", async () => {
    let fail: (error: Error) => void = () => {};
    const primary = engine(() => new Promise((_, reject) => (fail = reject)));
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    const playing = composite.play(A, 0, 1);
    composite.stop();
    fail(new AudioUnavailableError("decode", "x"));
    await expect(playing).resolves.toBeNull();
    expect(reserve.play).not.toHaveBeenCalled();
    expect(primary.stop).toHaveBeenCalled();
    expect(reserve.stop).toHaveBeenCalled();
  });

  it("?htmlAudio=1: o Web Audio falha como decode, sem nem criar o contexto", async () => {
    const reserve = engine();
    const composite = new FallbackAudioEngine(new WebAudioEngine({ disabled: true }), reserve);
    await composite.play(A, 0, 1);
    expect(reserve.play).toHaveBeenCalledWith(A, 0, 1);
  });
});
