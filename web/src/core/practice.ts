// Modo Treino: rodadas sem fim, sorteadas de um "saco embaralhado" por alvo. Funções puras:
// a semente vem de fora (a tela usa crypto.getRandomValues) e nada daqui é salvo (P50).
//
// Por que saco, e não sorteio solto: com sorteio solto a mesma música volta logo. O saco tem
// cada música (ou álbum) uma vez; embaralhado, toca até esvaziar e então começa um novo ciclo.
// O estado guarda só números e IDs (semente, ciclo, posição), nunca o gerador: o embaralhamento
// de cada ciclo é refeito da semente quando preciso, sempre igual.
import type { CatalogIndex } from "./catalog.ts";
import { type Mulberry32, seeded } from "./prng.ts";
import { puzzleId, type SaveV1 } from "./records.ts";
import { createRounds, type GameState, type PlannedRound, roundScore } from "./reducer.ts";
import type { AnswerMode, Day, Target, Track } from "./types.ts";

/** Distratores por rodada: com a certa, 4 opções. */
const DISTRACTORS = 3;

const TARGETS: readonly Target[] = ["song", "album"];

/** Onde o jogador está no saco de um alvo. */
export type BagCursor = {
  /** Volta no saco: cada ciclo tem o seu embaralhamento. */
  readonly cycle: number;
  /** Próxima posição a examinar no saco do ciclo (as anteriores já tocaram ou foram puladas). */
  readonly position: number;
  /**
   * A última faixa tocada no ciclo anterior (null no primeiro). O saco novo não começa por ela,
   * e ela precisa ficar guardada para o mesmo saco sair igual a cada sorteio do ciclo.
   */
  readonly carry: string | null;
};

export type PracticeState = {
  readonly seed: number;
  /** Um saco por alvo: trocar de alvo e voltar continua de onde parou. */
  readonly cursors: Readonly<Record<Target, BagCursor>>;
};

/** Uma rodada sorteada: de que saco, ciclo e posição saiu, e o que toca e se responde. */
export type PracticeRound = {
  readonly target: Target;
  readonly cycle: number;
  readonly position: number;
  readonly planned: PlannedRound;
};

export type PracticeDraw = {
  readonly round: PracticeRound;
  /** O estado depois do sorteio, para o próximo. */
  readonly state: PracticeState;
};

/** Placar da sessão: pontos e rodadas jogadas (anulada não conta). */
export type PracticeScore = { readonly points: number; readonly rounds: number };

/** Tudo o que a sessão do Treino lembra enquanto a página estiver aberta. */
export type PracticeSession = {
  readonly practice: PracticeState;
  /** Filtros: valem a partir da próxima rodada. */
  readonly target: Target;
  readonly answerMode: AnswerMode;
  /** Placar das rodadas encerradas antes da atual. */
  readonly score: PracticeScore;
  /** Quantas rodadas já saíram (a atual é a de número `number`). */
  readonly number: number;
  /** A rodada em jogo; null quando não há o que sortear (aviso na tela). */
  readonly game: GameState | null;
};

export function newPractice(seed: number): PracticeState {
  const start: BagCursor = { cycle: 0, position: 0, carry: null };
  return { seed, cursors: { song: start, album: start } };
}

