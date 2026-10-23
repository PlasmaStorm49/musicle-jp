// O desenho de uma medalha (M16): o único lugar dele. Das conversas de 22/10/2026 (Apêndice O):
// a dos acertos na roseta com caudas, a completa na roseta dupla em gelo, com raios e brilhos, a
// perfeita no buquê de flores com a faixa; as gerais (P312), a pequena na roseta prata e a grande
// na moldura gelo, com as caudas oliva do AteMusic e o ícone de cada uma no miolo. As 3 de um
// artista usam a mesma capa, até o aro e enquadrada (P296); o buquê e as caudas, as cores dele
// (P296, P305). As cores são da arte, como as do logo, e ficam aqui; sem as do artista, a do
// monograma (a `--monogram` das classes `.monogram-N`, P171) e o buquê lilás.
import type { JSX } from "preact";
import { useId, useState } from "preact/hooks";
import {
  CENTER,
  coverFrame,
  type Flowers,
  SASH_SPACING,
  type SuperfanArt,
  sashLayout,
} from "../core/medalArt.ts";
import type { MedalTier, SuperfanLevel } from "../core/medals.ts";
import { medalIcon } from "./medalIcons.tsx";

/** O desenho: um dos 3 níveis do Superfan, ou uma geral, pelo tamanho do aviso dela (P312). */
export type MedalKind = SuperfanLevel | "geral" | "geral-grande";

type Props = {
  readonly kind: MedalKind;
  /** O desenho do artista (`superfanArt`, com a capa já pelo `resolveUrl`), ou o das gerais. */
  readonly art: SuperfanArt;
  /** A que falta ganhar aparece apagada (P283). */
  readonly earned: boolean;
  /** A largura, em px. */
  readonly size: number;
  /** Nas gerais, o id da medalha: o ícone do miolo (`medalIcons`); sem ícone, a marca do `art`. */
  readonly icon?: string;
};

/** O desenho de uma geral pelo tamanho do aviso dela (P312): a pequena e a grande. */
export function generalKind(tier: MedalTier): MedalKind {
  return tier === "major" ? "geral-grande" : "geral";
}

/** O desenho das gerais: sem capa; a marca (a ★ do i18n) fica para as que não têm ícone. */
export function generalArt(letter: string): SuperfanArt {
  return { image: null, crop: CENTER, flowers: null, sash: null, letter, color: 0, name: "" };
}

const SILVER = { points: "#c9cdd4", edge: "#7f858f", ring: "#f1f2f5" };
/** A completa na cor gelo (o usuário preferiu o azul da S1 ao dourado, 22/10/2026). */
const ICE = {
  rays: "#9fd6ea",
  outer: "#bfe6f4",
  inner: "#8fd0e8",
  ring: "#f4fbff",
  edge: "#3d8fb3",
  tails: ["#8fcfe6", "#a9d8ea"],
  spark: "#4aa6cc",
};
/** O oliva das gerais (P312): o miolo claro, a tinta do ícone e as caudas, a `--accent-line`. */
const OLIVE = { ring: "#ecedd2", ink: "#6f7140", tail: "#969865" };
/** O buquê lilás de sempre, por papel: o de quem não escolheu as cores. */
const LILAC: Flowers = {
  d: "#5b4bb7",
  m: "#7d6fd6",
  ml: "#a99be8",
  l: "#cdc3f5",
  w: "#f8f6ff",
  line: "#b9b0e0",
  core: "#f2d16b",
  ink: "#3c2f80",
  bow: "#b3261e",
  ring: "#5b4bb7",
  spark: "#7d6fd6",
  leaf1: "#5f8a4e",
  leaf2: "#7aa35f",
};

const fix = (n: number) => n.toFixed(1);
const fix2 = (n: number) => n.toFixed(2);
function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
/** Os pontos de uma estrela de `n` pontas (a roseta), em volta de (cx, cy). */
function star(n: number, rOut: number, rIn: number, cx: number, cy: number): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const [x, y] = polar(cx, cy, i % 2 ? rIn : rOut, (Math.PI * i) / n - Math.PI / 2);
    return `${fix(x)},${fix(y)}`;
  }).join(" ");
}

type Miolo = { readonly cx: number; readonly cy: number; readonly r: number };

