import { describe, expect, it } from "vitest";
import { ANIME_KEYS } from "./daily.ts";
import {
  animeModeTab,
  animeScreen,
  categoryOf,
  isAnimeTab,
  ROUTES,
  type Tab,
  tabFromHash,
  todayHref,
} from "./routes.ts";

describe("tabFromHash (P49)", () => {
  it.each([
    ["#hits", "hits"],
    ["#normal", "album"],
    ["#desafio", "song"],
    ["#treino", "practice"],
    ["#artistas", "artists"],
    ["#inicio", "home"],
    ["#anime", "anime"],
    ["#anime-musica", "anime-musica"],
    ["#anime-titulo", "anime-titulo"],
    ["#anime-musica-facil", "anime-musica-facil"],
    ["#anime-titulo-dificil", "anime-titulo-dificil"],
    ["#sobre", "about"],
    ["", "home"],
    ["#", "home"],
    ["#nada", "home"],
    ["#NORMAL", "home"],
    // Os links de antes dos dois modos (P101) caem na home.
    ["#musica", "home"],
    ["#album", "home"],
    // O que parece do Anime, mas não é uma rota, também.
    ["#anime-", "home"],
    ["#anime-musica-extremo", "home"],
    ["#anime-facil", "home"],
  ])("%j → %s", (hash, tab) => {
    expect(tabFromHash(hash)).toBe(tab);
  });

  it("cada aba volta para o próprio endereço", () => {
    for (const [tab, hash] of Object.entries(ROUTES)) expect(tabFromHash(hash)).toBe(tab);
  });

  it("os 6 diários do Anime têm rota, e a rota é a chave do diário com o #", () => {
    for (const key of ANIME_KEYS) expect(ROUTES[key]).toBe(`#${key}`);
  });

  it("nenhuma rota se repete", () => {
    const hashes = Object.values(ROUTES);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("categoryOf (a aba marcada na nav, P225)", () => {
  it.each([
    ["home", "home"],
    ["hits", "hits"],
    ["album", "hits"],
    ["song", "hits"],
    ["practice", "hits"],
    ["artists", "artists"],
    ["anime", "anime"],
    ["anime-musica", "anime"],
    ["anime-titulo", "anime"],
    ["anime-musica-facil", "anime"],
    ["anime-musica-medio", "anime"],
    ["anime-titulo-dificil", "anime"],
    // O "Sobre" fica com a Início (o link no fim dela).
    ["about", "home"],
  ] as const)("%s → %s", (tab, category) => {
    expect(categoryOf(tab)).toBe(category);
  });

  it("todas as abas do Anime, e só elas, ficam na categoria Anime", () => {
    for (const tab of Object.keys(ROUTES) as Tab[]) {
      expect(categoryOf(tab) === "anime", tab).toBe(isAnimeTab(tab));
    }
  });
});

describe("animeScreen (a tela de cada aba do Anime, P233)", () => {
  it("a categoria é a escolha do modo", () => {
    expect(animeScreen("anime")).toEqual({ kind: "modes" });
  });

  it("o modo é a escolha da dificuldade", () => {
    expect(animeScreen("anime-musica")).toEqual({ kind: "levels", mode: "musica" });
    expect(animeScreen(animeModeTab("titulo"))).toEqual({ kind: "levels", mode: "titulo" });
  });

  it("o modo e a dificuldade são o diário, com a chave dele", () => {
    expect(animeScreen("anime-musica-facil")).toEqual({
      kind: "daily",
      mode: "musica",
      difficulty: "facil",
      key: "anime-musica-facil",
    });
    for (const key of ANIME_KEYS) {
      const screen = animeScreen(key);
      expect(screen.kind === "daily" && screen.key).toBe(key);
    }
  });
});

describe("todayHref (botão 'Jogar o novo diário')", () => {
  it("tira o ?date= do desenvolvimento e mantém a aba", () => {
    expect(todayHref("http://localhost:5173/?date=2026-10-08#normal")).toBe(
      "http://localhost:5173/#normal",
    );
    expect(todayHref("http://localhost:5173/?date=2026-10-08#anime-musica-facil")).toBe(
      "http://localhost:5173/#anime-musica-facil",
    );
  });

  it("sem ?date=, o endereço é o mesmo: null manda recarregar (trocar só o # não recarrega)", () => {
    expect(todayHref("http://localhost:5173/#normal")).toBeNull();
    expect(todayHref("https://x.github.io/musicle-jp/")).toBeNull();
  });

  it("outros parâmetros ficam", () => {
    expect(todayHref("http://localhost:5173/?date=2026-10-08&failAudio=x#treino")).toBe(
      "http://localhost:5173/?failAudio=x#treino",
    );
  });
});
