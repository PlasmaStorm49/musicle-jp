// O volume escolhido no player (P216): uma preferência do aparelho, fora do save, como o tema
// (storage/theme.ts). Sem DOM: recebe o armazenamento.
import { clampVolume, DEFAULT_VOLUME } from "../core/volume.ts";
import type { KeyValueStore } from "./save.ts";

export const VOLUME_KEY = "musicle-jp:volume";

/** O volume salvo, de 0 a 1. Valor estranho, ausente ou armazenamento que lança: o padrão. */
export function readVolume(store: KeyValueStore): number {
  try {
    const raw = store.getItem(VOLUME_KEY);
    if (raw === null || raw.trim() === "") return DEFAULT_VOLUME;
    const level = Number(raw);
    return Number.isFinite(level) && level >= 0 && level <= 1 ? level : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** Grava o volume. Devolve se deu certo. */
export function writeVolume(store: KeyValueStore, level: number): boolean {
  try {
    store.setItem(VOLUME_KEY, String(clampVolume(level)));
    return true;
  } catch {
    return false;
  }
}
