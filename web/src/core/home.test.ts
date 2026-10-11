import { describe, expect, it } from "vitest";
import { catalog, schedule } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import { dailyStatus, practiceSummary } from "./home.ts";
import { startPracticeSession } from "./practice.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "./records.ts";
import { reduce } from "./reducer.ts";
import type { Day } from "./types.ts";

const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;

// Rodada 1 em 6 pontos, rodada 2 perdida, rodada 3 em 5 pontos (ouviu mais uma vez): 11 de 18.
const finished: FinishedGame = {
  answerMode: "choice",
  number: day.number,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] }, // no 4 opções, "Ouvir mais" não é tentativa
  ],
};

const save = (change: Partial<Save>): Save => ({ ...emptySave(), ...change });

describe("dailyStatus (cartões da home)", () => {
  it("dia novo: o número do desafio", () => {
    expect(dailyStatus(emptySave(), day, DATE, "song")).toEqual({
      kind: "new",
      number: day.number,
    });
  });

  it("modo escolhido, mesmo sem palpite: em andamento, com o modo travado (P13)", () => {
    const playing = save({
      inProgress: { [puzzleId(DATE, "album")]: { answerMode: "typing", events: [] } },
    });
    expect(dailyStatus(playing, day, DATE, "album")).toEqual({
      kind: "playing",
      number: day.number,
      answerMode: "typing",
    });
    expect(dailyStatus(playing, day, DATE, "song").kind).toBe("new");
  });

  it("terminado: os pontos e o máximo saem do resumo salvo", () => {
    const done = save({ history: { [puzzleId(DATE, "song")]: finished } });
    expect(dailyStatus(done, day, DATE, "song")).toEqual({
      kind: "done",
      number: day.number,
      score: 11,
      max: 18,
    });
  });

  it("o resultado de outro dia não conta", () => {
    const yesterday = save({ history: { [puzzleId("2026-10-07", "song")]: finished } });
    expect(dailyStatus(yesterday, day, DATE, "song").kind).toBe("new");
  });

  it("dia fora da agenda: indisponível, com ou sem save", () => {
    const done = save({ history: { [puzzleId(DATE, "song")]: finished } });
    expect(dailyStatus(done, null, DATE, "song")).toEqual({ kind: "unavailable" });
  });

  it('dia todo anulado: terminado com máximo 0 (a tela não mostra "0 de 0")', () => {
    const voided: FinishedGame = {
      ...finished,
      rounds: finished.rounds.map(() => ({ status: "void", stage: 0, attempts: [] })),
    };
    const done = save({ history: { [puzzleId(DATE, "album")]: voided } });
    expect(dailyStatus(done, day, DATE, "album")).toMatchObject({ kind: "done", max: 0 });
  });
});

describe("practiceSummary (cartão do Treino)", () => {
  const index = indexCatalog(catalog);
  const session = startPracticeSession(1, "song", "choice", index, new Set());
  const game = session.game;
  const round = game?.rounds[0];
  if (!game || !round) throw new Error("o Treino não sorteou rodada");

  it("sem sessão ou antes da 1ª rodada terminada: nada a mostrar", () => {
    expect(practiceSummary(null)).toBeNull();
    expect(practiceSummary(session)).toBeNull();
  });

  it("a rodada em jogo conta quando termina; as anteriores vêm do placar", () => {
    const won = reduce(game, { type: "GUESS", guessId: round.correctOptionId });
    expect(practiceSummary({ ...session, game: won })).toEqual({ points: 6, rounds: 1 });
    const later = { ...session, score: { points: 11, rounds: 3 }, game: won };
    expect(practiceSummary(later)).toEqual({ points: 17, rounds: 4 });
  });
});
