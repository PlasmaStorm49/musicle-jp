import { describe, expect, it } from "vitest";
import { artists, realArtists } from "../../test/artists.ts";
import { indexArtist } from "./catalog.ts";
import { normalize } from "./normalize.ts";
import {
  activeSlots,
  BAND_START,
  bandOf,
  beatenSetlist,
  chainLength,
  chainParts,
  chainTimeline,
  drawSetlistRound,
  MIN_SOLO,
  REPEAT_WEIGHTS,
  roundShape,
  SETLIST_FINAL,
  SETLIST_LIVES,
  SETLIST_ROUNDS,
  type SetlistRun,
  setlistBest,
  setlistOffset,
  setlistPool,
  setlistStep,
  startSetlist,
  tapsLeft,
} from "./setlist.ts";
import type { ArtistCatalog } from "./types.ts";

const NONE: ReadonlySet<string> = new Set();

/** O maior artista real (200 músicas) e o menor (o YOASOBI, com umas 37). */
const bySize = [...realArtists.files].sort((a, b) => b.tracks.length - a.tracks.length);
const big = indexArtist(bySize[0] as ArtistCatalog);
const small = indexArtist(bySize.at(-1) as ArtistCatalog);
const bigPool = setlistPool(big, NONE);

/** A run com todos os toques certos na rodada atual, do Tocar à revelação. */
function clearRound(run: SetlistRun): SetlistRun {
  let next = setlistStep(setlistStep(run, { type: "PLAYED" }), { type: "HEARD" });
  for (const id of run.round?.played ?? []) next = setlistStep(next, { type: "PICK", id });
  return next;
}

/** A run na revelação passa à rodada seguinte, sorteada como a tela sorteia. */
function advance(run: SetlistRun, pool: readonly string[]): SetlistRun {
  const number = (run.round?.number ?? 0) + 1;
  const round = drawSetlistRound(pool, number, run.plays, run.seed);
  return setlistStep(run, { type: run.phase === "complete" ? "CONTINUE" : "NEXT", round });
}

/** Um toque errado da rodada atual (uma opção que não tocou e não foi tocada). */
function wrongPick(run: SetlistRun): SetlistRun {
  const id = run.round?.options.find(
    (o) => !run.round?.played.includes(o) && !run.picks.includes(o),
  );
  if (!id) throw new Error("sem opção errada");
  return setlistStep(run, { type: "PICK", id });
}

