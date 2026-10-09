import { describe, expect, it } from "vitest";
import { catalog, schedule } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import {
  emptySave,
  type FinishedGame,
  lockedMode,
  pruneProgress,
  puzzleId,
  recordMax,
  recordScore,
  replaceProgress,
  type SaveV1,
  startSession,
  toFinishedGame,
  withFinished,
  withModeChoice,
  withProgress,
} from "./records.ts";
import { type GameEvent, reduce } from "./reducer.ts";
import type { Day } from "./types.ts";

const index = indexCatalog(catalog);
const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;
const ID = puzzleId(DATE, "song");

const session = (save: SaveV1) => startSession(save, day, DATE, "song", "choice", index);
const saveWith = (events: GameEvent[]): SaveV1 => ({
  ...emptySave(),
  inProgress: { [ID]: { answerMode: "choice", events } },
});

describe("startSession", () => {
  it("sem nada salvo: jogo novo", () => {
    const s = session(emptySave());
    expect(s.kind).toBe("playing");
    if (s.kind === "playing") expect(s.events).toEqual([]);
  });

  it("retoma pelos eventos e volta exatamente onde estava", () => {
    const events: GameEvent[] = [
      { type: "LISTEN_MORE" },
      { type: "LISTEN_MORE" },
      { type: "GUESS", guessId: day.song[0].answer },
      { type: "NEXT_ROUND" },
      { type: "LISTEN_MORE" },
    ];
    const s = session(saveWith(events));
    expect(s.kind).toBe("playing");
    if (s.kind !== "playing") return;
    expect(s.state.current).toBe(1);
    expect(s.state.rounds[0]?.status).toBe("won");
    expect(s.state.rounds[0]?.stage).toBe(2);
    expect(s.state.rounds[1]?.stage).toBe(1);
    expect(s.events).toEqual(events);
  });

  it("evento que não muda o estado é descartado ao repetir, e a sessão pede regravação", () => {
    const s = session(saveWith([{ type: "NEXT_ROUND" }, { type: "LISTEN_MORE" }]));
    expect(s).toMatchObject({ kind: "playing", events: [{ type: "LISTEN_MORE" }], stale: true });
  });

  it("repetição sem descarte não pede regravação", () => {
    expect(session(saveWith([{ type: "LISTEN_MORE" }]))).toMatchObject({ stale: false });
    expect(session(emptySave())).toMatchObject({ stale: false });
  });

  it("rodada anulada por falha de áudio continua anulada ao recarregar", () => {
    const s = session(saveWith([{ type: "VOID", round: 0, reason: "audio" }]));
    if (s.kind === "playing") expect(s.state.rounds[0]?.status).toBe("void");
  });

  it("andamento de outro dia não é retomado", () => {
    const other: SaveV1 = {
      ...emptySave(),
      inProgress: { "2026-10-07|song": { answerMode: "choice", events: [{ type: "GIVE_UP" }] } },
    };
    const s = session(other);
    if (s.kind === "playing") expect(s.events).toEqual([]);
  });

  it("dia terminado vai direto ao resultado (P39)", () => {
    const done = toFinishedGame(
      [
        { type: "GIVE_UP" },
        { type: "NEXT_ROUND" },
        { type: "GIVE_UP" },
        { type: "NEXT_ROUND" },
        { type: "GIVE_UP" },
      ].reduce(
        (st, e) => reduce(st, e as GameEvent),
        (session(emptySave()) as { state: Parameters<typeof reduce>[0] }).state,
      ),
      day.number,
    );
    expect(session({ ...emptySave(), history: { [ID]: done } })).toEqual({
      kind: "finished",
      game: done,
    });
  });

  it("andamento que já terminou (histórico não chegou a ser gravado) vira resultado", () => {
    const events: GameEvent[] = [
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
    ];
    expect(session(saveWith(events)).kind).toBe("finished");
  });
});

