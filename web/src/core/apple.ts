// Regras da parada real (Apple) que o navegador precisa. Puro e sem rede: quem consulta o
// lookup é o resolvedor de prévias (data/previews.ts).
//
// Os hosts espelham pipeline/src/musicle_pipeline/providers/apple.py (HOSTS e is_apple_url). O
// pipeline já confere antes de gravar; a tela confere de novo porque as URLs vão parar em
// <img>, no áudio e num href (um "javascript:" num href executaria código).

export const APPLE_PROVIDER = "apple";

const TRACK_PREFIX = "apple:tr:";

export const LOOKUP_URL = "https://itunes.apple.com/lookup";

export type AppleUrlKind = "preview" | "artwork" | "store";

const HOSTS: Readonly<Record<AppleUrlKind, RegExp>> = {
  preview: /^audio-ssl\.itunes\.apple\.com$/,
  artwork: /^is\d+-ssl\.mzstatic\.com$/,
  store: /^music\.apple\.com$/,
};

const SCHEME = "https://";

/** https, sem usuário nem senha, sem espaço nem barra invertida, com caminho e host da lista. */
export function isAppleUrl(kind: AppleUrlKind, url: string): boolean {
  // O parser de URL do navegador apaga espaços e troca "\" por "/": a checagem vem antes dele.
  if (/[\s\\]/u.test(url) || !url.startsWith(SCHEME)) return false;
  const authority = url.slice(SCHEME.length).split(/[/?#]/, 1)[0] ?? "";
  if (authority.includes("@")) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.pathname !== "/" && HOSTS[kind].test(parsed.hostname);
}

/** Número da faixa no iTunes ("apple:tr:123" → "123"); null se não é faixa da Apple. */
export function appleTrackNumber(id: string): string | null {
  const number = id.startsWith(TRACK_PREFIX) ? id.slice(TRACK_PREFIX.length) : "";
  return /^\d+$/.test(number) ? number : null;
}

/**
 * Lookup em lote, sempre com country=jp (sem ele a Apple omite faixas e romaniza os nomes). Os
 * números vão ordenados: a mesma rodada pede a mesma URL e aproveita o cache de 1 dia da Apple.
 */
export function lookupUrl(numbers: readonly string[]): string {
  const ids = [...new Set(numbers)].sort().join(",");
  return `${LOOKUP_URL}?id=${ids}&country=jp`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Faixa → previewUrl, a partir da resposta do lookup. Fica só o que tem a forma esperada e o
 * host da Apple. Resposta sem a lista `results`: null (vale como falha da consulta).
 */
export function previewsFromLookup(body: unknown): Map<string, string> | null {
  if (!isRecord(body) || !Array.isArray(body.results)) return null;
  const found = new Map<string, string>();
  for (const result of body.results) {
    if (!isRecord(result) || result.wrapperType !== "track") continue;
    const { trackId, previewUrl } = result;
    if (
      Number.isSafeInteger(trackId) &&
      (trackId as number) > 0 &&
      typeof previewUrl === "string" &&
      isAppleUrl("preview", previewUrl)
    ) {
      found.set(`${TRACK_PREFIX}${String(trackId)}`, previewUrl);
    }
  }
  return found;
}
