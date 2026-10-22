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

/**
 * @param key o diário (a 2ª metade do id no save): só os jogos dele contam.
 * @param today data do jogo (não o relógio: em DEV, o ?date= também vale).
 * @param scheduleDates dias que existem na agenda do próprio diário. Só eles contam para a
 *   sequência: um dia sem diário (atualização que falhou) não quebra a sequência de ninguém (P40).
 */
export function computeStats(
  history: Readonly<Record<PuzzleId, FinishedGame>>,
  key: DailyKey,
  today: string,
  scheduleDates: readonly string[],
): Stats {
  const games = Object.entries(history)
    .map(([id, game]) => {
      const [date = "", daily] = id.split("|");
      return { date, daily, game };
    })
    // O jogado depois (P263) não entra em nada: nem na média, nem na sequência, onde o dia dele
    // continua sendo buraco.
    .filter((g) => g.daily === key && g.date <= today && !g.game.late);

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
