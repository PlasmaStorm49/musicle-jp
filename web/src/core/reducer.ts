// Máquina de estados do jogo: (estado, evento) → novo estado. Função pura: não lê relógio,
// catálogo nem tela. Evento que não faz sentido no estado atual devolve O MESMO objeto, o que
// facilita os testes e evita redesenho à toa no Preact.
import { acceptedIds, type CatalogIndex } from "./catalog.ts";
import type { Daily } from "./daily.ts";
import {
  HELP_OPTIONS,
  lastStage,
  MODE_RULES,
  type ModeRules,
  rulesOf,
  type Variant,
} from "./rules.ts";
import type { Target } from "./types.ts";

export type RoundStatus = "playing" | "won" | "lost" | "void";

export type Attempt =
  | { readonly kind: "guess"; readonly guessId: string; readonly correct: boolean }
  | { readonly kind: "skip" };

export type RoundState = {
  /** Faixa que toca e é revelada no fim. */
  readonly trackId: string;
  /** O que conta como a resposta certa: a faixa (Desafio) ou o álbum dela (Normal). */
  readonly correctOptionId: string;
  /** IDs que contam como acerto (versões da mesma música; no Normal, álbuns com a música). */
  readonly accepted: readonly string[];
  /** As 4 opções do Normal; vazio no Desafio, que é digitado. */
  readonly options: readonly string[];
  /** Etapa do trecho, na barra do modo (`stages`): nos diários, 0 = 1 s ... 5 = 16 s. */
  readonly stage: number;
  readonly attempts: readonly Attempt[];
  readonly status: RoundStatus;
  /** Por que foi anulada: "unavailable" (catálogo) ou o motivo do evento VOID. */
  readonly voidReason: string | null;
  /**
   * As opções da ajuda (P149), quando pedida: faixas, a certa entre elas. Daí em diante o
   * palpite sai delas, errar encerra a rodada (P151), acertar vale os pontos da ajuda (P152) e
   * pular só aumenta o trecho (P163).
   */
  readonly help: readonly string[] | null;
  /**
   * Quantas tentativas já tinham sido gastas quando a ajuda foi pedida (o `help` do histórico):
   * depois dela podem vir pulos (P163), então não dá para deduzir das tentativas. Null sem ajuda.
   */
  readonly helpAt: number | null;
  /**
   * A pessoa desistiu da rodada (o "Desistir"): custa os `giveUpPoints` das regras (−2 no
   * Superfan, P186). O fim que a partida força (o 3º erro do Superfan, encerrar) não conta.
   */
  readonly gaveUp: boolean;
};

export type GameState = {
  /**
   * O id do jogo: no diário, o do save ("<data>|<diário>", ex.: "2026-10-08|song"); no Treino e
   * no modo por artista, o da rodada.
   */
  readonly puzzleId: string;
  /** O modo: decide as regras (MODE_RULES) e o que se adivinha. */
  readonly target: Target;
  /** Uma variante do modo, com regras próprias (VARIANT_RULES): o Superfan (ME61). */
  readonly variant?: Variant;
  readonly rounds: readonly RoundState[];
  readonly current: number;
};

export type GameEvent =
  | { readonly type: "GUESS"; readonly guessId: string }
  | { readonly type: "LISTEN_MORE" }
  | { readonly type: "SKIP" }
  /**
   * Desistir. Com `forced`, quem encerra a rodada é a partida (o 3º erro do Superfan, encerrar), e
   * não a pessoa: não custa os pontos de desistir (P186). A tela nunca manda `forced`.
   */
  | { readonly type: "GIVE_UP"; readonly forced?: true }
  /**
   * Pede a ajuda, com as opções já sorteadas por quem pede (core/help.ts): o reducer não
   * consulta o catálogo nem sorteia, e o evento salvo refaz a mesma rodada.
   */
  | { readonly type: "HELP"; readonly options: readonly string[] }
  /** Anula a rodada `round` (ex.: falha de áudio). Ignorado se não for a rodada atual. */
  | { readonly type: "VOID"; readonly round: number; readonly reason: string }
  | { readonly type: "NEXT_ROUND" };

/**
 * Uma rodada planejada: a faixa que toca e, no Normal, os 4 álbuns. As rodadas de música dos
 * dias antigos da agenda ainda trazem opções (a agenda só cresce), mas o Desafio as ignora.
 */
export type PlannedRound = { readonly answer: string; readonly options?: readonly string[] };

/**
 * Estado inicial de rodadas planejadas, venham da agenda (3 por diário) ou do Treino (uma de
 * cada vez). Rodada cuja resposta sumiu ou deixou de ser elegível nasce anulada.
 */
