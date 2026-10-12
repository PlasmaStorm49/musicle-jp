import { describe, expect, it } from "vitest";
import { catalog, realCatalog } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import type { Catalog } from "./types.ts";
import { optionView, revealView } from "./view.ts";

const index = indexCatalog(catalog);

describe("optionView (música: tentativas e sugestões do Desafio)", () => {
  it("título japonês com romaji embaixo e lang ja", () => {
    expect(optionView(index, "fixture:tr:tr16", "song")).toMatchObject({
      title: "ガラスの靴",
      titleLatin: "Garasu no kutsu",
      artist: "ｶﾞﾗｽﾉﾈｺ",
      lang: "ja",
    });
  });

  it("título já latino não repete o romaji", () => {
    // tr17 é ＬＯＶＥ　ＳＯＮＧ em largura total: sem romaji, e não é japonês.
    const view = optionView(index, "fixture:tr:tr17", "song");
    expect(view?.titleLatin).toBeNull();
    expect(view?.lang).toBeUndefined();
  });

  it("título latino do provedor aparece quando difere", () => {
    expect(optionView(index, "fixture:tr:tr22", "song")?.titleLatin).toBe("Tōkyō Lights");
  });

  it("id inexistente devolve null", () => {
    expect(optionView(index, "fixture:tr:nada", "song")).toBeNull();
  });
});

describe("lang do artista", () => {
  it("é o do artista, não o do título: título latino com artista japonês", () => {
    // Como "IRIS OUT", de 米津玄師: o leitor de tela leria o kanji com a voz em português.
    const view = optionView(index, "fixture:al:al02", "album");
    expect(view).toMatchObject({ title: "Dawn Collection", artist: "ミナト" });
    expect(view?.lang).toBeUndefined();
    expect(view?.artistLang).toBe("ja");
  });

  it("revelação: álbum com título japonês leva lang ja", () => {
    const view = revealView(index, "fixture:tr:tr05"); // do álbum ふたりの約束 - Single
    expect(view?.albumTitle).toBe("ふたりの約束 - Single");
    expect(view?.albumLang).toBe("ja");
  });

  it("revelação: o álbum também tem o seu", () => {
    const view = revealView(index, "fixture:tr:tr37"); // 灯台, do álbum Dawn Collection
    expect(view?.lang).toBe("ja");
    expect(view?.albumTitle).toBe("Dawn Collection");
    expect(view?.albumLang).toBeUndefined();
  });
});

describe("artista em latim ao lado do japonês (ME55)", () => {
  /** O catálogo das fixtures com uma faixa trocada (e artistas a mais, se preciso). */
  const changed = (
    trackId: string,
    track: Partial<Catalog["tracks"][number]>,
    artists: readonly Catalog["artists"][number][] = [],
  ) =>
    indexCatalog({
      ...catalog,
      artists: [...catalog.artists, ...artists] as Catalog["artists"],
      tracks: catalog.tracks.map((t) =>
        t.id === trackId ? { ...t, ...track } : t,
      ) as Catalog["tracks"],
    });

  it("um artista: o nome latino do catálogo, também com katakana de meia largura", () => {
    expect(optionView(index, "fixture:al:al02", "album")?.artistLatin).toBe("Minato");
    expect(optionView(index, "fixture:tr:tr16", "song")?.artistLatin).toBe("Garasu no Neko");
    expect(revealView(index, "fixture:tr:tr16")?.artistLatin).toBe("Garasu no Neko");
  });

  it("parceria com os dois no catálogo: cada nome trocado pelo seu", () => {
    expect(optionView(index, "fixture:tr:tr05", "song")?.artistLatin).toBe(
      "Yokaze Theater & Aoi Yuu",
    );
  });

  it("artista já latino (também em largura total): nada a mostrar", () => {
    expect(optionView(index, "fixture:tr:tr12", "song")?.artistLatin).toBeNull(); // Hoshizora Drive
    expect(optionView(index, "fixture:tr:tr17", "song")?.artistLatin).toBeNull(); // ＬＵＭＩＮＡ
  });

  it("parceiro fora do catálogo: nada, em vez de meio traduzido", () => {
    const view = optionView(
      changed("fixture:tr:tr05", { artistDisplay: "夜風シアター & 青井ユウ & 超特急" }),
      "fixture:tr:tr05",
      "song",
    );
    expect(view?.artistLatin).toBeNull();
  });

  it("o nome latino entra como está, também com $ (não vira padrão de substituição)", () => {
    const cash = { id: "fixture:ar:ar98", name: "現金", nameLatin: "Ca$$h $& $'" };
    const index2 = changed(
      "fixture:tr:tr05",
      { artistDisplay: "現金", artistIds: ["fixture:ar:ar98"] },
      [{ ...cash, latinSource: "provider" }] as Catalog["artists"][number][],
    );
    expect(optionView(index2, "fixture:tr:tr05", "song")?.artistLatin).toBe("Ca$$h $& $'");
  });

  it("um nome dentro de outro: o mais longo é trocado primeiro", () => {
    // Trocar "ナナ" antes deixaria "Nana星", e o japonês que sobra apagaria o latino.
    const star = { id: "fixture:ar:ar99", name: "ナナ星", nameLatin: "Nana Hoshi" };
    const index2 = changed(
      "fixture:tr:tr05",
      { artistDisplay: "ナナ & ナナ星", artistIds: ["fixture:ar:ar14", "fixture:ar:ar99"] },
      [{ ...star, latinSource: "provider" }] as Catalog["artists"][number][],
    );
    expect(optionView(index2, "fixture:tr:tr05", "song")?.artistLatin).toBe("Nana & Nana Hoshi");
  });
});

