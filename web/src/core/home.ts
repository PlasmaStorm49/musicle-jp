// O que a Início e a tela dos Hits mostram de cada jogo: o estado do diário (novo, em andamento ou
// terminado, com os pontos), o 1º diário por jogar, o ✓ da aba Hits e o placar das sessões do
// Treino e do modo por artista. Puro: lê só o que quem chama passa.
import type { ArtistPlay } from "./artists.ts";
import { type PracticeScore, type PracticeSession, practiceScore } from "./practice.ts";
import { puzzleId, recordMax, recordScore, type Save } from "./records.ts";
import { MODES } from "./rules.ts";
import { superfanScore } from "./superfan.ts";
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
    };

export function dailyStatus(
  save: Save,
  day: Day | null,
  date: string,
  target: Target,
): DailyStatus {
  // O mesmo teste que o App faz antes de abrir o diário: o cartão e a tela nunca discordam.
  if (!day) return { kind: "unavailable" };
  const id = puzzleId(date, target);
  const finished = save.history[id];
  if (finished) {
    return {
      kind: "done",
      number: day.number,
      score: recordScore(finished),
      max: recordMax(finished),
    };
  }
  // Andamento vazio (a repetição descartou todos os eventos, com catálogo novo) ainda é dia novo.
  if (save.inProgress[id]?.events.length) return { kind: "playing", number: day.number };
  return { kind: "new", number: day.number };
}

/** O 1º diário por jogar (novo ou em andamento), na ordem de MODES: o cartão oliva. */
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
 * No Superfan, o placar da partida (com os erros da música em jogo, que contam na hora).
 */
export function artistSummary(play: ArtistPlay | null): ArtistSummary | null {
  if (!play) return null;
  if (play.kind === "superfan") {
    const score = superfanScore(play.run);
    return score.rounds > 0 || score.points !== 0
      ? { artist: play.artist.name, superfan: true, score }
      : null;
  }
  const summary = practiceSummary(play.session);
  return summary ? { artist: play.artist.name, superfan: false, score: summary.score } : null;
}
