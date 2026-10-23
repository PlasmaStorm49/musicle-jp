// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animeKey } from "../core/daily.ts";
import { historyDates } from "../core/history.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { AlbumRound, AnimeDay, AnimeSchedule, Day } from "../core/types.ts";
import type { AnimeScheduleLoad } from "./Anime.tsx";
import { History, HistoryCalendar, HistoryDayScreen } from "./History.tsx";

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

// 10 + 0 + 8 = 18 de 30.
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

// A agenda do Anime mínima (só os dias importam para as marcas): o 1º dia (08/10, fora da agenda
// dos Hits) e os dois últimos (20 e 21/10).
const animeRounds = [{ answer: "t:tr:1" }, { answer: "t:tr:1" }, { answer: "t:tr:1" }] as const;
const ANIME_DAY: AnimeDay = {
  number: 3,
  catalogVersion: "teste",
  musica: { facil: [...animeRounds], medio: [...animeRounds], dificil: [...animeRounds] },
  titulo: { facil: [...animeRounds], medio: [...animeRounds], dificil: [...animeRounds] },
};
const ANIME: AnimeSchedule = {
  schemaVersion: 1,
  kind: "anime",
  timezone: "America/Sao_Paulo",
  epoch: "2026-10-08",
  days: { "2026-10-08": ANIME_DAY, "2026-10-20": ANIME_DAY, "2026-10-21": ANIME_DAY },
};
const animeGame = (date: string, finished: FinishedGame): Record<string, FinishedGame> => ({
  [puzzleId(date, animeKey("musica", "facil"))]: finished,
});

