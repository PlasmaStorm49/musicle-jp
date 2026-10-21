// O tema escolhido na Início (P176, P191, P217): uma preferência do aparelho, fora do save. Não passa
// pelo updateSave nem pelo SAVE_SCHEMA_VERSION: é uma chave só, que vale ou não vale. Sem DOM,
// como o resto do storage: recebe o armazenamento. O script do index.html lê a mesma chave antes
// da pintura (o scripts/theme.test.ts confere que é a mesma).
import type { KeyValueStore } from "./save.ts";

export const THEME_KEY = "musicle-jp:theme";

/**
 * Sem escolha ("auto", a falta da chave), o tema segue o aparelho (prefers-color-scheme); Claro e
 * Escuro valem por cima dele. Desde o switch (P217), a tela só grava os dois: o "auto" fica para
 * quem nunca escolheu.
 */
export type ThemeChoice = "auto" | "light" | "dark";

/** O tema salvo. Valor estranho, ausente ou armazenamento que lança: Automático. */
export function readTheme(store: KeyValueStore): ThemeChoice {
  try {
    const value = store.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Grava o tema (o Automático apaga a chave). Devolve se deu certo. */
export function writeTheme(store: KeyValueStore, choice: ThemeChoice): boolean {
  try {
    if (choice === "auto") store.removeItem(THEME_KEY);
    else store.setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}
