// O desenho de uma medalha (M16): o único lugar dele, para o desenho final (P283) trocar só este
// arquivo. Provisório, das conversas de 22/10/2026 (Apêndice O): a dos acertos na roseta com caudas,
// a completa na roseta dupla em gelo, com raios e brilhos, a perfeita no buquê de flores com a faixa do
// nome, e as gerais numa roseta oliva simples. As cores são da arte, como as do logo, e ficam
// aqui; a cor do artista é a do monograma (a `--monogram` das classes `.monogram-N`, P171).
import { useId, useState } from "preact/hooks";
import type { SuperfanLevel } from "../core/medals.ts";

export type MedalKind = SuperfanLevel | "geral";

type Props = {
  readonly kind: MedalKind;
  /** A imagem do miolo (a capa do artista); sem ela, ou se não carregar, o monograma. */
  readonly image: string | null;
  /** O monograma de reserva: a letra e o índice da cor (`monogram`, core/artists.ts). */
  readonly letter: string;
  readonly color: number;
  /** O nome na faixa da perfeita; o longo demais fica só com a letra. */
  readonly name: string;
  /** A que falta ganhar aparece apagada (P283). */
  readonly earned: boolean;
  /** A largura, em px. */
  readonly size: number;
};

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
const OLIVE = { points: "#bdbf7f", edge: "#80824f", ring: "#ecedd2" };
const FLOWERS = {
  petals: ["#5b4bb7", "#f8f6ff", "#7d6fd6", "#cdc3f5", "#a99be8", "#f8f6ff"],
  line: "#b9b0e0",
  core: "#f2d16b",
  leaves: ["#5f8a4e", "#7aa35f"],
  ribbons: ["#a99be8", "#7d6fd6", "#5b4bb7"],
  ring: "#5b4bb7",
  ink: "#3c2f80",
  bow: "#b3261e",
  spark: "#7d6fd6",
};
/** Até quantos caracteres o nome cabe na faixa; mais que isso, fica a letra do monograma. */
const SASH_CHARS = 6;

const fix = (n: number) => n.toFixed(1);
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

/** A capa recortada em círculo, ou o monograma no lugar dela. */
function Cover({
  clip,
  miolo,
  image,
  letter,
  onError,
  plain,
}: {
  readonly clip: string;
  readonly miolo: Miolo;
  readonly image: string | null;
  readonly letter: string;
  readonly onError: () => void;
  /** O miolo sem artista (as gerais): o oliva claro da roseta, e não a cor do monograma. */
  readonly plain: boolean;
}) {
  const { cx, cy, r } = miolo;
  return (
    <>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      {image ? (
        <image
          href={image}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
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
          <text
            x={cx}
            y={cy + r * 0.32}
            text-anchor="middle"
            font-size={r * 0.9}
            font-weight="700"
            fill={plain ? OLIVE.edge : "#ffffff"}
          >
            {letter}
          </text>
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

/** A roseta com caudas (a dos acertos e as gerais): as pontas, o anel e as caudas na cor do artista. */
function Rosette({ palette, tails }: { palette: typeof SILVER; tails: string }) {
  return (
    <>
      <path d="M26 50 L18 88 L25 83 L30 90 L36 56 Z" fill={tails} />
      <path d="M48 50 L56 88 L49 83 L44 90 L38 56 Z" fill={tails} opacity="0.82" />
      <polygon points={star(14, 36, 31, 37, 37)} fill={palette.points} />
      <circle cx="37" cy="37" r="29.5" fill="none" stroke={palette.edge} stroke-width="1" />
      <circle cx="37" cy="37" r="27.5" fill={palette.ring} />
    </>
  );
}

/** A completa: os raios atrás, a roseta dupla em gelo, as três caudas e os brilhos. */
function IceFrame() {
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
      <path d="M49 96 L49 138 L55 131 L61 138 L61 96 Z" fill="var(--monogram)" />
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
function Bloom({ x, y, r, petal }: { x: number; y: number; r: number; petal: string }) {
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
            stroke={FLOWERS.line}
            stroke-width="0.35"
          />
        );
      })}
      <circle
        cx={fix(x)}
        cy={fix(y)}
        r={fix(r * 0.3)}
        fill={petal === "#f8f6ff" ? FLOWERS.core : "#ffffff"}
      />
    </>
  );
}

/** Um anel de flores em volta de (55, 56), com as folhas por fora. */
function FlowerRing({
  R,
  n,
  size,
  offset,
}: {
  R: number;
  n: number;
  size: number;
  offset: number;
}) {
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
          fill={FLOWERS.leaves[i % 2]}
        />
      ))}
      {items.map(({ i, fx, fy }) => (
        <Bloom
          key={`f${i}`}
          x={fx}
          y={fy}
          r={size * (i % 3 === 0 ? 1.15 : 1)}
          petal={FLOWERS.petals[i % FLOWERS.petals.length] ?? "#ffffff"}
        />
      ))}
    </>
  );
}

