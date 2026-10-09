// Máquina de estados do jogo: (estado, evento) → novo estado. Função pura: não lê relógio,
// catálogo nem tela. Evento que não faz sentido no estado atual devolve O MESMO objeto, o que
// facilita os testes e evita redesenho à toa no Preact.
import { acceptedIds, type CatalogIndex } from "./catalog.ts";
import { MAX_POINTS, MAX_STAGE, MODE_RULES, pointsAtStage, secondsAt } from "./rules.ts";
import type { AnswerMode, Day, Target } from "./types.ts";

export type RoundStatus = "playing" | "won" | "lost" | "void";

export type Attempt =
  | { readonly kind: "guess"; readonly guessId: string; readonly correct: boolean }
  | { readonly kind: "skip" };

export type RoundState = {
  /** Faixa que toca e é revelada no fim. */
  readonly trackId: string;
  /** Opção a destacar como certa: a faixa (Música) ou o álbum dela (Álbum). */
  readonly correctOptionId: string;
  /** IDs que contam como acerto (versões da mesma música; no Álbum, álbuns com a música). */
  readonly accepted: readonly string[];
  /** As 4 opções do modo 4 opções (na digitação, só informativo). */
  readonly options: readonly string[];
  /** Etapa do trecho: 0 = 1 s ... 5 = 16 s. */
  readonly stage: number;
  readonly attempts: readonly Attempt[];
  readonly status: RoundStatus;
  /** Por que foi anulada: "unavailable" (catálogo) ou o motivo do evento VOID. */
  readonly voidReason: string | null;
};

export type GameState = {
  /** "<data>|<alvo>", ex.: "2026-10-08|song". */
  readonly puzzleId: string;
  readonly target: Target;
  readonly answerMode: AnswerMode;
  readonly rounds: readonly RoundState[];
  readonly current: number;
};

export type GameEvent =
  | { readonly type: "GUESS"; readonly guessId: string }
  | { readonly type: "LISTEN_MORE" }
  | { readonly type: "SKIP" }
  | { readonly type: "GIVE_UP" }
  /** Anula a rodada `round` (ex.: falha de áudio). Ignorado se não for a rodada atual. */
  | { readonly type: "VOID"; readonly round: number; readonly reason: string }
  | { readonly type: "NEXT_ROUND" };

/** Monta o jogo do dia. Rodada cuja resposta sumiu ou deixou de ser elegível nasce anulada. */
export function createGame(
  day: Day,
  date: string,
  target: Target,
  answerMode: AnswerMode,
  index: CatalogIndex,
): GameState {
  const rounds = day[target].map((planned): RoundState => {
    const track = index.tracks.get(planned.answer);
    const base = {
      trackId: planned.answer,
      options: [...planned.options],
      stage: 0,
      attempts: [],
    };
    if (!track?.eligible.daily) {
      return {
        ...base,
        correctOptionId: planned.answer,
        accepted: [],
        status: "void",
        voidReason: "unavailable",
      };
    }
    return {
      ...base,
      correctOptionId: target === "song" ? track.id : track.albumId,
      accepted: acceptedIds(index, track, target),
      status: "playing",
      voidReason: null,
    };
  });
  return { puzzleId: `${date}|${target}`, target, answerMode, rounds, current: 0 };
}

function withRound(state: GameState, round: RoundState): GameState {
  const rounds = state.rounds.map((r, i) => (i === state.current ? round : r));
  return { ...state, rounds };
}

function guess(state: GameState, round: RoundState, guessId: string): GameState {
  const rules = MODE_RULES[state.answerMode];
  if (state.answerMode === "choice" && !round.options.includes(guessId)) return state;
  if (round.attempts.some((a) => a.kind === "guess" && a.guessId === guessId)) return state;
  const correct = round.accepted.includes(guessId);
  const attempts = [...round.attempts, { kind: "guess", guessId, correct } as const];
  if (correct) return withRound(state, { ...round, attempts, status: "won" });
  if (rules.wrongGuess === "end" || attempts.length >= rules.maxAttempts) {
    return withRound(state, { ...round, attempts, status: "lost" });
  }
  return withRound(state, { ...round, attempts, stage: Math.min(round.stage + 1, MAX_STAGE) });
}

function skip(state: GameState, round: RoundState): GameState {
  const rules = MODE_RULES[state.answerMode];
  if (!rules.skip) return state;
  const attempts = [...round.attempts, { kind: "skip" } as const];
  if (attempts.length >= rules.maxAttempts) {
    return withRound(state, { ...round, attempts, status: "lost" });
  }
  return withRound(state, { ...round, attempts, stage: Math.min(round.stage + 1, MAX_STAGE) });
}

export function reduce(state: GameState, event: GameEvent): GameState {
  const round = state.rounds[state.current];
  if (!round) return state;

  if (event.type === "NEXT_ROUND") {
    const last = state.current >= state.rounds.length - 1;
    return round.status === "playing" || last ? state : { ...state, current: state.current + 1 };
  }
  if (round.status !== "playing") return state;

  switch (event.type) {
    case "LISTEN_MORE":
      if (!MODE_RULES[state.answerMode].listenMore || round.stage >= MAX_STAGE) return state;
      return withRound(state, { ...round, stage: round.stage + 1 });
    case "GUESS":
      return guess(state, round, event.guessId);
    case "SKIP":
      return skip(state, round);
    case "GIVE_UP":
      return withRound(state, { ...round, status: "lost" });
    case "VOID":
      // Uma falha de áudio que chega atrasada (pré-carregamento de outra rodada) não pode
      // anular a rodada em jogo.
      if (event.round !== state.current) return state;
      return withRound(state, { ...round, status: "void", voidReason: event.reason });
  }
}

// ---- seletores ----

export function currentRound(state: GameState): RoundState {
  const round = state.rounds[state.current];
  if (!round) throw new RangeError(`rodada ${state.current} não existe`);
  return round;
}

/** O jogo acabou quando nenhuma rodada está em andamento (não depende do último NEXT_ROUND). */
export function isFinished(state: GameState): boolean {
  return state.rounds.every((r) => r.status !== "playing");
}

export function unlockedSeconds(round: RoundState): number {
  return secondsAt(round.stage);
}

export function roundScore(round: RoundState): number {
  return round.status === "won" ? pointsAtStage(round.stage) : 0;
}

/** Soma das rodadas válidas; rodada anulada não entra (P27). */
export function totalScore(state: GameState): number {
  return state.rounds.reduce((sum, r) => sum + roundScore(r), 0);
}

/** 6 pontos por rodada não anulada: 18 num dia normal, 12 com uma anulada. */
export function maxScore(state: GameState): number {
  return MAX_POINTS * state.rounds.filter((r) => r.status !== "void").length;
}
