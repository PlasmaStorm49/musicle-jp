// O localStorage do navegador, para as preferências que ficam fora do save (o tema, o volume).
import type { KeyValueStore } from "../storage/save.ts";

/** O localStorage, ou null quando o navegador não deixa nem ler (cookies bloqueados). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
