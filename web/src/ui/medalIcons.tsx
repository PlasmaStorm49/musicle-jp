// Os ícones das medalhas gerais (M16, P312): um por medalha, pelo id, no miolo da roseta. Desenhados
// em volta de (0, 0), com raio de uns 17, para o miolo de raio 25 (o `MedalArt` os escala para o
// da moldura grande). Duas cores, as do `MedalArt`: a tinta e o fundo do miolo, que recorta os
// detalhes. Decorativos, como a medalha: o nome fica no texto ao lado.
import type { JSX } from "preact";

export type IconColors = { readonly ink: string; readonly bg: string };
type Icon = (c: IconColors) => JSX.Element;

const HEART =
  "M0 14 C-15 4 -17 -6 -11 -11.5 C-6.5 -15 -2 -12.5 0 -8.5 C2 -12.5 6.5 -15 11 -11.5 C17 -6 15 4 0 14 Z";
const FLAME_OUT =
  "M0 -16 C3 -10 12 -5 12 4 C12 11 6.5 15 0 15 C-6.5 15 -12 11 -12 4 C-12 -2 -8.5 -5 -6.5 -10 C-5.5 -5.5 -3.5 -3.5 -1.5 -2.5 C-2 -8 -2.5 -12 0 -16 Z";
const FLAME_IN =
  "M1 1 C3 5 6.5 7 6.5 10.5 C6.5 13.2 4 14.3 0.5 14.3 C-3.5 14.3 -6 12.8 -6 10 C-6 7.5 -3.5 6 -2.5 3.5 C-1.5 5 -0.5 5 1 1 Z";

/** Um brilho de 4 pontas, cheio. */
function sparkPath(x: number, y: number, s: number): string {
  const q = s * 0.18;
  return `M${x} ${y - s} Q${x + q} ${y - q} ${x + s} ${y} Q${x + q} ${y + q} ${x} ${y + s} Q${x - q} ${y + q} ${x - s} ${y} Q${x - q} ${y - q} ${x} ${y - s} Z`;
}

/** A chama: a de fora na tinta, e a de dentro recortada no fundo. */
function Flame({ ink, bg, rim }: IconColors & { readonly rim?: boolean }) {
  return (
    <>
      <path d={FLAME_OUT} fill={ink} {...(rim ? { stroke: bg, "stroke-width": 1.4 } : {})} />
      <path d={FLAME_IN} fill={bg} />
    </>
  );
}

/** O traço de um caminho: sem preenchimento, com as pontas e os cantos redondos. */
function line(color: string, width: number) {
  return {
    stroke: color,
    "stroke-width": width,
    fill: "none",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  } as const;
}

/** Os louros: 5 folhas de cada lado, num arco de raio 13, viradas pela tangente. */
function Laurel({ ink }: { readonly ink: string }) {
  const leaves = [110, 140, 170, 200, 230].flatMap((deg) => [deg, 180 - deg]);
  return (
    <>
      {leaves.map((deg) => {
        const angle = (deg * Math.PI) / 180;
        const x = (13 * Math.cos(angle)).toFixed(1);
        const y = (13 * Math.sin(angle)).toFixed(1);
        return (
          <ellipse
            key={deg}
            cx={x}
            cy={y}
            rx="4.4"
            ry="2"
            transform={`rotate(${deg + 90} ${x} ${y})`}
            fill={ink}
          />
        );
      })}
    </>
  );
}

