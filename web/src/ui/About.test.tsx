// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { ROUTES } from "../core/routes.ts";
import { About, ISSUES_URL } from "./About.tsx";

afterEach(cleanup);

describe("About (o Sobre e privacidade, P243)", () => {
  it("o título, com o foco ao abrir (regra 16), na raiz .screen (regra 25)", () => {
    render(<About />);
    const title = screen.getByRole("heading", { level: 1, name: "Sobre e privacidade" });
    expect(document.activeElement).toBe(title);
    expect(title.closest(".screen")?.classList.contains("about")).toBe(true);
  });

  it("as fontes, cada uma com o seu link, em outra aba (P241); o MyAnimeList sem logo (P256)", () => {
    render(<About />);
    const links = screen
      .getAllByRole("link")
      .map((a) => ({ name: a.textContent, href: a.getAttribute("href") }));
    expect(links).toEqual([
      { name: "Apple Music (abre em outra aba)", href: "https://music.apple.com" },
      { name: "AnimeThemes (abre em outra aba)", href: "https://animethemes.moe" },
      { name: "AnisongDB (abre em outra aba)", href: "https://anisongdb.com" },
      { name: "MyAnimeList (abre em outra aba)", href: "https://myanimelist.net" },
      { name: "as Issues do GitHub (abre em outra aba)", href: ISSUES_URL },
    ]);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(document.querySelector("img")).toBeNull();
  });

  it("a privacidade: o jogo não coleta dados, e o progresso fica no navegador", () => {
    render(<About />);
    expect(screen.getByRole("heading", { name: "Privacidade" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("O jogo não coleta dados pessoais.");
    expect(text).toContain("localStorage");
    expect(text).toContain("As prévias e as capas vêm direto da Apple.");
  });

  it("o contato pelas Issues do GitHub (P258), sem e-mail", () => {
    render(<About />);
    expect(ISSUES_URL).toBe("https://github.com/PlasmaStorm49/musicle-jp/issues");
    expect(screen.getByRole("heading", { name: "Contato" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/@\w/);
  });

  it("nenhum id igual a uma rota (regra 17)", () => {
    render(<About />);
    for (const route of Object.values(ROUTES)) expect(document.querySelector(route)).toBeNull();
  });
});