describe("a curva do Setlist Royale (o usuário, 01/11/2026)", () => {
  it("as opções crescem uma por rodada, e as 12 só aparecem na última; as músicas chegam a 8", () => {
    expect(SETLIST_FINAL).toBe(10);
    expect(SETLIST_ROUNDS.map((r) => r.options)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(SETLIST_ROUNDS.at(-1)).toEqual({ songs: 8, options: 12 });
    for (const [i, round] of SETLIST_ROUNDS.entries()) {
      expect(round.songs).toBeLessThan(round.options);
      expect(round.songs).toBeGreaterThanOrEqual(SETLIST_ROUNDS[i - 1]?.songs ?? 0);
    }
  });

  it("o sem fim fica na dificuldade da 10ª", () => {
    expect(roundShape(11, 200)).toEqual({ songs: 8, options: 12 });
    expect(roundShape(40, 200)).toEqual({ songs: 8, options: 12 });
    expect(bandOf(11, 200)).toBe(200);
    expect(chainParts(25)).toEqual(chainParts(SETLIST_FINAL));
  });

  it("o artista pequeno (as fixtures): as opções não passam do total, e sempre sobra uma errada", () => {
    expect(roundShape(10, 4)).toEqual({ songs: 3, options: 4 });
    expect(roundShape(1, 2)).toEqual({ songs: 1, options: 2 });
    expect(roundShape(1, 1).songs).toBe(0);
  });

  it("a faixa de popularidade abre das 20 mais populares, na 1ª, ao catálogo inteiro, na 10ª", () => {
    expect(bandOf(1, 200)).toBe(BAND_START);
    expect(bandOf(10, 200)).toBe(200);
    const bands = Array.from({ length: 10 }, (_, i) => bandOf(i + 1, 200));
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
    expect(bandOf(1, 12)).toBe(12);
  });
});

describe("a sequência emendada: os tempos", () => {
  it("o tempo total encolhe aos poucos, de 4,5 s a 3 s, em três partes iguais", () => {
    expect(chainParts(1)).toEqual({ span: 4.5, solo: 1.5, together: 1.5 });
    expect(chainParts(10)).toEqual({ span: 3, solo: 1, together: 1 });
    const spans = Array.from({ length: 10 }, (_, i) => chainParts(i + 1).span);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]).toBeLessThan(spans[i - 1] ?? 0);
    }
  });

  it.each([1, 4, 10, 15])(
    "na rodada %i, nunca 3 juntas, e cada música fica sozinha o mesmo tempo, nunca abaixo de 1 s",
    (number) => {
      const { solo } = chainParts(number);
      expect(solo).toBeGreaterThanOrEqual(MIN_SOLO);
      const timeline = chainTimeline(8, number);
      const alone = new Array<number>(8).fill(0);
      const dt = 0.01;
      for (let t = dt / 2; t < chainLength(timeline); t += dt) {
        const on = activeSlots(timeline, t);
        expect(on.length).toBeGreaterThan(0);
        expect(on.length).toBeLessThanOrEqual(2);
        const only = on[0];
        if (on.length === 1 && only !== undefined) alone[only] = (alone[only] ?? 0) + dt;
      }
      for (const seconds of alone) expect(seconds).toBeCloseTo(solo, 1);
    },
  );

  it("2 músicas na 1ª rodada tocam em 4,5 s; 8 na 10ª, em 15 s", () => {
    expect(chainTimeline(2, 1)).toEqual([
      { at: 0, seconds: 3 },
      { at: 1.5, seconds: 3 },
    ]);
    expect(chainLength(chainTimeline(2, 1))).toBe(4.5);
    expect(chainLength(chainTimeline(8, 10))).toBe(15);
  });

  it("o ponto da prévia deixa o trecho inteiro antes da folga do fim, sempre o mesmo", () => {
    const round = drawSetlistRound(bigPool, 1, {}, 7);
    if (!round) throw new Error("sem rodada");
    for (const id of round.played) {
      const offset = setlistOffset(7, round, id, 30, 4.5);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(30 - 4.5 - 2);
      expect(setlistOffset(7, round, id, 30, 4.5)).toBe(offset);
    }
    expect(setlistOffset(7, round, "x", 5, 4.5)).toBe(0);
  });
});

