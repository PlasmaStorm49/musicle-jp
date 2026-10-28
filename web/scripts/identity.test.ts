// As peças da identidade (M12, PR B) que saíram do style guide do designer
// (docs/identidade/style-guide.svg, pelo docs/identidade/extrair-pecas.cjs): o selo da Início, o
// favicon, o ícone de app e o logo empilhado sem espaço. Os caminhos têm de ser os do guia
// (ninguém edita a peça à mão sem ele), e o index.html cita os ícones que existem em public/.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICONS } from "../src/ui/assets/icons.ts";
import { PROVISIONAL_ICONS } from "../src/ui/assets/provisional-icons.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const noComments = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, "");

type Path = { readonly d: string; readonly fill: string | undefined };

/** Cada <path>, na ordem do arquivo (os índices do docs/identidade/README.md). */
function paths(svg: string): Path[] {
  return [...noComments(svg).matchAll(/<path\b([^>]*)>/g)].map(([, attrs = ""]) => ({
    d: attrs.match(/\bd="([^"]+)"/)?.[1] ?? "",
    fill: attrs.match(/\bfill="([^"]+)"/)?.[1],
  }));
}

/** Os elementos do SVG, na ordem (para não entrar <g>, transform, <image> ou script). */
const tags = (svg: string) => [...noComments(svg).matchAll(/<([a-zA-Z]+)\b/g)].map((m) => m[1]);
const viewBox = (svg: string) => noComments(svg).match(/<svg\b[^>]*\bviewBox="([^"]+)"/)?.[1];
/** As formas de um caminho (cada M começa uma). */
const shapes = (d: string) => d.split(/(?=M)/).filter(Boolean).sort();

const GUIDE = paths(read("../../docs/identidade/style-guide.svg"));
const html = read("../index.html");

describe("as peças do style guide", () => {
  it.each([
    ["../src/ui/assets/logo-selo.svg", 38, "5880 9786 1033 1025", ["svg", "path"]],
    ["../public/favicon.svg", 37, "4231 11282 1033 1025", ["svg", "rect", "path"]],
  ])("%s é o path[%s] do guia, sem alteração, recortado no viewBox %s", (file, index, box, els) => {
    const svg = read(file);
    expect(viewBox(svg)).toBe(box);
    expect(tags(svg)).toEqual(els);
    expect(paths(svg)).toEqual([GUIDE[index]]);
  });

  // O ✓ se desenha espelhado no próprio viewBox (x vira 2 · 1864 + 975 − x), com o caminho do guia
  // (o usuário, 27/10/2026); o X e o chevron, sem transformação.
  it.each([
    ["wrong", 33, "1865 9881 787 794", undefined],
    ["right", 35, "1864 11588 975 719", "matrix(-1 0 0 1 4703 0)"],
    ["next", 42, "6099 13241 626 739", undefined],
  ] as const)(
    "o ícone %s (assets/icons.ts) é o path[%s] do guia, no viewBox %s, com o transform %s",
    (name, index, box, transform) => {
      expect(ICONS[name]).toStrictEqual({
        viewBox: box,
        d: GUIDE[index]?.d,
        ...(transform ? { transform } : {}),
      });
    },
  );

  it("o logo empilhado sem espaço tem o 当 e as formas do nome do guia (path[0] a path[3])", () => {
    const svg = read("../../docs/identidade/logo-empilhado-atemusic.svg");
    const [m1, m2, m3, ate, music] = paths(svg);
    expect([m1, m2, m3]).toEqual([GUIDE[1], GUIDE[2], GUIDE[3]]);
    // O nome vira dois caminhos ("ate" e "music"), com as mesmas formas, só deslocadas por grupo.
    expect(shapes(`${ate?.d}${music?.d}`)).toEqual(shapes(GUIDE[0]?.d ?? ""));
    expect(tags(svg)).toEqual(["svg", "path", "path", "path", "g", "path", "g", "path"]);
  });

  it("o ícone de app é um PNG RGB (opaco, sem transparência) de 180 × 180, o tamanho do iPhone", () => {
    const png = readFileSync(new URL("../public/apple-touch-icon.png", import.meta.url));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
    // O tipo de cor: 2 é RGB; 6 seria RGBA, e o iOS pintaria de preto o que fosse transparente.
    expect(png[25]).toBe(2);
  });
});

describe("os ícones provisórios (P218)", () => {
  it("nenhum repete um nome do guia: quando o designer mandar o dele, o do guia entra no lugar", () => {
    for (const name of Object.keys(PROVISIONAL_ICONS))
      expect(Object.keys(ICONS)).not.toContain(name);
  });

  it("cada um é um caminho preenchido, do M ao Z, com a sua viewBox (como as peças do guia)", () => {
    for (const { viewBox, d } of Object.values(PROVISIONAL_ICONS)) {
      expect(viewBox).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
    }
  });
});

describe("os ícones no index.html", () => {
  it.each([
    ['rel="icon" href="/favicon.svg"', "../public/favicon.svg"],
    ['rel="apple-touch-icon" href="/apple-touch-icon.png"', "../public/apple-touch-icon.png"],
  ])("%s, e o arquivo existe em public/", (link, file) => {
    expect(html).toContain(link);
    expect(existsSync(new URL(file, import.meta.url))).toBe(true);
  });
});
