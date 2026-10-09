// Ponte para o teste cruzado (pipeline/tests/test_cross_language.py): lê da entrada padrão
// {"normalize": [...], "looseKey": [...]} e devolve as mesmas listas processadas pelo TS.
// Roda direto no Node 24 (type stripping), sem build.
import { readFileSync } from "node:fs";
import { looseKey, normalize } from "../src/core/normalize.ts";

const input = JSON.parse(readFileSync(0, "utf8")) as { normalize: string[]; looseKey: string[] };
// JSON.stringify escapa surrogates soltos; a saída é UTF-8 válido.
process.stdout.write(
  JSON.stringify({
    normalize: input.normalize.map(normalize),
    looseKey: input.looseKey.map(looseKey),
  }),
);
