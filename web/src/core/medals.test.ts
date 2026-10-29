import { describe, expect, it } from "vitest";
import { ANIME_KEYS, DAILY_KEYS } from "./daily.ts";
import {
  ANIME_DAY,
  allWon,
  claimMedals,
  claimTier,
  DEMO_MEDALS,
  earnedMedals,
  GENERAL_GOALS,
  HITS_DAY,
  MEDAL_BLOCKS,
  MEDALS,
  type Medal,
  MIXED_DAY,
  medalBoard,
  medalContext,
  medalsOf,
  noticeTab,
  perfectGame,
  QUIZ_GOALS,
  quizAllFast,
  quizClean,
  quizLastLife,
  SUPERFAN_RIGHT,
  superfanMedalId,
  superfanMedals,
  unseenMedals,
  WHOLE_DAY,
} from "./medals.ts";
import { MIXED_KEYS, type MixedGame, type MixedRoundRecord, withMixedFinished } from "./mixed.ts";
import { Mulberry32 } from "./prng.ts";
import { type QuizGame, quizId, withQuizFinished } from "./quiz.ts";
import {
  emptySave,
  type FinishedGame,
  type RoundRecord,
  type Save,
  withArtistRight,
  withFinished,
  withPracticeRight,
  withSeenMedals,
  withSuperfanEnd,
} from "./records.ts";
import { ROUTES, type Tab } from "./routes.ts";
import { MODES } from "./rules.ts";

