// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtistSummary, PracticeSummary } from "../core/home.ts";
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
  practice: PracticeSummary | null = null,
  artists: ArtistSummary | null = null,
) {
  render(<Home day={day} date={DATE} save={save} practice={practice} artists={artists} />);
}

const card = (name: RegExp) => screen.getByRole("link", { name });

/** A descrição do cartão (aria-describedby): a dica inteira (P210). */
const description = (link: HTMLElement) =>
  document.getElementById(link.getAttribute("aria-describedby") ?? "")?.textContent;

/** Os cartões em oliva: o diário por jogar, a ação da tela. */
const nextCards = () =>
  [...document.querySelectorAll(".home-card.next .mode-name")].map((n) => n.textContent);

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

  it("um cartão-link por modo, para a aba de cada um, na ordem Normal, Desafio, Treino, Artistas", () => {
    setup();
    expect(card(/^Normal/).getAttribute("href")).toBe("#normal");
    expect(card(/^Desafio/).getAttribute("href")).toBe("#desafio");
    expect(card(/^Treino/).getAttribute("href")).toBe("#treino");
    expect(card(/^Artistas/).getAttribute("href")).toBe("#artistas");
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#normal",
      "#desafio",
      "#treino",
      "#artistas",
    ]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("a dica do Normal explica o custo do Ouvir mais, que saiu do botão (ME59)", () => {
    setup();
    expect(description(card(/^Normal/))).toContain("Cada trecho a mais vale 1 ponto a menos.");
  });

  it("a dica curta na tela e no nome do link; a inteira como descrição, fora dele (P210)", () => {
    setup();
    const normal = card(/4 opções de álbum$/);
    expect(normal.getAttribute("href")).toBe("#normal");
    const full = document.getElementById(normal.getAttribute("aria-describedby") ?? "");
    expect(full?.classList.contains("sr-only")).toBe(true);
    // Fora do link: dentro, o leitor de tela ouviria a dica inteira duas vezes.
    expect(normal.contains(full ?? null)).toBe(false);
    expect(normal.textContent).not.toContain("Cada trecho a mais");
  });

  it("o cartão oliva é o primeiro diário por jogar: novo ou em andamento", () => {
    setup();
    expect(nextCards()).toEqual(["Normal"]);
    cleanup();
    // O Normal terminado: a vez do Desafio.
    setup({ ...emptySave(), history: { [puzzleId(DATE, "album")]: finished } });
    expect(nextCards()).toEqual(["Desafio"]);
    cleanup();
    // Em andamento também conta.
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "album")]: finished },
      inProgress: { [puzzleId(DATE, "song")]: { events: [] } },
    });
    expect(nextCards()).toEqual(["Desafio"]);
    cleanup();
    // Os dois terminados, ou o dia fora da agenda: nenhum.
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(nextCards()).toEqual([]);
    cleanup();
    setup(emptySave(), null);
    expect(nextCards()).toEqual([]);
  });

  it('o "Como funciona" abre fechado: a tela cabe, e quem quer as regras abre (P210)', () => {
    setup();
    const box = document.querySelector<HTMLDetailsElement>("details.home-how-box");
    expect(box?.open).toBe(false);
    expect(box?.querySelector("summary")?.textContent).toBe("Como funciona");
    // O chevron é só desenho.
    expect(box?.querySelector("summary svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("dia novo: o número do diário", () => {
    setup();
    expect(card(/^Normal/).textContent).toContain("nº 7 · novo");
    expect(card(/^Desafio/).textContent).toContain("nº 7 · novo");
  });

  it("o estado de cada diário: em andamento e terminado com os pontos", () => {
    const save: Save = {
      ...emptySave(),
      history: { [puzzleId(DATE, "song")]: finished },
      inProgress: { [puzzleId(DATE, "album")]: { events: [{ type: "LISTEN_MORE" }] } },
    };
    setup(save);
    expect(card(/^Desafio/).textContent).toContain("nº 7 · terminado, 11 de 18 pontos");
    expect(card(/^Normal/).textContent).toContain("nº 7 · em andamento");
  });

  it("outra aba grava (o save relido muda): o cartão atualiza, e o foco fica onde está", () => {
    // O App relê o save no evento storage e desenha a mesma Home com o save novo. O foco não
    // pode voltar ao título: o efeito só roda ao montar, e o link continua o mesmo elemento.
    const { rerender } = render(
      <Home day={DAY} date={DATE} save={emptySave()} practice={null} artists={null} />,
    );
    const song = card(/^Desafio/);
    song.focus();
    const done: Save = { ...emptySave(), history: { [puzzleId(DATE, "song")]: finished } };
    rerender(<Home day={DAY} date={DATE} save={done} practice={null} artists={null} />);
    expect(document.activeElement).toBe(song);
    expect(song.textContent).toContain("terminado, 11 de 18 pontos");
  });

  it('dia todo anulado: terminado, sem "0 de 0 pontos"', () => {
    const voided: FinishedGame = {
      ...finished,
      rounds: finished.rounds.map(() => ({ status: "void", stage: 0, attempts: [] })),
    };
    setup({ ...emptySave(), history: { [puzzleId(DATE, "song")]: voided } });
    expect(card(/^Desafio/).textContent).toContain("nº 7 · terminado");
    expect(card(/^Desafio/).textContent).not.toContain("pontos");
  });

  it("dia fora da agenda: os diários avisam sem link (não há para onde ir), e o Treino continua", () => {
    setup(emptySave(), null);
    expect(screen.queryByRole("link", { name: /^(Normal|Desafio)/ })).toBeNull();
    expect(screen.getAllByText("Não há diário hoje")).toHaveLength(2);
    expect(card(/^Treino/).getAttribute("href")).toBe("#treino");
  });

  it("nenhum id igual a uma rota (o navegador rolaria até ele, regra 17)", () => {
    setup();
    // Todas as rotas, e não uma lista à mão: uma aba nova entra sozinha.
    for (const route of Object.values(ROUTES)) {
      expect(document.querySelector(route)).toBeNull();
    }
  });

  it("o placar da sessão do Treino, com o modo (P106), aparece só depois da 1ª rodada", () => {
    setup(emptySave(), DAY, null); // practiceSummary devolve null antes disso
    expect(card(/^Treino/).textContent).not.toContain("Nesta sessão");
    cleanup();
    setup(emptySave(), DAY, { target: "album", score: { points: 11, rounds: 3 } });
    expect(card(/^Treino/).textContent).toContain("Nesta sessão (Normal): 11 pontos em 3 rodadas");
    cleanup();
    setup(emptySave(), DAY, { target: "song", score: { points: 1, rounds: 1 } });
    expect(card(/^Treino/).textContent).toContain("Nesta sessão (Desafio): 1 ponto em 1 rodada");
  });

  it("o placar da sessão do modo por artista, com o artista, só depois da 1ª rodada (M13)", () => {
    setup();
    expect(card(/^Artistas/).textContent).not.toContain("Nesta sessão");
    cleanup();
    setup(emptySave(), DAY, null, {
      artist: "米津玄師",
      superfan: false,
      score: { points: 5, rounds: 2 },
    });
    expect(card(/^Artistas/).textContent).toContain(
      "Nesta sessão (米津玄師): 5 pontos em 2 rodadas",
    );
    expect(card(/^Treino/).textContent).not.toContain("Nesta sessão");
    cleanup();
    // A partida do Superfan (ME61): o placar dela, que pode ser negativo.
    setup(emptySave(), DAY, null, {
      artist: "Ado",
      superfan: true,
      score: { points: -7, rounds: 2 },
    });
    expect(card(/^Artistas/).textContent).toContain("Superfan (Ado): -7 pontos em 2 músicas");
  });
});

