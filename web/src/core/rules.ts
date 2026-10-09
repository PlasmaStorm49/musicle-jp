// Regras do jogo (PLANO, Apêndice D). Dados, não código: o reducer consulta estas tabelas,
// e um modo novo entra aqui sem espalhar if pelo reducer.
import type { AnswerMode } from "./types.ts";

/** Segundos do trecho liberados em cada etapa. */
export const STAGES = [1, 2, 4, 7, 11, 16] as const;
export const MAX_STAGE = STAGES.length - 1;
export const ROUNDS_PER_DAY = 3;
/** Pontos de uma rodada acertada na primeira etapa; cada etapa a mais custa 1. */
export const MAX_POINTS = STAGES.length;

/** Largura de cada pedaço da barra de progresso: quanto cada etapa acrescenta (1,1,2,3,4,5). */
export const SEGMENT_WEIGHTS: readonly number[] = STAGES.map(
  (seconds, i) => seconds - (i === 0 ? 0 : (STAGES[i - 1] ?? 0)),
);

export type ModeRules = {
  /** Quantos palpites ou pulos cabem numa rodada. */
  readonly maxAttempts: number;
  /** Palpite errado encerra a rodada ("end") ou libera a etapa seguinte ("advance"). */
  readonly wrongGuess: "end" | "advance";
  /** O jogador pode pedir mais trecho sem palpitar (custa 1 ponto). */
  readonly listenMore: boolean;
  /** O jogador pode pular (gasta uma tentativa e libera a etapa seguinte). */
  readonly skip: boolean;
};

export const MODE_RULES: Readonly<Record<AnswerMode, ModeRules>> = {
  choice: { maxAttempts: 1, wrongGuess: "end", listenMore: true, skip: false },
  typing: { maxAttempts: MAX_POINTS, wrongGuess: "advance", listenMore: false, skip: true },
};

/** Segundos que o jogador pode ouvir na etapa `stage`. */
export function secondsAt(stage: number): number {
  return STAGES[Math.min(Math.max(stage, 0), MAX_STAGE)] ?? STAGES[0];
}

/**
 * Pontos de uma rodada acertada na etapa `stage`. Vale para os dois modos: no 4 opções a etapa
 * sobe com "ouvir mais"; na digitação, com cada erro ou pulo (7 − número da tentativa).
 */
export function pointsAtStage(stage: number): number {
  return MAX_POINTS - Math.min(Math.max(stage, 0), MAX_STAGE);
}
