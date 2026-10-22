// Os rótulos de um dia passado (o Histórico, M15): a data curta, a por extenso e o dia da semana.
// Servem ao calendário, à tela de um dia e às telas do Anime de um dia passado.
import { dayParts, type Weekday, weekdayOf } from "../core/dates.ts";
import { t } from "../i18n/t.ts";

/** "21/10", com os dois dígitos. */
export function shortDate(date: string): string {
  const { day, month } = dayParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return t("history.date", { day: pad(day), month: pad(month) });
}

/** O mês por extenso: as chaves de 1 a 12 existem no pt-BR (o tipo confere). */
type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** "21 de outubro", para o leitor de tela. */
export function longDate(date: string): string {
  const { day, month } = dayParts(date);
  return t("history.dateLong", { day, month: t(`history.month.${month as Month}`) });
}

export function weekdayShort(weekday: Weekday): string {
  return t(`history.weekdayShort.${weekday}`);
}

export function weekdayName(weekday: Weekday): string {
  return t(`history.weekday.${weekday}`);
}

/** "Quarta-feira, 21/10": o título da tela de um dia passado. */
export function dayTitle(date: string): string {
  return t("history.dayTitle", { weekday: weekdayName(weekdayOf(date)), date: shortDate(date) });
}
