import { describe, expect, it } from "vitest";
import { ANIME_KEYS, dailyIds } from "./daily.ts";
import {
  HISTORY_DAYS,
  hasDaily,
  historyDates,
  historyDay,
  historyDays,
  inHistory,
  keptProgressIds,
} from "./history.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "./records.ts";

const TODAY = "2026-10-22";
const game: FinishedGame = {
  number: 1,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};
const saveWith = (ids: string[], playing: string[] = []): Save => ({
  ...emptySave(),
  history: Object.fromEntries(ids.map((id) => [id, game])),
  inProgress: Object.fromEntries(playing.map((id) => [id, { events: [{ type: "SKIP" }] }])),
});

describe("a janela do Histórico (P260, P262)", () => {
  it("os 14 dias antes de hoje, do mais antigo a ontem", () => {
    const dates = historyDates(TODAY);
    expect(dates).toHaveLength(HISTORY_DAYS);
    expect(dates[0]).toBe("2026-10-08");
    expect(dates.at(-1)).toBe("2026-10-21");
  });

  it("vira o mês e o ano sem passar pela hora local", () => {
    expect(historyDates("2026-11-01")).toEqual(
      Array.from({ length: 14 }, (_, i) => `2026-10-${String(18 + i).padStart(2, "0")}`),
    );
    expect(historyDates("2027-01-03").slice(-3)).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it.each([
    ["2026-10-08", true],
    ["2026-10-21", true],
    ["2026-10-07", false],
    [TODAY, false],
    ["2026-10-23", false],
    // O texto que não é data do calendário (o PR 2 lê a data do endereço).
    ["2026-10-1", false],
    ["2026-10-15x", false],
    ["2026-02-30", false],
  ])("%s está no Histórico de 22/10: %s", (date, expected) => {
    expect(inHistory(date, TODAY)).toBe(expected);
  });
});

describe("keptProgressIds (P269)", () => {
  it("os 8 diários de hoje e dos 14 dias do Histórico: 120 ids", () => {
    const ids = keptProgressIds(TODAY);
    expect(ids).toHaveLength(15 * 8);
    expect(ids.slice(0, 8)).toEqual(dailyIds(TODAY));
    expect(ids).toContain(puzzleId("2026-10-08", "anime-titulo-dificil"));
    expect(ids).not.toContain(puzzleId("2026-10-07", "album"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a marca de cada categoria (P260)", () => {
  const D = "2026-10-21";
  const hitsDates = new Set([D]);
  const animeDates = new Set([D]);
  const marks = (save: Save, anime: ReadonlySet<string> | null = animeDates) => {
    const day = historyDay(save, D, hitsDates, anime);
    return { hits: day.hits, anime: day.anime };
  };

  it("nada jogado: as duas vazias", () => {
    expect(marks(emptySave())).toEqual({ hits: "none", anime: "none" });
  });

  it("nos Hits, ◐ com 1 dos 2 e ✓ com os 2", () => {
    expect(marks(saveWith([puzzleId(D, "album")]))).toMatchObject({ hits: "some" });
    expect(marks(saveWith([puzzleId(D, "album"), puzzleId(D, "song")]))).toMatchObject({
      hits: "all",
    });
  });

  it("no Anime, o ✓ da nav: com ao menos 1 dos 6 (P247)", () => {
    expect(marks(saveWith([puzzleId(D, "anime-titulo-medio")]))).toMatchObject({ anime: "all" });
    const all = ANIME_KEYS.map((key) => puzzleId(D, key));
    expect(marks(saveWith(all))).toMatchObject({ anime: "all" });
  });

  it("o jogado depois também marca, e o andamento não", () => {
    const save: Save = {
      ...saveWith([], [puzzleId(D, "song"), puzzleId(D, "anime-musica-facil")]),
      history: { [puzzleId(D, "album")]: { ...game, late: true } },
    };
    expect(marks(save)).toEqual({ hits: "some", anime: "none" });
  });

  it("fora da agenda, apagada; sem a agenda do Anime, null", () => {
    const day = historyDay(emptySave(), "2026-10-20", hitsDates, animeDates);
    expect({ hits: day.hits, anime: day.anime }).toEqual({ hits: "off", anime: "off" });
    expect(hasDaily(day)).toBe(false);
    expect(marks(emptySave(), null)).toEqual({ hits: "none", anime: null });
  });

  it("o dia tem diário se alguma categoria tem", () => {
    const animeOnly = historyDay(emptySave(), D, new Set(), animeDates);
    expect(hasDaily(animeOnly)).toBe(true);
    expect(hasDaily(historyDay(emptySave(), D, new Set(), null))).toBe(false);
    expect(hasDaily(historyDay(emptySave(), D, hitsDates, null))).toBe(true);
  });
});

describe("historyDays", () => {
  it("um dia por data, com o dia da semana e o dia do mês", () => {
    const all = new Set(historyDates(TODAY));
    const days = historyDays(emptySave(), TODAY, all, null);
    expect(days).toHaveLength(14);
    // 08/10/2026 é uma quinta: cada coluna do calendário tem o mesmo dia da semana.
    expect(days[0]).toEqual({
      date: "2026-10-08",
      weekday: 4,
      day: 8,
      month: 10,
      hits: "none",
      anime: null,
    });
    expect(days[7]?.weekday).toBe(4);
    expect(days.at(-1)).toMatchObject({ date: "2026-10-21", weekday: 3, day: 21 });
  });
});
