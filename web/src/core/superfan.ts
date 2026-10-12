// Superfan (ME61): a partida difícil do modo por artista. As músicas do artista em ordem
// sorteada, cada uma uma vez, no Desafio com as regras do Superfan (VARIANT_RULES: 3 trechos de
// 1, 3 e 5 s; 3, 2 ou 1 ponto; −5 por palpite errado; a ajuda logo de cara, valendo −1). A
// partida acaba no 3º erro (P119), ao encerrar ou quando todas as músicas tocaram. Puro, como o
// Treino, sobre o mesmo saco (core/practice.ts): a semente vem da tela, e nada é salvo (P116).

import type { CatalogIndex } from "./catalog.ts";
import { barSeconds } from "./player.ts";
import {
  drawPractice,
  nextPracticeRound,
  type PracticeScore,
  type PracticeSession,
  practiceScore,
  startPracticeSession,
} from "./practice.ts";
import { seeded } from "./prng.ts";
import { currentRound, type GameEvent, type RoundState, reduce, roundErrors } from "./reducer.ts";
import { VARIANT_RULES } from "./rules.ts";

/** Erros na partida inteira que a encerram (P119). */
export const SUPERFAN_ERRORS = 3;
/** Ajudas por partida (P153). */
export const SUPERFAN_HELPS = 3;
/** Folga no fim da prévia, por causa do fade: o trecho inteiro (9 s) cabe antes dela. */
const END_MARGIN_SEC = 2;
/** A prévia da Apple tem 30 s; vale quando o catálogo não diz a duração. */
const PREVIEW_SEC = 30;

/** Por que a partida acabou: 3 erros, encerrada pela pessoa ou todas as músicas tocadas. */
export type SuperfanEnd = "errors" | "quit" | "done";

export type SuperfanRun = {
  /** O saco, o número da música, o placar das encerradas e a música em jogo. */
  readonly session: PracticeSession;
  /** Palpites errados das músicas encerradas (a em jogo conta à parte). */
  readonly errors: number;
  /** Ajudas pedidas nas músicas encerradas. */
  readonly helps: number;
  /** Músicas acertadas. */
  readonly right: number;
  readonly end: SuperfanEnd | null;
};

const wrongIn = roundErrors;
/** A ajuda da música. A anulada (falha de áudio) não conta, como os erros dela (P162). */
const helpIn = (round: RoundState) => (round.help && round.status !== "void" ? 1 : 0);

function playing(run: SuperfanRun): RoundState | null {
  const game = run.session.game;
  return game ? currentRound(game) : null;
}

/** Os erros da partida, com os da música em jogo. */
export function superfanErrors(run: SuperfanRun): number {
  const round = playing(run);
  return run.errors + (round ? wrongIn(round) : 0);
}

/** As ajudas da partida, com a da música em jogo. */
export function superfanHelps(run: SuperfanRun): number {
  const round = playing(run);
  return run.helps + (round ? helpIn(round) : 0);
}

/**
 * O placar da partida: o das músicas encerradas e, da música em jogo, os erros já cometidos
 * (−5 cada, contam na hora). As rodadas são as encerradas.
 */
export function superfanScore(run: SuperfanRun): PracticeScore {
  const score = practiceScore(run.session.score, run.session.game);
  const round = playing(run);
  const pending =
    round?.status === "playing" ? wrongIn(round) * VARIANT_RULES.superfan.wrongPoints : 0;
  return { ...score, points: score.points + pending };
}

/** A partida acaba no fim desta música (o 3º erro) ou já acabou. */
export function superfanOver(run: SuperfanRun): boolean {
  return run.end !== null || superfanErrors(run) >= SUPERFAN_ERRORS;
}

/** Começa a partida, já com a 1ª música sorteada. */
export function startSuperfan(
  seed: number,
  index: CatalogIndex,
  excluded: ReadonlySet<string>,
): SuperfanRun {
  const session = startPracticeSession(seed, "song", index, excluded, "superfan");
  return { session, errors: 0, helps: 0, right: 0, end: session.game ? null : "done" };
}

/**
 * Um evento na música em jogo. A ajuda além das 3 da partida não vale. O 3º erro encerra a música
 * na hora (a revelação mostra a resposta, e o botão leva ao resultado).
 */
export function superfanStep(run: SuperfanRun, event: GameEvent): SuperfanRun {
  const game = run.session.game;
  if (!game || run.end !== null) return run;
  if (event.type === "HELP" && superfanHelps(run) >= SUPERFAN_HELPS) return run;
  let next = reduce(game, event);
  if (next === game) return run;
  const stepped = { ...run, session: { ...run.session, game: next } };
  if (currentRound(next).status === "playing" && superfanErrors(stepped) >= SUPERFAN_ERRORS) {
    next = reduce(next, { type: "GIVE_UP" });
    return { ...run, session: { ...run.session, game: next } };
  }
  return stepped;
}

/** Fecha a música em jogo nos contadores e no placar, sem sortear outra. */
function close(run: SuperfanRun, end: SuperfanEnd): SuperfanRun {
  const round = playing(run);
  return {
    errors: superfanErrors(run),
    helps: superfanHelps(run),
    right: run.right + (round?.status === "won" ? 1 : 0),
    session: {
      ...run.session,
      score: practiceScore(run.session.score, run.session.game),
      game: null,
    },
    end,
  };
}

/**
 * Depois da revelação: com 3 erros, a partida acaba; senão sai a próxima música, e sem próxima
 * (todas tocaram nesta volta do saco) ela acaba também. Com a música ainda em jogo, nada muda.
 */
export function superfanNext(
  run: SuperfanRun,
  index: CatalogIndex,
  excluded: ReadonlySet<string>,
): SuperfanRun {
  const round = playing(run);
  if (run.end !== null || round?.status === "playing") return run;
  if (superfanErrors(run) >= SUPERFAN_ERRORS) return close(run, "errors");
  const draw = drawPractice(run.session.practice, index, excluded);
  if (!draw || draw.round.cycle > 0) return close(run, "done");
  return {
    ...run,
    errors: superfanErrors(run),
    helps: superfanHelps(run),
    right: run.right + (round?.status === "won" ? 1 : 0),
    session: nextPracticeRound(run.session, index, excluded),
  };
}

/**
 * Encerrar a partida: a música em jogo termina como desistida, e os erros dela contam. Com os 3
 * erros já cometidos (a revelação do último na tela), o fim é por erros, e não por encerrar.
 */
export function quitSuperfan(run: SuperfanRun): SuperfanRun {
  if (run.end !== null) return run;
  if (superfanErrors(run) >= SUPERFAN_ERRORS) return close(run, "errors");
  const game = run.session.game;
  const ended =
    game && currentRound(game).status === "playing" ? reduce(game, { type: "GIVE_UP" }) : game;
  return close({ ...run, session: { ...run.session, game: ended } }, "quit");
}

/**
 * Onde o trecho começa na prévia: um segundo sorteado entre 0 e o último que ainda deixa os 9 s
 * inteiros antes da folga do fim (até 19 s numa prévia de 30 s). O mesmo para a mesma música da
 * mesma partida (a semente é a da sessão e o puzzleId, a rodada).
 */
export function superfanOffset(seed: number, puzzleId: string, previewSec: number | null): number {
  const bar = barSeconds(VARIANT_RULES.superfan.stages);
  const last = Math.floor((previewSec ?? PREVIEW_SEC) - bar - END_MARGIN_SEC);
  return last <= 0 ? 0 : seeded(`superfan|${seed}|${puzzleId}`).randint(last + 1);
}
