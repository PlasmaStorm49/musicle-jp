// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animeDaily, hitsDaily } from "../core/daily.ts";
import type { FinishedGame } from "../core/records.ts";
import { bucketOf, DAY_MAX } from "../core/stats.ts";
import type { AlbumRound, AnimeDay, Day, Target } from "../core/types.ts";
import { Countdown } from "./Countdown.tsx";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { Summary } from "./Summary.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A frase inteira de cada rodada, a do leitor de tela (na tela, a célula é curta). */
const roundTexts = () =>
  [...document.querySelectorAll(".summary-rounds > li > .sr-only")].map((s) => s.textContent);

// 10 + 0 + 8 = 18 de 30; nenhum dado do catálogo (o resumo não tem como revelar a resposta).
const GAME: FinishedGame = {
  number: 3,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] },
  ],
};
const DATE = "2026-10-10";
// O resumo não lê as rodadas: o dia só dá o número e a data ao diário.
const ROUND: AlbumRound = { answer: "t1", options: ["a1", "a2", "a3", "a4"] };
const DAY: Day = {
  number: 3,
  catalogVersion: "teste",
  song: [ROUND, ROUND, ROUND],
  album: [ROUND, ROUND, ROUND],
};
const daily = (target: Target) => hitsDaily(DAY, DATE, target);
/** 23:59:58 de 10/10 em Brasília (UTC-3): faltam 2 s para o próximo diário. */
const TWO_SECONDS_BEFORE = new Date("2026-10-11T02:59:58Z");

