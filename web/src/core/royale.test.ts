import { describe, expect, it } from "vitest";
import { coverUrl } from "./covers.ts";
import { emptySave, puzzleId, type Save } from "./records.ts";
import {
  createRoyaleGame,
  isRoyaleFinished,
  nextRoyale,
  ROYALE_MIDDLE_CHANCE,
  ROYALE_SAMPLE_SEC,
  type RoyaleDaily,
  type RoyaleGame,
  royaleDailies,
  royaleDaily,
  royaleIds,
  royaleOffset,
  royaleProgress,
  royaleReducer,
  royaleShareLine,
  royaleShareText,
  royaleStatusOf,
  startRoyaleSession,
  toRoyaleGame,
  withRoyaleFinished,
  withRoyaleProgress,
} from "./royale.ts";
import type { RoyaleDay } from "./types.ts";

const DATE = "2026-11-02";
const PLAYED = ["x:tr:p1", "x:tr:p2", "x:tr:p3", "x:tr:p4", "x:tr:p5"];
const ROUND = {
  played: PLAYED,
  options: [
    "x:tr:w1",
    "x:tr:p3",
    "x:tr:p1",
    "x:tr:w2",
    "x:tr:p5",
    "x:tr:w3",
    "x:tr:p2",
    "x:tr:w4",
    "x:tr:p4",
  ],
};
const DAY = {
  number: 4,
  catalogVersion: "2026-10-26.5bbaf9ae",
  facil: ROUND,
  medio: ROUND,
  dificil: ROUND,
} as RoyaleDay;

function daily(tier: "facil" | "medio" | "dificil" = "facil"): RoyaleDaily {
  return royaleDaily(DAY, DATE, tier);
}

function play(ids: readonly string[], quit = false) {
  let state = createRoyaleGame(daily());
  for (const id of ids) state = royaleReducer(state, { type: "PICK", id });
  if (quit) state = royaleReducer(state, { type: "QUIT" });
  return state;
}

describe("o diário do Royale (o usuário, 01/11/2026)", () => {
  it("as 3 dificuldades do dia, com os ids do save e as rotas", () => {
    expect(royaleDailies(DAY, DATE).map((d) => [d.key, d.id, d.number])).toEqual([
      ["anime-royale-facil", "2026-11-02|anime-royale-facil", 4],
      ["anime-royale-medio", "2026-11-02|anime-royale-medio", 4],
      ["anime-royale-dificil", "2026-11-02|anime-royale-dificil", 4],
    ]);
    expect(royaleDailies(null, DATE)).toEqual([]);
    expect(royaleIds(DATE)).toEqual(royaleDailies(DAY, DATE).map((d) => d.id));
  });

  it("o trecho é o mesmo para todos e cabe na prévia, com a folga do fade", () => {
    const d = daily();
    expect(royaleOffset(d, "x:tr:p1", 30)).toBe(royaleOffset(d, "x:tr:p1", 30));
    for (const id of PLAYED) {
      const at = royaleOffset(d, id, 30);
      expect(Number.isInteger(at)).toBe(true);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at + ROYALE_SAMPLE_SEC).toBeLessThanOrEqual(28);
    }
    // A prévia curta demais começa do 1º som.
    expect(royaleOffset(d, "x:tr:p1", 9)).toBe(0);
  });

  it("o trecho prefere o meio e o fim da prévia, sem garantia", () => {
    const d = daily();
    const offsets = Array.from({ length: 2000 }, (_, i) => royaleOffset(d, `x:tr:${i}`, 30));
    const late = offsets.filter((at) => at >= 10).length / offsets.length;
    expect(Math.abs(late - ROYALE_MIDDLE_CHANCE)).toBeLessThan(0.04);
    expect(offsets.some((at) => at < 10)).toBe(true);
  });
});

