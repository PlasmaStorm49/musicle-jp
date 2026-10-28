// Extrai do style guide (docs/identidade/style-guide.svg) as peças do M12: o selo da Início, o
// favicon, o ícone de app (PNG) e o logo empilhado sem espaço (P179), do PR B; e os ícones das
// tentativas (o X, o ✓ e o chevron, em web/src/ui/assets/icons.ts), do PR C. Os caminhos saem
// iguais aos do guia; só o viewBox recorta (e, no logo, um translate por grupo de letras; no ✓,
// o espelho).
// Não roda na CI: rode à mão quando o guia mudar (por exemplo, com a versão opaca do selo, PD12),
// da raiz do repositório, com o web/node_modules instalado:
//   node docs/identidade/extrair-pecas.cjs [pasta-para-uma-captura-de-conferência]
// O web/scripts/identity.test.ts confere depois que as peças são as do guia.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const { chromium } = require(path.join(ROOT, "web/node_modules/@playwright/test"));
const GUIDE = path.join(ROOT, "docs/identidade/style-guide.svg");
const SHOTS = process.argv[2];
const RED = "#EA3829";

const guide = fs.readFileSync(GUIDE, "utf8");
const paths = [...guide.matchAll(/<path\b[^>]*>/g)].map((m) => m[0]);
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const d = (i) => attr(paths[i], "d");

