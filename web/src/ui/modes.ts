import type { Target } from "../core/types.ts";
import { t } from "../i18n/t.ts";

/** O nome do modo na tela (P100): "Normal" (álbum) ou "Desafio" (música). */
export function modeName(target: Target): string {
  return t(`mode.${target}`);
}
