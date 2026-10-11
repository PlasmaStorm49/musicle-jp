import { describe, expect, it } from "vitest";
import { catalog } from "../../test/fixtures.ts";
import { acceptedIds, indexCatalog, UnsupportedCatalogError } from "./catalog.ts";
import type { Album, Catalog } from "./types.ts";

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

  it("Álbum: o mesmo lançamento em outro álbum do mesmo artista também conta", () => {
    // O lookup da Apple traz um álbum só por faixa: há dois "ROSE - Single" da HANA, e o EP
    // "爆裂愛してる / 好きすぎて滅! - EP" tem a música 好きすぎて滅!.
    const answer = track("tr05");
    const album = index.albums.get(answer.albumId);
    if (!album) throw new Error("álbum da tr05 não existe");
    const extra = [
      { ...album, id: "fixture:al:twin" }, // "ふたりの約束 - Single" de novo, como o ROSE
      { ...album, id: "fixture:al:ep", title: `Outra / ${answer.title} - EP` },
      { ...album, id: "fixture:al:other", artistIds: ["fixture:ar:outro"] },
      { ...album, id: "fixture:al:unrelated", title: "Nada a ver" },
    ];
    const albums = [...catalog.albums, ...extra] as Catalog["albums"];
    const grown = indexCatalog({ ...catalog, albums });
    expect(acceptedIds(grown, answer, "album")).toEqual(
      [answer.albumId, "fixture:al:ep", "fixture:al:twin"].sort(),
    );
    expect(acceptedIds(grown, answer, "song")).toEqual(acceptedIds(index, answer, "song"));
  });

  it("Álbum: o outro álbum de mesmo nome vale também para o lado B", () => {
    // Tiger está no 2º "ROSE - Single" da HANA; o 1º, de mesmo nome, aparece igual na busca.
    // Só a regra do nome inteiro cobre: o título da música é outro.
    const answer = track("tr37"); // 灯台, do álbum Dawn Collection
    const album = index.albums.get(answer.albumId);
    if (!album) throw new Error("álbum da tr37 não existe");
    const twin = { ...album, id: "fixture:al:twin" };
    const grown = indexCatalog({
      ...catalog,
      albums: [...catalog.albums, twin] as Catalog["albums"],
    });
    expect(acceptedIds(grown, answer, "album")).toContain("fixture:al:twin");
  });

  it("Álbum: nome que a normalização esvazia (só símbolos) não casa com outro", () => {
    const answer = track("tr05");
    const album = index.albums.get(answer.albumId);
    if (!album) throw new Error("álbum da tr05 não existe");
    const symbols = { ...answer, id: "fixture:tr:sym", songKey: "sym", title: "♡" };
    const albums: Album[] = [
      ...catalog.albums.map((a) => (a.id === album.id ? { ...a, title: "♡ - Single" } : a)),
      { ...album, id: "fixture:al:star", title: "★ - Single" },
      { ...album, id: "fixture:al:mix", title: "★ / ☆ - EP" },
    ];
    const tracks = [...catalog.tracks, symbols] as Catalog["tracks"];
    const grown = indexCatalog({ ...catalog, albums: albums as Catalog["albums"], tracks });
    expect(acceptedIds(grown, symbols, "album")).toEqual([album.id]);
  });

  it("Álbum: uma parte só do nome do álbum certo não basta", () => {
    // 19/10: a resposta 爆裂愛してる é do EP "爆裂愛してる / 好きすぎて滅! - EP", e o
    // "好きすぎて滅! - Single" não tem essa música.
    const answer = track("tr05");
    const album = index.albums.get(answer.albumId);
    if (!album) throw new Error("álbum da tr05 não existe");
    const ep = { ...album, title: `${answer.title} / Outra - EP` };
    const single = { ...album, id: "fixture:al:outra", title: "Outra - Single" };
    const albums = [...catalog.albums.map((a) => (a.id === album.id ? ep : a)), single];
    const grown = indexCatalog({ ...catalog, albums: albums as Catalog["albums"] });
    expect(acceptedIds(grown, answer, "album")).toEqual([answer.albumId]);
  });
});
