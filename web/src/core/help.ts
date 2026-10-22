// A ajuda do Desafio (P149 a P152): as opções de música que trocam a digitação. Puro: o sorteio
// vem de fora (a semente da rodada), e o reducer recebe as opções prontas, no evento HELP. No
// "acertar o anime" (P231), as opções são nomes de anime (franquias).
import { songTitleKey } from "./artists.ts";
import { type CatalogIndex, franchisesOf } from "./catalog.ts";
import type { Daily, DailyAnswer } from "./daily.ts";
import { pickDistractors } from "./practice.ts";
import type { Mulberry32 } from "./prng.ts";
import type { RoundState } from "./reducer.ts";
import { HELP_OPTIONS } from "./rules.ts";
import { hitKey, songRepresentative } from "./search.ts";

/**
 * O que a ajuda de um diário nunca mostra, a partir do `avoid` dele (as respostas dos diários do
 * mesmo grupo no dia: nos Hits, os dois; no Anime, os seis), de todas as rodadas (a de outra
 * rodada, ou a do outro modo, seria entregue). Nos Hits e no "acertar a música", as músicas
 * (songKey); no "acertar o anime", as franquias dessas respostas. Os Hits e o Anime não se evitam
 * (P248).
 */
export function dayAnswerKeys(daily: Daily, index: CatalogIndex): Set<string> {
  if (daily.answer === "franchise") {
    return new Set(daily.avoid.flatMap((id) => franchisesOf(index, id)));
  }
  const keys = daily.avoid.map((id) => index.tracks.get(id)?.songKey);
  return new Set(keys.filter((key): key is string => key !== undefined));
}

/**
 * A semente da ajuda de uma rodada (para `seeded`): a mesma rodada, com as mesmas tentativas, dá
 * as mesmas opções (no diário, o mesmo para quem errou igual; recarregar mostra as mesmas, que
 * estão no evento salvo). No Treino e no modo por artista, `session` é a semente da sessão: o
 * puzzleId deles ("treino|song|ciclo|posição") se repete de uma sessão para outra, e a resposta
 * cairia sempre na mesma posição na rodada N.
 */
export function helpSeed(puzzleId: string, round: number, session?: number): string {
  return session === undefined
    ? `ajuda|${puzzleId}|${round}`
    : `ajuda|${session}|${puzzleId}|${round}`;
}

/** Comparação por code unit (<), igual em qualquer locale. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * As opções da ajuda: a resposta e até HELP_OPTIONS − 1 outras músicas do índice, embaralhadas.
 * Nunca entram outra versão da resposta, outra música de mesmo título (dois "Lemon" seriam uma
 * armadilha), uma música já tentada na rodada nem uma de `avoid` (as respostas dos diários de
 * hoje: a ajuda não pode entregá-las), nem uma homônima delas, que entregaria o título. Cada
 * música aparece pela faixa que a representa na busca (`songRepresentative`): a resposta não se
 * destaca por um "(TV Size)".
 * Com menos músicas no índice, menos opções; sem a resposta no índice, nenhuma. No "acertar o
 * anime" (`answer` "franchise"), as opções são franquias (`franchiseOptions`).
 */
export function helpOptions(
  index: CatalogIndex,
  round: RoundState,
  avoid: ReadonlySet<string>,
  rng: Mulberry32,
  answer: DailyAnswer = "track",
): string[] {
  if (answer === "franchise") return franchiseOptions(index, round, avoid, rng);
  const answerKey = index.tracks.get(round.trackId)?.songKey;
  const answerTrack = answerKey
    ? songRepresentative(index.tracksBySong.get(answerKey) ?? [])
    : undefined;
  if (!answerKey || !answerTrack) return [];
  const tried = new Set(
    round.attempts.flatMap((a) => (a.kind === "guess" ? [hitKey(index, a.guessId)] : [])),
  );
  const titles = new Set([answerKey, ...avoid].map(songTitleKey));
  // Em ordem de songKey: o mesmo sorteio em todo navegador (a ordem do Map é a do catálogo).
  const pool = [...index.tracksBySong.keys()]
    .filter((key) => !titles.has(songTitleKey(key)) && !tried.has(key) && !avoid.has(key))
    .sort(byCodeUnit)
    .flatMap((key) => songRepresentative(index.tracksBySong.get(key) ?? [])?.id ?? []);
  const options = [answerTrack.id, ...pickDistractors(rng, pool, HELP_OPTIONS - 1)];
  rng.shuffle(options);
  return options;
}

/**
 * A ajuda do "acertar o anime": a franquia da resposta (a que a rodada mostra) e até
 * HELP_OPTIONS − 1 outras franquias do catálogo, embaralhadas. Nunca entram as outras franquias da
 * resposta (seriam duas certas), uma já tentada nem uma de `avoid` (as franquias das respostas de
 * hoje). Com poucas franquias sobrando, menos opções.
 */
function franchiseOptions(
  index: CatalogIndex,
  round: RoundState,
  avoid: ReadonlySet<string>,
  rng: Mulberry32,
): string[] {
  const franchises = index.anime?.franchises;
  if (!franchises?.has(round.correctOptionId)) return [];
  const blocked = new Set([
    ...round.accepted,
    ...avoid,
    ...round.attempts.flatMap((a) => (a.kind === "guess" ? [a.guessId] : [])),
  ]);
  // Em ordem de id: o mesmo sorteio em todo navegador.
  const pool = [...franchises.keys()].filter((id) => !blocked.has(id)).sort(byCodeUnit);
  const options = [round.correctOptionId, ...pickDistractors(rng, pool, HELP_OPTIONS - 1)];
  rng.shuffle(options);
  return options;
}
