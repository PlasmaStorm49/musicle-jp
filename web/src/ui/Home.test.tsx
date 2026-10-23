// @vitest-environment happy-dom
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtistSummary } from "../core/home.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { AlbumRound, Day } from "../core/types.ts";
import { THEME_KEY } from "../storage/theme.ts";
import { Home } from "./Home.tsx";

afterEach(cleanup);

// Dia mínimo no próprio arquivo (web/CLAUDE.md, regra 14): a home só lê o número.
const song = { answer: "t:tr:1" };
const album: AlbumRound = { answer: "t:tr:1", options: ["t:al:1", "t:al:2", "t:al:3", "t:al:4"] };
const DAY: Day = {
  number: 7,
  catalogVersion: "teste",
  song: [song, song, song],
  album: [album, album, album],
};
const DATE = "2026-10-17";

// 6 + 0 + 5 = 11 de 18.
const finished: FinishedGame = {
  number: 7,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] }, // no Normal, "Ouvir mais" não é tentativa
  ],
};

function setup(
  save: Save = emptySave(),
  day: Day | null = DAY,
  artists: ArtistSummary | null = null,
) {
  render(<Home day={day} date={DATE} save={save} artists={artists} />);
}

const card = (name: RegExp) => screen.getByRole("link", { name });

/** A descrição do cartão (aria-describedby): a dica inteira (P210). */
const description = (link: HTMLElement) =>
  document.getElementById(link.getAttribute("aria-describedby") ?? "")?.textContent;

/** As linhas de estado de um cartão. */
const lines = (link: HTMLElement) => [...link.querySelectorAll(".tag")].map((n) => n.textContent);

