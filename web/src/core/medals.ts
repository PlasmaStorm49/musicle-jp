// As medalhas (M16, ME105). Calculadas do save a cada vez, como as estatísticas: o save só
// guarda o que não sai de outro lugar (as já avisadas, P281, e o modo por artista, P289). Toda
// conferência usa só o que cresce (o histórico, os terminados das Misturadas e do quiz, a agenda dos
// Hits, os registros dos artistas), para que uma medalha ganha nunca suma. O id vai para o save e nunca
// muda.
import type { MixedGame, MixedRoundRecord } from "./mixed.ts";
import { isQuizSpecial, type QuizGame, quizReached, quizRight } from "./quiz.ts";
import {
  type ArtistRecord,
  type FinishedGame,
  NO_ARTIST,
  type RoundRecord,
  type Save,
  withSeenMedals,
} from "./records.ts";
import type { Tab } from "./routes.ts";
import { type DayGame, dayGames, streaks } from "./stats.ts";

/** O tamanho do aviso (P279): o pequeno, que some sozinho, ou o pop-up grande. */
export type MedalTier = "simple" | "major";

/**
 * Os blocos da tela das Medalhas, na ordem dela (o usuário, 28/10/2026): as gerais, as de cada
 * modo e, no fim, os Artistas, com as 3 do Superfan de cada um. Só a tela os usa: o aviso e o save
 * não mudam.
 */
export const MEDAL_BLOCKS = ["gerais", "hits", "anime", "misturadas", "quiz", "artistas"] as const;
export type MedalBlock = (typeof MEDAL_BLOCKS)[number];

/** O que as conferências leem. */
export type MedalContext = {
  /** O "hoje" do jogo (`gameDate`). */
  readonly today: string;
  /** Os jogos que contam: terminados no próprio dia, até hoje (sem o jogado depois, P263). */
  readonly games: readonly DayGame[];
  /**
   * A sequência do topo das Medalhas (P282): dias seguidos com ao menos 1 dos 8 diários
   * terminado no dia, sobre a agenda dos Hits.
   */
  readonly streak: { readonly current: number; readonly best: number };
  /** O modo por artista, como está no save. */
  readonly artists: Readonly<Record<string, ArtistRecord>>;
  /** Os acertos do Treino (P308). */
  readonly practiceRight: number;
  /** Os jogos de cada data, pelo diário: os `games`, juntados para as do mesmo dia (P310). */
  readonly dates: ReadonlyMap<string, ReadonlyMap<string, FinishedGame>>;
  /**
   * As Misturadas (ME123): os terminados de cada data até hoje, pelo diário. Elas não têm o
   * jogado depois (não há Histórico): todo terminado é do próprio dia.
   */
  readonly mixed: ReadonlyMap<string, ReadonlyMap<string, MixedGame>>;
  /**
   * As sequências das Misturadas, sobre a agenda dos Hits, como a do topo: a melhor de dias com ao
   * menos 1 diário delas terminado (`played`), e a de dias com ao menos 1 de todas as músicas
   * achadas (`allFound`).
   */
  readonly mixedStreak: { readonly played: number; readonly allFound: number };
  /**
   * O quiz do dia (o usuário, 28/10/2026): as runs terminadas até hoje, na ordem das datas. A
   * jogada depois (pelo Histórico) fica fora, como nas Misturadas.
   */
  readonly quiz: readonly QuizRun[];
  /**
   * As sequências do quiz, sobre a agenda dos Hits, como a do topo: a melhor de dias com a run
   * terminada (`played`), e a de dias com a rodada 15 alcançada (`steady`).
   */
  readonly quizStreak: { readonly played: number; readonly steady: number };
  /**
   * Os diários terminados no dia, de todos os modos: os dos Hits e do Anime, os das Misturadas e o
   * quiz (o usuário, 28/10/2026). O `games` continua só com os dos Hits e do Anime: é dele que saem a
   * sequência do topo (P282), o Relâmpago e o 1º aviso (P314).
   */
  readonly dailies: number;
};

