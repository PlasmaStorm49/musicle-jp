// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { historyDates } from "../core/history.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { AlbumRound, Day } from "../core/types.ts";
import { HistoryCalendar, HistoryDayScreen } from "./History.tsx";

afterEach(cleanup);

// Dia mínimo no próprio arquivo (web/CLAUDE.md, regra 14): a tela só lê o número.
const song = { answer: "t:tr:1" };
const album: AlbumRound = { answer: "t:tr:1", options: ["t:al:1", "t:al:2", "t:al:3", "t:al:4"] };
const DAY: Day = {
  number: 14,
  catalogVersion: "teste",
  song: [song, song, song],
  album: [album, album, album],
};
const TODAY = "2026-10-22";
const PAST = "2026-10-21";

// 6 + 0 + 5 = 11 de 18.
const finished: FinishedGame = {
  number: 14,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] },
  ],
};
const withGames = (games: Record<string, FinishedGame>): Save => ({
  ...emptySave(),
  history: games,
});

describe("HistoryCalendar (P260)", () => {
  // Todos os 14 dias com diário, menos o 1º (08/10), que fica fora da agenda.
  const hitsDates = new Set(historyDates(TODAY).slice(1));
  const setup = (save: Save = emptySave()) =>
    render(<HistoryCalendar save={save} today={TODAY} hitsDates={hitsDates} />);

  it("o título com o foco (regra 16) e os 14 dias, do mais antigo a ontem", () => {
    setup();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Histórico" }),
    );
    const cells = [...document.querySelectorAll(".calendar-days > li")];
    expect(cells).toHaveLength(14);
    expect(cells[0]?.querySelector(".calendar-num")?.textContent).toBe("8");
    expect(cells[13]?.querySelector(".calendar-num")?.textContent).toBe("21");
  });

  it("o cabeçalho começa pelo dia da semana de hoje − 14 (08/10/2026, uma quinta)", () => {
    setup();
    const weekdays = [...document.querySelectorAll(".calendar-weekday")].map((s) => s.textContent);
    expect(weekdays).toEqual(["Qui", "Sex", "Sáb", "Dom", "Seg", "Ter", "Qua"]);
  });

  it("o dia com diário é link para a tela dele; o sem diário, não", () => {
    setup();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(13);
    expect(links[0]?.getAttribute("href")).toBe("#historico/2026-10-09");
    expect(links.at(-1)?.getAttribute("href")).toBe("#historico/2026-10-21");
    const off = document.querySelector(".calendar-day.off");
    expect(off?.textContent).toContain("Quinta-feira, 8 de outubro: sem diário");
  });

  it("a marca dos Hits e o nome do dia para o leitor de tela", () => {
    setup(
      withGames({
        [puzzleId("2026-10-20", "album")]: finished,
        [puzzleId("2026-10-21", "album")]: finished,
        [puzzleId("2026-10-21", "song")]: { ...finished, late: true },
      }),
    );
    expect(
      screen.getByRole("link", { name: "Quarta-feira, 21 de outubro: Hits, os 2 diários jogados" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Terça-feira, 20 de outubro: Hits, 1 de 2 diários jogados",
      }),
    ).toBeTruthy();
    const day19 = screen.getByRole("link", {
      name: "Segunda-feira, 19 de outubro: Hits, nenhum diário jogado",
    });
    expect(day19.querySelector(".mark-none")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: /^Quarta-feira, 21 de outubro/ }).querySelector(".mark-all")
        ?.textContent,
    ).toBe("✓");
    expect(
      screen.getByRole("link", { name: /^Terça-feira, 20 de outubro/ }).querySelector(".mark-some"),
    ).not.toBeNull();
  });

  it("o toque duplo num dia não segue o link no 2º clique (regra 23)", () => {
    setup();
    const day = screen.getAllByRole("link")[0] as HTMLElement;
    const second = createEvent.click(day, { detail: 2 });
    fireEvent(day, second);
    expect(second.defaultPrevented).toBe(true);
  });

  it("nenhum id da tela é igual a uma rota (regra 17)", () => {
    setup();
    const routes = new Set(Object.values(ROUTES).map((hash) => hash.slice(1)));
    for (const el of document.querySelectorAll("[id]")) expect(routes.has(el.id)).toBe(false);
  });
});

describe("HistoryDayScreen (P261 a P263)", () => {
  const setup = (save: Save = emptySave(), day: Day | null = DAY) =>
    render(<HistoryDayScreen date={PAST} day={day} save={save} />);
  const card = (name: RegExp) => screen.getByRole("link", { name });

  it("o título com o dia, com o foco, e os dois diários com o endereço do dia", () => {
    setup();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" }),
    );
    expect(card(/^Normal/).getAttribute("href")).toBe("#normal/2026-10-21");
    expect(card(/^Desafio/).getAttribute("href")).toBe("#desafio/2026-10-21");
    expect(screen.getByRole("link", { name: "Voltar ao Histórico" }).getAttribute("href")).toBe(
      "#historico",
    );
  });

  it("o 1º por jogar é o oliva, e o jogado depois leva a marca numa linha a mais", () => {
    setup(withGames({ [puzzleId(PAST, "album")]: { ...finished, late: true } }));
    const normal = card(/^Normal/);
    expect(normal.textContent).toContain("terminado, 11 de 18 pontos");
    expect(normal.textContent).toContain("jogado depois");
    expect(normal.classList.contains("next")).toBe(false);
    expect(card(/^Desafio/).classList.contains("next")).toBe(true);
  });

  it("o jogado no dia não leva a marca", () => {
    setup(withGames({ [puzzleId(PAST, "album")]: finished }));
    expect(card(/^Normal/).textContent).not.toContain("jogado depois");
  });

  it("sem o dia na agenda, os dois cartões apagados, sem link", () => {
    setup(emptySave(), null);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["#historico"]);
    expect(document.querySelectorAll(".home-card.off")).toHaveLength(2);
    expect(screen.getAllByText("Não há diário nesse dia.")).toHaveLength(2);
  });
});