/** A faixa vertical com o nome, um caractere por linha, como numa coroa de flores. */
function Sash({ name, letter }: { name: string; letter: string }) {
  // O `loadArtistList` não confere as entradas: um nome que falta não pode derrubar a tela.
  const chars = typeof name === "string" ? Array.from(name.trim()) : [];
  const shown = chars.length > 0 && chars.length <= SASH_CHARS ? chars : [letter];
  return (
    <>
      <path
        d="M49 86 H61 V146 L55 141 L49 146 Z"
        fill="#fbfaff"
        stroke={FLOWERS.line}
        stroke-width="0.8"
      />
      {shown.map((ch, i) => (
        <text
          key={`${i}${ch}`}
          x="55"
          y={99 + i * 9.5}
          text-anchor="middle"
          font-size="7.5"
          font-weight="700"
          fill={FLOWERS.ink}
        >
          {ch}
        </text>
      ))}
      <path d="M55 86 L46 81 L46 91 Z M55 86 L64 81 L64 91 Z" fill={FLOWERS.bow} />
      <circle cx="55" cy="86" r="2.6" fill={FLOWERS.bow} />
    </>
  );
}

/** A perfeita: o buquê redondo, com a capa no meio, as fitas e a faixa do nome. */
function Bouquet({ name, letter }: { name: string; letter: string }) {
  const [r0, r1, r2] = FLOWERS.ribbons;
  return (
    <>
      <path d="M40 86 L26 142 L35 136 L41 146 L50 92 Z" fill={r0} />
      <path d="M70 86 L84 142 L75 136 L69 146 L60 92 Z" fill={r1} />
      <path d="M51 90 L48 152 L55 146 L62 152 L59 90 Z" fill={r2} />
      <FlowerRing R={42} n={20} size={7.4} offset={0.1} />
      <FlowerRing R={35.5} n={16} size={7.8} offset={0.17} />
      <circle cx="55" cy="56" r="29" fill="#ffffff" stroke={FLOWERS.ring} stroke-width="1.4" />
      <Sash name={name} letter={letter} />
    </>
  );
}

const VIEW: Readonly<Record<MedalKind, { box: string; w: number; h: number; miolo: Miolo }>> = {
  acertos: { box: "0 0 74 92", w: 74, h: 92, miolo: { cx: 37, cy: 37, r: 25 } },
  geral: { box: "0 0 74 92", w: 74, h: 92, miolo: { cx: 37, cy: 37, r: 25 } },
  completo: { box: "0 8 110 132", w: 110, h: 132, miolo: { cx: 55, cy: 66, r: 28.5 } },
  perfeito: { box: "0 0 110 156", w: 110, h: 156, miolo: { cx: 55, cy: 56, r: 26.5 } },
};

/**
 * A medalha, decorativa (`aria-hidden`): o nome e o estado ficam no texto ao lado dela. A apagada
 * usa o filtro do CSS (`.medal-art.locked`), sem cor própria.
 */
export function MedalArt({ kind, image, letter, color, name, earned, size }: Props) {
  const clip = useId();
  // A capa que não carrega vira o monograma (como no cartão do artista, P171).
  const [failed, setFailed] = useState<string | null>(null);
  const shown = image && failed !== image ? image : null;
  const view = VIEW[kind];
  const cover = (
    <Cover
      clip={`medal-${clip}`}
      miolo={view.miolo}
      image={shown}
      letter={letter}
      onError={() => setFailed(image)}
      plain={kind === "geral"}
    />
  );
  return (
    <svg
      class={`medal-art monogram-${color}${earned ? "" : " locked"}`}
      viewBox={view.box}
      width={size}
      height={Math.round((size * view.h) / view.w)}
      aria-hidden="true"
      focusable="false"
    >
      {kind === "acertos" && <Rosette palette={SILVER} tails="var(--monogram)" />}
      {kind === "geral" && <Rosette palette={OLIVE} tails="#969865" />}
      {kind === "completo" && <IceFrame />}
      {kind === "perfeito" && <Bouquet name={name} letter={letter} />}
      {cover}
      <circle
        cx={view.miolo.cx}
        cy={view.miolo.cy}
        r={view.miolo.r}
        fill="none"
        stroke={kind === "perfeito" ? FLOWERS.ring : kind === "completo" ? ICE.edge : SILVER.edge}
        stroke-width="1"
      />
      {kind === "completo" && <IceSparks />}
      {kind === "perfeito" && (
        <>
          <Spark x={10} y={16} s={4.2} stroke={FLOWERS.spark} />
          <Spark x={100} y={20} s={3.8} stroke={FLOWERS.spark} />
          <Spark x={9} y={90} s={3} stroke={FLOWERS.spark} />
          <Spark x={101} y={88} s={3.4} stroke={FLOWERS.spark} />
        </>
      )}
    </svg>
  );
}