describe("Home", () => {
  it("o nome do jogo no título, com o foco ao abrir (regra 16)", () => {
    setup();
    const title = screen.getByRole("heading", { level: 1, name: "AteMusic" });
    expect(document.activeElement).toBe(title);
  });

  it("o selo do logo ao lado do nome, decorativo: o leitor de tela ouve só o nome (P193)", () => {
    setup();
    const logo = document.querySelector("img.logo");
    expect(logo).not.toBeNull();
    // Menor que 4 kB, o Vite embute o SVG no código (data:, também no Vitest); maior, ele vira um
    // arquivo.
    expect(logo?.getAttribute("src")).toMatch(/logo-selo\.svg$|^data:image\/svg\+xml/);
    expect(logo?.getAttribute("alt")).toBe("");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("um cartão-link por categoria (P226), numa coluna, na ordem da nav: os Hits, o Anime e os Artistas; e o Sobre e o Histórico no fim", () => {
    setup();
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#hits",
      "#anime",
      "#artistas",
      "#sobre",
      "#historico",
    ]);
    // O Histórico (P264) na linha do tema, junto com o switch.
    const history = screen.getByRole("link", { name: "Histórico" });
    expect(history.closest(".home-bottom")?.querySelector(".theme-switch")).not.toBeNull();
    expect(document.querySelector("ul.home-modes")?.classList.contains("single")).toBe(true);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("a dica curta na tela e no nome do link; a inteira como descrição, fora dele (P210)", () => {
    setup();
    const hits = card(/Os diários e o Treino$/);
    expect(hits.getAttribute("href")).toBe("#hits");
    const full = document.getElementById(hits.getAttribute("aria-describedby") ?? "");
    expect(full?.classList.contains("sr-only")).toBe(true);
    // Fora do link: dentro, o leitor de tela ouviria a dica inteira duas vezes.
    expect(hits.contains(full ?? null)).toBe(false);
    expect(description(hits)).toContain("parada do Japão");
  });

  it("o cartão dos Hits é o oliva enquanto houver um diário por jogar", () => {
    const next = () => document.querySelector(".home-card.next .mode-name")?.textContent;
    setup();
    expect(next()).toBe("Hits");
    cleanup();
    // Em andamento também conta (um evento salvo; o andamento vazio ainda é dia novo).
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "album")]: finished },
      inProgress: { [puzzleId(DATE, "song")]: { events: [{ type: "LISTEN_MORE" }] } },
    });
    expect(next()).toBe("Hits");
    cleanup();
    // Os dois terminados, ou o dia fora da agenda: nenhum.
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(next()).toBeUndefined();
    cleanup();
    setup(emptySave(), null);
    expect(next()).toBeUndefined();
  });

  it('o "Como funciona" abre fechado: a tela cabe, e quem quer as regras abre (P210)', () => {
    setup();
    const box = document.querySelector<HTMLDetailsElement>("details.home-how-box");
    expect(box?.open).toBe(false);
    expect(box?.querySelector("summary")?.textContent).toBe("Como funciona");
    // O chevron é só desenho.
    expect(box?.querySelector("summary svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o estado de cada diário no cartão dos Hits, sem o número: novo, em andamento e terminado", () => {
    setup();
    expect(lines(card(/^Hits/))).toEqual(["Normal: novo", "Desafio: novo"]);
    cleanup();
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "song")]: finished },
      inProgress: { [puzzleId(DATE, "album")]: { events: [{ type: "LISTEN_MORE" }] } },
    });
    expect(lines(card(/^Hits/))).toEqual([
      "Normal: em andamento",
      "Desafio: terminado, 11 de 18 pontos",
    ]);
  });

  it("outra aba grava (o save relido muda): o cartão atualiza, e o foco fica onde está", () => {
    // O App relê o save no evento storage e desenha a mesma Home com o save novo. O foco não
    // pode voltar ao título: o efeito só roda ao montar, e o link continua o mesmo elemento.
    const { rerender } = render(<Home day={DAY} date={DATE} save={emptySave()} artists={null} />);
    const hits = card(/^Hits/);
    hits.focus();
    const done: Save = { ...emptySave(), history: { [puzzleId(DATE, "song")]: finished } };
    rerender(<Home day={DAY} date={DATE} save={done} artists={null} />);
    expect(document.activeElement).toBe(hits);
    expect(hits.textContent).toContain("Desafio: terminado, 11 de 18 pontos");
  });

  it('dia todo anulado: terminado, sem "0 de 0 pontos"', () => {
    const voided: FinishedGame = {
      ...finished,
      rounds: finished.rounds.map(() => ({ status: "void", stage: 0, attempts: [] })),
    };
    setup({ ...emptySave(), history: { [puzzleId(DATE, "song")]: voided } });
    expect(lines(card(/^Hits/))).toContain("Desafio: terminado");
    expect(card(/^Hits/).textContent).not.toContain("pontos");
  });

  it("dia fora da agenda: o cartão dos Hits continua link (o Treino está lá), com uma linha só", () => {
    setup(emptySave(), null);
    expect(card(/^Hits/).getAttribute("href")).toBe("#hits");
    expect(lines(card(/^Hits/))).toEqual(["Não há diário hoje"]);
  });

  it("nenhum id igual a uma rota (o navegador rolaria até ele, regra 17)", () => {
    setup();
    // Todas as rotas, e não uma lista à mão: uma aba nova entra sozinha.
    for (const route of Object.values(ROUTES)) {
      expect(document.querySelector(route)).toBeNull();
    }
  });

  it("o cartão do Anime (M14): uma linha só, lida do save, e nenhuma sem jogo hoje (P226)", () => {
    const anime = () => card(/^Anime/);
    setup();
    expect(anime().getAttribute("href")).toBe("#anime");
    expect(lines(anime())).toEqual([]);
    expect(anime().textContent).toContain("Os diários de anime");
    expect(description(anime())).toContain("temas de anime");
    cleanup();
    // Em andamento, sem nenhum terminado.
    setup({
      ...emptySave(),
      inProgress: { [puzzleId(DATE, "anime-musica-medio")]: { events: [{ type: "SKIP" }] } },
    });
    expect(lines(anime())).toEqual(["Hoje: em andamento"]);
    cleanup();
    // Os terminados de hoje, dos 6 diários (os de outro dia não contam).
    setup({
      ...emptySave(),
      history: {
        [puzzleId(DATE, "anime-musica-facil")]: finished,
        [puzzleId(DATE, "anime-titulo-dificil")]: finished,
        [puzzleId("2026-10-16", "anime-musica-medio")]: finished,
      },
      inProgress: { [puzzleId(DATE, "anime-musica-medio")]: { events: [{ type: "SKIP" }] } },
    });
    expect(lines(anime())).toEqual(["Hoje: 2 de 6 terminados"]);
  });

  it('o "Sobre e privacidade" (P243) na linha do "Como funciona", fora dele; o "Tema" na tela (P259)', () => {
    setup();
    const about = screen.getByRole("link", { name: "Sobre e privacidade" });
    expect(about.getAttribute("href")).toBe("#sobre");
    const row = about.closest(".home-more");
    expect(row?.querySelector("details.home-how-box")).not.toBeNull();
    // Fora do <details>: o link aparece com ele fechado, e não fica dentro do resumo.
    expect(about.closest("details")).toBeNull();
    // O 2º clique de um toque duplo não segue o link (regra 23).
    const second = createEvent.click(about, { detail: 2 });
    fireEvent(about, second);
    expect(second.defaultPrevented).toBe(true);
    // O "Tema" volta para a tela, ao lado do switch.
    const theme = screen.getByRole("heading", { name: "Tema" });
    expect(theme.classList.contains("sr-only")).toBe(false);
    expect(theme.closest("section")?.querySelector('[role="switch"]')).not.toBeNull();
  });

  it("o cartão do Anime não é o oliva: a Início não sabe se há diário do Anime hoje", () => {
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(document.querySelector(".home-card.next")).toBeNull();
    expect(card(/^Anime/).classList.contains("off")).toBe(false);
  });

  it("o placar da sessão do modo por artista, com o artista, só depois da 1ª rodada (M13)", () => {
    setup();
    expect(card(/^Artistas/).textContent).not.toContain("Nesta sessão");
    cleanup();
    setup(emptySave(), DAY, {
      artist: "米津玄師",
      superfan: false,
      score: { points: 5, rounds: 2 },
    });
    expect(card(/^Artistas/).textContent).toContain(
      "Nesta sessão (米津玄師): 5 pontos em 2 rodadas",
    );
    // O nome na língua dele, só ele (ME68).
    expect(card(/^Artistas/).querySelector('.tag [lang="ja"]')?.textContent).toBe("米津玄師");
    cleanup();
    // A partida do Superfan (ME61): o placar dela, que pode ser negativo.
    setup(emptySave(), DAY, {
      artist: "Ado",
      superfan: true,
      score: { points: -7, rounds: 2 },
    });
    expect(card(/^Artistas/).textContent).toContain("Superfan (Ado): -7 pontos em 2 músicas");
    // O nome latino fica no texto, sem outra língua.
    expect(card(/^Artistas/).querySelector(".tag [lang]")).toBeNull();
  });
});

