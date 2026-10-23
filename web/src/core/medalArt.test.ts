import { describe, expect, it } from "vitest";
import {
  CENTER,
  coverFrame,
  FLOWER_ROLES,
  medalName,
  SASH_SPACING,
  sashLayout,
  sizedArtwork,
  superfanArt,
} from "./medalArt.ts";
import type { ArtistList, ArtistListEntry } from "./types.ts";

const ART = "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/aa/bb/cc/x.jpg/300x300bb.jpg";
const CARD = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/dd/ee/ff/y.jpg/300x300bb.jpg";
const FLOWERS = Object.fromEntries(FLOWER_ROLES.map((role) => [role, "#123abc"]));

const entry = (medals: unknown): ArtistListEntry =>
  ({
    id: "apple:ar:1",
    name: "歌手",
    nameLatin: "Kashu",
    file: "1.json",
    songs: 3,
    artworkUrl: CARD,
    medals,
  }) as ArtistListEntry;

const list = (e: ArtistListEntry, provider = "apple"): ArtistList =>
  ({ schemaVersion: 1, provider, storefront: "jp", artists: [e] }) as ArtistList;

const NAMES = {
  acertos: { name: "狂言", latin: "Kyogen" },
  completo: { name: "Round Robin", latin: null },
  perfeito: { name: "青い薔薇", latin: " Aoi Bara " },
};

describe("sizedArtwork: o tamanho pela mzstatic", () => {
  it("600 px, e 1000 com zoom de 1,5 ou mais; outro endereço fica igual", () => {
    expect(sizedArtwork(ART, 1)).toBe(ART.replace("300x300bb.jpg", "600x600bb.jpg"));
    expect(sizedArtwork(ART, 1.49)).toContain("/600x600bb.jpg");
    expect(sizedArtwork(ART, 1.5)).toContain("/1000x1000bb.jpg");
    expect(sizedArtwork("fixtures/art/al21.svg", 3)).toBe("fixtures/art/al21.svg");
    expect(sizedArtwork(`${ART}?x=1`, 2)).toBe(`${ART}?x=1`);
  });
});

describe("superfanArt: o desenho de um artista (P296)", () => {
  it("a capa da medalha no tamanho do zoom, o enquadramento, as flores e a faixa", () => {
    const e = entry({
      names: NAMES,
      artworkUrl: ART,
      crop: { z: 2.7, x: 0.61, y: 0.37 },
      flowers: FLOWERS,
      sash: { text: " Aimer ", along: false },
    });
    expect(superfanArt(list(e), e)).toEqual({
      image: ART.replace("300x300bb", "1000x1000bb"),
      crop: { z: 2.7, x: 0.61, y: 0.37 },
      flowers: FLOWERS,
      sash: { text: "Aimer", along: false },
      letter: "歌",
      color: expect.any(Number),
      name: "歌手",
    });
  });

  it("sem o medals (o índice velho no cache): a capa do cartão, inteira, e os padrões", () => {
    const e = entry(undefined);
    expect(superfanArt(list(e), e)).toMatchObject({
      image: CARD,
      crop: CENTER,
      flowers: null,
      sash: null,
    });
  });

  it("a capa de fora da Apple na lista real cai na do cartão, com o enquadramento central", () => {
    const e = entry({
      names: NAMES,
      artworkUrl: "https://evil.test/x.jpg",
      crop: { z: 2, x: 0, y: 0 },
    });
    expect(superfanArt(list(e), e)).toMatchObject({ image: CARD, crop: CENTER });
    // Nas fixtures, o caminho relativo vale, sem o tamanho.
    const fixture = entry({ names: NAMES, artworkUrl: "fixtures/art/al21.svg" });
    expect(superfanArt(list(fixture, "fixture"), fixture).image).toBe("fixtures/art/al21.svg");
  });

  it.each([
    ["uma cor inválida", { ...FLOWERS, d: "#ABCDEF" }],
    ["uma cor que falta", { ...FLOWERS, d: undefined }],
    ["não é objeto", "verde"],
  ])("as flores com %s: a paleta lilás", (_, flowers) => {
    const e = entry({ names: NAMES, flowers });
    expect(superfanArt(list(e), e).flowers).toBeNull();
  });

  it.each([{ z: 0.5, x: 0.5, y: 0.5 }, { z: 2, x: 1.2, y: 0.5 }, { z: 2, x: 0.5 }, "zoom"])(
    "o enquadramento inválido (%o) é o central",
    (crop) => {
      const e = entry({ names: NAMES, artworkUrl: ART, crop });
      expect(superfanArt(list(e), e).crop).toEqual(CENTER);
    },
  );

  it("a faixa vazia ou sem texto é a da regra", () => {
    for (const sash of [{ text: "  " }, { along: true }, "Eve"]) {
      const e = entry({ names: NAMES, sash });
      expect(superfanArt(list(e), e).sash).toBeNull();
    }
  });
});

