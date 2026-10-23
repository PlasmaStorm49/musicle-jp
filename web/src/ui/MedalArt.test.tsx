// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { CENTER, FLOWER_ROLES, type SuperfanArt } from "../core/medalArt.ts";
import { MEDALS } from "../core/medals.ts";
import { generalArt, generalKind, MedalArt, type MedalKind } from "./MedalArt.tsx";
import { ICON_IDS } from "./medalIcons.tsx";

afterEach(cleanup);

const ART: SuperfanArt = {
  image: null,
  crop: CENTER,
  flowers: null,
  sash: null,
  letter: "幾",
  color: 3,
  name: "幾田りら",
};
const FLOWERS = Object.fromEntries(FLOWER_ROLES.map((role) => [role, "#111111"])) as NonNullable<
  SuperfanArt["flowers"]
>;

function draw(kind: MedalKind, art: Partial<SuperfanArt> = {}, earned = true) {
  const { container } = render(
    <MedalArt kind={kind} art={{ ...ART, ...art }} earned={earned} size={60} />,
  );
  return container.querySelector("svg") as SVGSVGElement;
}

const texts = (svg: SVGSVGElement) => [...svg.querySelectorAll("text")].map((t) => t.textContent);

describe("MedalArt (o desenho das medalhas, M16)", () => {
  it.each(["acertos", "completo", "perfeito", "geral", "geral-grande"] as const)(
    "%s: decorativa, com a cor do artista pela classe do monograma",
    (kind) => {
      const svg = draw(kind);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.classList.contains("monogram-3")).toBe(true);
      expect(svg.getAttribute("width")).toBe("60");
    },
  );

  it.each([
    ["acertos", "29.5"],
    ["completo", "32"],
    ["perfeito", "29"],
    ["geral", "25"],
    ["geral-grande", "32"],
  ] as const)("%s: a capa vai até o aro (r %s); a geral fica com o anel claro", (kind, r) => {
    expect(draw(kind).querySelector("clipPath circle")?.getAttribute("r")).toBe(r);
  });

  it("com a capa, a imagem enquadrada no círculo; sem ela, o monograma (P171)", () => {
    const whole = draw("acertos", { image: "/capa.jpg" }).querySelector("image");
    expect(whole?.getAttribute("href")).toBe("/capa.jpg");
    // Inteira: o quadrado de 59 em volta do centro (37, 37).
    expect([whole?.getAttribute("x"), whole?.getAttribute("width")]).toEqual(["7.50", "59.00"]);
    cleanup();
    const zoom = draw("acertos", { image: "/capa.jpg", crop: { z: 2, x: 0.5, y: 0.5 } });
    expect(zoom.querySelector("image")?.getAttribute("width")).toBe("118.00");
    cleanup();
    const without = draw("acertos");
    expect(without.querySelector("image")).toBeNull();
    expect(texts(without)).toEqual(["幾"]);
  });

  it("a capa que não carrega vira o monograma", () => {
    const svg = draw("completo", { image: "/quebrada.jpg" });
    fireEvent.error(svg.querySelector("image") as Element);
    expect(svg.querySelector("image")).toBeNull();
    expect(texts(svg)).toEqual(["幾"]);
  });

  it("a que falta ganhar fica apagada pela classe (P283)", () => {
    expect(draw("completo", {}, false).classList.contains("locked")).toBe(true);
    cleanup();
    expect(draw("completo").classList.contains("locked")).toBe(false);
  });

  it("as cores do artista: o buquê e as caudas das outras duas (P296, P305)", () => {
    const fills = (svg: SVGSVGElement) =>
      new Set([...svg.querySelectorAll("[fill]")].map((el) => el.getAttribute("fill")));
    // As caudas: as duas da roseta e a do meio da completa.
    const tail = (kind: "acertos" | "completo", art: Partial<SuperfanArt>) =>
      draw(kind, { image: "/capa.jpg", ...art })
        .querySelector(kind === "acertos" ? 'path[d^="M26 50"]' : 'path[d^="M49 96"]')
        ?.getAttribute("fill");
    // Sem as cores, o buquê lilás e as caudas na cor do monograma.
    expect(fills(draw("perfeito", { image: "/capa.jpg" })).has("#5b4bb7")).toBe(true);
    cleanup();
    const bouquet = fills(draw("perfeito", { image: "/capa.jpg", flowers: FLOWERS }));
    expect(bouquet.has("#111111")).toBe(true);
    expect(bouquet.has("#5b4bb7")).toBe(false);
    cleanup();
    for (const kind of ["acertos", "completo"] as const) {
      expect(tail(kind, {}), kind).toBe("var(--monogram)");
      cleanup();
      expect(tail(kind, { flowers: FLOWERS }), kind).toBe("#111111");
      cleanup();
    }
  });

  it("a faixa da perfeita (P299): a escolhida em pé ou deitada, e a regra sem escolha", () => {
    const sash = (art: Partial<SuperfanArt>) =>
      texts(draw("perfeito", { image: "/capa.jpg", ...art }));
    expect(sash({})).toEqual(["幾", "田", "り", "ら"]);
    cleanup();
    expect(sash({ sash: { text: "Eve", along: false } })).toEqual(["E", "v", "e"]);
    cleanup();
    const along = draw("perfeito", { image: "/capa.jpg", sash: { text: "YOASOBI", along: true } });
    expect(texts(along)).toEqual(["YOASOBI"]);
    expect(along.querySelector("text")?.getAttribute("transform")).toContain("rotate(90)");
    cleanup();
    // Sem escolha: o latino longo, deitado; o resto que não cabe, a letra.
    expect(sash({ name: "System Of A Down" })).toEqual(["System Of A Down"]);
    cleanup();
    expect(sash({ name: "新しい学校のリーダーズ", letter: "新" })).toEqual(["新"]);
  });

  it("a geral sem ícone (as de exemplo): sem capa, com a marca no miolo", () => {
    const { container } = render(
      <MedalArt kind="geral" art={generalArt("★")} earned size={44} icon="demo-primeiro" />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.querySelector("image")).toBeNull();
    expect(texts(svg)).toEqual(["★"]);
  });

  it("as gerais (P312): a pequena na roseta prata, a grande no gelo, com as caudas oliva e o ícone", () => {
    const general = (kind: MedalKind, icon: string) => {
      const { container } = render(
        <MedalArt kind={kind} art={generalArt("★")} earned size={60} icon={icon} />,
      );
      return container.querySelector("svg") as SVGSVGElement;
    };
    const small = general("geral", "seguidos-7");
    // A roseta prata, com as duas caudas no oliva do AteMusic.
    expect(small.querySelector("polygon")?.getAttribute("fill")).toBe("#c9cdd4");
    expect(small.querySelector('path[d^="M26 50"]')?.getAttribute("fill")).toBe("#969865");
    // O ícone no lugar da marca, no miolo (37, 37) de raio 25.
    expect(texts(small)).toEqual([]);
    expect(small.querySelector('g[transform="translate(37 37) scale(1.00)"] path')).not.toBeNull();
    cleanup();
    const big = general("geral-grande", "seguidos-30");
    // O gelo, com os raios e os brilhos, e a cauda do meio oliva; o ícone escalado para o raio 32.
    expect(big.getAttribute("viewBox")).toBe("0 8 110 132");
    expect(big.querySelector('path[d^="M49 96"]')?.getAttribute("fill")).toBe("#969865");
    expect(big.querySelector('g[transform="translate(55 66) scale(1.28)"] path')).not.toBeNull();
    expect(texts(big)).toEqual([]);
  });

  it("toda geral tem o seu ícone, nenhum sobra, e cada um desenha no tamanho dela", () => {
    expect([...ICON_IDS].sort()).toEqual(MEDALS.map((m) => m.id).sort());
    for (const medal of MEDALS) {
      const { container } = render(
        <MedalArt
          kind={generalKind(medal.tier)}
          art={generalArt("★")}
          earned
          size={44}
          icon={medal.id}
        />,
      );
      const svg = container.querySelector("svg") as SVGSVGElement;
      expect(texts(svg), medal.id).toEqual([]);
      expect(
        svg.querySelector('g[transform^="translate("] :is(path, circle, rect)'),
        medal.id,
      ).not.toBeNull();
      expect(svg.getAttribute("viewBox"), medal.id).toBe(
        medal.tier === "major" ? "0 8 110 132" : "0 0 74 92",
      );
      cleanup();
    }
  });

  it("o recorte de cada medalha tem um id próprio na página", () => {
    const { container } = render(
      <>
        <MedalArt kind="acertos" art={{ ...ART, image: "/a.jpg" }} earned size={40} />
        <MedalArt kind="acertos" art={{ ...ART, image: "/b.jpg" }} earned size={40} />
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});