describe("FinishedGame", () => {
  const game: FinishedGame = {
    answerMode: "choice",
    number: 1,
    rounds: [
      { status: "won", stage: 1, attempts: ["right"] },
      { status: "lost", stage: 0, attempts: ["wrong"] },
      { status: "void", stage: 0, attempts: [] },
    ],
  };

  it("pontos e máximo são derivados (12 com uma anulada)", () => {
    expect(recordScore(game)).toBe(5);
    expect(recordMax(game)).toBe(12);
  });

  it("toFinishedGame recusa jogo em andamento", () => {
    const s = session(
      saveWith([{ type: "LISTEN_MORE" }, { type: "GUESS", guessId: day.song[0].answer }]),
    );
    if (s.kind !== "playing") throw new Error("esperava jogo em andamento");
    expect(() => toFinishedGame(s.state, 1)).toThrow();
  });

  it("toFinishedGame converte o jogo em status, etapa e marcas por tentativa", () => {
    const wrong = day.song[1].options.find((o) => o !== day.song[1].answer) as string;
    const s = session(
      saveWith([
        { type: "LISTEN_MORE" },
        { type: "GUESS", guessId: day.song[0].answer },
        { type: "NEXT_ROUND" },
        { type: "GUESS", guessId: wrong },
        { type: "NEXT_ROUND" },
        { type: "VOID", round: 2, reason: "audio" },
      ]),
    );
    expect(s).toEqual({
      kind: "finished",
      game: {
        answerMode: "choice",
        number: 1,
        rounds: [
          { status: "won", stage: 1, attempts: ["right"] },
          { status: "lost", stage: 0, attempts: ["wrong"] },
          { status: "void", stage: 0, attempts: [] },
        ],
      },
    });
  });
});

describe("mescla de saves (duas abas)", () => {
  const done: FinishedGame = { answerMode: "choice", number: 1, rounds: [] };

  it("andamento não sobrescreve um dia já terminado", () => {
    const save = { ...emptySave(), history: { [ID]: done } };
    expect(withProgress(save, ID, { answerMode: "choice", events: [] })).toBe(save);
  });

  it("andamento mais curto não apaga um mais longo", () => {
    const longer = saveWith([{ type: "LISTEN_MORE" }, { type: "LISTEN_MORE" }]);
    expect(
      withProgress(longer, ID, { answerMode: "choice", events: [{ type: "LISTEN_MORE" }] }),
    ).toBe(longer);
  });

  it("o primeiro término vence e o andamento é limpo", () => {
    const first = withFinished(saveWith([]), ID, done);
    const second = withFinished(first, ID, { ...done, number: 99 });
    expect(second.history[ID]).toBe(done);
    expect(second.inProgress).toEqual({});
  });

  it("término já gravado e sem andamento: devolve o mesmo save (não regrava)", () => {
    const first = withFinished(saveWith([]), ID, done);
    expect(withFinished(first, ID, done)).toBe(first);
  });

  it("withModeChoice grava a preferência e trava o modo com um andamento vazio", () => {
    const save = withModeChoice(emptySave(), ID, "typing");
    expect(save.settings).toEqual({ answerMode: "typing" });
    expect(save.inProgress[ID]).toEqual({ answerMode: "typing", events: [] });
    expect(lockedMode(save, ID)).toBe("typing");
    expect(withModeChoice(save, ID, "typing")).toBe(save);
  });

  it("withModeChoice não troca o modo de um dia que outra aba já começou ou terminou", () => {
    const started = withModeChoice(emptySave(), ID, "choice");
    const other = withModeChoice(started, ID, "typing");
    expect(other.inProgress[ID]?.answerMode).toBe("choice");
    expect(other.settings.answerMode).toBe("typing"); // a preferência vale para os próximos dias
    expect(lockedMode(other, ID)).toBe("choice");

    const finished = { ...emptySave(), history: { [ID]: done } };
    expect(withModeChoice(finished, ID, "typing").inProgress).toEqual({});
    expect(lockedMode(finished, ID)).toBe("choice");
    expect(lockedMode(emptySave(), ID)).toBeNull();
  });

  it("replaceProgress troca até por uma lista mais curta, mas não mexe em dia terminado", () => {
    const longer = saveWith([{ type: "LISTEN_MORE" }, { type: "LISTEN_MORE" }]);
    const shorter = { answerMode: "choice" as const, events: [{ type: "LISTEN_MORE" as const }] };
    expect(replaceProgress(longer, ID, shorter).inProgress[ID]).toEqual(shorter);
    const finished = { ...emptySave(), history: { [ID]: done } };
    expect(replaceProgress(finished, ID, shorter)).toBe(finished);
  });

  it("pruneProgress tira andamentos de outros dias", () => {
    const save: SaveV1 = {
      ...emptySave(),
      inProgress: {
        [ID]: { answerMode: "choice", events: [] },
        "2026-10-07|song": { answerMode: "choice", events: [] },
      },
    };
    expect(Object.keys(pruneProgress(save, [ID]).inProgress)).toEqual([ID]);
    const clean = pruneProgress(save, [ID]);
    expect(pruneProgress(clean, [ID])).toBe(clean);
  });
});
