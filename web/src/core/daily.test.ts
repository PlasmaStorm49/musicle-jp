import { describe, expect, it } from "vitest";
import { schedule } from "../../test/fixtures.ts";
import { ANIME_KEYS, DAILY_KEYS, dailyIds, hitsDailies, hitsDaily } from "./daily.ts";
import { emptySave, pruneProgress, type Save } from "./records.ts";
import { MODES } from "./rules.ts";
import type { Day } from "./types.ts";

const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;

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
