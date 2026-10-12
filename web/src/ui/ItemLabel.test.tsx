// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemView } from "../core/view.ts";
import { ItemLabel } from "./ItemLabel.tsx";

afterEach(cleanup);

const item = (artistLatin: string | null): ItemView => ({
  id: "fixture:tr:tr37",
  title: "灯台",
  titleLatin: "Tōdai",
  artist: "ミナト",
  artistLatin,
  artworkUrl: null,
  lang: "ja",
  artistLang: "ja",
});

describe("ItemLabel: o artista com o latino na mesma linha (ME55)", () => {
  it("o japonês com lang ja, o separador só visual e o latino sem lang", () => {
    const { container } = render(<ItemLabel item={item("Minato")} />);
    expect(container.querySelector(".item-artist")?.textContent).toBe("ミナト · Minato");
    expect(screen.getByText("ミナト").getAttribute("lang")).toBe("ja");
    const separator = screen.getByText("·");
    expect(separator.getAttribute("aria-hidden")).toBe("true");
    // Os espaços ficam fora do separador oculto: dentro dele, o leitor de tela colaria os nomes.
    expect(separator.textContent).toBe("·");
    expect(separator.previousSibling?.textContent).toBe(" ");
    expect(screen.getByText("Minato").hasAttribute("lang")).toBe(false);
  });

  it("sem latino: só o nome, sem separador", () => {
    const { container } = render(<ItemLabel item={item(null)} />);
    expect(container.querySelector(".item-artist")?.textContent).toBe("ミナト");
  });
});
