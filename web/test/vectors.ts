// Lê os vetores compartilhados de shared/vectors. Só para testes (roda no Node).
import { readFileSync } from "node:fs";

export function readVectors<T>(name: string): T {
  const url = new URL(`../../shared/vectors/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}
