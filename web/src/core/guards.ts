// Guardas de tipo para dados que chegam de fora (JSON da rede, localStorage).

/** Objeto comum (não nulo e não lista), com chaves de texto. */
export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
