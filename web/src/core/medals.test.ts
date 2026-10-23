import { describe, expect, it } from "vitest";
import {
  claimMedals,
  claimTier,
  DEMO_MEDALS,
  earnedMedals,
  MEDALS,
  type Medal,
  medalBoard,
  medalContext,
  medalsOf,
  noticeTab,
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
import { ROUTES, type Tab } from "./routes.ts";

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
  const [acertos, completo, perfeito] = superfanMedals(ARTIST);

  it("os ids e os tamanhos do aviso: a dos acertos é a pequena", () => {
    expect([acertos, completo, perfeito].map((m) => [m?.id, m?.tier])).toEqual([
      [`superfan|${ARTIST}|acertos`, "simple"],
      [`superfan|${ARTIST}|completo`, "major"],
      [`superfan|${ARTIST}|perfeito`, "major"],
    ]);
    expect(superfanMedalId(ARTIST, "completo")).toBe(completo?.id);
  });

  it(`a dos acertos com ${SUPERFAN_RIGHT} acertos, com o progresso até lá`, () => {
    const ctx = (save: Save) => medalContext(save, "2026-10-20", HITS);
    const nine = rights(emptySave(), SUPERFAN_RIGHT - 1);
    expect(acertos?.earned(ctx(nine))).toBe(false);
    expect(acertos?.progress?.(ctx(nine))).toEqual({
      value: SUPERFAN_RIGHT - 1,
      goal: SUPERFAN_RIGHT,
    });
    const twelve = rights(nine, 3);
    expect(acertos?.earned(ctx(twelve))).toBe(true);
    expect(acertos?.progress?.(ctx(twelve))).toEqual({
      value: SUPERFAN_RIGHT,
      goal: SUPERFAN_RIGHT,
    });
  });

  it("a completa ao terminar, a perfeita ao terminar perfeito", () => {
    const done = withSuperfanEnd(emptySave(), ARTIST, { done: true, perfect: false });
    expect(earned(done, "2026-10-20", [])).toEqual([completo?.id]);
    const perfect = withSuperfanEnd(done, ARTIST, { done: true, perfect: true });
    expect(earned(perfect, "2026-10-20", [])).toEqual([completo?.id, perfeito?.id]);
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
    expect(ids).toEqual(["sequencia-3", "jogos-5", superfanMedalId(ARTIST, "acertos")]);
    const seen = withSeenMedals(save, ["jogos-5"]);
    expect(unseenMedals(seen, ids)).toEqual(["sequencia-3", superfanMedalId(ARTIST, "acertos")]);
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

describe("medalBoard (o que a tela mostra, P286)", () => {
  it("a sequência, o total, as gerais e as 3 do Superfan de cada artista da lista, na ordem dela", () => {
    let save = withFinished(emptySave(), "2026-10-19|song", lost);
    save = withFinished(save, "2026-10-20|album", lost);
    save = withSuperfanEnd(rights(save, SUPERFAN_RIGHT), ARTIST, { done: true, perfect: false });
    // Um registro de um artista fora da lista: ele não aparece, e não entra no total.
    save = withArtistRight(save, "apple:ar:fora");
    const board = medalBoard(save, "2026-10-20", HITS, DEMO_MEDALS, ["apple:ar:2", ARTIST]);
    expect(board.streak).toEqual({ current: 2, best: 2 });
    expect(board.general.map((s) => [s.medal.id, s.earned, s.progress])).toEqual([
      ["demo-primeiro", true, null],
      ["demo-cinco", false, { value: 2, goal: 5 }],
      ["demo-sequencia", false, { value: 2, goal: 3 }],
    ]);
    expect(board.superfan.map((row) => row.artistId)).toEqual(["apple:ar:2", ARTIST]);
    expect(board.superfan[1]?.cells.map((c) => [c.level, c.state.earned])).toEqual([
      ["acertos", true],
      ["completo", true],
      ["perfeito", false],
    ]);
    expect(board.total).toBe(3 + 2 * 3);
    expect(board.earned).toBe(1 + 2);
  });
});

describe("noticeTab: as telas calmas (P288)", () => {
  it("as telas de escolha e as de leitura, e nunca um jogo nem os Artistas (que o App decide)", () => {
    const calm = (Object.keys(ROUTES) as Tab[]).filter(noticeTab);
    expect(calm.sort()).toEqual(
      [
        "about",
        "anime",
        "anime-musica",
        "anime-titulo",
        "hits",
        "history",
        "home",
        "medals",
      ].sort(),
    );
  });
});

describe("claimMedals e claimTier: reivindicar antes de mostrar (P281, P288)", () => {
  const acertos = superfanMedalId(ARTIST, "acertos");
  const completo = superfanMedalId(ARTIST, "completo");
  const general: readonly Medal[] = EXAMPLES;

  it("marca as novas como avisadas, e a 2ª reivindicação devolve o mesmo save, sem nenhuma", () => {
    const save = rights(emptySave(), SUPERFAN_RIGHT);
    const claim = claimMedals(save, "2026-10-20", HITS, general);
    expect(claim.claimed).toEqual([acertos]);
    expect(claim.first).toBe(false);
    expect(claim.save.seenMedals).toEqual([acertos]);
    const again = claimMedals(claim.save, "2026-10-20", HITS, general);
    expect(again.claimed).toEqual([]);
    expect(again.save).toBe(claim.save);
    expect(claimTier(claim, medalsOf(save, general))).toBe("simple");
  });

  it("o 1º aviso de quem já jogava: duas ou mais de uma vez, com nada avisado antes, é o grande", () => {
    let save = emptySave();
    for (const date of days(10, 14)) save = withFinished(save, `${date}|song`, lost);
    const claim = claimMedals(save, "2026-10-14", HITS, general);
    expect(claim.claimed).toEqual(["sequencia-3", "jogos-5"]);
    expect(claim.first).toBe(true);
    expect(claimTier(claim, medalsOf(save, general))).toBe("major");
  });

  it("depois do 1º, a leva é do tamanho da maior; e uma só nunca é o 1º aviso", () => {
    const seen = withSeenMedals(rights(emptySave(), SUPERFAN_RIGHT), [acertos]);
    const done = withSuperfanEnd(seen, ARTIST, { done: true, perfect: false });
    const claim = claimMedals(done, "2026-10-20", HITS, general);
    expect(claim.claimed).toEqual([completo]);
    expect(claim.first).toBe(false);
    expect(claimTier(claim, medalsOf(done, general))).toBe("major");
    const one = claimMedals(rights(emptySave(), SUPERFAN_RIGHT), "2026-10-20", HITS, general);
    expect(one.first).toBe(false);
  });

  it("o já avisado que deixou de existir na lista não volta, e o save guarda a união", () => {
    const save = withSeenMedals(rights(emptySave(), SUPERFAN_RIGHT), ["demo-removida"]);
    const claim = claimMedals(save, "2026-10-20", HITS, general);
    expect(claim.claimed).toEqual([acertos]);
    expect(claim.save.seenMedals).toEqual(["demo-removida", acertos].sort());
  });
});
