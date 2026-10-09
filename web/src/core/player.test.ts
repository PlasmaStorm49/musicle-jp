import { describe, expect, it } from "vitest";
import { BAR_SECONDS, fillFraction, segments, unlockedFraction } from "./player.ts";

describe("segments", () => {
  it("na primeira etapa só o primeiro pedaço está liberado", () => {
    expect(segments(0).map((s) => s.unlocked)).toEqual([true, false, false, false, false, false]);
  });

  it("na etapa 3 os quatro primeiros estão liberados, com os pesos do Heardle", () => {
    expect(segments(3)).toEqual([
      { weight: 1, unlocked: true },
      { weight: 1, unlocked: true },
      { weight: 2, unlocked: true },
      { weight: 3, unlocked: true },
      { weight: 4, unlocked: false },
      { weight: 5, unlocked: false },
    ]);
  });
});

describe("frações da barra", () => {
  it("o liberado cresce com a etapa até a barra inteira", () => {
    expect(BAR_SECONDS).toBe(16);
    expect(unlockedFraction(0)).toBe(1 / 16);
    expect(unlockedFraction(2)).toBe(4 / 16);
    expect(unlockedFraction(5)).toBe(1);
  });

  it("o preenchimento acompanha o tempo e para no liberado", () => {
    expect(fillFraction(0, 2)).toBe(0);
    expect(fillFraction(2, 2)).toBe(2 / 16);
    expect(fillFraction(9, 2)).toBe(4 / 16);
    expect(fillFraction(-1, 2)).toBe(0);
  });
});
