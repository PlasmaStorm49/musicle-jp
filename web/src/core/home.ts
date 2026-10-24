// O que a Início, a tela dos Hits e as do Anime mostram de cada jogo: o estado do diário (novo, em
// andamento ou terminado, com os pontos), o 1º diário por jogar, o ✓ das abas Hits e Anime, o
// andamento de um grupo de diários e o placar das sessões do Treino e do modo por artista. Puro:
// lê só o que quem chama passa.
import type { ArtistPlay } from "./artists.ts";
import {
  ANIME_DIFFICULTIES,
  ANIME_KEYS,
  ANIME_MODES,
  animeKey,
  type Daily,
  hitsDaily,
} from "./daily.ts";
import { type PracticeScore, type PracticeSession, practiceScore } from "./practice.ts";
import { type PuzzleId, puzzleId, recordMax, recordScore, type Save } from "./records.ts";
import { MODES } from "./rules.ts";
import { superfanScore, superfanTotal } from "./superfan.ts";
import type { Day, Target } from "./types.ts";

export type DailyStatus =
  /** O dia não está na agenda (P44): o cartão avisa, e o Treino continua. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "new"; readonly number: number }
  /** Há andamento salvo: o 1º evento aceito (um palpite, ouvir mais, pular) já foi gravado. */
  | { readonly kind: "playing"; readonly number: number }
  /** `max` 0: todas as rodadas anuladas (P27), e a tela não mostra "0 de 0". */
  | {
      readonly kind: "done";
      readonly number: number;
      readonly score: number;
      readonly max: number;
      /** Jogado depois do dia dele (P263), pelo registro gravado: a tela do dia o marca. */
      readonly late: boolean;
    };

/**
 * O estado de um diário pelo descritor (nos Hits e no Anime); null quando o dia não está na
 * agenda. O mesmo teste que o App faz antes de abrir o diário: o cartão e a tela nunca discordam.
 */
export function statusOf(save: Save, daily: Daily | null): DailyStatus {
  if (!daily) return { kind: "unavailable" };
  const finished = save.history[daily.id];
  if (finished) {
    return {
      kind: "done",
      number: daily.number,
      score: recordScore(finished),
      max: recordMax(finished),
      late: finished.late === true,
    };
  }
  // Andamento vazio (a repetição descartou todos os eventos, com catálogo novo) ainda é dia novo.
  if (save.inProgress[daily.id]?.events.length) return { kind: "playing", number: daily.number };
  return { kind: "new", number: daily.number };
}

/** O estado de um diário dos Hits, o Normal ou o Desafio. */
export function dailyStatus(
  save: Save,
  day: Day | null,
  date: string,
  target: Target,
): DailyStatus {
  return statusOf(save, day ? hitsDaily(day, date, target) : null);
}

/** O 1º diário por jogar (novo ou em andamento), na ordem dada: o cartão oliva. */
export function firstToPlay(save: Save, dailies: readonly Daily[]): Daily | null {
  return (
    dailies.find((daily) => {
      const kind = statusOf(save, daily).kind;
      return kind === "new" || kind === "playing";
    }) ?? null
  );
}

/** O 1º diário dos Hits por jogar (novo ou em andamento), na ordem de MODES: o cartão oliva. */
export function nextDaily(save: Save, day: Day | null, date: string): Target | null {
  return (
    MODES.find((mode) => {
      const kind = dailyStatus(save, day, date, mode).kind;
      return kind === "new" || kind === "playing";
    }) ?? null
  );
}

/**
 * Os dois diários do dia terminados: o ✓ da aba Hits (P227). Só pelo save, porque a nav desenha
 * antes da agenda chegar.
 */
export function dailiesDone(save: Save, date: string): boolean {
  return MODES.every((mode) => save.history[puzzleId(date, mode)] !== undefined);
}

/**
 * O ✓ da aba Anime: ao menos um diário terminado em cada modo, o "acertar a música" e o "acertar
 * o anime", em qualquer dificuldade (o usuário, 24/10/2026; antes, qualquer um dos 6, P247). Só
 * pelo save, como o dos Hits: a nav desenha sem o Anime carregado (ele só carrega quando a pessoa
 * abre a categoria).
 */
export function animeDone(save: Save, date: string): boolean {
  return ANIME_MODES.every((mode) =>
    ANIME_DIFFICULTIES.some(
      (difficulty) => save.history[puzzleId(date, animeKey(mode, difficulty))] !== undefined,
    ),
  );
}

/** Algum dos 6 diários do Anime do dia terminado: a marca do dia no Histórico (P277). */
export function animePlayed(save: Save, date: string): boolean {
  return ANIME_KEYS.some((key) => save.history[puzzleId(date, key)] !== undefined);
}

/** O andamento de um grupo de diários: quantos terminaram, quantos estão em jogo e quantos são. */
export type Progress = {
  readonly done: number;
  /** Com andamento salvo (o 1º evento aceito já foi gravado) e sem resultado. */
  readonly playing: number;
  readonly total: number;
};

/**
 * O andamento dos diários dados, pelo id no save: o cartão de um modo do Anime (os 3 dele) e o
 * do Anime na Início (os de hoje, sem a agenda, P226).
 */
export function progress(save: Save, ids: readonly PuzzleId[]): Progress {
  const done = ids.filter((id) => save.history[id] !== undefined).length;
  const playing = ids.filter(
    (id) => save.history[id] === undefined && (save.inProgress[id]?.events.length ?? 0) > 0,
  ).length;
  return { done, playing, total: ids.length };
}

/** O cartão do Treino: o modo da sessão (P106) e o placar dela. */
export type PracticeSummary = { readonly target: Target; readonly score: PracticeScore };

/** O resumo da sessão do Treino, com a rodada em jogo se ela já terminou; null antes da 1ª. */
export function practiceSummary(session: PracticeSession | null): PracticeSummary | null {
  if (!session) return null;
  const score = practiceScore(session.score, session.game);
  return score.rounds > 0 ? { target: session.practice.target, score } : null;
}

/** O cartão do modo por artista (M13): de quem é a sessão, o submodo e o placar. */
export type ArtistSummary = {
  readonly artist: string;
  readonly superfan: boolean;
  readonly score: PracticeScore;
};

/**
 * O resumo da sessão do modo por artista; null antes da 1ª rodada terminada, como no Treino.
 * No Superfan, o placar da partida, com o bônus das vidas quando ela terminou completa (ME107).
 */
export function artistSummary(play: ArtistPlay | null): ArtistSummary | null {
  if (!play) return null;
  if (play.kind === "superfan") {
    const score = superfanScore(play.run);
    return score.rounds > 0
      ? {
          artist: play.artist.name,
          superfan: true,
          score: { ...score, points: superfanTotal(play.run) },
        }
      : null;
  }
  const summary = practiceSummary(play.session);
  return summary ? { artist: play.artist.name, superfan: false, score: summary.score } : null;
}