/** A capa recortada em círculo, enquadrada (P296), ou o monograma no lugar dela. */
function Cover({
  clip,
  miolo,
  art,
  image,
  onError,
  plain,
  icon,
}: {
  readonly clip: string;
  readonly miolo: Miolo;
  readonly art: SuperfanArt;
  readonly image: string | null;
  readonly onError: () => void;
  /** O miolo sem artista (as gerais): o oliva claro, e não a cor do monograma. */
  readonly plain: boolean;
  /** O ícone da geral, já desenhado; sem ele, a marca do `art`. */
  readonly icon: JSX.Element | null;
}) {
  const { cx, cy, r } = miolo;
  const frame = coverFrame(cx, cy, r, art.crop);
  return (
    <>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      {image ? (
        <image
          href={image}
          x={fix2(frame.x)}
          y={fix2(frame.y)}
          width={fix2(frame.size)}
          height={fix2(frame.size)}
          preserveAspectRatio="xMidYMid slice"
          clip-path={`url(#${clip})`}
          onError={onError}
        />
      ) : (
        <g clip-path={`url(#${clip})`}>
          <rect
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            fill={plain ? OLIVE.ring : "var(--monogram)"}
          />
          {icon ? (
            // Desenhado para o miolo de raio 25, o das pequenas; a grande o escala.
            <g transform={`translate(${cx} ${cy}) scale(${fix2(r / 25)})`}>{icon}</g>
          ) : (
            <text
              x={cx}
              y={cy + r * 0.32}
              text-anchor="middle"
              font-size={r * 0.9}
              font-weight="700"
              fill={plain ? OLIVE.ink : "#ffffff"}
            >
              {art.letter}
            </text>
          )}
        </g>
      )}
    </>
  );
}

/** Um brilho de 4 pontas. */
function Spark({ x, y, s, stroke }: { x: number; y: number; s: number; stroke: string }) {
  const q = s * 0.18;
  const d = `M${x} ${y - s} Q${x + q} ${y - q} ${x + s} ${y} Q${x + q} ${y + q} ${x} ${y + s} Q${x - q} ${y + q} ${x - s} ${y} Q${x - q} ${y - q} ${x} ${y - s} Z`;
  return <path d={d} fill="#ffffff" stroke={stroke} stroke-width="0.7" />;
}

/**
 * A roseta prata com caudas (a dos acertos e a geral pequena): as pontas, o anel e as caudas, na
 * cor do artista ou no oliva das gerais.
 */
function Rosette({ tails }: { tails: string }) {
  return (
    <>
      <path d="M26 50 L18 88 L25 83 L30 90 L36 56 Z" fill={tails} />
      <path d="M48 50 L56 88 L49 83 L44 90 L38 56 Z" fill={tails} opacity="0.82" />
      <polygon points={star(14, 36, 31, 37, 37)} fill={SILVER.points} />
      <circle cx="37" cy="37" r="29.5" fill="none" stroke={SILVER.edge} stroke-width="1" />
      <circle cx="37" cy="37" r="27.5" fill={SILVER.ring} />
    </>
  );
}

/**
 * A completa e a geral grande: os raios atrás, a roseta dupla em gelo, as três caudas (a do meio na
 * cor do artista ou no oliva) e os brilhos.
 */
function IceFrame({ tail }: { tail: string }) {
  const rays = Array.from({ length: 32 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 32;
    const [x1, y1] = polar(55, 66, 18, a - 0.045);
    const [x2, y2] = polar(55, 66, i % 2 ? 50 : 56, a);
    const [x3, y3] = polar(55, 66, 18, a + 0.045);
    return `${fix(x1)},${fix(y1)} ${fix(x2)},${fix(y2)} ${fix(x3)},${fix(y3)}`;
  });
  return (
    <>
      {rays.map((p) => (
        <polygon key={p} points={p} fill={ICE.rays} opacity="0.6" />
      ))}
      <path d="M42 92 L28 134 L37 128 L43 137 L54 98 Z" fill={ICE.tails[0]} />
      <path d="M68 92 L82 134 L73 128 L67 137 L56 98 Z" fill={ICE.tails[1]} />
      <path d="M49 96 L49 138 L55 131 L61 138 L61 96 Z" fill={tail} />
      <polygon points={star(18, 42, 36, 55, 66)} fill={ICE.outer} />
      <polygon points={star(18, 38.5, 33, 55, 66)} fill={ICE.inner} transform="rotate(10 55 66)" />
      <circle cx="55" cy="66" r="32" fill={ICE.ring} stroke={ICE.edge} stroke-width="1.4" />
    </>
  );
}

