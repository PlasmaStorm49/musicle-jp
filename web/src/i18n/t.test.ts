import { describe, expect, it } from "vitest";
import { t, tAround, tn } from "./t.ts";

describe("t", () => {
  it("substitui parâmetros e mantém os que faltam", () => {
    expect(t("summary.score", { score: 5, max: 18 })).toBe("5 de 18 pontos");
    expect(t("summary.score", { score: 5 })).toBe("5 de {max} pontos");
  });
});

describe("tAround (ME68)", () => {
  it("parte o texto no {slot} e preenche o resto", () => {
    expect(tAround("home.artistsSession", "artist", { score: "1 ponto" })).toEqual([
      "Nesta sessão (",
      "): 1 ponto",
    ]);
    expect(tAround("artists.loadingArtist", "artist")).toEqual(["Carregando as músicas de ", "…"]);
  });

  it("as chaves com o nome do artista têm o {artist} uma vez só", () => {
    for (const key of [
      "home.artistsSession",
      "home.artistsSuperfan",
      "artists.loadingArtist",
      "artists.retryArtist",
    ] as const) {
      const [before, after] = tAround(key, "artist", { score: "", points: "", songs: "" });
      expect(`${before}X${after}`).toBe(t(key, { artist: "X", score: "", points: "", songs: "" }));
      expect(`${before}${after}`).not.toContain("{artist}");
    }
  });

  it("sem o {slot}, o texto inteiro vem antes", () => {
    expect(tAround("summary.score", "artist", { score: 5, max: 18 })).toEqual([
      "5 de 18 pontos",
      "",
    ]);
  });
});

describe("tn (plural)", () => {
  it("1 ponto, 0 e 5 pontos", () => {
    expect(tn("count.points", 1)).toBe("1 ponto");
    expect(tn("count.points", 0)).toBe("0 pontos");
    expect(tn("count.points", 5)).toBe("5 pontos");
  });
});
