// Endereços do jogo: a aba ativa (P49) e o do "novo diário". Puro: recebe e devolve texto, sem
// ler window.location (quem chama passa o endereço).
import {
  ANIME_DIFFICULTIES,
  ANIME_MODES,
  type AnimeDifficulty,
  type AnimeKey,
  type AnimeMode,
  animeKey,
} from "./daily.ts";
import { inHistory } from "./history.ts";
import type { MixedKey } from "./mixed.ts";
import type { Target } from "./types.ts";

/**
 * As abas do Anime (M14, P233): a categoria (a escolha do modo), a escolha da dificuldade de cada
 * modo e os 6 diários, cuja aba é a chave do diário ("anime-musica-facil").
 */
export type AnimeTab = "anime" | `anime-${AnimeMode}` | AnimeKey;

/** As abas das Misturadas (M17, P333): a escolha do modo e os 2 diários, cuja aba é a chave. */
export type MixedTab = "misturadas" | MixedKey;

/**
 * As abas do jogo: a home, a tela dos Hits (P225), os diários do Normal (album) e do Desafio
 * (song), o Treino, o modo por artista (M13), as do Anime (M14), o "Sobre e privacidade" (P243), o
 * Histórico (M15, P260), as Medalhas (M16, P278), as Misturadas (M17) e o quiz do dia (M18).
 */
export type Tab =
  | "home"
  | "hits"
  | Target
  | "practice"
  | "artists"
  | AnimeTab
  | "about"
  | "history"
  | "medals"
  | MixedTab
  | "quiz";

// Nenhum elemento da página pode ter id igual a uma rota: o navegador rolaria até ele.
export const ROUTES: Readonly<Record<Tab, string>> = {
  home: "#inicio",
  hits: "#hits",
  album: "#normal",
  song: "#desafio",
  practice: "#treino",
  artists: "#artistas",
  anime: "#anime",
  "anime-musica": "#anime-musica",
  "anime-titulo": "#anime-titulo",
  "anime-musica-facil": "#anime-musica-facil",
  "anime-musica-medio": "#anime-musica-medio",
  "anime-musica-dificil": "#anime-musica-dificil",
  "anime-titulo-facil": "#anime-titulo-facil",
  "anime-titulo-medio": "#anime-titulo-medio",
  "anime-titulo-dificil": "#anime-titulo-dificil",
  about: "#sobre",
  history: "#historico",
  medals: "#medalhas",
  misturadas: "#misturadas",
  "misturadas-musica": "#misturadas-musica",
  "misturadas-titulo": "#misturadas-titulo",
  quiz: "#quiz",
};

/**
 * As categorias da nav (P221, P225): os Hits juntam a tela deles, os dois diários e o Treino; o
 * Anime, a tela dele, as das dificuldades e os 6 diários; o Histórico (P264), o calendário, a tela
 * de um dia e os diários de um dia passado; as Medalhas (M16), a tela delas; as Misturadas (M17), a
 * escolha do modo e os 2 diários; o quiz do dia (M18), a run de hoje.
 */
export type Category =
  | "home"
  | "hits"
  | "anime"
  | "mixed"
  | "quiz"
  | "artists"
  | "history"
  | "medals";

/** A aba é do Anime: a tela da categoria, a da dificuldade ou um diário. */
export function isAnimeTab(tab: Tab): tab is AnimeTab {
  return tab === "anime" || tab.startsWith("anime-");
}

/** A aba é das Misturadas: a escolha do modo ou um diário. Sem data: elas não têm Histórico. */
export function isMixedTab(tab: Tab): tab is MixedTab {
  return tab === "misturadas" || tab.startsWith("misturadas-");
}

/** A categoria de uma aba: a da nav que fica marcada. */
export function categoryOf(tab: Tab): Category {
  if (isAnimeTab(tab)) return "anime";
  if (isMixedTab(tab)) return "mixed";
  switch (tab) {
    case "home":
    case "artists":
      return tab;
    // O "Sobre" sai da Início (o link no fim dela) e dos créditos do Anime: fica com a Início.
    case "about":
      return "home";
    case "hits":
    case "album":
    case "song":
    case "practice":
      return "hits";
    case "history":
      return "history";
    case "medals":
      return "medals";
    case "quiz":
      return "quiz";
  }
}

/** A tela de uma aba do Anime: a escolha do modo, a da dificuldade de um modo ou um diário. */
export type AnimeScreen =
  | { readonly kind: "modes" }
  | { readonly kind: "levels"; readonly mode: AnimeMode }
  | {
      readonly kind: "daily";
      readonly mode: AnimeMode;
      readonly difficulty: AnimeDifficulty;
      readonly key: AnimeKey;
    };