function IceSparks() {
  return (
    <>
      <Spark x={16} y={30} s={4.5} stroke={ICE.spark} />
      <Spark x={95} y={38} s={3.8} stroke={ICE.spark} />
      <Spark x={14} y={100} s={3.2} stroke={ICE.spark} />
      <Spark x={97} y={104} s={4} stroke={ICE.spark} />
    </>
  );
}

/** Uma flor: 6 pétalas em volta do miolo. O ângulo sai da posição, sem sorteio. */
function Bloom({
  x,
  y,
  r,
  petal,
  white,
  p,
}: {
  x: number;
  y: number;
  r: number;
  petal: string;
  /** A pétala branca (o papel `w`) leva o miolo dourado; as coloridas, o branco. */
  white: boolean;
  p: Flowers;
}) {
  const turn = (x + y) * 0.1;
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const [px, py] = polar(x, y, r * 0.52, (Math.PI * 2 * i) / 6 + turn);
        return (
          <circle
            key={i}
            cx={fix(px)}
            cy={fix(py)}
            r={fix(r * 0.5)}
            fill={petal}
            stroke={p.line}
            stroke-width="0.35"
          />
        );
      })}
      <circle cx={fix(x)} cy={fix(y)} r={fix(r * 0.3)} fill={white ? p.core : "#ffffff"} />
    </>
  );
}

/** Um anel de flores em volta de (55, 56), com as folhas por fora. */
function FlowerRing({
  R,
  n,
  size,
  offset,
  p,
}: {
  R: number;
  n: number;
  size: number;
  offset: number;
  p: Flowers;
}) {
  // As pétalas de cada anel, em volta; as brancas ficam nas posições 1 e 5 (pela posição, e não
  // pela cor: uma paleta com outra pétala igual à branca não ganha miolos dourados a mais).
  const petals = [p.d, p.w, p.m, p.l, p.ml, p.w];
  const whites = new Set([1, 5]);
  const leaves = [p.leaf1, p.leaf2];
  const items = Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n + offset;
    const [lx, ly] = polar(55, 56, R + size * 0.9, a + Math.PI / n);
    const [fx, fy] = polar(55, 56, R, a);
    return { i, a, lx, ly, fx, fy };
  });
  return (
    <>
      {items.map(({ i, a, lx, ly }) => (
        <ellipse
          key={`l${i}`}
          cx={fix(lx)}
          cy={fix(ly)}
          rx={fix(size * 0.8)}
          ry={fix(size * 0.34)}
          transform={`rotate(${(((a + Math.PI / n) * 180) / Math.PI).toFixed(0)} ${fix(lx)} ${fix(ly)})`}
          fill={leaves[i % 2]}
        />
      ))}
      {items.map(({ i, fx, fy }) => (
        <Bloom
          key={`f${i}`}
          x={fx}
          y={fy}
          r={size * (i % 3 === 0 ? 1.15 : 1)}
          petal={petals[i % petals.length] ?? "#ffffff"}
          white={whites.has(i % petals.length)}
          p={p}
        />
      ))}
    </>
  );
}

/**
 * A faixa da perfeita, como numa coroa de flores (P299): em pé, um caractere por linha e
 * centralizada, ou deitada ao longo dela (o `sashLayout`).
 */
function Sash({ art, p }: { art: SuperfanArt; p: Flowers }) {
  const layout = sashLayout(art.sash, art.name, art.letter);
  return (
    <>
      <path
        d="M49 86 H61 V146 L55 141 L49 146 Z"
        fill="#fbfaff"
        stroke={p.line}
        stroke-width="0.8"
      />
      {layout.kind === "up" ? (
        layout.chars.map(({ ch, y }, i) => (
          <text
            key={`${i}${ch}`}
            x="55"
            y={fix2(y)}
            text-anchor="middle"
            font-size={layout.size}
            font-weight="700"
            fill={p.ink}
          >
            {ch}
          </text>
        ))
      ) : (
        <text
          x="0"
          y="0"
          transform="translate(55 116) rotate(90)"
          text-anchor="middle"
          dominant-baseline="central"
          font-size={fix2(layout.size)}
          font-weight="700"
          letter-spacing={SASH_SPACING}
          fill={p.ink}
        >
          {layout.text}
        </text>
      )}
      <path d="M55 86 L46 81 L46 91 Z M55 86 L64 81 L64 91 Z" fill={p.bow} />
      <circle cx="55" cy="86" r="2.6" fill={p.bow} />
    </>
  );
}

