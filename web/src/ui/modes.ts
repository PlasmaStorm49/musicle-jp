import { type AnimeMode, type Daily, isAnimeKey } from "../core/daily.ts";
import type { Target } from "../core/types.ts";
import { t } from "../i18n/t.ts";

/** O nome do modo na tela (P100): "Normal" (álbum) ou "Desafio" (música). */
export function modeName(target: Target): string {
  return t(`mode.${target}`);
}

/** O nome de um modo do Anime (P231): "Acertar a música" ou "Acertar o anime". */
export function animeModeName(mode: AnimeMode): string {
  return t(`anime.mode.${mode}`);
}

/** O nome do diário na tela, pela chave do descritor: nos Hits, o do modo; no Anime, o do diário. */
export function dailyName(daily: Daily): string {
  return t(daily.name);
}

/**
 * A 1ª linha do compartilhar: o jogo, o diário e o número. No Anime, com a categoria ("AteMusic
 * Anime · Música · Fácil nº 1"): o nome do diário sozinho não diz que é de anime.
 */
export function shareHeader(daily: Daily, number: number): string {
  const params = { title: t("app.title"), mode: dailyName(daily), number };
  return isAnimeKey(daily.key) ? t("share.headerAnime", params) : t("share.header", params);
}
