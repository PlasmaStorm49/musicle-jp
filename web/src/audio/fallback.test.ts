import { describe, expect, it, vi } from "vitest";
import {
  type AudioEngine,
  type AudioFailure,
  AudioUnavailableError,
  type MixEngine,
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
    setVolume: vi.fn(),
    volume: () => 1,
  } satisfies AudioEngine;
}

const failing = (kind: AudioFailure) => async () => {
  throw new AudioUnavailableError(kind, kind);
};

describe("FallbackAudioEngine (Web Audio, depois <audio>)", () => {
  it("o volume vai aos dois motores: a sessão pode trocar para o <audio> no meio do jogo", () => {
    const primary = engine();
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    composite.setVolume(0.3);
    expect(primary.setVolume).toHaveBeenCalledWith(0.3);
    expect(reserve.setVolume).toHaveBeenCalledWith(0.3);
    expect(composite.volume()).toBe(1); // o do primário (o mock devolve 1)
  });

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
    // O unlock repassa aos dois. A tela não o chama: cada motor destrava no próprio play().
    expect(reserve.unlock).toHaveBeenCalled();
  });

  it("falha decode: toca no <audio> e fica nele a sessão inteira", async () => {
    const primary = engine(failing("decode"));
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    await expect(composite.play(A, 3, 2)).resolves.toMatchObject({ seconds: 2 });
    expect(reserve.play).toHaveBeenCalledWith(A, 3, 2);
    await composite.play(B, 0, 1);
    composite.preload(B);
    expect(primary.play).toHaveBeenCalledOnce(); // não tenta mais o Web Audio
    expect(primary.preload).not.toHaveBeenCalled();
    expect(reserve.play).toHaveBeenLastCalledWith(B, 0, 1);
  });

  it.each(["http", "network"] as const)(
    "falha %s: a reserva vale só para aquela URL",
    async (kind) => {
      // Uma queda de sinal passageira não pode tirar o corte exato do resto do dia.
      const primary = engine(async (url, _, s) => {
        if (url === A) throw new AudioUnavailableError(kind, kind);
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
    },
  );

  it("só na reserva: o Parar chega aos dois motores", async () => {
    const primary = engine(failing("decode"));
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    await composite.play(A, 0, 1); // decode: a sessão vai para a reserva
    await composite.play(B, 0, 1);
    composite.stop();
    expect(reserve.stop).toHaveBeenCalled();
    expect(primary.stop).toHaveBeenCalled();
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

describe("a mistura no motor composto (M17)", () => {
  const TRACKS = [
    { url: A, offset: 0 },
    { url: B, offset: 0 },
  ];
  const mixPlayback = (seconds: number) => ({
    ...playback(seconds),
    setGain: vi.fn(),
    setPan: vi.fn(),
  });
  const mixing = (playMix: MixEngine["playMix"] = async (_, s) => mixPlayback(s)) => ({
    ...engine(),
    playMix: vi.fn(playMix),
  });

  it("repassa ao Web Audio e para o <audio>", async () => {
    const primary = mixing();
    const reserve = engine();
    const composite = new FallbackAudioEngine(primary, reserve);
    expect((await composite.playMix(TRACKS, 4))?.seconds).toBe(4);
    expect(primary.playMix).toHaveBeenCalledWith(TRACKS, 4, undefined);
    expect(reserve.stop).toHaveBeenCalled();
  });

  it("sem o Web Audio que mistura, ou depois de um decode, falha: a tela anula a rodada", async () => {
    await expect(
      new FallbackAudioEngine(engine(), engine()).playMix(TRACKS, 4),
    ).rejects.toMatchObject({ kind: "decode" });
    const primary = mixing(failing("decode"));
    const composite = new FallbackAudioEngine(primary, engine());
    await expect(composite.playMix(TRACKS, 4)).rejects.toMatchObject({ kind: "decode" });
    // Daqui em diante, a sessão é do <audio>: a mistura nem tenta.
    await expect(composite.playMix(TRACKS, 4)).rejects.toMatchObject({ kind: "decode" });
    expect(primary.playMix).toHaveBeenCalledTimes(1);
  });

  it("a falha de rede de uma prévia não passa a sessão para o <audio>", async () => {
    const primary = mixing(failing("network"));
    const composite = new FallbackAudioEngine(primary, engine());
    await expect(composite.playMix(TRACKS, 4)).rejects.toMatchObject({ kind: "network" });
    await expect(composite.playMix(TRACKS, 4)).rejects.toMatchObject({ kind: "network" });
    expect(primary.playMix).toHaveBeenCalledTimes(2);
    // E a prévia sozinha continua no Web Audio.
    await composite.play(A, 0, 1);
    expect(primary.play).toHaveBeenCalledTimes(1);
  });
});
