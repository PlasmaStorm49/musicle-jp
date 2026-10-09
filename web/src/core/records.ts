// O que fica salvo de cada jogo e como uma sessão começa. Funções puras: o armazenamento
// (src/storage) só lê e grava o objeto SaveV1; as regras de retomar e mesclar ficam aqui.
//
// Retomada por EVENTOS, não por estado: guardamos a lista de eventos aceitos e, ao recarregar,
// repetimos tudo no reducer. Como o reducer é puro e determinístico, o jogo volta exatamente
// igual, e o dado salvo é pequeno e fácil de validar.
import type { CatalogIndex } from "./catalog.ts";
import { createGame, type GameEvent, type GameState, isFinished, reduce } from "./reducer.ts";
import { MAX_POINTS, pointsAtStage } from "./rules.ts";
import type { AnswerMode, Day, Target } from "./types.ts";

/** "<data>|<alvo>", ex.: "2026-10-08|song". */
export type PuzzleId = string;

export type AttemptMark = "skip" | "wrong" | "right";

export type RoundRecord = {
  readonly status: "won" | "lost" | "void";
  readonly stage: number;
  readonly attempts: readonly AttemptMark[];
};

/** Resumo de um jogo terminado. Sem IDs de faixa: não tem como revelar a resposta. */
export type FinishedGame = {
  readonly answerMode: AnswerMode;
  readonly number: number;
  readonly rounds: readonly RoundRecord[];
};

export type InProgress = {
  readonly answerMode: AnswerMode;
  readonly events: readonly GameEvent[];
};

export type SaveV1 = {
  readonly schemaVersion: 1;
  /** Preferências (o M7 grava aqui o modo de resposta preferido). */
  readonly settings: Readonly<Record<string, never>>;
  readonly history: Readonly<Record<PuzzleId, FinishedGame>>;
  readonly inProgress: Readonly<Record<PuzzleId, InProgress>>;
};

export function emptySave(): SaveV1 {
  return { schemaVersion: 1, settings: {}, history: {}, inProgress: {} };
}

export function puzzleId(date: string, target: Target): PuzzleId {
  return `${date}|${target}`;
}

/** Converte um jogo terminado no resumo que vai para o histórico. */
export function toFinishedGame(state: GameState, number: number): FinishedGame {
  if (!isFinished(state)) throw new Error("toFinishedGame recebeu um jogo em andamento");
  return {
    answerMode: state.answerMode,
    number,
    rounds: state.rounds.map((r) => ({
      status: r.status as RoundRecord["status"],
      stage: r.stage,
      attempts: r.attempts.map((a) => (a.kind === "skip" ? "skip" : a.correct ? "right" : "wrong")),
    })),
  };
}

/** Pontos do dia: nada derivado é gravado, então sai do status e da etapa de cada rodada. */
export function recordScore(game: FinishedGame): number {
  return game.rounds.reduce((sum, r) => sum + (r.status === "won" ? pointsAtStage(r.stage) : 0), 0);
}

/** Máximo do dia: 6 por rodada não anulada (P27). */
export function recordMax(game: FinishedGame): number {
  return MAX_POINTS * game.rounds.filter((r) => r.status !== "void").length;
}

export type Session =
  | { readonly kind: "finished"; readonly game: FinishedGame }
  | { readonly kind: "playing"; readonly state: GameState; readonly events: readonly GameEvent[] };

/**
 * Como o jogo do dia começa: já terminado (P39: mostra o resultado), retomado pelos eventos
 * salvos, ou novo. O modo de resposta salvo vale sobre o pedido: ele fica travado no dia (P13).
 */
export function startSession(
  save: SaveV1,
  day: Day,
  date: string,
  target: Target,
  answerMode: AnswerMode,
  index: CatalogIndex,
): Session {
  const id = puzzleId(date, target);
  const done = save.history[id];
  if (done) return { kind: "finished", game: done };

  const saved = save.inProgress[id];
  let state = createGame(day, date, target, saved?.answerMode ?? answerMode, index);
  const events: GameEvent[] = [];
  for (const event of saved?.events ?? []) {
    const next = reduce(state, event);
    if (next !== state) {
      events.push(event);
      state = next;
    }
  }
  // Salvou o último evento mas não chegou a gravar o histórico: o jogo já está terminado.
  if (isFinished(state) && events.length > 0) {
    return { kind: "finished", game: toFinishedGame(state, day.number) };
  }
  return { kind: "playing", state, events };
}

/** Grava o andamento. Se outra aba já terminou este jogo, o histórico vence. */
export function withProgress(save: SaveV1, id: PuzzleId, progress: InProgress): SaveV1 {
  if (save.history[id]) return save;
  const current = save.inProgress[id];
  if (current && current.events.length > progress.events.length) return save; // outra aba foi mais longe
  return { ...save, inProgress: { ...save.inProgress, [id]: progress } };
}

/** Grava o jogo terminado e limpa o andamento. O primeiro término vence (duas abas). */
export function withFinished(save: SaveV1, id: PuzzleId, game: FinishedGame): SaveV1 {
  const { [id]: _done, ...inProgress } = save.inProgress;
  return {
    ...save,
    history: save.history[id] ? save.history : { ...save.history, [id]: game },
    inProgress,
  };
}

/** Andamentos de outros dias não podem mais ser retomados: limpa ao abrir o jogo. */
export function pruneProgress(save: SaveV1, keep: readonly PuzzleId[]): SaveV1 {
  const ids = Object.keys(save.inProgress);
  if (ids.every((id) => keep.includes(id))) return save;
  const inProgress = Object.fromEntries(
    Object.entries(save.inProgress).filter(([id]) => keep.includes(id)),
  );
  return { ...save, inProgress };
}
