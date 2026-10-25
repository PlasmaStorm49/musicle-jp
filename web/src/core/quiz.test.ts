// O quiz do dia (M18) no núcleo: o descritor, o reducer (a escolha, as 2 vidas e o 3º erro, a
// anulada), o save, a retomada, o cartão e o compartilhar. Sobre a agenda fictícia de 08/10
// (playlists, max, 28 rodadas).
import { describe, expect, it } from "vitest";
import { animeCatalog, quizBonus, quizOctober } from "../../test/fixtures.ts";
import { indexAnime } from "./catalog.ts";
import {
  bonusDailies,
  createQuizGame,
  currentQuizRound,
  isMalFamily,
  isQuizFinished,
  livesLeft,
  QUIZ_LIVES,
  QUIZ_RESULTS,
  type QuizEvent,
  type QuizSide,
  type QuizState,
  quizDaily,
  quizDone,
  quizId,
  quizReached,
  quizReducer,
  quizRight,
  quizShareLines,
  quizShareText,
  quizStatusOf,
  replaceQuizProgress,
  startQuizSession,
  toQuizGame,
  withQuizFinished,
  withQuizProgress,
} from "./quiz.ts";
import { emptySave, pruneProgress, type Save } from "./records.ts";
import type { QuizDay } from "./types.ts";

const index = indexAnime(animeCatalog);
const DATE = "2026-10-08";
const day = quizOctober.days[DATE] as QuizDay;
const daily = quizDaily(day, DATE);

/** A resposta da rodada `n` e o lado errado. */
const right = (n: number): QuizSide => daily.rounds[n]?.answer ?? "a";
const wrong = (n: number): QuizSide => (right(n) === "a" ? "b" : "a");

/** Joga uma sequência de rodadas ("r" certa, "w" errada, "v" anulada), com o NEXT entre elas. */
function play(marks: string, state: QuizState = createQuizGame(daily, index)): QuizState {
  let s = state;
  [...marks].forEach((mark, n) => {
    if (n > 0) s = quizReducer(s, { type: "NEXT" });
    if (mark === "v") s = quizReducer(s, { type: "VOID", round: n });
    else s = quizReducer(s, { type: "CHOOSE", round: n, side: mark === "r" ? right(n) : wrong(n) });
  });
  return s;
}

describe("o descritor", () => {
  it("o id, o número, a pergunta e as rodadas da agenda", () => {
    expect(daily).toMatchObject({
      id: "2026-10-08|quiz",
      date: DATE,
      number: 1,
      family: "playlists",
      direction: "max",
      param: null,
      mal: true,
    });
    expect(daily.rounds).toHaveLength(28);
    expect(daily.rounds[0]).toEqual({
      a: "fixture:tr:tr08",
      b: "fixture:tr:tr37",
      answer: "a",
      info: { playlists: [15, 14] },
    });
    expect(quizId(DATE)).toBe(daily.id);
  });

  it("o parâmetro, nas perguntas de propriedade, e o crédito do MAL nas famílias dele", () => {
    const fonte = quizDaily(quizOctober.days["2026-10-18"] as QuizDay, "2026-10-18");
    expect(fonte).toMatchObject({ family: "fonte", param: "original" });
    expect(isMalFamily("fonte")).toBe(true);
    expect(isMalFamily("playlists")).toBe(false);
    expect(isMalFamily("nota")).toBe(true);
  });
});

