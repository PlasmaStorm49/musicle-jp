// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySave, puzzleId, type Save } from "../core/records.ts";
import type { Route } from "../core/routes.ts";
import { generalArt } from "./MedalArt.tsx";
import type { NoticeItem } from "./MedalNotice.tsx";
import { Nav } from "./Nav.tsx";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const DATE = "2026-10-22";
const HOME: Route = { tab: "home", date: null };

function setup(route: Route = HOME, save: Save = emptySave(), favorite: NoticeItem | null = null) {
  return render(<Nav route={route} save={save} date={DATE} favorite={favorite} />);
}

const toggle = () => screen.getByRole("button", { name: "Mais" });
const menu = () => document.getElementById("nav-more-menu") as HTMLElement;

describe("Nav (P225, P265, P287)", () => {
  it("o Mais começa fechado, e o clique abre e fecha o menu com as Misturadas, os Artistas, o Histórico e as Medalhas", () => {
    setup();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe("nav-more-menu");
    expect(menu().hidden).toBe(true);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(menu().hidden).toBe(false);
    const links = [...menu().querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["#misturadas", "#artistas", "#historico", "#medalhas"]);
    // Ao abrir, o foco fica onde estava (no botão, para quem usa o teclado).
    fireEvent.click(toggle());
    expect(menu().hidden).toBe(true);
  });

  it("o 2º clique de um toque duplo no Mais não fecha o menu (regra 23)", () => {
    setup();
    fireEvent.click(toggle(), { detail: 1 });
    fireEvent.click(toggle(), { detail: 2 });
    expect(menu().hidden).toBe(false);
  });

  it("o Esc fecha e devolve o foco ao Mais", () => {
    setup();
    fireEvent.click(toggle());
    (menu().querySelector("a") as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("o toque fora fecha; o toque dentro, não", () => {
    setup();
    fireEvent.click(toggle());
    fireEvent.pointerDown(menu().querySelector("a") as HTMLElement);
    expect(menu().hidden).toBe(false);
    fireEvent.pointerDown(document.body);
    expect(menu().hidden).toBe(true);
  });

  it("o foco que sai da lista pelo Tab fecha o menu", () => {
    setup();
    fireEvent.click(toggle());
    const outside = screen.getByRole("link", { name: /^Hits/ });
    fireEvent.focusOut(toggle(), { relatedTarget: outside });
    expect(menu().hidden).toBe(true);
  });

  it("o Tab do botão para um link do menu não fecha", () => {
    setup();
    fireEvent.click(toggle());
    fireEvent.focusOut(toggle(), { relatedTarget: menu().querySelector("a") });
    expect(menu().hidden).toBe(false);
  });

  it("a rota nova fecha o menu", () => {
    const { rerender } = setup();
    fireEvent.click(toggle());
    rerender(<Nav route={{ tab: "history", date: null }} save={emptySave()} date={DATE} />);
    expect(menu().hidden).toBe(true);
  });

  it("o link da rota atual, no menu, fecha e devolve o foco ao Mais (a tela não troca)", () => {
    // Um endereço que já caiu no calendário (a data de hoje): a rota é a do Histórico.
    window.location.hash = "#normal/2026-10-22";
    setup({ tab: "history", date: null });
    fireEvent.click(toggle());
    const link = menu().querySelector('a[href="#historico"]') as HTMLElement;
    link.focus();
    fireEvent.click(link);
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("o 2º clique de um toque duplo num link do menu não o segue (regra 23)", () => {
    setup();
    fireEvent.click(toggle());
    const link = menu().querySelector("a") as HTMLElement;
    const second = createEvent.click(link, { detail: 2 });
    fireEvent(link, second);
    expect(second.defaultPrevented).toBe(true);
  });

  it.each([
    [{ tab: "history", date: null }, "page"],
    [{ tab: "history", date: "2026-10-21" }, "true"],
    [{ tab: "album", date: "2026-10-21" }, "true"],
    [{ tab: "artists", date: null }, "page"],
  ] as const)("na rota %j, o Mais leva o aria-current, e o link dele também", (route, current) => {
    setup(route);
    expect(toggle().getAttribute("aria-current")).toBe("true");
    const category = route.tab === "artists" ? "#artistas" : "#historico";
    const inMenu = menu().querySelector(`a[href="${category}"]`);
    expect(inMenu?.getAttribute("aria-current")).toBe(current);
  });

  it("fora dos Artistas, do Histórico e das Medalhas, o Mais não leva o aria-current; o diário de hoje marca os Hits", () => {
    setup({ tab: "album", date: null });
    expect(toggle().hasAttribute("aria-current")).toBe(false);
    expect(screen.getByRole("link", { name: /^Hits/ }).getAttribute("aria-current")).toBe("true");
  });

  it("o ✓ dos Hits com os dois diários de hoje (P227)", () => {
    setup(HOME, {
      ...emptySave(),
      history: {
        [puzzleId(DATE, "album")]: { number: 1, rounds: [] },
        [puzzleId(DATE, "song")]: { number: 1, rounds: [] },
      },
    });
    expect(screen.getByRole("link", { name: /^Hits/ }).textContent).toContain("✓");
  });

  it("o ✓ das Misturadas só com os dois diários delas de hoje (M17)", () => {
    const game = { number: 1, rounds: [] };
    const one: Save = {
      ...emptySave(),
      mixed: { finished: { [puzzleId(DATE, "misturadas-musica")]: game }, progress: {} },
    };
    setup(HOME, one);
    const inline = () => document.querySelector(".nav-inline a[href='#misturadas']");
    expect(inline()?.textContent).not.toContain("✓");
    cleanup();
    setup(HOME, {
      ...one,
      mixed: {
        finished: { ...one.mixed.finished, [puzzleId(DATE, "misturadas-titulo")]: game },
        progress: {},
      },
    });
    expect(inline()?.textContent).toContain("✓");
    expect(inline()?.textContent).toContain("(diários terminados)");
  });

  it("nas Medalhas, o link delas leva o aria-current, e o Mais também", () => {
    setup({ tab: "medals", date: null });
    for (const link of screen.getAllByRole("link", { name: "Medalhas", hidden: true })) {
      expect(link.getAttribute("aria-current")).toBe("page");
    }
    expect(toggle().getAttribute("aria-current")).toBe("true");
  });

  it("a medalha em destaque (ME118, P317): o link para as Medalhas e o enfeite menor, no fim da nav", () => {
    setup();
    expect(document.querySelector(".nav-favorite")).toBeNull();
    cleanup();
    const favorite: NoticeItem = {
      id: "seguidos-30",
      kind: "geral-grande",
      name: "Tá pegando fogo, bicho!!!",
      spoken: "Tá pegando fogo, bicho!!!",
      feat: null,
      art: generalArt("★"),
    };
    setup(HOME, emptySave(), favorite);
    const link = screen.getByRole("link", {
      name: "Medalha em destaque: Tá pegando fogo, bicho!!!. Ver as medalhas",
    });
    expect(link.getAttribute("href")).toBe("#medalhas");
    // Nunca o aria-current: a aba das Medalhas é quem marca a tela.
    expect(link.hasAttribute("aria-current")).toBe(false);
    // O desenho do tamanho dela, com o ícone; só o link, sem o enfeite de 320 px.
    expect(link.querySelector("svg")?.getAttribute("viewBox")).toBe("0 8 110 132");
    expect(document.querySelector(".nav-favorite-small")).toBeNull();
    // O último item da nav, depois do Mais.
    expect(document.querySelector("nav.tabs > ul > li:last-child")?.classList).toContain(
      "nav-favorite",
    );
    cleanup();
    // Abaixo de 360 px: só o enfeite, e o item inteiro fora do leitor de tela.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: !query.includes("360"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    setup(HOME, emptySave(), favorite);
    const item = document.querySelector(".nav-favorite");
    expect(item?.getAttribute("aria-hidden")).toBe("true");
    expect(item?.querySelector(".nav-favorite-small svg")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /^Medalha em destaque/ })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("na linha, só as Misturadas, a partir de 720 px; no menu, elas só abaixo disso (M17)", () => {
    setup();
    const inline = [...document.querySelectorAll(".nav-inline a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(inline).toEqual(["#misturadas"]);
    const narrow = [...menu().querySelectorAll(".nav-narrow a")].map((a) => a.getAttribute("href"));
    expect(narrow).toEqual(["#misturadas"]);
  });

  it.each([
    [true, undefined],
    [false, "true"],
  ] as const)(
    "nas Misturadas, com a tela larga = %s, o Mais leva o aria-current = %s (elas estão nele só na estreita)",
    (wide, current) => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query.includes("720") ? wide : true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      setup({ tab: "misturadas-titulo", date: null });
      expect(toggle().getAttribute("aria-current") ?? undefined).toBe(current);
      const link = document.querySelector(".nav-inline a[href='#misturadas']");
      expect(link?.getAttribute("aria-current")).toBe("true");
      vi.unstubAllGlobals();
    },
  );
});
