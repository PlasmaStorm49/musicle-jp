// O quiz do dia (M18, Apêndice Q do PLANO): uma run por dia, de uma tentativa só. Cada rodada toca
// duas prévias (a A e depois a B), e a pessoa escolhe a que responde à pergunta do dia; o 3º erro
// encerra (P377). O diário, o estado da run, o reducer, o que vai para o save e o compartilhar.
// Puro, como o das Misturadas (regra 5): o evento inválido devolve o mesmo objeto, e nada é
// sorteado aqui (a agenda já traz os pares e a resposta).
import type { CatalogIndex } from "./catalog.ts";
import { isLate, type PuzzleId, puzzleId, type Save } from "./records.ts";
import { SYMBOLS } from "./share.ts";
import type { QuizBonus, QuizDay, QuizInfo, TrackId } from "./types.ts";

/** O quiz do dia sem a data: "quiz". É também a rota dele. */
export type QuizKey = "quiz";
export const QUIZ_KEY: QuizKey = "quiz";

/** O id no save do quiz de um dia: "<data>|quiz". */
export function quizId(date: string): PuzzleId {
  return puzzleId(date, QUIZ_KEY);
}

/** Os trechos de cada música (o usuário, 25/10/2026): o "Ouvir mais" abre o seguinte, de graça. */
export const QUIZ_STAGES: readonly number[] = [3, 7, 12, 18];
export const QUIZ_LAST_STAGE = QUIZ_STAGES.length - 1;
/** As vidas (P377): os erros que a run aguenta; o seguinte a encerra. */
export const QUIZ_LIVES = 2;

export type QuizFamily = QuizDay["family"];
export type QuizDirection = QuizDay["direction"];
export type QuizSide = "a" | "b";

/** Uma rodada da agenda: as duas faixas, a resposta e o dado da revelação. */
export type QuizPair = {
  readonly a: TrackId;
  readonly b: TrackId;
  readonly answer: QuizSide;
  readonly info: QuizInfo | null;
};

/** O quiz do dia: a agenda diz a pergunta e os pares, e o descritor junta o id e a data. */
export type QuizDaily = {
  /** O id do jogo no save: "<data>|quiz". */
  readonly id: PuzzleId;
  /** A data do jogo (não o relógio). */
  readonly date: string;
  /** O número do dia na agenda do quiz: o "nº" do cabeçalho e do compartilhar. */
  readonly number: number;
  readonly family: QuizFamily;
  readonly direction: QuizDirection;
  /** O rótulo, a fonte, o estúdio ou o ano da pergunta; null nas que não têm. */
  readonly param: string | number | null;
  /** As perguntas do MAL levam o crédito dele na revelação (P382). */
  readonly mal: boolean;
  readonly rounds: readonly QuizPair[];
};

export function quizDaily(day: QuizDay, date: string): QuizDaily {
  return {
    id: quizId(date),
    date,
    number: day.number,
    family: day.family,
    direction: day.direction,
    param: day.param ?? null,
    mal: day.mal,
    rounds: day.rounds.map((round) => ({
      a: round.a,
      b: round.b,
      answer: round.answer,
      info: round.info ?? null,
    })),
  };
}

/**
 * O bônus de estreia (o usuário, 25/10/2026): cada uma das 3 rodadas vira um diário de uma rodada
 * só, com a pergunta dela, que a tela joga com o mesmo reducer. Não vai ao save e não conta no
 * resultado do dia.
 */
export function bonusDailies(bonus: QuizBonus): QuizDaily[] {
  return bonus.rounds.map((round, i) => ({
    id: `${bonus.date}|quiz-bonus-${i + 1}`,
    date: bonus.date,
    number: i + 1,
    family: round.family,
    direction: round.direction,
    param: round.param ?? null,
    mal: bonus.mal,
    rounds: [
      {
        a: round.a,
        b: round.b,
        answer: round.answer,
        // O mesmo dado do quiz (o schema do bônus copia o `info` do dele).
        info: (round.info as QuizInfo | undefined) ?? null,
      },
    ],
  }));
}

/** As famílias com os dados do MAL: a revelação leva o crédito (P382). */
const MAL_FAMILIES: ReadonlySet<QuizFamily> = new Set([
  "nota",
  "membros",
  "rotulo",
  "fonte",
  "estudio",
]);

export function isMalFamily(family: QuizFamily): boolean {
  return MAL_FAMILIES.has(family);
}