// Os índices do docs/identidade/README.md.
const BADGE_ROUND = 38;
const BADGE_SQUARE = 37;
const WORDMARK = 0;
const MARK = [1, 2, 3];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const blank = "<html><body><svg id=s xmlns='http://www.w3.org/2000/svg'></svg></body></html>";
  await page.setContent(blank);
  /** A caixa de cada d, medida no Chromium. */
  const boxes = (ds) =>
    page.evaluate((list) => {
      const svg = document.getElementById("s");
      return list.map((dd) => {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", dd);
        svg.append(p);
        const b = p.getBBox();
        p.remove();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
    }, ds);
  const box = async (dd) => (await boxes([dd]))[0];
  /** A caixa arredondada para fora (o viewBox nunca corta o desenho). */
  const viewBox = (b) => {
    const x = Math.floor(b.x);
    const y = Math.floor(b.y);
    const w = Math.ceil(b.x + b.w) - x;
    const h = Math.ceil(b.y + b.h) - y;
    return { x, y, w, h, s: `${x} ${y} ${w} ${h}` };
  };

  // Conferência: as peças são as esperadas (cor e número de formas).
  for (const [i, fill, parts] of [
    [BADGE_ROUND, RED, 5],
    [BADGE_SQUARE, RED, 5],
    [WORDMARK, RED, 10],
  ]) {
    const got = attr(paths[i], "fill");
    const n = (d(i).match(/M/g) || []).length;
    if (got !== fill || n !== parts) throw new Error(`path[${i}]: ${got}, ${n} formas`);
  }

  const header = (vb, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>`;

  // 1. O selo redondo da Início (vazado: o furo mostra o fundo da página). Sem comentário: com
  //    menos de 4 kB, o Vite embute o arquivo no código, e a origem fica no README.
  const round = viewBox(await box(d(BADGE_ROUND)));
  const selo = `${header(round.s)}<path fill="${RED}" d="${d(BADGE_ROUND)}"/></svg>\n`;
  fs.writeFileSync(path.join(ROOT, "web/src/ui/assets/logo-selo.svg"), selo);

  // 2. O favicon: o selo quadrado, opaco (um branco por baixo dos furos, recuado 15% para ficar
  //    dentro dos cantos arredondados).
  const sq = viewBox(await box(d(BADGE_SQUARE)));
  const inset = Math.round(sq.w * 0.15);
  const white = `<rect fill="#FFFFFF" x="${sq.x + inset}" y="${sq.y + inset}" width="${sq.w - 2 * inset}" height="${sq.h - 2 * inset}"/>`;
  const favicon = `${header(sq.s)}${white}<path fill="${RED}" d="${d(BADGE_SQUARE)}"/></svg>\n`;
  fs.writeFileSync(path.join(ROOT, "web/public/favicon.svg"), favicon);

  // 3. O ícone de app (iOS): quadrado vermelho de ponta a ponta, o branco e o selo por cima, em
  //    180 × 180, desenhado pelo Chromium (o PNG sai RGB, sem transparência).
  const side = Math.max(sq.w, sq.h);
  const appIcon =
    `${header(`${sq.x} ${sq.y} ${side} ${side}`, ' width="180" height="180"')}` +
    `<rect fill="${RED}" x="${sq.x}" y="${sq.y}" width="${side}" height="${side}"/>` +
    `${white}<path fill="${RED}" d="${d(BADGE_SQUARE)}"/></svg>`;
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(`<html><body style="margin:0">${appIcon}</body></html>`);
  const iconPng = path.join(ROOT, "web/public/apple-touch-icon.png");
  await page.screenshot({ path: iconPng, clip: { x: 0, y: 0, width: 180, height: 180 } });
  await page.setContent(blank);

  // 4. O logo empilhado vermelho sem espaço (P179), para o designer conferir.
  const parts = d(WORDMARK)
    .split(/(?=M)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pb = await boxes(parts);
  const items = parts.map((dd, i) => ({ dd, ...pb[i] }));
  // Furo (o miolo do a e do e) é a forma dentro da caixa de outra: vai com a letra dela.
  const inside = (a, b) =>
    a !== b && a.x >= b.x && a.x + a.w <= b.x + b.w && a.y >= b.y && a.y + a.h <= b.y + b.h;
  const letters = items.filter((a) => !items.some((b) => inside(a, b)));
  const sorted = [...letters].sort((a, b) => a.x - b.x);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted.slice(0, i).reduce((m, l) => Math.max(m, l.x + l.w), -Infinity);
    gaps.push({ at: i, gap: sorted[i].x - prev });
  }
  const space = gaps.reduce((a, b) => (b.gap > a.gap ? b : a));
  const normal = gaps.filter((g) => g !== space && g.gap > 0).map((g) => g.gap);
  const typical = normal.reduce((s, g) => s + g, 0) / normal.length;
  const splitX = sorted[space.at].x;
  const left = items.filter((it) => it.x + it.w <= splitX + 0.01);
  const right = items.filter((it) => it.x + it.w > splitX + 0.01);
  const pull = space.gap - typical;

  const markBoxes = await boxes(MARK.map(d));
  const mark = markBoxes.reduce(
    (u, b) => ({
      x0: Math.min(u.x0, b.x),
      x1: Math.max(u.x1, b.x + b.w),
      y0: Math.min(u.y0, b.y),
      y1: Math.max(u.y1, b.y + b.h),
    }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
  );
  const word = {
    x0: Math.min(...items.map((i) => i.x)),
    x1: Math.max(...items.map((i) => i.x + i.w)) - pull,
  };
  const center = (mark.x0 + mark.x1) / 2 - (word.x0 + word.x1) / 2;
  const y1 = Math.max(...items.map((i) => i.y + i.h));
  const x0 = Math.min(mark.x0, word.x0 + center);
  const x1 = Math.max(mark.x1, word.x1 + center);
  const pad = 20;
  const logoVb = `${Math.floor(x0 - pad)} ${Math.floor(mark.y0 - pad)} ${Math.ceil(x1 - x0 + 2 * pad)} ${Math.ceil(y1 - mark.y0 + 2 * pad)}`;
  const f = (n) => Number(n.toFixed(2));
  const logo =
    "<!-- O logo empilhado vermelho do style guide (docs/identidade/style-guide.svg, path[0] a\n" +
    "     path[3]) com o nome sem espaço (P179, aprovado pelo designer na PD11). A exceção ao \"só o\n" +
    "     viewBox\": o path[0] (o nome) vira dois, \"ate\" e \"music\", com as mesmas formas do guia;\n" +
    `     as de "music" andam ${f(pull)} unidades para a esquerda (o espaço vira a distância média\n` +
    "     entre as letras), e o nome é centralizado de novo sob o 当, com 20 de margem. -->\n" +
    `${header(logoVb)}` +
    MARK.map((i) => `<path fill="${RED}" d="${d(i)}"/>`).join("") +
    `<g transform="translate(${f(center)} 0)"><path fill="${RED}" d="${left.map((i) => i.dd).join("")}"/>` +
    `<g transform="translate(${f(-pull)} 0)"><path fill="${RED}" d="${right.map((i) => i.dd).join("")}"/></g></g>` +
    "</svg>\n";
  fs.writeFileSync(path.join(ROOT, "docs/identidade/logo-empilhado-atemusic.svg"), logo);
  console.log(JSON.stringify({ round: round.s, square: sq.s, space: f(space.gap), typical: f(typical), pull: f(pull), center: f(center) }));

  // 5. Os ícones das tentativas do Desafio (M12, PR C): o X, o ✓ e o chevron, num módulo TS
  //    gerado. O caminho fica o do guia; a cor sai do CSS (currentColor), e não do fill fixo.
  //    O ✓ do guia aparecia invertido na tela: ele se desenha espelhado, no próprio viewBox (o
  //    usuário, 27/10/2026), e o caminho continua o do guia.
  const icons = [
    ["wrong", 33, RED, false],
    ["right", 35, "#54941C", true],
    ["next", 42, RED, false],
  ];
  const iconLines = [];
  const iconBoxes = {};
  const iconMirror = {};
  for (const [name, i, fill, mirror] of icons) {
    const n = (d(i).match(/M/g) || []).length;
    if (attr(paths[i], "fill") !== fill || n !== 1) throw new Error(`path[${i}]: ${attr(paths[i], "fill")}, ${n} formas`);
    iconBoxes[i] = await box(d(i));
    const vb = viewBox(iconBoxes[i]);
    // O espelho em volta do meio do viewBox: x vira 2·x0 + largura − x, e o desenho fica nele.
    iconMirror[i] = mirror ? `matrix(-1 0 0 1 ${2 * vb.x + vb.w} 0)` : null;
    const transform = iconMirror[i] ? `\n    transform: "${iconMirror[i]}",` : "";
    iconLines.push(`  ${name}: {\n    viewBox: "${vb.s}",\n    d: "${d(i)}",${transform}\n  },`);
  }
  const iconsTs =
    "// Gerado por docs/identidade/extrair-pecas.cjs a partir do style guide do designer (o X é o\n" +
    "// path[33], o ✓ o path[35] e o chevron o path[42]). Não edite à mão: rode o script de novo. O\n" +
    "// web/scripts/identity.test.ts confere que os caminhos são os do guia. O ✓ leva o espelho\n" +
    "// (transform): no desenho do guia, ele aparecia invertido na tela (o usuário, 27/10/2026).\n" +
    "// Fica fora do Biome de propósito (a pasta assets/ é ignorada), e o tsc confere os tipos.\n" +
    `export const ICONS = {\n${iconLines.join("\n")}\n} as const;\n\n` +
    "export type IconName = keyof typeof ICONS;\n";
  fs.writeFileSync(path.join(ROOT, "web/src/ui/assets/icons.ts"), iconsTs);

  // 6. A captura de conferência (opcional): o selo nos dois fundos, o favicon, o ícone e o logo
  //    antes e depois.
  if (SHOTS) {
    const original =
      `${header(logoVb)}` + [0, 1, 2, 3].map((i) => `<path fill="${RED}" d="${d(i)}"/>`).join("") + "</svg>";
    const strip = (svg) => svg.replace(/<!--[\s\S]*?-->\n/, "");
    const cell = (svg, bg, w = 160) =>
      `<div style="background:${bg};padding:12px;display:inline-block;vertical-align:top"><div style="width:${w}px">${strip(svg).replace("<svg ", '<svg style="width:100%;height:auto" ')}</div></div>`;
    await page.setViewportSize({ width: 900, height: 420 });
    await page.setContent(
      `<html><body style="margin:0">${cell(selo, "#fff", 80)}${cell(selo, "#000", 80)}${cell(favicon, "#ddd", 80)}` +
        `<img src="data:image/png;base64,${fs.readFileSync(iconPng).toString("base64")}" style="margin:12px;border-radius:40px">` +
        `<br>${cell(original, "#fff", 300)}${cell(logo, "#fff", 300)}<br>` +
        icons
          .map(([, i]) => {
            const transform = iconMirror[i] ? ` transform="${iconMirror[i]}"` : "";
            return cell(`${header(viewBox(iconBoxes[i]).s)}<path fill="#000" d="${d(i)}"${transform}/></svg>`, "#fff", 60);
          })
          .join("") +
        "</body></html>",
    );
    await page.screenshot({ path: path.join(SHOTS, "pecas.png"), fullPage: true });
  }
  await browser.close();
})();