/** Uma run do quiz terminada no dia, com a data. */
export type QuizRun = { readonly date: string; readonly game: QuizGame };

/** Quanto falta (P283): "7 de 10". */
export type MedalProgress = { readonly value: number; readonly goal: number };

export type Medal = {
  readonly id: string;
  /** O bloco da tela em que ela aparece. */
  readonly block: MedalBlock;
  readonly tier: MedalTier;
  readonly earned: (ctx: MedalContext) => boolean;
  /** Só nas que se ganham aos poucos. Concorda com o `earned`: ganha, o valor chega à meta. */
  readonly progress?: (ctx: MedalContext) => MedalProgress;
};

/**
 * @param hitsDates os dias da agenda dos Hits (a do Anime carrega só sob demanda, P270, e nunca
 *   entra: uma medalha não pode depender de a pessoa ter aberto o Anime).
 */
export function medalContext(
  save: Save,
  today: string,
  hitsDates: readonly string[],
): MedalContext {
  const games = dayGames(save.history, today);
  const dates = new Map<string, Map<string, FinishedGame>>();
  for (const { date, daily, game } of games) {
    const day = dates.get(date) ?? new Map<string, FinishedGame>();
    dates.set(date, day.set(daily, game));
  }
  const mixed = new Map<string, Map<string, MixedGame>>();
  for (const [id, game] of Object.entries(save.mixed.finished)) {
    const [date = "", key = ""] = id.split("|");
    // O jogado depois (pelo Histórico) fica fora, como nos diários (o `dayGames`, P263).
    if (date > today || game.late) continue;
    const day = mixed.get(date) ?? new Map<string, MixedGame>();
    mixed.set(date, day.set(key, game));
  }
  const mixedDays = (test: (game: MixedGame) => boolean) =>
    new Set([...mixed].filter(([, day]) => [...day.values()].some(test)).map(([date]) => date));
  const quiz = Object.entries(save.quiz.finished)
    .map(([id, game]): QuizRun => ({ date: id.split("|")[0] ?? "", game }))
    // O jogado depois (pelo Histórico) fica fora, como nas Misturadas (P369).
    .filter(({ date, game }) => date <= today && !game.late)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const quizDays = (test: (game: QuizGame) => boolean) =>
    new Set(quiz.filter(({ game }) => test(game)).map(({ date }) => date));
  const mixedCount = [...mixed.values()].reduce((sum, day) => sum + day.size, 0);
  return {
    today,
    games,
    streak: streaks(new Set(games.map((g) => g.date)), hitsDates, today),
    artists: save.artists,
    practiceRight: save.practiceRight,
    dates,
    mixed,
    mixedStreak: {
      played: streaks(
        mixedDays(() => true),
        hitsDates,
        today,
      ).best,
      allFound: streaks(mixedDays(allFoundMixed), hitsDates, today).best,
    },
    quiz,
    quizStreak: {
      played: streaks(
        quizDays(() => true),
        hitsDates,
        today,
      ).best,
      steady: streaks(
        quizDays((game) => quizReached(game) >= QUIZ_GOALS.steadyRound),
        hitsDates,
        today,
      ).best,
    },
    dailies: games.length + mixedCount + quiz.length,
  };
}

/**
 * A rodada das Misturadas com todas as músicas achadas, em qualquer trecho e com ou sem o Separar
 * (ME123). A anulada não acha nenhuma.
 */
export function allFoundRound(round: MixedRoundRecord): boolean {
  return round.status === "done" && round.found.every((find) => find !== null);
}

/** O diário das Misturadas com todas as músicas de todas as rodadas achadas. */
export function allFoundMixed(game: MixedGame): boolean {
  return game.rounds.length > 0 && game.rounds.every(allFoundRound);
}

/**
 * O diário das Misturadas perfeito (ME123): toda música achada no 1º trecho, sem o Separar. Achar
 * no 1º trecho já quer dizer sem erro e sem pulo (os dois abrem o trecho seguinte).
 */
