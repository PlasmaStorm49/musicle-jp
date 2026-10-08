// Implementação de referência do PRNG em JavaScript. Gera shared/vectors/prng.json.
//
// Python (pipeline/src/musicle_pipeline/prng.py) e TypeScript (web/src/core/prng.ts, no M4)
// precisam reproduzir exatamente estes números. Esta é a única fonte de vetores gerada por
// código (e não escrita à mão), porque é uma segunda implementação, independente do Python.
//
// Uso: node shared/vectors/prng_reference.mjs [arquivo de saída]
// Grava com fs (UTF-8, \n). Nunca redirecione com ">" no PowerShell 5.1: ele grava UTF-16.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextU32() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const random = (next) => next() / 4294967296;
const randint = (next, n) => Math.floor(random(next) * n);

function shuffle(next, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randint(next, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const hashInputs = [
  "",
  "a",
  "foobar",
  "musicle-jp",
  "夜明け",
  "fixture:tr:tr01",
  "musicle-jp|2026-10-08|song",
  "musicle-jp|2026-10-08|album",
];
const seeds = [0, 1, 42, 0x7fffffff, 0x80000000, 0xffffffff, fnv1a32("musicle-jp|2026-10-08|song")];

function sequence(seed) {
  const next = mulberry32(seed);
  const first10 = Array.from({ length: 10 }, () => next());
  for (let i = 10; i < 999; i++) next();
  return { seed, first10, at1000: next() };
}

const vectors = {
  description:
    "Gerado por shared/vectors/prng_reference.mjs (não editar à mão). Saídas do mulberry32 em uint32.",
  fnv1a32: hashInputs.map((input) => ({ input, output: fnv1a32(input) })),
  mulberry32: seeds.map(sequence),
  randint: [1, 3, 10, 39].map((n) => {
    const next = mulberry32(42);
    return { seed: 42, n, values: Array.from({ length: 10 }, () => randint(next, n)) };
  }),
  shuffle: [42, 7].map((seed) => ({
    seed,
    input: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    output: shuffle(mulberry32(seed), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  })),
};

const target = process.argv[2] ?? fileURLToPath(new URL("./prng.json", import.meta.url));
writeFileSync(target, `${JSON.stringify(vectors, null, 2)}\n`, "utf8");
console.log(`vetores gravados em ${target}`);
