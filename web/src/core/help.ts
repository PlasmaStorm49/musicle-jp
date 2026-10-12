// A ajuda do Desafio (P149 a P152): as opções de música que trocam a digitação. Puro: o sorteio
// vem de fora (a semente da rodada), e o reducer recebe as opções prontas, no evento HELP.
import type { CatalogIndex } from "./catalog.ts";
import { pickDistractors } from "./practice.ts";
import type { Mulberry32 } from "./prng.ts";
import type { RoundState } from "./reducer.ts";
import { HELP_OPTIONS } from "./rules.ts";
import { hitKey, songRepresentative } from "./search.ts";

/**
 * A semente da ajuda de uma rodada (para `seeded`): a mesma rodada dá as mesmas opções. No
 * diário, todo mundo vê as mesmas; no Treino, o puzzleId já muda a cada rodada.
 */
export function helpSeed(puzzleId: string, round: number): string {
  return `ajuda|${puzzleId}|${round}`;
}

/**
 * As opções da ajuda: a resposta e até HELP_OPTIONS − 1 outras músicas do índice, embaralhadas.
 * Nunca entram outra versão da resposta, uma música já tentada na rodada nem uma de `avoid` (as
 * respostas dos diários de hoje: a ajuda não pode entregá-las). Cada música aparece pela faixa
 * que a representa na busca (`songRepresentative`): a resposta não se destaca por um "(TV Size)".
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
  // Em ordem de songKey: o mesmo sorteio em todo navegador (a ordem do Map é a do catálogo).
  const pool = [...index.tracksBySong.keys()]
    .filter((key) => key !== answerKey && !tried.has(key) && !avoid.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap((key) => songRepresentative(index.tracksBySong.get(key) ?? [])?.id ?? []);
  const options = [answer.id, ...pickDistractors(rng, pool, HELP_OPTIONS - 1)];
  rng.shuffle(options);
  return options;
}
