// Regras do jogo (PLANO, Apêndice D). Dados, não código: o reducer consulta estas tabelas,
// e um modo novo entra aqui sem espalhar if pelo reducer.
import type { Target } from "./types.ts";

/**
 * Segundos do trecho liberados em cada etapa, nos dois modos de hoje (os diários e o Treino).
 * Cada modo tem a sua barra (`ModeRules.stages`): a do Superfan (ME61) é 1, 4 e 9 s.
 */
export const STAGES = [1, 2, 4, 7, 11, 16] as const;
export const MAX_STAGE = STAGES.length - 1;
export const ROUNDS_PER_DAY = 3;
/** Pontos de uma rodada acertada na primeira etapa; cada etapa a mais custa 1. */
export const MAX_POINTS = STAGES.length;
/** Os pontos do acerto em cada etapa, nos dois modos de hoje: 6, 5, 4, 3, 2 e 1. */
const STAGE_POINTS: readonly number[] = STAGES.map((_, i) => MAX_POINTS - i);
/** Pontos de uma rodada acertada com a ajuda, em qualquer etapa (P152). */
export const HELP_POINTS = 1;
/** Quantas opções a ajuda mostra, a certa entre elas (P149). */
export const HELP_OPTIONS = 4;
/**
 * Depois de quantas tentativas gastas (erradas ou puladas, P150) o botão da ajuda aparece: no
 * Treino e no modo por artista, depois da 1ª; nos diários, só depois da 3ª (P149).
 */
export const HELP_AFTER = { practice: 1, daily: 3, superfan: 0 } as const;

/** Largura de cada pedaço da barra: quanto cada etapa acrescenta (1, 1, 2, 3, 4, 5 nos de hoje). */
export function segmentWeights(stages: readonly number[]): number[] {
  return stages.map((seconds, i) => seconds - (i === 0 ? 0 : (stages[i - 1] ?? 0)));
}

export const SEGMENT_WEIGHTS: readonly number[] = segmentWeights(STAGES);

export type ModeRules = {
  /** Segundos acumulados do trecho em cada etapa: a barra do modo. */
  readonly stages: readonly number[];
  /** Quantos palpites ou pulos cabem numa rodada. */
  readonly maxAttempts: number;
  /** Palpite errado encerra a rodada ("end") ou libera a etapa seguinte ("advance"). */
  readonly wrongGuess: "end" | "advance";
  /** O jogador pode pedir mais trecho sem palpitar (custa 1 ponto). */
  readonly listenMore: boolean;
  /** O jogador pode pular (gasta uma tentativa e libera a etapa seguinte). */
  readonly skip: boolean;
  /** O palpite tem de ser uma das opções da rodada (4 opções); senão, vale qualquer da busca. */
  readonly guessFromOptions: boolean;
  /**
   * A ajuda (P149 a P152): trocar a digitação por opções de música. Quem mostra o botão
   * decide depois de quantas tentativas (HELP_AFTER: o diário espera 3).
   */
  readonly help: boolean;
  /** Tentativas que o reducer exige antes da ajuda: 1 no Desafio (P150), 0 no Superfan (P159). */
  readonly helpFrom: number;
  /** Pontos do acerto em cada etapa. */
  readonly points: readonly number[];
  /** Pontos do acerto com a ajuda, em qualquer etapa: 1 (P152); −1 no Superfan (P153). */
  readonly helpPoints: number;
  /** Pontos de cada palpite errado: 0; −5 no Superfan (P119). */
  readonly wrongPoints: number;
};

/** Os modos na ordem da nav, da home e dos diários: o Normal (álbum) primeiro. */
export const MODES: readonly Target[] = ["album", "song"];

/** Os dois modos (P100): o Normal (álbum) em 4 opções e o Desafio (música) digitado. */
export const MODE_RULES: Readonly<Record<Target, ModeRules>> = {
  album: {
    stages: STAGES,
    maxAttempts: 1,
    wrongGuess: "end",
    listenMore: true,
    skip: false,
    guessFromOptions: true,
    help: false,
    helpFrom: 0,
    points: STAGE_POINTS,
    helpPoints: HELP_POINTS,
    wrongPoints: 0,
  },
  song: {
    stages: STAGES,
    maxAttempts: MAX_POINTS,
    wrongGuess: "advance",
    listenMore: false,
    skip: true,
    guessFromOptions: false,
    help: true,
    helpFrom: 1,
    points: STAGE_POINTS,
    helpPoints: HELP_POINTS,
    wrongPoints: 0,
  },
};

/**
 * As variantes de um modo, com regras próprias e o mesmo `Target` (P125): o Superfan (ME61) é o
 * Desafio do modo por artista com 3 trechos (1, 3 e 5 s), 3, 2 ou 1 ponto pelo acerto (P121),
 * −5 por palpite errado (P119), que passa para a etapa seguinte (P158), e a ajuda logo de cara
 * (P159), valendo −1 (P153). Os limites da partida (3 erros, 3 ajudas) ficam em superfan.ts.
 */
export type Variant = "superfan";

export const VARIANT_RULES: Readonly<Record<Variant, ModeRules>> = {
  superfan: {
    stages: [1, 4, 9],
    maxAttempts: 3,
    wrongGuess: "advance",
    listenMore: false,
    skip: true,
    guessFromOptions: false,
    help: true,
    helpFrom: 0,
    points: [3, 2, 1],
    helpPoints: -1,
    wrongPoints: -5,
  },
};

/** As regras de um jogo: as da variante, se houver, ou as do modo. */
export function rulesOf(game: { readonly target: Target; readonly variant?: Variant }): ModeRules {
  return game.variant ? VARIANT_RULES[game.variant] : MODE_RULES[game.target];
}

/**
 * O botão "Pular" aparece? Só no modo que pula e enquanto sobra tentativa depois do pulo: na
 * última, pular daria o mesmo que desistir (0 ponto) e "+0 s" de trecho.
 */
export function canSkip(rules: ModeRules, attemptsUsed: number): boolean {
  return rules.skip && attemptsUsed + 1 < rules.maxAttempts;
}

/** A última etapa da barra do modo. */
export function lastStage(rules: ModeRules): number {
  return rules.stages.length - 1;
}

/** Segundos que o jogador pode ouvir na etapa `stage` (da barra dos diários, se não disser outra). */
export function secondsAt(stage: number, stages: readonly number[] = STAGES): number {
  return stages[Math.min(Math.max(stage, 0), stages.length - 1)] ?? stages[0] ?? 0;
}

/**
 * Pontos de uma rodada acertada na etapa `stage`. Vale para os dois modos: no Normal a etapa
 * sobe com "ouvir mais"; no Desafio, com cada erro ou pulo (7 − número da tentativa).
 */
export function pointsAtStage(stage: number): number {
  return MAX_POINTS - Math.min(Math.max(stage, 0), MAX_STAGE);
}
