// O diário (M14): o que o jogo, o save, o resumo e as estatísticas precisam saber de um jogo do
// dia, num descritor só, no lugar do par target + Day. Os Hits têm dois diários (o Normal e o
// Desafio); o Anime vai ter seis, 2 modos × 3 dificuldades, todos com as regras do Desafio. Puro:
// monta o descritor a partir da agenda, sem ler o save nem a tela.
import { type PuzzleId, puzzleId } from "./records.ts";
import type { PlannedRound } from "./reducer.ts";
import { MODES } from "./rules.ts";
import type { Day, Target, TrackId } from "./types.ts";

/** Os modos do Anime: acertar a música ou acertar o anime. */
export const ANIME_MODES = ["musica", "titulo"] as const;
export type AnimeMode = (typeof ANIME_MODES)[number];

/** As dificuldades de cada modo do Anime. */
export const ANIME_DIFFICULTIES = ["facil", "medio", "dificil"] as const;
export type AnimeDifficulty = (typeof ANIME_DIFFICULTIES)[number];

/**
 * O diário sem a data, a 2ª metade do id no save ("<data>|<diário>"): nos Hits, o modo ("album" ou
 * "song"); no Anime, "anime-<modo>-<dificuldade>". A estatística é uma por diário (P249).
 */
export type DailyKey = Target | `anime-${AnimeMode}-${AnimeDifficulty}`;

/** Os 6 diários do Anime, na ordem dos modos e, em cada modo, das dificuldades. */
export const ANIME_KEYS: readonly DailyKey[] = ANIME_MODES.flatMap((mode) =>
  ANIME_DIFFICULTIES.map((difficulty) => `anime-${mode}-${difficulty}` as const),
);

/**
 * Todos os diários de um dia: os 2 dos Hits e os 6 do Anime. São os que o save aceita (P250) e os
 * andamentos que a abertura do jogo guarda (o resto é de outro dia).
 */
export const DAILY_KEYS: readonly DailyKey[] = [...MODES, ...ANIME_KEYS];

/** Os ids no save de todos os diários de um dia: os andamentos que a abertura do jogo guarda. */
export function dailyIds(date: string): PuzzleId[] {
  return DAILY_KEYS.map((key) => puzzleId(date, key));
}

/**
 * O que se acerta: a faixa (nos Hits; o Normal aceita o álbum dela) ou a franquia (o anime). Por
 * enquanto só existe a faixa: a franquia chega com os diários do Anime.
 */
export type DailyAnswer = "track" | "franchise";

/**
 * O nome do diário na tela, pela chave do i18n: "Normal" e "Desafio" nos Hits. Quem traduz é a
 * tela (`dailyName`, em ui/modes.ts), e uma chave que não existir no pt-BR não compila lá.
 */
export type DailyName = `mode.${Target}`;

/** Um diário do dia: a agenda diz as rodadas, e o descritor, o resto. */
export type Daily = {
  /** O diário sem a data: as estatísticas são por ele (P249). */
  readonly key: DailyKey;
  /** O id do jogo no save: "<data>|<diário>", ex.: "2026-10-08|song". */
  readonly id: PuzzleId;
  /** A data do jogo (não o relógio). */
  readonly date: string;
  /** O número do dia na agenda do diário: o "nº" do cabeçalho e do compartilhar. */
  readonly number: number;
  /** As regras (MODE_RULES): "album" é o Normal, em 4 opções; "song", o Desafio, digitado. */
  readonly target: Target;
  readonly name: DailyName;
  readonly answer: DailyAnswer;
  /** As rodadas: a faixa que toca e, no Normal, as 4 opções. */
  readonly rounds: readonly PlannedRound[];
  /**
   * As faixas cujas músicas a ajuda nunca mostra: as respostas de todos os diários do dia (nos
   * Hits, as dos dois), de todas as rodadas. A de outra rodada, ou a do outro modo, seria entregue.
   */
  readonly avoid: readonly TrackId[];
};

/** Um diário dos Hits: o Normal ("album") ou o Desafio ("song") do dia da agenda. */
export function hitsDaily(day: Day, date: string, target: Target): Daily {
  return {
    key: target,
    id: puzzleId(date, target),
    date,
    number: day.number,
    target,
    name: `mode.${target}`,
    answer: "track",
    rounds: day[target],
    avoid: [...day.song, ...day.album].map((round) => round.answer),
  };
}

/** Os dois diários dos Hits do dia, na ordem de MODES (o Normal primeiro). */
export function hitsDailies(day: Day, date: string): Daily[] {
  return MODES.map((target) => hitsDaily(day, date, target));
}
