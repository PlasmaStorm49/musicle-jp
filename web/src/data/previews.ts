// O endereço da prévia de cada faixa. Nas fixtures, o do catálogo, na hora. Na parada real, o
// lookup do iTunes no navegador (em lote), com o previewUrl guardado no catálogo como reserva:
// o catálogo acumula semanas, e uma prévia antiga pode mudar de endereço (P70).
//
// Sem DOM e sem import.meta.env: recebe o fetch, como o source.ts. Nunca rejeita: qualquer
// falha do lookup (rede, HTTP, 3 s sem resposta, resposta estranha, cota, disjuntor) cai na
// reserva, e o jogo segue.
import { appleTrackNumber, isAppleUrl, lookupUrl, previewsFromLookup } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { FetchLike } from "./source.ts";

export interface PreviewResolver {
  /** Endereço já conhecido, sem esperar; null enquanto não resolveu (ou se não há prévia). */
  peek(trackId: string): string | null;
  /** Resolve ou reaproveita o endereço. Nunca rejeita; null = a faixa não tem prévia. */
  resolve(trackId: string): Promise<string | null>;
  /** Começa a resolver estas faixas juntas, numa consulta só (as poucas faixas de um dia). */
  prefetch(trackIds: readonly string[]): void;
}

/** Fixtures: o endereço do catálogo, resolvido contra a base do site. Responde na hora. */
export function catalogResolver(
  index: CatalogIndex,
  resolveUrl: (url: string) => string,
): PreviewResolver {
  const peek = (trackId: string) => {
    const url = index.tracks.get(trackId)?.preview?.url;
    return url ? resolveUrl(url) : null;
  };
  return { peek, resolve: async (trackId) => peek(trackId), prefetch: () => {} };
}

/** Sem resposta em 3 s: vale a reserva (o jogador está esperando o "Tocar"). */
export const LOOKUP_TIMEOUT_MS = 3000;
/** Consultas por minuto, abaixo do limite da Apple (cerca de 20 por IP). */
export const LOOKUP_QUOTA = 12;
/** Falhas seguidas que abrem o disjuntor: a sessão inteira passa a usar a reserva. */
export const FAILURES_TO_OPEN = 2;
const MINUTE_MS = 60_000;

export type AppleResolverOptions = {
  readonly index: CatalogIndex;
  readonly fetchFn: FetchLike;
  /** ?failLookup=1 (P76): nunca consulta, e tudo vai para a reserva. */
  readonly disabled?: boolean;
  /** Relógio para a cota; os testes trocam. */
  readonly now?: () => number;
};

/** Parada real: lookup do iTunes no navegador, com a reserva do catálogo. */
export function appleResolver({
  index,
  fetchFn,
  disabled = false,
  now = Date.now,
}: AppleResolverOptions): PreviewResolver {
  const resolved = new Map<string, string | null>();
  const pending = new Map<string, Promise<string | null>>();
  const recent: number[] = []; // instantes das consultas do último minuto
  let failures = 0;
  let open = disabled; // disjuntor aberto: não consulta mais nesta sessão

  /** O previewUrl guardado no catálogo (o pipeline já conferiu o host; aqui, de novo). */
  function reserve(trackId: string): string | null {
    const url = index.tracks.get(trackId)?.preview?.url;
    return url && isAppleUrl("preview", url) ? url : null;
  }

  function withinQuota(): boolean {
    const t = now();
    while (recent.length > 0 && (recent[0] ?? t) <= t - MINUTE_MS) recent.shift();
    if (recent.length >= LOOKUP_QUOTA) return false;
    recent.push(t);
    return true;
  }

  /** O mapa faixa → previewUrl da Apple, ou null se a consulta falhou. */
  async function lookup(numbers: readonly string[]): Promise<Map<string, string> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const response = await fetchFn(lookupUrl(numbers), { signal: controller.signal });
      if (response.status === 403 || response.status === 429) {
        open = true; // a Apple pediu para parar: insistir só pioraria
        return null;
      }
      const found = response.ok ? previewsFromLookup(await response.json()) : null;
      if (!found) throw new Error("resposta inesperada do lookup");
      failures = 0;
      return found;
    } catch {
      failures += 1;
      if (failures >= FAILURES_TO_OPEN) open = true;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Fila do próximo lote. Os pedidos do mesmo ciclo (a rodada pede a sua faixa e o diário pede
  // o dia inteiro, em efeitos diferentes) viram uma consulta só: a fila só sai numa microtarefa,
  // depois de todos os efeitos daquela pintura. Sem isso a ordem dos efeitos (o do filho roda
  // antes do do pai) partiria o lote em dois.
  let queue: string[] = [];
  let batch: Promise<void> = Promise.resolve();

  async function flush(): Promise<void> {
    const todo = queue;
    queue = [];
    const numbers = todo.flatMap((id) => appleTrackNumber(id) ?? []);
    const found = numbers.length > 0 && !open && withinQuota() ? await lookup(numbers) : null;
    for (const id of todo) {
      resolved.set(id, found?.get(id) ?? reserve(id)); // falha ou faixa ausente: reserva
      pending.delete(id);
    }
  }

  function prefetch(trackIds: readonly string[]): void {
    const todo = [...new Set(trackIds)].filter((id) => !resolved.has(id) && !pending.has(id));
    if (todo.length === 0) return;
    if (open) {
      for (const id of todo) resolved.set(id, reserve(id)); // disjuntor aberto: reserva na hora
      return;
    }
    if (queue.length === 0) batch = Promise.resolve().then(flush);
    queue.push(...todo);
    const ready = batch;
    for (const id of todo)
      pending.set(
        id,
        ready.then(() => resolved.get(id) ?? null),
      );
  }

  return {
    peek: (trackId) => resolved.get(trackId) ?? null,
    resolve(trackId) {
      prefetch([trackId]);
      return pending.get(trackId) ?? Promise.resolve(resolved.get(trackId) ?? null);
    },
    prefetch,
  };
}
