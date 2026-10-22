// Carrega catálogo e agenda e decide qual dia jogar. Sem DOM e sem import.meta.env: recebe
// fetch, URL base e data de fora, então roda e é testado no Node (tsconfig.node.json).
import {
  type CatalogIndex,
  indexAnime,
  indexArtist,
  indexCatalog,
  SUPPORTED_ANIME_SCHEMA_VERSION,
  SUPPORTED_ARTIST_SCHEMA_VERSION,
  UnsupportedCatalogError,
} from "../core/catalog.ts";
import { dateInZone, isValidDate } from "../core/dates.ts";
import type {
  AnimeCatalog,
  AnimeDay,
  AnimeSchedule,
  ArtistCatalog,
  ArtistList,
  ArtistListEntry,
  Catalog,
  Day,
  Schedule,
} from "../core/types.ts";

export { UnsupportedCatalogError };

/** O mínimo de fetch que usamos; o fetch do navegador e o do Node servem. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; cache?: "no-cache" },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Falha de rede ou resposta inválida: vale tentar de novo. */
export class DataLoadError extends Error {}

/** Pastas dos dados, relativas à base do site: a parada real e a fictícia. */
export const REAL_DATA_DIR = "data/";
export const FIXTURE_DATA_DIR = "fixtures/";

/**
 * De onde vêm os dados. O site publicado lê a parada real. O desenvolvimento (e com ele o e2e)
 * lê as fixtures, que têm áudio sintético; ?data=real troca pela parada real.
 */
export function dataDirFor(dev: boolean, search: string): string {
  if (!dev) return REAL_DATA_DIR;
  return new URLSearchParams(search).get("data") === "real" ? REAL_DATA_DIR : FIXTURE_DATA_DIR;
}

export type GameData = { readonly index: CatalogIndex; readonly schedule: Schedule };

