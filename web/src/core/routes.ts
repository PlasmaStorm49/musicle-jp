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
import type { Target } from "./types.ts";

/**
 * As abas do Anime (M14, P233): a categoria (a escolha do modo), a escolha da dificuldade de cada
 * modo e os 6 diários, cuja aba é a chave do diário ("anime-musica-facil").
 */
export type AnimeTab = "anime" | `anime-${AnimeMode}` | AnimeKey;

/**
 * As abas do jogo: a home, a tela dos Hits (P225), os diários do Normal (album) e do Desafio
 * (song), o Treino, o modo por artista (M13) e as do Anime (M14).
 */
export type Tab = "home" | "hits" | Target | "practice" | "artists" | AnimeTab;

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
};

/**
 * As categorias da nav (P221, P225): os Hits juntam a tela deles, os dois diários e o Treino; o
 * Anime, a tela dele, as das dificuldades e os 6 diários.
 */
export type Category = "home" | "hits" | "anime" | "artists";

/** A aba é do Anime: a tela da categoria, a da dificuldade ou um diário. */
export function isAnimeTab(tab: Tab): tab is AnimeTab {
  return tab === "anime" || tab.startsWith("anime-");
}

/** A categoria de uma aba: a da nav que fica marcada. */
export function categoryOf(tab: Tab): Category {
  if (isAnimeTab(tab)) return "anime";
  switch (tab) {
    case "home":
    case "artists":
      return tab;
    case "hits":
    case "album":
    case "song":
    case "practice":
      return "hits";
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
 * Endereço do diário de hoje a partir do atual: sem o ?date= do desenvolvimento (senão abriria
 * o mesmo dia), com a mesma aba. null quando seria o mesmo endereço: aí é preciso recarregar,
 * porque mudar só o fragmento (#normal) não recarrega a página.
 */
export function todayHref(href: string): string | null {
  const url = new URL(href);
  url.searchParams.delete("date");
  return url.href === href ? null : url.href;
}
