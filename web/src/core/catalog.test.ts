import { describe, expect, it } from "vitest";
import { catalog } from "../../test/fixtures.ts";
import { acceptedIds, indexCatalog, UnsupportedCatalogError } from "./catalog.ts";
import type { Catalog } from "./types.ts";

const index = indexCatalog(catalog);
const track = (id: string) => {
  const t = index.tracks.get(`fixture:tr:${id}`);
  if (!t) throw new Error(`faixa ${id} não existe no catálogo`);
  return t;
};

describe("indexCatalog", () => {
  it("indexa faixas, álbuns e artistas", () => {
    expect(index.tracks.size).toBe(42);
    expect(index.albums.size).toBe(33);
    expect(index.artists.size).toBe(14);
  });

  it("recusa versão de schema desconhecida", () => {
    const future = { ...catalog, schemaVersion: 2 } as unknown as Catalog;
    expect(() => indexCatalog(future)).toThrow(UnsupportedCatalogError);
  });
});

describe("acceptedIds", () => {
  it("Música: versões da mesma música contam como acerto", () => {
    expect(acceptedIds(index, track("tr03"), "song")).toEqual([
      "fixture:tr:tr01",
      "fixture:tr:tr02",
      "fixture:tr:tr03",
    ]);
  });

  it("Música: mesmo título de outro artista não conta", () => {
    expect(acceptedIds(index, track("tr04"), "song")).toEqual(["fixture:tr:tr04"]);
  });

  it("Álbum: todo álbum que contém a música conta", () => {
    expect(acceptedIds(index, track("tr01"), "album")).toEqual([
      "fixture:al:al01",
      "fixture:al:al02",
      "fixture:al:al03",
    ]);
  });
});