export function perfectMixed(game: MixedGame): boolean {
  return (
    game.rounds.length > 0 &&
    game.rounds.every(
      (round) =>
        round.status === "done" && round.found.every((find) => find?.stage === 0 && !find.help),
    )
  );
}

/**
 * A rodada perfeita (P310): ganha no trecho de 1 s, sem ajuda. Pela forma, e não pelos pontos (a
 * ME107 vai mudar a pontuação). A anulada não é perfeita (P304).
 */
export function perfectRound(round: RoundRecord): boolean {
  return round.status === "won" && round.stage === 0 && round.help === undefined;
}

/** O jogo perfeito: toda rodada perfeita. */
export function perfectGame(game: FinishedGame): boolean {
  return game.rounds.length > 0 && game.rounds.every(perfectRound);
}

/** Todas as rodadas acertadas, com ou sem ajuda (P311). A anulada não é acerto (P45). */
export function allWon(game: FinishedGame): boolean {
  return game.rounds.length > 0 && game.rounds.every((r) => r.status === "won");
}

/**
 * Os diários das gerais do mesmo dia, congelados (P310): um diário novo no jogo (uma dificuldade a
 * mais no Anime) não pode tirar de ninguém uma medalha já ganha, nem desmentir o "os 8 diários" do
 * texto. Um teste confere que hoje elas são as listas do jogo (`MODES`, `ANIME_KEYS` e
 * `DAILY_KEYS`); um diário novo pede uma decisão, e não muda as medalhas sozinho.
 */
export const HITS_DAY = ["album", "song"] as const;
export const ANIME_DAY = [
  "anime-musica-facil",
  "anime-musica-medio",
  "anime-musica-dificil",
  "anime-titulo-facil",
  "anime-titulo-medio",
  "anime-titulo-dificil",
] as const;
export const WHOLE_DAY = [...HITS_DAY, ...ANIME_DAY] as const;
/** Os 2 diários das Misturadas do mesmo dia (ME123), congelados como os outros. */
export const MIXED_DAY = ["misturadas-musica", "misturadas-titulo"] as const;

/** Numa mesma data, todos os diários de `keys` terminados, e cada um passando no `test`. */
function someDay(
  ctx: MedalContext,
  keys: readonly string[],
  test: (game: FinishedGame) => boolean = () => true,
): boolean {
  for (const day of ctx.dates.values()) {
    // O diário que falta no dia nunca passa, qualquer que seja o `test`.
    if (
      keys.every((key) => {
        const game = day.get(key);
        return game !== undefined && test(game);
      })
    )
      return true;
  }
  return false;
}

/** Uma que se ganha aos poucos: o valor chega à meta, e o progresso mostra quanto falta. */
function counted(
  id: string,
  block: MedalBlock,
  tier: MedalTier,
  goal: number,
  value: (ctx: MedalContext) => number,
): Medal {
  return {
    id,
    block,
    tier,
    earned: (ctx) => value(ctx) >= goal,
    progress: (ctx) => ({ value: Math.min(value(ctx), goal), goal }),
  };
}

/** Os limites das gerais (P310). Fixos: com o limite que muda, uma medalha ganha poderia sumir. */
export const GENERAL_GOALS = {
  streakShort: 7,
  streakLong: 30,
  practice: 100,
  dailies: 50,
  collector: 5,
  /** As Misturadas (ME123): dias seguidos jogando e dias seguidos com todas as músicas achadas. */
  mixedPlayed: 15,
  mixedAllFound: 7,
} as const;

/**
 * Os limites do quiz do dia (o usuário, 28/10/2026), fixos como os das gerais: as rodadas, sem
 * erro, a última vida, os pontos (um acerto vale de 1 a 4, P400), os 3 s, os dias seguidos, os
 * acertos, os tipos de pergunta e a 42.
 */
