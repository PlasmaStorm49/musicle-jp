// Catálogo e agenda falsos gerados pelo pipeline (web/public/fixtures). Só para testes, que
// rodam no Node; o jogo carrega os mesmos arquivos pela rede (M5).
import { readFileSync } from "node:fs";
import type { Catalog, Schedule } from "../src/core/types.ts";

function readJson<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../public/fixtures/${path}`, import.meta.url), "utf8"),
  ) as T;
}

export const catalog = readJson<Catalog>("catalog.json");
export const schedule = readJson<Schedule>("schedule.json");
