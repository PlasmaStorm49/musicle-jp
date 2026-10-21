import { describe, expect, it } from "vitest";
import { memoryStore, SAVE_KEY } from "./save.ts";
import { readVolume, VOLUME_KEY, writeVolume } from "./volume.ts";

/** Um armazenamento que lança em tudo (cookies bloqueados). */
const broken = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("bloqueado");
  },
  removeItem: () => {
    throw new Error("bloqueado");
  },
};

describe("readVolume", () => {
  it("sem nada salvo, o volume cheio", () => {
    expect(readVolume(memoryStore())).toBe(1);
  });

  it("o salvo volta como foi gravado, também o mudo", () => {
    const store = memoryStore();
    store.setItem(VOLUME_KEY, "0.35");
    expect(readVolume(store)).toBe(0.35);
    store.setItem(VOLUME_KEY, "0");
    expect(readVolume(store)).toBe(0);
  });

  it("valor estranho ou fora de 0 a 1: o volume cheio", () => {
    const store = memoryStore();
    for (const raw of ["", "alto", "1.5", "-0.2", "NaN"]) {
      store.setItem(VOLUME_KEY, raw);
      expect(readVolume(store), raw).toBe(1);
    }
  });

  it("armazenamento que lança: o volume cheio", () => {
    expect(readVolume(broken)).toBe(1);
  });
});

describe("writeVolume", () => {
  it("grava na chave própria, sem tocar no save, e limita entre 0 e 1", () => {
    const store = memoryStore();
    expect(writeVolume(store, 0.5)).toBe(true);
    expect(store.getItem(VOLUME_KEY)).toBe("0.5");
    expect(store.getItem(SAVE_KEY)).toBeNull();
    writeVolume(store, 3);
    expect(store.getItem(VOLUME_KEY)).toBe("1");
  });

  it("armazenamento que lança: devolve false", () => {
    expect(writeVolume(broken, 0.5)).toBe(false);
  });
});
