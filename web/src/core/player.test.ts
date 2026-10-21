import { describe, expect, it } from "vitest";
import {
  BAR_SECONDS,
  barSeconds,
  clampSeek,
  fillFraction,
  SEEK_TAIL,
  seekSeconds,
  segments,
  unlockedFraction,
} from "./player.ts";

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

describe("a barra de outro modo (o Superfan, ME61: 1, 4 e 9 s)", () => {
  const SUPERFAN = [1, 4, 9];

  it("os pedaços somam o que cada etapa acrescenta: 1, 3 e 5 s", () => {
    expect(segments(1, SUPERFAN)).toEqual([
      { weight: 1, unlocked: true },
      { weight: 3, unlocked: true },
      { weight: 5, unlocked: false },
    ]);
    expect(barSeconds(SUPERFAN)).toBe(9);
  });

  it("o liberado e o preenchimento são frações dos 9 s", () => {
    expect(unlockedFraction(0, SUPERFAN)).toBe(1 / 9);
    expect(unlockedFraction(1, SUPERFAN)).toBe(4 / 9);
    expect(unlockedFraction(9, SUPERFAN)).toBe(1); // além da última, fica nela
    expect(fillFraction(6, 1, SUPERFAN)).toBe(4 / 9);
  });
});

describe("o toque na barra (P224)", () => {
  it("leva ao ponto da fração, dentro do liberado", () => {
    // A barra dos diários tem 16 s; com 4 s liberados, o meio do liberado é 2 s.
    expect(seekSeconds(2 / 16, BAR_SECONDS, 4)).toBe(2);
    expect(seekSeconds(0, BAR_SECONDS, 4)).toBe(0);
  });

  it("na parte fechada, nada: o toque não entrega som novo", () => {
    expect(seekSeconds(4 / 16, BAR_SECONDS, 4)).toBeNull();
    expect(seekSeconds(0.9, BAR_SECONDS, 4)).toBeNull();
  });

  it("perto do fim do liberado, recua até sobrar um pedaço para tocar", () => {
    expect(seekSeconds(3.9 / 16, BAR_SECONDS, 4)).toBe(4 - SEEK_TAIL);
    // Com 1 s liberado, o toque no fim toca o último meio segundo.
    expect(seekSeconds(0.99 / 16, BAR_SECONDS, 1)).toBe(0.5);
  });

  it("fora da barra ou sem nada liberado, nada; antes do começo, o começo", () => {
    expect(seekSeconds(Number.NaN, BAR_SECONDS, 4)).toBeNull();
    expect(seekSeconds(0.1, 0, 4)).toBeNull();
    expect(seekSeconds(0.1, BAR_SECONDS, 0)).toBeNull();
    expect(seekSeconds(-0.2, BAR_SECONDS, 4)).toBe(0);
  });

  it("o teclado anda dentro do liberado", () => {
    expect(clampSeek(-1, 4)).toBe(0);
    expect(clampSeek(10, 4)).toBe(4 - SEEK_TAIL);
    expect(clampSeek(2, 4)).toBe(2);
  });
});
