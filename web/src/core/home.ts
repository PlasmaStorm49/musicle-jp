// O que a home mostra de cada modo: o estado do diário (novo, em andamento ou terminado, com os
// pontos) e o placar da sessão do Treino. Puro: lê só o que quem chama passa.
import { type PracticeScore, type PracticeSession, practiceScore } from "./practice.ts";
import { puzzleId, recordMax, recordScore, type Save } from "./records.ts";
import type { Day, Target } from "./types.ts";

export type DailyStatus =
  /** O dia não está na agenda (P44): o cartão avisa, e o Treino continua. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "new"; readonly number: number }
  /** Há andamento salvo: o 1º evento aceito (um palpite, ouvir mais, pular) já foi gravado. */
  | { readonly kind: "playing"; readonly number: number }
  /** `max` 0: todas as rodadas anuladas (P27), e a tela não mostra "0 de 0". */
  | {
      readonly kind: "done";
      readonly number: number;
      readonly score: number;
      readonly max: number;
    };

export function dailyStatus(
  save: Save,
  day: Day | null,
  date: string,
  target: Target,
): DailyStatus {
  // O mesmo teste que o App faz antes de abrir o diário: o cartão e a tela nunca discordam.
  if (!day) return { kind: "unavailable" };
  const id = puzzleId(date, target);
  const finished = save.history[id];
  if (finished) {
    return {
      kind: "done",
      number: day.number,
      score: recordScore(finished),
      max: recordMax(finished),
    };
  }
  // Andamento vazio (a repetição descartou todos os eventos, com catálogo novo) ainda é dia novo.
  if (save.inProgress[id]?.events.length) return { kind: "playing", number: day.number };
  return { kind: "new", number: day.number };
}

/** O cartão do Treino: o modo da sessão (P106) e o placar dela. */
export type PracticeSummary = { readonly target: Target; readonly score: PracticeScore };

/** O resumo da sessão do Treino, com a rodada em jogo se ela já terminou; null antes da 1ª. */
export function practiceSummary(session: PracticeSession | null): PracticeSummary | null {
  if (!session) return null;
  const score = practiceScore(session.score, session.game);
  return score.rounds > 0 ? { target: session.practice.target, score } : null;
}
