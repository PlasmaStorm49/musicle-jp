// O que fica salvo de cada jogo e como uma sessão começa. Funções puras: o armazenamento
// (src/storage) só lê e grava o objeto Save; as regras de retomar e mesclar ficam aqui.
//
// Retomada por EVENTOS, não por estado: guardamos a lista de eventos aceitos e, ao recarregar,
// repetimos tudo no reducer. Como o reducer é puro e determinístico, o jogo volta exatamente
// igual, e o dado salvo é pequeno e fácil de validar.
import type { CatalogIndex } from "./catalog.ts";
import type { Daily, DailyKey } from "./daily.ts";
import { createGame, type GameEvent, type GameState, isFinished, reduce } from "./reducer.ts";
import { HELP_POINTS, MAX_POINTS, pointsAtStage } from "./rules.ts";

/** "<data>|<diário>", ex.: "2026-10-08|album" (o Normal) ou "2026-10-08|song" (o Desafio). */
export type PuzzleId = string;

export type AttemptMark = "skip" | "wrong" | "right";

export type RoundRecord = {
  readonly status: "won" | "lost" | "void";
  readonly stage: number;
  readonly attempts: readonly AttemptMark[];
  /**
   * Com a ajuda (P149, v4 do save): quantas tentativas já tinham sido gastas quando ela foi
   * pedida. Depois dela vêm só pulos, que aumentam o trecho (P163, v5), e no fim no máximo a
   * opção escolhida. Sem ajuda, o campo não existe.
   */
  readonly help?: number;
};

/**
 * Resumo de um jogo terminado. Sem IDs de faixa: não tem como revelar a resposta. O diário (e,
 * por ele, as regras) vem do id (`PuzzleId`), não daqui.
 */
export type FinishedGame = {
  readonly number: number;
  readonly rounds: readonly RoundRecord[];
};

/** O andamento: só os eventos aceitos (a retomada repete todos no reducer). */
export type InProgress = {
  readonly events: readonly GameEvent[];
};

/**
 * O formato salvo. v3 (P100): os dois modos fixos começam do zero, e sai a preferência do modo
 * de resposta, que não existe mais. v4 (P149): a ajuda, no evento HELP e no `help` da rodada.
 * v5 (P163): o pulo depois da ajuda (storage/migrations.ts).
 */
export type Save = {
  readonly schemaVersion: 5;
  readonly history: Readonly<Record<PuzzleId, FinishedGame>>;
  readonly inProgress: Readonly<Record<PuzzleId, InProgress>>;
};

export function emptySave(): Save {
  return { schemaVersion: 5, history: {}, inProgress: {} };
}

export function puzzleId(date: string, key: DailyKey): PuzzleId {
  return `${date}|${key}`;
}

/**
 * As faixas dos diários dados que ainda não têm resultado: o lote de prévias que a carga
 * resolve. Um diário terminado só mostra o resumo, e consultar a Apple por ele gastaria a cota.
 */
export function pendingDayTracks(save: Save, dailies: readonly Daily[]): string[] {
  return dailies
    .filter((daily) => !save.history[daily.id])
    .flatMap((daily) => daily.rounds.map((round) => round.answer));
}

/** Converte um jogo terminado no resumo que vai para o histórico. */
export function toFinishedGame(state: GameState, number: number): FinishedGame {
  if (!isFinished(state)) throw new Error("toFinishedGame recebeu um jogo em andamento");
  return {
    number,
    rounds: state.rounds.map((r) => ({
      status: r.status as RoundRecord["status"],
      stage: r.stage,
      attempts: r.attempts.map((a) => (a.kind === "skip" ? "skip" : a.correct ? "right" : "wrong")),
      // O ponto em que a ajuda foi pedida, guardado pelo reducer: os pulos depois dela (P163)
      // não deixam deduzir das tentativas.
      ...(r.help && r.helpAt !== null ? { help: r.helpAt } : {}),
    })),
  };
}

/** O bastante para pontuar uma rodada: status, etapa e a ajuda (do FinishedGame ou do jogo). */
type ScorableRound = { readonly status: string; readonly stage: number; readonly help?: unknown };
type Scorable = { readonly rounds: readonly ScorableRound[] };

/** Pontos de uma rodada: 6 menos a etapa, ou HELP_POINTS com a ajuda (P152); errou, 0. */
export function roundRecordScore(round: ScorableRound): number {
  if (round.status !== "won") return 0;
  return round.help !== undefined && round.help !== null ? HELP_POINTS : pointsAtStage(round.stage);
}

/** Pontos do dia: nada derivado é gravado, então sai do status, da etapa e da ajuda. */
export function recordScore(game: Scorable): number {
  return game.rounds.reduce((sum, r) => sum + roundRecordScore(r), 0);
}

/** Máximo do dia: 6 por rodada não anulada (P27). */
export function recordMax(game: Scorable): number {
  return MAX_POINTS * game.rounds.filter((r) => r.status !== "void").length;
}

export type Session =
  | { readonly kind: "finished"; readonly game: FinishedGame }
  | {
      readonly kind: "playing";
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      /** A repetição descartou eventos salvos (ex.: catálogo novo): a lista salva precisa ser trocada. */
      readonly stale: boolean;
    };

/**
 * Como o diário começa: já terminado (P39: mostra o resultado), retomado pelos eventos salvos,
 * ou novo.
 */
export function startSession(save: Save, daily: Daily, index: CatalogIndex): Session {
  const done = save.history[daily.id];
  if (done) return { kind: "finished", game: done };

  const saved = save.inProgress[daily.id];
  let state = createGame(daily, index);
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
    return { kind: "finished", game: toFinishedGame(state, daily.number) };
  }
  return { kind: "playing", state, events, stale: events.length < (saved?.events.length ?? 0) };
}

/** Troca o andamento salvo pela lista dada, mesmo mais curta. Dia terminado não muda. */
export function replaceProgress(save: Save, id: PuzzleId, progress: InProgress): Save {
  if (save.history[id]) return save;
  return { ...save, inProgress: { ...save.inProgress, [id]: progress } };
}

/** Grava o andamento. Se outra aba foi mais longe ou já terminou este jogo, ela vence. */
export function withProgress(save: Save, id: PuzzleId, progress: InProgress): Save {
  const current = save.inProgress[id];
  if (current && current.events.length > progress.events.length) return save;
  return replaceProgress(save, id, progress);
}

/** Grava o jogo terminado e limpa o andamento. O primeiro término vence (duas abas). */
export function withFinished(save: Save, id: PuzzleId, game: FinishedGame): Save {
  if (save.history[id] && !save.inProgress[id]) return save; // já gravado: nada a fazer
  const { [id]: _done, ...inProgress } = save.inProgress;
  return {
    ...save,
    history: save.history[id] ? save.history : { ...save.history, [id]: game },
    inProgress,
  };
}

/** Andamentos de outros dias não podem mais ser retomados: limpa ao abrir o jogo. */
export function pruneProgress(save: Save, keep: readonly PuzzleId[]): Save {
  const ids = Object.keys(save.inProgress);
  if (ids.every((id) => keep.includes(id))) return save;
  const inProgress = Object.fromEntries(
    Object.entries(save.inProgress).filter(([id]) => keep.includes(id)),
  );
  return { ...save, inProgress };
}
