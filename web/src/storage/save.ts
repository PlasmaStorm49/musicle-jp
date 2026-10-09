// Ler e gravar o progresso. Sem DOM: recebe um KeyValueStore (o localStorage do navegador, ou
// um em memória nos testes e quando o navegador não deixa salvar). Regras:
// - toda chamada ao armazenamento fica em try/catch (cookies bloqueados fazem até a LEITURA de
//   window.localStorage lançar erro);
// - dado lido é validado antes de usar; o que não passa é descartado, e o texto original vai
//   para musicle-jp:corrupt (uma vez só), para dar para investigar depois;
// - um save de versão MAIOR que a nossa (aba antiga, cache) nunca é sobrescrito;
// - cada gravação relê, mescla e grava: duas abas abertas não apagam um dia terminado.
import { isValidDate } from "../core/dates.ts";
import type { FinishedGame, InProgress, SaveV1 } from "../core/records.ts";
import { emptySave } from "../core/records.ts";
import type { GameEvent } from "../core/reducer.ts";
import { MAX_STAGE, MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { AnswerMode } from "../core/types.ts";
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
  readonly save: SaveV1;
  /** false = não grava nesta sessão (versão futura, ou cópia do corrompido falhou). */
  readonly writable: boolean;
  readonly notice: "future" | "repaired" | "unavailable" | null;
};

// ---- validação (type guards) ----

const PUZZLE_ID = /^(\d{4}-\d{2}-\d{2})\|(song|album)$/;
const STATUSES = new Set(["won", "lost", "void"]);
const MARKS = new Set(["skip", "wrong", "right"]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isPuzzleId(id: string): boolean {
  const match = PUZZLE_ID.exec(id);
  return match !== null && isValidDate(match[1] ?? "");
}

function isAnswerMode(x: unknown): x is AnswerMode {
  return typeof x === "string" && Object.hasOwn(MODE_RULES, x);
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
    case "LISTEN_MORE":
    case "SKIP":
    case "GIVE_UP":
    case "NEXT_ROUND":
      return true;
    default:
      return false;
  }
}

export function isFinishedGame(x: unknown): x is FinishedGame {
  if (!isRecord(x) || !isAnswerMode(x.answerMode) || !Number.isInteger(x.number)) return false;
  if ((x.number as number) < 1 || !Array.isArray(x.rounds) || x.rounds.length !== ROUNDS_PER_DAY) {
    return false;
  }
  const maxAttempts = MODE_RULES[x.answerMode].maxAttempts;
  return x.rounds.every(
    (r: unknown) =>
      isRecord(r) &&
      STATUSES.has(r.status as string) &&
      isNonNegativeInt(r.stage, MAX_STAGE) &&
      Array.isArray(r.attempts) &&
      r.attempts.length <= maxAttempts &&
      r.attempts.every((a: unknown) => MARKS.has(a as string)),
  );
}

export function isInProgress(x: unknown): x is InProgress {
  return (
    isRecord(x) &&
    isAnswerMode(x.answerMode) &&
    Array.isArray(x.events) &&
    x.events.every(isGameEvent)
  );
}

/**
 * Valida cada entrada; descarta só as inválidas. `dropped` diz se algo foi descartado. Um mapa
 * ausente ou que não é objeto vira vazio, sem levar junto o resto (o histórico vale mais).
 */
function sanitize(data: Record<string, unknown>): { save: SaveV1; dropped: boolean } {
  // A v1 não tem preferências: qualquer chave em settings é desconhecida (o M7 muda isto).
  let dropped =
    !isRecord(data.settings) ||
    Object.keys(data.settings).length > 0 ||
    !isRecord(data.history) ||
    !isRecord(data.inProgress);
  const history: Record<string, FinishedGame> = {};
  for (const [id, game] of Object.entries(isRecord(data.history) ? data.history : {})) {
    if (isPuzzleId(id) && isFinishedGame(game)) history[id] = game;
    else dropped = true;
  }
  const inProgress: Record<string, InProgress> = {};
  for (const [id, progress] of Object.entries(isRecord(data.inProgress) ? data.inProgress : {})) {
    if (isPuzzleId(id) && isInProgress(progress)) inProgress[id] = progress;
    else dropped = true;
  }
  return { save: { schemaVersion: 1, settings: {}, history, inProgress }, dropped };
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
  const version = isRecord(data) ? data.schemaVersion : undefined;
  if (Number.isInteger(version) && (version as number) > SAVE_SCHEMA_VERSION) {
    // Gravado por uma versão mais nova do jogo: não sabemos ler e não podemos apagar.
    return { save: emptySave(), writable: false, notice: "future" };
  }

  let result: ReturnType<typeof sanitize> | null = null;
  if (isRecord(data) && Number.isInteger(version) && (version as number) >= 1) {
    try {
      result = sanitize(migrate(data, version as number));
    } catch {
      result = null;
    }
  }
  if (result && !result.dropped) return { save: result.save, writable: true, notice: null };

  const kept = keepCorrupt(store, raw);
  return { save: result?.save ?? emptySave(), writable: kept, notice: "repaired" };
}

/**
 * Resultado de uma gravação. Fora "saved", o motivo escolhe o aviso da tela: "future" (outra
 * aba com versão mais nova gravou o save), "unavailable" (não dá para ler ou para guardar a
 * cópia do corrompido) ou "full" (a gravação lançou: cota cheia ou armazenamento revogado).
 */
export type SaveStatus = "saved" | "full" | "future" | "unavailable";

/** Relê, aplica a mudança e grava. */
export function updateSave(store: KeyValueStore, change: (save: SaveV1) => SaveV1): SaveStatus {
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
