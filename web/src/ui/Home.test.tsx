// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { PracticeScore } from "../core/practice.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import type { Day, SongRound } from "../core/types.ts";
import { Home } from "./Home.tsx";

afterEach(cleanup);

// Dia mínimo no próprio arquivo (web/CLAUDE.md, regra 14): a home só lê o número.
const round: SongRound = { answer: "t:tr:1", options: ["t:tr:1", "t:tr:2", "t:tr:3", "t:tr:4"] };
const DAY: Day = {
  number: 7,
  catalogVersion: "teste",
  song: [round, round, round],
  album: [round, round, round],
};
const DATE = "2026-10-17";

// 6 + 0 + 5 = 11 de 18.
const finished: FinishedGame = {
  answerMode: "choice",
  number: 7,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["skip", "right"] },
  ],
};

function setup(
  save: Save = emptySave(),
  day: Day | null = DAY,
  practice: PracticeScore | null = null,
) {
  render(<Home day={day} date={DATE} save={save} practice={practice} />);
}

const card = (name: RegExp) => screen.getByRole("link", { name });

describe("Home", () => {
  it("o nome do jogo no título, com o foco ao abrir (regra 16)", () => {
    setup();
    const title = screen.getByRole("heading", { level: 1, name: "AteMusic" });
    expect(document.activeElement).toBe(title);
  });

  it("um cartão-link por modo, para a aba de cada um", () => {
    setup();
    expect(card(/^Diário Música/).getAttribute("href")).toBe("#musica");
    expect(card(/^Diário Álbum/).getAttribute("href")).toBe("#album");
    expect(card(/^Treino/).getAttribute("href")).toBe("#treino");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("dia novo: o número do desafio", () => {
    setup();
    expect(card(/^Diário Música/).textContent).toContain("nº 7 · novo");
  });

  it("o estado de cada diário: em andamento e terminado com os pontos", () => {
    const save: Save = {
      ...emptySave(),
      history: { [puzzleId(DATE, "song")]: finished },
      inProgress: { [puzzleId(DATE, "album")]: { answerMode: "typing", events: [] } },
    };
    setup(save);
    expect(card(/^Diário Música/).textContent).toContain("nº 7 · terminado, 11 de 18 pontos");
    expect(card(/^Diário Álbum/).textContent).toContain("nº 7 · em andamento, digitação");
  });

  it('dia todo anulado: terminado, sem "0 de 0 pontos"', () => {
    const voided: FinishedGame = {
      ...finished,
      rounds: finished.rounds.map(() => ({ status: "void", stage: 0, attempts: [] })),
    };
    setup({ ...emptySave(), history: { [puzzleId(DATE, "song")]: voided } });
    expect(card(/^Diário Música/).textContent).toContain("nº 7 · terminado");
    expect(card(/^Diário Música/).textContent).not.toContain("pontos");
  });

  it("dia fora da agenda: os diários avisam sem link (não há para onde ir), e o Treino continua", () => {
    setup(emptySave(), null);
    expect(screen.queryByRole("link", { name: /^Diário/ })).toBeNull();
    expect(screen.getAllByText("Não há desafio hoje")).toHaveLength(2);
    expect(card(/^Treino/).getAttribute("href")).toBe("#treino");
  });

  it("nenhum id igual a uma rota (o navegador rolaria até ele, regra 17)", () => {
    setup();
    for (const route of ["#inicio", "#musica", "#album", "#treino"]) {
      expect(document.querySelector(route)).toBeNull();
    }
  });

  it("o placar da sessão do Treino aparece só depois da 1ª rodada", () => {
    setup(emptySave(), DAY, null); // practiceSummary devolve null antes disso
    expect(card(/^Treino/).textContent).not.toContain("Nesta sessão");
    cleanup();
    setup(emptySave(), DAY, { points: 11, rounds: 3 });
    expect(card(/^Treino/).textContent).toContain("Nesta sessão: 11 pontos em 3 rodadas");
  });
});