describe("o sorteio das rodadas", () => {
  it("o pool vai da mais popular à menos, sem as excluídas de hoje (P141) e sem título repetido", () => {
    const pops = bigPool.map((id) => big.tracks.get(id)?.popularity ?? 0);
    expect(pops).toEqual([...pops].sort((a, b) => b - a));
    const titles = bigPool.map((id) => normalize(big.tracks.get(id)?.title ?? ""));
    expect(new Set(titles).size).toBe(titles.length);
    const first = big.tracks.get(bigPool[0] ?? "");
    if (!first) throw new Error("pool vazio");
    expect(setlistPool(big, new Set([first.songKey]))).not.toContain(first.id);
  });

  it("cada rodada tem o tamanho da curva, as que tocam estão nas opções e saem da faixa", () => {
    const plays = {};
    for (let number = 1; number <= 12; number += 1) {
      const round = drawSetlistRound(bigPool, number, plays, 3);
      if (!round) throw new Error("sem rodada");
      const shape = roundShape(number, bigPool.length);
      expect(round.played).toHaveLength(shape.songs);
      expect(round.options).toHaveLength(shape.options);
      expect(new Set(round.options).size).toBe(round.options.length);
      const band = bigPool.slice(0, bandOf(number, bigPool.length));
      for (const id of round.played) {
        expect(round.options).toContain(id);
        expect(band).toContain(id);
      }
      for (const id of round.options) expect(band).toContain(id);
    }
  });

  it("a mesma semente dá a mesma rodada; outra tentativa (a interrompida) dá outra", () => {
    const a = drawSetlistRound(bigPool, 5, {}, 11);
    expect(drawSetlistRound(bigPool, 5, {}, 11)).toEqual(a);
    const again = drawSetlistRound(bigPool, 5, {}, 11, 1);
    expect(again?.attempt).toBe(1);
    expect(again?.played).not.toEqual(a?.played);
  });

  it("a música que tocou na rodada anterior volta com uns 1/4 da chance", () => {
    const pool = setlistPool(small, NONE);
    const target = pool[0] ?? "";
    let free = 0;
    let after = 0;
    for (let seed = 0; seed < 3000; seed += 1) {
      if (drawSetlistRound(pool, 5, {}, seed)?.played.includes(target)) free += 1;
      if (drawSetlistRound(pool, 5, { [target]: 4 }, seed)?.played.includes(target)) after += 1;
    }
    expect(REPEAT_WEIGHTS[0]).toBe(0.25);
    expect(after / free).toBeGreaterThan(0.15);
    expect(after / free).toBeLessThan(0.4);
  });

  it("sem 2 músicas, não há rodada, e a run já acaba", () => {
    const tiny = indexArtist(
      artists.files.find((a) => a.artistId === "fixture:ar:ar01") as ArtistCatalog,
    );
    const pool = setlistPool(tiny, NONE);
    expect(drawSetlistRound(pool.slice(0, 1), 1, {}, 1)).toBeNull();
    const run = startSetlist(1, []);
    expect(run).toMatchObject({ phase: "over", end: "empty", round: null });
    expect(setlistBest(run)).toBeNull();
  });
});

