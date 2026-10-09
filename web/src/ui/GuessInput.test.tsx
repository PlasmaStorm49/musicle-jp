// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemView } from "../core/view.ts";
import { GuessInput, type Suggestion } from "./GuessInput.tsx";

// Sem globais no Vitest, a Testing Library não limpa o DOM sozinha entre os testes.
afterEach(cleanup);

const item = (id: string, title: string): ItemView => ({
  id,
  title,
  titleLatin: null,
  artist: "Artista",
  artworkUrl: null,
  lang: undefined,
});

const SUGGESTIONS: Suggestion[] = [
  { id: "a", item: item("a", "Alpha"), tried: false },
  { id: "b", item: item("b", "Beta"), tried: true },
  { id: "c", item: item("c", "Gamma"), tried: false },
];

function setup() {
  const suggest = vi.fn((query: string) => (query ? SUGGESTIONS : []));
  const onPick = vi.fn();
  render(
    <>
      <h2 id="question">Qual é a música?</h2>
      <GuessInput suggest={suggest} onPick={onPick} labelledBy="question" target="song" />
    </>,
  );
  const box = screen.getByRole("combobox", { name: "Qual é a música?" }) as HTMLInputElement;
  return { box, suggest, onPick };
}

const type = (box: HTMLInputElement, value: string) => fireEvent.input(box, { target: { value } });
const key = (box: HTMLInputElement, name: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(box, { key: name, ...init });

describe("GuessInput (combobox da WAI-ARIA 1.2)", () => {
  it("fechado e sem opção ativa até digitar", () => {
    const { box } = setup();
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(box.getAttribute("aria-autocomplete")).toBe("list");
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
    expect(box.getAttribute("autocomplete")).toBe("off");
  });

  it("digitar abre a lista; setas movem a opção ativa e Enter escolhe", () => {
    const { box, onPick } = setup();
    type(box, "al");
    expect(box.getAttribute("aria-expanded")).toBe("true");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options.every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);

    key(box, "ArrowDown");
    const first = screen.getAllByRole("option")[0];
    expect(box.getAttribute("aria-activedescendant")).toBe(first?.id);
    expect(first?.getAttribute("aria-selected")).toBe("true");

    key(box, "Enter");
    expect(onPick).toHaveBeenCalledWith("a");
    expect(box.value).toBe("");
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  it("seta para cima a partir do nada vai para a última", () => {
    const { box } = setup();
    type(box, "x");
    key(box, "ArrowUp");
    expect(box.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[2]?.id);
  });

  it("Enter sem opção ativa não escolhe nada", () => {
    const { box, onPick } = setup();
    type(box, "x");
    key(box, "Enter");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("música já tentada aparece marcada e não é escolhível", () => {
    const { box, onPick } = setup();
    type(box, "x");
    const tried = screen.getAllByRole("option")[1] as HTMLElement;
    expect(tried.getAttribute("aria-disabled")).toBe("true");
    expect(tried.textContent).toContain("já tentou");
    key(box, "ArrowDown");
    key(box, "ArrowDown");
    key(box, "Enter");
    fireEvent.click(tried);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("clique escolhe, e o mousedown não tira o foco do campo antes do clique", () => {
    const { box, onPick } = setup();
    type(box, "x");
    const last = screen.getAllByRole("option")[2] as HTMLElement;
    expect(fireEvent.mouseDown(last)).toBe(false); // preventDefault
    fireEvent.click(last);
    expect(onPick).toHaveBeenCalledWith("c");
  });

  it("Esc fecha a lista; outro Esc limpa o campo", () => {
    const { box } = setup();
    type(box, "x");
    key(box, "Escape");
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(box.value).toBe("x");
    key(box, "Escape");
    expect(box.value).toBe("");
  });

  it("IME: durante a composição, a busca ignora o latim que ainda está virando kana", () => {
    const { box, suggest } = setup();
    fireEvent.compositionStart(box);
    type(box, "とうk");
    expect(suggest).toHaveBeenLastCalledWith("とう");
    fireEvent.compositionEnd(box);
    expect(suggest).toHaveBeenLastCalledWith("とうk");
  });

  it("IME: romaji puro em composição (teclado do celular) continua buscando", () => {
    const { box, suggest } = setup();
    fireEvent.compositionStart(box);
    type(box, "kaat");
    expect(suggest).toHaveBeenLastCalledWith("kaat");
  });

  it.each([
    ["latim em largura cheia (IME do Windows)", "とうｋ", "とう"],
    ["latim depois de ー", "かーt", "かー"],
  ])("IME: %s também fica fora da busca", (_, typed, searched) => {
    const { box, suggest } = setup();
    fireEvent.compositionStart(box);
    type(box, typed);
    expect(suggest).toHaveBeenLastCalledWith(searched);
  });

  it("a opção ativa rola para a área visível da lista", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { box } = setup();
    type(box, "x");
    key(box, "ArrowUp");
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
    expect(scroll.mock.contexts.at(-1)).toBe(screen.getAllByRole("option")[2]);
  });

  it("sair do campo fecha a lista e esquece a opção ativa; clicar no campo reabre", () => {
    const { box } = setup();
    type(box, "x");
    key(box, "ArrowDown");
    key(box, "ArrowDown");
    fireEvent.blur(box);
    expect(box.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(box);
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("a contagem de sugestões é anunciada depois de uma pausa, e não com a lista fechada", () => {
    vi.useFakeTimers();
    try {
      const { box } = setup();
      const status = screen.getByRole("status");
      // act(): o setStatus roda no timer, e o Preact só redesenha dentro de um act.
      type(box, "x");
      expect(status.textContent).toBe("");
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(status.textContent).toBe("3 sugestões");
      type(box, "xy");
      key(box, "Escape");
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(status.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("IME: o Enter que confirma a conversão não escolhe a opção", () => {
    const { box, onPick } = setup();
    type(box, "x");
    key(box, "ArrowDown");
    key(box, "Enter", { isComposing: true });
    key(box, "Enter", { keyCode: 229 });
    expect(onPick).not.toHaveBeenCalled();
  });
});
