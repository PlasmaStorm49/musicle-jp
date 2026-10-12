// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedGame } from "../core/records.ts";
import { Countdown } from "./Countdown.tsx";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { Summary } from "./Summary.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// 6 + 0 + 5 = 11 de 18; nenhum dado do catálogo (o resumo não tem como revelar a resposta).
const GAME: FinishedGame = {
  number: 3,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["right"] },
  ],
};
const DATE = "2026-10-10";
/** 23:59:58 de 10/10 em Brasília (UTC-3): faltam 2 s para o próximo diário. */
const TWO_SECONDS_BEFORE = new Date("2026-10-11T02:59:58Z");

describe("Summary (o fim do dia)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  });

  it("título com o foco, pontos, uma linha por rodada, o compartilhar e a contagem", () => {
    render(
      <Summary
        game={GAME}
        target="album"
        date={DATE}
        history={{ [`${DATE}|album`]: GAME }}
        scheduleDates={[DATE]}
        shareUrl="https://x.test/"
        announce={vi.fn()}
      />,
    );
    const title = screen.getByRole("heading", { name: "Resultado do dia" });
    expect(document.activeElement).toBe(title);
    expect(screen.getByText("11 de 18 pontos")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toContain(
      "Rodada 3: acertou, 5 pontos",
    );
    // O texto do compartilhar sai com o nome do jogo e o modo.
    expect(document.querySelector(".share-preview")?.textContent).toBe(
      "AteMusic · Normal nº 3\n11/18\n✅\n❌\n⬛✅\nhttps://x.test/",
    );
    // 12:00 em Brasília: faltam 12 h para o próximo diário.
    expect(screen.getByRole("timer").textContent).toBe("12:00:00");
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
  const TEXT = "AteMusic · Desafio nº 1\n6/18";

  it("copiou: avisa na tela e no aria-live", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const announce = vi.fn();
    render(<ShareButton text={TEXT} announce={announce} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(screen.getByText("Resultado copiado. É só colar onde quiser.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Resultado copiado. É só colar onde quiser.");
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
