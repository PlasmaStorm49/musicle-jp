// Matemática da barra segmentada do player. A tela só desenha o que estas funções dizem.
// A barra é a do modo (`ModeRules.stages`); sem dizer, a dos diários (1 a 16 s).
import { STAGES, secondsAt, segmentWeights } from "./rules.ts";

/** Duração total da barra: a última etapa. */
export function barSeconds(stages: readonly number[] = STAGES): number {
  return stages[stages.length - 1] ?? 0;
}

/** A barra dos diários: 16 s. */
export const BAR_SECONDS = barSeconds();

export type Segment = {
  /** Largura relativa: quanto a etapa acrescenta (1, 1, 2, 3, 4, 5). */
  readonly weight: number;
  readonly unlocked: boolean;
};

export function segments(stage: number, stages: readonly number[] = STAGES): Segment[] {
  return segmentWeights(stages).map((weight, i) => ({ weight, unlocked: i <= stage }));
}

/** Fração da barra (0 a 1) ocupada pelo trecho liberado na etapa. */
export function unlockedFraction(stage: number, stages: readonly number[] = STAGES): number {
  return secondsAt(stage, stages) / barSeconds(stages);
}

/** Fração da barra já tocada depois de `elapsed` segundos, sem passar do liberado. */
export function fillFraction(
  elapsed: number,
  stage: number,
  stages: readonly number[] = STAGES,
): number {
  const played = Math.min(Math.max(elapsed, 0), secondsAt(stage, stages));
  return played / barSeconds(stages);
}

/** Quanto um toque perto do fim do liberado ainda toca: ele recua até sobrar isto (P224). */
export const SEEK_TAIL = 0.5;

/** Quanto uma seta do teclado anda na barra, em segundos. */
export const SEEK_STEP = 1;

/**
 * O ponto, em segundos, de um toque na barra (P224), pela fração dela onde o dedo caiu (0 a 1).
 * Só vale no que já está liberado (`limit`): na parte fechada, null, para o toque não entregar
 * som novo. Perto do fim, o ponto recua até sobrar `SEEK_TAIL` para tocar.
 */
export function seekSeconds(fraction: number, total: number, limit: number): number | null {
  if (!Number.isFinite(fraction) || total <= 0 || limit <= 0) return null;
  const at = Math.max(fraction, 0) * total;
  if (at >= limit) return null;
  return clampSeek(at, limit);
}

/** O ponto dentro do liberado, com a sobra do fim (o teclado e o toque). */
export function clampSeek(at: number, limit: number): number {
  return Math.max(0, Math.min(at, limit - SEEK_TAIL));
}