// ---- o estado da run ----

/** "right" e "wrong": a escolha; "void": sem áudio, ou com uma faixa que saiu do catálogo. */
export type QuizRoundStatus = "playing" | "right" | "wrong" | "void";

export type QuizRoundState = QuizPair & {
  readonly status: QuizRoundStatus;
  /** O lado escolhido; null enquanto a rodada está em jogo e na anulada. */
  readonly chosen: QuizSide | null;
  /** O trecho em que a escolha foi feita (o índice em `QUIZ_STAGES`); null sem escolha. */
  readonly stage: number | null;
};

/**
 * Os pontos do acerto, pelo trecho em que a pessoa escolheu: 4 com 3 s, 3 com 7 s, 2 com 12 s e 1
 * com 18 s; o erro vale 0 (o usuário, 28/10/2026). Antes, o "Ouvir mais" não custava nada.
 */
export const QUIZ_POINTS: readonly number[] = [4, 3, 2, 1];

export type QuizState = {
  /** O id no save ("<data>|quiz"). */
  readonly id: PuzzleId;
  readonly rounds: readonly QuizRoundState[];
  readonly current: number;
  readonly errors: number;
};

export type QuizEvent =
  /**
   * A escolha, com o trecho em que ela foi feita (os pontos). O andamento salvo antes dos pontos
   * não tem o `stage`: a escolha dele vale como no último trecho (1 ponto no acerto).
   */
  | {
      readonly type: "CHOOSE";
      readonly round: number;
      readonly side: QuizSide;
      readonly stage?: number;
    }
  /** Anula a rodada `round` (falha de áudio). Ignorado se não for a rodada atual. */
  | { readonly type: "VOID"; readonly round: number }
  | { readonly type: "NEXT" };

/** A faixa toca no diário: está no catálogo e é elegível. */
function playable(index: CatalogIndex, trackId: TrackId): boolean {
  return index.tracks.get(trackId)?.eligible.daily === true;
}

/**
 * Monta a run: as rodadas da agenda. Uma rodada com uma faixa que saiu do catálogo ou deixou de
 * ser elegível nasce anulada, como nas Misturadas: ela não tira vida e não conta acerto.
 */
export function createQuizGame(daily: QuizDaily, index: CatalogIndex): QuizState {
  const rounds = daily.rounds.map(
    (pair): QuizRoundState => ({
      ...pair,
      status: playable(index, pair.a) && playable(index, pair.b) ? "playing" : "void",
      chosen: null,
      stage: null,
    }),
  );
  return { id: daily.id, rounds, current: 0, errors: 0 };
}

function withRound(state: QuizState, round: QuizRoundState): QuizState {
  return { ...state, rounds: state.rounds.map((r, i) => (i === state.current ? round : r)) };
}

/** A run acabou: o 3º erro (P377) ou a última rodada já respondida (ou anulada). */
export function isQuizFinished(state: QuizState): boolean {
  if (state.errors > QUIZ_LIVES) return true;
  const last = state.rounds[state.rounds.length - 1];
  return (
    state.current >= state.rounds.length - 1 && last !== undefined && last.status !== "playing"
  );
}

export function quizReducer(state: QuizState, event: QuizEvent): QuizState {
  const round = state.rounds[state.current];
  if (!round) return state;
  if (event.type === "NEXT") {
    if (round.status === "playing" || isQuizFinished(state)) return state;
    return { ...state, current: state.current + 1 };
  }
  // Uma escolha ou uma falha atrasada (o pré-carregamento de outra rodada) não mexe na em jogo.
  if (event.round !== state.current || round.status !== "playing") return state;
  if (event.type === "VOID") return withRound(state, { ...round, status: "void" });
  const stage = event.stage ?? QUIZ_LAST_STAGE;
  if (!Number.isInteger(stage) || stage < 0 || stage > QUIZ_LAST_STAGE) return state;
  const right = event.side === round.answer;
  const next = withRound(state, {
    ...round,
    status: right ? "right" : "wrong",
    chosen: event.side,
    stage,
  });
  return right ? next : { ...next, errors: next.errors + 1 };
}

/** Os pontos de uma rodada: os do trecho no acerto, 0 no erro e na anulada (P2 da conversa, a). */
export function quizRoundPoints(round: QuizRoundState): number {
  if (round.status !== "right") return 0;
  return QUIZ_POINTS[round.stage ?? QUIZ_LAST_STAGE] ?? 0;
}

