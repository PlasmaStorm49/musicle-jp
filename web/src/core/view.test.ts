import { describe, expect, it } from "vitest";
import { catalog } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import type { Catalog } from "./types.ts";
import { optionView, revealView } from "./view.ts";

const index = indexCatalog(catalog);

describe("optionView (Música)", () => {
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

describe("optionView (Álbum)", () => {
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
});
