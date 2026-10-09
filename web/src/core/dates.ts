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

function parse(day: string): [number, number, number] {
  const match = ISO_DATE.exec(day);
  if (!match) {
    throw new RangeError(`data fora do formato AAAA-MM-DD: ${JSON.stringify(day)}`);
  }
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  return [y, m, d];
}

/** Soma dias a uma data em texto, sem passar pela hora local. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = parse(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** AAAA-MM-DD que existe no calendário (recusa 2026-02-30). */
export function isValidDate(text: string): boolean {
  return ISO_DATE.test(text) && addDays(text, 0) === text;
}

const HOUR = 3_600_000;

/**
 * Primeiro instante (ms desde 1970, UTC) em que o relógio de `zone` mostra o dia `day`.
 *
 * Busca binária entre a meia-noite UTC do dia −15 h e +15 h: nenhum fuso real está fora disso.
 * Funciona mesmo quando a meia-noite não existe (04/11/2018 em São Paulo começou à 01:00) ou o
 * dia tem 25 h (16/02/2019), porque não supõe deslocamento nenhum; só exige que a data local
 * nunca volte, o que vale para São Paulo (as mudanças de horário sempre foram à 00:00).
 */
export function startOfDayInZone(day: string, zone: string = GAME_TIME_ZONE): number {
  const [y, m, d] = parse(day);
  let lo = Date.UTC(y, m - 1, d) - 15 * HOUR; // ainda mostra o dia anterior
  let hi = Date.UTC(y, m - 1, d) + 15 * HOUR; // já mostra o dia
  if (dateInZone(new Date(lo), zone) >= day || dateInZone(new Date(hi), zone) < day) {
    throw new RangeError(`não foi possível achar o início de ${day} em ${zone}`);
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dateInZone(new Date(mid), zone) >= day) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Duração em HH:MM:SS (horas podem passar de 24), arredondando o segundo para baixo. */
export function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Milissegundos até o próximo desafio (o dia seguinte a `date`), nunca negativo. */
export function msUntilNextDay(nowMs: number, date: string, zone: string = GAME_TIME_ZONE): number {
  return Math.max(0, startOfDayInZone(addDays(date, 1), zone) - nowMs);
}