export const QUIZ_GOALS = {
  tutorial: 10,
  plusUltra: 25,
  opus: 50,
  /** A rodada num especial da semana, de até 30 (P376, P381). */
  special: 15,
  clean: 15,
  kami: 30,
  lastLife: 10,
  sharp: 50,
  absolute: 120,
  /** Os acertos de uma run, todos no 1º trecho (3 s). */
  fast: 10,
  played: 15,
  /** Os dias seguidos chegando à rodada `steadyRound`. */
  steadyDays: 7,
  steadyRound: 15,
  right: 300,
  /**
   * Os tipos de pergunta (a família: "a mais antiga" e "a mais recente" são um tipo só) em
   * que a run chegou à rodada `questionRound`.
   */
  questions: 6,
  questionRound: 15,
  answer: 42,
} as const;

/** A run chegou à rodada `n` sem errar: as `n` primeiras, sem erro (a anulada não é erro). */
export function quizClean(game: Pick<QuizGame, "results">, n: number): boolean {
  return game.results.length >= n && !game.results.slice(0, n).includes("w");
}

/**
 * Os acertos seguidos na última vida, depois do 2º erro, até o 3º (ou o fim). A anulada não quebra
 * a sequência nem soma (não foi a pessoa que errou).
 */
export function quizLastLife(game: Pick<QuizGame, "results">): number {
  const marks = game.results.split("v").join("");
  const second = marks.indexOf("w", marks.indexOf("w") + 1);
  if (marks.indexOf("w") === -1 || second === -1) return 0;
  return /^r*/.exec(marks.slice(second + 1))?.[0].length ?? 0;
}

/**
 * Todos os acertos da run no 1º trecho (3 s): os pontos são 4 por acerto (P400). Pela soma, porque o
 * save não guarda o trecho de cada rodada; a run de antes dos pontos (v12) não passa.
 */
export function quizAllFast(game: Pick<QuizGame, "results" | "points">): boolean {
  return game.points !== undefined && game.points === 4 * quizRight(game);
}

/** Alguma run do quiz passa no `test`. */
function someRun(test: (game: QuizGame) => boolean): (ctx: MedalContext) => boolean {
  return (ctx) => ctx.quiz.some(({ game }) => test(game));
}

/** Os tipos de pergunta (a família da run, v14) em que a run chegou à rodada `questionRound`. */
function quizQuestions(ctx: MedalContext): number {
  const families = ctx.quiz
    .filter(({ game }) => quizReached(game) >= QUIZ_GOALS.questionRound)
    .map(({ game }) => game.family);
  return new Set(families.filter((family) => family !== undefined)).size;
}

/** Num mesmo dia, os 8 diários, os 2 das Misturadas e o quiz terminados (a Hora Extra). */
function wholeDay(ctx: MedalContext): boolean {
  const quizDates = new Set(ctx.quiz.map(({ date }) => date));
  for (const [date, day] of ctx.dates) {
    const mixed = ctx.mixed.get(date);
    if (
      quizDates.has(date) &&
      WHOLE_DAY.every((key) => day.has(key)) &&
      MIXED_DAY.every((key) => mixed?.has(key))
    )
      return true;
  }
  return false;
}

/**
 * As gerais (P280: uma por feito; a lista do usuário, P310): as pequenas, do começo para o fim do
 * caminho, e depois as grandes. Os nomes e o como ganhar ficam no i18n (`medal.<id>.name` e
 * `.how`), e o desenho, no `ui/medalIcons.tsx`. O bloco de cada uma é o da tela (o usuário,
 * 28/10/2026): a que mistura modos fica nas gerais, também as duas dos artistas (o Colecionador e
 * o Superfan), e o Treino, nos Hits. A tela segue os blocos
 * (`MEDAL_BLOCKS`) e, dentro de cada um, a ordem desta lista; os avisos seguem a lista inteira, e
 * mudar a ordem dela muda a ordem deles.
 */
