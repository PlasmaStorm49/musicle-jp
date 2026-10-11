// Ganchos da tela de rodada, usados pelo diário (Game) e pelo Treino.
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { RoundState } from "../core/reducer.ts";
import { buildSearchIndex, hitKey, search } from "../core/search.ts";
import type { Target } from "../core/types.ts";
import { optionView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import type { Suggestion } from "./GuessInput.tsx";

/**
 * Endereço da prévia de uma faixa. O `peek` responde na hora (fixtures, ou faixa já resolvida);
 * senão o gancho espera o resolvedor. null enquanto espera: o Tocar fica em "Carregando…".
 */
export function useResolvedUrl(resolver: PreviewResolver, trackId: string | null): string | null {
  const [late, setLate] = useState<{ readonly trackId: string; readonly url: string | null }>();
  const url =
    trackId === null
      ? null
      : (resolver.peek(trackId) ?? (late?.trackId === trackId ? late.url : null));
  // Desenhou sem a URL: o efeito sempre assina a resposta. Não confere o peek de novo aqui: se a
  // resposta chegou entre a pintura e o efeito, o resolve devolve uma promessa já resolvida, e o
  // setLate desenha de novo (senão a tela ficaria em "Carregando…" com a URL já pronta).
  const shownWithout = url === null;
  useEffect(() => {
    if (trackId === null || !shownWithout) return;
    let live = true; // a rodada pode mudar antes da resposta
    void resolver.resolve(trackId).then((resolved) => {
      if (live) setLate({ trackId, url: resolved });
    });
    return () => {
      live = false;
    };
  }, [resolver, trackId, shownWithout]);
  return url;
}

/**
 * Prévias da rodada: resolve as faixas de `batch` numa consulta só (o dia inteiro, no diário),
 * guarda no motor só o áudio da rodada atual e o da próxima e já começa a baixar os dois. Sem o
 * `retain` o motor nunca libera o que tocou (cerca de 11 MB por prévia decodificada).
 */
export function usePreviews(
  engine: AudioEngine,
  resolver: PreviewResolver,
  batch: readonly string[],
  current: string | null,
  next: string | null,
) {
  useEffect(() => resolver.prefetch(batch), [resolver, batch]);
  const currentUrl = useResolvedUrl(resolver, current);
  const nextUrl = useResolvedUrl(resolver, next);
  useEffect(() => {
    const keep = [currentUrl, nextUrl].filter((u): u is string => u !== null);
    engine.retain(keep);
    for (const u of keep) engine.preload(u);
  }, [engine, currentUrl, nextUrl]);
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
