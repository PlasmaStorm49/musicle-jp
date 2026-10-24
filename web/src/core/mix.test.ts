import { describe, expect, it } from "vitest";
import { MAX_BOOST, mixGains, mixHeadroom, rmsOf } from "./mix.ts";

/** Um seno de amplitude `a`: a energia dele é a / √2. */
function sine(a: number, length = 4410): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) data[i] = a * Math.sin((2 * Math.PI * 441 * i) / 44100);
  return data;
}

describe("rmsOf: a energia das amostras", () => {
  it("o seno de amplitude 0,5 tem energia 0,5/√2, somando os dois canais", () => {
    expect(rmsOf([sine(0.5), sine(0.5)])).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });

  it("sem amostras, e no silêncio, é 0", () => {
    expect(rmsOf([])).toBe(0);
    expect(rmsOf([new Float32Array(0)])).toBe(0);
    expect(rmsOf([new Float32Array(100)])).toBe(0);
  });
});

describe("mixHeadroom: a folga da soma", () => {
  it("1 prévia não perde nada; 2, 3 e 4 ficam com 1/√n", () => {
    expect(mixHeadroom(1)).toBe(1);
    expect(mixHeadroom(0)).toBe(1);
    expect(mixHeadroom(2)).toBeCloseTo(1 / Math.SQRT2);
    expect(mixHeadroom(4)).toBeCloseTo(0.5);
  });
});

describe("mixGains: todas com a mesma energia, com a folga", () => {
  it("prévias iguais ficam só com a folga", () => {
    const [a, b] = mixGains([0.2, 0.2]);
    expect(a).toBeCloseTo(1 / Math.SQRT2);
    expect(b).toBeCloseTo(1 / Math.SQRT2);
  });

  it("a mais alta abaixa e a mais baixa sobe, até a média geométrica", () => {
    const rms = [0.4, 0.1];
    const gains = mixGains(rms);
    const heard = rms.map((r, i) => r * (gains[i] ?? 0));
    expect(heard[0]).toBeCloseTo(heard[1] ?? -1);
    expect(heard[0]).toBeCloseTo(0.2 * mixHeadroom(2)); // √(0,4 × 0,1) = 0,2
  });

  it("os dois tetos: a prévia quieta sobe no máximo MAX_BOOST, e as altas não afundam por causa dela", () => {
    const [loud, , quiet] = mixGains([0.5, 0.5, 0.001]);
    expect(quiet).toBeCloseTo(MAX_BOOST * mixHeadroom(3));
    // Sem o teto de baixo, a média geométrica (0,063) levaria as altas a 1/8 do volume.
    expect(loud).toBeCloseTo(mixHeadroom(3) / MAX_BOOST);
  });

  it("dentro dos tetos, as duas chegam juntas à média geométrica", () => {
    const [a, b] = mixGains([0.3, 0.12]);
    expect((a ?? 0) * 0.3).toBeCloseTo((b ?? 0) * 0.12);
  });

  it("a prévia em silêncio fica só com a folga; todas em silêncio também", () => {
    expect(mixGains([0.3, 0])[1]).toBeCloseTo(mixHeadroom(2));
    expect(mixGains([0, 0])).toEqual([mixHeadroom(2), mixHeadroom(2)]);
  });
});