/** Os pontos da run até aqui. */
export function quizStatePoints(state: QuizState): number {
  return state.rounds.reduce((sum, round) => sum + quizRoundPoints(round), 0);
}

/** A rodada em jogo. */
export function currentQuizRound(state: QuizState): QuizRoundState {
  const round = state.rounds[state.current];
  if (!round) throw new RangeError(`rodada ${state.current} não existe`);
  return round;
}

/** As vidas que sobram: 2, 1 ou 0 (com 0, o próximo erro encerra). */
export function livesLeft(errors: number): number {
  return Math.max(QUIZ_LIVES - errors, 0);
}

/**
 * As vidas na tela, contando a de agora (o usuário, 28/10/2026): 3, 2, 1 (a última) e 0 no fim da
 * run. A regra (P377) não muda: o 3º erro encerra.
 */
export function livesShown(errors: number): number {
  return Math.max(QUIZ_LIVES + 1 - errors, 0);
}

// ---- o save ----

/**
 * Uma rodada jogada, como o save a guarda: "r" certa, "w" errada, "v" anulada. Uma letra por
 * rodada, sem id de faixa (não revela nada): uns 50 bytes no dia mais longo.
 */
export type QuizMark = "r" | "w" | "v";

/** O quiz do dia terminado. */
export type QuizGame = {
  readonly number: number;
  /** As rodadas jogadas, na ordem, uma letra por rodada (`QuizMark`). */
  readonly results: string;
  /** Terminado depois do dia dele (o Histórico, num PR seguinte): fica fora das medalhas. */
  readonly late?: true;
  /** Os pontos da run (v13, o usuário, 28/10/2026); a run terminada antes deles não os tem. */
  readonly points?: number;
};

/** O máximo de pontos de uma run: 4 em cada uma das até 50 rodadas. */
export const QUIZ_MAX_POINTS = 200;

/** O andamento: só os eventos aceitos (a retomada repete todos no reducer, P2). */
export type QuizProgress = { readonly events: readonly QuizEvent[] };

/** O quiz no save (v12), à parte dos diários e das Misturadas. */
export type QuizSave = {
  readonly finished: Readonly<Record<PuzzleId, QuizGame>>;
  readonly progress: Readonly<Record<PuzzleId, QuizProgress>>;
};

export const EMPTY_QUIZ: QuizSave = { finished: {}, progress: {} };

const MARKS: Readonly<Record<Exclude<QuizRoundStatus, "playing">, QuizMark>> = {
  right: "r",
  wrong: "w",
  void: "v",
};

/** O texto das rodadas jogadas de um save: só "r", "w" e "v", de 1 a 50. */
export const QUIZ_RESULTS = /^[rwv]{1,50}$/;

/** O jogo terminado, no formato do save: as rodadas até a última jogada. */
export function toQuizGame(state: QuizState, number: number, late: boolean): QuizGame {
  if (!isQuizFinished(state)) throw new Error("toQuizGame recebeu uma run em andamento");
  const results = state.rounds
    .slice(0, state.current + 1)
    .map((round) => (round.status === "playing" ? "v" : MARKS[round.status]))
    .join("");
  return { number, results, ...(late ? { late: true } : {}), points: quizStatePoints(state) };
}

/** Os pontos de uma run terminada; null na terminada antes dos pontos (v12). */
export function quizPoints(game: Pick<QuizGame, "points">): number | null {
  return game.points ?? null;
}

/** A rodada alcançada: a última jogada. */
export function quizReached(game: Pick<QuizGame, "results">): number {
  return game.results.length;
}

/** Os acertos da run. */
export function quizRight(game: Pick<QuizGame, "results">): number {
  return [...game.results].filter((mark) => mark === "r").length;
}

export type QuizSession =
  | { readonly kind: "finished"; readonly game: QuizGame }
  | {
      readonly kind: "playing";
      readonly state: QuizState;
      readonly events: readonly QuizEvent[];
      /** A repetição descartou eventos salvos (catálogo novo): a lista salva precisa ser trocada. */
      readonly stale: boolean;
    };

/**
 * Como a run começa: já terminada, retomada pelos eventos salvos, ou nova. O `today` diz se a run
 * que a repetição terminou foi jogada depois do dia dela.
 */
