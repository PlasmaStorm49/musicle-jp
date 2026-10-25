// O Histórico (M15, ME104): os 14 dias antes de hoje, a marca de cada categoria em cada dia
// (P260) e os andamentos que a abertura do jogo guarda (P269). O jogado depois (P268) é o `isLate`,
// em records.ts, ao lado do término. Puro: lê só o save e as datas das agendas que quem chama
// passa.
import { dailyIds } from "./daily.ts";
import { addDays, dayParts, isValidDate, type Weekday, weekdayOf } from "./dates.ts";
import { animePlayed, progress } from "./home.ts";
import { MIXED_KEYS, mixedIds } from "./mixed.ts";
import { quizId } from "./quiz.ts";
import { type PuzzleId, puzzleId, type Save } from "./records.ts";
import { MODES } from "./rules.ts";

/** Quantos dias o Histórico mostra, e até quando um diário se joga depois (P262). */
export const HISTORY_DAYS = 14;

/** Os dias do Histórico, do mais antigo (hoje − 14) a ontem: hoje fica na Início. */
export function historyDates(today: string, days = HISTORY_DAYS): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i - days));
}

/**
 * A data está no Histórico: de hoje − 14 a ontem. A `date` pode vir do endereço (o PR 2): o texto
 * que não é uma data do calendário fica de fora antes da comparação, que é de texto ("2026-10-1"
 * ficaria entre "2026-10-08" e "2026-10-22").
 */
export function inHistory(date: string, today: string, days = HISTORY_DAYS): boolean {
  return isValidDate(date) && date < today && date >= addDays(today, -days);
}

/**
 * Os ids dos andamentos que a abertura do jogo guarda (P269): os de hoje e os dos dias do
 * Histórico, de todos os diários (8 por dia), das 2 Misturadas e do quiz do dia (M18; sem o
 * Histórico dele ainda, só o de hoje terá andamento). O resto não se retoma mais.
 */
export function keptProgressIds(today: string, days = HISTORY_DAYS): PuzzleId[] {
  return [today, ...historyDates(today, days)].flatMap((date) => [
    ...dailyIds(date),
    ...mixedIds(date),
    quizId(date),
  ]);
}

/**
 * A marca de uma categoria num dia (P260): `off`, sem diário dela no dia; `none`, nenhum
 * terminado; `some`, parte (só nos Hits, com 1 dos 2); `all`, a regra do ✓ da nav (os 2 dos
 * Hits, P227; ao menos 1 dos 6 do Anime, P247). O jogado depois também marca: o Histórico diz o
 * que falta jogar. O andamento sem término não marca nada.
 */
export type CategoryMark = "off" | "none" | "some" | "all";

/** Um dia do calendário do Histórico. */
export type HistoryDay = {
  readonly date: string;
  readonly weekday: Weekday;
  /** O dia do mês e o mês (de 1 a 12), para a tela. */
  readonly day: number;
  readonly month: number;
  readonly hits: CategoryMark;
  /** Null: a agenda do Anime ainda não chegou (ou falhou), e o dia mostra só os Hits. */
  readonly anime: CategoryMark | null;
  /** Null: a agenda das Misturadas ainda não chegou (ou falhou). Os 2 diários, como nos Hits. */
  readonly mixed: CategoryMark | null;
};

/**
 * Um dia do Histórico. `hitsDates` e `animeDates` são os dias das agendas (a do Anime, null se
 * não é conhecida): o dia fora de uma agenda não tem diário daquela categoria.
 */
export function historyDay(
  save: Save,
  date: string,
  hitsDates: ReadonlySet<string>,
  animeDates: ReadonlySet<string> | null,
  mixedDates: ReadonlySet<string> | null = null,
): HistoryDay {
  const hitsDone = progress(
    save,
    MODES.map((mode) => puzzleId(date, mode)),
  ).done;
  const hits: CategoryMark = !hitsDates.has(date)
    ? "off"
    : hitsDone === MODES.length
      ? "all"
      : hitsDone > 0
        ? "some"
        : "none";
  const anime: CategoryMark | null =
    animeDates === null
      ? null
      : !animeDates.has(date)
        ? "off"
        : animePlayed(save, date)
          ? "all"
          : "none";
  const mixedDone = mixedIds(date).filter((id) => save.mixed.finished[id] !== undefined).length;
  const mixed: CategoryMark | null =
    mixedDates === null
      ? null
      : !mixedDates.has(date)
        ? "off"
        : mixedDone === MIXED_KEYS.length
          ? "all"
          : mixedDone > 0
            ? "some"
            : "none";
  return { date, weekday: weekdayOf(date), ...dayParts(date), hits, anime, mixed };
}

/** Os dias do calendário do Histórico, do mais antigo a ontem. */
export function historyDays(
  save: Save,
  today: string,
  hitsDates: ReadonlySet<string>,
  animeDates: ReadonlySet<string> | null,
  days = HISTORY_DAYS,
  mixedDates: ReadonlySet<string> | null = null,
): HistoryDay[] {
  return historyDates(today, days).map((date) =>
    historyDay(save, date, hitsDates, animeDates, mixedDates),
  );
}

/** O dia tem algum diário (dos Hits ou do Anime): só ele abre a tela do dia. */
export function hasDaily(day: HistoryDay): boolean {
  return (
    day.hits !== "off" ||
    (day.anime !== null && day.anime !== "off") ||
    (day.mixed !== null && day.mixed !== "off")
  );
}