describe("Home: o switch de tema (P176, P191, P217)", () => {
  const toggle = () => screen.getByRole("switch", { name: "Tema escuro" });
  const checked = () => toggle().getAttribute("aria-checked");
  const root = document.documentElement;

  /** O aparelho no escuro: o matchMedia do prefers-color-scheme responde que sim. */
  function darkDevice() {
    return vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-color-scheme: dark)",
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  }

  afterEach(() => {
    localStorage.clear();
    delete root.dataset.theme;
    vi.restoreAllMocks();
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
  });

  it("no fim da Início, o switch com o sol e a lua; sem nada salvo, o do aparelho (claro)", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Tema" })).toBeTruthy();
    expect(checked()).toBe("false");
    // Sem o Automático na tela, e o sol e a lua só como desenho (P218).
    expect(screen.queryByRole("radio")).toBeNull();
    expect(toggle().querySelector('svg.icon-sun[aria-hidden="true"]')).not.toBeNull();
    expect(toggle().querySelector('svg.icon-moon[aria-hidden="true"]')).not.toBeNull();
    const hint = document.getElementById(toggle().getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Sem escolha, o jogo segue o tema do aparelho.");
  });

  it("sem nada salvo e o aparelho no escuro: o switch ligado, e o toque grava o claro", () => {
    darkDevice();
    setup();
    expect(checked()).toBe("true");
    fireEvent.click(toggle());
    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(checked()).toBe("false");
  });

  it("o toque vale na hora e fica gravado; outro toque volta ao claro", () => {
    setup();
    fireEvent.click(toggle());
    expect(root.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(checked()).toBe("true");
    fireEvent.click(toggle());
    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(checked()).toBe("false");
  });

  it("o 2º clique de um toque duplo não volta o tema (regra 23)", () => {
    setup();
    fireEvent.click(toggle(), { detail: 1 });
    fireEvent.click(toggle(), { detail: 2 });
    expect(root.dataset.theme).toBe("dark");
    expect(checked()).toBe("true");
  });

  it("o switch segue o tema que a página mostra (o script do index.html aplicou o salvo)", () => {
    root.dataset.theme = "dark";
    setup();
    expect(checked()).toBe("true");
  });

  it("a troca feita em outra aba chega pelo evento storage: a página e o switch acompanham", () => {
    setup();
    localStorage.setItem(THEME_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }));
    });
    expect(root.dataset.theme).toBe("dark");
    expect(checked()).toBe("true");
    // Outra chave (o save) não mexe no tema.
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "musicle-jp:save" }));
    });
    expect(checked()).toBe("true");
  });

  it("sem armazenamento (cookies bloqueados), a troca vale nesta visita", () => {
    const blocked = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    try {
      setup();
      fireEvent.click(toggle());
      expect(root.dataset.theme).toBe("dark");
      expect(checked()).toBe("true");
    } finally {
      blocked.mockRestore();
    }
  });

  /** O aparelho que troca de tema com a página aberta: devolve a troca, que avisa quem ouve. */
  function liveDevice(dark: boolean) {
    const listeners = new Set<() => void>();
    let isDark = dark;
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return query === "(prefers-color-scheme: dark)" && isDark;
          },
          media: query,
          addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        }) as unknown as MediaQueryList,
    );
    return (next: boolean) => {
      isDark = next;
      for (const listener of listeners) listener();
    };
  }

  it("sem escolha, o switch acompanha a troca do aparelho com a página aberta; depois do toque, não", () => {
    const flip = liveDevice(false);
    setup();
    expect(checked()).toBe("false");
    act(() => flip(true));
    expect(checked()).toBe("true");
    fireEvent.click(toggle()); // grava o claro
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    act(() => flip(false));
    act(() => flip(true));
    expect(checked()).toBe("false"); // a escolha vale, e não o aparelho
  });

  it("a dica de seguir o aparelho só vale sem escolha: depois do toque, ela sai", () => {
    setup();
    expect(toggle().getAttribute("aria-describedby")).toBe("theme-hint");
    fireEvent.click(toggle());
    expect(toggle().hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById("theme-hint")).toBeNull();
  });

  it("a outra aba limpou o armazenamento: o switch volta ao tema do aparelho, com a dica", () => {
    setup();
    fireEvent.click(toggle()); // o escuro, num aparelho claro
    expect(checked()).toBe("true");
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(checked()).toBe("false");
    expect(root.dataset.theme).toBeUndefined();
    expect(toggle().getAttribute("aria-describedby")).toBe("theme-hint");
  });

  it("a barra do navegador (theme-color): com um tema escolhido, as duas metas ficam com a cor dele", () => {
    for (const [scheme, color] of [
      ["light", "#ffffff"],
      ["dark", "#000000"],
    ] as const) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = color;
      meta.dataset.color = color;
      meta.media = `(prefers-color-scheme: ${scheme})`;
      document.head.append(meta);
    }
    const contents = () =>
      [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
        (m) => m.content,
      );
    setup();
    fireEvent.click(toggle());
    expect(contents()).toEqual(["#000000", "#000000"]);
    fireEvent.click(toggle());
    expect(contents()).toEqual(["#ffffff", "#ffffff"]);
    // A outra aba limpou o armazenamento: sem escolha, cada meta volta à sua.
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(contents()).toEqual(["#ffffff", "#000000"]);
    expect(root.dataset.theme).toBeUndefined();
  });
});
