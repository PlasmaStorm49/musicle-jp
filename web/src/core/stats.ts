// Estatísticas, calculadas do histórico a cada vez (nada derivado é gravado, Apêndice F). Uma
// por diário (P249): o Normal, o Desafio e, no Anime, cada modo em cada dificuldade. Só o jogado
// no dia conta: o jogado depois, pelo Histórico, fica fora de tudo (P263).
import type { DailyKey } from "./daily.ts";
import { type FinishedGame, type PuzzleId, recordMax, recordScore } from "./records.ts";
import { MAX_POINTS, ROUNDS_PER_DAY } from "./rules.ts";

export type Stats = {
  /** Dias terminados no dia (inclusive os todo anulados; sem os jogados depois, P263). */
  readonly played: number;
  /** Média de pontos brutos, com 1 casa; null se nenhum dia valeu ponto (P41). */
  readonly average: number | null;
  /** Quantos dias terminaram com 0, 1, ..., 18 pontos (dia todo anulado fica fora, P41). */
  readonly distribution: readonly number[];
  /** Dias seguidos com o diário terminado (P38). */
  readonly currentStreak: number;
  readonly bestStreak: number;
};

/** Um jogo terminado do histórico, com a data e o diário do id. */
export type DayGame = {
  readonly date: string;
  readonly daily: string;
  readonly game: FinishedGame;
};

/**
 * Os jogos que contam até `today`: os de qualquer diário, terminados no próprio dia. O jogado
 * depois (P263) fica fora de tudo: nem na média, nem na sequência, onde o dia dele continua
 * sendo buraco. Servem às estatísticas e às medalhas (M16).
 */
export function dayGames(
  history: Readonly<Record<PuzzleId, FinishedGame>>,
  today: string,
): DayGame[] {
  return Object.entries(history)
    .map(([id, game]) => {
      const [date = "", daily = ""] = id.split("|");
      return { date, daily, game };
    })
    .filter((g) => g.date <= today && !g.game.late);
}

/**
 * A sequência atual e a melhor, sobre os dias da agenda até hoje. Só eles contam: um dia sem
 * diário (atualização que falhou) não quebra a sequência de ninguém (P40). Hoje ainda não
 * jogado não quebra a atual.
 */
export function streaks(
  played: ReadonlySet<string>,
  scheduleDates: readonly string[],
  today: string,
): { readonly current: number; readonly best: number } {
  const days = [...scheduleDates].filter((d) => d <= today).sort();

  // A atual anda para trás nos dias da agenda.
  let i = days.length - 1;
  if (i >= 0 && days[i] === today && !played.has(today)) i--;
  let current = 0;
  while (i >= 0 && played.has(days[i] ?? "")) {
    current++;
    i--;
  }

  let best = 0;
  let run = 0;
  for (const day of days) {
    run = played.has(day) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best };
}

/**
 * @param key o diário (a 2ª metade do id no save): só os jogos dele contam.
 * @param today data do jogo (não o relógio: em DEV, o ?date= também vale).
 * @param scheduleDates dias que existem na agenda do próprio diário (P40).
 */
export function computeStats(
  history: Readonly<Record<PuzzleId, FinishedGame>>,
  key: DailyKey,
  today: string,
  scheduleDates: readonly string[],
): Stats {
  const games = dayGames(history, today).filter((g) => g.daily === key);

  const distribution = new Array<number>(MAX_POINTS * ROUNDS_PER_DAY + 1).fill(0);
  const scores: number[] = [];
  for (const { game } of games) {
    if (recordMax(game) === 0) continue; // dia todo anulado: não entra na média (P41)
    const score = recordScore(game);
    scores.push(score);
    distribution[score] = (distribution[score] ?? 0) + 1;
  }
  // Multiplica antes de dividir: um arredondamento só, sem o erro de (x / n) * 10.
  const average =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) * 10) / scores.length) / 10
      : null;

  const { current, best } = streaks(new Set(games.map((g) => g.date)), scheduleDates, today);
  return {
    played: games.length,
    average,
    distribution,
    currentStreak: current,
    bestStreak: best,
  };
}