describe("optionView (álbum: opções do Normal)", () => {
  it("mostra o título do álbum e a capa", () => {
    expect(optionView(index, "fixture:al:al02", "album")).toMatchObject({
      title: "Dawn Collection",
      artist: "ミナト",
      artworkUrl: "fixtures/art/al02.svg",
    });
  });
});

describe("revealView", () => {
  it("traz álbum, prévia e o selo de explícita (tr10)", () => {
    const view = revealView(index, "fixture:tr:tr10");
    expect(view?.explicit).toBe(true);
    expect(view?.albumTitle).toBe("RIOT");
    expect(view?.preview).toEqual({ url: "fixtures/audio/tr10.wav", startSec: 0, durationSec: 30 });
  });

  it("faixa sem prévia (tr13) tem preview nulo", () => {
    expect(revealView(index, "fixture:tr:tr13")?.preview).toBeNull();
  });

  it("duração desconhecida vira 30 s", () => {
    const unknown: Catalog = {
      ...catalog,
      tracks: catalog.tracks.map((t) =>
        t.id === "fixture:tr:tr01" && t.preview
          ? { ...t, preview: { ...t.preview, durationSec: null } }
          : t,
      ) as Catalog["tracks"],
    };
    expect(revealView(indexCatalog(unknown), "fixture:tr:tr01")?.preview?.durationSec).toBe(30);
  });

  it("id inexistente devolve null", () => {
    expect(revealView(index, "fixture:tr:nada")).toBeNull();
  });

  it("capa da parada real: só no host da Apple; a da fixture, relativa, passa", () => {
    const real = indexCatalog(realCatalog);
    const album = realCatalog.albums[0];
    expect(optionView(real, album?.id ?? "", "album")?.artworkUrl).toBe(album?.artworkUrl);
    const foreign = indexCatalog({
      ...realCatalog,
      albums: realCatalog.albums.map((a) =>
        a.id === album?.id ? { ...a, artworkUrl: "https://evil.test/capa.jpg" } : a,
      ) as Catalog["albums"],
    });
    expect(optionView(foreign, album?.id ?? "", "album")?.artworkUrl).toBeNull();
    expect(optionView(index, "fixture:al:al02", "album")?.artworkUrl).toBe("fixtures/art/al02.svg");
  });

  it("link da loja: o da Apple passa; javascript: e outro host viram null (P69)", () => {
    const real = indexCatalog(realCatalog);
    const track = realCatalog.tracks[0];
    expect(revealView(real, track?.id ?? "")?.storeUrl).toBe(track?.storeUrl);
    expect(revealView(index, "fixture:tr:tr01")?.storeUrl).toBeNull(); // a fixture não tem loja

    const withLink = (storeUrl: string): Catalog => ({
      ...catalog,
      tracks: catalog.tracks.map((t) =>
        t.id === "fixture:tr:tr01" ? { ...t, storeUrl } : t,
      ) as Catalog["tracks"],
    });
    for (const bad of ["javascript:alert(1)", "https://evil.test/jp/song/1"]) {
      expect(revealView(indexCatalog(withLink(bad)), "fixture:tr:tr01")?.storeUrl).toBeNull();
    }
  });
});
