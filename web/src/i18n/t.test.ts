import { describe, expect, it } from "vitest";
import { t, tn } from "./t.ts";

describe("t", () => {
  it("substitui parâmetros e mantém os que faltam", () => {
    expect(t("summary.score", { score: 5, max: 18 })).toBe("5 de 18 pontos");
    expect(t("summary.score", { score: 5 })).toBe("5 de {max} pontos");
  });
});

describe("tn (plural)", () => {
  it("1 ponto, 0 e 5 pontos", () => {
    expect(tn("count.points", 1)).toBe("1 ponto");
    expect(tn("count.points", 0)).toBe("0 pontos");
    expect(tn("count.points", 5)).toBe("5 pontos");
  });
});
