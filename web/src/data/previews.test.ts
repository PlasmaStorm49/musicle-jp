import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalog, realCatalog } from "../../test/fixtures.ts";
import { indexCatalog } from "../core/catalog.ts";
import {
  appleResolver,
  catalogResolver,
  FAILURES_TO_OPEN,
  LOOKUP_QUOTA,
  LOOKUP_TIMEOUT_MS,
  lookupBudget,
} from "./previews.ts";
import type { FetchLike } from "./source.ts";

const real = indexCatalog(realCatalog);
// Só faixas com prévia: o catálogo real é regerado toda semana, e uma faixa que perder a prévia
// não pode quebrar estes testes no PR do robô.
const withPreview = realCatalog.tracks.filter((t) => t.preview).map((t) => t.id);
const [A, B, C, D] = withPreview;
const FRESH = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview9/v4/novo.m4a";

/** Um orçamento novo, só deste resolvedor (P142). */
const fresh = () => lookupBudget({ now: Date.now });

function stored(id: string | undefined): string | null {
  return realCatalog.tracks.find((t) => t.id === id)?.preview?.url ?? null;
}

type Reply = { status: number; body?: unknown } | "network" | "hang";

/** Lookup falso: responde com a fila dada (a última resposta se repete) e guarda as URLs. */
function fakeLookup(...replies: Reply[]) {
  const urls: string[] = [];
  const fetchFn: FetchLike = (url, init) => {
    urls.push(url);
    const reply = replies[Math.min(urls.length - 1, replies.length - 1)] ?? "network";
    if (reply === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (reply === "hang") {
      return new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError"))),
      );
    }
    return Promise.resolve({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    });
  };
  return { fetchFn, urls };
}

function found(...pairs: [string | undefined, string][]) {
  return {
    status: 200,
    body: {
      resultCount: pairs.length,
      results: pairs.map(([id, previewUrl]) => ({
        wrapperType: "track",
        trackId: Number(id?.split(":")[2]),
        previewUrl,
      })),
    },
  };
}

describe("catalogResolver (fixtures)", () => {
  it("responde na hora com o endereço do catálogo, resolvido contra a base", async () => {
    const index = indexCatalog(catalog);
    const resolver = catalogResolver(index, (url) => `http://x.test/${url}`);
    const id = catalog.tracks[0]?.id ?? "";
    const expected = `http://x.test/${catalog.tracks[0]?.preview?.url}`;
    expect(resolver.peek(id)).toBe(expected);
    await expect(resolver.resolve(id)).resolves.toBe(expected);
    expect(resolver.peek("fixture:tr:nao-existe")).toBeNull();
  });
});

