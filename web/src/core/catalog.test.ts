import { describe, expect, it } from "vitest";
import { animeCatalog, catalog } from "../../test/fixtures.ts";
import { acceptedIds, indexAnime, indexCatalog, UnsupportedCatalogError } from "./catalog.ts";
import type { Album, AnimeCatalog, Catalog } from "./types.ts";

const index = indexCatalog(catalog);
// Do catálogo, e não do índice: os testes montam catálogos com a faixa e o álbum inteiros.
const track = (id: string) => {
  const t = catalog.tracks.find((x) => x.id === `fixture:tr:${id}`);
  if (!t) throw new Error(`faixa ${id} não existe no catálogo`);
  return t;
};

describe("indexCatalog", () => {
  it("indexa faixas, álbuns e artistas", () => {
    expect(index.tracks.size).toBe(42);
    expect(index.albums.size).toBe(33);
    expect(index.artists.size).toBe(14);
  });

  // A v1 (antes do P102) também: o JS novo não lê o catálogo antigo, e vice-versa.
  it.each([1, 3])("recusa versão de schema desconhecida (%i)", (version) => {
    const other = { ...catalog, schemaVersion: version } as unknown as Catalog;
    expect(() => indexCatalog(other)).toThrow(UnsupportedCatalogError);
  });
});

describe("indexAnime (M14)", () => {
  const anime = indexAnime(animeCatalog);

  it("o catálogo do Anime vira um índice como o da parada: faixas, álbuns, artistas e músicas", () => {
    expect(anime.catalog.provider).toBe("fixture");
    expect(anime.tracks.size).toBe(animeCatalog.tracks.length);
    expect(anime.albums.size).toBe(animeCatalog.albums.length);
    expect(anime.artists.size).toBe(animeCatalog.artists.length);
    // As versões da mesma música (o songKey) ficam juntas: o acerto do Desafio vale por elas.
    const songs = new Set(animeCatalog.tracks.map((t) => t.songKey));
    expect(anime.tracksBySong.size).toBe(songs.size);
  });

  it("o acerto do acertar a música é o do Desafio, dentro do catálogo do Anime", () => {
    const first = animeCatalog.tracks[0];
    const ids = acceptedIds(anime, first, "song");
    expect(ids).toContain(first.id);
    for (const id of ids) expect(anime.tracks.get(id)?.songKey).toBe(first.songKey);
  });

  it.each([0, 2])("recusa versão de schema desconhecida (%i)", (version) => {
    const other = { ...animeCatalog, schemaVersion: version } as unknown as AnimeCatalog;
    expect(() => indexAnime(other)).toThrow(UnsupportedCatalogError);
  });
});

describe("acceptedIds", () => {
  it("Desafio: versões da mesma música contam como acerto", () => {
    expect(acceptedIds(index, track("tr03"), "song")).toEqual([
      "fixture:tr:tr01",
      "fixture:tr:tr02",
      "fixture:tr:tr03",
    ]);
  });

  it("Desafio: mesmo título de outro artista não conta", () => {
    expect(acceptedIds(index, track("tr04"), "song")).toEqual(["fixture:tr:tr04"]);
  });

  it("Normal: todo álbum que contém a música conta", () => {
    expect(acceptedIds(index, track("tr01"), "album")).toEqual([
      "fixture:al:al01",
      "fixture:al:al02",
      "fixture:al:al03",
    ]);
  });

  it("Normal: o mesmo lançamento em outro álbum do mesmo artista também conta", () => {
    // O lookup da Apple traz um álbum só por faixa: há dois "ROSE - Single" da HANA, e o EP
    // "爆裂愛してる / 好きすぎて滅! - EP" tem a música 好きすぎて滅!.
    const answer = track("tr05");
    const album = catalog.albums.find((a) => a.id === answer.albumId);
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

  it("Normal: o outro álbum de mesmo nome vale também para o lado B", () => {
    // Tiger está no 2º "ROSE - Single" da HANA; o 1º tem o mesmo nome na tela.
    // Só a regra do nome inteiro cobre: o título da música é outro.
    const answer = track("tr37"); // 灯台, do álbum Dawn Collection
    const album = catalog.albums.find((a) => a.id === answer.albumId);
    if (!album) throw new Error("álbum da tr37 não existe");
    const twin = { ...album, id: "fixture:al:twin" };
    const grown = indexCatalog({
      ...catalog,
      albums: [...catalog.albums, twin] as Catalog["albums"],
    });
    expect(acceptedIds(grown, answer, "album")).toContain("fixture:al:twin");
  });

  it("Normal: nome que a normalização esvazia (só símbolos) não casa com outro", () => {
    const answer = track("tr05");
    const album = catalog.albums.find((a) => a.id === answer.albumId);
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

  it("Normal: uma parte só do nome do álbum certo não basta", () => {
    // 19/10: a resposta 爆裂愛してる é do EP "爆裂愛してる / 好きすぎて滅! - EP", e o
    // "好きすぎて滅! - Single" não tem essa música.
    const answer = track("tr05");
    const album = catalog.albums.find((a) => a.id === answer.albumId);
    if (!album) throw new Error("álbum da tr05 não existe");
    const ep = { ...album, title: `${answer.title} / Outra - EP` };
    const single = { ...album, id: "fixture:al:outra", title: "Outra - Single" };
    const albums = [...catalog.albums.map((a) => (a.id === album.id ? ep : a)), single];
    const grown = indexCatalog({ ...catalog, albums: albums as Catalog["albums"] });
    expect(acceptedIds(grown, answer, "album")).toEqual([answer.albumId]);
  });
});
