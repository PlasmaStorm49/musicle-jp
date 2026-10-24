// Superfan (ME61): a partida difícil do modo por artista. As músicas do artista em ordem
// sorteada, cada uma uma vez, no Desafio com as regras do Superfan (VARIANT_RULES: 3 trechos de
// 1, 4 e 9 s; 10, 6 ou 4 pontos, a metade com a ajuda, que vem logo de cara). A partida tem 3
// vidas (ME107): o palpite errado e o desistir (P290) custam uma, e não pontos. Ela acaba ao
// perder a 3ª, ao encerrar ou quando todas as músicas tocaram; na partida completa, cada vida que
// sobrou vale um bônus. Quando é a partida que encerra a música (a última vida, encerrar), o
// desistir vai com `forced` e não conta: não foi a pessoa que desistiu. Puro, como o Treino, sobre
// o mesmo saco (core/practice.ts): a semente vem da tela. A partida não é salva (P116); só o fim
// dela vai para o save (`superfanOutcome`, P289), pelas medalhas.

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
import type { SuperfanOutcome } from "./records.ts";
import { currentRound, type GameEvent, type RoundState, reduce, roundErrors } from "./reducer.ts";
import { VARIANT_RULES } from "./rules.ts";

/** As vidas da partida (ME107): cada erro e cada desistir custam uma, e sem nenhuma ela acaba. */
export const SUPERFAN_LIVES = 3;
/** O bônus de cada vida que sobra na partida completa (P18 da conversa da ME107): meia música. */
export const LIFE_BONUS = 5;
/** Ajudas por partida (P153). */
export const SUPERFAN_HELPS = 3;
/** Folga no fim da prévia, por causa do fade: o trecho inteiro (9 s) cabe antes dela. */
const END_MARGIN_SEC = 2;
/** A prévia da Apple tem 30 s; vale quando o catálogo não diz a duração. */
const PREVIEW_SEC = 30;

/** Por que a partida acabou: as vidas acabaram, a pessoa encerrou ou todas as músicas tocaram. */
export type SuperfanEnd = "errors" | "quit" | "done";

export type SuperfanRun = {
  /** O saco, o número da música, o placar das encerradas e a música em jogo. */
  readonly session: PracticeSession;
  /**
   * Erros das músicas encerradas: os palpites errados e, desde a P290, o desistir da pessoa (a
   * música em jogo conta à parte).
   */
  readonly errors: number;
  /** Ajudas pedidas nas músicas encerradas. */
  readonly helps: number;
  /** Músicas acertadas. */
  readonly right: number;
  readonly end: SuperfanEnd | null;
};

/**
 * Os erros de uma música: os palpites errados e, se a pessoa desistiu, mais um (P290). O desistir
 * forçado pela partida (`gaveUp` falso) não conta. A anulada não tem erro (P162).
 */
const wrongIn = (round: RoundState) => roundErrors(round) + (round.gaveUp ? 1 : 0);
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

/** As vidas que sobram: as 3 menos os erros da partida, nunca abaixo de 0. */
export function superfanLives(run: SuperfanRun): number {
  return Math.max(0, SUPERFAN_LIVES - superfanErrors(run));
}

/** As ajudas da partida, com a da música em jogo. */
export function superfanHelps(run: SuperfanRun): number {
  const round = playing(run);
  return run.helps + (round ? helpIn(round) : 0);
}

/** O placar das músicas: o das encerradas e o da que acabou de encerrar. Nunca negativo. */
export function superfanScore(run: SuperfanRun): PracticeScore {
  return practiceScore(run.session.score, run.session.game);
}

/**
 * O bônus das vidas: só na partida completa (todas as músicas tocaram), `LIFE_BONUS` por vida que
 * sobrou. A que acabou nas vidas não tem nenhuma; a encerrada pela pessoa não ganha. A partida sem
 * nenhuma música jogada (todas fora do sorteio, P141, ou anuladas) termina "completa", mas não
 * ganha nada: não houve o que jogar, como no `superfanOutcome`.
 */
export function superfanBonus(run: SuperfanRun): number {
  const played = superfanScore(run).rounds > 0;
  return run.end === "done" && played ? superfanLives(run) * LIFE_BONUS : 0;
}

/** O placar final: o das músicas mais o bônus das vidas. */
export function superfanTotal(run: SuperfanRun): number {
  return superfanScore(run).points + superfanBonus(run);
}

/** A partida acaba no fim desta música (a última vida) ou já acabou. */
export function superfanOver(run: SuperfanRun): boolean {
  return run.end !== null || superfanLives(run) === 0;
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
 * Um evento na música em jogo. A ajuda além das 3 da partida não vale. A última vida encerra a
 * música na hora (a revelação mostra a resposta, e o botão leva ao resultado).
 */
export function superfanStep(run: SuperfanRun, event: GameEvent): SuperfanRun {
  const game = run.session.game;
  if (!game || run.end !== null) return run;
  if (event.type === "HELP" && superfanHelps(run) >= SUPERFAN_HELPS) return run;
  let next = reduce(game, event);
  if (next === game) return run;
  const stepped = { ...run, session: { ...run.session, game: next } };
  if (currentRound(next).status === "playing" && superfanLives(stepped) === 0) {
    next = reduce(next, { type: "GIVE_UP", forced: true });
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
 * Depois da revelação: sem vidas, a partida acaba; senão sai a próxima música, e sem próxima
 * (todas tocaram nesta volta do saco) ela acaba também. Com a música ainda em jogo, nada muda.
 */
export function superfanNext(
  run: SuperfanRun,
  index: CatalogIndex,
  excluded: ReadonlySet<string>,
): SuperfanRun {
  const round = playing(run);
  if (run.end !== null || round?.status === "playing") return run;
  if (superfanLives(run) === 0) return close(run, "errors");
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
 * Encerrar a partida: a música em jogo termina como desistida, e os erros dela contam (o desistir
 * não: quem encerra é a partida). Sem vidas (a revelação do último erro na tela), o fim é pelas
 * vidas, e não por encerrar.
 */
export function quitSuperfan(run: SuperfanRun): SuperfanRun {
  if (run.end !== null) return run;
  if (superfanLives(run) === 0) return close(run, "errors");
  const game = run.session.game;
  const ended =
    game && currentRound(game).status === "playing"
      ? reduce(game, { type: "GIVE_UP", forced: true })
      : game;
  return close({ ...run, session: { ...run.session, game: ended } }, "quit");
}

/**
 * O que o save guarda do fim da partida (P285, P289): terminou (todas as músicas tocadas antes de
 * perder as 3 vidas) e terminou perfeita (todas acertadas no trecho de 1 s, sem erro e sem ajuda).
 * A conta é pelos pontos das músicas, sem o bônus: só o acerto no 1 s sem ajuda vale o máximo
 * (10), então ela é a da forma. A partida sem nenhuma música (todas fora, P141) não termina nada.
 * A perfeita recusa a partida com uma música anulada (falha de áudio, P291): todas precisam ter
 * tocado de verdade.
 */
export function superfanOutcome(run: SuperfanRun): SuperfanOutcome {
  const { points, rounds } = run.session.score;
  const done = run.end === "done" && rounds > 0;
  const best = VARIANT_RULES.superfan.points[0] ?? 0;
  return {
    done,
    // `rounds` conta só as não anuladas, e `number`, todas as que saíram.
    perfect:
      done &&
      rounds === run.session.number &&
      run.errors === 0 &&
      run.helps === 0 &&
      points === rounds * best,
  };
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
