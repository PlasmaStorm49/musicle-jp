// Endereços do jogo: a aba ativa (P49) e o do "novo diário". Puro: recebe e devolve texto, sem
// ler window.location (quem chama passa o endereço).
import type { Target } from "./types.ts";

/**
 * As abas do jogo: a home, a tela dos Hits (P225), os diários do Normal (album) e do Desafio
 * (song), o Treino e o modo por artista (M13).
 */
export type Tab = "home" | "hits" | Target | "practice" | "artists";

// Nenhum elemento da página pode ter id igual a uma rota: o navegador rolaria até ele.
export const ROUTES: Readonly<Record<Tab, string>> = {
  home: "#inicio",
  hits: "#hits",
  album: "#normal",
  song: "#desafio",
  practice: "#treino",
  artists: "#artistas",
};

/** As categorias da nav (P221, P225): os Hits juntam a tela deles, os dois diários e o Treino. */
export type Category = "home" | "hits" | "artists";

/** A categoria de uma aba: a da nav que fica marcada. */
export function categoryOf(tab: Tab): Category {
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