export function createRounds(
  planned: readonly PlannedRound[],
  target: Target,
  index: CatalogIndex,
): RoundState[] {
  return planned.map((planned): RoundState => {
    const track = index.tracks.get(planned.answer);
    const base = {
      trackId: planned.answer,
      options: MODE_RULES[target].guessFromOptions ? [...(planned.options ?? [])] : [],
      stage: 0,
      attempts: [],
      help: null,
      helpAt: null,
      gaveUp: false,
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
}

/** Monta o jogo de um diário: as rodadas da agenda, pelas regras dele. */
export function createGame(daily: Daily, index: CatalogIndex): GameState {
  const rounds = createRounds(daily.rounds, daily.target, index);
  return { puzzleId: daily.id, target: daily.target, rounds, current: 0 };
}

function withRound(state: GameState, round: RoundState): GameState {
  const rounds = state.rounds.map((r, i) => (i === state.current ? round : r));
  return { ...state, rounds };
}

function guess(state: GameState, round: RoundState, guessId: string): GameState {
  const rules = rulesOf(state);
  if (rules.guessFromOptions && !round.options.includes(guessId)) return state;
  if (round.help && !round.help.includes(guessId)) return state;
  if (round.attempts.some((a) => a.kind === "guess" && a.guessId === guessId)) return state;
  const correct = round.accepted.includes(guessId);
  const attempts = [...round.attempts, { kind: "guess", guessId, correct } as const];
  if (correct) return withRound(state, { ...round, attempts, status: "won" });
  // Com a ajuda, errou, acabou (P151).
  if (rules.wrongGuess === "end" || round.help || attempts.length >= rules.maxAttempts) {
    return withRound(state, { ...round, attempts, status: "lost" });
  }
  return withRound(state, {
    ...round,
    attempts,
    stage: Math.min(round.stage + 1, lastStage(rules)),
  });
}

function skip(state: GameState, round: RoundState): GameState {
  const rules = rulesOf(state);
  // Com a ajuda na tela, pular continua (P163): só aumenta o trecho, porque os pontos já são os
  // da ajuda, e a última tentativa fica para a opção (o canSkip some com o botão antes dela).
  if (!rules.skip) return state;
  const attempts = [...round.attempts, { kind: "skip" } as const];
  // Pular a última tentativa é desistir (a tela nem oferece: canSkip): custa o mesmo (P186).
  if (attempts.length >= rules.maxAttempts) {
    return withRound(state, { ...round, attempts, status: "lost", gaveUp: true });
  }
  return withRound(state, {
    ...round,
    attempts,
    stage: Math.min(round.stage + 1, lastStage(rules)),
  });
}

/**
 * A ajuda: só no modo que a tem, uma vez por rodada e depois das tentativas que as regras pedem
 * (`helpFrom`: 1 no Desafio, P150; 0 no Superfan, P159). As opções vêm de quem pede; o reducer
 * só confere a forma: de 2 a HELP_OPTIONS ids distintos, nenhum já tentado, e um deles aceito (a
 * ajuda nunca esconde a resposta).
 */
function help(state: GameState, round: RoundState, options: readonly string[]): GameState {
  const rules = rulesOf(state);
  if (!rules.help || round.help || round.attempts.length < rules.helpFrom) return state;
  const tried = new Set(round.attempts.flatMap((a) => (a.kind === "guess" ? [a.guessId] : [])));
  const valid =
    options.length >= 2 &&
    options.length <= HELP_OPTIONS &&
    new Set(options).size === options.length &&
    options.every((id) => typeof id === "string" && !tried.has(id)) &&
    options.some((id) => round.accepted.includes(id));
  return valid
    ? withRound(state, { ...round, help: [...options], helpAt: round.attempts.length })
    : state;
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
      if (!rulesOf(state).listenMore || round.stage >= lastStage(rulesOf(state))) {
        return state;
      }
      return withRound(state, { ...round, stage: round.stage + 1 });
    case "GUESS":
      return guess(state, round, event.guessId);
    case "SKIP":
      return skip(state, round);
    case "HELP":
      return help(state, round, event.options);
    case "GIVE_UP":
      return withRound(state, { ...round, status: "lost", gaveUp: event.forced !== true });
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

/** Palpites errados da rodada (os erros do Superfan, P119); a anulada não tem nenhum. */
export function roundErrors(round: RoundState): number {
  if (round.status === "void") return 0;
  return round.attempts.filter((a) => a.kind === "guess" && !a.correct).length;
}

/**
 * Pontos de uma rodada, pelas regras do jogo: o acerto vale os pontos da etapa, ou os da ajuda
 * (P152, P186), cada palpite errado soma `wrongPoints` (0; −5 no Superfan, P119), e desistir soma
 * `giveUpPoints` (0; −2 no Superfan, P186). A anulada (falha de áudio) não conta, nem os erros
 * dela. Sem dizer as regras, as do Desafio, iguais às do Normal nos pontos. O total e o máximo do
 * dia ficam em records.ts (recordScore, recordMax).
 */
export function roundScore(round: RoundState, rules: ModeRules = MODE_RULES.song): number {
  if (round.status === "void") return 0;
  const errors = roundErrors(round) * rules.wrongPoints;
  if (round.status !== "won") return errors + (round.gaveUp ? rules.giveUpPoints : 0);
  const stage = Math.min(Math.max(round.stage, 0), rules.points.length - 1);
  return errors + (round.help ? rules.helpPoints : (rules.points[stage] ?? 0));
}