describe("HistoryCalendar (P260)", () => {
  // Todos os 14 dias com diário, menos o 1º (08/10), que fica fora da agenda.
  const hitsDates = new Set(historyDates(TODAY).slice(1));
  const setup = (save: Save = emptySave(), animeSchedule: AnimeSchedule | null = null) =>
    render(
      <HistoryCalendar
        save={save}
        today={TODAY}
        hitsDates={hitsDates}
        animeSchedule={animeSchedule}
      />,
    );

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

  it("sem a agenda do Anime (falhou), só a marca dos Hits e a legenda dela", () => {
    setup();
    const cell = screen.getByRole("link", { name: /^Quarta-feira, 21 de outubro/ });
    expect(cell.querySelectorAll(".mark-slot")).toHaveLength(1);
    expect(document.querySelector(".calendar-legends")).toBeNull();
  });

  it("com o Anime, as duas marcas lado a lado: os Hits à esquerda e o Anime à direita (P277)", () => {
    setup(
      withGames({
        [puzzleId("2026-10-21", "album")]: finished,
        ...animeGame("2026-10-21", finished),
      }),
      ANIME,
    );
    const cell = screen.getByRole("link", {
      name: "Quarta-feira, 21 de outubro: Hits, 1 de 2 diários jogados; Anime, ao menos 1 diário jogado",
    });
    const [hits, anime] = [...cell.querySelectorAll(".mark-slot")];
    expect(hits?.querySelector(".mark-some")).not.toBeNull();
    expect(anime?.querySelector(".mark-all")?.textContent).toBe("✓");
    // O dia sem diário do Anime guarda o lugar dele vazio (os Hits ficam à esquerda).
    const day19 = screen.getByRole("link", {
      name: "Segunda-feira, 19 de outubro: Hits, nenhum diário jogado; sem diário do Anime",
    });
    const slots = [...day19.querySelectorAll(".mark-slot")];
    expect(slots).toHaveLength(2);
    expect(slots[1]?.childElementCount).toBe(0);
  });

  it("o dia só com o Anime também é link para a tela dele", () => {
    setup(emptySave(), ANIME);
    const day8 = screen.getByRole("link", {
      name: "Quinta-feira, 8 de outubro: sem diário dos Hits; Anime, nenhum diário jogado",
    });
    expect(day8.getAttribute("href")).toBe("#historico/2026-10-08");
    expect(screen.getAllByRole("link")).toHaveLength(14);
  });

  it("com o Anime, a legenda em duas linhas, com o lado de cada categoria", () => {
    setup(emptySave(), ANIME);
    const legend = document.querySelector(".calendar-legends")?.textContent ?? "";
    expect(legend).toContain("Hits, à esquerda:");
    expect(legend).toContain("Anime, à direita:");
    expect(legend).toContain("ao menos 1 diário");
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
  const setup = (
    save: Save = emptySave(),
    day: Day | null = DAY,
    animeSchedule: AnimeSchedule | null = null,
  ) => render(<HistoryDayScreen date={PAST} day={day} save={save} animeSchedule={animeSchedule} />);
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
    expect(normal.textContent).toContain("terminado, 18 de 30 pontos");
    expect(normal.textContent).toContain("jogado depois");
    expect(normal.classList.contains("next")).toBe(false);
    expect(card(/^Desafio/).classList.contains("next")).toBe(true);
  });

  it("sem a agenda do Anime (falhou), só os dois cartões dos Hits", () => {
    setup();
    expect(document.querySelectorAll(".home-card")).toHaveLength(2);
  });

  it("o cartão do Anime, na linha toda, com quantos terminaram e o endereço do dia", () => {
    setup(withGames(animeGame(PAST, finished)), DAY, ANIME);
    const anime = card(/^Anime/);
    expect(anime.getAttribute("href")).toBe("#anime/2026-10-21");
    expect(anime.textContent).toContain("1 de 6 terminados");
    expect(anime.closest("li")?.classList.contains("wide")).toBe(true);
    // Os Hits ainda por jogar: o oliva é o Normal, e não o Anime.
    expect(anime.classList.contains("next")).toBe(false);
  });

  it("com os dois dos Hits terminados, o Anime é o oliva", () => {
    const hits = { [puzzleId(PAST, "album")]: finished, [puzzleId(PAST, "song")]: finished };
    setup(withGames(hits), DAY, ANIME);
    expect(card(/^Anime/).classList.contains("next")).toBe(true);
  });

  it("sem os Hits no dia, o Anime é o oliva; com os 6 terminados, nenhum", () => {
    setup(emptySave(), null, ANIME);
    expect(card(/^Anime/).classList.contains("next")).toBe(true);
    cleanup();
    const all = Object.fromEntries(
      (["musica", "titulo"] as const).flatMap((mode) =>
        (["facil", "medio", "dificil"] as const).map((level) => [
          puzzleId(PAST, animeKey(mode, level)),
          finished,
        ]),
      ),
    );
    setup(withGames(all), null, ANIME);
    expect(card(/^Anime/).textContent).toContain("6 de 6 terminados");
    expect(document.querySelectorAll(".home-card.next")).toHaveLength(0);
  });

  it("o dia fora da agenda do Anime: o cartão dele apagado", () => {
    const only8: AnimeSchedule = { ...ANIME, days: { "2026-10-08": ANIME_DAY } };
    setup(emptySave(), DAY, only8);
    const off = [...document.querySelectorAll(".home-card.off")];
    expect(off).toHaveLength(1);
    expect(off[0]?.textContent).toContain("Sem diário do Anime");
    // O apagado nunca é o oliva, nem com os Hits terminados.
    cleanup();
    const hits = { [puzzleId(PAST, "album")]: finished, [puzzleId(PAST, "song")]: finished };
    setup(withGames(hits), DAY, only8);
    expect(document.querySelectorAll(".home-card.next")).toHaveLength(0);
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

describe("History: a espera da agenda do Anime (P270)", () => {
  const setup = (anime: AnimeScheduleLoad, date: string | null = null) => {
    const requestAnime = vi.fn();
    render(
      <History
        date={date}
        today={TODAY}
        save={emptySave()}
        hitsDates={new Set(historyDates(TODAY))}
        hitsDay={DAY}
        anime={anime}
        requestAnime={requestAnime}
      />,
    );
    return requestAnime;
  };

  it("sem a agenda, pede uma vez e mostra o Carregando com o foco", () => {
    const requestAnime = setup({ status: "idle" });
    expect(requestAnime).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toBe("Carregando…");
    cleanup();
    // Já carregando (o Anime pediu): não pede de novo.
    expect(setup({ status: "loading" })).not.toHaveBeenCalled();
  });

  it("com a agenda, o calendário com as marcas do Anime; sem ela (falhou), só os Hits", () => {
    expect(setup({ status: "ready", schedule: ANIME })).not.toHaveBeenCalled();
    expect(document.querySelector(".calendar-legends")).not.toBeNull();
    cleanup();
    // A que falhou: pede de novo, uma vez, com o Carregando desde o 1º desenho.
    const again = setup({ status: "retry" });
    expect(again).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toBe("Carregando…");
    cleanup();
    // A de uma versão nova não se pede de novo: só recarregando a página.
    expect(setup({ status: "update" })).not.toHaveBeenCalled();
  });

  it("a agenda que falha de novo não é pedida sem parar", () => {
    const requestAnime = vi.fn();
    const props = {
      date: null,
      today: TODAY,
      save: emptySave(),
      hitsDates: new Set(historyDates(TODAY)),
      hitsDay: DAY,
      requestAnime,
    };
    const { rerender } = render(<History {...props} anime={{ status: "retry" }} />);
    rerender(<History {...props} anime={{ status: "loading" }} />);
    rerender(<History {...props} anime={{ status: "retry" }} />);
    expect(requestAnime).toHaveBeenCalledTimes(1);
    // Depois da 2ª falha, o calendário só com os Hits, com o foco no título.
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Histórico" }),
    );
    expect(document.querySelector(".calendar-legends")).toBeNull();
  });

  it("com uma data, a tela do dia", () => {
    setup({ status: "ready", schedule: ANIME }, PAST);
    expect(screen.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Anime/ }).getAttribute("href")).toBe(
      "#anime/2026-10-21",
    );
  });
});
