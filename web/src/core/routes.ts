// Endereços do jogo: a aba ativa (P49) e o do "novo desafio". Puro: recebe e devolve texto, sem
// ler window.location (quem chama passa o endereço).
import type { Target } from "./types.ts";

/** As abas do jogo: os dois diários e o Treino. */
export type Tab = Target | "practice";

// Nenhum elemento da página pode ter id igual a uma rota: o navegador rolaria até ele.
export const ROUTES: Readonly<Record<Tab, string>> = {
  song: "#musica",
  album: "#album",
  practice: "#treino",
};

/** A aba de um endereço. Desconhecido ou vazio abre a Música. */
export function tabFromHash(hash: string): Tab {
  return (Object.keys(ROUTES) as Tab[]).find((tab) => ROUTES[tab] === hash) ?? "song";
}

/**
 * Endereço do desafio de hoje a partir do atual: sem o ?date= do desenvolvimento (senão abriria
 * o mesmo dia), com a mesma aba. null quando seria o mesmo endereço: aí é preciso recarregar,
 * porque mudar só o fragmento (#album) não recarrega a página.
 */
export function todayHref(href: string): string | null {
  const url = new URL(href);
  url.searchParams.delete("date");
  return url.href === href ? null : url.href;
}