describe("Summary (o fim do dia)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  });

  it("título com o foco, pontos, uma célula por rodada, o compartilhar e a contagem", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <Summary
        game={GAME}
        daily={daily("album")}
        history={{ [`${DATE}|album`]: GAME }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        today={DATE}
        announce={vi.fn()}
      />,
    );
    const title = screen.getByRole("heading", { name: "Resultado do dia" });
    expect(document.activeElement).toBe(title);
    expect(screen.getByText("18 de 30 pontos")).toBeTruthy();
    expect(roundTexts()).toEqual([
      "Rodada 1: acertou, 10 pontos",
      "Rodada 2: não acertou",
      "Rodada 3: acertou, 8 pontos",
    ]);
    // Na célula: a rodada, o ✓ ou o X (só desenho) e os pontos.
    const third = document.querySelectorAll(".summary-rounds > li")[2];
    expect(third?.querySelector('[aria-hidden="true"]')?.textContent).toBe("Rodada 3");
    expect(third?.querySelector(".round-points")?.textContent).toBe("8 pontos");
    expect(third?.querySelector("svg.icon-right")).not.toBeNull();
    // Sem a prévia do texto (as células já mostram o resultado); ele sai com o nome do jogo e o
    // modo.
    expect(document.querySelector(".share-preview")).toBeNull();
    // Nos Hits, sem a volta à escolha da dificuldade (a do Anime, ME120).
    expect(document.querySelector(".summary-levels")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      "AteMusic · Normal · 10/10\n18/30\n✅\n❌\n⬛✅\nhttps://x.test/",
    );
    // 12:00 em Brasília: faltam 12 h para o próximo diário.
    expect(screen.getByRole("timer").textContent).toBe("12:00:00");
  });

  it("o diário do Anime: o compartilhar diz a categoria e o diário, e a estatística é só dele (P249)", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const rounds: AnimeDay["musica"]["facil"] = [
      { answer: "t1" },
      { answer: "t2" },
      { answer: "t3" },
    ];
    const modeDay = { facil: rounds, medio: rounds, dificil: rounds };
    const animeDay: AnimeDay = {
      number: 3,
      catalogVersion: "teste",
      musica: modeDay,
      titulo: modeDay,
    };
    const anime = animeDaily(animeDay, DATE, "musica", "facil");
    render(
      <Summary
        game={GAME}
        daily={anime}
        // Os outros diários do mesmo dia não entram na estatística deste.
        history={{
          [`${DATE}|anime-musica-facil`]: GAME,
          [`${DATE}|anime-musica-medio`]: GAME,
          [`${DATE}|song`]: GAME,
        }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        today={DATE}
        announce={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    const [[text]] = writeText.mock.calls as unknown as [[string]];
    expect(text.split("\n").slice(0, 2)).toEqual([
      "AteMusic Anime · Música · Fácil · 10/10",
      "18/30",
    ]);
    expect(text.endsWith("https://x.test/")).toBe(true);
    // Jogos: 1 (só o do Fácil).
    const played = [...document.querySelectorAll(".stats dd")].map((d) => d.textContent);
    expect(played[0]).toBe("1");
  });

  it("a volta com o texto de quem chama, e o outro diário por jogar, em oliva (o usuário, 28/10/2026)", () => {
    render(
      <Summary
        game={GAME}
        daily={daily("album")}
        history={{ [`${DATE}|album`]: GAME }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        today={DATE}
        announce={vi.fn()}
        back={{ href: "#hits", label: "Voltar", labelFull: "Voltar à tela dos Hits" }}
        next={{ href: "#desafio", label: "Jogar o Desafio" }}
      />,
    );
    const next = screen.getByRole("link", { name: "Jogar o Desafio" });
    expect(next.getAttribute("href")).toBe("#desafio");
    expect(next.classList.contains("primary")).toBe(true);
    const back = screen.getByRole("link", { name: "Voltar à tela dos Hits" });
    expect(back.getAttribute("href")).toBe("#hits");
    // Na tela, "Voltar"; o nome inteiro, para o leitor de tela.
    const shown = [...back.querySelectorAll('span[aria-hidden="true"]')].map((s) => s.textContent);
    expect(shown).toContain("Voltar");
  });

  it('a rodada anulada: na célula, sem ícone e com "anulada" no lugar dos pontos', () => {
    const voided: FinishedGame = {
      ...GAME,
      rounds: [{ status: "void", stage: 0, attempts: [] }, ...GAME.rounds.slice(1)],
    };
    render(
      <Summary
        game={voided}
        daily={daily("album")}
        history={{ [`${DATE}|album`]: voided }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        today={DATE}
        announce={vi.fn()}
      />,
    );
    const cell = document.querySelector(".summary-rounds > li.void");
    expect(cell?.querySelector("svg")).toBeNull();
    expect(cell?.querySelector(".round-points")?.textContent).toBe("anulada");
    expect(roundTexts()[0]).toBe("Rodada 1: anulada");
  });

  it("as estatísticas: uma coluna por faixa de 3, a de hoje em destaque e com a altura cheia (ME77, ME107)", () => {
    render(
      <Summary
        game={GAME}
        daily={daily("album")}
        history={{ [`${DATE}|album`]: GAME }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        today={DATE}
        announce={vi.fn()}
      />,
    );
    const buckets = bucketOf(DAY_MAX) + 1;
    expect(document.querySelectorAll(".distribution > li")).toHaveLength(buckets);
    expect(
      document.querySelector<HTMLElement>(".distribution")?.style.getPropertyValue("--buckets"),
    ).toBe(String(buckets));
    const today = document.querySelector<HTMLElement>(".bucket.today");
    // Hoje (18 pontos, na faixa de 18 a 20) é o único jogo: a coluna mais alta, com a contagem e a
    // frase para o leitor. O eixo mostra o começo da faixa.
    expect(today?.querySelector(".bucket-label")?.textContent).toBe("18");
    expect(today?.querySelector<HTMLElement>(".bucket-bar")?.style.getPropertyValue("--h")).toBe(
      "100%",
    );
    expect(today?.querySelector(".sr-only")?.textContent).toBe(
      "18 a 20 pontos: 1 jogo, incluindo hoje",
    );
    expect(
      document
        .querySelector<HTMLElement>(".bucket:not(.today) .bucket-bar")
        ?.style.getPropertyValue("--h"),
    ).toBe("0%");
  });

  it("a rodada com a ajuda (P149): acertou com ajuda, a metade do trecho (ME107)", () => {
    const helped: FinishedGame = {
      number: 3,
      rounds: [
        { status: "won", stage: 3, attempts: ["skip", "skip", "skip", "right"], help: 3 },
        { status: "lost", stage: 0, attempts: ["wrong"] },
        { status: "won", stage: 0, attempts: ["right"] },
      ],
    };
    render(
      <Summary
        game={helped}
        daily={daily("song")}
        history={{ [`${DATE}|song`]: helped }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        today={DATE}
        announce={vi.fn()}
      />,
    );
    expect(screen.getByText("13 de 30 pontos")).toBeTruthy();
    expect(roundTexts()).toContain("Rodada 1: acertou com ajuda, 3 pontos");
    // Na célula também: a ajuda não some da tela.
    expect(document.querySelector(".summary-rounds .round-points")?.textContent).toBe(
      "3 pontos · ajuda",
    );
  });
});

describe("Summary de um dia passado (o Histórico, P263)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
  });

  const pastSummary = (game: FinishedGame) =>
    render(
      <Summary
        game={game}
        daily={daily("album")}
        history={{ [`${DATE}|album`]: game }}
        scheduleDates={[DATE, "2026-10-11"]}
        shareUrl="https://x.test/"
        today="2026-10-11"
        announce={vi.fn()}
      />,
    );

  it("jogado no dia e aberto depois: sem a contagem e sem as estatísticas, com a volta ao dia", () => {
    pastSummary(GAME);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText("Estatísticas")).toBeNull();
    expect(screen.queryByText("Jogado depois: não conta nas estatísticas.")).toBeNull();
    const back = screen.getByRole("link", { name: "Voltar ao dia" });
    expect(back.getAttribute("href")).toBe("#historico/2026-10-10");
  });

  it("jogado depois: a nota e a marca no compartilhar", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    pastSummary({ ...GAME, late: true });
    expect(screen.getByText("Jogado depois: não conta nas estatísticas.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      "AteMusic · Normal · 10/10 (jogado depois)\n18/30\n✅\n❌\n⬛✅\nhttps://x.test/",
    );
  });
});

