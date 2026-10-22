import { describe, expect, it } from "vitest";
import {
  earnedMedals,
  MEDALS,
  type Medal,
  medalContext,
  medalsOf,
  SUPERFAN_RIGHT,
  superfanMedalId,
  superfanMedals,
  unseenMedals,
} from "./medals.ts";
import { Mulberry32 } from "./prng.ts";
import {
  emptySave,
  type FinishedGame,
  type Save,
  withArtistRight,
  withFinished,
  withSeenMedals,
  withSuperfanEnd,
} from "./records.ts";

const ARTIST = "apple:ar:1489581870";
const lost: FinishedGame = { number: 1, rounds: [{ status: "lost", stage: 0, attempts: [] }] };
const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, "0")}`);
const HITS = days(8, 29);

/**
 * Gerais de exemplo, como as da lista que vem no PR 3, só com o que cresce, e as reais (`MEDALS`,
 * vazias até lá): as propriedades abaixo valem para as duas.
 */
const EXAMPLES: readonly Medal[] = [
  { id: "sequencia-3", tier: "simple", earned: (ctx) => ctx.streak.best >= 3 },
  {
    id: "jogos-5",
    tier: "major",
    earned: (ctx) => ctx.games.length >= 5,
    progress: (ctx) => ({ value: Math.min(ctx.games.length, 5), goal: 5 }),
  },
];

const GENERAL: readonly Medal[] = [...MEDALS, ...EXAMPLES];

const rights = (save: Save, n: number) => {
  let next = save;
  for (let i = 0; i < n; i++) next = withArtistRight(next, ARTIST);
  return next;
};
const earned = (save: Save, today = "2026-10-20", general = GENERAL) =>
  earnedMedals(medalsOf(save, general), medalContext(save, today, HITS));

describe("as 3 do Superfan de cada artista (P285)", () => {
  const [prata, ouro, suprema] = superfanMedals(ARTIST);

  it("os ids e os tamanhos do aviso: a prata é a pequena", () => {
    expect([prata, ouro, suprema].map((m) => [m?.id, m?.tier])).toEqual([
      [`superfan|${ARTIST}|prata`, "simple"],
      [`superfan|${ARTIST}|ouro`, "major"],
      [`superfan|${ARTIST}|suprema`, "major"],
    ]);
    expect(superfanMedalId(ARTIST, "ouro")).toBe(ouro?.id);
  });

  it(`a prata com ${SUPERFAN_RIGHT} acertos, com o progresso até lá`, () => {
    const ctx = (save: Save) => medalContext(save, "2026-10-20", HITS);
    const nine = rights(emptySave(), SUPERFAN_RIGHT - 1);
    expect(prata?.earned(ctx(nine))).toBe(false);
    expect(prata?.progress?.(ctx(nine))).toEqual({
      value: SUPERFAN_RIGHT - 1,
      goal: SUPERFAN_RIGHT,
    });
    const twelve = rights(nine, 3);
    expect(prata?.earned(ctx(twelve))).toBe(true);
    expect(prata?.progress?.(ctx(twelve))).toEqual({
      value: SUPERFAN_RIGHT,
      goal: SUPERFAN_RIGHT,
    });
  });

  it("o ouro por terminar, a suprema por terminar perfeita", () => {
    const done = withSuperfanEnd(emptySave(), ARTIST, { done: true, perfect: false });
    expect(earned(done, "2026-10-20", [])).toEqual([ouro?.id]);
    const perfect = withSuperfanEnd(done, ARTIST, { done: true, perfect: true });
    expect(earned(perfect, "2026-10-20", [])).toEqual([ouro?.id, suprema?.id]);
  });

  it("sem registro do artista, nenhuma medalha dele entra na conta (a lista não é preciso)", () => {
    expect(medalsOf(emptySave(), [])).toEqual([]);
    expect(medalsOf(rights(emptySave(), 1), []).map((m) => m.id)).toEqual(
      superfanMedals(ARTIST).map((m) => m.id),
    );
  });
});

describe("medalContext: a sequência do topo (P282)", () => {
  it("qualquer dos 8 diários no dia conta; o jogado depois e o dia sem jogo, não", () => {
    let save = emptySave();
    save = withFinished(save, "2026-10-17|album", lost);
    save = withFinished(save, "2026-10-18|anime-titulo-dificil", lost);
    save = withFinished(save, "2026-10-19|song", { ...lost, late: true });
    save = withFinished(save, "2026-10-20|song", lost);
    expect(medalContext(save, "2026-10-20", HITS).streak).toEqual({ current: 1, best: 2 });
    expect(medalContext(save, "2026-10-18", HITS).streak).toEqual({ current: 2, best: 2 });
  });
});

describe("earnedMedals e unseenMedals", () => {
  it("as ganhas, na ordem da lista, e as que ainda não foram avisadas (P281)", () => {
    let save = emptySave();
    for (const date of days(10, 14)) save = withFinished(save, `${date}|song`, lost);
    save = rights(save, SUPERFAN_RIGHT);
    const ids = earned(save, "2026-10-14");
    expect(ids).toEqual(["sequencia-3", "jogos-5", superfanMedalId(ARTIST, "prata")]);
    const seen = withSeenMedals(save, ["jogos-5"]);
    expect(unseenMedals(seen, ids)).toEqual(["sequencia-3", superfanMedalId(ARTIST, "prata")]);
  });

  it("o progresso concorda com a conferência: ganha, o valor chega à meta", () => {
    let save = emptySave();
    for (const [i, date] of days(8, 16).entries()) {
      save = withFinished(save, `${date}|album`, lost);
      save = withArtistRight(save, ARTIST);
      const ctx = medalContext(save, date, HITS);
      for (const medal of medalsOf(save, GENERAL)) {
        const progress = medal.progress?.(ctx);
        if (progress)
          expect(progress.value >= progress.goal, `${medal.id} no dia ${i}`).toBe(
            medal.earned(ctx),
          );
      }
    }
  });
});

describe("medalha ganha nunca some", () => {
  it("jogar, avançar o hoje, acertar e terminar partidas, em qualquer ordem, só acrescenta", () => {
    const random = new Mulberry32(20261022);
    const artists = [ARTIST, "apple:ar:2", "fixture:ar:ar01"];
    let save = emptySave();
    let today = 8;
    let before = new Set<string>();
    for (let step = 0; step < 400; step++) {
      const date = `2026-10-${String(today).padStart(2, "0")}`;
      const artist = artists[random.randint(artists.length)] ?? ARTIST;
      switch (random.randint(5)) {
        case 0:
          save = withFinished(save, `${date}|${random.randint(2) ? "song" : "album"}`, lost);
          break;
        case 1:
          if (today < 29) today++;
          break;
        case 2:
          save = withArtistRight(save, artist);
          break;
        case 3:
          save = withSuperfanEnd(save, artist, {
            done: random.randint(2) === 1,
            perfect: random.randint(4) === 1,
          });
          break;
        default:
          save = withFinished(save, `${date}|anime-musica-facil`, { ...lost, late: true });
      }
      const now = new Set(earned(save, `2026-10-${String(today).padStart(2, "0")}`));
      for (const id of before) expect(now.has(id), `${id} sumiu no passo ${step}`).toBe(true);
      before = now;
    }
    expect(before.size).toBeGreaterThan(4);
  });
});
