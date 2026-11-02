// Gera os ícones provisórios (P218) no estilo do designer: traço de marcador grosso, pontas
// cortadas e arredondadas, espessura irregular, um tremor leve na borda e a "fenda" de brilho.
// Cada ícone é um <path> só (subcaminhos somados; a fenda tem o sentido contrário e vira um furo
// com a regra nonzero). Uso, da raiz: node docs/identidade/provisional-icons.mjs saida.json; os
// caminhos de cada ícone vão à mão para o web/src/ui/assets/provisional-icons.ts.
import { writeFileSync } from "node:fs";

/** PRNG determinístico (mulberry32): o mesmo desenho a cada execução. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Number(n.toFixed(1));

/** Um polígono fechado vira curvas suaves (Catmull-Rom → Bézier cúbica). */
function smooth(points) {
  const n = points.length;
  const p = (i) => points[(i + n) % n];
  let d = `M${f(p(0)[0])} ${f(p(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p(i - 1);
    const [x1, y1] = p(i);
    const [x2, y2] = p(i + 1);
    const [x3, y3] = p(i + 2);
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(x2)} ${f(y2)}`;
  }
  return `${d}Z`;
}

/** Área com sinal (para saber o sentido do contorno). */
const area = (pts) =>
  pts.reduce((s, [x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return s + (x * y2 - x2 * y);
  }, 0) / 2;

const orient = (pts, sign) => (Math.sign(area(pts)) === sign ? pts : [...pts].reverse());

/** Um ponto da linha central e a normal dele. */
function frame(center, i) {
  const a = center[Math.max(0, i - 1)];
  const b = center[Math.min(center.length - 1, i + 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: center[i], n: [-(b[1] - a[1]) / len, (b[0] - a[0]) / len], t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
}

/**
 * O traço de marcador: a linha central (pontos), a largura em cada ponto, as pontas cortadas
 * (um canto arredondado pequeno) e o tremor. Devolve o contorno (pontos, sentido positivo).
 */
function stroke(center, width, { seed = 1, wobble = 0.6, corner = 0.28 } = {}) {
  const r = rng(seed);
  const left = [];
  const right = [];
  center.forEach((_, i) => {
    const { p, n } = frame(center, i);
    const w = width(i / (center.length - 1)) / 2;
    const jl = (r() - 0.5) * wobble;
    const jr = (r() - 0.5) * wobble;
    left.push([p[0] + n[0] * (w + jl), p[1] + n[1] * (w + jl)]);
    right.push([p[0] - n[0] * (w + jr), p[1] - n[1] * (w + jr)]);
  });
  // As pontas: o corte quase reto, com os cantos um pouco para dentro (arredondados).
  const cap = (end) => {
    const i = end ? center.length - 1 : 0;
    const { p, t, n } = frame(center, i);
    const w = width(end ? 1 : 0) / 2;
    const dir = end ? 1 : -1;
    const k = corner * w;
    const tip = [p[0] + t[0] * dir * k, p[1] + t[1] * dir * k];
    return [
      [tip[0] + n[0] * w * 0.55, tip[1] + n[1] * w * 0.55],
      [tip[0] - n[0] * w * 0.55, tip[1] - n[1] * w * 0.55],
    ];
  };
  const [endL, endR] = cap(true);
  const [startL, startR] = cap(false);
  const outline = [...left, endL, endR, ...right.reverse(), startR, startL];
  return orient(outline, 1);
}

/** A fenda de brilho: um fio fino, paralelo a uma borda, de t0 a t1 (furo: sentido contrário). */
function slit(center, width, side, t0, t1, thick = 1.6, inset = 0.62) {
  const pts = [];
  const back = [];
  const i0 = Math.round(t0 * (center.length - 1));
  const i1 = Math.round(t1 * (center.length - 1));
  for (let i = i0; i <= i1; i++) {
    const { p, n } = frame(center, i);
    const w = (width(i / (center.length - 1)) / 2) * inset * side;
    // Fino nas pontas da fenda, mais largo no meio.
    const s = Math.sin(((i - i0) / Math.max(1, i1 - i0)) * Math.PI);
    const h = (thick / 2) * (0.35 + 0.65 * s) * side;
    pts.push([p[0] + n[0] * (w + h), p[1] + n[1] * (w + h)]);
    back.push([p[0] + n[0] * (w - h), p[1] + n[1] * (w - h)]);
  }
  return orient([...pts, ...back.reverse()], -1);
}

/** Pontos de uma reta, de a para b. */
const line = (a, b, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);

/** Pontos de um arco de círculo (centro, raio, ângulos em graus). */
const arc = (c, rad, a0, a1, n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [c[0] + rad * Math.cos(a), c[1] + rad * Math.sin(a)];
  });

/** Um disco irregular (o sol, o miolo). */
function disc(c, rad, seed) {
  const r = rng(seed);
  const ph = r() * 6.28;
  const pts = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const k = 1 + 0.035 * Math.sin(3 * a + ph) + 0.02 * Math.sin(5 * a + 1.3 * ph) + (r() - 0.5) * 0.012;
    return [c[0] + rad * k * Math.cos(a), c[1] + rad * k * Math.sin(a)];
  });
  return orient(pts, 1);
}