export const MEDALS: readonly Medal[] = [
  // Os diários de todos os modos, também as Misturadas e o quiz (o usuário, 28/10/2026).
  { id: "diario-1", block: "gerais", tier: "simple", earned: (ctx) => ctx.dailies >= 1 },
  {
    id: "um-segundo",
    block: "gerais",
    tier: "simple",
    earned: (ctx) => ctx.games.some(({ game }) => game.rounds.some(perfectRound)),
  },
  {
    id: "hits-todos",
    block: "hits",
    tier: "simple",
    earned: (ctx) => someDay(ctx, HITS_DAY, allWon),
  },
  {
    id: "anime-todos",
    block: "anime",
    tier: "simple",
    earned: (ctx) => someDay(ctx, ANIME_DAY, allWon),
  },
  // As Misturadas (ME123, o usuário, 24/10/2026): uma rodada com todas as músicas achadas.
  {
    id: "misturadas-rodada",
    block: "misturadas",
    tier: "simple",
    earned: (ctx) =>
      [...ctx.mixed.values()].some((day) =>
        [...day.values()].some((game) => game.rounds.some(allFoundRound)),
      ),
  },
  counted("seguidos-7", "gerais", "simple", GENERAL_GOALS.streakShort, (ctx) => ctx.streak.best),
  { id: "oito-diarios", block: "gerais", tier: "simple", earned: (ctx) => someDay(ctx, WHOLE_DAY) },
  counted("treino-100", "hits", "simple", GENERAL_GOALS.practice, (ctx) => ctx.practiceRight),
  counted("diarios-50", "gerais", "simple", GENERAL_GOALS.dailies, (ctx) => ctx.dailies),
  // Ao menos 1 diário das Misturadas terminado por dia, em dias seguidos.
  counted(
    "misturadas-seguidos-15",
    "misturadas",
    "simple",
    GENERAL_GOALS.mixedPlayed,
    (ctx) => ctx.mixedStreak.played,
  ),
  counted(
    "colecionador",
    "gerais",
    "simple",
    GENERAL_GOALS.collector,
    (ctx) => Object.values(ctx.artists).filter((r) => r.right >= SUPERFAN_RIGHT).length,
  ),
  // A Hora Extra e as pequenas do quiz (o usuário, 28/10/2026), depois das pequenas de antes: a
  // ordem relativa das de antes (a dos avisos) não muda.
  { id: "onze-diarios", block: "gerais", tier: "simple", earned: wholeDay },
  { id: "quiz-1", block: "quiz", tier: "simple", earned: (ctx) => ctx.quiz.length >= 1 },
  {
    id: "quiz-rodada-10",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => quizReached(game) >= QUIZ_GOALS.tutorial),
  },
  {
    id: "quiz-rodada-25",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => quizReached(game) >= QUIZ_GOALS.plusUltra),
  },
  {
    id: "quiz-especial-15",
    block: "quiz",
    tier: "simple",
    earned: someRun(
      (game) =>
        game.family !== undefined &&
        isQuizSpecial(game.family) &&
        quizReached(game) >= QUIZ_GOALS.special,
    ),
  },
  {
    id: "quiz-sem-erro-15",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => quizClean(game, QUIZ_GOALS.clean)),
  },
  {
    id: "quiz-ultima-vida",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => quizLastLife(game) >= QUIZ_GOALS.lastLife),
  },
  {
    id: "quiz-pontos-50",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => (game.points ?? 0) >= QUIZ_GOALS.sharp),
  },
  {
    id: "quiz-tres-segundos",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => quizRight(game) >= QUIZ_GOALS.fast && quizAllFast(game)),
  },
  counted("quiz-seguidos-15", "quiz", "simple", QUIZ_GOALS.played, (ctx) => ctx.quizStreak.played),
  counted("quiz-acertos-300", "quiz", "simple", QUIZ_GOALS.right, (ctx) =>
    ctx.quiz.reduce((sum, { game }) => sum + quizRight(game), 0),
  ),
  counted("quiz-perguntas-6", "quiz", "simple", QUIZ_GOALS.questions, quizQuestions),
  {
    id: "quiz-42",
    block: "quiz",
    tier: "simple",
    earned: someRun((game) => quizReached(game) === QUIZ_GOALS.answer),
  },
  {
    id: "hits-perfeito",
    block: "hits",
    tier: "major",
    earned: (ctx) => someDay(ctx, HITS_DAY, perfectGame),
  },
  {
    id: "anime-perfeito",
    block: "anime",
    tier: "major",
    earned: (ctx) => someDay(ctx, ANIME_DAY, perfectGame),
  },
  // Os 2 diários das Misturadas do mesmo dia perfeitos (P352: os dois, e não um).
  {
    id: "misturadas-perfeito",
    block: "misturadas",
    tier: "major",
    earned: (ctx) =>
      [...ctx.mixed.values()].some((day) =>
        MIXED_DAY.every((key) => {
          const game = day.get(key);
          return game !== undefined && perfectMixed(game);
        }),
      ),
  },
  // Em dias seguidos, ao menos 1 diário das Misturadas com todas as músicas achadas (P353: basta um).
  counted(
    "misturadas-acertos-7",
    "misturadas",
    "major",
    GENERAL_GOALS.mixedAllFound,
    (ctx) => ctx.mixedStreak.allFound,
  ),
  {
    id: "superfan-completo",
    block: "gerais",
    tier: "major",
    earned: (ctx) => Object.values(ctx.artists).some((r) => r.done),
  },
  counted("seguidos-30", "gerais", "major", GENERAL_GOALS.streakLong, (ctx) => ctx.streak.best),
  // As grandes do quiz, depois das grandes de antes.
  {
    id: "quiz-rodada-50",
    block: "quiz",
    tier: "major",
    earned: someRun((game) => quizReached(game) >= QUIZ_GOALS.opus),
  },
  {
    id: "quiz-sem-erro-30",
    block: "quiz",
    tier: "major",
    earned: someRun((game) => quizClean(game, QUIZ_GOALS.kami)),
  },
  {
    id: "quiz-pontos-120",
    block: "quiz",
    tier: "major",
    earned: someRun((game) => (game.points ?? 0) >= QUIZ_GOALS.absolute),
  },
  counted(
    "quiz-rodada-15-seguidos-7",
    "quiz",
    "major",
    QUIZ_GOALS.steadyDays,
    (ctx) => ctx.quizStreak.steady,
  ),
];