export function startQuizSession(
  save: Save,
  daily: QuizDaily,
  index: CatalogIndex,
  today: string,
): QuizSession {
  const done = save.quiz.finished[daily.id];
  if (done) return { kind: "finished", game: done };
  const saved = save.quiz.progress[daily.id];
  let state = createQuizGame(daily, index);
  const events: QuizEvent[] = [];
  for (const event of saved?.events ?? []) {
    const next = quizReducer(state, event);
    if (next !== state) {
      events.push(event);
      state = next;
    }
  }
  // Salvou o último evento mas não chegou a gravar o terminado: a run já acabou.
  if (isQuizFinished(state) && events.length > 0) {
    return {
      kind: "finished",
      game: toQuizGame(state, daily.number, isLate(daily.date, today)),
    };
  }
  return { kind: "playing", state, events, stale: events.length < (saved?.events.length ?? 0) };
}

/** Troca o andamento salvo pela lista dada, mesmo mais curta. Dia terminado não muda. */
export function replaceQuizProgress(save: Save, id: PuzzleId, progress: QuizProgress): Save {
  if (save.quiz.finished[id]) return save;
  return { ...save, quiz: { ...save.quiz, progress: { ...save.quiz.progress, [id]: progress } } };
}

/** Grava o andamento. Se outra aba foi mais longe ou já terminou esta run, ela vence. */
export function withQuizProgress(save: Save, id: PuzzleId, progress: QuizProgress): Save {
  const current = save.quiz.progress[id];
  if (current && current.events.length > progress.events.length) return save;
  return replaceQuizProgress(save, id, progress);
}

/** Grava a run terminada e limpa o andamento. O primeiro término vence (duas abas). */
export function withQuizFinished(save: Save, id: PuzzleId, game: QuizGame): Save {
  const { finished, progress } = save.quiz;
  if (finished[id] && !progress[id]) return save; // já gravado: nada a fazer
  const { [id]: _done, ...rest } = progress;
  return {
    ...save,
    quiz: { finished: finished[id] ? finished : { ...finished, [id]: game }, progress: rest },
  };
}

/** A run de hoje terminada: o ✓ da aba Quiz, só pelo save. */
export function quizDone(save: Save, date: string): boolean {
  return save.quiz.finished[quizId(date)] !== undefined;
}

/** O estado do quiz no cartão da Início: fora da agenda, novo, em andamento ou terminado. */
export type QuizStatus =
  | { readonly kind: "unavailable" }
  | { readonly kind: "new"; readonly number: number }
  | { readonly kind: "playing"; readonly number: number }
  | {
      readonly kind: "done";
      readonly number: number;
      readonly reached: number;
      readonly right: number;
      /** Null na run terminada antes dos pontos (v12). */
      readonly points: number | null;
      readonly late: boolean;
    };

/** O estado do quiz de `date` pelo save; sem o número do dia (a agenda não chegou), só o save. */
export function quizStatusOf(save: Save, date: string, number: number | null): QuizStatus {
  const id = quizId(date);
  const finished = save.quiz.finished[id];
  if (finished) {
    return {
      kind: "done",
      number: finished.number,
      reached: quizReached(finished),
      right: quizRight(finished),
      points: quizPoints(finished),
      late: finished.late === true,
    };
  }
  if (number === null) return { kind: "unavailable" };
  if (save.quiz.progress[id]?.events.length) return { kind: "playing", number };
  return { kind: "new", number };
}

/** As marcas do compartilhar, as dos diários: formas diferentes, não só cores (P42). */
export const QUIZ_SHARE = { r: SYMBOLS.right, w: SYMBOLS.wrong, v: SYMBOLS.void } as const;

/** As marcas das rodadas jogadas, em linhas de 10. Sem ids: não revela nada. */
export function quizShareLines(game: Pick<QuizGame, "results">): string[] {
  const marks = [...game.results].map((mark) => QUIZ_SHARE[mark as QuizMark] ?? QUIZ_SHARE.v);
  const lines: string[] = [];
  for (let i = 0; i < marks.length; i += 10) lines.push(marks.slice(i, i + 10).join(""));
  return lines;
}

/** O texto do compartilhar: o cabeçalho e a linha do resultado (da tela), as marcas e o endereço. */
export function quizShareText(
  header: string,
  result: string,
  game: Pick<QuizGame, "results">,
  url: string,
): string {
  return [header, result, ...quizShareLines(game), url].join("\n");
}
