import { describe, expect, it } from "vitest";
import {
  canSkip,
  MAX_POINTS,
  MAX_STAGE,
  MODE_RULES,
  pointsAtStage,
  SEGMENT_WEIGHTS,
  STAGES,
  secondsAt,
} from "./rules.ts";

describe("canSkip", () => {
  it("digitação: pula até a 5ª tentativa; na última, só desistir (o pulo daria +0 s)", () => {
    expect(canSkip(MODE_RULES.typing, 0)).toBe(true);
    expect(canSkip(MODE_RULES.typing, 4)).toBe(true);
    expect(canSkip(MODE_RULES.typing, 5)).toBe(false);
  });

  it("4 opções nunca pula", () => {
    expect(canSkip(MODE_RULES.choice, 0)).toBe(false);
  });
});

describe("etapas", () => {
  it("seguem a progressão do Heardle", () => {
    expect(STAGES).toEqual([1, 2, 4, 7, 11, 16]);
    expect(MAX_STAGE).toBe(5);
  });

  it("os pedaços da barra somam o trecho inteiro", () => {
    expect(SEGMENT_WEIGHTS).toEqual([1, 1, 2, 3, 4, 5]);
    expect(SEGMENT_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(16);
  });

  it("secondsAt limita a etapa ao intervalo válido", () => {
    expect(secondsAt(0)).toBe(1);
    expect(secondsAt(3)).toBe(7);
    expect(secondsAt(99)).toBe(16);
    expect(secondsAt(-1)).toBe(1);
  });
});

describe("pontos", () => {
  it("6 na primeira etapa, 1 na última", () => {
    expect(pointsAtStage(0)).toBe(MAX_POINTS);
    expect(pointsAtStage(0)).toBe(6);
    expect(pointsAtStage(5)).toBe(1);
  });

  it("na digitação equivale a 7 − número da tentativa", () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      expect(pointsAtStage(attempt - 1)).toBe(7 - attempt);
    }
  });
});

describe("regras por modo", () => {
  it("4 opções: 1 palpite, errar encerra, pode ouvir mais, não pula", () => {
    expect(MODE_RULES.choice).toEqual({
      maxAttempts: 1,
      wrongGuess: "end",
      listenMore: true,
      skip: false,
    });
  });

  it("digitação: 6 tentativas, errar avança, pode pular", () => {
    expect(MODE_RULES.typing).toEqual({
      maxAttempts: 6,
      wrongGuess: "advance",
      listenMore: false,
      skip: true,
    });
  });
});
