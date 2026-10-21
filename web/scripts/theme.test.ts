// Os temas claro e escuro (M12, ME7, ME30) travados pela CI: o styles.css é lido como texto, e
// cada par de cores que a tela usa precisa passar no contraste do WCAG 2 nos dois modos (4,5 para
// texto, 3 para borda, foco, barra e ícone). Também confere que os dois blocos do escuro (o do
// aparelho e o da troca na Início) são iguais, que nenhuma cor fixa sobra fora dos blocos de
// token e que o script do index.html lê a mesma chave do storage/theme.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_KEY } from "../src/storage/theme.ts";

const css = readFileSync(new URL("../src/ui/styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** O corpo do primeiro bloco cujo seletor é exatamente `selector` (sem blocos dentro). */
function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`bloco ausente: ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    map.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return map;
}

/** O que fica entre as chaves do @media, contando as chaves dos blocos de dentro. */
function mediaInner(source: string, media: string): string {
  const start = source.indexOf(`${media} {`);
  if (start < 0) throw new Error(`@media ausente: ${media}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`@media sem fim: ${media}`);
}

const MEDIA = "@media (prefers-color-scheme: dark)";
// Só dentro do @media: fora dele, o Automático ficaria sempre escuro.
const mediaBody = mediaInner(css, MEDIA);
const root = declarations(block(css, ":root"));
const darkMedia = declarations(block(mediaBody, ':root:not([data-theme="light"])'));
const darkForced = declarations(block(css, ':root[data-theme="dark"]'));

const light = root;
const dark = new Map([...root, ...darkForced]);

function hex(theme: Map<string, string>, token: string): string {
  const value = theme.get(`--${token}`);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${token} não é cor: ${value}`);
  return value;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const TEXT = 4.5;
const SHAPE = 3;
/** [frente, fundo, mínimo]: os pares que a tela usa (o PLANO, Apêndice L, tem a tabela). */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ["text", "bg", TEXT],
  ["text", "surface", TEXT],
  ["text", "surface-2", TEXT],
  ["muted", "bg", TEXT],
  ["muted", "surface", TEXT],
  ["muted", "surface-2", TEXT],
  ["on-primary", "primary", TEXT],
  ["on-primary", "primary-hover", TEXT],
  ["on-primary", "primary-press", TEXT],
  // A tinta dos controles e dos cartões (PR D1), solta e pressionada.
  ["text", "fill", TEXT],
  ["muted", "fill", TEXT],
  ["text", "fill-press", TEXT],
  ["muted", "fill-press", TEXT],
  // O segmento escolhido do tema: o chip invertido.
  ["bg", "text", TEXT],
  ["ok", "bg", TEXT],
  ["ok", "surface", TEXT],
  ["bad", "bg", TEXT],
  ["bad", "surface", TEXT],
  // Nas linhas de acerto e erro o texto é o normal: a cor vai na borda e no ícone.
  ["text", "ok-soft", TEXT],
  ["text", "bad-soft", TEXT],
  ["ok", "ok-soft", SHAPE],
  ["bad", "bad-soft", SHAPE],
  // O latino e o artista do ItemLabel (--muted) nas linhas de acerto e erro.
  ["muted", "ok-soft", TEXT],
  ["muted", "bad-soft", TEXT],
  ["warn", "warn-soft", TEXT],
  ["border-strong", "bg", SHAPE],
  ["border-strong", "surface", SHAPE],
  ["accent-line", "bg", SHAPE],
  ["accent-line", "surface", SHAPE],
  ["focus", "bg", SHAPE],
  ["focus", "surface", SHAPE],
  // O anel do segmento do tema cai sobre a tinta do grupo (PR D1).
  ["focus", "fill", SHAPE],
  // A barra do trecho (ME30): o liberado contra o trilho, e o que já tocou contra o liberado.
  ["bar-open", "bar-track", SHAPE],
  ["bar-play", "bar-open", SHAPE],
  // A parte travada contra o fundo (os divisores dos trechos são da cor do fundo, PR D2) e
  // contra o cartão de antes.
  ["bar-track", "surface", SHAPE],
  // O player sem caixa (PR D2): a barra fica sobre o fundo da página.
  ["bar-track", "bg", SHAPE],
  ["bucket", "surface", SHAPE],
  ["bucket-today", "surface", SHAPE],
];

describe.each([
  ["claro", light],
  ["escuro", dark],
])("o contraste do tema %s", (_, theme) => {
  it.each(PAIRS)("--%s sobre --%s: pelo menos %s", (fg, bg, min) => {
    expect(contrast(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});

describe("os blocos do tema", () => {
  it("os dois blocos do escuro (o do aparelho e o da troca) são iguais", () => {
    expect([...darkMedia]).toEqual([...darkForced]);
  });

  it("o escuro só redefine tokens que o claro tem", () => {
    for (const name of darkForced.keys()) {
      if (name !== "color-scheme") expect(root.has(name), name).toBe(true);
    }
  });

  it("no escuro, o ⬛ ganha fundo claro com texto escuro", () => {
    expect(contrast(hex(dark, "emoji-text"), hex(dark, "emoji-bg"))).toBeGreaterThanOrEqual(TEXT);
  });

  it("nenhuma cor fixa fora dos blocos de token (só os monogramas e o fundo do pop-up)", () => {
    // Hex, as funções de cor e os nomes comuns (o "white" de white-space não conta).
    const COLOR =
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(|(?<![-\w])(?:white|black|red|green|blue|gray|grey|silver)(?![-\w])/i;
    const rules = css
      .replace(block(css, ":root"), "")
      .replace(block(mediaBody, ':root:not([data-theme="light"])'), "")
      .replace(block(css, ':root[data-theme="dark"]'), "")
      .matchAll(/([^{}]+)\{([^{}]*)\}/g);
    const loose: string[] = [];
    for (const [, selector = "", body = ""] of rules) {
      const allowed = /^\s*\.monogram|::backdrop/.test(selector);
      if (!allowed && COLOR.test(body)) loose.push(selector.trim());
    }
    expect(loose).toEqual([]);
  });
});

describe("o script do tema no index.html", () => {
  it("lê a mesma chave do storage/theme.ts", () => {
    expect(html).toContain(`"${THEME_KEY}"`);
  });

  it("fica no <head>, antes do app, num script clássico e síncrono (sem module, defer nem async)", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain(THEME_KEY);
    const tagStart = head.lastIndexOf("<script", head.indexOf(THEME_KEY));
    expect(head.slice(tagStart, head.indexOf(">", tagStart) + 1)).toBe("<script>");
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("o theme-color do %s é o --bg dele", (scheme, theme) => {
    const meta = html.match(
      new RegExp(
        `<meta name="theme-color" content="([^"]+)" data-color="([^"]+)" media="\\(prefers-color-scheme: ${scheme}\\)"`,
      ),
    );
    expect(meta?.[1]).toBe(hex(theme, "bg"));
    expect(meta?.[2]).toBe(hex(theme, "bg"));
  });
});