/** Os 3 níveis do Superfan de cada artista (P280, P285). */
export const SUPERFAN_LEVELS = ["acertos", "completo", "perfeito"] as const;
export type SuperfanLevel = (typeof SUPERFAN_LEVELS)[number];
/**
 * Acertos no modo por artista para a medalha dos acertos (P285, o usuário subiu de 10 para 50).
 * Fixo: se ele crescesse com o catálogo do artista, uma medalha já ganha poderia sumir.
 */
export const SUPERFAN_RIGHT = 50;

export function superfanMedalId(artistId: string, level: SuperfanLevel): string {
  return `superfan|${artistId}|${level}`;
}

/**
 * As 3 do artista (P302: os ids dizem o feito): `acertos`, com 50 acertos (a Livre e o Superfan
 * somam); `completo`, por terminar uma partida do Superfan; `perfeito`, por terminar uma perfeita.
 * As duas últimas são grandes.
 */
export function superfanMedals(artistId: string): readonly Medal[] {
  const record = (ctx: MedalContext) => ctx.artists[artistId] ?? NO_ARTIST;
  return [
    {
      id: superfanMedalId(artistId, "acertos"),
      block: "artistas",
      tier: "simple",
      earned: (ctx) => record(ctx).right >= SUPERFAN_RIGHT,
      progress: (ctx) => ({
        value: Math.min(record(ctx).right, SUPERFAN_RIGHT),
        goal: SUPERFAN_RIGHT,
      }),
    },
    {
      id: superfanMedalId(artistId, "completo"),
      block: "artistas",
      tier: "major",
      earned: (ctx) => !!record(ctx).done,
    },
    {
      id: superfanMedalId(artistId, "perfeito"),
      block: "artistas",
      tier: "major",
      earned: (ctx) => !!record(ctx).perfect,
    },
  ];
}