describe("medalName: o nome próprio (P295, P300, P301)", () => {
  it("o nome com o latino, nos 3 (a perfeita também, P309), sem os espaços das pontas", () => {
    const e = entry({ names: NAMES });
    expect(medalName(e, "acertos")).toEqual({ name: "狂言", latin: "Kyogen" });
    expect(medalName(e, "completo")).toEqual({ name: "Round Robin", latin: null });
    expect(medalName(e, "perfeito")).toEqual({ name: "青い薔薇", latin: "Aoi Bara" });
  });

  it("o latino vazio ou que não é texto fica de fora", () => {
    const names = (latin: unknown) => ({ ...NAMES, perfeito: { name: "青い薔薇", latin } });
    for (const latin of [" ", 3, undefined]) {
      expect(medalName(entry({ names: names(latin) }), "perfeito")).toEqual({
        name: "青い薔薇",
        latin: null,
      });
    }
  });

  it("sem o nome (o índice corrompido ou velho): null, e a tela mostra só o como ganhar", () => {
    expect(medalName(entry(undefined), "acertos")).toBeNull();
    expect(medalName(entry({ names: { acertos: { name: " " } } }), "acertos")).toBeNull();
    expect(medalName(entry({ names: { acertos: "狂言" } }), "acertos")).toBeNull();
  });
});

describe("coverFrame: a capa no círculo, sem canto vazio", () => {
  it("o ponto escolhido no centro, e a capa sempre cobre o círculo", () => {
    expect(coverFrame(55, 56, 29, CENTER)).toEqual({ x: 26, y: 27, size: 58 });
    const zoom = coverFrame(55, 56, 29, { z: 2, x: 0.5, y: 0.25 });
    expect(zoom.size).toBe(116);
    expect(zoom.x).toBe(55 - 58);
    expect(zoom.y).toBe(56 - 29); // o y de 0,25 subiria demais: preso à borda de cima
    for (const crop of [
      { z: 1.3, x: 0, y: 1 },
      { z: 2.7, x: 0.61, y: 0.37 },
      { z: 4, x: 1, y: 0 },
    ]) {
      const f = coverFrame(37, 37, 29.5, crop);
      expect(f.x).toBeLessThanOrEqual(37 - 29.5);
      expect(f.y).toBeLessThanOrEqual(37 - 29.5);
      expect(f.x + f.size).toBeGreaterThanOrEqual(37 + 29.5);
      expect(f.y + f.size).toBeGreaterThanOrEqual(37 + 29.5);
    }
  });
});

describe("sashLayout: a faixa da perfeita (P299)", () => {
  const chars = (layout: ReturnType<typeof sashLayout>) =>
    layout.kind === "up" ? layout.chars.map((c) => c.ch).join("") : null;

  it("a escolhida: em pé e centrada na faixa, ou deitada", () => {
    const eve = sashLayout({ text: "Eve", along: false }, "Eve", "E");
    expect(chars(eve)).toBe("Eve");
    if (eve.kind !== "up") throw new Error("em pé");
    const ys = eve.chars.map((c) => c.y);
    expect((ys[0] ?? 0) + (ys[2] ?? 0)).toBeCloseTo(2 * (ys[1] ?? 0)); // centrada: simétrica
    expect(sashLayout({ text: "YOASOBI", along: true }, "YOASOBI", "Y")).toMatchObject({
      kind: "along",
      text: "YOASOBI",
    });
  });

  it("com 6 caracteres, mais junta e menor; com mais de 6 em pé, a letra", () => {
    const six = sashLayout({ text: "볼빨간사춘기", along: false }, "x", "B");
    expect(six).toMatchObject({ kind: "up", size: 7 });
    expect(chars(sashLayout({ text: "新しい学校のリーダーズ", along: false }, "x", "新"))).toBe(
      "新",
    );
  });

  it("sem escolha: o nome em pé sem os espaços; o latino longo deitado; o resto, a letra", () => {
    expect(chars(sashLayout(null, "松田 聖子", "松"))).toBe("松田聖子");
    expect(sashLayout(null, "Hoshizora Drive", "H")).toMatchObject({ kind: "along" });
    expect(chars(sashLayout(null, "新しい学校のリーダーズ", "新"))).toBe("新");
    expect(chars(sashLayout(null, "", "?"))).toBe("?");
  });

  it("a deitada com mais de 28 letras não cabe nem no corpo mínimo: a letra", () => {
    const text = "A".repeat(29);
    expect(sashLayout({ text, along: true }, "x", "S")).toMatchObject({ kind: "up", size: 7.5 });
    expect(sashLayout(null, text, "A")).toMatchObject({ kind: "up" });
    expect(sashLayout({ text: "A".repeat(28), along: true }, "x", "S").kind).toBe("along");
  });

  it("o latino deitado diminui para caber na faixa, com o espaço entre as letras", () => {
    const short = sashLayout({ text: "SOAD", along: true }, "x", "S");
    const long = sashLayout({ text: "System Of A Down", along: true }, "x", "S");
    expect(short.size).toBe(7.6);
    expect(long.size).toBeLessThan(short.size);
    // As letras (0,64 do corpo cada) e o espaço entre elas cabem nos 44 da faixa.
    for (const text of ["UNLIMITS", "System Of A Down", "Hoshizora Drive Forever"]) {
      const layout = sashLayout({ text, along: true }, "x", "S");
      const width = text.length * 0.64 * layout.size + SASH_SPACING * (text.length - 1);
      expect(width, text).toBeLessThanOrEqual(44.001);
    }
  });
});