/** "anime" → os modos; "anime-musica" → as dificuldades; "anime-musica-facil" → o diário. */
export function animeScreen(tab: AnimeTab): AnimeScreen {
  const [, modePart, difficultyPart] = tab.split("-");
  const mode = ANIME_MODES.find((m) => m === modePart);
  if (!mode) return { kind: "modes" };
  const difficulty = ANIME_DIFFICULTIES.find((d) => d === difficultyPart);
  if (!difficulty) return { kind: "levels", mode };
  return { kind: "daily", mode, difficulty, key: animeKey(mode, difficulty) };
}

/** A aba da escolha da dificuldade de um modo do Anime. */
export function animeModeTab(mode: AnimeMode): AnimeTab {
  return `anime-${mode}`;
}

/**
 * A aba de um endereço. Vazio ou desconhecido abre a home: é onde caem o endereço do site, o link
 * do compartilhar e os links antigos (os #musica e #album de antes dos dois modos).
 */
export function tabFromHash(hash: string): Tab {
  return (Object.keys(ROUTES) as Tab[]).find((tab) => ROUTES[tab] === hash) ?? "home";
}

/**
 * As abas que aceitam um dia passado no endereço (P261): o Histórico (a tela do dia), os dois
 * diários dos Hits, as do Anime (a escolha do modo, a da dificuldade e os 6 diários), as das
 * Misturadas (a escolha do modo e os 2 diários; o usuário, 24/10/2026) e o quiz do dia (o
 * usuário, 26/10/2026).
 */
function isDatedTab(tab: Tab): boolean {
  return (
    tab === "history" ||
    tab === "album" ||
    tab === "song" ||
    tab === "quiz" ||
    isAnimeTab(tab) ||
    isMixedTab(tab)
  );
}

/** Uma aba e, num dia passado do Histórico, a data dele; `null` é hoje. */
export type Route = { readonly tab: Tab; readonly date: string | null };

/**
 * A rota de um endereço: `#aba` ou, num dia passado, `#aba/AAAA-MM-DD` (o Histórico, P261). O
 * endereço vem de fora (um link, a barra do navegador): a aba que não aceita data, com uma, abre a
 * home (regra 17); a data inválida, fora dos 14 dias do Histórico ou igual a hoje (P262), abre o
 * calendário.
 */
export function routeFromHash(hash: string, today: string): Route {
  const slash = hash.indexOf("/");
  if (slash === -1) return { tab: tabFromHash(hash), date: null };
  const tab = tabFromHash(hash.slice(0, slash));
  if (!isDatedTab(tab)) return { tab: "home", date: null };
  const date = hash.slice(slash + 1);
  return inHistory(date, today) ? { tab, date } : { tab: "history", date: null };
}

/** O endereço de uma rota: o da aba e, num dia passado, "/AAAA-MM-DD". */
export function routeHref(route: Route): string {
  return route.date === null ? ROUTES[route.tab] : `${ROUTES[route.tab]}/${route.date}`;
}

/** A categoria marcada na nav: num dia passado, o Histórico, de onde a pessoa veio. */
export function routeCategory(route: Route): Category {
  return route.date === null ? categoryOf(route.tab) : "history";
}

/** A aba da tela de cada categoria (a que a nav abre): a das Misturadas tem o nome dela. */
const CATEGORY_TAB: Readonly<Record<Category, Tab>> = {
  home: "home",
  hits: "hits",
  anime: "anime",
  mixed: "misturadas",
  quiz: "quiz",
  artists: "artists",
  history: "history",
  medals: "medals",
};

/**
 * O aria-current do link de uma categoria: "page" na tela dela (sem data), "true" dentro de um
 * jogo dela ou de um dia do Histórico (o link leva a outra página), e nada nas outras.
 */
export function navCurrent(route: Route, category: Category): "page" | "true" | undefined {
  if (routeCategory(route) !== category) return undefined;
  return route.tab === CATEGORY_TAB[category] && route.date === null ? "page" : "true";
}

/**
 * Endereço do diário de hoje a partir do atual: sem o ?date= do desenvolvimento (senão abriria
 * o mesmo dia), com a mesma aba. null quando seria o mesmo endereço: aí é preciso recarregar,
 * porque mudar só o fragmento (#normal) não recarrega a página.
 */
export function todayHref(href: string): string | null {
  const url = new URL(href);
  url.searchParams.delete("date");
  return url.href === href ? null : url.href;
}
