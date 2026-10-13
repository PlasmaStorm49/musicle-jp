import { describe, expect, it } from "vitest";
import { type KeyValueStore, memoryStore, SAVE_KEY } from "./save.ts";
import { readTheme, THEME_KEY, writeTheme } from "./theme.ts";

const throwing: KeyValueStore = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("cota cheia");
  },
  removeItem: () => {
    throw new Error("bloqueado");
  },
};

describe("readTheme", () => {
  it("sem nada salvo: Automático", () => {
    expect(readTheme(memoryStore())).toBe("auto");
  });

  it.each(["light", "dark"] as const)("o salvo volta (%s)", (choice) => {
    expect(readTheme(memoryStore({ [THEME_KEY]: choice }))).toBe(choice);
  });

  it.each(["auto", "Dark", "", "{}"])("valor estranho (%j): Automático", (value) => {
    expect(readTheme(memoryStore({ [THEME_KEY]: value }))).toBe("auto");
  });

  it("armazenamento que lança na leitura: Automático", () => {
    expect(readTheme(throwing)).toBe("auto");
  });
});

describe("writeTheme", () => {
  it("grava Claro e Escuro na chave própria, sem tocar no save", () => {
    const store = memoryStore({ [SAVE_KEY]: "intacto" });
    expect(writeTheme(store, "dark")).toBe(true);
    expect(store.getItem(THEME_KEY)).toBe("dark");
    expect(writeTheme(store, "light")).toBe(true);
    expect(readTheme(store)).toBe("light");
    expect(store.getItem(SAVE_KEY)).toBe("intacto");
  });

  it("o Automático apaga a chave", () => {
    const store = memoryStore({ [THEME_KEY]: "dark" });
    expect(writeTheme(store, "auto")).toBe(true);
    expect(store.getItem(THEME_KEY)).toBeNull();
  });

  it("armazenamento que lança: devolve false", () => {
    expect(writeTheme(throwing, "dark")).toBe(false);
    expect(writeTheme(throwing, "auto")).toBe(false);
  });
});
