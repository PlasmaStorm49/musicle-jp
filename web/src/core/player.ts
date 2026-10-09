// Matemática da barra segmentada do player. A tela só desenha o que estas funções dizem.
import { MAX_STAGE, SEGMENT_WEIGHTS, secondsAt } from "./rules.ts";

/** Duração total da barra: a última etapa (16 s). */
export const BAR_SECONDS = secondsAt(MAX_STAGE);

export type Segment = {
  /** Largura relativa: quanto a etapa acrescenta (1, 1, 2, 3, 4, 5). */
  readonly weight: number;
  readonly unlocked: boolean;
};

export function segments(stage: number): Segment[] {
  return SEGMENT_WEIGHTS.map((weight, i) => ({ weight, unlocked: i <= stage }));
}

/** Fração da barra (0 a 1) ocupada pelo trecho liberado na etapa. */
export function unlockedFraction(stage: number): number {
  return secondsAt(stage) / BAR_SECONDS;
}

/** Fração da barra já tocada depois de `elapsed` segundos, sem passar do liberado. */
export function fillFraction(elapsed: number, stage: number): number {
  const played = Math.min(Math.max(elapsed, 0), secondsAt(stage));
  return played / BAR_SECONDS;
}
