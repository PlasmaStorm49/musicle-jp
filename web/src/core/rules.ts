// Regras do jogo (PLANO, Apêndice D). Dados, não código: o reducer consulta estas tabelas,
// e um modo novo entra aqui sem espalhar if pelo reducer.
import type { Target } from "./types.ts";

/**
 * Segundos do trecho liberados em cada etapa, nos dois modos de hoje (os diários e o Treino).
 * Cada modo tem a sua barra (`ModeRules.stages`): a do Superfan (ME61) é 1, 4 e 9 s.
 */
export const STAGES = [1, 2, 4, 7, 11, 16] as const;
export const MAX_STAGE = STAGES.length - 1;
export const ROUNDS_PER_DAY = 3;
/** As tentativas do Desafio: uma por etapa da barra (6), e não o máximo de pontos. */
export const MAX_ATTEMPTS = STAGES.length;
/**
 * A pontuação (ME107): toda rodada vale até 10, em todos os modos, e o acerto vale menos quanto
 * mais do trecho foi ouvido. Cada vez que o trecho dobra, ele perde cerca de 1,75 ponto: 10 −
 * 1,75 × log₂(segundos), no inteiro mais perto, com o meio ponto para baixo (`pointsAt`, que o
 * rules.test confere contra as tabelas). Na barra dos diários (1, 2, 4, 7, 11 e 16 s): 10, 8, 6, 5,
 * 4 e 3; na do Superfan (1, 4 e 9 s): 10, 6 e 4. Errar, desistir e o "Não sei" valem 0: o placar
 * nunca fica negativo.
 */
export const MAX_POINTS = 10;
/** Os pontos do acerto em cada etapa da barra dos diários. */
const STAGE_POINTS: readonly number[] = [10, 8, 6, 5, 4, 3];
/** O acerto com a ajuda: a metade do trecho em que se acerta, arredondada para cima. */
const HELP_STAGE_POINTS: readonly number[] = [5, 4, 3, 3, 2, 2];

/** O valor do acerto depois de `seconds` de trecho, pela regra (ME107). */
export function pointsAt(seconds: number): number {
  return Math.ceil(MAX_POINTS - 1.75 * Math.log2(seconds) - 0.5);
}

/** A metade de cada valor, arredondada para cima: os pontos do acerto com a ajuda. */
export function halfUp(points: readonly number[]): number[] {
  return points.map((p) => Math.ceil(p / 2));
}
/** Quantas opções a ajuda mostra, a certa entre elas (P149). */
export const HELP_OPTIONS = 4;

/** Largura de cada pedaço da barra: quanto cada etapa acrescenta (1, 1, 2, 3, 4, 5 nos de hoje). */
export function segmentWeights(stages: readonly number[]): number[] {
  return stages.map((seconds, i) => seconds - (i === 0 ? 0 : (stages[i - 1] ?? 0)));
}

export const SEGMENT_WEIGHTS: readonly number[] = segmentWeights(STAGES);

export type ModeRules = {
  /** Segundos acumulados do trecho em cada etapa: a barra do modo. */
  readonly stages: readonly number[];
  /** Quantos palpites ou pulos cabem numa rodada. */
  readonly maxAttempts: number;
  /** Palpite errado encerra a rodada ("end") ou libera a etapa seguinte ("advance"). */
  readonly wrongGuess: "end" | "advance";
  /** O jogador pode pedir mais trecho sem palpitar (o acerto passa a valer o do trecho maior). */
  readonly listenMore: boolean;
  /** O jogador pode pular (gasta uma tentativa e libera a etapa seguinte). */
  readonly skip: boolean;
  /** O palpite tem de ser uma das opções da rodada (4 opções); senão, vale qualquer da busca. */
  readonly guessFromOptions: boolean;
  /** A ajuda (P149 a P152): trocar a digitação por opções de música. */
  readonly help: boolean;
  /**
   * Tentativas gastas, erradas ou puladas (P150), antes da ajuda, no reducer e na tela: 1 no
   * Desafio, também nos diários (ME107; antes, 3); 0 no Superfan, logo de cara (P159).
   */
  readonly helpFrom: number;
  /** Pontos do acerto em cada etapa (`pointsAt`). */
  readonly points: readonly number[];
  /** Pontos do acerto com a ajuda em cada etapa: a metade dos `points`, para cima (`halfUp`). */
  readonly helpPoints: readonly number[];
  /**
   * Errar e desistir custam uma vida da partida (o Superfan, P290): a tela o diz. Os pontos não
   * mudam: valem 0 em todo modo.
   */
  readonly lives: boolean;
};

