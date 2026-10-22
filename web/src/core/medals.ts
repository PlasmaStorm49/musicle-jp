// As medalhas (M16, ME105). Calculadas do save a cada vez, como as estatísticas: o save só
// guarda o que não sai de outro lugar (as já avisadas, P281, e o modo por artista, P289). Toda
// conferência usa só o que cresce (o histórico, a agenda dos Hits, os registros dos artistas),
// para que uma medalha ganha nunca suma. O id vai para o save e nunca muda.
import { type ArtistRecord, NO_ARTIST, type Save } from "./records.ts";
import { type DayGame, dayGames, streaks } from "./stats.ts";

/** O tamanho do aviso (P279): o pequeno, que some sozinho, ou o pop-up grande. */
export type MedalTier = "simple" | "major";

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
};

/** Quanto falta (P283): "7 de 10". */
export type MedalProgress = { readonly value: number; readonly goal: number };

export type Medal = {
  readonly id: string;
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
  return {
    today,
    games,
    streak: streaks(new Set(games.map((g) => g.date)), hitsDates, today),
    artists: save.artists,
  };
}

/** As gerais (P280: uma por feito). A lista entra no PR 3 do M16, com o usuário. */
export const MEDALS: readonly Medal[] = [];

/** Os 3 níveis do Superfan de cada artista (P280, P285). */
export const SUPERFAN_LEVELS = ["prata", "ouro", "suprema"] as const;
export type SuperfanLevel = (typeof SUPERFAN_LEVELS)[number];
/**
 * Acertos no modo por artista para a prata (P285, o usuário subiu de 10 para 50). Fixo: se ele
 * crescesse com o catálogo do artista, uma prata já ganha poderia sumir.
 */
export const SUPERFAN_RIGHT = 50;

export function superfanMedalId(artistId: string, level: SuperfanLevel): string {
  return `superfan|${artistId}|${level}`;
}

/**
 * As 3 do artista: a prata, com 50 acertos (a Livre e o Superfan somam); o ouro, por terminar
 * uma partida do Superfan; a suprema, por terminar uma perfeita. O ouro e a suprema são grandes.
 */
export function superfanMedals(artistId: string): readonly Medal[] {
  const record = (ctx: MedalContext) => ctx.artists[artistId] ?? NO_ARTIST;
  return [
    {
      id: superfanMedalId(artistId, "prata"),
      tier: "simple",
      earned: (ctx) => record(ctx).right >= SUPERFAN_RIGHT,
      progress: (ctx) => ({
        value: Math.min(record(ctx).right, SUPERFAN_RIGHT),
        goal: SUPERFAN_RIGHT,
      }),
    },
    { id: superfanMedalId(artistId, "ouro"), tier: "major", earned: (ctx) => !!record(ctx).done },
    {
      id: superfanMedalId(artistId, "suprema"),
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
  { id: "demo-primeiro", tier: "simple", earned: (ctx) => ctx.games.length >= 1 },
  {
    id: "demo-cinco",
    tier: "simple",
    earned: (ctx) => ctx.games.length >= 5,
    progress: (ctx) => ({ value: Math.min(ctx.games.length, 5), goal: 5 }),
  },
  {
    id: "demo-sequencia",
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

/** O que a tela das Medalhas mostra (P286): a sequência, o total, as gerais e as do Superfan. */
export type MedalBoard = {
  readonly streak: MedalContext["streak"];
  readonly earned: number;
  readonly total: number;
  readonly general: readonly MedalState[];
  readonly superfan: readonly ArtistMedals[];
};

/**
 * O quadro da tela. As do Superfan são as dos artistas da lista, na ordem dela (`artistIds`); o
 * artista que saiu da lista some da tela, mas o registro fica no save.
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
      level: SUPERFAN_LEVELS[i] ?? "prata",
      state: stateOf(medal, ctx),
    })),
  }));
  const all = [...states, ...superfan.flatMap((row) => row.cells.map((cell) => cell.state))];
  return {
    streak: ctx.streak,
    earned: all.filter((state) => state.earned).length,
    total: all.length,
    general: states,
    superfan,
  };
}