/** Ordem de preferência dentro de um grupo: mais popular primeiro; empate pelo id. */
function byPopularity(a: Track, b: Track): number {
  if (a.popularity !== b.popularity) return b.popularity - a.popularity;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * O saco de um alvo, antes de embaralhar, em ordem fixa. Música: uma faixa elegível por música
 * (songKey), a mais popular. Álbum: uma faixa elegível por álbum, sem repetir música dentro do
 * saco (a mesma música pode estar em vários álbuns); os álbuns vão em ordem de id e cada um
 * leva a sua faixa mais popular cuja música ainda não entrou.
 */
export function practicePool(index: CatalogIndex, target: Target): string[] {
  const eligible = index.catalog.tracks.filter((t) => t.eligible.daily);
  if (target === "song") {
    const best = new Map<string, Track>();
    for (const track of eligible) {
      const current = best.get(track.songKey);
      if (!current || byPopularity(track, current) < 0) best.set(track.songKey, track);
    }
    return [...best.values()].map((t) => t.id).sort(byId);
  }
  const byAlbum = new Map<string, Track[]>();
  for (const track of eligible) {
    const group = byAlbum.get(track.albumId) ?? [];
    group.push(track);
    byAlbum.set(track.albumId, group);
  }
  const songs = new Set<string>();
  const pool: string[] = [];
  for (const albumId of [...byAlbum.keys()].sort(byId)) {
    const pick = (byAlbum.get(albumId) ?? []).sort(byPopularity).find((t) => !songs.has(t.songKey));
    if (!pick) continue;
    songs.add(pick.songKey);
    pool.push(pick.id);
  }
  return pool;
}

/** O saco do ciclo, embaralhado; se começaria pela última tocada, troca a 1ª com a 2ª. */
function bagFor(
  pool: readonly string[],
  seed: number,
  target: Target,
  cycle: number,
  carry: string | null,
): string[] {
  const bag = [...pool];
  seeded(`treino|${seed}|${target}|${cycle}`).shuffle(bag);
  if (bag.length > 1 && bag[0] === carry) [bag[0], bag[1]] = [bag[1] as string, bag[0]];
  return bag;
}

/**
 * Músicas (songKey) a esconder do Treino: as respostas dos diários de hoje (Música e Álbum)
 * que ainda não têm resultado gravado. Quando o diário termina, elas voltam.
 */
export function pendingDailySongKeys(
  save: SaveV1,
  day: Day | null,
  date: string,
  index: CatalogIndex,
): Set<string> {
  const keys = new Set<string>();
  if (!day) return keys;
  for (const target of TARGETS) {
    if (save.history[puzzleId(date, target)]) continue;
    for (const round of day[target]) {
      const track = index.tracks.get(round.answer);
      if (track) keys.add(track.songKey);
    }
  }
  return keys;
}

function albumHasSong(index: CatalogIndex, albumId: string, songs: ReadonlySet<string>): boolean {
  return index.catalog.tracks.some((t) => t.albumId === albumId && songs.has(t.songKey));
}

/** Fisher-Yates parcial, como o pipeline (schedule.py): até 3 trocas, um número cada. */
function pickDistractors(rng: Mulberry32, pool: readonly string[]): string[] {
  const items = [...pool];
  const count = Math.min(DISTRACTORS, items.length);
  for (let i = 0; i < count; i++) {
    const j = i + rng.randint(items.length - i);
    [items[i], items[j]] = [items[j] as string, items[i] as string];
  }
  return items.slice(0, count);
}

/**
 * As opções de uma rodada: a certa (a faixa na Música, o álbum dela no Álbum) e 3 distratores
 * do `similar`, sem as músicas excluídas (no Álbum, sem álbuns que as contenham). Se sobrarem
 * menos de 3, vale a lista inteira, como no pipeline. As 4 saem embaralhadas.
 */
export function planRound(
  index: CatalogIndex,
  target: Target,
  trackId: string,
  excluded: ReadonlySet<string>,
  rng: Mulberry32,
): PlannedRound {
  const track = index.tracks.get(trackId);
  if (!track) throw new RangeError(`faixa ${trackId} não está no catálogo`);
  const correct = target === "song" ? track.id : track.albumId;
  const similar =
    target === "song" ? track.similar : (index.albums.get(track.albumId)?.similar ?? []);
  const allowed =
    target === "song"
      ? (id: string) => !excluded.has(index.tracks.get(id)?.songKey ?? "")
      : (id: string) => !albumHasSong(index, id, excluded);
  const filtered = similar.filter(allowed);
  const pool = filtered.length < DISTRACTORS ? similar : filtered;
  const options = [correct, ...pickDistractors(rng, pool)];
  rng.shuffle(options);
  return { answer: track.id, options };
}

/**
 * Sorteia a próxima rodada do alvo. A faixa cuja música está excluída é pulada (fica no saco
 * e volta no ciclo seguinte). Saco vazio: novo ciclo. Uma volta inteira sem achar nenhuma
 * devolve null, e o estado fica como estava.
 */
export function drawPractice(
  state: PracticeState,
  index: CatalogIndex,
  target: Target,
  excluded: ReadonlySet<string>,
): PracticeDraw | null {
  const pool = practicePool(index, target);
  let { cycle, position, carry } = state.cursors[target];
  let bag = bagFor(pool, state.seed, target, cycle, carry);
  // A última tocada é a de antes da posição: as puladas só vêm depois dela.
  const last = position > 0 ? (bag[position - 1] ?? null) : null;
  for (let step = 0; step < pool.length; step++) {
    if (position >= bag.length) {
      cycle += 1;
      position = 0;
      carry = last;
      bag = bagFor(pool, state.seed, target, cycle, carry);
    }
    const trackId = bag[position] as string;
    position += 1;
    if (excluded.has(index.tracks.get(trackId)?.songKey ?? "")) continue;
    const rng = seeded(`treino|${state.seed}|${target}|${cycle}|${position - 1}`);
    return {
      round: {
        target,
        cycle,
        position: position - 1,
        planned: planRound(index, target, trackId, excluded, rng),
      },
      state: { ...state, cursors: { ...state.cursors, [target]: { cycle, position, carry } } },
    };
  }
  return null;
}

/** O jogo de uma rodada só, com o reducer de sempre. O puzzleId identifica a rodada. */
export function practiceGame(
  round: PracticeRound,
  answerMode: AnswerMode,
  index: CatalogIndex,
): GameState {
  return {
    puzzleId: `treino|${round.target}|${round.cycle}|${round.position}`,
    target: round.target,
    answerMode,
    rounds: createRounds([round.planned], round.target, index),
    current: 0,
  };
}

/** Placar com a rodada dada, se ela já terminou e não foi anulada. */
export function practiceScore(score: PracticeScore, game: GameState | null): PracticeScore {
  const round = game?.rounds[game.current];
  if (!round || round.status === "playing" || round.status === "void") return score;
  return { points: score.points + roundScore(round), rounds: score.rounds + 1 };
}

/**
 * Fecha a rodada atual no placar e sorteia a próxima com os filtros de agora. Sem rodada
 * possível, `game` fica null e o número não anda.
 */
export function nextPracticeRound(
  session: PracticeSession,
  index: CatalogIndex,
  excluded: ReadonlySet<string>,
): PracticeSession {
  const score = practiceScore(session.score, session.game);
  const draw = drawPractice(session.practice, index, session.target, excluded);
  if (!draw) return { ...session, score, game: null };
  return {
    ...session,
    score,
    practice: draw.state,
    number: session.number + 1,
    game: practiceGame(draw.round, session.answerMode, index),
  };
}

/** Começa a sessão já com a 1ª rodada sorteada. */
export function startPracticeSession(
  seed: number,
  target: Target,
  answerMode: AnswerMode,
  index: CatalogIndex,
  excluded: ReadonlySet<string>,
): PracticeSession {
  const session: PracticeSession = {
    practice: newPractice(seed),
    target,
    answerMode,
    score: { points: 0, rounds: 0 },
    number: 0,
    game: null,
  };
  return nextPracticeRound(session, index, excluded);
}