describe("Home: a troca de tema (P176, P191)", () => {
  const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
  const root = document.documentElement;

  afterEach(() => {
    localStorage.clear();
    delete root.dataset.theme;
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
  });

  it("no fim da Início, um grupo Tema com 3 rádios; sem nada salvo, o Automático", () => {
    setup();
    expect(screen.getByRole("group", { name: "Tema" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual([
      "auto",
      "light",
      "dark",
    ]);
    expect(radio("Automático").checked).toBe(true);
    expect(screen.getByText("O Automático segue o tema do aparelho.")).toBeTruthy();
  });

  it("escolher Escuro vale na hora e fica gravado; o Automático tira o atributo e apaga a chave", () => {
    setup();
    fireEvent.click(radio("Escuro"));
    expect(root.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(radio("Escuro").checked).toBe(true);
    fireEvent.click(radio("Automático"));
    expect(root.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("o rádio marcado é o tema que a página mostra (o script do index.html aplicou o salvo)", () => {
    root.dataset.theme = "light";
    setup();
    expect(radio("Claro").checked).toBe(true);
  });

  it("a gravação que falhou não desmarca: o rádio segue a página, e não o armazenamento", () => {
    // A cota cheia: a página ficou escura, mas a chave nunca foi gravada.
    root.dataset.theme = "dark";
    setup();
    expect(radio("Escuro").checked).toBe(true);
  });

  it("a troca feita em outra aba chega pelo evento storage: a página e o rádio acompanham", () => {
    setup();
    localStorage.setItem(THEME_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }));
    });
    expect(root.dataset.theme).toBe("dark");
    expect(radio("Escuro").checked).toBe(true);
    // Outra chave (o save) não mexe no tema.
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "musicle-jp:save" }));
    });
    expect(radio("Escuro").checked).toBe(true);
  });

  it("sem armazenamento (cookies bloqueados), a troca vale nesta visita", () => {
    const blocked = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    try {
      setup();
      fireEvent.click(radio("Escuro"));
      expect(root.dataset.theme).toBe("dark");
      expect(radio("Escuro").checked).toBe(true);
    } finally {
      blocked.mockRestore();
    }
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
    fireEvent.click(radio("Escuro"));
    expect(contents()).toEqual(["#000000", "#000000"]);
    fireEvent.click(radio("Claro"));
    expect(contents()).toEqual(["#ffffff", "#ffffff"]);
    fireEvent.click(radio("Automático"));
    expect(contents()).toEqual(["#ffffff", "#000000"]);
  });
});
