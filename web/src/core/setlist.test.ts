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
  EDGE_CHANCE,
  leftToFind,
  MIN_SOLO,
  MIN_SONG_SEC,
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

  it("o ponto da prévia: por igual na região do meio, raro nas pontas, nunca fixo", () => {
    // Numa prévia de 30 s, com o trecho de 4,5 s: as posições vão de 0 a 23,5 s, e a região do meio
    // vai de 5,875 a 17,625 s. Em passos de 0,25 s, sempre o mesmo para a mesma semente.
    const last = 30 - 4.5 - 2;
    const middle = (o: number) => o >= last / 4 - 0.125 && o <= (3 * last) / 4 + 0.125;
    const offsets: number[] = [];
    for (let seed = 0; seed < 1000; seed += 1) {
      const round = drawSetlistRound(bigPool, 1, {}, seed);
      if (!round) throw new Error("sem rodada");
      for (const id of round.played) {
        const offset = setlistOffset(seed, round, id, 30, 4.5);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(last);
        expect(offset * 4).toBe(Math.round(offset * 4));
        expect(setlistOffset(seed, round, id, 30, 4.5)).toBe(offset);
        offsets.push(offset);
      }
    }
    // As pontas: 1 em cada 10 (EDGE_CHANCE), dos dois lados.
    const edges = offsets.filter((o) => !middle(o));
    expect(EDGE_CHANCE).toBe(0.1);
    expect(edges.length / offsets.length).toBeGreaterThan(0.06);
    expect(edges.length / offsets.length).toBeLessThan(0.14);
    expect(edges.some((o) => o < last / 4)).toBe(true);
    expect(edges.some((o) => o > (3 * last) / 4)).toBe(true);
    // O meio por igual: a metade de dentro dele leva mais ou menos a metade dos começos do meio.
    const inner = offsets.filter((o) => middle(o) && Math.abs(o - last / 2) <= last / 8);
    const share = inner.length / (offsets.length - edges.length);
    expect(share).toBeGreaterThan(0.42);
    expect(share).toBeLessThan(0.58);
    // Nunca fixo: a mesma música, em runs e rodadas diferentes, cai em muitos pontos.
    const round = drawSetlistRound(bigPool, 1, {}, 7);
    if (!round) throw new Error("sem rodada");
    const id = round.played[0] ?? "";
    const points = new Set(
      Array.from({ length: 200 }, (_, seed) =>
        setlistOffset(seed, { ...round, number: (seed % 10) + 1 }, id, 30, 4.5),
      ),
    );
    expect(points.size).toBeGreaterThan(30);
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

  it("a música que acabou de tocar quase não volta na rodada seguinte, nem como opção, e volta aos poucos", () => {
    const pool = setlistPool(small, NONE);
    const target = pool[0] ?? "";
    /** Em quantas de 3000 rodadas 5 ela toca e em quantas ela aparece, tendo tocado na `last`. */
    const count = (last?: number) => {
      let played = 0;
      let shown = 0;
      for (let seed = 0; seed < 3000; seed += 1) {
        const round = drawSetlistRound(pool, 5, last ? { [target]: last } : {}, seed);
        if (round?.played.includes(target)) played += 1;
        if (round?.options.includes(target)) shown += 1;
      }
      return { played, shown };
    };
    expect(REPEAT_WEIGHTS).toEqual([0.1, 0.3, 0.6]);
    const free = count();
    const now = count(4);
    const later = count(2);
    expect(now.played / free.played).toBeLessThan(0.2);
    expect(now.shown / free.shown).toBeLessThan(0.2);
    // Duas rodadas depois, a chance já voltou mais da metade do caminho.
    expect(later.shown / free.shown).toBeGreaterThan(0.45);
    // Quatro rodadas depois, o peso é o cheio: a mesma rodada de quem nunca tocou.
    expect(count(1)).toEqual(free);
  });

  it("as vinhetas (menos de 80 s, quase sempre instrumentais) ficam fora do pool", () => {
    for (const file of realArtists.files) {
      const index = indexArtist(file);
      for (const id of setlistPool(index, NONE)) {
        const ms = index.tracks.get(id)?.durationMs ?? 0;
        expect(ms === 0 || ms >= MIN_SONG_SEC * 1000).toBe(true);
      }
    }
    expect(MIN_SONG_SEC).toBe(80);
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

  it("cada toque vale na hora; o errado gasta uma vida, e a rodada só passa quando acha todas", () => {
    let run = setlistStep(setlistStep(start(), { type: "PLAYED" }), { type: "HEARD" });
    const [first, second] = run.round?.played ?? [];
    run = setlistStep(run, { type: "PICK", id: first ?? "" });
    expect(run).toMatchObject({ found: 1, lives: 3, phase: "pick" });
    expect(setlistStep(run, { type: "PICK", id: first ?? "" })).toBe(run); // o mesmo de novo
    expect(setlistStep(run, { type: "PICK", id: "fora" })).toBe(run);
    // O errado não fecha a rodada (o usuário, 01/11/2026): falta a 2ª música.
    run = wrongPick(run);
    expect(run).toMatchObject({ found: 1, lives: 2, phase: "pick", cleared: 0 });
    expect(leftToFind(run)).toBe(1);
    run = setlistStep(run, { type: "PICK", id: second ?? "" });
    expect(run).toMatchObject({ found: 2, lives: 2, phase: "reveal", cleared: 1, end: null });
    expect(leftToFind(run)).toBe(0);
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

describe("a revisão do Setlist Royale (01/11/2026)", () => {
  it("a rodada sorteada de novo não traz nenhuma música da cortada, nem como opção", () => {
    for (let seed = 0; seed < 300; seed += 1) {
      for (const number of [1, 5, 10]) {
        const cut = drawSetlistRound(bigPool, number, {}, seed);
        if (!cut) throw new Error("sem rodada");
        const again = drawSetlistRound(bigPool, number, {}, seed, 1, cut.played);
        expect(again?.options.filter((id) => cut.played.includes(id))).toEqual([]);
      }
    }
  });

  it("no artista pequeno, sem outras que bastem, a cortada pode voltar (não há como evitar)", () => {
    const pool = bigPool.slice(0, 3);
    const cut = drawSetlistRound(pool, 1, {}, 1);
    const again = drawSetlistRound(pool, 1, {}, 1, 1, cut?.played ?? []);
    expect(again?.options).toHaveLength(3);
  });

  it("a run que acaba sem rodada no meio (um pool que encolheu) guarda o que fez", () => {
    const run = clearRound(startSetlist(5, bigPool));
    const empty = setlistStep(run, { type: "NEXT", round: null });
    expect(empty).toMatchObject({ phase: "over", end: "empty" });
    expect(setlistBest(empty)).toEqual({ rounds: 1, found: 2 });
  });
});
