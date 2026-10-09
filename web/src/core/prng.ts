// Gerador pseudoaleatório com semente. Espelho de pipeline/src/musicle_pipeline/prng.py,
// travado pelos vetores de shared/vectors/prng.json (gerados pela referência em JS).

/** Hash FNV-1a de 32 bits sobre os bytes UTF-8 (não sobre o charCodeAt, que é UTF-16). */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Sequência determinística: a mesma semente sempre dá os mesmos números. */
export class Mulberry32 {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  nextU32(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float em [0, 1). */
  random(): number {
    return this.nextU32() / 4294967296;
  }

  /** Inteiro em [0, n). */
  randint(n: number): number {
    if (n < 1) {
      throw new RangeError(`randint precisa de n >= 1, recebeu ${n}`);
    }
    return Math.floor(this.random() * n);
  }

  /** Fisher-Yates do fim para o começo, no lugar. Consome items.length - 1 números. */
  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.randint(i + 1);
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
  }
}

/** Sequência cuja semente é o hash do texto, ex.: "musicle-jp|2026-10-08|song". */
export function seeded(text: string): Mulberry32 {
  return new Mulberry32(fnv1a32(text));
}