describe("a partida: uma vida (o usuário, 01/11/2026)", () => {
  it("cada capa certa vale na hora, e as 5 terminam", () => {
    const state = play(PLAYED.slice(0, 4));
    expect(isRoyaleFinished(state)).toBe(false);
    expect(isRoyaleFinished(play(PLAYED))).toBe(true);
    expect(toRoyaleGame(play(PLAYED), 4)).toEqual({ number: 4, found: [0, 1, 2, 3, 4] });
  });

  it("o 1º erro encerra, e a ordem das achadas fica", () => {
    const state = play(["x:tr:p3", "x:tr:p1", "x:tr:w2"]);
    expect(isRoyaleFinished(state)).toBe(true);
    expect(toRoyaleGame(state, 4)).toEqual({ number: 4, found: [2, 0], wrong: true });
    // Depois do fim, nada muda: o mesmo objeto (regra 5 do web).
    expect(royaleReducer(state, { type: "PICK", id: "x:tr:p2" })).toBe(state);
  });

  it("a capa repetida, a que não está na grade e o desistir no fim devolvem o mesmo objeto", () => {
    const state = play(["x:tr:p1"]);
    expect(royaleReducer(state, { type: "PICK", id: "x:tr:p1" })).toBe(state);
    expect(royaleReducer(state, { type: "PICK", id: "x:tr:nao" })).toBe(state);
    const quit = royaleReducer(state, { type: "QUIT" });
    expect(toRoyaleGame(quit, 4)).toEqual({ number: 4, found: [0], quit: true });
    expect(royaleReducer(quit, { type: "QUIT" })).toBe(quit);
  });

  it("o jogo em andamento não vira registro", () => {
    expect(() => toRoyaleGame(play([]), 4)).toThrow();
  });
});

describe("o save do Royale (v18)", () => {
  const d = daily("medio");

  it("retoma pelos eventos, e o andamento que já terminou vira terminado", () => {
    const events = [{ type: "PICK", id: "x:tr:p2" } as const];
    let save = withRoyaleProgress(emptySave(), d.id, { events });
    const session = startRoyaleSession(save, d);
    expect(session.kind === "playing" && session.state.picks).toEqual(["x:tr:p2"]);
    save = withRoyaleProgress(save, d.id, {
      events: [...events, { type: "PICK", id: "x:tr:w1" }, { type: "PICK", id: "x:tr:p1" }],
    });
    // O 3º evento chegou depois do fim: a repetição para no erro, e o jogo está terminado.
    expect(startRoyaleSession(save, d)).toEqual({
      kind: "finished",
      game: { number: 4, found: [1], wrong: true },
    });
  });

  it("o evento que não vale sai, e a lista salva é trocada (stale)", () => {
    const save = withRoyaleProgress(emptySave(), d.id, {
      events: [{ type: "PICK", id: "x:tr:nao" }],
    });
    const session = startRoyaleSession(save, d);
    expect(session.kind === "playing" && session.stale).toBe(true);
  });

  it("o 1º término vence, e o andamento sai", () => {
    const game: RoyaleGame = { number: 4, found: [0] };
    let save = withRoyaleProgress(emptySave(), d.id, { events: [{ type: "QUIT" }] });
    save = withRoyaleFinished(save, d.id, game);
    expect(save.royale).toEqual({ finished: { [d.id]: game }, progress: {} });
    expect(withRoyaleFinished(save, d.id, { number: 4, found: [0, 1, 2] })).toBe(save);
    // O andamento mais curto não apaga o de outra aba que foi mais longe.
    const long = withRoyaleProgress(emptySave(), d.id, {
      events: [
        { type: "PICK", id: "x:tr:p1" },
        { type: "PICK", id: "x:tr:p2" },
      ],
    });
    expect(withRoyaleProgress(long, d.id, { events: [] })).toBe(long);
  });

  it("o cartão de cada dificuldade e o andamento do dia saem só do save", () => {
    expect(royaleStatusOf(emptySave(), null)).toEqual({ kind: "unavailable" });
    expect(royaleStatusOf(emptySave(), d)).toEqual({ kind: "new", number: 4 });
    const playing = withRoyaleProgress(emptySave(), d.id, {
      events: [{ type: "PICK", id: "x:tr:p1" }],
    });
    expect(royaleStatusOf(playing, d)).toEqual({ kind: "playing", number: 4 });
    expect(royaleProgress(playing, DATE)).toEqual({ done: 0, playing: true });
    const done = withRoyaleFinished(emptySave(), d.id, { number: 4, found: [3, 1], wrong: true });
    expect(royaleStatusOf(done, d)).toEqual({
      kind: "done",
      number: 4,
      score: 2,
      max: 5,
      late: false,
    });
    expect(royaleProgress(done, DATE)).toEqual({ done: 1, playing: false });
  });

  it("a próxima dificuldade por jogar: a seguinte na ordem e, no fim, a que ficou para trás", () => {
    const dailies = royaleDailies(DAY, DATE);
    const save: Save = emptySave();
    expect(nextRoyale(save, dailies, "facil")?.tier).toBe("medio");
    expect(nextRoyale(save, dailies, "dificil")?.tier).toBe("facil");
    const medio = withRoyaleFinished(save, puzzleId(DATE, "anime-royale-medio"), {
      number: 4,
      found: [],
      quit: true,
    });
    expect(nextRoyale(medio, dailies, "facil")?.tier).toBe("dificil");
    const all = withRoyaleFinished(medio, puzzleId(DATE, "anime-royale-dificil"), {
      number: 4,
      found: [],
      quit: true,
    });
    expect(nextRoyale(all, dailies, "facil")).toBeNull();
  });
});