/**
 * As medalhas que o save pode ter ganho: as gerais e as do Superfan de cada artista que já tem
 * registro (sem registro, nenhuma delas está ganha). Não depende da lista dos artistas, que só
 * carrega quando a pessoa abre a aba deles.
 */
export function medalsOf(save: Save, general: readonly Medal[] = MEDALS): readonly Medal[] {
  return [...general, ...Object.keys(save.artists).sort().flatMap(superfanMedals)];
}

/** Os ids das ganhas, na ordem da lista. */
export function earnedMedals(medals: readonly Medal[], ctx: MedalContext): string[] {
  return medals.filter((medal) => medal.earned(ctx)).map((medal) => medal.id);
}

/** As ganhas que ainda não foram avisadas (P281). */
export function unseenMedals(save: Save, earned: readonly string[]): string[] {
  const seen = new Set(save.seenMedals);
  return earned.filter((id) => !seen.has(id));
}

/**
 * As gerais de exemplo (PR 2 do M16): só em desenvolvimento, com `?medalhas=demo`, para ver a
 * estrutura antes da lista de verdade (P288). Os limites são fáceis, e há as dos dois tamanhos.
 */
export const DEMO_MEDALS: readonly Medal[] = [
  {
    id: "demo-primeiro",
    block: "gerais",
    tier: "simple",
    earned: (ctx) => ctx.games.length >= 1,
  },
  {
    id: "demo-cinco",
    block: "gerais",
    tier: "simple",
    earned: (ctx) => ctx.games.length >= 5,
    progress: (ctx) => ({ value: Math.min(ctx.games.length, 5), goal: 5 }),
  },
  {
    id: "demo-sequencia",
    block: "gerais",
    tier: "major",
    earned: (ctx) => ctx.streak.best >= 3,
    progress: (ctx) => ({ value: Math.min(ctx.streak.best, 3), goal: 3 }),
  },
];

/** Uma medalha como a tela a mostra: ganha ou não, e o progresso, se ela tem. */
export type MedalState = {
  readonly medal: Medal;
  readonly earned: boolean;
  readonly progress: MedalProgress | null;
};

function stateOf(medal: Medal, ctx: MedalContext): MedalState {
  return { medal, earned: medal.earned(ctx), progress: medal.progress?.(ctx) ?? null };
}

/** O Superfan de um artista na tela: as 3 dele, na ordem dos níveis, cada uma com o nível. */
export type ArtistMedals = {
  readonly artistId: string;
  readonly cells: readonly { readonly level: SuperfanLevel; readonly state: MedalState }[];
};

/** Um bloco da tela (o usuário, 28/10/2026), com a contagem dele. */
export type MedalBlockView = {
  readonly block: MedalBlock;
  /** As gerais do bloco, na ordem da lista: as pequenas antes das grandes (P310). */
  readonly general: readonly MedalState[];
  /** Só no dos Artistas: as 3 do Superfan de cada artista da lista, na ordem dela. */
  readonly artists: readonly ArtistMedals[];
  readonly earned: number;
  readonly total: number;
};

/** O que a tela das Medalhas mostra (P286): a sequência, o total e os blocos. */
export type MedalBoard = {
  readonly streak: MedalContext["streak"];
  readonly earned: number;
  readonly total: number;
  readonly blocks: readonly MedalBlockView[];
};

const earnedCount = (states: readonly MedalState[]) =>
  states.filter((state) => state.earned).length;

/**
 * O quadro da tela, com os blocos na ordem de `MEDAL_BLOCKS`. O bloco sem medalha nenhuma fica
 * fora, menos o dos Artistas, que mostra também a carga da lista deles. As do Superfan são as dos
 * artistas da lista, na ordem dela (`artistIds`); o artista que saiu da lista some da tela, mas o
 * registro fica no save.
 */
