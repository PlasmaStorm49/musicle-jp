// Gera os tipos TypeScript a partir dos schemas JSON de shared/schema (a fonte única do
// contrato Python ↔ TS). Uso: npm run types --prefix web
// Os arquivos gerados não se editam à mão; um teste falha se estiverem desatualizados.

import { readFileSync, writeFileSync } from "node:fs";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const ROOT = new URL("../../", import.meta.url);

export const SCHEMAS = [
  { schema: "shared/schema/catalog.schema.json", out: "web/src/core/generated/catalog.ts" },
  { schema: "shared/schema/schedule.schema.json", out: "web/src/core/generated/schedule.ts" },
  { schema: "shared/schema/artist.schema.json", out: "web/src/core/generated/artist.ts" },
  { schema: "shared/schema/artist-list.schema.json", out: "web/src/core/generated/artist-list.ts" },
  {
    schema: "shared/schema/anime-catalog.schema.json",
    out: "web/src/core/generated/anime-catalog.ts",
  },
  {
    schema: "shared/schema/anime-schedule.schema.json",
    out: "web/src/core/generated/anime-schedule.ts",
  },
] as const;

// Títulos dos schemas → nomes curtos. $defs genéricos ganham nomes que não escondem os
// globais do JavaScript (Date, Text).
const BY_TITLE: Record<string, string> = {
  "Catálogo do musicle-jp": "Catalog",
  "Agenda do desafio diário do musicle-jp": "Schedule",
  "Catálogo de artista do musicle-jp": "ArtistCatalog",
  "Lista de artistas do musicle-jp": "ArtistList",
  "Artista da lista do musicle-jp": "ArtistListEntry",
  "Álbum do catálogo de artista do musicle-jp": "ArtistAlbum",
  "Faixa do catálogo de artista do musicle-jp": "ArtistTrack",
  "Catálogo do Anime do musicle-jp": "AnimeCatalog",
  "Álbum do catálogo do Anime do musicle-jp": "AnimeAlbum",
  "Faixa do catálogo do Anime do musicle-jp": "AnimeTrack",
  "Franquia do catálogo do Anime do musicle-jp": "AnimeFranchise",
  "Agenda do Anime do musicle-jp": "AnimeSchedule",
  "Dia da agenda do Anime do musicle-jp": "AnimeDay",
  "Diários de um modo do Anime do musicle-jp": "AnimeModeDailies",
  "Rodadas de um diário do Anime do musicle-jp": "AnimeRounds",
  "Rodada do Anime do musicle-jp": "AnimeRound",
};
const BY_KEY: Record<string, string> = {
  date: "IsoDate",
  timestamp: "IsoTimestamp",
  text: "NonEmptyText",
  url: "AssetUrl",
};

const BANNER = `// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web`;

export async function generate(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const { schema, out } of SCHEMAS) {
    const json = JSON.parse(readFileSync(new URL(schema, ROOT), "utf8")) as JSONSchema;
    const ts = await compile(json, "Root", {
      bannerComment: BANNER,
      additionalProperties: false,
      // 0 = não transforma arrays com maxItems em uniões de tuplas (similar tem até 10).
      maxItems: 0,
      style: { singleQuote: false, printWidth: 100 },
      customName: (s, keyName) =>
        (s.title && BY_TITLE[s.title]) || (keyName && BY_KEY[keyName]) || undefined,
    });
    result.set(out, ts);
  }
  return result;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  for (const [out, ts] of await generate()) {
    writeFileSync(new URL(out, ROOT), ts, "utf8");
    console.log(`tipos gerados: ${out}`);
  }
}
