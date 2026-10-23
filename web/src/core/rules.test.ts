import { describe, expect, it } from "vitest";
import {
  canSkip,
  DAILY_SCORING,
  halfUp,
  MAX_ATTEMPTS,
  MAX_POINTS,
  MAX_STAGE,
  MODE_RULES,
  MODES,
  pointsAt,
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
    expect(scoreOf(won(2, 1), rules)).toBe(rules.helpPoints[2]);
    expect(scoreOf({ status: "lost", stage: 3 }, rules)).toBe(0);
    expect(scoreOf({ status: "void", stage: 0 }, rules)).toBe(0);
    // A etapa fora do intervalo cai na mais próxima.
    expect(scoreOf(won(99), rules)).toBe(rules.points.at(-1));
  });

  it("a ajuda vale no jogo (as opções) e no resumo salvo (a tentativa): null é sem ajuda", () => {
    const rules = MODE_RULES.song;
    expect(scoreOf(won(1, ["a", "b"]), rules)).toBe(rules.helpPoints[1]);
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

describe("a pontuação nova (ME107)", () => {
  const all = [MODE_RULES.album, MODE_RULES.song, VARIANT_RULES.superfan];

  it("as tabelas seguem a regra: 10 − 1,75 × log₂(segundos), com o meio ponto para baixo", () => {
    for (const rules of all) {
      expect(rules.points).toEqual(rules.stages.map(pointsAt));
      expect(rules.helpPoints).toEqual(halfUp(rules.points));
    }
    expect(MODE_RULES.song.points).toEqual([10, 8, 6, 5, 4, 3]);
    expect(MODE_RULES.song.helpPoints).toEqual([5, 4, 3, 3, 2, 2]);
    expect(VARIANT_RULES.superfan.points).toEqual([10, 6, 4]);
    expect(VARIANT_RULES.superfan.helpPoints).toEqual([5, 3, 2]);
    // O 4 s dá 6,5: o meio ponto vai para baixo.
    expect(pointsAt(4)).toBe(6);
  });

  it("toda rodada vale até 10, em todo modo, e o acerto cai a cada trecho a mais", () => {
    for (const rules of all) {
      expect(rules.points[0]).toBe(MAX_POINTS);
      for (let i = 1; i < rules.points.length; i++) {
        expect(rules.points[i]).toBeLessThan(rules.points[i - 1] ?? 0);
      }
    }
  });

  it("no Normal, chutar no 1 s rende menos que ouvir tudo e acertar (1 chance em 4)", () => {
    const { points } = MODE_RULES.album;
    expect((points[0] ?? 0) / 4).toBeLessThan(points.at(-1) ?? 0);
  });

  it("acertar digitando no trecho seguinte vale mais que pegar a ajuda agora", () => {
    for (const rules of [MODE_RULES.song, VARIANT_RULES.superfan]) {
      for (let i = 0; i < rules.points.length - 1; i++) {
        expect(rules.points[i + 1]).toBeGreaterThan(rules.helpPoints[i] ?? 0);
      }
    }
  });

  it("acertar sozinho vale mais que com a ajuda, que vale mais que errar (0)", () => {
    for (const rules of all) {
      rules.points.forEach((p, i) => {
        expect(p).toBeGreaterThan(rules.helpPoints[i] ?? 0);
        expect(rules.helpPoints[i]).toBeGreaterThan(0);
      });
    }
  });

  it("a ajuda espera uma tentativa gasta em todo modo, menos no Superfan, que a dá de cara", () => {
    expect(MODE_RULES.song.helpFrom).toBe(1);
    expect(VARIANT_RULES.superfan.helpFrom).toBe(0);
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
      points: [10, 8, 6, 5, 4, 3],
      helpPoints: [5, 4, 3, 3, 2, 2],
      lives: false,
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
      points: [10, 8, 6, 5, 4, 3],
      helpPoints: [5, 4, 3, 3, 2, 2],
      lives: false,
    });
  });

  it("Superfan (ME61): 3 trechos, 3 tentativas, 10, 6 e 4, a ajuda logo de cara, e o erro custa uma vida (ME107)", () => {
    expect(VARIANT_RULES.superfan).toEqual({
      stages: [1, 4, 9],
      maxAttempts: 3,
      wrongGuess: "advance",
      listenMore: false,
      skip: true,
      guessFromOptions: false,
      help: true,
      helpFrom: 0,
      points: [10, 6, 4],
      helpPoints: [5, 3, 2],
      lives: true,
    });
    expect(rulesOf({ target: "song", variant: "superfan" })).toBe(VARIANT_RULES.superfan);
    expect(rulesOf({ target: "song" })).toBe(MODE_RULES.song);
  });

  it("a ordem dos modos na tela: o Normal primeiro", () => {
    expect(MODES).toEqual(["album", "song"]);
  });
});
