// Estatísticas, calculadas do histórico a cada vez (nada derivado é gravado, Apêndice F).
import { type FinishedGame, type PuzzleId, recordMax, recordScore } from "./records.ts";
import { MAX_POINTS, ROUNDS_PER_DAY } from "./rules.ts";
import type { Target } from "./types.ts";

export type Stats = {
  /** Dias terminados (inclusive os todo anulados). */
  readonly played: number;
  /** Média de pontos brutos, com 1 casa; null se nenhum dia valeu ponto (P41). */
  readonly average: number | null;
  /** Quantos dias terminaram com 0, 1, ..., 18 pontos (dia todo anulado fica fora, P41). */
  readonly distribution: readonly number[];
  /** Dias seguidos com o diário terminado (P38). */
  readonly currentStreak: number;
  readonly bestStreak: number;
};

/**
 * @param today data do jogo (não o relógio: em DEV, o ?date= também vale).
 * @param scheduleDates dias que existem na agenda. Só eles contam para a sequência: um dia sem
 *   desafio (atualização que falhou) não quebra a sequência de ninguém (P40).
 */
export function computeStats(
  history: Readonly<Record<PuzzleId, FinishedGame>>,
  target: Target,
  today: string,
  scheduleDates: readonly string[],
): Stats {
  const games = Object.entries(history)
    .map(([id, game]) => ({ date: id.split("|")[0] ?? "", target: id.split("|")[1], game }))
    .filter((g) => g.target === target && g.date <= today);

  const distribution = new Array<number>(MAX_POINTS * ROUNDS_PER_DAY + 1).fill(0);
  const scores: number[] = [];
  for (const { game } of games) {
    if (recordMax(game) === 0) continue; // dia todo anulado: não entra na média (P41)
    const score = recordScore(game);
    scores.push(score);
    distribution[score] = (distribution[score] ?? 0) + 1;
  }
  const average =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

  const playedDates = new Set(games.map((g) => g.date));
  const days = [...scheduleDates].filter((d) => d <= today).sort();

  // Sequência atual: anda para trás nos dias da agenda. Hoje ainda não jogado não quebra.
  let i = days.length - 1;
  if (i >= 0 && days[i] === today && !playedDates.has(today)) i--;
  let currentStreak = 0;
  while (i >= 0 && playedDates.has(days[i] ?? "")) {
    currentStreak++;
    i--;
  }

  let bestStreak = 0;
  let run = 0;
  for (const day of days) {
    run = playedDates.has(day) ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  return { played: games.length, average, distribution, currentStreak, bestStreak };
}
