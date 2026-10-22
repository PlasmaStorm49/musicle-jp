import type { Daily } from "../core/daily.ts";
import type { Target } from "../core/types.ts";
import { t } from "../i18n/t.ts";

/** O nome do modo na tela (P100): "Normal" (álbum) ou "Desafio" (música). */
export function modeName(target: Target): string {
  return t(`mode.${target}`);
}

/** O nome do diário na tela, pela chave do descritor: nos Hits, o do modo. */
export function dailyName(daily: Daily): string {
  return t(daily.name);
}
