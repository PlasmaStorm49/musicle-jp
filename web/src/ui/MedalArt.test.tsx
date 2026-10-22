// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { MedalArt, type MedalKind } from "./MedalArt.tsx";

afterEach(cleanup);

function draw(
  kind: MedalKind,
  props: { image?: string | null; name?: string; earned?: boolean } = {},
) {
  const { container } = render(
    <MedalArt
      kind={kind}
      image={props.image ?? null}
      letter="幾"
      color={3}
      name={props.name ?? "幾田りら"}
      earned={props.earned ?? true}
      size={60}
    />,
  );
  return container.querySelector("svg") as SVGSVGElement;
}

describe("MedalArt (o desenho provisório das medalhas, M16)", () => {
  it.each(["prata", "ouro", "suprema", "geral"] as const)(
    "%s: decorativa, com a cor do artista pela classe do monograma",
    (kind) => {
      const svg = draw(kind);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.classList.contains("monogram-3")).toBe(true);
      expect(svg.getAttribute("width")).toBe("60");
    },
  );

  it("com a capa, a imagem recortada; sem ela, o monograma (P171)", () => {
    const withCover = draw("prata", { image: "/capa.jpg" });
    expect(withCover.querySelector("image")?.getAttribute("href")).toBe("/capa.jpg");
    expect(withCover.querySelector("text")).toBeNull();
    cleanup();
    const without = draw("prata");
    expect(without.querySelector("image")).toBeNull();
    expect(without.querySelector("text")?.textContent).toBe("幾");
  });

  it("a capa que não carrega vira o monograma", () => {
    const svg = draw("ouro", { image: "/quebrada.jpg" });
    fireEvent.error(svg.querySelector("image") as Element);
    expect(svg.querySelector("image")).toBeNull();
    expect(svg.querySelector("text")?.textContent).toBe("幾");
  });

  it("a que falta ganhar fica apagada pela classe (P283)", () => {
    expect(draw("ouro", { earned: false }).classList.contains("locked")).toBe(true);
    cleanup();
    expect(draw("ouro").classList.contains("locked")).toBe(false);
  });

  it("a suprema leva o nome na faixa, um caractere por linha; o longo fica só com a letra", () => {
    const short = draw("suprema", { image: "/capa.jpg" });
    expect([...short.querySelectorAll("text")].map((t) => t.textContent)).toEqual([
      "幾",
      "田",
      "り",
      "ら",
    ]);
    cleanup();
    const long = draw("suprema", { image: "/capa.jpg", name: "System Of A Down" });
    expect([...long.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["幾"]);
  });

  it("o recorte de cada medalha tem um id próprio na página", () => {
    const { container } = render(
      <>
        <MedalArt kind="prata" image="/a.jpg" letter="A" color={0} name="A" earned size={40} />
        <MedalArt kind="prata" image="/b.jpg" letter="B" color={1} name="B" earned size={40} />
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});
