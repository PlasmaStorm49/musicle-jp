// A ajuda do Desafio (P149 a P152): as opções de música que trocam a digitação. Puro: o sorteio
// vem de fora (a semente da rodada), e o reducer recebe as opções prontas, no evento HELP.
import { songTitleKey } from "./artists.ts";
import type { CatalogIndex } from "./catalog.ts";
import { pickDistractors } from "./practice.ts";
import type { Mulberry32 } from "./prng.ts";
import type { RoundState } from "./reducer.ts";
import { HELP_OPTIONS } from "./rules.ts";
import { hitKey, songRepresentative } from "./search.ts";
import type { Day } from "./types.ts";

/**
 * As músicas (songKey) que a ajuda de um diário nunca mostra: as respostas dos dois diários do
 * dia, de todas as rodadas (a de outra rodada, ou a do outro modo, seria entregue).
 */
export function dayAnswerKeys(day: Day, index: CatalogIndex): Set<string> {
  const keys = [...day.song, ...day.album].map((r) => index.tracks.get(r.answer)?.songKey);
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

/**
 * As opções da ajuda: a resposta e até HELP_OPTIONS − 1 outras músicas do índice, embaralhadas.
 * Nunca entram outra versão da resposta, outra música de mesmo título (dois "Lemon" seriam uma
 * armadilha), uma música já tentada na rodada nem uma de `avoid` (as respostas dos diários de
 * hoje: a ajuda não pode entregá-las), nem uma homônima delas, que entregaria o título. Cada
 * música aparece pela faixa que a representa na busca (`songRepresentative`): a resposta não se
 * destaca por um "(TV Size)".
 * Com menos músicas no índice, menos opções; sem a resposta no índice, nenhuma.
 */
export function helpOptions(
  index: CatalogIndex,
  round: RoundState,
  avoid: ReadonlySet<string>,
  rng: Mulberry32,
): string[] {
  const answerKey = index.tracks.get(round.trackId)?.songKey;
  const answer = answerKey
    ? songRepresentative(index.tracksBySong.get(answerKey) ?? [])
    : undefined;
  if (!answerKey || !answer) return [];
  const tried = new Set(
    round.attempts.flatMap((a) => (a.kind === "guess" ? [hitKey(index, a.guessId)] : [])),
  );
  const titles = new Set([answerKey, ...avoid].map(songTitleKey));
  // Em ordem de songKey: o mesmo sorteio em todo navegador (a ordem do Map é a do catálogo).
  const pool = [...index.tracksBySong.keys()]
    .filter((key) => !titles.has(songTitleKey(key)) && !tried.has(key) && !avoid.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap((key) => songRepresentative(index.tracksBySong.get(key) ?? [])?.id ?? []);
  const options = [answer.id, ...pickDistractors(rng, pool, HELP_OPTIONS - 1)];
  rng.shuffle(options);
  return options;
}