/** A perfeita: o buquê redondo, com a capa no meio, as fitas e a faixa. */
function Bouquet({ art, p }: { art: SuperfanArt; p: Flowers }) {
  return (
    <>
      <path d="M40 86 L26 142 L35 136 L41 146 L50 92 Z" fill={p.ml} />
      <path d="M70 86 L84 142 L75 136 L69 146 L60 92 Z" fill={p.m} />
      <path d="M51 90 L48 152 L55 146 L62 152 L59 90 Z" fill={p.d} />
      <FlowerRing R={42} n={20} size={7.4} offset={0.1} p={p} />
      <FlowerRing R={35.5} n={16} size={7.8} offset={0.17} p={p} />
      <circle cx="55" cy="56" r="29" fill="#ffffff" stroke={p.ring} stroke-width="1.4" />
      <Sash art={art} p={p} />
    </>
  );
}

/**
 * O quadro de cada uma e o miolo: nas do Superfan, a capa vai até o aro (P296); nas gerais, sem
 * capa, fica o anel claro em volta da marca.
 */
const VIEW: Readonly<Record<MedalKind, { box: string; w: number; h: number; miolo: Miolo }>> = {
  acertos: { box: "0 0 74 92", w: 74, h: 92, miolo: { cx: 37, cy: 37, r: 29.5 } },
  geral: { box: "0 0 74 92", w: 74, h: 92, miolo: { cx: 37, cy: 37, r: 25 } },
  completo: { box: "0 8 110 132", w: 110, h: 132, miolo: { cx: 55, cy: 66, r: 32 } },
  "geral-grande": { box: "0 8 110 132", w: 110, h: 132, miolo: { cx: 55, cy: 66, r: 32 } },
  perfeito: { box: "0 0 110 156", w: 110, h: 156, miolo: { cx: 55, cy: 56, r: 29 } },
};

/**
 * A medalha, decorativa (`aria-hidden`): o nome e o estado ficam no texto ao lado dela. A apagada
 * usa o filtro do CSS (`.medal-art.locked`), sem cor própria.
 */
export function MedalArt({ kind, art, earned, size, icon }: Props) {
  const clip = useId();
  // A capa que não carrega vira o monograma (como no cartão do artista, P171).
  const [failed, setFailed] = useState<string | null>(null);
  const shown = art.image && failed !== art.image ? art.image : null;
  const view = VIEW[kind];
  const p = art.flowers ?? LILAC;
  // As caudas da dos acertos e da completa na cor do buquê do artista (P305).
  const tail = art.flowers?.d ?? "var(--monogram)";
  const general = kind === "geral" || kind === "geral-grande";
  const ice = kind === "completo" || kind === "geral-grande";
  const cover = (
    <Cover
      clip={`medal-${clip}`}
      miolo={view.miolo}
      art={art}
      image={shown}
      onError={() => setFailed(art.image)}
      plain={general}
      icon={general && icon ? medalIcon(icon, { ink: OLIVE.ink, bg: OLIVE.ring }) : null}
    />
  );
  return (
    <svg
      class={`medal-art monogram-${art.color}${earned ? "" : " locked"}`}
      viewBox={view.box}
      width={size}
      height={Math.round((size * view.h) / view.w)}
      aria-hidden="true"
      focusable="false"
    >
      {kind === "acertos" && <Rosette tails={tail} />}
      {kind === "geral" && <Rosette tails={OLIVE.tail} />}
      {kind === "completo" && <IceFrame tail={tail} />}
      {kind === "geral-grande" && <IceFrame tail={OLIVE.tail} />}
      {kind === "perfeito" && <Bouquet art={art} p={p} />}
      {cover}
      <circle
        cx={view.miolo.cx}
        cy={view.miolo.cy}
        r={view.miolo.r}
        fill="none"
        stroke={kind === "perfeito" ? p.ring : ice ? ICE.edge : SILVER.edge}
        stroke-width="1"
      />
      {ice && <IceSparks />}
      {kind === "perfeito" && (
        <>
          <Spark x={10} y={16} s={4.2} stroke={p.spark} />
          <Spark x={100} y={20} s={3.8} stroke={p.spark} />
          <Spark x={9} y={90} s={3} stroke={p.spark} />
          <Spark x={101} y={88} s={3.4} stroke={p.spark} />
        </>
      )}
    </svg>
  );
}
