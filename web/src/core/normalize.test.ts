import { describe, expect, it } from "vitest";
import { readVectors } from "../../test/vectors.ts";
import { looseKey, normalize, searchKey } from "./normalize.ts";

type Case = { in: string; out: string; note?: string };
const vectors = readVectors<{ normalize: Case[]; looseKey: Case[] }>("normalize.json");

describe("normalize: vetores compartilhados com o Python", () => {
  it.each(vectors.normalize)("$in → $out", (c) => {
    expect(normalize(c.in)).toBe(c.out);
  });
});

describe("looseKey: vetores compartilhados com o Python", () => {
  it.each(vectors.looseKey)("$in → $out", (c) => {
    expect(looseKey(c.in)).toBe(c.out);
  });
});

describe("propriedades", () => {
  it("normalize é idempotente em todo o plano básico", () => {
    const failures: string[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue; // surrogates não são caracteres
      const once = normalize(String.fromCodePoint(cp));
      if (normalize(once) !== once) failures.push(cp.toString(16));
    }
    expect(failures).toEqual([]);
  });

  it("dakuten sobrevive e katakana vira hiragana", () => {
    for (const kana of "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ") {
      expect(normalize(kana)).toBe(kana);
      expect(normalize(String.fromCodePoint((kana.codePointAt(0) ?? 0) + 0x60))).toBe(kana);
    }
  });

  it("searchKey aplica as duas etapas", () => {
    expect(searchKey("TŌKYŌ")).toBe("tokyo");
    expect(searchKey("Toukyou")).toBe("tokyo");
  });
});
