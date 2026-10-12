import { describe, expect, it } from "vitest";
import { ROUTES, tabFromHash, todayHref } from "./routes.ts";

describe("tabFromHash (P49)", () => {
  it.each([
    ["#normal", "album"],
    ["#desafio", "song"],
    ["#treino", "practice"],
    ["#artistas", "artists"],
    ["#inicio", "home"],
    ["", "home"],
    ["#", "home"],
    ["#nada", "home"],
    ["#NORMAL", "home"],
    // Os links de antes dos dois modos (P101) caem na home.
    ["#musica", "home"],
    ["#album", "home"],
  ])("%j → %s", (hash, tab) => {
    expect(tabFromHash(hash)).toBe(tab);
  });

  it("cada aba volta para o próprio endereço", () => {
    for (const [tab, hash] of Object.entries(ROUTES)) expect(tabFromHash(hash)).toBe(tab);
  });
});

describe("todayHref (botão 'Jogar o novo diário')", () => {
  it("tira o ?date= do desenvolvimento e mantém a aba", () => {
    expect(todayHref("http://localhost:5173/?date=2026-10-08#normal")).toBe(
      "http://localhost:5173/#normal",
    );
  });

  it("sem ?date=, o endereço é o mesmo: null manda recarregar (trocar só o # não recarrega)", () => {
    expect(todayHref("http://localhost:5173/#normal")).toBeNull();
    expect(todayHref("https://x.github.io/musicle-jp/")).toBeNull();
  });

  it("outros parâmetros ficam", () => {
    expect(todayHref("http://localhost:5173/?date=2026-10-08&failAudio=x#treino")).toBe(
      "http://localhost:5173/?failAudio=x#treino",
    );
  });
});