const ARTIST = "apple:ar:1489581870";
const lost: FinishedGame = { number: 1, rounds: [{ status: "lost", stage: 0, attempts: [] }] };
const WON_0: RoundRecord = { status: "won", stage: 0, attempts: ["right"] };
const WON_2: RoundRecord = { status: "won", stage: 2, attempts: ["skip", "skip", "right"] };
const WON_HELP: RoundRecord = { status: "won", stage: 0, attempts: ["right"], help: 0 };
const VOIDED: RoundRecord = { status: "void", stage: 0, attempts: [] };
/** Um diário das Misturadas com todas as músicas achadas no 1º trecho. */
const MIXED_RUN: MixedGame = {
  number: 1,
  rounds: [{ status: "done", found: [{ stage: 0 }, { stage: 0 }] }],
};
const game = (...rounds: RoundRecord[]): FinishedGame => ({ number: 1, rounds });
/** Perfeito: as 3 em 1 s, sem ajuda (P310). */
const perfect = game(WON_0, WON_0, WON_0);
/** Todas acertadas, uma com ajuda e uma no trecho 3 (P311). */
const helped = game(WON_0, WON_HELP, WON_2);
const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, "0")}`);
const HITS = days(8, 29);

/**
 * Gerais de exemplo, com limites fáceis, para as listas exatas; as propriedades (o progresso, o
 * "nunca some") valem também para as reais (`MEDALS`, P310).
 */
const EXAMPLES: readonly Medal[] = [
  { id: "sequencia-3", block: "gerais", tier: "simple", earned: (ctx) => ctx.streak.best >= 3 },
  {
    id: "jogos-5",
    block: "gerais",
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
const earned = (save: Save, today = "2026-10-20", general = EXAMPLES) =>
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

describe("as gerais (P310)", () => {
  const TODAY = "2026-10-29";
  const LOST: RoundRecord = { status: "lost", stage: 0, attempts: [] };
  const ids = (save: Save) => earnedMedals(MEDALS, medalContext(save, TODAY, HITS));
  const has = (save: Save, id: string) => ids(save).includes(id);
  const byId = (id: string) => MEDALS.find((m) => m.id === id);
  const ctx = (save: Save, hits: readonly string[] = HITS) => medalContext(save, TODAY, hits);
  /** Os diários de `keys` terminados na data, com o mesmo resultado. */
  const play = (save: Save, date: string, keys: readonly string[], result: FinishedGame) =>
    keys.reduce((s, key) => withFinished(s, `${date}|${key}`, result), save);
  const DAY = "2026-10-20";

  it("34 (as 4 das Misturadas desde a ME123; a Hora Extra e as 16 do quiz desde o M20), com ids únicos e sem a barra das do Superfan; as grandes no fim da lista", () => {
    const list = MEDALS.map((m) => m.id);
    expect(new Set(list).size).toBe(34);
    // A ordem da lista é a dos avisos: as 17 de antes na mesma ordem relativa, as pequenas
    // novas depois das pequenas, e as grandes novas no fim.
    expect(list).toEqual([
      "diario-1",
      "um-segundo",
      "hits-todos",
      "anime-todos",
      "misturadas-rodada",
      "seguidos-7",
      "oito-diarios",
      "treino-100",
      "diarios-50",
      "misturadas-seguidos-15",
      "colecionador",
      "onze-diarios",
      "quiz-1",
      "quiz-rodada-10",
      "quiz-rodada-25",
      "quiz-especial-15",
      "quiz-sem-erro-15",
      "quiz-ultima-vida",
      "quiz-pontos-50",
      "quiz-tres-segundos",
      "quiz-seguidos-15",
      "quiz-acertos-300",
      "quiz-perguntas-6",
      "quiz-42",
      "hits-perfeito",
      "anime-perfeito",
      "misturadas-perfeito",
      "misturadas-acertos-7",
      "superfan-completo",
      "seguidos-30",
      "quiz-rodada-50",
      "quiz-sem-erro-30",
      "quiz-pontos-120",
      "quiz-rodada-15-seguidos-7",
    ]);
    expect(list.filter((id) => id.includes("|"))).toEqual([]);
    expect(MEDALS.filter((m) => m.tier === "major").map((m) => m.id)).toEqual([
      "hits-perfeito",
      "anime-perfeito",
      "misturadas-perfeito",
      "misturadas-acertos-7",
      "superfan-completo",
      "seguidos-30",
      "quiz-rodada-50",
      "quiz-sem-erro-30",
      "quiz-pontos-120",
      "quiz-rodada-15-seguidos-7",
    ]);
    expect(MEDALS.slice(-10).every((m) => m.tier === "major")).toBe(true);
  });

  it("os blocos da tela (o usuário, 28/10/2026): cada uma no dela, as pequenas antes das grandes", () => {
    const byBlock = Object.fromEntries(
      MEDAL_BLOCKS.map((block) => [
        block,
        MEDALS.filter((m) => m.block === block).map((m) => m.id),
      ]),
    );
    expect(byBlock).toEqual({
      // As duas dos artistas (o Colecionador e o Superfan) também ficam nas gerais.
      gerais: [
        "diario-1",
        "um-segundo",
        "seguidos-7",
        "oito-diarios",
        "diarios-50",
        "colecionador",
        "onze-diarios",
        "superfan-completo",
        "seguidos-30",
      ],
      hits: ["hits-todos", "treino-100", "hits-perfeito"],
      anime: ["anime-todos", "anime-perfeito"],
      misturadas: [
        "misturadas-rodada",
        "misturadas-seguidos-15",
        "misturadas-perfeito",
        "misturadas-acertos-7",
      ],
      quiz: [
        "quiz-1",
        "quiz-rodada-10",
        "quiz-rodada-25",
        "quiz-especial-15",
        "quiz-sem-erro-15",
        "quiz-ultima-vida",
        "quiz-pontos-50",
        "quiz-tres-segundos",
        "quiz-seguidos-15",
        "quiz-acertos-300",
        "quiz-perguntas-6",
        "quiz-42",
        "quiz-rodada-50",
        "quiz-sem-erro-30",
        "quiz-pontos-120",
        "quiz-rodada-15-seguidos-7",
      ],
      artistas: [],
    });
    // Nenhuma pequena depois da 1ª grande do bloco (P310).
    for (const block of MEDAL_BLOCKS) {
      const tiers = MEDALS.filter((m) => m.block === block).map((m) => m.tier);
      const firstMajor = tiers.indexOf("major");
      const late = firstMajor === -1 ? [] : tiers.slice(firstMajor).filter((t) => t === "simple");
      expect(late, block).toEqual([]);
    }
    // As 3 do Superfan de cada artista ficam no bloco dos Artistas.
    expect(superfanMedals("apple:ar:1").map((m) => m.block)).toEqual([
      "artistas",
      "artistas",
      "artistas",
    ]);
  });

  it("os diários das do mesmo dia são, hoje, os do jogo; congelados, um diário novo não as muda", () => {
    expect([...HITS_DAY]).toEqual([...MODES]);
    expect([...ANIME_DAY]).toEqual([...ANIME_KEYS]);
    expect([...WHOLE_DAY]).toEqual([...DAILY_KEYS]);
    expect([...MIXED_DAY]).toEqual([...MIXED_KEYS]);
  });

  it("perfectGame e allWon: pela forma das rodadas, e a anulada não é acerto (P45)", () => {
    expect(perfectGame(perfect)).toBe(true);
    expect(perfectGame(game(WON_0, WON_0, WON_2))).toBe(false);
    expect(perfectGame(game(WON_0, WON_HELP, WON_0))).toBe(false);
    expect(perfectGame(game(WON_0, VOIDED, WON_0))).toBe(false);
    expect(perfectGame(game())).toBe(false);
    expect(allWon(helped)).toBe(true);
    expect(allWon(game(WON_0, VOIDED, WON_0))).toBe(false);
    expect(allWon(lost)).toBe(false);
    expect(allWon(game())).toBe(false);
  });

  it("nada com o save vazio, nem com o jogado depois (P263)", () => {
    expect(ids(emptySave())).toEqual([]);
    expect(ids(play(emptySave(), DAY, DAILY_KEYS, { ...perfect, late: true }))).toEqual([]);
  });

  it("Primeiro Acorde e Relâmpago: um diário no dia; uma rodada em 1 s, sem ajuda", () => {
    expect(ids(play(emptySave(), DAY, ["song"], lost))).toEqual(["diario-1"]);
    expect(ids(play(emptySave(), DAY, ["song"], game(WON_2, WON_HELP)))).toEqual(["diario-1"]);
    expect(ids(play(emptySave(), DAY, ["album"], game(LOST, WON_0)))).toEqual([
      "diario-1",
      "um-segundo",
    ]);
  });

  it("Dia de Hit e Hit Perfeito: os 2 dos Hits no mesmo dia; com a ajuda, só o Dia de Hit", () => {
    expect(has(play(emptySave(), DAY, ["song"], perfect), "hits-todos")).toBe(false);
    const split = play(play(emptySave(), DAY, ["song"], perfect), "2026-10-21", ["album"], perfect);
    expect(has(split, "hits-todos")).toBe(false);
    const withHelp = play(emptySave(), DAY, ["album", "song"], helped);
    expect([has(withHelp, "hits-todos"), has(withHelp, "hits-perfeito")]).toEqual([true, false]);
    const both = play(emptySave(), DAY, ["album", "song"], perfect);
    expect([has(both, "hits-todos"), has(both, "hits-perfeito")]).toEqual([true, true]);
    const voided = play(emptySave(), DAY, ["album", "song"], game(WON_0, VOIDED, WON_0));
    expect([has(voided, "hits-todos"), has(voided, "hits-perfeito")]).toEqual([false, false]);
    // O Anime não entra nas dos Hits.
    expect(has(play(emptySave(), DAY, ANIME_KEYS, perfect), "hits-todos")).toBe(false);
  });

  it("Pare de falar em tocar grama e Sensei: os 6 do Anime no mesmo dia; 5 não bastam", () => {
    const five = play(emptySave(), DAY, ANIME_KEYS.slice(0, 5), perfect);
    expect([has(five, "anime-todos"), has(five, "anime-perfeito")]).toEqual([false, false]);
    const six = play(emptySave(), DAY, ANIME_KEYS, helped);
    expect([has(six, "anime-todos"), has(six, "anime-perfeito")]).toEqual([true, false]);
    const sixPerfect = play(emptySave(), DAY, ANIME_KEYS, perfect);
    expect([has(sixPerfect, "anime-todos"), has(sixPerfect, "anime-perfeito")]).toEqual([
      true,
      true,
    ]);
  });

  it("Maratonista: os 8 diários no mesmo dia, ganhos ou não; 7 não bastam", () => {
    expect(has(play(emptySave(), DAY, DAILY_KEYS.slice(1), lost), "oito-diarios")).toBe(false);
    expect(has(play(emptySave(), DAY, DAILY_KEYS, lost), "oito-diarios")).toBe(true);
  });

  it(`Em Chamas e Tá pegando fogo: ${GENERAL_GOALS.streakShort} e ${GENERAL_GOALS.streakLong} dias seguidos, com o progresso`, () => {
    // 31 dias da agenda, até hoje: de 29/09 a 29/10.
    const dates = Array.from({ length: 31 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10),
    );
    const at = (n: number) =>
      ctx(
        dates.slice(0, n).reduce((s, d) => withFinished(s, `${d}|song`, lost), emptySave()),
        dates,
      );
    const short = byId("seguidos-7");
    const long = byId("seguidos-30");
    expect(short?.earned(at(6))).toBe(false);
    expect(short?.progress?.(at(6))).toEqual({ value: 6, goal: 7 });
    expect(short?.earned(at(7))).toBe(true);
    expect(long?.earned(at(29))).toBe(false);
    expect(long?.progress?.(at(29))).toEqual({ value: 29, goal: 30 });
    expect(long?.earned(at(30))).toBe(true);
    expect(long?.progress?.(at(31))).toEqual({ value: 30, goal: 30 });
  });

  it(`Saco de Pancadas: ${GENERAL_GOALS.practice} acertos no Treino (P308)`, () => {
    const at = (n: number) => ctx({ ...emptySave(), practiceRight: n });
    const bag = byId("treino-100");
    expect(bag?.earned(at(99))).toBe(false);
    expect(bag?.progress?.(at(99))).toEqual({ value: 99, goal: 100 });
    expect(bag?.earned(at(100))).toBe(true);
  });

  it(`Já É de Casa: ${GENERAL_GOALS.dailies} diários no dia, sem o jogado depois`, () => {
    let save = emptySave();
    for (const date of days(1, 24)) save = play(save, date, ["album", "song"], lost);
    save = withFinished(save, "2026-10-25|album", lost);
    const home = byId("diarios-50");
    const late = withFinished(save, "2026-10-25|song", { ...lost, late: true });
    expect(home?.earned(ctx(late))).toBe(false);
    expect(home?.progress?.(ctx(late))).toEqual({ value: 49, goal: 50 });
    expect(home?.earned(ctx(withFinished(save, "2026-10-25|song", lost)))).toBe(true);
  });

  it(`Colecionador: ${GENERAL_GOALS.collector} artistas com ${SUPERFAN_RIGHT} acertos; o de ${SUPERFAN_RIGHT - 1} não conta`, () => {
    let save = emptySave();
    for (const n of [1, 2, 3, 4, 5]) {
      const goal = n === 5 ? SUPERFAN_RIGHT - 1 : SUPERFAN_RIGHT;
      for (let i = 0; i < goal; i++) save = withArtistRight(save, `apple:ar:${n}`);
    }
    const collector = byId("colecionador");
    expect(collector?.earned(ctx(save))).toBe(false);
    expect(collector?.progress?.(ctx(save))).toEqual({ value: 4, goal: 5 });
    expect(collector?.earned(ctx(withArtistRight(save, "apple:ar:5")))).toBe(true);
  });

  it("Superfan: terminar a partida de qualquer artista; os acertos, não", () => {
    const right = withArtistRight(emptySave(), ARTIST);
    expect(has(right, "superfan-completo")).toBe(false);
    const done = withSuperfanEnd(right, ARTIST, { done: true, perfect: false });
    expect(has(done, "superfan-completo")).toBe(true);
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
      // O quiz e as Misturadas (M20): as medalhas com progresso deles também.
      save = withQuizFinished(save, quizId(date), {
        number: 1,
        results: `${"r".repeat(15 + i)}www`,
        points: 4 * (15 + i),
        family: ["ano", "nota", "tema", "amq", "fonte", "rotulo", "playlists"][i % 7],
      });
      save = withMixedFinished(save, `${date}|misturadas-musica`, MIXED_RUN);
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
  it("jogar, avançar o hoje, crescer a agenda, acertar e terminar partidas, em qualquer ordem, só acrescenta", () => {
    const random = new Mulberry32(20261022);
    const artists = [ARTIST, "apple:ar:2", "fixture:ar:ar01"];
    let save = emptySave();
    let today = 8;
    // A agenda dos Hits cresce só no fim, uns dias à frente de hoje (P44), como a do robô.
    let scheduleEnd = 12;
    let before = new Set<string>();
    // Os jogos possíveis: perdido, perfeito, todo acertado com ajuda e com uma rodada anulada.
    const games = [lost, perfect, helped, { number: 1, rounds: [WON_0, VOIDED, WON_0] }];
    // As runs do quiz (M20): curta, longa e perfeita, na última vida, de especial e sem a
    // família (de antes da v14).
    const runs: QuizGame[] = [
      { number: 1, results: "www" },
      { number: 1, results: `${"r".repeat(27)}www`, points: 100, family: "tema" },
      { number: 1, results: "r".repeat(50), points: 200, family: "ano" },
      { number: 1, results: `rrwrw${"r".repeat(10)}w`, points: 30, family: "nota" },
      { number: 1, results: `${"r".repeat(16)}www`, points: 64, family: "ano_x" },
    ];
    for (let step = 0; step < 600; step++) {
      const date = `2026-10-${String(today).padStart(2, "0")}`;
      const artist = artists[random.randint(artists.length)] ?? ARTIST;
      const key = DAILY_KEYS[random.randint(DAILY_KEYS.length)] ?? "song";
      const game = games[random.randint(games.length)] ?? lost;
      const run = runs[random.randint(runs.length)] ?? { number: 1, results: "w" };
      const mixedKey = MIXED_KEYS[random.randint(MIXED_KEYS.length)] ?? "misturadas-musica";
      switch (random.randint(10)) {
        case 0:
        case 1:
          save = withFinished(save, `${date}|${key}`, game);
          break;
        case 2:
          if (today < 29) today++;
          if (scheduleEnd < today + 3 && scheduleEnd < 31) scheduleEnd++;
          break;
        case 3:
          save = withArtistRight(save, artist);
          break;
        case 4:
          save = withSuperfanEnd(save, artist, {
            done: random.randint(2) === 1,
            perfect: random.randint(4) === 1,
          });
          break;
        case 5:
          save = withPracticeRight(save);
          break;
        case 6:
          save = withQuizFinished(save, quizId(date), run);
          break;
        case 7:
          // O jogado depois do quiz (pelo Histórico) não conta.
          save = withQuizFinished(save, quizId(date), { ...run, late: true });
          break;
        case 8:
          save = withMixedFinished(save, `${date}|${mixedKey}`, MIXED_RUN);
          break;
        default:
          save = withFinished(save, `${date}|${key}`, { ...game, late: true });
      }
      const now = new Set(
        earnedMedals(
          medalsOf(save, GENERAL),
          medalContext(save, `2026-10-${String(today).padStart(2, "0")}`, days(8, scheduleEnd)),
        ),
      );
      for (const id of before) expect(now.has(id), `${id} sumiu no passo ${step}`).toBe(true);
      before = now;
    }
    expect(before.size).toBeGreaterThan(8);
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
    // Só os blocos com medalha, e sempre o dos Artistas (o usuário, 28/10/2026).
    expect(board.blocks.map((v) => [v.block, v.earned, v.total])).toEqual([
      ["gerais", 1, 3],
      ["artistas", 2, 6],
    ]);
    const [gerais, artists] = board.blocks;
    expect(gerais?.general.map((s) => [s.medal.id, s.earned, s.progress])).toEqual([
      ["demo-primeiro", true, null],
      ["demo-cinco", false, { value: 2, goal: 5 }],
      ["demo-sequencia", false, { value: 2, goal: 3 }],
    ]);
    expect(gerais?.artists).toEqual([]);
    expect(artists?.general).toEqual([]);
    expect(artists?.artists.map((row) => row.artistId)).toEqual(["apple:ar:2", ARTIST]);
    expect(artists?.artists[1]?.cells.map((c) => [c.level, c.state.earned])).toEqual([
      ["acertos", true],
      ["completo", true],
      ["perfeito", false],
    ]);
    expect(board.total).toBe(3 + 2 * 3);
    expect(board.earned).toBe(1 + 2);
  });

  it("com as reais: os blocos na ordem da tela, sem o vazio, e os Artistas só com as do Superfan", () => {
    const save = withSuperfanEnd(rights(emptySave(), SUPERFAN_RIGHT), ARTIST, {
      done: true,
      perfect: false,
    });
    const board = medalBoard(save, "2026-10-20", HITS, MEDALS, [ARTIST]);
    expect(board.blocks.map((v) => [v.block, v.earned, v.total])).toEqual([
      // O Superfan completo é geral (o usuário, 28/10/2026).
      ["gerais", 1, 9],
      ["hits", 0, 3],
      ["anime", 0, 2],
      ["misturadas", 0, 4],
      ["quiz", 0, 16],
      // A dos acertos e a completa do artista, das 3 dele.
      ["artistas", 2, 3],
    ]);
    expect(board.blocks.at(-1)?.general).toEqual([]);
    expect(board.total).toBe(MEDALS.length + 3);
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
        "misturadas",
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

  it("quem começa hoje e ganha duas de uma vez não recebe o texto de quem já jogava (P314)", () => {
    const today = withFinished(rights(emptySave(), SUPERFAN_RIGHT), "2026-10-20|song", lost);
    const claim = claimMedals(today, "2026-10-20", HITS, MEDALS);
    expect(claim.claimed).toEqual(["diario-1", acertos]);
    expect(claim.first).toBe(false);
    // Com um jogo de um dia antes, é quem já jogava.
    const before = withFinished(today, "2026-10-19|album", lost);
    expect(claimMedals(before, "2026-10-20", HITS, MEDALS).first).toBe(true);
  });

  it("o já avisado que deixou de existir na lista não volta, e o save guarda a união", () => {
    const save = withSeenMedals(rights(emptySave(), SUPERFAN_RIGHT), ["demo-removida"]);
    const claim = claimMedals(save, "2026-10-20", HITS, general);
    expect(claim.claimed).toEqual([acertos]);
    expect(claim.save.seenMedals).toEqual(["demo-removida", acertos].sort());
  });
});

describe("as das Misturadas (ME123)", () => {
  const TODAY = "2026-10-29";
  const has = (save: Save, id: string) =>
    earnedMedals(MEDALS, medalContext(save, TODAY, HITS)).includes(id);
  const byId = (id: string) => MEDALS.find((m) => m.id === id);
  const ctx = (save: Save) => medalContext(save, TODAY, HITS);
  const ALL_0: MixedRoundRecord = { status: "done", found: [{ stage: 0 }, { stage: 0 }] };
  const ALL_LATE: MixedRoundRecord = { status: "done", found: [{ stage: 3 }, { stage: 1 }] };
  const HELPED: MixedRoundRecord = {
    status: "done",
    found: [{ stage: 0, help: true }, { stage: 0 }],
  };
  const MISSED: MixedRoundRecord = { status: "done", found: [{ stage: 0 }, null] };
  const VOID: MixedRoundRecord = { status: "void", found: [null, null] };
  const mixed = (...rounds: MixedRoundRecord[]): MixedGame => ({ number: 1, rounds });
  const perfectDay = mixed(ALL_0, ALL_0, ALL_0, {
    status: "done",
    found: [{ stage: 0 }, { stage: 0 }, { stage: 0 }],
  });
  const allFound = mixed(ALL_0, ALL_LATE, HELPED, ALL_0);
  const missed = mixed(ALL_0, MISSED, ALL_0, ALL_0);
  const play = (save: Save, date: string, key: string, game: MixedGame) =>
    withMixedFinished(save, `${date}|${key}`, game);

  it("Tudo Junto e Misturado: uma rodada com todas achadas, em qualquer trecho e com o Separar", () => {
    expect(
      has(
        play(emptySave(), "2026-10-24", "misturadas-musica", mixed(MISSED, VOID, MISSED, MISSED)),
        "misturadas-rodada",
      ),
    ).toBe(false);
    expect(
      has(
        play(emptySave(), "2026-10-24", "misturadas-musica", mixed(MISSED, HELPED, MISSED, MISSED)),
        "misturadas-rodada",
      ),
    ).toBe(true);
    expect(has(emptySave(), "misturadas-rodada")).toBe(false);
  });

  it("Pode juntar mais uma: os 2 diários do mesmo dia perfeitos; um só, ou com o Separar, não basta", () => {
    const one = play(emptySave(), "2026-10-24", "misturadas-musica", perfectDay);
    expect(has(one, "misturadas-perfeito")).toBe(false);
    const both = play(one, "2026-10-24", "misturadas-titulo", perfectDay);
    expect(has(both, "misturadas-perfeito")).toBe(true);
    // O outro diário em outro dia não junta.
    expect(
      has(play(one, "2026-10-25", "misturadas-titulo", perfectDay), "misturadas-perfeito"),
    ).toBe(false);
    // Uma música achada no 2º trecho, ou com o Separar, ou uma anulada: não é perfeito.
    for (const round of [ALL_LATE, HELPED, VOID]) {
      const off = play(one, "2026-10-24", "misturadas-titulo", mixed(ALL_0, ALL_0, ALL_0, round));
      expect(has(off, "misturadas-perfeito"), JSON.stringify(round)).toBe(false);
    }
  });

  it(`Harmonia no Caos: ${GENERAL_GOALS.mixedAllFound} dias seguidos com 1 diário de todas achadas (basta um dos dois), com o progresso`, () => {
    const from = 20;
    const at = (n: number, game = allFound) =>
      days(from, from + n - 1).reduce(
        (s, date, i) => play(s, date, i % 2 ? "misturadas-musica" : "misturadas-titulo", game),
        emptySave(),
      );
    const medal = byId("misturadas-acertos-7");
    expect(medal?.earned(ctx(at(6)))).toBe(false);
    expect(medal?.progress?.(ctx(at(6)))).toEqual({ value: 6, goal: 7 });
    expect(medal?.earned(ctx(at(7)))).toBe(true);
    // Um dia no meio (23/10, o do musica) sem nenhum diário de todas achadas quebra a sequência.
    const save = at(7);
    const finished = { ...save.mixed.finished, "2026-10-23|misturadas-musica": missed };
    const broken: Save = { ...save, mixed: { ...save.mixed, finished } };
    expect(medal?.earned(ctx(broken))).toBe(false);
    // O outro diário do mesmo dia, com todas achadas, refaz a sequência: basta um dos dois.
    const fixed = play(broken, "2026-10-23", "misturadas-titulo", allFound);
    expect(medal?.earned(ctx(fixed))).toBe(true);
  });

  it(`DJ Residente: ${GENERAL_GOALS.mixedPlayed} dias seguidos com 1 diário terminado, qualquer resultado`, () => {
    const at = (n: number) =>
      days(10, 10 + n - 1).reduce(
        (s, date) => play(s, date, "misturadas-musica", missed),
        emptySave(),
      );
    const medal = byId("misturadas-seguidos-15");
    expect(medal?.earned(ctx(at(14)))).toBe(false);
    expect(medal?.progress?.(ctx(at(14)))).toEqual({ value: 14, goal: 15 });
    expect(medal?.earned(ctx(at(15)))).toBe(true);
  });

  it("um terminado com data depois de hoje não conta", () => {
    const later = play(emptySave(), "2026-10-30", "misturadas-musica", allFound);
    expect(has(later, "misturadas-rodada")).toBe(false);
  });
});

describe("as do quiz (M20, o usuário, 28/10/2026)", () => {
  const TODAY = "2026-10-29";
  const ctx = (save: Save, hits: readonly string[] = HITS) => medalContext(save, TODAY, hits);
  const has = (save: Save, id: string) => earnedMedals(MEDALS, ctx(save)).includes(id);
  const byId = (id: string) => MEDALS.find((m) => m.id === id);
  const run = (results: string, extra: Partial<QuizGame> = {}): QuizGame => ({
    number: 1,
    results,
    ...extra,
  });
  const play = (save: Save, date: string, game: QuizGame) =>
    withQuizFinished(save, quizId(date), game);
  const one = (game: QuizGame, date = "2026-10-24") => play(emptySave(), date, game);
  /** Chega à rodada `n`: os acertos e, no fim, o 3º erro. */
  const reach = (n: number, extra: Partial<QuizGame> = {}) => run(`${"r".repeat(n - 3)}www`, extra);
  const noRounds = { number: 1, rounds: [] } as const;

  it("Insert Coin: a run terminada no dia; a jogada depois e a de depois de hoje não contam", () => {
    expect(has(emptySave(), "quiz-1")).toBe(false);
    expect(has(one(run("www")), "quiz-1")).toBe(true);
    expect(has(one(run("www", { late: true })), "quiz-1")).toBe(false);
    expect(has(one(run("www"), "2026-10-30"), "quiz-1")).toBe(false);
  });

  it.each([
    ["quiz-rodada-10", QUIZ_GOALS.tutorial],
    ["quiz-rodada-25", QUIZ_GOALS.plusUltra],
    ["quiz-rodada-50", QUIZ_GOALS.opus],
  ])("%s: chegar à rodada %i (a anterior não basta)", (id, n) => {
    expect(has(one(reach(n - 1)), id)).toBe(false);
    expect(has(one(reach(n)), id)).toBe(true);
  });

  it("Edição Especial: a rodada 15 num especial; outra pergunta, ou a run sem ela (antes da v14), não", () => {
    expect(has(one(reach(15, { family: "ano_x" })), "quiz-especial-15")).toBe(true);
    expect(has(one(reach(15, { family: "estudio" })), "quiz-especial-15")).toBe(true);
    expect(has(one(reach(14, { family: "ano_x" })), "quiz-especial-15")).toBe(false);
    expect(has(one(reach(15, { family: "ano" })), "quiz-especial-15")).toBe(false);
    expect(has(one(reach(15)), "quiz-especial-15")).toBe(false);
  });

  it("Sem um Arranhão e Kami: as 15 (e as 30) primeiras sem erro; a anulada não é erro", () => {
    expect(quizClean(run(`${"r".repeat(14)}v`), 15)).toBe(true);
    expect(quizClean(run(`${"r".repeat(14)}w`), 15)).toBe(false);
    expect(quizClean(run("r".repeat(14)), 15)).toBe(false);
    expect(has(one(run(`${"r".repeat(15)}www`)), "quiz-sem-erro-15")).toBe(true);
    expect(has(one(run(`${"r".repeat(15)}www`)), "quiz-sem-erro-30")).toBe(false);
    expect(has(one(run(`${"r".repeat(29)}vwww`)), "quiz-sem-erro-30")).toBe(true);
  });

  it("Só acaba quando acabar...: 10 seguidas depois do 2º erro; a anulada não quebra nem soma", () => {
    expect(quizLastLife(run(`rrwrw${"r".repeat(10)}w`))).toBe(10);
    expect(quizLastLife(run(`rrwrw${"r".repeat(5)}v${"r".repeat(5)}w`))).toBe(10);
    expect(quizLastLife(run(`rrwrw${"r".repeat(9)}w`))).toBe(9);
    // As 10 antes do 2º erro não são na última vida.
    expect(quizLastLife(run(`${"r".repeat(10)}ww`))).toBe(0);
    expect(quizLastLife(run("r".repeat(20)))).toBe(0);
    expect(has(one(run(`rrwrw${"r".repeat(10)}w`)), "quiz-ultima-vida")).toBe(true);
    expect(has(one(run(`rrwrw${"r".repeat(9)}w`)), "quiz-ultima-vida")).toBe(false);
  });

  it("Ouvido Afiado e Absoluto: 50 e 120 pontos numa run; a run sem pontos (v12) não conta", () => {
    expect(has(one(run("rrw", { points: 49 })), "quiz-pontos-50")).toBe(false);
    expect(has(one(run("rrw", { points: 50 })), "quiz-pontos-50")).toBe(true);
    expect(has(one(run("rrw", { points: 119 })), "quiz-pontos-120")).toBe(false);
    expect(has(one(run("rrw", { points: 120 })), "quiz-pontos-120")).toBe(true);
    expect(has(one(run("r".repeat(40))), "quiz-pontos-50")).toBe(false);
  });

  it("Três Segundos de Fama: 10 acertos ou mais, todos em 3 s (4 pontos cada); sem pontos, não", () => {
    const ten = `${"r".repeat(10)}www`;
    expect(has(one(run(ten, { points: 40 })), "quiz-tres-segundos")).toBe(true);
    expect(has(one(run(ten, { points: 39 })), "quiz-tres-segundos")).toBe(false);
    const nine = run(`${"r".repeat(9)}www`, { points: 36 });
    expect(has(one(nine), "quiz-tres-segundos")).toBe(false);
    expect(has(one(run(ten)), "quiz-tres-segundos")).toBe(false);
    expect(quizAllFast(run("www", { points: 0 }))).toBe(true);
  });

  it(`Freguês e Ritmo Constante: ${QUIZ_GOALS.played} dias seguidos com o quiz, e ${QUIZ_GOALS.steadyDays} chegando à rodada 15, com o progresso`, () => {
    const hits = days(1, 29);
    const streak = (n: number, game: QuizGame) =>
      days(1, n).reduce((save, date) => play(save, date, game), emptySave());
    const fregues = byId("quiz-seguidos-15");
    expect(fregues?.progress?.(ctx(streak(14, run("www")), hits))).toEqual({
      value: 14,
      goal: 15,
    });
    expect(fregues?.earned(ctx(streak(15, run("www")), hits))).toBe(true);
    const ritmo = byId("quiz-rodada-15-seguidos-7");
    expect(ritmo?.earned(ctx(streak(7, reach(14)), hits))).toBe(false);
    expect(ritmo?.earned(ctx(streak(7, reach(15)), hits))).toBe(true);
    expect(ritmo?.progress?.(ctx(streak(6, reach(15)), hits))).toEqual({ value: 6, goal: 7 });
  });

  it("Enciclopédia de Anisong: os acertos de todas as runs somados, com o progresso", () => {
    const full = run("r".repeat(50));
    const five = days(1, 5).reduce((save, date) => play(save, date, full), emptySave());
    const almost = play(five, "2026-10-06", run(`${"r".repeat(49)}w`));
    expect(byId("quiz-acertos-300")?.progress?.(ctx(almost))).toEqual({ value: 299, goal: 300 });
    expect(has(almost, "quiz-acertos-300")).toBe(false);
    expect(has(play(five, "2026-10-06", full), "quiz-acertos-300")).toBe(true);
  });

  it("Sabe-Tudo: a rodada 15 em 6 perguntas diferentes; a mesma não soma, e a run sem a família não conta", () => {
    const families = ["ano", "nota", "membros", "playlists", "amq"];
    const five = families.reduce(
      (save, family, i) => play(save, `2026-10-0${i + 1}`, reach(15, { family })),
      emptySave(),
    );
    const medal = byId("quiz-perguntas-6");
    expect(medal?.progress?.(ctx(five))).toEqual({ value: 5, goal: 6 });
    const sixth = (game: QuizGame) => medal?.earned(ctx(play(five, "2026-10-07", game)));
    expect(sixth(reach(15, { family: "ano" }))).toBe(false);
    expect(sixth(reach(15))).toBe(false);
    expect(sixth(reach(14, { family: "tema" }))).toBe(false);
    expect(sixth(reach(15, { family: "tema" }))).toBe(true);
  });

  it("A Resposta: a run que acabou exatamente na rodada 42", () => {
    expect(has(one(reach(42)), "quiz-42")).toBe(true);
    expect(has(one(reach(41)), "quiz-42")).toBe(false);
    expect(has(one(reach(43)), "quiz-42")).toBe(false);
  });

  it("Primeiro Acorde e Já É de Casa: as Misturadas e o quiz também são diários; o jogado depois não", () => {
    expect(has(one(run("www")), "diario-1")).toBe(true);
    expect(has(one(run("www", { late: true })), "diario-1")).toBe(false);
    const mixedOnly = withMixedFinished(emptySave(), "2026-10-24|misturadas-musica", noRounds);
    expect(has(mixedOnly, "diario-1")).toBe(true);
    // 48 diários dos Hits, 1 das Misturadas e 1 quiz: 50.
    const hits = days(1, 24).reduce(
      (save, date) => withFinished(withFinished(save, `${date}|album`, lost), `${date}|song`, lost),
      emptySave(),
    );
    const fifty = play(
      withMixedFinished(hits, "2026-10-25|misturadas-musica", noRounds),
      "2026-10-25",
      run("www"),
    );
    expect(ctx(fifty).dailies).toBe(50);
    expect(has(fifty, "diarios-50")).toBe(true);
    // A sequência do topo e o 1º aviso continuam só com os diários dos Hits e do Anime.
    expect(ctx(fifty).games).toHaveLength(48);
  });

  it("Hora Extra: os 8 diários, os 2 das Misturadas e o quiz no mesmo dia; faltando um, não", () => {
    const DAY = "2026-10-24";
    const eight = WHOLE_DAY.reduce(
      (save, key) => withFinished(save, `${DAY}|${key}`, lost),
      emptySave(),
    );
    const ten = MIXED_DAY.reduce(
      (save, key) => withMixedFinished(save, `${DAY}|${key}`, noRounds),
      eight,
    );
    expect(has(ten, "onze-diarios")).toBe(false);
    expect(has(play(ten, DAY, run("www")), "onze-diarios")).toBe(true);
    // O quiz de outro dia não junta.
    expect(has(play(ten, "2026-10-25", run("www")), "onze-diarios")).toBe(false);
    const nine = withMixedFinished(eight, `${DAY}|misturadas-musica`, noRounds);
    expect(has(play(nine, DAY, run("www")), "onze-diarios")).toBe(false);
  });
});
