import { describe, expect, it } from "vitest";
import { animeCatalog, animeSchedule, schedule } from "../../test/fixtures.ts";
import { indexAnime } from "./catalog.ts";
import {
  ANIME_KEYS,
  animeDailies,
  animeDaily,
  animeKey,
  DAILY_KEYS,
  dailyIds,
  hitsDailies,
  hitsDaily,
  isAnimeKey,
} from "./daily.ts";
import { dayAnswerKeys } from "./help.ts";
import { emptySave, pruneProgress, type Save, startSession } from "./records.ts";
import { MODES } from "./rules.ts";
import type { AnimeDay, Day } from "./types.ts";

const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;
const animeDay = animeSchedule.days[DATE] as AnimeDay;

describe("hitsDaily", () => {
  it("o Normal: o id de hoje no save, as regras do álbum e as rodadas da agenda", () => {
    expect(hitsDaily(day, DATE, "album")).toEqual({
      key: "album",
      id: "2026-10-08|album",
      date: DATE,
      number: day.number,
      target: "album",
      name: "mode.album",
      answer: "track",
      rounds: day.album,
      avoid: [...day.song, ...day.album].map((r) => r.answer),
    });
  });

  it("o Desafio: o mesmo dia, as rodadas de música e o mesmo avoid (as respostas dos dois)", () => {
    const song = hitsDaily(day, DATE, "song");
    expect(song).toMatchObject({ key: "song", id: "2026-10-08|song", target: "song" });
    expect(song.rounds).toBe(day.song);
    expect(song.avoid).toEqual(hitsDaily(day, DATE, "album").avoid);
    expect(song.avoid).toHaveLength(6);
  });
});

describe("hitsDailies", () => {
  it("os dois diários do dia, na ordem de MODES", () => {
    expect(hitsDailies(day, DATE).map((d) => d.key)).toEqual([...MODES]);
  });
});

describe("animeDaily (M14)", () => {
  it("o acertar a música: o id de hoje no save, as regras do Desafio e as rodadas da agenda do Anime", () => {
    expect(animeDaily(animeDay, DATE, "musica", "facil")).toEqual({
      key: "anime-musica-facil",
      id: "2026-10-08|anime-musica-facil",
      date: DATE,
      number: animeDay.number,
      target: "song",
      name: "daily.anime-musica-facil",
      answer: "track",
      rounds: animeDay.musica.facil,
      avoid: expect.any(Array),
    });
  });

  it("o acertar o anime responde a franquia (P234), com as mesmas regras", () => {
    const titulo = animeDaily(animeDay, DATE, "titulo", "dificil");
    expect(titulo).toMatchObject({
      key: "anime-titulo-dificil",
      id: "2026-10-08|anime-titulo-dificil",
      target: "song",
      answer: "franchise",
      name: "daily.anime-titulo-dificil",
    });
    expect(titulo.rounds).toBe(animeDay.titulo.dificil);
  });

  it("a ajuda evita as 18 respostas do dia do Anime, dos dois modos, e não as dos Hits (P248)", () => {
    const { avoid } = animeDaily(animeDay, DATE, "musica", "medio");
    const all = [animeDay.musica, animeDay.titulo].flatMap((mode) =>
      [mode.facil, mode.medio, mode.dificil].flatMap((rounds) => rounds.map((r) => r.answer)),
    );
    expect(avoid).toEqual(all);
    expect(avoid).toHaveLength(18);
    // O mesmo avoid nos 6 diários do dia.
    for (const daily of animeDailies(animeDay, DATE)) expect(daily.avoid).toEqual(avoid);
    // As respostas dos Hits do mesmo dia não entram (só as que coincidirem com as do Anime).
    const hits = hitsDaily(day, DATE, "song").avoid.filter((id) => !all.includes(id));
    expect(hits.length).toBeGreaterThan(0);
    expect(avoid.some((id) => hits.includes(id))).toBe(false);
  });

  it("o nº é o do dia na agenda do Anime", () => {
    const later = animeSchedule.days["2026-10-20"] as AnimeDay;
    expect(animeDaily(later, "2026-10-20", "musica", "dificil").number).toBe(later.number);
    expect(later.number).toBe(13);
  });

  it("os 6 diários do dia, na ordem de ANIME_KEYS", () => {
    expect(animeDailies(animeDay, DATE).map((d) => d.key)).toEqual([...ANIME_KEYS]);
  });

  it("o diário monta o jogo do Desafio sobre o índice do Anime, e a ajuda acha as respostas nele", () => {
    const index = indexAnime(animeCatalog);
    const daily = animeDaily(animeDay, DATE, "musica", "facil");
    const session = startSession(emptySave(), daily, index);
    if (session.kind !== "playing") throw new Error("o diário novo devia começar a jogar");
    expect(session.state.target).toBe("song");
    expect(session.state.puzzleId).toBe(daily.id);
    expect(session.state.rounds.map((r) => r.trackId)).toEqual(
      animeDay.musica.facil.map((r) => r.answer),
    );
    expect(session.state.rounds.every((r) => r.status === "playing")).toBe(true);
    // Toda resposta do dia é do catálogo do Anime: a ajuda evita as 18 músicas.
    expect(dayAnswerKeys(daily, index).size).toBe(new Set(daily.avoid).size);
  });
});

describe("as chaves do Anime", () => {
  it("animeKey e isAnimeKey: o Anime, e não os Hits", () => {
    expect(animeKey("titulo", "medio")).toBe("anime-titulo-medio");
    for (const key of ANIME_KEYS) expect(isAnimeKey(key)).toBe(true);
    for (const key of MODES) expect(isAnimeKey(key)).toBe(false);
  });
});

describe("DAILY_KEYS (P250)", () => {
  it("os 2 dos Hits e os 6 do Anime (2 modos × 3 dificuldades), sem repetir", () => {
    expect(ANIME_KEYS).toEqual([
      "anime-musica-facil",
      "anime-musica-medio",
      "anime-musica-dificil",
      "anime-titulo-facil",
      "anime-titulo-medio",
      "anime-titulo-dificil",
    ]);
    expect(DAILY_KEYS).toEqual([...MODES, ...ANIME_KEYS]);
    expect(new Set(DAILY_KEYS).size).toBe(8);
  });

  it("a abertura guarda os andamentos de hoje dos 8 diários e tira os de outro dia", () => {
    const ids = dailyIds(DATE);
    expect(ids).toHaveLength(8);
    expect(ids).toContain("2026-10-08|album");
    expect(ids).toContain("2026-10-08|anime-titulo-dificil");
    const save: Save = {
      ...emptySave(),
      inProgress: {
        "2026-10-08|song": { events: [] },
        "2026-10-08|anime-musica-medio": { events: [{ type: "SKIP" }] },
        "2026-10-07|anime-musica-medio": { events: [] },
      },
    };
    expect(Object.keys(pruneProgress(save, ids).inProgress)).toEqual([
      "2026-10-08|song",
      "2026-10-08|anime-musica-medio",
    ]);
  });
});
