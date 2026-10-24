// Ler e gravar o progresso. Sem DOM: recebe um KeyValueStore (o localStorage do navegador, ou
// um em memória nos testes e quando o navegador não deixa salvar). Regras:
// - toda chamada ao armazenamento fica em try/catch (cookies bloqueados fazem até a LEITURA de
//   window.localStorage lançar erro);
// - dado lido é validado antes de usar; o que não passa é descartado, e o texto original vai
//   para musicle-jp:corrupt (uma vez só), para dar para investigar depois;
// - um save de versão MAIOR que a nossa (aba antiga, cache) nunca é sobrescrito;
// - cada gravação relê, mescla e grava: duas abas abertas não apagam um dia terminado.
import { isValidDate } from "../core/dates.ts";
import { isRecord } from "../core/guards.ts";
import {
  MIXED_LAST_STAGE,
  MIXED_MAX_SONGS,
  MIXED_MIN_SONGS,
  MIXED_ROUNDS,
  type MixedEvent,
  type MixedFind,
  type MixedGame,
  type MixedProgress,
} from "../core/mixed.ts";
import type { ArtistRecord, FinishedGame, InProgress, Save } from "../core/records.ts";
import { emptySave, SHELF_SIZE } from "../core/records.ts";
import type { GameEvent } from "../core/reducer.ts";
import { HELP_OPTIONS, MAX_STAGE, MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { Target } from "../core/types.ts";
import { migrate, SAVE_SCHEMA_VERSION } from "./migrations.ts";

export const SAVE_KEY = "musicle-jp:save";
export const CORRUPT_KEY = "musicle-jp:corrupt";

/** O mínimo do localStorage que usamos. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * Abre o armazenamento do navegador; se nem a leitura funcionar (bloqueado, ausente), usa a
 * memória. A sonda só LÊ: com a cota cheia gravar falha, mas o save que já existe precisa ser
 * lido, senão o dia terminado seria jogado de novo. Falha de gravação aparece no updateSave.
 */
export function openStore(getStorage: () => KeyValueStore | null | undefined): {
  store: KeyValueStore;
  persistent: boolean;
} {
  try {
    const storage = getStorage();
    if (!storage) throw new Error("sem armazenamento");
    storage.getItem(SAVE_KEY);
    return { store: storage, persistent: true };
  } catch {
    return { store: memoryStore(), persistent: false };
  }
}

export type LoadResult = {
  readonly save: Save;
  /** false = não grava nesta sessão (versão futura, ou cópia do corrompido falhou). */
  readonly writable: boolean;
  readonly notice: "future" | "repaired" | "unavailable" | null;
};

// ---- validação (type guards) ----

/**
 * "<data>|<diário>": os dois dos Hits e, desde a v6 (P250), os seis do Anime (`DAILY_KEYS`, em
 * core/daily.ts). Diário novo aqui sobe a versão: a aba com o código velho jogaria fora os jogos
 * dele.
 */
const PUZZLE_ID =
  /^(\d{4}-\d{2}-\d{2})\|(song|album|anime-(?:musica|titulo)-(?:facil|medio|dificil))$/;
const STATUSES = new Set(["won", "lost", "void"]);
const MARKS = new Set(["skip", "wrong", "right"]);

/**
 * As regras de um id válido ("2026-10-08|album" → "album"): as do modo, nos Hits; as do Desafio,
 * no Anime (3 rodadas digitadas). Null se o id não vale.
 */
function modeOf(id: string): Target | null {
  const match = PUZZLE_ID.exec(id);
  if (match === null || !isValidDate(match[1] ?? "")) return null;
  return match[2] === "album" ? "album" : "song";
}

function isNonNegativeInt(x: unknown, max = Number.MAX_SAFE_INTEGER): x is number {
  return Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;
}

export function isGameEvent(x: unknown): x is GameEvent {
  if (!isRecord(x)) return false;
  switch (x.type) {
    case "GUESS":
      return typeof x.guessId === "string" && x.guessId.length > 0;
    case "VOID":
      return isNonNegativeInt(x.round) && typeof x.reason === "string";
    case "HELP":
      return (
        Array.isArray(x.options) &&
        x.options.length >= 2 &&
        x.options.length <= HELP_OPTIONS &&
        x.options.every((id: unknown) => typeof id === "string" && id.length > 0)
      );
    // O `forced` (o fim que o Superfan força, P186) nunca vem da tela nem é salvo.
    case "GIVE_UP":
      return x.forced === undefined;
    case "LISTEN_MORE":
    case "SKIP":
    case "NEXT_ROUND":
      return true;
    default:
      return false;
  }
}

/**
 * O que vem depois da ajuda: pulos, que só aumentam o trecho (P163), e no fim no máximo a opção
 * escolhida. Acertou: a opção é a certa. Perdeu: errou a opção ou desistiu sem escolher.
 * Anulada (falha de áudio): nenhuma opção escolhida.
 */
function isHelpTail(after: readonly unknown[], status: unknown): boolean {
  const pick = after.findIndex((a) => a !== "skip");
  if (pick !== -1 && pick !== after.length - 1) return false;
  const last = pick === -1 ? null : after[pick];
  if (status === "won") return last === "right";
  if (status === "void") return last === null;
  return last !== "right";
}

/**
 * Um jogo terminado do modo `target`, pelas regras dele: no Normal, no máximo 1 tentativa e
 * nunca um pulo (só o Desafio pula). A ajuda, só no modo que a tem, depois de ao menos uma
 * tentativa; depois dela, pulos e no máximo a opção, no fim (`isHelpTail`). A marca do jogado
 * depois (v7, P267) só vale com `true`.
 */
export function isFinishedGame(x: unknown, target: Target): x is FinishedGame {
  if (!isRecord(x) || !Number.isInteger(x.number)) return false;
  if (x.late !== undefined && x.late !== true) return false;
  if ((x.number as number) < 1 || !Array.isArray(x.rounds) || x.rounds.length !== ROUNDS_PER_DAY) {
    return false;
  }
  const rules = MODE_RULES[target];
  return x.rounds.every(
    (r: unknown) =>
      isRecord(r) &&
      STATUSES.has(r.status as string) &&
      isNonNegativeInt(r.stage, MAX_STAGE) &&
      Array.isArray(r.attempts) &&
      r.attempts.length <= rules.maxAttempts &&
      r.attempts.every((a: unknown) => MARKS.has(a as string) && (rules.skip || a !== "skip")) &&
      (r.help === undefined ||
        (rules.help &&
          isNonNegativeInt(r.help) &&
          r.help >= 1 &&
          r.help <= r.attempts.length &&
          isHelpTail(r.attempts.slice(r.help), r.status))),
  );
}

export function isInProgress(x: unknown): x is InProgress {
  return isRecord(x) && Array.isArray(x.events) && x.events.every(isGameEvent);
}

/**
 * "<data>|misturadas-<modo>" (v10, M17): os 2 diários das Misturadas, no campo delas. Diário novo
 * aqui sobe a versão, como no `PUZZLE_ID`.
 */
const MIXED_ID = /^(\d{4}-\d{2}-\d{2})\|misturadas-(?:musica|titulo)$/;

export function isMixedId(id: string): boolean {
  const match = MIXED_ID.exec(id);
  return match !== null && isValidDate(match[1] ?? "");
}

export function isMixedEvent(x: unknown): x is MixedEvent {
  if (!isRecord(x)) return false;
  switch (x.type) {
    case "GUESS":
      return typeof x.guessId === "string" && x.guessId.length > 0;
    case "VOID":
      return isNonNegativeInt(x.round) && typeof x.reason === "string";
    case "SKIP":
    case "SEPARATE":
    case "GIVE_UP":
    case "NEXT_ROUND":
      return true;
    default:
      return false;
  }
}

function isMixedFind(x: unknown): x is MixedFind | null {
  return (
    x === null ||
    (isRecord(x) &&
      isNonNegativeInt(x.stage, MIXED_LAST_STAGE) &&
      (x.help === undefined || x.help === true))
  );
}

/**
 * Um diário das Misturadas terminado: as 4 rodadas, cada uma com um achado (ou null) por música.
 * A anulada não acha nenhuma.
 */
export function isMixedGame(x: unknown): x is MixedGame {
  if (!isRecord(x) || !Number.isInteger(x.number) || (x.number as number) < 1) return false;
  if (x.late !== undefined && x.late !== true) return false;
  if (!Array.isArray(x.rounds) || x.rounds.length !== MIXED_ROUNDS) return false;
  return x.rounds.every(
    (r: unknown) =>
      isRecord(r) &&
      (r.status === "done" || r.status === "void") &&
      Array.isArray(r.found) &&
      r.found.length >= MIXED_MIN_SONGS &&
      r.found.length <= MIXED_MAX_SONGS &&
      r.found.every(isMixedFind) &&
      (r.status === "done" || r.found.every((f: unknown) => f === null)),
  );
}

function isMixedProgress(x: unknown): x is MixedProgress {
  return isRecord(x) && Array.isArray(x.events) && x.events.every(isMixedEvent);
}

/**
 * O id de uma medalha (v8): letras, números e `|`, `:`, `-`, `_` (ex.: "superfan|apple:ar:1|completo").
 * O id vai para o save e nunca muda; o desconhecido fica (pode ser de uma lista mais nova).
 */
const MEDAL_ID = /^[a-z0-9][A-Za-z0-9|:_-]{0,119}$/;
/**
 * O id de um artista, como o `artistId` do schema da lista ("apple:ar:1490256993"), com limite:
 * o maior (16 + 4 + 64) ainda dá um id de medalha (`superfan|<artista>|perfeito`) que cabe no
 * `MEDAL_ID`. Sem isso, o save gravaria uma medalha que a leitura seguinte descartaria.
 */
export const ARTIST_ID = /^[a-z]{1,16}:ar:[A-Za-z0-9_-]{1,64}$/;

/**
 * Uma lista de ids de medalha, sem repetidas. O que não é id é descartado, e a lista ausente (a
 * migração sempre a cria) é reparo, como o `artists` ausente.
 */
function medalIds(x: unknown, max = Number.MAX_SAFE_INTEGER): { ids: string[]; dropped: boolean } {
  if (!Array.isArray(x)) return { ids: [], dropped: true };
  const ids = [
    ...new Set(x.filter((id): id is string => typeof id === "string" && MEDAL_ID.test(id))),
  ];
  return { ids: ids.slice(0, max), dropped: ids.length !== x.length || ids.length > max };
}

export function isArtistRecord(x: unknown): x is ArtistRecord {
  return (
    isRecord(x) &&
    isNonNegativeInt(x.right) &&
    (x.done === undefined || x.done === true) &&
    // A perfeita é também terminada (`withSuperfanEnd`).
    (x.perfect === undefined || (x.perfect === true && x.done === true))
  );
}

/**
 * Valida cada entrada; descarta só as inválidas. `dropped` diz se algo foi descartado. Um mapa
 * ausente ou que não é objeto vira vazio, sem levar junto o resto (o histórico vale mais).
 */
function sanitize(data: Record<string, unknown>): { save: Save; dropped: boolean } {
  let dropped = !isRecord(data.history) || !isRecord(data.inProgress);
  const history: Record<string, FinishedGame> = {};
  for (const [id, game] of Object.entries(isRecord(data.history) ? data.history : {})) {
    const mode = modeOf(id);
    if (mode && isFinishedGame(game, mode)) history[id] = game;
    else dropped = true;
  }
  const inProgress: Record<string, InProgress> = {};
  for (const [id, progress] of Object.entries(isRecord(data.inProgress) ? data.inProgress : {})) {
    if (modeOf(id) && isInProgress(progress)) inProgress[id] = progress;
    else dropped = true;
  }
  const seen = medalIds(data.seenMedals);
  const shelf = medalIds(data.shelf, SHELF_SIZE);
  const artists: Record<string, ArtistRecord> = {};
  for (const [id, record] of Object.entries(isRecord(data.artists) ? data.artists : {})) {
    if (ARTIST_ID.test(id) && isArtistRecord(record)) artists[id] = record;
    else dropped = true;
  }
  // O total do Treino (v9): fora do formato, zera e vira reparo, como o `artists` ausente.
  const practiceRight = isNonNegativeInt(data.practiceRight) ? data.practiceRight : 0;
  // As Misturadas (v10): cada mapa ausente vira vazio, e o que não vale sai, como nos diários.
  const mixed = isRecord(data.mixed) ? data.mixed : {};
  const finished: Record<string, MixedGame> = {};
  for (const [id, game] of Object.entries(isRecord(mixed.finished) ? mixed.finished : {})) {
    if (isMixedId(id) && isMixedGame(game)) finished[id] = game;
    else dropped = true;
  }
  const progress: Record<string, MixedProgress> = {};
  for (const [id, saved] of Object.entries(isRecord(mixed.progress) ? mixed.progress : {})) {
    if (isMixedId(id) && isMixedProgress(saved)) progress[id] = saved;
    else dropped = true;
  }
  dropped ||=
    seen.dropped ||
    shelf.dropped ||
    !isRecord(data.artists) ||
    practiceRight !== data.practiceRight ||
    !isRecord(mixed.finished) ||
    !isRecord(mixed.progress);
  return {
    save: {
      schemaVersion: 11,
      history,
      inProgress,
      seenMedals: seen.ids.sort(),
      shelf: shelf.ids,
      artists,
      practiceRight,
      mixed: { finished, progress },
    },
    dropped,
  };
}

// ---- leitura e gravação ----

/** Guarda o texto original uma vez só; se nem isso der, não grava nada nesta sessão. */
function keepCorrupt(store: KeyValueStore, raw: string): boolean {
  try {
    if (store.getItem(CORRUPT_KEY) === null) store.setItem(CORRUPT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Um save já lido do JSON, pelas migrações e pelas conferências (o `sanitize`): "ok", com o que
 * foi descartado (`dropped`); "future", gravado por uma versão mais nova, que não sabemos ler; ou
 * "invalid", sem versão ou fora do formato. A leitura do navegador e a importação (ME103) passam
 * por aqui.
 */
export type ReadResult =
  | { readonly kind: "ok"; readonly save: Save; readonly dropped: boolean }
  | { readonly kind: "future" }
  | { readonly kind: "invalid" };

export function readSave(data: unknown): ReadResult {
  const version = isRecord(data) ? data.schemaVersion : undefined;
  if (Number.isInteger(version) && (version as number) > SAVE_SCHEMA_VERSION) {
    return { kind: "future" };
  }
  if (!isRecord(data) || !Number.isInteger(version) || (version as number) < 1) {
    return { kind: "invalid" };
  }
  try {
    return { kind: "ok", ...sanitize(migrate(data, version as number)) };
  } catch {
    return { kind: "invalid" };
  }
}

export function loadSave(store: KeyValueStore): LoadResult {
  let raw: string | null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return { save: emptySave(), writable: false, notice: "unavailable" };
  }
  if (raw === null) return { save: emptySave(), writable: true, notice: null };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  const result = readSave(data);
  // Gravado por uma versão mais nova do jogo: não sabemos ler e não podemos apagar.
  if (result.kind === "future") return { save: emptySave(), writable: false, notice: "future" };
  if (result.kind === "ok" && !result.dropped) {
    return { save: result.save, writable: true, notice: null };
  }

  const kept = keepCorrupt(store, raw);
  const save = result.kind === "ok" ? result.save : emptySave();
  return { save, writable: kept, notice: "repaired" };
}

/**
 * O armazenamento desta sessão de jogo. Cada aba de diário remonta lendo o save, então a sessão
 * precisa reler o próprio andamento mesmo quando o navegador não grava:
 * - não gravável (versão futura, sem acesso): tudo em memória, a partir do que foi lido, sem
 *   tocar no navegador;
 * - gravável: grava no navegador; só o que NÃO conseguiu gravar (cota cheia) fica em memória,
 *   e a sessão lê dali. O que foi gravado não fica em memória: senão esta aba deixaria de ver o
 *   que outra aba gravou depois, e a mescla das duas abas (updateSave) apagaria o dia dela.
 */
export function sessionStore(store: KeyValueStore, loaded: LoadResult): KeyValueStore {
  if (!loaded.writable) return memoryStore({ [SAVE_KEY]: JSON.stringify(loaded.save) });
  const unsaved = memoryStore();
  return {
    getItem: (key) => unsaved.getItem(key) ?? store.getItem(key),
    setItem: (key, value) => {
      try {
        store.setItem(key, value);
        unsaved.removeItem(key);
      } catch (error) {
        unsaved.setItem(key, value);
        throw error; // o updateSave transforma em "full" e a tela avisa
      }
    },
    removeItem: (key) => {
      unsaved.removeItem(key);
      store.removeItem(key);
    },
  };
}

/**
 * Resultado de uma gravação. Fora "saved", o motivo escolhe o aviso da tela: "future" (outra
 * aba com versão mais nova gravou o save), "unavailable" (não dá para ler ou para guardar a
 * cópia do corrompido) ou "full" (a gravação lançou: cota cheia ou armazenamento revogado).
 */
export type SaveStatus = "saved" | "full" | "future" | "unavailable";

/** Relê, aplica a mudança e grava. */
export function updateSave(store: KeyValueStore, change: (save: Save) => Save): SaveStatus {
  const current = loadSave(store);
  if (!current.writable) return current.notice === "future" ? "future" : "unavailable";
  const next = change(current.save);
  if (next === current.save && current.notice === null) return "saved"; // nada mudou
  try {
    store.setItem(SAVE_KEY, JSON.stringify(next));
    return "saved";
  } catch {
    return "full";
  }
}