async function getJson(fetchFn: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    // no-cache: revalida sempre (304 quando nada mudou). Sem isso o cache do Pages (10 min)
    // poderia juntar um catálogo novo com uma agenda velha logo depois do merge semanal (ME13).
    response = await fetchFn(url, signal ? { signal, cache: "no-cache" } : { cache: "no-cache" });
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

/** O tipo da agenda (o `kind` constante da do Anime); a dos Hits não tem. */
function kindOf(data: unknown): unknown {
  return typeof data === "object" && data !== null && "kind" in data ? data.kind : undefined;
}

/** Busca catálogo e agenda em paralelo. Versão de schema desconhecida: atualizar a página. */
export async function loadGameData(
  fetchFn: FetchLike,
  baseUrl: string,
  dataDir: string,
  signal?: AbortSignal,
): Promise<GameData> {
  const dir = new URL(dataDir, baseUrl);
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

/** A lista e os arquivos do modo por artista (M13), numa subpasta dos dados. */
export const ARTISTS_DIR = "artists/";
const ARTIST_LIST_SCHEMA_VERSION = 1;
/** O nome do arquivo de um artista, como o schema da lista exige: nada de "../" nem de "/". */
const ARTIST_FILE = /^[A-Za-z0-9_-]+\.json$/;

function artistsUrl(baseUrl: string, dataDir: string, file: string): string {
  return new URL(`${ARTISTS_DIR}${file}`, new URL(dataDir, baseUrl)).href;
}

/** A lista dos artistas (só ela: cada artista carrega quando é escolhido, P144). */
export async function loadArtistList(
  fetchFn: FetchLike,
  baseUrl: string,
  dataDir: string,
  signal?: AbortSignal,
): Promise<ArtistList> {
  const list = await getJson(fetchFn, artistsUrl(baseUrl, dataDir, "index.json"), signal);
  if (schemaVersionOf(list) !== ARTIST_LIST_SCHEMA_VERSION) {
    throw new UnsupportedCatalogError(
      `lista de artistas com schemaVersion ${String(schemaVersionOf(list))}`,
    );
  }
  // A tela percorre a lista: sem ela, "Tentar de novo" na aba, e não o jogo inteiro quebrado.
  if (!Array.isArray((list as { artists?: unknown }).artists)) {
    throw new DataLoadError("lista de artistas sem a lista artists");
  }
  return list as ArtistList;
}

/** Um artista carregado: o arquivo (com os titleKeys da exclusão, P141) e o índice do jogo. */
export type ArtistData = { readonly file: ArtistCatalog; readonly index: CatalogIndex };

/** O arquivo de um artista da lista. Arquivo de outro artista: DataLoadError. */
export async function loadArtist(
  fetchFn: FetchLike,
  baseUrl: string,
  dataDir: string,
  entry: ArtistListEntry,
  signal?: AbortSignal,
): Promise<ArtistData> {
  if (!ARTIST_FILE.test(entry.file)) {
    throw new DataLoadError(`nome de arquivo de artista inesperado: ${entry.file}`);
  }
  const url = artistsUrl(baseUrl, dataDir, entry.file);
  const data = await getJson(fetchFn, url, signal);
  if (schemaVersionOf(data) !== SUPPORTED_ARTIST_SCHEMA_VERSION) {
    throw new UnsupportedCatalogError(`artista com schemaVersion ${String(schemaVersionOf(data))}`);
  }
  const file = data as ArtistCatalog;
  if (file.artistId !== entry.id) {
    throw new DataLoadError(`${url} é do artista ${file.artistId}, e não de ${entry.id}`);
  }
  return { file, index: indexArtist(file) };
}

/** O catálogo e a agenda do Anime (M14), numa subpasta dos dados, como os artistas. */
export const ANIME_DIR = "anime/";
const ANIME_SCHEDULE_SCHEMA_VERSION = 1;

/** O Anime carregado: o índice do jogo e a agenda dos 6 diários. */
export type AnimeData = { readonly index: CatalogIndex; readonly schedule: AnimeSchedule };

/**
 * O catálogo e a agenda do Anime, em paralelo. Só quando a pessoa abre a categoria: quem joga só
 * os Hits não baixa nada a mais. Versão de schema desconhecida (ou a agenda que não é a do Anime):
 * atualizar a página.
 */
export async function loadAnime(
  fetchFn: FetchLike,
  baseUrl: string,
  dataDir: string,
  signal?: AbortSignal,
): Promise<AnimeData> {
  const dir = new URL(ANIME_DIR, new URL(dataDir, baseUrl));
  const [catalog, schedule] = await Promise.all([
    getJson(fetchFn, new URL("catalog.json", dir).href, signal),
    getJson(fetchFn, new URL("schedule.json", dir).href, signal),
  ]);
  if (schemaVersionOf(catalog) !== SUPPORTED_ANIME_SCHEMA_VERSION) {
    throw new UnsupportedCatalogError(
      `Anime com schemaVersion ${String(schemaVersionOf(catalog))}`,
    );
  }
  if (schemaVersionOf(schedule) !== ANIME_SCHEDULE_SCHEMA_VERSION || kindOf(schedule) !== "anime") {
    throw new UnsupportedCatalogError(
      `agenda do Anime com schemaVersion ${String(schemaVersionOf(schedule))} e kind ${String(kindOf(schedule))}`,
    );
  }
  return { index: indexAnime(catalog as AnimeCatalog), schedule: schedule as AnimeSchedule };
}

/** URL absoluta de um asset do catálogo: relativa à base (fixtures) ou já absoluta (Apple). */
export function assetUrl(baseUrl: string, url: string): string {
  return new URL(url, baseUrl).href;
}

/** Data do diário: hoje em Brasília; em desenvolvimento, ?date=AAAA-MM-DD troca o dia. */
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

/**
 * Só em desenvolvimento (quem chama confere import.meta.env.DEV no próprio ponto, para o Vite
 * tirar o motor falso do build): ?fakeAudio=1 troca o Web Audio pelo motor falso dos testes de
 * ponta a ponta, que "toca" na hora e sem som.
 */
export function fakeAudioEnabled(search: string): boolean {
  return new URLSearchParams(search).get("fakeAudio") === "1";
}

/**
 * Valem também no site publicado (P76), para conferir a reserva onde ela importa:
 * ?htmlAudio=1 faz o Web Audio falhar de propósito (a troca para o <audio> acontece de verdade);
 * ?failLookup=1 faz o lookup da Apple falhar (vale o previewUrl guardado no catálogo).
 */
export function htmlAudioForced(search: string): boolean {
  return new URLSearchParams(search).get("htmlAudio") === "1";
}

export function lookupFailForced(search: string): boolean {
  return new URLSearchParams(search).get("failLookup") === "1";
}

export function pickDay(schedule: Schedule, date: string): Day | null {
  return schedule.days[date] ?? null;
}

/** O dia da agenda do Anime, ou null (o Anime avisa e volta à tela dele). */
export function pickAnimeDay(schedule: AnimeSchedule, date: string): AnimeDay | null {
  return schedule.days[date] ?? null;
}
