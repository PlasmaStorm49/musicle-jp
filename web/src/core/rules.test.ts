import { describe, expect, it } from "vitest";
import {
  canSkip,
  DAILY_SCORING,
  MAX_ATTEMPTS,
  MAX_POINTS,
  MAX_STAGE,
  MODE_RULES,
  MODES,
  rulesOf,
  SEGMENT_WEIGHTS,
  STAGES,
  scoreOf,
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

describe("pontos (scoreOf)", () => {
  const won = (stage: number, help?: unknown) => ({ status: "won", stage, help });

  it("o acerto vale os pontos da etapa; com a ajuda, os dela; o resto, 0", () => {
    const rules = MODE_RULES.song;
    expect(scoreOf(won(0), rules)).toBe(MAX_POINTS);
    expect(scoreOf(won(5), rules)).toBe(rules.points[5]);
    expect(scoreOf(won(2, 1), rules)).toBe(rules.helpPoints);
    expect(scoreOf({ status: "lost", stage: 3 }, rules)).toBe(0);
    expect(scoreOf({ status: "void", stage: 0 }, rules)).toBe(0);
    // A etapa fora do intervalo cai na mais próxima.
    expect(scoreOf(won(99), rules)).toBe(rules.points.at(-1));
  });

  it("a ajuda vale no jogo (as opções) e no resumo salvo (a tentativa): null é sem ajuda", () => {
    const rules = MODE_RULES.song;
    expect(scoreOf(won(1, ["a", "b"]), rules)).toBe(rules.helpPoints);
    expect(scoreOf(won(1, null), rules)).toBe(rules.points[1]);
  });

  it("os diários pontuam igual nos dois modos: o resumo salvo usa uma pontuação só", () => {
    expect(MODE_RULES.album.points).toEqual(MODE_RULES.song.points);
    expect(MODE_RULES.album.helpPoints).toEqual(MODE_RULES.song.helpPoints);
    expect(DAILY_SCORING).toBe(MODE_RULES.song);
  });

  it("as tentativas do Desafio são uma por etapa, e não o máximo de pontos", () => {
    expect(MODE_RULES.song.maxAttempts).toBe(MAX_ATTEMPTS);
    expect(MAX_ATTEMPTS).toBe(STAGES.length);
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

  it("Superfan (ME61): 3 trechos, 3 tentativas, −5 por erro, a ajuda logo de cara valendo 0, −5 por desistir (P290)", () => {
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
      giveUpPoints: -5,
    });
    expect(rulesOf({ target: "song", variant: "superfan" })).toBe(VARIANT_RULES.superfan);
    expect(rulesOf({ target: "song" })).toBe(MODE_RULES.song);
  });

  it("a ordem dos modos na tela: o Normal primeiro", () => {
    expect(MODES).toEqual(["album", "song"]);
  });
});
