import { describe, expect, it } from "vitest";
import { leadIn, MAX_LEAD, MIX_ENTRY_RATIO, SILENCE_WINDOW } from "./silence.ts";

const RATE = 1000; // 1000 amostras por segundo: a janela de 50 ms tem 50

/**
 * Uma prévia de 30 s: o nível de cada instante (em segundos), com o sinal trocando a cada amostra,
 * como um som (a energia é o próprio nível).
 */
function preview(level: (t: number) => number, seconds = 30): Float32Array {
  return Float32Array.from(
    { length: seconds * RATE },
    (_, i) => level(i / RATE) * (i % 2 ? 1 : -1),
  );
}

describe("leadIn: o silêncio do começo de uma prévia", () => {
  it("a prévia que começa com som não pula nada", () => {
    expect(leadIn([preview(() => 0.3)], RATE)).toBe(0);
  });

  it("o silêncio digital do começo: pula até uma janela antes do 1º som (a folga do ataque)", () => {
    const data = preview((t) => (t < 1.5 ? 0 : 0.3));
    expect(leadIn([data], RATE)).toBeCloseTo(1.5 - SILENCE_WINDOW, 9);
  });

  it("o chiado do começo (−54 dBFS) também é silêncio", () => {
    const data = preview((t) => (t < 2 ? 0.002 : 0.3));
    expect(leadIn([data], RATE)).toBeCloseTo(2 - SILENCE_WINDOW, 9);
  });

  it("a introdução baixa, mas que se ouve (20 dB abaixo do resto), fica", () => {
    expect(leadIn([preview((t) => (t < 3 ? 0.03 : 0.3))], RATE)).toBe(0);
  });

  it("a régua da mistura pula também a introdução baixa (20 dB abaixo), e não a parte que já soa", () => {
    const intro = preview((t) => (t < 3 ? 0.03 : 0.3));
    expect(leadIn([intro], RATE, MIX_ENTRY_RATIO)).toBeCloseTo(3 - SILENCE_WINDOW, 9);
    // Uma estrofe 6 dB abaixo do refrão já é a música: fica.
    expect(leadIn([preview((t) => (t < 5 ? 0.15 : 0.3))], RATE, MIX_ENTRY_RATIO)).toBe(0);
  });

  it("a medida é relativa à prévia: a introdução quieta de uma prévia quieta também fica", () => {
    expect(leadIn([preview((t) => (t < 3 ? 0.003 : 0.03))], RATE)).toBe(0);
  });

  it("no estéreo, o som de um canal só já conta", () => {
    const left = preview((t) => (t < 1 ? 0 : 0.3));
    const right = preview(() => 0);
    expect(leadIn([left, right], RATE)).toBeCloseTo(1 - SILENCE_WINDOW, 9);
    expect(leadIn([preview(() => 0.3), right], RATE)).toBe(0);
  });

  it("muda por mais tempo que o máximo: começa no máximo, para a barra de 16 s caber", () => {
    expect(leadIn([preview((t) => (t < 12 ? 0 : 0.3))], RATE)).toBe(MAX_LEAD);
  });

  it("a prévia muda inteira, sem amostras ou sem taxa: nada muda", () => {
    expect(leadIn([preview(() => 0)], RATE)).toBe(0);
    expect(leadIn([], RATE)).toBe(0);
    expect(leadIn([new Float32Array(0)], RATE)).toBe(0);
    expect(leadIn([preview(() => 0.3)], 0)).toBe(0);
  });

  it("a prévia mais curta que o máximo, com o som no fim, pula até ele", () => {
    const data = preview((t) => (t < 4 ? 0 : 0.3), 5);
    expect(leadIn([data], RATE)).toBeCloseTo(4 - SILENCE_WINDOW, 9);
  });
});