describe("appleResolver (parada real)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("as faixas do dia saem numa consulta só, com o endereço novo da Apple", async () => {
    const { fetchFn, urls } = fakeLookup(found([A, FRESH], [B, FRESH]));
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    resolver.prefetch([A ?? "", B ?? "", A ?? ""]);
    expect(resolver.peek(A ?? "")).toBeNull(); // ainda consultando
    await expect(resolver.resolve(A ?? "")).resolves.toBe(FRESH);
    expect(resolver.peek(B ?? "")).toBe(FRESH);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https:\/\/itunes\.apple\.com\/lookup\?id=\d+,\d+&country=jp$/);
    await resolver.resolve(B ?? "");
    expect(urls).toHaveLength(1); // já resolvida: não consulta de novo
  });

  it("a rodada pede a sua faixa e o diário o dia inteiro no mesmo ciclo: uma consulta só", async () => {
    // Os efeitos do filho (RoundView) rodam antes dos do pai (Playing): o resolve chega primeiro.
    const { fetchFn, urls } = fakeLookup(found([A, FRESH], [B, FRESH], [C, FRESH]));
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    const first = resolver.resolve(A ?? "");
    resolver.prefetch([A ?? "", B ?? "", C ?? ""]);
    await expect(first).resolves.toBe(FRESH);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.split("id=")[1]?.split("&")[0]?.split(",")).toHaveLength(3);
  });

  it("faixa ausente ou prévia fora do host da Apple: vale a reserva do catálogo", async () => {
    const { fetchFn } = fakeLookup(found([A, "https://evil.test/a.m4a"]));
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    resolver.prefetch([A ?? "", B ?? ""]);
    await expect(resolver.resolve(A ?? "")).resolves.toBe(stored(A));
    await expect(resolver.resolve(B ?? "")).resolves.toBe(stored(B));
  });

  it.each([
    ["erro de rede", "network"],
    ["HTTP 500", { status: 500 }],
    ["resposta sem results", { status: 200, body: { errorMessage: "x" } }],
  ] as const)(
    `%s: reserva; ${FAILURES_TO_OPEN} falhas seguidas abrem o disjuntor`,
    async (_, reply) => {
      const { fetchFn, urls } = fakeLookup(reply);
      const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
      for (let i = 0; i < FAILURES_TO_OPEN; i++) {
        const id = withPreview[i] ?? "";
        await expect(resolver.resolve(id)).resolves.toBe(stored(id));
      }
      await expect(resolver.resolve(C ?? "")).resolves.toBe(stored(C));
      expect(urls).toHaveLength(FAILURES_TO_OPEN); // aberto: a terceira nem consulta
    },
  );

  it("um acerto no meio zera a contagem de falhas", async () => {
    const { fetchFn, urls } = fakeLookup("network", found([B, FRESH]), "network");
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    await resolver.resolve(A ?? "");
    await expect(resolver.resolve(B ?? "")).resolves.toBe(FRESH);
    await resolver.resolve(C ?? "");
    await resolver.resolve(D ?? "");
    expect(urls).toHaveLength(4);
  });

  it.each([403, 429])("HTTP %i abre o disjuntor na hora", async (status) => {
    const { fetchFn, urls } = fakeLookup({ status });
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    await expect(resolver.resolve(A ?? "")).resolves.toBe(stored(A));
    await expect(resolver.resolve(B ?? "")).resolves.toBe(stored(B));
    expect(urls).toHaveLength(1);
  });

  it(`${LOOKUP_TIMEOUT_MS} ms sem resposta: reserva`, async () => {
    const { fetchFn } = fakeLookup("hang");
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    const url = resolver.resolve(A ?? "");
    await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS - 1);
    expect(resolver.peek(A ?? "")).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await expect(url).resolves.toBe(stored(A));
  });

  it("cota por minuto: passou dela, reserva sem consultar; um minuto depois, volta", async () => {
    const { fetchFn, urls } = fakeLookup(found());
    let now = 0;
    const resolver = appleResolver({
      index: real,
      fetchFn,
      budget: lookupBudget({ now: () => now }),
    });
    const ids = withPreview;
    for (const id of ids.slice(0, LOOKUP_QUOTA + 1)) await resolver.resolve(id);
    expect(urls).toHaveLength(LOOKUP_QUOTA);
    now += 60_000;
    await resolver.resolve(ids[LOOKUP_QUOTA + 1] ?? "");
    expect(urls).toHaveLength(LOOKUP_QUOTA + 1);
  });

  it("um 2º lote pedido com o 1º ainda no ar sai numa consulta própria", async () => {
    const { fetchFn, urls } = fakeLookup(found([A, FRESH], [B, FRESH]));
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    const first = resolver.resolve(A ?? "");
    await Promise.resolve(); // a fila do 1º lote já saiu e o lookup está no ar
    const second = resolver.resolve(B ?? "");
    await expect(first).resolves.toBe(FRESH);
    await expect(second).resolves.toBe(FRESH);
    expect(urls).toHaveLength(2);
  });

  it("?failLookup=1: nunca consulta", async () => {
    const { fetchFn, urls } = fakeLookup(found([A, FRESH]));
    const resolver = appleResolver({
      index: real,
      fetchFn,
      budget: lookupBudget({ now: Date.now, disabled: true }),
    });
    resolver.prefetch([A ?? ""]);
    expect(resolver.peek(A ?? "")).toBe(stored(A)); // a reserva já sai na hora
    expect(urls).toHaveLength(0);
  });

  it("dois resolvedores com o mesmo orçamento dividem a cota (P142)", async () => {
    const budget = lookupBudget({ now: () => 0 });
    const chart = fakeLookup(found());
    const artist = fakeLookup(found());
    const one = appleResolver({ index: real, fetchFn: chart.fetchFn, budget });
    const other = appleResolver({ index: real, fetchFn: artist.fetchFn, budget });
    const half = LOOKUP_QUOTA / 2;
    for (const id of withPreview.slice(0, half)) await one.resolve(id);
    for (const id of withPreview.slice(half, LOOKUP_QUOTA + 1)) await other.resolve(id);
    expect(chart.urls).toHaveLength(half);
    expect(artist.urls).toHaveLength(LOOKUP_QUOTA - half); // a última foi à reserva
    expect(other.peek(withPreview[LOOKUP_QUOTA] ?? "")).toBe(stored(withPreview[LOOKUP_QUOTA]));
  });

  it(`${FAILURES_TO_OPEN} falhas seguidas, uma em cada resolvedor, abrem o disjuntor dos dois`, async () => {
    const budget = fresh();
    const chart = fakeLookup("network");
    const artist = fakeLookup("network");
    const one = appleResolver({ index: real, fetchFn: chart.fetchFn, budget });
    const other = appleResolver({ index: real, fetchFn: artist.fetchFn, budget });
    await one.resolve(A ?? "");
    await other.resolve(B ?? "");
    await expect(one.resolve(C ?? "")).resolves.toBe(stored(C));
    await expect(other.resolve(D ?? "")).resolves.toBe(stored(D));
    expect(chart.urls.length + artist.urls.length).toBe(FAILURES_TO_OPEN);
  });

  it("um 429 de um resolvedor abre o disjuntor do outro", async () => {
    const budget = fresh();
    const one = appleResolver({
      index: real,
      fetchFn: fakeLookup({ status: 429 }).fetchFn,
      budget,
    });
    const artist = fakeLookup(found([B, FRESH]));
    const other = appleResolver({ index: real, fetchFn: artist.fetchFn, budget });
    await one.resolve(A ?? "");
    await expect(other.resolve(B ?? "")).resolves.toBe(stored(B));
    expect(artist.urls).toHaveLength(0);
  });

  it("faixa que não é da Apple não consulta e fica sem prévia", async () => {
    const { fetchFn, urls } = fakeLookup(found());
    const resolver = appleResolver({ index: real, fetchFn, budget: fresh() });
    await expect(resolver.resolve("fixture:tr:tr01")).resolves.toBeNull();
    expect(urls).toHaveLength(0);
  });
});
