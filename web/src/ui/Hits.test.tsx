// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { PracticeSummary } from "../core/home.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { AlbumRound, Day } from "../core/types.ts";
import { Hits } from "./Hits.tsx";

afterEach(cleanup);

// Dia mínimo no próprio arquivo (web/CLAUDE.md, regra 14): a tela só lê o número.
const song = { answer: "t:tr:1" };
const album: AlbumRound = { answer: "t:tr:1", options: ["t:al:1", "t:al:2", "t:al:3", "t:al:4"] };
const DAY: Day = {
  number: 7,
  catalogVersion: "teste",
  song: [song, song, song],
  album: [album, album, album],
};
const DATE = "2026-10-17";

// 10 + 0 + 8 = 18 de 30.
const finished: FinishedGame = {
  number: 7,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] },
  ],
};

function setup(
  save: Save = emptySave(),
  day: Day | null = DAY,
  practice: PracticeSummary | null = null,
) {
  render(<Hits day={day} date={DATE} save={save} practice={practice} />);
}

const card = (name: RegExp) => screen.getByRole("link", { name });

/** Os cartões em oliva: o diário por jogar, a ação da tela. */
const nextCards = () =>
  [...document.querySelectorAll(".home-card.next .mode-name")].map((n) => n.textContent);

describe("Hits (P225)", () => {
  it("o título Hits, com o foco ao abrir (regra 16)", () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Hits" }));
  });

  it("um cartão-link por jogo, na ordem Normal, Desafio e Treino; o Treino na linha toda", () => {
    setup();
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#normal",
      "#desafio",
      "#treino",
    ]);
    expect(
      card(/^Treino/)
        .closest("li")
        ?.classList.contains("wide"),
    ).toBe(true);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("a dica do Normal explica o custo do Ouvir mais, que saiu do botão (ME59)", () => {
    setup();
    const normal = card(/^Normal/);
    const full = document.getElementById(normal.getAttribute("aria-describedby") ?? "");
    expect(full?.textContent).toContain("Quanto menos você ouvir, mais vale o acerto.");
    expect(normal.contains(full ?? null)).toBe(false); // fora do link (P210)
  });

  it("o estado de cada diário: novo, em andamento e terminado com os pontos", () => {
    setup();
    expect(card(/^Normal/).textContent).toContain("nº 7 · novo");
    cleanup();
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "song")]: finished },
      inProgress: { [puzzleId(DATE, "album")]: { events: [{ type: "LISTEN_MORE" }] } },
    });
    expect(card(/^Desafio/).textContent).toContain("nº 7 · terminado, 18 de 30 pontos");
    expect(card(/^Normal/).textContent).toContain("nº 7 · em andamento");
  });

  it("o cartão oliva é o primeiro diário por jogar", () => {
    setup();
    expect(nextCards()).toEqual(["Normal"]);
    cleanup();
    setup({ ...emptySave(), history: { [puzzleId(DATE, "album")]: finished } });
    expect(nextCards()).toEqual(["Desafio"]);
    cleanup();
    setup({
      ...emptySave(),
      history: { [puzzleId(DATE, "album")]: finished, [puzzleId(DATE, "song")]: finished },
    });
    expect(nextCards()).toEqual([]);
  });

  it("dia fora da agenda: os diários avisam sem link, e o Treino continua", () => {
    setup(emptySave(), null);
    expect(screen.queryByRole("link", { name: /^(Normal|Desafio)/ })).toBeNull();
    expect(screen.getAllByText("Não há diário hoje")).toHaveLength(2);
    expect(card(/^Treino/).getAttribute("href")).toBe("#treino");
    expect(nextCards()).toEqual([]);
  });

  it("o placar da sessão do Treino, com o modo (P106), aparece só depois da 1ª rodada", () => {
    setup(emptySave(), DAY, null);
    expect(card(/^Treino/).textContent).not.toContain("Nesta sessão");
    cleanup();
    setup(emptySave(), DAY, { target: "album", score: { points: 11, rounds: 3 } });
    expect(card(/^Treino/).textContent).toContain("Nesta sessão (Normal): 11 pontos em 3 rodadas");
    cleanup();
    setup(emptySave(), DAY, { target: "song", score: { points: 1, rounds: 1 } });
    expect(card(/^Treino/).textContent).toContain("Nesta sessão (Desafio): 1 ponto em 1 rodada");
  });

  it('dia todo anulado: "nº 7 · terminado", sem "0 de 0 pontos"', () => {
    const voided: FinishedGame = {
      ...finished,
      rounds: finished.rounds.map(() => ({ status: "void", stage: 0, attempts: [] })),
    };
    setup({ ...emptySave(), history: { [puzzleId(DATE, "song")]: voided } });
    expect(card(/^Desafio/).textContent).toContain("nº 7 · terminado");
    expect(card(/^Desafio/).textContent).not.toContain("pontos");
  });

  it("o 2º clique de um toque duplo não abre o cartão (ele cai aqui vindo da Início, regra 23)", () => {
    setup();
    const normal = card(/^Normal/);
    const second = createEvent.click(normal, { detail: 2 });
    fireEvent(normal, second);
    expect(second.defaultPrevented).toBe(true);
    const single = createEvent.click(normal, { detail: 1 });
    fireEvent(normal, single);
    expect(single.defaultPrevented).toBe(false);
  });

  it("nenhum id igual a uma rota (o navegador rolaria até ele, regra 17)", () => {
    setup();
    for (const route of Object.values(ROUTES)) {
      expect(document.querySelector(route)).toBeNull();
    }
  });
});