describe("o compartilhar do Royale", () => {
  it("as achadas, o erro que encerrou e as que faltaram, sem ids", () => {
    expect(royaleShareLine({ number: 4, found: [0, 1, 2, 3, 4] })).toBe("✅✅✅✅✅");
    expect(royaleShareLine({ number: 4, found: [2, 0], wrong: true })).toBe("✅✅❌⬜⬜⬜");
    expect(royaleShareLine({ number: 4, found: [], quit: true })).toBe("⬜⬜⬜⬜⬜");
    expect(
      royaleShareText("AteMusic Anime Royale · Fácil · 02/11", { number: 4, found: [1] }, "u"),
    ).toBe("AteMusic Anime Royale · Fácil · 02/11\n1/5\n✅⬜⬜⬜⬜\nu");
  });
});

describe("as capas (regra 5: a 3ª conferência do caminho)", () => {
  const small = "anime/small-cover/cUnunEwN4ktLVaEsSfRSgE7NREhfRMLGXKkkuDuS.avif";
  const large = "anime/large-cover/mLoIEyGITkJPGCBxvjTpDyDYRM8rDb4ZuFGCKEaH.png";

  it("na Apple, o host do AnimeThemes; nas fixtures, o SVG falso em fixtures/", () => {
    expect(coverUrl("apple", { small, large }, "large")).toBe(
      `https://pub-92474f7785774e91a790e086dfa6b2ef.r2.dev/${large}`,
    );
    const fake = {
      small: "anime/small-cover/neon_samurai.svg",
      large: "anime/large-cover/neon_samurai.svg",
    };
    expect(coverUrl("fixture", fake, "small")).toBe("fixtures/anime/small-cover/neon_samurai.svg");
    expect(coverUrl("apple", null, "small")).toBeNull();
  });

  it.each([
    ["apple", "anime/large-cover/../../a.png"],
    ["apple", "https://evil.test/anime/large-cover/a.png"],
    ["apple", "anime/large-cover//a.png"],
    ["apple", "anime/large-cover/a.png\n"],
    ["apple", "anime/large-cover/a.svg"],
    ["apple", "anime/small-cover/a.png"],
    ["fixture", "anime/large-cover/a.png"],
    ["outro", "anime/large-cover/a.png"],
  ])("recusa o caminho fora do padrão do provedor (%s, %j)", (provider, path) => {
    expect(coverUrl(provider, { small, large: path }, "large")).toBeNull();
  });
});
