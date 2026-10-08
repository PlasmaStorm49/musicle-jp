"""Gerador pseudoaleatório com semente: fnv1a32 (hash do texto) + mulberry32 (sequência).

Tem espelho em TypeScript (web/src/core/prng.ts, M4) e referência em JavaScript
(shared/vectors/prng_reference.mjs). Os três têm de produzir os mesmos números, conferidos
pelos vetores de shared/vectors/prng.json.

Tudo é mantido sem sinal com & 0xFFFFFFFF: no JS os operadores trabalham em 32 bits, e no
Python os inteiros não têm limite (e >> num negativo seria deslocamento aritmético).
"""

from __future__ import annotations

from collections.abc import MutableSequence
from typing import TypeVar

MASK = 0xFFFFFFFF
_FNV_OFFSET = 0x811C9DC5
_FNV_PRIME = 0x01000193

T = TypeVar("T")


def fnv1a32(text: str) -> int:
    """Hash FNV-1a de 32 bits sobre os bytes UTF-8 (não UTF-16, como o charCodeAt do JS)."""
    h = _FNV_OFFSET
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * _FNV_PRIME) & MASK
    return h


def _imul(a: int, b: int) -> int:
    # Math.imul do JS: os 32 bits de baixo do produto.
    return (a * b) & MASK


class Mulberry32:
    """Sequência determinística: a mesma semente sempre dá os mesmos números."""

    def __init__(self, seed: int) -> None:
        self._state = seed & MASK

    def next_u32(self) -> int:
        self._state = (self._state + 0x6D2B79F5) & MASK
        t = self._state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & MASK
        return (t ^ (t >> 14)) & MASK

    def random(self) -> float:
        """Float em [0, 1). Divisão por potência de 2 é exata em ponto flutuante."""
        return self.next_u32() / 4294967296

    def randint(self, n: int) -> int:
        """Inteiro em [0, n). Igual a Math.floor(random() * n) do JS para n < 2**21."""
        if n < 1:
            raise ValueError(f"randint precisa de n >= 1, recebeu {n}")
        return (self.next_u32() * n) >> 32

    def shuffle(self, items: MutableSequence[T]) -> None:
        """Fisher-Yates do fim para o começo, no lugar. Consome len(items) - 1 números."""
        for i in range(len(items) - 1, 0, -1):
            j = self.randint(i + 1)
            items[i], items[j] = items[j], items[i]


def seeded(text: str) -> Mulberry32:
    """Sequência cuja semente é o hash do texto, ex.: "musicle-jp|2026-10-08|song"."""
    return Mulberry32(fnv1a32(text))