const taper = (w0, w1) => (t) => w0 + (w1 - w0) * t;
const swell = (w, amp) => (t) => w * (1 + amp * Math.sin(t * Math.PI));

const ICONS = {};

/** As partes (contornos em pontos) viram { viewBox, d }, com a caixa justa e uma folga de 1. */
function icon(parts) {
  const all = parts.flat();
  const xs = all.map((q) => q[0]);
  const ys = all.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs) - 1);
  const y0 = Math.floor(Math.min(...ys) - 1);
  const x1 = Math.ceil(Math.max(...xs) + 1);
  const y1 = Math.ceil(Math.max(...ys) + 1);
  return { viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, d: parts.map(smooth).join("") };
}

/** A fenda num arco de círculo (o miolo do sol). */
function arcSlit(c, rad, a0, a1, thick) {
  const inner = arc(c, rad, a0, a1, 16);
  const s = [];
  const b = [];
  inner.forEach(([x, y], i) => {
    const h = (thick / 2) * (0.35 + 0.65 * Math.sin((i / (inner.length - 1)) * Math.PI));
    const dx = x - c[0];
    const dy = y - c[1];
    const len = Math.hypot(dx, dy);
    s.push([x + (dx / len) * h, y + (dy / len) * h]);
    b.push([x - (dx / len) * h, y - (dy / len) * h]);
  });
  return orient([...s, ...b.reverse()], -1);
}

// O sol: o miolo irregular, 8 raios curtos e grossos, como toques de marcador (de comprimentos um
// pouco diferentes), e a fenda no miolo, no alto à esquerda.
{
  const parts = [disc([50, 50], 23, 7)];
  const rr = rng(11);
  for (let k = 0; k < 8; k++) {
    const a = ((k * 45 - 90 + (rr() - 0.5) * 6) * Math.PI) / 180;
    const r0 = 31 + rr() * 1.5;
    const r1 = 48 + (k % 2 ? -4 : 0) + rr() * 2;
    const c = line([50 + r0 * Math.cos(a), 50 + r0 * Math.sin(a)], [50 + r1 * Math.cos(a), 50 + r1 * Math.sin(a)], 8);
    parts.push(stroke(c, taper(12.5, 8.5), { seed: 20 + k, wobble: 0.6, corner: 0.3 }));
  }
  parts.push(arcSlit([50, 50], 17, 192, 262, 2.2));
  ICONS.sun = icon(parts);
}

// A lua: um crescente (☾), um arco de ~195° grosso no meio e fino nas pontas, com a fenda ao
// longo da borda de fora.
{
  const c = arc([54, 50], 27, 98, 292, 30);
  const w = (t) => 5 + 27 * Math.sin(t * Math.PI) ** 1.6;
  ICONS.moon = icon([stroke(c, w, { seed: 31, wobble: 0.5, corner: 0.2 }), slit(c, w, 1, 0.25, 0.62, 2.2, 0.68)]);
}

// O alto-falante: a caixa e o cone num polígono grosso, e duas ondas em arco.
function speakerBody(seed) {
  const r = rng(seed);
  const j = () => (r() - 0.5) * 0.8;
  const pts = [
    [8 + j(), 35 + j()], [10, 33.5], [24, 33.5 + j()], [44, 15 + j()], [48, 14], [50.5, 17 + j()],
    [51, 50 + j()], [50.5, 83 + j()], [48, 86], [44, 85 + j()], [24, 66.5 + j()], [10, 66.5], [8 + j(), 65 + j()], [7.5, 50 + j()],
  ];
  return orient(pts, 1);
}
function speakerSlit() {
  return slit(line([27, 40], [44, 24], 8), () => 6, 1, 0.1, 0.85, 2.2, 0.4);
}
{
  const w1 = arc([50, 50], 17, -40, 40, 14);
  const w2 = arc([50, 50], 33, -44, 44, 18);
  ICONS.speaker = icon([
    speakerBody(41),
    speakerSlit(),
    stroke(w1, swell(11, 0.12), { seed: 43, wobble: 0.5, corner: 0.25 }),
    stroke(w2, swell(11.5, 0.12), { seed: 44, wobble: 0.5, corner: 0.25 }),
  ]);
}
// O alto-falante mudo: o mesmo corpo e um X curto de dois traços, no lugar das ondas.
{
  ICONS.speakerMuted = icon([
    speakerBody(41),
    speakerSlit(),
    stroke(line([63, 35], [90, 65], 10), swell(12, 0.1), { seed: 51, wobble: 0.6, corner: 0.22 }),
    stroke(line([90, 35], [63, 65], 10), swell(11, 0.1), { seed: 52, wobble: 0.6, corner: 0.22 }),
  ]);
}

writeFileSync(process.argv[2] ?? "provisional-icons.json", JSON.stringify(ICONS, null, 1));
for (const [k, v] of Object.entries(ICONS)) console.log(`${k}: ${v.viewBox}, ${v.d.length} caracteres`);
