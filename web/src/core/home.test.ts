import { describe, expect, it } from "vitest";
import { animeSchedule, catalog, schedule } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import { ANIME_KEYS, animeDailies, animeDaily } from "./daily.ts";
import {
  animeDone,
  dailiesDone,
  dailyStatus,
  firstToPlay,
  nextDaily,
  practiceSummary,
  progress,
  statusOf,
} from "./home.ts";
import { startPracticeSession } from "./practice.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "./records.ts";
import { reduce } from "./reducer.ts";
import type { AnimeDay, Day } from "./types.ts";

const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;
const animeDay = animeSchedule.days[DATE] as AnimeDay;

// Rodada 1 em 6 pontos, rodada 2 perdida, rodada 3 em 5 pontos (ouviu mais uma vez): 11 de 18.
const finished: FinishedGame = {
  number: day.number,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] }, // no Normal, "Ouvir mais" não é tentativa
  ],
};

const save = (change: Partial<Save>): Save => ({ ...emptySave(), ...change });

describe("dailyStatus (cartões da home)", () => {
  it("dia novo: o número do diário", () => {
    expect(dailyStatus(emptySave(), day, DATE, "song")).toEqual({
      kind: "new",
      number: day.number,
    });
  });

  it("com andamento salvo: em andamento", () => {
    const playing = save({
      inProgress: { [puzzleId(DATE, "album")]: { events: [{ type: "LISTEN_MORE" }] } },
    });
    expect(dailyStatus(playing, day, DATE, "album")).toEqual({
      kind: "playing",
      number: day.number,
    });
    expect(dailyStatus(playing, day, DATE, "song").kind).toBe("new");
  });

  it("andamento vazio (a repetição descartou todos os eventos): ainda é dia novo", () => {
    const emptied = save({ inProgress: { [puzzleId(DATE, "album")]: { events: [] } } });
    expect(dailyStatus(emptied, day, DATE, "album").kind).toBe("new");
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

describe("nextDaily (o cartão oliva)", () => {
  it("o 1º diário por jogar, na ordem de MODES; nenhum, com os dois terminados ou sem o dia", () => {
    expect(nextDaily(emptySave(), day, DATE)).toBe("album");
    const albumDone = save({ history: { [puzzleId(DATE, "album")]: finished } });
    expect(nextDaily(albumDone, day, DATE)).toBe("song");
    const bothDone = save({
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(nextDaily(bothDone, day, DATE)).toBeNull();
    expect(nextDaily(emptySave(), null, DATE)).toBeNull();
  });

  it("em andamento também é por jogar", () => {
    const playing = save({
      history: { [puzzleId(DATE, "album")]: finished },
      inProgress: { [puzzleId(DATE, "song")]: { events: [{ type: "LISTEN_MORE" }] } },
    });
    expect(nextDaily(playing, day, DATE)).toBe("song");
  });
});

describe("dailiesDone (o ✓ da aba Hits, P227)", () => {
  it("só com os dois diários do dia terminados", () => {
    expect(dailiesDone(emptySave(), DATE)).toBe(false);
    const one = save({ history: { [puzzleId(DATE, "album")]: finished } });
    expect(dailiesDone(one, DATE)).toBe(false);
    const both = save({
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(dailiesDone(both, DATE)).toBe(true);
    expect(dailiesDone(both, "2026-10-09")).toBe(false); // os de outro dia não contam
  });
});

describe("statusOf e firstToPlay (os cartões do Anime, pelo descritor)", () => {
  const facil = animeDaily(animeDay, DATE, "musica", "facil");
  const medio = animeDaily(animeDay, DATE, "musica", "medio");
  const dificil = animeDaily(animeDay, DATE, "musica", "dificil");

  it("o estado de um diário do Anime: o nº da agenda do Anime, novo, em andamento e terminado", () => {
    expect(statusOf(emptySave(), facil)).toEqual({ kind: "new", number: animeDay.number });
    const playing = save({ inProgress: { [facil.id]: { events: [{ type: "SKIP" }] } } });
    expect(statusOf(playing, facil)).toEqual({ kind: "playing", number: animeDay.number });
    const done = save({ history: { [facil.id]: finished } });
    expect(statusOf(done, facil)).toMatchObject({ kind: "done", score: 11, max: 18 });
    // O mesmo dia nos Hits não conta: o id é outro.
    expect(statusOf(save({ history: { [puzzleId(DATE, "song")]: finished } }), facil).kind).toBe(
      "new",
    );
    expect(statusOf(done, null)).toEqual({ kind: "unavailable" });
  });

  it("o 1º por jogar, na ordem dada: o Fácil, depois o Médio; nenhum com os 3 terminados", () => {
    const dailies = [facil, medio, dificil];
    expect(firstToPlay(emptySave(), dailies)).toBe(facil);
    expect(firstToPlay(save({ history: { [facil.id]: finished } }), dailies)).toBe(medio);
    const all = save({
      history: { [facil.id]: finished, [medio.id]: finished, [dificil.id]: finished },
    });
    expect(firstToPlay(all, dailies)).toBeNull();
    expect(firstToPlay(emptySave(), [])).toBeNull();
  });

  it("dailyStatus dos Hits continua igual ao statusOf do descritor", () => {
    const playing = save({
      inProgress: { [puzzleId(DATE, "album")]: { events: [{ type: "LISTEN_MORE" }] } },
    });
    expect(dailyStatus(playing, day, DATE, "album")).toEqual({
      kind: "playing",
      number: day.number,
    });
  });
});

describe("animeDone (o ✓ da aba Anime, P247)", () => {
  it("com qualquer um dos 6 diários do Anime de hoje terminado", () => {
    expect(animeDone(emptySave(), DATE)).toBe(false);
    for (const key of ANIME_KEYS) {
      expect(animeDone(save({ history: { [puzzleId(DATE, key)]: finished } }), DATE), key).toBe(
        true,
      );
    }
  });

  it("em andamento não conta, nem os de outro dia, nem os dos Hits", () => {
    const playing = save({
      inProgress: { [puzzleId(DATE, "anime-musica-facil")]: { events: [{ type: "SKIP" }] } },
    });
    expect(animeDone(playing, DATE)).toBe(false);
    const yesterday = save({
      history: { [puzzleId("2026-10-07", "anime-musica-facil")]: finished },
    });
    expect(animeDone(yesterday, DATE)).toBe(false);
    const hits = save({
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(animeDone(hits, DATE)).toBe(false);
  });
});

describe("progress (o andamento de um grupo de diários)", () => {
  const ids = animeDailies(animeDay, DATE)
    .slice(0, 3)
    .map((d) => d.id);

  it("nada jogado: nenhum terminado, nenhum em jogo", () => {
    expect(progress(emptySave(), ids)).toEqual({ done: 0, playing: 0, total: 3 });
  });

  it("os terminados e os em andamento, cada um uma vez; o andamento vazio não conta", () => {
    const [a = "", b = "", c = ""] = ids;
    const mixed = save({
      history: { [a]: finished },
      inProgress: { [b]: { events: [{ type: "SKIP" }] }, [c]: { events: [] } },
    });
    expect(progress(mixed, ids)).toEqual({ done: 1, playing: 1, total: 3 });
    // Um andamento que sobrou junto do resultado (duas abas) conta como terminado.
    const both = save({
      history: { [a]: finished },
      inProgress: { [a]: { events: [{ type: "SKIP" }] } },
    });
    expect(progress(both, ids)).toEqual({ done: 1, playing: 0, total: 3 });
  });
});

describe("practiceSummary (cartão do Treino)", () => {
  const index = indexCatalog(catalog);
  const session = startPracticeSession(1, "album", index, new Set());
  const game = session.game;
  const round = game?.rounds[0];
  if (!game || !round) throw new Error("o Treino não sorteou rodada");

  it("sem sessão ou antes da 1ª rodada terminada: nada a mostrar", () => {
    expect(practiceSummary(null)).toBeNull();
    expect(practiceSummary(session)).toBeNull();
  });

  it("a rodada em jogo conta quando termina; as anteriores vêm do placar; vem o modo (P106)", () => {
    const won = reduce(game, { type: "GUESS", guessId: round.correctOptionId });
    expect(practiceSummary({ ...session, game: won })).toEqual({
      target: "album",
      score: { points: 6, rounds: 1 },
    });
    const later = { ...session, score: { points: 11, rounds: 3 }, game: won };
    expect(practiceSummary(later)?.score).toEqual({ points: 17, rounds: 4 });
  });

  it("o modo é o da sessão: no Desafio, song", () => {
    const desafio = startPracticeSession(2, "song", index, new Set());
    const played = { ...desafio, score: { points: 3, rounds: 1 } };
    expect(practiceSummary(played)?.target).toBe("song");
  });
});
