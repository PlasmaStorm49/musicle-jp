import { describe, expect, it } from "vitest";
import { FADE_SECONDS, playbackEnvelope, stopEnvelope } from "./envelope.ts";

describe("playbackEnvelope", () => {
  it("sobe em 10 ms, segura e termina de descer exatamente no corte", () => {
    const points = playbackEnvelope(5, 1);
    expect(points).toEqual([
      { kind: "set", value: 0, time: 5 },
      { kind: "ramp", value: 1, time: 5 + FADE_SECONDS },
      { kind: "set", value: 1, time: 6 - FADE_SECONDS },
      { kind: "ramp", value: 0, time: 6 },
    ]);
  });

  it("o último ponto é sempre o fim do trecho, em qualquer etapa", () => {
    for (const seconds of [1, 2, 4, 7, 11, 16, 30]) {
      const last = playbackEnvelope(0, seconds).at(-1);
      expect(last).toEqual({ kind: "ramp", value: 0, time: seconds });
    }
  });

  it("os tempos nunca andam para trás, nem em trecho curtíssimo", () => {
    for (const seconds of [0.005, 0.02, 1]) {
      const times = playbackEnvelope(0, seconds).map((p) => p.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });
});

describe("stopEnvelope", () => {
  it("parte do volume atual e zera em 10 ms", () => {
    expect(stopEnvelope(3, 0.8)).toEqual({
      points: [
        { kind: "set", value: 0.8, time: 3 },
        { kind: "ramp", value: 0, time: 3 + FADE_SECONDS },
      ],
      stopAt: 3 + FADE_SECONDS,
    });
  });
});
