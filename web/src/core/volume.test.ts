import { describe, expect, it } from "vitest";
import { clampVolume, DEFAULT_VOLUME, gainOf } from "./volume.ts";

describe("o volume (P219)", () => {
  it("o nível fica entre 0 e 1; o que não é número volta ao padrão", () => {
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VOLUME);
  });

  it("o ganho é o quadrado do nível: 10% na barra dá 1% do som, e o mudo é mudo", () => {
    expect(gainOf(0.1)).toBeCloseTo(0.01);
    expect(gainOf(0.5)).toBe(0.25);
    expect(gainOf(1)).toBe(1);
    expect(gainOf(0)).toBe(0);
  });
});
