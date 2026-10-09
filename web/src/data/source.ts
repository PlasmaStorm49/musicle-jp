// Carrega catálogo e agenda e decide qual dia jogar. Sem DOM e sem import.meta.env: recebe
// fetch, URL base e data de fora, então roda e é testado no Node (tsconfig.node.json).
import { type CatalogIndex, indexCatalog, UnsupportedCatalogError } from "../core/catalog.ts";
import { dateInZone, isValidDate } from "../core/dates.ts";
import type { Catalog, Day, Schedule } from "../core/types.ts";

export { UnsupportedCatalogError };

/** O mínimo de fetch que usamos; o fetch do navegador e o do Node servem. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Falha de rede ou resposta inválida: vale tentar de novo. */
export class DataLoadError extends Error {}

/** Pasta dos dados, relativa à base do site. No M11 passa a ser "data/". */
export const DATA_DIR = "fixtures/";

export type GameData = { readonly index: CatalogIndex; readonly schedule: Schedule };

async function getJson(fetchFn: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchFn(url, signal ? { signal } : {});
  } catch (error) {
    if (signal?.aborted) throw error; // cancelamento não é erro de rede
    throw new DataLoadError(`falha de rede ao buscar ${url}`);
  }
  if (!response.ok) throw new DataLoadError(`HTTP ${response.status} ao buscar ${url}`);
  try {
    return await response.json();
  } catch {
    throw new DataLoadError(`resposta que não é JSON em ${url}`);
  }
}

function schemaVersionOf(data: unknown): unknown {
  return typeof data === "object" && data !== null && "schemaVersion" in data
    ? data.schemaVersion
    : undefined;
}

/** Busca catálogo e agenda em paralelo. Versão de schema desconhecida: atualizar a página. */
export async function loadGameData(
  fetchFn: FetchLike,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<GameData> {
  const dir = new URL(DATA_DIR, baseUrl);
  const [catalog, schedule] = await Promise.all([
    getJson(fetchFn, new URL("catalog.json", dir).href, signal),
    getJson(fetchFn, new URL("schedule.json", dir).href, signal),
  ]);
  if (schemaVersionOf(schedule) !== 1) {
    throw new UnsupportedCatalogError(
      `agenda com schemaVersion ${String(schemaVersionOf(schedule))}`,
    );
  }
  return { index: indexCatalog(catalog as Catalog), schedule: schedule as Schedule };
}

/** URL absoluta de um asset do catálogo (relativa à base) ou já absoluta (Apple, no M11). */
export function assetUrl(baseUrl: string, url: string): string {
  return new URL(url, baseUrl).href;
}

export { isValidDate }; // mora em core/dates.ts; reexportado para quem já importava daqui

/** Data do desafio: hoje em Brasília; em desenvolvimento, ?date=AAAA-MM-DD troca o dia. */
export function gameDate(now: Date, search: string, dev: boolean): string {
  if (dev) {
    const override = new URLSearchParams(search).get("date");
    if (override && isValidDate(override)) return override;
  }
  return dateInZone(now);
}

/** Só em desenvolvimento: ?failAudio=<id da faixa> simula falha de áudio nessa faixa. */
export function failAudioTrack(search: string, dev: boolean): string | null {
  return dev ? new URLSearchParams(search).get("failAudio") : null;
}

export function pickDay(schedule: Schedule, date: string): Day | null {
  return schedule.days[date] ?? null;
}