export function medalBoard(
  save: Save,
  today: string,
  hitsDates: readonly string[],
  general: readonly Medal[],
  artistIds: readonly string[],
): MedalBoard {
  const ctx = medalContext(save, today, hitsDates);
  const states = general.map((medal) => stateOf(medal, ctx));
  const superfan = artistIds.map((artistId) => ({
    artistId,
    cells: superfanMedals(artistId).map((medal, i) => ({
      level: SUPERFAN_LEVELS[i] ?? "acertos",
      state: stateOf(medal, ctx),
    })),
  }));
  const blocks = MEDAL_BLOCKS.map((block): MedalBlockView => {
    const own = states.filter((state) => state.medal.block === block);
    const artists = block === "artistas" ? superfan : [];
    const all = [...own, ...artists.flatMap((row) => row.cells.map((cell) => cell.state))];
    return { block, general: own, artists, earned: earnedCount(all), total: all.length };
  }).filter((view) => view.block === "artistas" || view.general.length > 0);
  return {
    streak: ctx.streak,
    earned: blocks.reduce((sum, view) => sum + view.earned, 0),
    total: blocks.reduce((sum, view) => sum + view.total, 0),
    blocks,
  };
}

/**
 * As telas calmas, onde um aviso de medalha pode aparecer sem atrapalhar (P288): a Início, os Hits,
 * as escolhas do Anime (o modo e a dificuldade, e não os diários), o Histórico, as Medalhas e o
 * Sobre. Os Artistas são calmos fora de uma partida (a lista, o submodo, o fim do Superfan), o
 * que só a tela sabe: o App junta isso. Nunca numa rodada nem numa revelação.
 */
export function noticeTab(tab: Tab): boolean {
  switch (tab) {
    case "home":
    case "hits":
    case "anime":
    case "anime-musica":
    case "anime-titulo":
    case "misturadas":
    case "history":
    case "medals":
    case "about":
      return true;
    default:
      return false;
  }
}

/** O que a reivindicação devolve: o save com as novas como avisadas, e quais eram elas. */
export type MedalClaim = {
  readonly save: Save;
  readonly claimed: readonly string[];
  /**
   * O 1º aviso de quem já jogava antes das medalhas (P281): um aviso só, com o total. Só para quem
   * tem um jogo de um dia anterior (P314): quem começa hoje e ganha duas de uma vez vê "2 medalhas
   * novas", e não o texto de quem já jogava.
   */
  readonly first: boolean;
};

/**
 * Reivindica as ganhas que ainda não foram avisadas: devolve o save com elas no `seenMedals` e a
 * lista delas, para a aba mostrar só o que ela mesma marcou (duas abas não avisam a mesma). Sem
 * nenhuma nova, o mesmo save (o `updateSave` então não grava).
 */
export function claimMedals(
  save: Save,
  today: string,
  hitsDates: readonly string[],
  general: readonly Medal[],
): MedalClaim {
  const ctx = medalContext(save, today, hitsDates);
  const earned = earnedMedals(medalsOf(save, general), ctx);
  const claimed = unseenMedals(save, earned);
  if (claimed.length === 0) return { save, claimed, first: false };
  const playedBefore = ctx.games.some((g) => g.date < today);
  return {
    save: withSeenMedals(save, claimed),
    claimed,
    first: save.seenMedals.length === 0 && claimed.length > 1 && playedBefore,
  };
}

/** O tamanho do aviso de uma leva: o grande se uma delas é grande, ou se é o 1º aviso (P281). */
export function claimTier(claim: MedalClaim, medals: readonly Medal[]): MedalTier {
  if (claim.first) return "major";
  const byId = new Map(medals.map((medal) => [medal.id, medal]));
  return claim.claimed.some((id) => byId.get(id)?.tier === "major") ? "major" : "simple";
}
