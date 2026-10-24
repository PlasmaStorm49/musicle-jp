import { describe, expect, it } from "vitest";
import { ANIME_KEYS } from "./daily.ts";
import {
  animeModeTab,
  animeScreen,
  categoryOf,
  isAnimeTab,
  isMixedTab,
  navCurrent,
  ROUTES,
  type Route,
  routeCategory,
  routeFromHash,
  routeHref,
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
    ["#medalhas", "medals"],
    ["#anime-titulo-dificil", "anime-titulo-dificil"],
    ["#sobre", "about"],
    ["#historico", "history"],
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
    ["history", "history"],
    ["medals", "medals"],
    ["misturadas", "mixed"],
    ["misturadas-musica", "mixed"],
    ["misturadas-titulo", "mixed"],
  ] as const)("%s → %s", (tab, category) => {
    expect(categoryOf(tab)).toBe(category);
  });

  it("todas as abas do Anime, e só elas, ficam na categoria Anime", () => {
    for (const tab of Object.keys(ROUTES) as Tab[]) {
      expect(categoryOf(tab) === "anime", tab).toBe(isAnimeTab(tab));
    }
  });

  it("as das Misturadas (M17), e só elas, ficam na categoria delas, sem data (sem Histórico)", () => {
    for (const tab of Object.keys(ROUTES) as Tab[]) {
      expect(categoryOf(tab) === "mixed", tab).toBe(isMixedTab(tab));
    }
    expect(routeFromHash("#misturadas-musica", "2026-10-22")).toEqual({
      tab: "misturadas-musica",
      date: null,
    });
    expect(routeFromHash("#misturadas/2026-10-21", "2026-10-22")).toEqual({
      tab: "home",
      date: null,
    });
    expect(navCurrent({ tab: "misturadas", date: null }, "mixed")).toBe("page");
    expect(navCurrent({ tab: "misturadas-titulo", date: null }, "mixed")).toBe("true");
    expect(navCurrent({ tab: "misturadas", date: null }, "anime")).toBeUndefined();
  });
});

describe("routeFromHash (o Histórico, P261 e P262)", () => {
  const TODAY = "2026-10-22";
  it("as Medalhas não aceitam data: com uma, a Início (regra 17)", () => {
    expect(routeFromHash("#medalhas", TODAY)).toEqual({ tab: "medals", date: null });
    expect(routeFromHash("#medalhas/2026-10-21", TODAY)).toEqual({ tab: "home", date: null });
    expect(navCurrent({ tab: "medals", date: null }, "medals")).toBe("page");
  });

  it.each([
    // Sem data: a aba de sempre, de hoje.
    ["#normal", { tab: "album", date: null }],
    ["#historico", { tab: "history", date: null }],
    // Um dia passado, dentro dos 14 dias: o calendário, a tela do dia e os dois diários.
    ["#historico/2026-10-21", { tab: "history", date: "2026-10-21" }],
    ["#normal/2026-10-08", { tab: "album", date: "2026-10-08" }],
    ["#desafio/2026-10-15", { tab: "song", date: "2026-10-15" }],
    // E as do Anime (o PR 3): a escolha do modo, a da dificuldade e os diários.
    ["#anime/2026-10-21", { tab: "anime", date: "2026-10-21" }],
    ["#anime-titulo/2026-10-21", { tab: "anime-titulo", date: "2026-10-21" }],
    ["#anime-musica-facil/2026-10-21", { tab: "anime-musica-facil", date: "2026-10-21" }],
    ["#anime-musica-facil/2026-10-07", { tab: "history", date: null }],
    // A data fora da janela, igual a hoje, do futuro ou que não é data: o calendário.
    ["#normal/2026-10-07", { tab: "history", date: null }],
    ["#normal/2026-10-22", { tab: "history", date: null }],
    ["#desafio/2026-10-23", { tab: "history", date: null }],
    ["#normal/2026-02-30", { tab: "history", date: null }],
    ["#normal/2026-10-1", { tab: "history", date: null }],
    ["#historico/", { tab: "history", date: null }],
    // A aba que não aceita data, com uma, ou desconhecida: a home (regra 17).
    ["#hits/2026-10-21", { tab: "home", date: null }],
    ["#treino/2026-10-21", { tab: "home", date: null }],
    ["#artistas/2026-10-21", { tab: "home", date: null }],
    ["#anime-musica-extremo/2026-10-21", { tab: "home", date: null }],
    ["#nada/2026-10-21", { tab: "home", date: null }],
    ["#normal/2026-10-21/x", { tab: "history", date: null }],
  ] as const)("%j → %j", (hash, route) => {
    expect(routeFromHash(hash, TODAY)).toEqual(route);
  });

  it("o endereço volta para a mesma rota", () => {
    const routes: Route[] = [
      { tab: "home", date: null },
      { tab: "history", date: null },
      { tab: "history", date: "2026-10-21" },
      { tab: "album", date: "2026-10-08" },
      { tab: "song", date: "2026-10-21" },
      { tab: "anime", date: "2026-10-21" },
      { tab: "anime-titulo-dificil", date: "2026-10-09" },
    ];
    for (const route of routes) expect(routeFromHash(routeHref(route), TODAY)).toEqual(route);
    expect(routeHref({ tab: "album", date: "2026-10-08" })).toBe("#normal/2026-10-08");
  });
});

describe("routeCategory e navCurrent (a nav, P225 e P264)", () => {
  it("num dia passado, a categoria é o Histórico, de onde a pessoa veio", () => {
    expect(routeCategory({ tab: "album", date: "2026-10-21" })).toBe("history");
    expect(routeCategory({ tab: "album", date: null })).toBe("hits");
  });

  it.each([
    [{ tab: "history", date: null }, "history", "page"],
    [{ tab: "history", date: "2026-10-21" }, "history", "true"],
    [{ tab: "album", date: "2026-10-21" }, "history", "true"],
    [{ tab: "album", date: "2026-10-21" }, "hits", undefined],
    [{ tab: "anime-musica-facil", date: "2026-10-21" }, "history", "true"],
    [{ tab: "anime", date: "2026-10-21" }, "anime", undefined],
    [{ tab: "anime", date: null }, "anime", "page"],
    [{ tab: "hits", date: null }, "hits", "page"],
    [{ tab: "album", date: null }, "hits", "true"],
    [{ tab: "about", date: null }, "home", "true"],
    [{ tab: "home", date: null }, "home", "page"],
    [{ tab: "home", date: null }, "history", undefined],
  ] as const)("%j na categoria %s → %s", (route, category, current) => {
    expect(navCurrent(route, category)).toBe(current);
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
