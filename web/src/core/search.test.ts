import { describe, expect, it } from "vitest";
import { catalog } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import { buildSearchIndex, search } from "./search.ts";
import type { Catalog, Track } from "./types.ts";

const idx = buildSearchIndex(indexCatalog(catalog));

/** IDs curtos (tr01) para as listas ficarem legíveis. */
const ids = (query: string, limit?: number) =>
  search(idx, query, limit).map((hit) => hit.id.replace("fixture:tr:", ""));

/** Catálogo falso com outras faixas (o tipo exige lista não vazia; aqui nunca é). */
const withTracks = (base: Catalog, tracks: readonly Track[]): Catalog => ({
  ...base,
  tracks: tracks as Catalog["tracks"],
});

/** Catálogo falso com a popularidade de algumas faixas trocada. */
function withPopularity(changes: Readonly<Record<string, number>>): Catalog {
  return withTracks(
    catalog,
    catalog.tracks.map((t) => {
      const popularity = changes[t.id.replace("fixture:tr:", "")];
      return popularity === undefined ? t : { ...t, popularity };
    }),
  );
}

describe("buildSearchIndex", () => {
  it("uma entrada por songKey, representada pela faixa mais popular", () => {
    const index = indexCatalog(catalog);
    expect(idx.entries).toHaveLength(index.tracksBySong.size);
    const dawn = idx.entries.filter((e) => e.songKey === "夜明けのめろでぃ|fixture:ar:ar01");
    expect(dawn.map((e) => e.id)).toEqual(["fixture:tr:tr01"]);
  });

  it("empate de popularidade: vence o menor id", () => {
    const tied = buildSearchIndex(indexCatalog(withPopularity({ tr02: 0.9 })));
    const dawn = tied.entries.find((e) => e.songKey === "夜明けのめろでぃ|fixture:ar:ar01");
    expect(dawn?.id).toBe("fixture:tr:tr01");
    const other = buildSearchIndex(indexCatalog(withPopularity({ tr03: 0.95 })));
    const dawn3 = other.entries.find((e) => e.songKey === "夜明けのめろでぃ|fixture:ar:ar01");
    expect(dawn3?.id).toBe("fixture:tr:tr03");
  });

  it("a versão TV Size entra nas chaves do grupo", () => {
    expect(ids("yoakenomelodytv")).toEqual(["tr01"]);
  });
});

describe("search: casos do catálogo falso", () => {
  it("夜明け: as três versões viram uma linha; a do outro artista vem depois", () => {
    expect(search(idx, "夜明け")).toEqual([
      { id: "fixture:tr:tr01", songKey: "夜明けのめろでぃ|fixture:ar:ar01" },
      { id: "fixture:tr:tr04", songKey: "夜明けのめろでぃ|fixture:ar:ar14" },
    ]);
  });

  it.each(["カーテン", "かーてん", "かてん", "かあてん", "kaaten", "katen", "curtain"])(
    "%s → tr24 em primeiro",
    (query) => {
      expect(ids(query)[0]).toBe("tr24");
    },
  );

  it.each(["tokyo", "toukyou", "Tōkyō", "とうきょう"])("%s → título e depois artista", (query) => {
    expect(ids(query)).toEqual(["tr22", "tr28", "tr39"]);
  });

  it("ichiban → título latino manual", () => {
    expect(ids("ichiban")).toEqual(["tr20"]);
  });

  it("ナナ → pelo artista (inclusive título ♡ sem chave) e pelo meio do título", () => {
    expect(ids("ナナ")).toEqual(["tr40", "tr04", "tr14", "tr27"]);
  });

  it("ＬＵＭＩＮＡ em largura cheia → faixas do artista", () => {
    expect(ids("ＬＵＭＩＮＡ")).toEqual(["tr29", "tr17", "tr30"]);
  });

  it("só a variante sem ー acha 猫背のブルース (o romaji da consulta não casa com o kanji)", () => {
    expect(ids("猫背のぶるす")).toEqual(["tr31"]);
  });

  it("só a variante em romaji acha かあてん", () => {
    expect(ids("かあてん")).toEqual(["tr24"]);
  });

  it("partícula を em kana acha o título em kanji (o catálogo escreve wo)", () => {
    expect(ids("ほしにねがい")).toEqual(["tr19"]);
    expect(ids("ほしにねがいを")).toEqual(["tr19"]);
  });

  it("consulta com ー: o título com ー vem antes de um sem ー mais popular", () => {
    const [model] = catalog.tracks;
    if (!model) throw new Error("catálogo falso vazio");
    const track = (id: string, title: string, popularity: number): Track => ({
      ...model,
      id: `x:tr:${id}`,
      songKey: id,
      popularity,
      search: { title: [title], artist: [`artista${id}`] },
    });
    const small = buildSearchIndex(
      indexCatalog(withTracks(catalog, [track("lulu", "るる", 0.9), track("rule", "るーる", 0.1)])),
    );
    expect(search(small, "るーる").map((h) => h.songKey)).toEqual(["rule", "lulu"]);
    expect(search(small, "るる").map((h) => h.songKey)).toEqual(["lulu", "rule"]);
  });
});

