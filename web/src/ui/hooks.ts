// Ganchos da tela de rodada, usados pelo diário (Game) e pelo Treino.
import { useCallback, useEffect, useMemo } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { RoundState } from "../core/reducer.ts";
import { buildSearchIndex, hitKey, search } from "../core/search.ts";
import type { Target } from "../core/types.ts";
import { optionView, revealView } from "../core/view.ts";
import type { Suggestion } from "./GuessInput.tsx";

/** Endereço do preview de uma faixa, já resolvido contra a base do site; null se não há. */
export function previewUrl(
  index: CatalogIndex,
  trackId: string,
  resolveUrl: (url: string) => string,
): string | null {
  const preview = revealView(index, trackId)?.preview;
  return preview ? resolveUrl(preview.url) : null;
}

/**
 * Guarda só o áudio da rodada atual e o da próxima, e já começa a baixar os dois. Sem isso o
 * motor nunca libera o que tocou (cerca de 11 MB por preview decodificado).
 */
export function usePreload(engine: AudioEngine, current: string | null, next: string | null) {
  useEffect(() => {
    const keep = [current, next].filter((u): u is string => u !== null);
    engine.retain(keep);
    for (const u of keep) engine.preload(u);
  }, [engine, current, next]);
}

/**
 * Sugestões do autocompletar para a rodada: o índice sai do catálogo uma vez por alvo, e
 * "já tentou" é por linha da busca (música inteira ou álbum), não por faixa.
 */
export function useSuggest(
  index: CatalogIndex,
  target: Target,
  round: RoundState,
): (query: string) => Suggestion[] {
  const searchIndex = useMemo(() => buildSearchIndex(index, target), [index, target]);
  const tried = useMemo(
    () =>
      new Set(
        round.attempts.flatMap((a) =>
          a.kind === "guess" ? [hitKey(index, target, a.guessId)] : [],
        ),
      ),
    [round.attempts, index, target],
  );
  return useCallback(
    (query: string): Suggestion[] =>
      search(searchIndex, query).flatMap((hit) => {
        const item = optionView(index, hit.id, target);
        return item ? [{ id: hit.id, item, tried: tried.has(hit.key) }] : [];
      }),
    [searchIndex, index, target, tried],
  );
}
