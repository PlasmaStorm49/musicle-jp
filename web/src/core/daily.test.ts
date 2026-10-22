import { describe, expect, it } from "vitest";
import { schedule } from "../../test/fixtures.ts";
import { hitsDailies, hitsDaily } from "./daily.ts";
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
