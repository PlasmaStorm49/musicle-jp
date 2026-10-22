// O diário (M14): o que o jogo, o save, o resumo e as estatísticas precisam saber de um jogo do
// dia, num descritor só, no lugar do par target + Day. Os Hits têm dois diários (o Normal e o
// Desafio); o Anime vai ter seis, 2 modos × 3 dificuldades, todos com as regras do Desafio. Puro:
// monta o descritor a partir da agenda, sem ler o save nem a tela.
import { type PuzzleId, puzzleId } from "./records.ts";
import type { PlannedRound } from "./reducer.ts";
import { MODES } from "./rules.ts";
import type { AnimeDay, Day, Target, TrackId } from "./types.ts";

/** Os modos do Anime: acertar a música ou acertar o anime. */
export const ANIME_MODES = ["musica", "titulo"] as const;
export type AnimeMode = (typeof ANIME_MODES)[number];

/** As dificuldades de cada modo do Anime. */
export const ANIME_DIFFICULTIES = ["facil", "medio", "dificil"] as const;
export type AnimeDifficulty = (typeof ANIME_DIFFICULTIES)[number];

/** Um diário do Anime sem a data: "anime-<modo>-<dificuldade>". É também a rota dele. */
export type AnimeKey = `anime-${AnimeMode}-${AnimeDifficulty}`;

/**
 * O diário sem a data, a 2ª metade do id no save ("<data>|<diário>"): nos Hits, o modo ("album" ou
 * "song"); no Anime, "anime-<modo>-<dificuldade>". A estatística é uma por diário (P249).
 */
export type DailyKey = Target | AnimeKey;

export function animeKey(mode: AnimeMode, difficulty: AnimeDifficulty): AnimeKey {
  return `anime-${mode}-${difficulty}`;
}

/** Os 6 diários do Anime, na ordem dos modos e, em cada modo, das dificuldades. */
export const ANIME_KEYS: readonly AnimeKey[] = ANIME_MODES.flatMap((mode) =>
  ANIME_DIFFICULTIES.map((difficulty) => animeKey(mode, difficulty)),
);

/** O diário é do Anime (e não dos Hits): o compartilhar diz a categoria. */
export function isAnimeKey(key: DailyKey): key is AnimeKey {
  return (ANIME_KEYS as readonly string[]).includes(key);
}

/**
 * Todos os diários de um dia: os 2 dos Hits e os 6 do Anime. São os que o save aceita (P250) e,
 * de hoje e dos 14 dias do Histórico, os andamentos que a abertura do jogo guarda
 * (`keptProgressIds`, P269).
 */
export const DAILY_KEYS: readonly DailyKey[] = [...MODES, ...ANIME_KEYS];

/** Os ids no save de todos os diários de um dia (a abertura guarda os da janela, P269). */
export function dailyIds(date: string): PuzzleId[] {
  return DAILY_KEYS.map((key) => puzzleId(date, key));
}

/**
 * O que se acerta: a faixa (nos Hits e no "acertar a música"; o Normal aceita o álbum dela) ou a
 * franquia (o "acertar o anime", P234: qualquer franquia da faixa vale). O reducer compara só ids:
 * no "acertar o anime", os aceitos são as franquias (`createRounds`, com o `answerOf`).
 */
export type DailyAnswer = "track" | "franchise";

/**
 * O nome do diário na tela, pela chave do i18n: "Normal" e "Desafio" nos Hits; no Anime, o modo e
 * a dificuldade ("Música · Fácil", "Anime · Fácil"). Quem traduz é a tela (`dailyName`, em
 * ui/modes.ts), e uma chave que não existir no pt-BR não compila lá.
 */
export type DailyName = `mode.${Target}` | `daily.${AnimeKey}`;

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
   * As faixas cujas músicas a ajuda nunca mostra: as respostas dos diários do mesmo grupo no dia
   * (nos Hits, os dois; no Anime, os seis), de todas as rodadas. A de outra rodada, ou a do outro
   * modo, seria entregue. Os Hits e o Anime não se evitam (P248).
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

/**
 * Um diário do Anime: o modo e a dificuldade do dia da agenda do Anime. As regras são as do
 * Desafio (`song`: digitado, ME107), e o "nº" é o do dia na agenda do Anime, que não é o dos Hits.
 * A ajuda evita as 18 respostas do dia do Anime, dos dois modos, e não as dos Hits (P248).
 */
export function animeDaily(
  day: AnimeDay,
  date: string,
  mode: AnimeMode,
  difficulty: AnimeDifficulty,
): Daily {
  const key = animeKey(mode, difficulty);
  return {
    key,
    id: puzzleId(date, key),
    date,
    number: day.number,
    target: "song",
    name: `daily.${key}`,
    answer: mode === "musica" ? "track" : "franchise",
    rounds: day[mode][difficulty],
    avoid: ANIME_MODES.flatMap((m) =>
      ANIME_DIFFICULTIES.flatMap((d) => day[m][d].map((round) => round.answer)),
    ),
  };
}

/** Os 6 diários do Anime do dia, na ordem de ANIME_KEYS. */
export function animeDailies(day: AnimeDay, date: string): Daily[] {
  return ANIME_MODES.flatMap((mode) =>
    ANIME_DIFFICULTIES.map((difficulty) => animeDaily(day, date, mode, difficulty)),
  );
}
