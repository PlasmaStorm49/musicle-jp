// Ganchos da tela de rodada, usados pelo diário (Game) e pelo Treino, e o do foco no título das
// telas de escolha (o Anime e o Histórico).
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { DailyAnswer } from "../core/daily.ts";
import type { RoundState } from "../core/reducer.ts";
import { buildFranchiseIndex, buildSearchIndex, hitKey, search } from "../core/search.ts";
import { guessView } from "../core/view.ts";
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
 * Os endereços das prévias de várias faixas (a mistura das Misturadas, M17), na ordem dada: cada
 * um como o `useResolvedUrl`, null enquanto espera (e null de vez, se a faixa não tem prévia).
 * `done` diz quais já têm resposta: um null de uma faixa já respondida é a prévia que não existe.
 */
export function useResolvedUrls(
  resolver: PreviewResolver,
  trackIds: readonly string[],
): { readonly urls: readonly (string | null)[]; readonly done: readonly boolean[] } {
  const [late, setLate] = useState<ReadonlyMap<string, string | null>>(new Map());
  const peeked = trackIds.map((id) => resolver.peek(id));
  const missing = trackIds.filter((id, i) => peeked[i] === null && !late.has(id));
  const waiting = missing.join("\n");
  useEffect(() => {
    if (waiting === "") return;
    let live = true; // a rodada pode mudar antes da resposta
    for (const id of waiting.split("\n")) {
      void resolver.resolve(id).then((resolved) => {
        if (live) setLate((prev) => new Map(prev).set(id, resolved));
      });
    }
    return () => {
      live = false;
    };
  }, [resolver, waiting]);
  // Listas novas a cada desenho: quem as usa num efeito depende do texto delas, e não da lista.
  return {
    urls: trackIds.map((id, i) => peeked[i] ?? late.get(id) ?? null),
    done: trackIds.map((id, i) => peeked[i] !== null || late.has(id)),
  };
}

/**
 * As prévias de uma partida das Misturadas (M17): o lote do diário numa consulta só, e o motor
 * guarda (e já baixa) só as da rodada atual e as da próxima, como o `usePreviews`.
 */
export function useMixPreviews(
  engine: AudioEngine,
  resolver: PreviewResolver,
  batch: readonly string[],
  current: readonly string[],
  next: readonly string[],
): { readonly urls: readonly (string | null)[]; readonly done: readonly boolean[] } {
  useEffect(() => resolver.prefetch(batch), [resolver, batch]);
  const now = useResolvedUrls(resolver, current);
  const after = useResolvedUrls(resolver, next);
  const keep = [...now.urls, ...after.urls].filter((u): u is string => u !== null);
  const kept = keep.join("\n");
  useEffect(() => {
    const urls = kept === "" ? [] : kept.split("\n");
    engine.retain(urls);
    for (const u of urls) engine.preload(u);
  }, [engine, kept]);
  return now;
}

/**
 * Sugestões do autocompletar do Desafio: o índice de músicas (ou, no "acertar o anime", o das
 * franquias) sai do catálogo uma vez, e "já tentou" é por linha da busca (a música inteira, ou a
 * franquia), não por faixa. Serve às Misturadas também: só as tentativas da rodada contam.
 */
export function useSuggest(
  index: CatalogIndex,
  round: Pick<RoundState, "attempts">,
  answer: DailyAnswer = "track",
): (query: string) => Suggestion[] {
  // Os próprios build* guardam o índice por catálogo: aqui não precisa de memo.
  const searchIndex = answer === "franchise" ? buildFranchiseIndex(index) : buildSearchIndex(index);
  const tried = useMemo(
    () =>
      new Set(
        round.attempts.flatMap((a) => (a.kind === "guess" ? [hitKey(index, a.guessId)] : [])),
      ),
    [round.attempts, index],
  );
  return useCallback(
    (query: string): Suggestion[] =>
      search(searchIndex, query).flatMap((hit) => {
        const item = guessView(index, hit.id, "song", answer);
        return item ? [{ id: hit.id, item, tried: tried.has(hit.key) }] : [];
      }),
    [searchIndex, index, tried, answer],
  );
}

/** O título da tela, com o foco ao montar (regra 16): a tela nova, e não o link que sumiu. */
export function useHeadingFocus() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return heading;
}