/** Os modos na ordem dos Hits (a tela e o cartão da Início) e do Treino: o Normal primeiro. */
export const MODES: readonly Target[] = ["album", "song"];

/** Os dois modos (P100): o Normal (álbum) em 4 opções e o Desafio (música) digitado. */
export const MODE_RULES: Readonly<Record<Target, ModeRules>> = {
  album: {
    stages: STAGES,
    maxAttempts: 1,
    wrongGuess: "end",
    listenMore: true,
    skip: false,
    guessFromOptions: true,
    help: false,
    helpFrom: 0,
    points: STAGE_POINTS,
    helpPoints: HELP_STAGE_POINTS,
    lives: false,
  },
  song: {
    stages: STAGES,
    maxAttempts: MAX_ATTEMPTS,
    wrongGuess: "advance",
    listenMore: false,
    skip: true,
    guessFromOptions: false,
    help: true,
    helpFrom: 1,
    points: STAGE_POINTS,
    helpPoints: HELP_STAGE_POINTS,
    lives: false,
  },
};

/**
 * As variantes de um modo, com regras próprias e o mesmo `Target` (P125): o Superfan (ME61) é o
 * Desafio do modo por artista com 3 trechos (1, 4 e 9 s) e a pontuação de todos (ME107): 10, 6 ou
 * 4 pelo acerto, a metade com a ajuda, que vem logo de cara (P159). O palpite errado passa para a
 * etapa seguinte (P158), e ele e o desistir (P290) custam uma das 3 vidas da partida, e não
 * pontos. Acertar sozinho vale mais que com a ajuda, que vale mais que errar ou desistir. As vidas,
 * o bônus das que sobram e o limite de ajudas ficam em superfan.ts.
 */
export type Variant = "superfan";

export const VARIANT_RULES: Readonly<Record<Variant, ModeRules>> = {
  superfan: {
    stages: [1, 4, 9],
    maxAttempts: 3,
    wrongGuess: "advance",
    listenMore: false,
    skip: true,
    guessFromOptions: false,
    help: true,
    helpFrom: 0,
    points: [10, 6, 4],
    helpPoints: [5, 3, 2],
    lives: true,
  },
};

/**
 * A pontuação dos diários (os dois dos Hits e os 6 do Anime), a que o resumo salvo usa: o save não
 * guarda as regras, e os dois modos pontuam igual (o rules.test confere). A do Desafio, que tem a
 * ajuda.
 */
export const DAILY_SCORING: ModeRules = MODE_RULES.song;

/** O bastante para pontuar uma rodada: a do jogo (RoundState) ou a do resumo salvo (RoundRecord). */
export type ScorableRound = {
  readonly status: string;
  readonly stage: number;
  /** A ajuda: as opções, no jogo, ou a tentativa em que foi pedida, no resumo. Sem ela, nada. */
  readonly help?: unknown;
};

/**
 * Os pontos de uma rodada, pelas regras: o acerto vale os pontos da etapa, ou os da ajuda na
 * etapa; o resto, 0 (ME107). A conta única do jogo (`roundScore`) e do resumo salvo.
 */
export function scoreOf(round: ScorableRound, rules: ModeRules): number {
  if (round.status !== "won") return 0;
  const stage = Math.min(Math.max(round.stage, 0), rules.points.length - 1);
  const table = round.help !== undefined && round.help !== null ? rules.helpPoints : rules.points;
  return table[stage] ?? 0;
}

/** As regras de um jogo: as da variante, se houver, ou as do modo. */
export function rulesOf(game: { readonly target: Target; readonly variant?: Variant }): ModeRules {
  return game.variant ? VARIANT_RULES[game.variant] : MODE_RULES[game.target];
}

/**
 * O botão "Pular" aparece? Só no modo que pula e enquanto sobra tentativa depois do pulo: na
 * última, pular daria o mesmo que desistir (o reducer cobra como desistir, P186) e "+0 s" de
 * trecho.
 */
export function canSkip(rules: ModeRules, attemptsUsed: number): boolean {
  return rules.skip && attemptsUsed + 1 < rules.maxAttempts;
}

/** A última etapa da barra do modo. */
export function lastStage(rules: ModeRules): number {
  return rules.stages.length - 1;
}

/** Segundos que o jogador pode ouvir na etapa `stage` (da barra dos diários, se não disser outra). */
export function secondsAt(stage: number, stages: readonly number[] = STAGES): number {
  return stages[Math.min(Math.max(stage, 0), stages.length - 1)] ?? stages[0] ?? 0;
}
