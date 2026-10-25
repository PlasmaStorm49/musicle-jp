// Catálogo e agenda falsos gerados pelo pipeline (web/public/fixtures). Só para testes, que
// rodam no Node; o jogo carrega os mesmos arquivos pela rede (M5).
import { readFileSync } from "node:fs";
import type {
  AnimeCatalog,
  AnimeSchedule,
  Catalog,
  MixedSchedule,
  QuizBonus,
  QuizMonth,
  Schedule,
} from "../src/core/types.ts";

/** Um JSON de web/public: das fixtures, ou de `data` (a parada real). */
export function readJson<T>(path: string, dir = "fixtures"): T {
  return JSON.parse(
    readFileSync(new URL(`../public/${dir}/${path}`, import.meta.url), "utf8"),
  ) as T;
}

export const catalog = readJson<Catalog>("catalog.json");
export const schedule = readJson<Schedule>("schedule.json");

/** O catálogo e a agenda fictícios do Anime (M14): as mesmas faixas da parada fictícia. */
export const animeCatalog = readJson<AnimeCatalog>("anime/catalog.json");
export const animeSchedule = readJson<AnimeSchedule>("anime/schedule.json");
/** A agenda fictícia das Misturadas (M17), sobre o mesmo catálogo do Anime. */
export const mixedSchedule = readJson<MixedSchedule>("anime/mixed.json");
/** Outubro da agenda fictícia do quiz do dia (M18), sobre o mesmo catálogo do Anime. */
export const quizOctober = readJson<QuizMonth>("anime/quiz/2026-10.json");
/** O bônus de estreia fictício (o dia 08/10, o 1º da agenda fictícia do quiz). */
export const quizBonus = readJson<QuizBonus>("anime/quiz-bonus.json");

/** A 1ª parada real (web/public/data), para os testes do provedor Apple. */
export const realCatalog = readJson<Catalog>("catalog.json", "data");