describe("Countdown (P39: a virada à meia-noite de Brasília)", () => {
  it("chega a zero: anuncia uma vez só e oferece o novo diário", () => {
    vi.useFakeTimers();
    vi.setSystemTime(TWO_SECONDS_BEFORE);
    const announce = vi.fn();
    render(<Countdown date={DATE} announce={announce} />);
    expect(screen.getByRole("timer").textContent).toBe("00:00:02");
    expect(announce).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("O novo diário já está disponível.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jogar o novo diário" })).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith("O novo diário já está disponível.");
  });

  it("já zerada ao abrir: mostra o botão sem anunciar (não é novidade)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T03:00:05Z"));
    const announce = vi.fn();
    render(<Countdown date={DATE} announce={announce} />);
    expect(screen.getByRole("button", { name: "Jogar o novo diário" })).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
    // A frase fica para o leitor de tela: na tela, o botão já diz o mesmo.
    expect(screen.getByText("O novo diário já está disponível.").classList).toContain("sr-only");
  });

  it("o 2º clique de um toque duplo no Jogar o novo diário não recarrega (regra 23)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T03:00:05Z"));
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    render(<Countdown date={DATE} announce={vi.fn()} />);
    const play = screen.getByRole("button", { name: "Jogar o novo diário" });
    fireEvent.click(play, { detail: 2 });
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(play, { detail: 1 });
    expect(reload.mock.calls.length + assign.mock.calls.length).toBe(1);
  });

  it("a aba que volta a ficar visível recalcula pelo relógio (os timers atrasam em segundo plano)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T02:00:00Z")); // falta 1 h
    render(<Countdown date={DATE} announce={vi.fn()} />);
    expect(screen.getByRole("timer").textContent).toBe("01:00:00");
    vi.setSystemTime(new Date("2026-10-11T02:30:00Z")); // o relógio andou sem tique
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByRole("timer").textContent).toBe("00:30:00");
  });
});

describe("ShareButton", () => {
  const TEXT = "AteMusic · Desafio nº 1\n10/30";

  it('copiou: o botão diz "Copiado!" por 2 s, e o aria-live avisa com a frase inteira', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const announce = vi.fn();
    render(<ShareButton text={TEXT} announce={announce} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    expect(writeText).toHaveBeenCalledWith(TEXT);
    // Na tela, "Copiado!"; o nome do botão focado continua o mesmo (o aviso vem pelo aria-live).
    const button = screen.getByRole("button", { name: "Compartilhar resultado" });
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe("Copiado!");
    expect(announce).toHaveBeenCalledWith("Resultado copiado. É só colar onde quiser.");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(button.textContent).toBe("Compartilhar resultado");
  });

  it("o 2º clique de um toque duplo não copia de novo (regra 23)", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ShareButton text={TEXT} announce={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }), {
        detail: 2,
      });
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each([
    ["sem área de transferência (fora de HTTPS)", {}],
    ["com a cópia recusada", { clipboard: { writeText: () => Promise.reject(new Error("não")) } }],
  ])("%s: mostra o texto selecionado para copiar à mão", async (_, nav) => {
    vi.stubGlobal("navigator", nav);
    render(<ShareButton text={TEXT} announce={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    const field = screen.getByRole("textbox", {
      name: /Copie o texto abaixo/,
    }) as HTMLTextAreaElement;
    expect(field.value).toBe(TEXT);
    expect(field.readOnly).toBe(true);
    expect(document.activeElement).toBe(field);
  });
});

describe("FocusedNotice (regra 16)", () => {
  it("leva o foco ao montar, sem entrar na ordem do Tab", () => {
    render(<FocusedNotice text="Não há diário hoje." />);
    const notice = screen.getByText("Não há diário hoje.");
    expect(document.activeElement).toBe(notice);
    expect(notice.getAttribute("tabindex")).toBe("-1");
  });
});