describe("o reducer", () => {
  it("a escolha certa marca a rodada e não tira vida; o NEXT segue", () => {
    const start = createQuizGame(daily, index);
    const after = quizReducer(start, { type: "CHOOSE", round: 0, side: right(0) });
    expect(currentQuizRound(after)).toMatchObject({ status: "right", chosen: right(0) });
    expect(after.errors).toBe(0);
    const next = quizReducer(after, { type: "NEXT" });
    expect(next.current).toBe(1);
  });

  it("a errada tira uma vida; as 2 vidas aguentam 2 erros, e o 3º encerra (P377)", () => {
    expect(QUIZ_LIVES).toBe(2);
    const two = play("rww");
    expect(two.errors).toBe(2);
    expect(livesLeft(two.errors)).toBe(0);
    expect(isQuizFinished(two)).toBe(false);
    const three = play("rwwrw");
    expect(isQuizFinished(three)).toBe(true);
    // Acabou: nem o NEXT nem outra escolha mexem.
    expect(quizReducer(three, { type: "NEXT" })).toBe(three);
  });

  it("a anulada não tira vida nem conta acerto", () => {
    const state = play("vr");
    expect(state.errors).toBe(0);
    expect(state.rounds[0]?.status).toBe("void");
    expect(state.rounds[0]?.chosen).toBeNull();
  });

  it("o evento inválido devolve o mesmo objeto (regra 5)", () => {
    const start = createQuizGame(daily, index);
    const events: QuizEvent[] = [
      { type: "NEXT" }, // a rodada ainda em jogo
      { type: "CHOOSE", round: 1, side: "a" }, // outra rodada
      { type: "VOID", round: 3 }, // uma falha atrasada de outra rodada
    ];
    for (const event of events) expect(quizReducer(start, event)).toBe(start);
    const chosen = quizReducer(start, { type: "CHOOSE", round: 0, side: "a" });
    expect(quizReducer(chosen, { type: "CHOOSE", round: 0, side: "b" })).toBe(chosen);
    expect(quizReducer(chosen, { type: "VOID", round: 0 })).toBe(chosen);
  });

  it("a run inteira acaba na última rodada, e o NEXT não passa dela", () => {
    const all = play("r".repeat(daily.rounds.length));
    expect(isQuizFinished(all)).toBe(true);
    expect(all.current).toBe(daily.rounds.length - 1);
    expect(quizReducer(all, { type: "NEXT" })).toBe(all);
  });

  it("uma faixa que saiu do catálogo anula a rodada já na montagem", () => {
    const gone = { ...daily, rounds: [{ ...daily.rounds[0], a: "fixture:tr:nao-existe" }] };
    const state = createQuizGame(gone as typeof daily, index);
    expect(state.rounds[0]?.status).toBe("void");
    expect(isQuizFinished(state)).toBe(true);
    expect(() => currentQuizRound({ ...state, current: 5 })).toThrow(RangeError);
  });
});

describe("o save", () => {
  it("o resultado: uma letra por rodada jogada, sem ids (rodada alcançada e acertos)", () => {
    const state = play("rrvwrw" + "w");
    const game = toQuizGame(state, daily.number, false);
    expect(game).toEqual({ number: 1, results: "rrvwrww" });
    expect(QUIZ_RESULTS.test(game.results)).toBe(true);
    expect(quizReached(game)).toBe(7);
    expect(quizRight(game)).toBe(3);
    expect(toQuizGame(state, 1, true)).toEqual({ number: 1, results: "rrvwrww", late: true });
    expect(() => toQuizGame(play("r"), 1, false)).toThrow();
  });

  it("a retomada repete os eventos salvos; a que perdeu eventos é marcada", () => {
    const events: QuizEvent[] = [
      { type: "CHOOSE", round: 0, side: right(0) },
      { type: "NEXT" },
      { type: "CHOOSE", round: 1, side: wrong(1) },
    ];
    const save: Save = withQuizProgress(emptySave(), daily.id, { events });
    const session = startQuizSession(save, daily, index, DATE);
    expect(session.kind).toBe("playing");
    if (session.kind !== "playing") return;
    expect(session.state.current).toBe(1);
    expect(session.state.errors).toBe(1);
    expect(session.stale).toBe(false);
    // Um evento que não vale mais sai, e a lista é trocada.
    const stale = replaceQuizProgress(emptySave(), daily.id, {
      events: [...events, { type: "CHOOSE", round: 9, side: "a" }],
    });
    const again = startQuizSession(stale, daily, index, DATE);
    expect(again.kind === "playing" && again.stale).toBe(true);
  });

  it("a retomada que já termina a run devolve o terminado; o salvo terminado vence", () => {
    const events: QuizEvent[] = [];
    for (let n = 0; n < 3; n++) {
      if (n > 0) events.push({ type: "NEXT" });
      events.push({ type: "CHOOSE", round: n, side: wrong(n) });
    }
    const save = withQuizProgress(emptySave(), daily.id, { events });
    const session = startQuizSession(save, daily, index, "2026-10-09");
    expect(session).toEqual({
      kind: "finished",
      game: { number: 1, results: "www", late: true },
    });
    const done = withQuizFinished(emptySave(), daily.id, { number: 1, results: "r" });
    expect(startQuizSession(done, daily, index, DATE)).toEqual({
      kind: "finished",
      game: { number: 1, results: "r" },
    });
  });

  it("o terminado limpa o andamento; o 1º término vence, e o andamento mais curto não apaga o outro", () => {
    const progress = { events: [{ type: "NEXT" } as const, { type: "NEXT" } as const] };
    let save = withQuizProgress(emptySave(), daily.id, progress);
    expect(withQuizProgress(save, daily.id, { events: [] })).toBe(save);
    save = withQuizFinished(save, daily.id, { number: 1, results: "rw" });
    expect(save.quiz.progress[daily.id]).toBeUndefined();
    expect(withQuizFinished(save, daily.id, { number: 1, results: "w" })).toBe(save);
    expect(replaceQuizProgress(save, daily.id, progress)).toBe(save);
  });

  it("a abertura limpa o andamento de um dia que não se retoma mais", () => {
    const old = withQuizProgress(emptySave(), quizId("2026-09-01"), { events: [{ type: "NEXT" }] });
    const kept = withQuizProgress(old, daily.id, { events: [{ type: "NEXT" }] });
    const pruned = pruneProgress(kept, [daily.id]);
    expect(Object.keys(pruned.quiz.progress)).toEqual([daily.id]);
  });
});