describe("search: consulta truncada no meio da digitação", () => {
  it.each([
    ["sakamit", ["tr06"]],
    // tr34 pelo prefixo "sei" (seifuku); depois, pelo meio do título: tr42 contém "seih"
    // inteira (ryuseihighway) e tr20 contém a truncada "sei" (1bansei).
    ["seih", ["tr34", "tr42", "tr20"]],
    ["oyatunoz", ["tr36"]],
    ["merod", ["tr01", "tr04"]],
    ["yoakenomerod", ["tr01", "tr04"]],
    ["ichibam", ["tr20"]],
    ["sakuram", ["tr08", "tr19"]],
  ])("%s → %j", (query, expected) => {
    expect(ids(query)).toEqual(expected);
  });

  it("sh não trunca: h depois de s já é prefixo de shi", () => {
    const found = ids("sh", 100);
    expect(found).toContain("tr39");
    // sakamichi e seifuku começam com s, mas não têm "sh": só apareceriam se truncasse.
    expect(found).not.toContain("tr06");
    expect(found).not.toContain("tr34");
  });

  it("exata vence truncada na mesma faixa, mesmo com popularidade menor", () => {
    // "tod" casa todai (tr37, 0.25) exata; "to" truncada casa tomei (tr09, 0.87) e tokyo (tr22).
    expect(ids("tod").slice(0, 3)).toEqual(["tr37", "tr09", "tr22"]);
  });
});

describe("search: limites e casos vazios", () => {
  it.each(["", "   ", "♡", "ー", "ーー"])("%j → nada", (query) => {
    expect(search(idx, query)).toEqual([]);
  });

  it("uma letra só busca prefixo, sem devolver o catálogo inteiro", () => {
    const found = ids("t", 100);
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(idx.entries.length);
  });

  it("respeita o limite (padrão 8)", () => {
    expect(ids("no", 100).length).toBeGreaterThan(8);
    expect(ids("no")).toHaveLength(8);
    expect(ids("no", 3)).toEqual(ids("no").slice(0, 3));
    expect(ids("no", 0)).toEqual([]);
  });

  it("ordem determinística, independente da ordem do catálogo", () => {
    const reversed = buildSearchIndex(
      indexCatalog(withTracks(catalog, [...catalog.tracks].reverse())),
    );
    for (const query of ["no", "t", "a", "ナナ", "sakuram"]) {
      expect(search(idx, query, 100)).toEqual(search(idx, query, 100));
      expect(search(reversed, query, 100)).toEqual(search(idx, query, 100));
    }
  });

  it("empate de faixa e popularidade: menor id primeiro, em qualquer ordem do catálogo", () => {
    // As três faixas de 東京ノイズ casam pelo artista; tr28 e tr39 empatam acima de tr22.
    const tied = withPopularity({ tr28: 0.6, tr39: 0.6 });
    const expected = ["tr28", "tr39", "tr22"];
    for (const tracks of [tied.tracks, [...tied.tracks].reverse()]) {
      const found = search(buildSearchIndex(indexCatalog(withTracks(tied, tracks))), "tokyonoise");
      expect(found.map((h) => h.id.replace("fixture:tr:", ""))).toEqual(expected);
    }
  });
});