const ICONS: Readonly<Record<string, Icon>> = {
  // Primeiro Acorde: a colcheia, com um brilho.
  "diario-1": ({ ink }) => (
    <>
      <ellipse cx="-3" cy="9" rx="5.6" ry="4" transform="rotate(-22 -3 9)" fill={ink} />
      <rect x="1.4" y="-14" width="2.6" height="23" fill={ink} />
      <path d="M4 -14 C5.3 -8 13.5 -7 11 3 C10.5 -2 6.8 -4.5 4 -5.5 Z" fill={ink} />
      <path d={sparkPath(-10, -8, 4.2)} fill={ink} />
    </>
  ),
  // Relâmpago: o raio.
  "um-segundo": ({ ink }) => (
    <path d="M4 -17 L-10 2 L-1.5 2 L-5 17 L10.5 -3.5 L1.5 -3.5 Z" fill={ink} />
  ),
  // Dia de Hit: o calendário com o ✓.
  "hits-todos": ({ ink, bg }) => (
    <>
      <rect x="-13" y="-10" width="26" height="23" rx="3" fill={ink} />
      <rect x="-10.5" y="-3.5" width="21" height="14" rx="1.2" fill={bg} />
      <rect
        x="-8"
        y="-14.5"
        width="3.2"
        height="7.5"
        rx="1.6"
        fill={ink}
        stroke={bg}
        stroke-width="1.1"
      />
      <rect
        x="4.8"
        y="-14.5"
        width="3.2"
        height="7.5"
        rx="1.6"
        fill={ink}
        stroke={bg}
        stroke-width="1.1"
      />
      <path
        d="M-5.5 3.5 L-1.5 7.5 L6 -0.5"
        fill="none"
        stroke={ink}
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </>
  ),
  // Pare de falar em tocar grama...: a grama.
  "anime-todos": ({ ink }) => (
    <>
      <path
        d="M-13 12 Q-15 3 -17 -3 Q-10 3 -9 12 Z M-8 12 Q-9 0 -7 -10 Q-3 0 -3 12 Z M-3 12 Q-1 -4 1 -15 Q4 -3 3 12 Z M3 12 Q6 0 10 -8 Q9 2 8 12 Z M8 12 Q12 4 16 -2 Q14 6 13 12 Z"
        fill={ink}
      />
      <rect x="-17" y="11" width="34" height="3.2" rx="1.6" fill={ink} />
    </>
  ),
  // Tudo Junto e Misturado (ME123): as duas setas que se cruzam, do embaralhar.
  "misturadas-rodada": ({ ink }) => (
    <>
      <path
        d="M-15 -8 H-7 C-1 -8 1 8 7 8 H10"
        fill="none"
        stroke={ink}
        stroke-width="3.4"
        stroke-linecap="round"
      />
      <path
        d="M-15 8 H-7 C-1 8 1 -8 7 -8 H10"
        fill="none"
        stroke={ink}
        stroke-width="3.4"
        stroke-linecap="round"
      />
      <path d="M9 -13.5 L16 -8 L9 -2.5 Z" fill={ink} />
      <path d="M9 2.5 L16 8 L9 13.5 Z" fill={ink} />
    </>
  ),
  // Em Chamas: a chama.
  "seguidos-7": (c) => <Flame {...c} />,
  // Maratonista: o tênis, correndo.
  "oito-diarios": ({ ink, bg }) => (
    <>
      <path
        d="M-18 -12 H-11 M-20 -7.5 H-13"
        stroke={ink}
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <path
        d="M-15 5 C-15 0 -12.5 -2.5 -9 -3.5 L-6.5 -10.5 C-5 -12 -2 -12 -0.5 -10 C1.5 -6.5 5.5 -4 10.5 -2.5 C14.5 -1.2 16 1.5 16 5 Z"
        fill={ink}
      />
      <rect x="-16" y="6.5" width="32" height="5" rx="2.5" fill={ink} />
      <path
        d="M-3.5 -7 L-0.5 -8.5 M-1.5 -4.5 L1.5 -6 M0.5 -2 L3.5 -3.5"
        stroke={bg}
        stroke-width="1.3"
        stroke-linecap="round"
      />
    </>
  ),
  // Saco de Pancadas: o saco, pendurado, com o impacto.
  "treino-100": ({ ink, bg }) => (
    <>
      <path d="M0 -18 V-12" stroke={ink} stroke-width="1.8" />
      <circle cy="-18.5" r="1.7" fill="none" stroke={ink} stroke-width="1.3" />
      <g transform="rotate(-7 0 -12)">
        <rect x="-7.5" y="-12" width="15" height="27" rx="6.5" fill={ink} />
        <rect x="-7.5" y="-6" width="15" height="2.2" fill={bg} />
        <rect x="-7.5" y="8" width="15" height="2.2" fill={bg} />
      </g>
      <path
        d="M11 -5 L16 -7.5 M12 0.5 L17.5 0.5 M11 6 L16 8.5"
        stroke={ink}
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </>
  ),
  // Já É de Casa: a casa, com a porta e um coração na janela.
  "diarios-50": ({ ink, bg }) => (
    <>
      <rect x="7" y="-13" width="3.6" height="8" fill={ink} />
      <path d="M0 -15 L16 -1 L12.5 -1 L12.5 13 L-12.5 13 L-12.5 -1 L-16 -1 Z" fill={ink} />
      <rect x="-3.2" y="3" width="6.4" height="10" rx="1.2" fill={bg} />
      <path d={HEART} transform="translate(0 -4.5) scale(0.27)" fill={bg} />
    </>
  ),
  // Colecionador: os discos.
  colecionador: ({ ink, bg }) => (
    <>
      <circle cx="5" cy="-4" r="10.5" fill={ink} stroke={bg} stroke-width="1.2" />
      <circle cx="5" cy="-4" r="3.4" fill={bg} />
      <circle cx="-3" cy="4" r="11.5" fill={ink} stroke={bg} stroke-width="1.4" />
      <circle cx="-3" cy="4" r="8" fill="none" stroke={bg} stroke-width="0.6" opacity="0.55" />
      <circle cx="-3" cy="4" r="4" fill={bg} />
      <circle cx="-3" cy="4" r="1.1" fill={ink} />
    </>
  ),
  // Hit Perfeito: o alvo, com a flecha no meio.
  "hits-perfeito": ({ ink, bg }) => (
    <>
      <circle r="15" fill={ink} />
      <circle r="11.2" fill={bg} />
      <circle r="7.4" fill={ink} />
      <circle r="3.6" fill={bg} />
      <path d="M1.5 -1.5 L15 -15" stroke={bg} stroke-width="4.2" stroke-linecap="round" />
      <path d="M1.5 -1.5 L15 -15" stroke={ink} stroke-width="1.8" stroke-linecap="round" />
      <polygon points="0,0 6,-1.6 1.6,-6" fill={ink} stroke={bg} stroke-width="0.9" />
      <path
        d="M15 -15 L11 -15.6 M15 -15 L15.6 -11 M12.6 -12.6 L8.8 -13.2 M12.6 -12.6 L13.2 -8.8"
        stroke={ink}
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </>
  ),
  // Sensei: o torii.
  "anime-perfeito": ({ ink }) => (
    <>
      <path d="M-17 -12 Q0 -7.5 17 -12 L16 -7.5 Q0 -4 -16 -7.5 Z" fill={ink} />
      <rect x="-14" y="-6.5" width="28" height="2.6" fill={ink} />
      <rect x="-13" y="-0.5" width="26" height="2.8" fill={ink} />
      <rect x="-10" y="-6" width="3.4" height="20" fill={ink} />
      <rect x="6.6" y="-6" width="3.4" height="20" fill={ink} />
      <rect x="-1.3" y="-4.5" width="2.6" height="4" fill={ink} />
      <rect x="-11" y="12.5" width="5.4" height="2.6" rx="0.8" fill={ink} />
      <rect x="5.6" y="12.5" width="5.4" height="2.6" rx="0.8" fill={ink} />
    </>
  ),
  // DJ Residente (ME123): o fone, com as duas conchas (a esquerda e a direita do Separar).
  "misturadas-seguidos-15": ({ ink, bg }) => (
    <>
      <path
        d="M-12 4 V-1 C-12 -9 -6.5 -14 0 -14 C6.5 -14 12 -9 12 -1 V4"
        fill="none"
        stroke={ink}
        stroke-width="3"
        stroke-linecap="round"
      />
      <rect x="-16" y="0" width="9" height="14" rx="3.5" fill={ink} />
      <rect x="7" y="0" width="9" height="14" rx="3.5" fill={ink} />
      <rect x="-13.5" y="3" width="2.4" height="8" rx="1.2" fill={bg} />
      <rect x="11.1" y="3" width="2.4" height="8" rx="1.2" fill={bg} />
    </>
  ),
  // Pode juntar mais uma (ME123): três colcheias juntas, numa barra só, e o + de mais uma.
  "misturadas-perfeito": ({ ink }) => (
    <>
      <ellipse cx="-12" cy="9" rx="4.4" ry="3.2" transform="rotate(-22 -12 9)" fill={ink} />
      <ellipse cx="-2" cy="7" rx="4.4" ry="3.2" transform="rotate(-22 -2 7)" fill={ink} />
      <ellipse cx="8" cy="5" rx="4.4" ry="3.2" transform="rotate(-22 8 5)" fill={ink} />
      <rect x="-9.2" y="-9" width="2.2" height="18" fill={ink} />
      <rect x="0.8" y="-11" width="2.2" height="18" fill={ink} />
      <rect x="10.8" y="-13" width="2.2" height="18" fill={ink} />
      <path d="M-9.2 -9 L13 -13 L13 -9.4 L-9.2 -5.4 Z" fill={ink} />
      <rect x="-16.5" y="-16" width="8" height="2.2" rx="1.1" fill={ink} />
      <rect x="-13.6" y="-18.9" width="2.2" height="8" rx="1.1" fill={ink} />
    </>
  ),
  // Harmonia no Caos (ME123): o yin-yang, a calma no meio da mistura.
  "misturadas-acertos-7": ({ ink, bg }) => (
    <>
      <circle cx="0" cy="0" r="15" fill={ink} />
      <path d="M0 -13 A13 13 0 0 1 0 13 A6.5 6.5 0 0 1 0 0 A6.5 6.5 0 0 0 0 -13 Z" fill={bg} />
      <circle cx="0" cy="-6.5" r="2.2" fill={bg} />
      <circle cx="0" cy="6.5" r="2.2" fill={ink} />
    </>
  ),
  // Superfan: o coração com a nota.
  "superfan-completo": ({ ink, bg }) => (
    <>
      <path d={HEART} fill={ink} />
      <ellipse cx="-3" cy="4" rx="3.4" ry="2.6" transform="rotate(-20 -3 4)" fill={bg} />
      <rect x="-0.1" y="-8" width="1.8" height="12" fill={bg} />
      <path d="M1.7 -8 C3 -5 7 -4.5 6 0 C5 -2.5 3.5 -3.5 1.7 -4 Z" fill={bg} />
    </>
  ),
  // Tá pegando fogo, bicho!!!: a fogueira, com as fagulhas.
  "seguidos-30": (c) => (
    <>
      <g transform="translate(-10 6) scale(0.52)">
        <Flame {...c} />
      </g>
      <g transform="translate(10 6) scale(-0.52 0.52)">
        <Flame {...c} />
      </g>
      <g transform="translate(0 1) scale(0.88)">
        <Flame {...c} rim />
      </g>
      <circle cx="-14" cy="-9" r="1.6" fill={c.ink} />
      <circle cx="13.5" cy="-12" r="1.4" fill={c.ink} />
      <circle cx="-8" cy="-16" r="1.1" fill={c.ink} />
      <circle cx="16.5" cy="-4" r="1" fill={c.ink} />
    </>
  ),
  // A Hora Extra e as do quiz (o usuário, 28/10/2026, nos quadros da conversa).
  // Hora Extra: o relógio com um +.
  "onze-diarios": ({ ink, bg }) => (
    <>
      <circle cx="-2" cy="2" r="13.5" fill={ink} />
      <circle cx="-2" cy="2" r="10.3" fill={bg} />
      <path d="M-2 2 V-5.5 M-2 2 L3.5 5.5" {...line(ink, 2.4)} />
      <circle cx="10.5" cy="-10" r="6.4" fill={ink} stroke={bg} stroke-width="1.6" />
      <path d="M10.5 -13.5 V-6.5 M7 -10 H14" {...line(bg, 2)} />
    </>
  ),
  // Insert Coin: a ficha caindo na fenda.
  "quiz-1": ({ ink, bg }) => (
    <>
      <rect x="-10" y="-16" width="20" height="4" rx="2" fill={ink} />
      <circle cx="0" cy="4" r="11.5" fill={ink} />
      <circle cx="0" cy="4" r="7.6" fill="none" stroke={bg} stroke-width="1.6" />
      <rect x="-1.4" y="-0.5" width="2.8" height="9" rx="1.4" fill={bg} />
    </>
  ),
  // Saindo do Tutorial: o selo de novato dos carros do Japão (wakaba), metade cheia.
  "quiz-rodada-10": ({ ink, bg }) => (
    <>
      <path d="M0 -7 L-13 -15 L-13 3 L0 16 Z" fill={ink} />
      <path
        d="M0 -7 L13 -15 L13 3 L0 16 Z"
        fill={bg}
        stroke={ink}
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </>
  ),
  // Plus Ultra: três setas para cima.
  "quiz-rodada-25": ({ ink }) => (
    <path d="M-11 -3 L0 -14 L11 -3 M-11 5 L0 -6 L11 5 M-11 13 L0 2 L11 13" {...line(ink, 3.4)} />
  ),
  // Edição Especial: o ingresso com a estrela.
  "quiz-especial-15": ({ ink, bg }) => (
    <>
      <path d="M-16 -10 H16 V-3 A3 3 0 0 0 16 3 V10 H-16 V3 A3 3 0 0 0 -16 -3 Z" fill={ink} />
      <polygon
        points="0.0,-6.4 1.8,-1.8 6.7,-1.6 2.9,1.5 4.1,6.3 0.0,3.6 -4.1,6.3 -2.9,1.5 -6.7,-1.6 -1.8,-1.8"
        fill={bg}
      />
    </>
  ),
  // Sem um Arranhão: o escudo com um brilho.
  "quiz-sem-erro-15": ({ ink, bg }) => (
    <>
      <path d="M0 -16 L13 -11 V0 C13 8 7 13 0 16 C-7 13 -13 8 -13 0 V-11 Z" fill={ink} />
      <path d={sparkPath(0, 0, 7.5)} fill={bg} />
    </>
  ),
  // Só acaba quando acabar...: o coração com o curativo.
  "quiz-ultima-vida": ({ ink, bg }) => (
    <>
      <path d={HEART} fill={ink} />
      <g transform="rotate(-35 0 -1)">
        <rect x="-10" y="-4.3" width="20" height="6.6" rx="3.3" fill={bg} />
        <rect x="-3.2" y="-4.3" width="6.4" height="6.6" fill={ink} opacity="0.35" />
      </g>
    </>
  ),
  // Ouvido Afiado: o sustenido (o "sharp", afiado).
  "quiz-pontos-50": ({ ink }) => (
    <>
      <path d="M-4.5 -16 V15 M5 -16 V15" {...line(ink, 2.8)} />
      <path d="M-13 -3 L13 -9 L13 -3.5 L-13 2.5 Z" fill={ink} />
      <path d="M-13 7.5 L13 1.5 L13 7 L-13 13 Z" fill={ink} />
    </>
  ),
  // Três Segundos de Fama: o cronômetro com a fatia dos primeiros segundos.
  "quiz-tres-segundos": ({ ink, bg }) => (
    <>
      <rect x="-2.6" y="-16" width="5.2" height="4.5" rx="1.2" fill={ink} />
      <circle cx="0" cy="3" r="12.5" fill={ink} />
      <circle cx="0" cy="3" r="9.2" fill={bg} />
      <path d="M0 3 L0 -6.2 A9.2 9.2 0 0 1 8 -1.6 Z" fill={ink} />
    </>
  ),
  // Freguês: o cartão fidelidade, com os furos.
  "quiz-seguidos-15": ({ ink, bg }) => (
    <>
      <rect x="-16" y="-11" width="32" height="22" rx="3" fill={ink} />
      <rect x="-12" y="-7" width="13" height="2.6" rx="1.3" fill={bg} />
      {[-10, -5, 0, 5].map((x) => (
        <circle key={x} cx={x} cy="4" r="2.3" fill={bg} />
      ))}
      <circle cx="10" cy="4" r="2" fill="none" stroke={bg} stroke-width="1.2" />
    </>
  ),
  // Enciclopédia de Anisong: o livro com a nota na capa.
  "quiz-acertos-300": ({ ink, bg }) => (
    <>
      <rect x="-12" y="-15" width="25" height="28" rx="2" fill={ink} />
      <rect x="-9" y="12" width="22" height="3.4" rx="1" fill={ink} />
      <rect x="-9" y="11" width="21" height="2" fill={bg} />
      <ellipse cx="-0.5" cy="3" rx="4" ry="3" transform="rotate(-22 -0.5 3)" fill={bg} />
      <rect x="2.4" y="-9" width="2.2" height="12" fill={bg} />
      <path d="M4.6 -9 C5.8 -6 9.6 -5.5 8.6 -1 C8.2 -3.6 6.4 -4.4 4.6 -4.8 Z" fill={bg} />
    </>
  ),
  // Sabe-Tudo: o capelo.
  "quiz-perguntas-6": ({ ink }) => (
    <>
      <path d="M0 -12 L17 -4 L0 4 L-17 -4 Z" fill={ink} />
      <path d="M-10 0 V8 Q0 13.5 10 8 V0 L0 5 Z" fill={ink} />
      <path d="M13 -2 V9" {...line(ink, 1.8)} />
      <circle cx="13" cy="10.5" r="2.3" fill={ink} />
    </>
  ),
  // A Resposta: o 42, em traços.
  "quiz-42": ({ ink }) => (
    <path d="M-13 -12 V1 H-3 M-5.5 -12 V12 M3 -12 H13 V0 H3 V12 H13" {...line(ink, 3.4)} />
  ),
  // Magnum Opus: os louros, com a colcheia no meio.
  "quiz-rodada-50": ({ ink }) => (
    <>
      <Laurel ink={ink} />
      <path d="M-4 15 Q0 12 4 15" {...line(ink, 2)} />
      <ellipse cx="-2" cy="4" rx="3.6" ry="2.7" transform="rotate(-22 -2 4)" fill={ink} />
      <rect x="0.8" y="-8" width="2" height="12" fill={ink} />
      <path d="M2.8 -8 C4 -5 8 -4.5 7 0 C6.5 -2.5 4.6 -3.4 2.8 -3.8 Z" fill={ink} />
    </>
  ),
  // Kami: a shimenawa, a corda sagrada dos santuários, com os papéis em zigue-zague. O torii já é
  // o da Sensei (o usuário, 28/10/2026).
  "quiz-sem-erro-30": ({ ink, bg }) => (
    <>
      <path d="M-16 -9 Q0 -1 16 -9" {...line(ink, 6)} />
      <path
        d="M-12.5 -5.3 L-9.5 -8.5 M-6.5 -3.8 L-3.5 -7 M-0.5 -3.4 L2.5 -6.6 M5.5 -4.2 L8.5 -7.4 M11.5 -6 L14.5 -9.2"
        {...line(bg, 1.2)}
      />
      {[-9, -1, 7].map((x) => (
        <path
          key={x}
          d={`M${x - 1.5} -2 H${x + 1.5} V2 H${x + 3.5} V6 H${x + 1.5} V10 H${x - 1.5} V6 H${x + 0.5} V2 H${x - 1.5} Z`}
          fill={ink}
        />
      ))}
      <path d="M-13 -5 V3 M13 -5 V3" {...line(ink, 1.6)} />
    </>
  ),
  // Ouvido Absoluto: o diapasão, com o som dos dois lados.
  "quiz-pontos-120": ({ ink }) => (
    <>
      <path d="M-6 -16 V-3 A6 6 0 0 0 6 -3 V-16" {...line(ink, 3.4)} />
      <rect x="-1.7" y="3" width="3.4" height="13" rx="1.7" fill={ink} />
      <path d="M-11 -12 Q-14.5 -7 -11 -2 M11 -12 Q14.5 -7 11 -2" {...line(ink, 2)} />
    </>
  ),
  // Ritmo Constante: o metrônomo.
  "quiz-rodada-15-seguidos-7": ({ ink, bg }) => (
    <>
      <path d="M-6 -15 H6 L13 13 H-13 Z" fill={ink} />
      <path d="M-3.5 -11 H3.5 L8.5 8 H-8.5 Z" fill={bg} />
      <path d="M0 8 L6 -11" {...line(ink, 2.4)} />
      <rect
        x="1.5"
        y="-4.5"
        width="4.8"
        height="3.4"
        rx="1"
        fill={ink}
        transform="rotate(18 3.9 -2.8)"
      />
      <rect x="-15" y="12" width="30" height="3.6" rx="1.2" fill={ink} />
    </>
  ),
};

/** O ícone da medalha, ou null sem um desenhado (as de exemplo, que ficam com a ★). */
export function medalIcon(id: string, colors: IconColors): JSX.Element | null {
  return ICONS[id]?.(colors) ?? null;
}

/** Os ids com ícone: o teste confere que toda geral tem o seu. */
export const ICON_IDS: readonly string[] = Object.keys(ICONS);
