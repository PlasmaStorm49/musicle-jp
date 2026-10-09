// Datas do jogo. O desafio vira à meia-noite de Brasília para todo mundo, então a data do dia
// sai do fuso pelo NOME IANA (America/Sao_Paulo), nunca de -03:00 fixo nem da hora local.

export const GAME_TIME_ZONE = "America/Sao_Paulo";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** Data (AAAA-MM-DD) que o relógio de `zone` mostra no instante `now`. */
export function dateInZone(now: Date, zone: string = GAME_TIME_ZONE): string {
  const parts = formatterFor(zone).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Soma dias a uma data em texto, sem passar pela hora local. */
export function addDays(day: string, n: number): string {
  const match = ISO_DATE.exec(day);
  if (!match) {
    throw new RangeError(`data fora do formato AAAA-MM-DD: ${JSON.stringify(day)}`);
  }
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