describe("o cartão e o ✓", () => {
  it("fora da agenda, novo, em andamento e terminado", () => {
    expect(quizStatusOf(emptySave(), DATE, null)).toEqual({ kind: "unavailable" });
    expect(quizStatusOf(emptySave(), DATE, 1)).toEqual({ kind: "new", number: 1 });
    const playing = withQuizProgress(emptySave(), daily.id, { events: [{ type: "NEXT" }] });
    expect(quizStatusOf(playing, DATE, 1)).toEqual({ kind: "playing", number: 1 });
    const done = withQuizFinished(emptySave(), daily.id, { number: 1, results: "rrw" });
    expect(quizStatusOf(done, DATE, null)).toEqual({
      kind: "done",
      number: 1,
      reached: 3,
      right: 2,
      late: false,
    });
    expect(quizDone(done, DATE)).toBe(true);
    expect(quizDone(playing, DATE)).toBe(false);
  });
});

describe("o compartilhar", () => {
  it("as marcas em linhas de 10, sem ids, entre o cabeçalho e o endereço", () => {
    const game = { results: "rrrrrwrrrrv" + "rw" };
    expect(quizShareLines(game)).toEqual(["✅✅✅✅✅❌✅✅✅✅", "⬜✅❌"]);
    expect(quizShareText("Cabeçalho", "Rodada 13", game, "https://x.y/")).toBe(
      "Cabeçalho\nRodada 13\n✅✅✅✅✅❌✅✅✅✅\n⬜✅❌\nhttps://x.y/",
    );
  });
});

describe("o bônus de estreia (o usuário, 25/10/2026)", () => {
  it("cada rodada vira um diário de uma rodada só, com a pergunta dela, fora do save", () => {
    const dailies = bonusDailies(quizBonus);
    expect(dailies.map((d) => [d.family, d.rounds.length])).toEqual([
      ["ano", 1],
      ["tema", 1],
      ["nota", 1],
    ]);
    expect(dailies.every((d) => d.date === quizBonus.date)).toBe(true);
    expect(dailies[0]?.id).toBe("2026-10-08|quiz-bonus-1");
    // A rodada joga como as outras: a certa marca e encerra o diário de uma rodada.
    const first = dailies[0];
    if (!first) throw new Error("sem bônus");
    const state = createQuizGame(first, index);
    const done = quizReducer(state, {
      type: "CHOOSE",
      round: 0,
      side: first.rounds[0]?.answer ?? "a",
    });
    expect(currentQuizRound(done).status).toBe("right");
    expect(isQuizFinished(done)).toBe(true);
  });
});
