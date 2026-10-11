import { describe, expect, it } from "vitest";
import {
  appleTrackNumber,
  isAppleUrl,
  lookupUrl,
  PLAYLIST_URL,
  previewsFromLookup,
} from "./apple.ts";

const PREVIEW =
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/aa/bb/mzaf_1.plus.aac.p.m4a";

describe("isAppleUrl", () => {
  it.each([
    ["preview", PREVIEW],
    ["artwork", "https://is1-ssl.mzstatic.com/image/thumb/Music/x/300x300bb.jpg"],
    ["artwork", "https://is5-ssl.mzstatic.com/image/thumb/a.jpg"],
    ["store", "https://music.apple.com/jp/song/x/1706829387"],
    ["store", "https://MUSIC.apple.com/jp/song/x/1"],
  ] as const)("aceita %s: %s", (kind, url) => {
    expect(isAppleUrl(kind, url)).toBe(true);
  });

  it.each([
    ["store", "javascript:alert(1)"],
    ["store", "http://music.apple.com/jp/song/x/1"],
    ["store", "https://music.apple.com"],
    ["store", "https://music.apple.com/"],
    ["store", "https://music.apple.com.evil.test/jp/song/1"],
    ["store", "https://evil.test/music.apple.com/x"],
    ["store", "https://user@music.apple.com/jp/song/1"],
    ["store", "https://@music.apple.com/jp/song/1"],
    ["store", "https://evil.test\\@music.apple.com/x"],
    ["store", "https://music.apple.com/jp/song/ 1"],
    ["store", " https://music.apple.com/jp/song/1"],
    ["store", "https://music.apple.com/jp\n/song/1"],
    ["preview", "https://is1-ssl.mzstatic.com/a.m4a"],
    ["artwork", "https://isx-ssl.mzstatic.com/a.jpg"],
    ["artwork", "fixtures/art/al01.svg"],
    ["preview", "https://[::1/x"],
    ["store", "https:///music.apple.com/jp/song/1"],
    ["store", "https://music%2Eapple.com/jp/song/1"],
    ["store", "https://music.apple.com:443/jp/song/1"],
    ["store", "https://music.apple.com:8443/jp/song/1"],
    ["store", "HTTPS://music.apple.com/jp/song/1"],
  ] as const)("recusa %s: %j", (kind, url) => {
    expect(isAppleUrl(kind, url)).toBe(false);
  });
});

describe("faixas e lookup", () => {
  it("o link da playlist da rodada passa na regra da loja", () => {
    expect(isAppleUrl("store", PLAYLIST_URL)).toBe(true);
  });

  it("número da faixa só de id da Apple", () => {
    expect(appleTrackNumber("apple:tr:1706829387")).toBe("1706829387");
    expect(appleTrackNumber("apple:al:1706829387")).toBeNull();
    expect(appleTrackNumber("fixture:tr:tr01")).toBeNull();
    expect(appleTrackNumber("apple:tr:12a")).toBeNull();
    expect(appleTrackNumber("apple:tr:")).toBeNull();
  });

  it("lookup em lote, sem repetir, ordenado e com country=jp", () => {
    expect(lookupUrl(["30", "1", "30", "200"])).toBe(
      "https://itunes.apple.com/lookup?id=1,200,30&country=jp",
    );
  });

  it("previewsFromLookup guarda só faixas com prévia no host da Apple", () => {
    const body = {
      resultCount: 5,
      results: [
        { wrapperType: "track", trackId: 1, previewUrl: PREVIEW },
        { wrapperType: "track", trackId: 2, previewUrl: "https://evil.test/a.m4a" },
        { wrapperType: "track", trackId: 3 },
        { wrapperType: "collection", collectionId: 4, previewUrl: PREVIEW },
        { wrapperType: "track", trackId: "5", previewUrl: PREVIEW },
        null,
      ],
    };
    expect([...(previewsFromLookup(body) ?? new Map())]).toEqual([["apple:tr:1", PREVIEW]]);
  });

  it("resposta sem a lista results é falha, não lista vazia", () => {
    expect(previewsFromLookup({ errorMessage: "Invalid value" })).toBeNull();
    expect(previewsFromLookup([])).toBeNull();
    expect(previewsFromLookup("<html>")).toBeNull();
    expect(previewsFromLookup({ results: [] })?.size).toBe(0);
  });
});