describe("a run (setlistStep)", () => {
  const start = () => startSetlist(5, bigPool);

  it("ouvir uma vez só: o PLAYED trava o Tocar, e só o fim da sequência abre os toques", () => {
    const run = start();
    expect(run).toMatchObject({ phase: "listen", started: false, lives: SETLIST_LIVES });
    expect(setlistStep(run, { type: "HEARD" })).toBe(run);
    expect(setlistStep(run, { type: "PICK", id: run.round?.played[0] ?? "" })).toBe(run);
    const playing = setlistStep(run, { type: "PLAYED" });
    expect(playing.started).toBe(true);
    expect(setlistStep(playing, { type: "PLAYED" })).toBe(playing);
    const heard = setlistStep(playing, { type: "HEARD" });
    expect(heard.phase).toBe("pick");
    for (const id of run.round?.played ?? []) expect(heard.plays[id]).toBe(1);
  });

  it("a interrompida é sorteada de novo, sem custo; a de outro número não entra", () => {
    const run = setlistStep(start(), { type: "PLAYED" });
    const redraw = drawSetlistRound(bigPool, 1, run.plays, run.seed, 1);
    if (!redraw) throw new Error("sem rodada");
    const voided = setlistStep(run, { type: "VOID", round: redraw });
    expect(voided).toMatchObject({ round: redraw, started: false, lives: SETLIST_LIVES });
    const other = drawSetlistRound(bigPool, 2, run.plays, run.seed);
    if (!other) throw new Error("sem rodada");
    expect(setlistStep(run, { type: "VOID", round: other })).toBe(run);
  });

  it("cada toque vale na hora: o certo acha, o errado gasta uma vida e um toque", () => {
    let run = setlistStep(setlistStep(start(), { type: "PLAYED" }), { type: "HEARD" });
    const [first, second] = run.round?.played ?? [];
    run = setlistStep(run, { type: "PICK", id: first ?? "" });
    expect(run).toMatchObject({ found: 1, lives: 3, phase: "pick" });
    expect(setlistStep(run, { type: "PICK", id: first ?? "" })).toBe(run); // o mesmo de novo
    expect(setlistStep(run, { type: "PICK", id: "fora" })).toBe(run);
    run = wrongPick(run);
    // Rodada 1: 2 músicas, 2 toques. O errado gastou o último: a rodada acaba, com erro, e avança.
    expect(run).toMatchObject({ found: 1, lives: 2, phase: "reveal", cleared: 1, end: null });
    expect(tapsLeft(run)).toBe(0);
    expect(run.picks).not.toContain(second);
    const next = advance(run, bigPool);
    expect(next).toMatchObject({ phase: "listen", started: false, picks: [] });
    expect(next.round?.number).toBe(2);
  });

  it("a 3ª vida no meio da rodada encerra a run, sem contar a rodada", () => {
    let run = clearRound(start());
    for (let n = 0; n < 2; n += 1) {
      run = advance(run, bigPool);
      run = wrongPick(setlistStep(setlistStep(run, { type: "PLAYED" }), { type: "HEARD" }));
      while (run.phase === "pick") {
        const id = run.round?.played.find((p) => !run.picks.includes(p)) ?? "";
        run = setlistStep(run, { type: "PICK", id });
      }
    }
    expect(run).toMatchObject({ lives: 1, cleared: 3 });
    run = advance(run, bigPool);
    run = wrongPick(setlistStep(setlistStep(run, { type: "PLAYED" }), { type: "HEARD" }));
    expect(run).toMatchObject({ lives: 0, phase: "reveal", end: "errors", cleared: 3 });
    expect(setlistStep(run, { type: "QUIT" })).toBe(run);
    const over = setlistStep(run, { type: "NEXT", round: null });
    expect(over.phase).toBe("over");
    expect(setlistBest(over)).toEqual({ rounds: 3, found: over.found });
  });

  it("na 10ª, a setlist acaba; o sem fim segue na dificuldade dela", () => {
    let run = start();
    for (let n = 1; n <= SETLIST_FINAL; n += 1) {
      run = clearRound(run);
      expect(run.phase).toBe("reveal");
      if (n < SETLIST_FINAL) run = advance(run, bigPool);
    }
    run = setlistStep(run, { type: "NEXT", round: null });
    expect(run.phase).toBe("complete");
    const total = SETLIST_ROUNDS.reduce((sum, r) => sum + r.songs, 0);
    expect(setlistBest(run)).toEqual({ rounds: 10, found: total });
    expect(setlistStep(run, { type: "QUIT" })).toBe(run);
    run = advance(run, bigPool);
    expect(run).toMatchObject({ phase: "listen", endless: true });
    expect(run.round?.number).toBe(11);
    expect(run.round?.options).toHaveLength(12);
    run = advance(clearRound(run), bigPool);
    expect(run.phase).toBe("listen"); // no sem fim, a 11ª não volta à tela da setlist completa
    expect(run.round?.number).toBe(12);
  });

  it("encerrar acaba a run; a rodada fora de ordem não entra", () => {
    const run = clearRound(start());
    const skip = drawSetlistRound(bigPool, 3, run.plays, run.seed);
    expect(setlistStep(run, { type: "NEXT", round: skip })).toBe(run);
    const quit = setlistStep(run, { type: "QUIT" });
    expect(quit).toMatchObject({ phase: "over", end: "quit" });
    expect(setlistStep(quit, { type: "QUIT" })).toBe(quit);
    expect(setlistBest(quit)).toEqual({ rounds: 1, found: 2 });
    expect(setlistBest(run)).toBeNull(); // em jogo
  });

  it("beatenSetlist: o que a run passou do recorde de antes", () => {
    expect(beatenSetlist(null, { rounds: 4, found: 9 })).toEqual({ rounds: false, found: false });
    expect(beatenSetlist({ rounds: 3, found: 12 }, { rounds: 4, found: 9 })).toEqual({
      rounds: true,
      found: false,
    });
  });
});
