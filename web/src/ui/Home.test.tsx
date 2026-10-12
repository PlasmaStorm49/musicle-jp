// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtistSummary, PracticeSummary } from "../core/home.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { AlbumRound, Day } from "../core/types.ts";
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

describe("Home", () => {
  it("o nome do jogo no título, com o foco ao abrir (regra 16)", () => {
    setup();
    const title = screen.getByRole("heading", { level: 1, name: "AteMusic" });
    expect(document.activeElement).toBe(title);
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
    expect(card(/^Normal/).textContent).toContain("Cada trecho a mais vale 1 ponto a menos.");
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
    setup(emptySave(), DAY, null, { artist: "米津玄師", score: { points: 5, rounds: 2 } });
    expect(card(/^Artistas/).textContent).toContain(
      "Nesta sessão (米津玄師): 5 pontos em 2 rodadas",
    );
    expect(card(/^Treino/).textContent).not.toContain("Nesta sessão");
  });
});
