import { describe, expect, it } from "vitest";
import { readVectors } from "../../test/vectors.ts";
import { fnv1a32, Mulberry32, seeded } from "./prng.ts";

type Vectors = {
  fnv1a32: { input: string; output: number }[];
  mulberry32: { seed: number; first10: number[]; at1000: number }[];
  randint: { seed: number; n: number; values: number[] }[];
  shuffle: { seed: number; input: number[]; output: number[] }[];
};
const vectors = readVectors<Vectors>("prng.json");

describe("fnv1a32", () => {
  it.each([
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["foobar", 0xbf9cf968],
  ])("valor oficial do FNV-1a para %j", (text, expected) => {
    expect(fnv1a32(text)).toBe(expected);
  });

  it.each(vectors.fnv1a32)("vetor $input", ({ input, output }) => {
    expect(fnv1a32(input)).toBe(output);
  });
});

describe("Mulberry32", () => {
  it.each(vectors.mulberry32)("semente $seed: 10 primeiros e o milésimo", (c) => {
    const rng = new Mulberry32(c.seed);
    expect(Array.from({ length: 10 }, () => rng.nextU32())).toEqual(c.first10);
    for (let i = 10; i < 999; i++) rng.nextU32();
    expect(rng.nextU32()).toBe(c.at1000);
  });

  it.each(vectors.randint)("randint n=$n", (c) => {
    const rng = new Mulberry32(c.seed);
    expect(Array.from({ length: 10 }, () => rng.randint(c.n))).toEqual(c.values);
  });

  it.each(vectors.shuffle)("shuffle semente $seed", (c) => {
    const items = [...c.input];
    new Mulberry32(c.seed).shuffle(items);
    expect(items).toEqual(c.output);
  });

  it("random fica em [0, 1)", () => {
    const rng = new Mulberry32(0xffffffff);
    for (let i = 0; i < 1000; i++) {
      const x = rng.random();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });

  it("randint recusa intervalo vazio", () => {
    expect(() => new Mulberry32(1).randint(0)).toThrow(RangeError);
  });

  it("seeded usa o hash do texto", () => {
    expect(seeded("musicle-jp").nextU32()).toBe(new Mulberry32(fnv1a32("musicle-jp")).nextU32());
  });
});
