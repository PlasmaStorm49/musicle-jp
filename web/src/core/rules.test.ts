import { describe, expect, it } from "vitest";
import {
  canSkip,
  MAX_POINTS,
  MAX_STAGE,
  MODE_RULES,
  MODES,
  pointsAtStage,
  rulesOf,
  SEGMENT_WEIGHTS,
  STAGES,
  secondsAt,
  VARIANT_RULES,
} from "./rules.ts";

describe("canSkip", () => {
  it("Desafio: pula até a 5ª tentativa; na última, só desistir (o pulo daria +0 s)", () => {
    expect(canSkip(MODE_RULES.song, 0)).toBe(true);
    expect(canSkip(MODE_RULES.song, 4)).toBe(true);
    expect(canSkip(MODE_RULES.song, 5)).toBe(false);
  });

  it("Normal nunca pula", () => {
    expect(canSkip(MODE_RULES.album, 0)).toBe(false);
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

describe("regras por modo (P100)", () => {
  it("Normal (álbum): 1 palpite entre as opções, errar encerra, pode ouvir mais, não pula", () => {
    expect(MODE_RULES.album).toEqual({
      stages: [1, 2, 4, 7, 11, 16],
      maxAttempts: 1,
      wrongGuess: "end",
      listenMore: true,
      skip: false,
      guessFromOptions: true,
      help: false,
      helpFrom: 0,
      points: [6, 5, 4, 3, 2, 1],
      helpPoints: 1,
      wrongPoints: 0,
      giveUpPoints: 0,
    });
  });

  it("Desafio (música): 6 tentativas digitadas, errar avança, pode pular e pedir ajuda", () => {
    expect(MODE_RULES.song).toEqual({
      stages: [1, 2, 4, 7, 11, 16],
      maxAttempts: 6,
      wrongGuess: "advance",
      listenMore: false,
      skip: true,
      guessFromOptions: false,
      help: true,
      helpFrom: 1,
      points: [6, 5, 4, 3, 2, 1],
      helpPoints: 1,
      wrongPoints: 0,
      giveUpPoints: 0,
    });
  });

  it("Superfan (ME61): 3 trechos, 3 tentativas, −5 por erro, a ajuda logo de cara valendo 0, −2 por desistir (P186)", () => {
    expect(VARIANT_RULES.superfan).toEqual({
      stages: [1, 4, 9],
      maxAttempts: 3,
      wrongGuess: "advance",
      listenMore: false,
      skip: true,
      guessFromOptions: false,
      help: true,
      helpFrom: 0,
      points: [3, 2, 1],
      helpPoints: 0,
      wrongPoints: -5,
      giveUpPoints: -2,
    });
    expect(rulesOf({ target: "song", variant: "superfan" })).toBe(VARIANT_RULES.superfan);
    expect(rulesOf({ target: "song" })).toBe(MODE_RULES.song);
  });

  it("a ordem dos modos na tela: o Normal primeiro", () => {
    expect(MODES).toEqual(["album", "song"]);
  });
});
