// Busca do autocompletar (modo digitação, alvos Música e Álbum). Compara a consulta, em algumas
// variantes, com as chaves que o pipeline gravou no catálogo (já em searchKey). Tudo
// determinístico: o mesmo texto dá a mesma lista em qualquer máquina e em qualquer ordem do
// catálogo.
import type { CatalogIndex } from "./catalog.ts";
import { hasKana, kanaToRomaji } from "./kana.ts";
import { looseKey, normalize } from "./normalize.ts";
import type { Target } from "./types.ts";

/**
 * `key` identifica a linha para "já tentou": o songKey na Música (todas as versões da música
 * são a mesma linha) e o id do álbum no Álbum.
 */
export type SearchHit = { readonly id: string; readonly key: string };

type SearchEntry = {
  /** O que vai para o palpite: a faixa mais popular do grupo (Música) ou o álbum (Álbum). */
  readonly id: string;
  readonly key: string;
  readonly popularity: number;
  readonly title: readonly string[];
  readonly artist: readonly string[];
  /** As mesmas chaves sem ー, para quem não digita o traço de alongar ("かてん"). */
  readonly titleNoBar: readonly string[];
  readonly artistNoBar: readonly string[];
};

export type SearchIndex = { readonly entries: readonly SearchEntry[] };

const DEFAULT_LIMIT = 8;

const LONG_MARK = /ー/g;
const stripBar = (s: string): string => s.replace(LONG_MARK, "");
const unique = (keys: readonly string[]): string[] => [...new Set(keys)].filter((k) => k !== "");

/** Comparação por code unit (<), igual em qualquer locale; localeCompare variaria. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A `key` da linha de um palpite já feito, para marcar "já tentou" na lista. */
export function hitKey(index: CatalogIndex, target: Target, guessId: string): string {
  return target === "song" ? (index.tracks.get(guessId)?.songKey ?? guessId) : guessId;
}

function entry(
  id: string,
  key: string,
  popularity: number,
  titleKeys: readonly string[],
  artistKeys: readonly string[],
): SearchEntry {
  const title = unique(titleKeys);
  const artist = unique(artistKeys);
  return {
    id,
    key,
    popularity,
    title,
    artist,
    titleNoBar: unique(title.map(stripBar)),
    artistNoBar: unique(artist.map(stripBar)),
  };
}

/**
 * Música: uma entrada por songKey (single, versão de álbum e "TV Size" viram uma linha só,
 * porque qualquer uma é acerto), com a união das chaves do grupo.
 * Álbum: uma entrada por álbum; artistas pelas chaves de cada artista; popularidade = a da
 * faixa mais popular do álbum (o mesmo critério do pipeline, similarity.py).
 */
export function buildSearchIndex(index: CatalogIndex, target: Target): SearchIndex {
  if (target === "album") {
    const popularity = new Map<string, number>();
    for (const t of index.catalog.tracks) {
      popularity.set(t.albumId, Math.max(popularity.get(t.albumId) ?? 0, t.popularity));
    }
    const entries = index.catalog.albums.map((album) =>
      entry(
        album.id,
        album.id,
        popularity.get(album.id) ?? 0,
        album.search,
        album.artistIds.flatMap((id) => index.artists.get(id)?.search ?? []),
      ),
    );
    return { entries };
  }
  const entries: SearchEntry[] = [];
  for (const [songKey, group] of index.tracksBySong) {
    const rep = group.reduce((best, t) =>
      t.popularity > best.popularity ||
      (t.popularity === best.popularity && byCodeUnit(t.id, best.id) < 0)
        ? t
        : best,
    );
    entries.push(
      entry(
        rep.id,
        songKey,
        rep.popularity,
        group.flatMap((t) => t.search.title),
        group.flatMap((t) => t.search.artist),
      ),
    );
  }
  return { entries };
}

type Variant = {
  readonly text: string;
  /** Sem a última letra: casa pior que a consulta inteira. */
  readonly truncated: boolean;
  /**
   * Comparada com as chaves sem ー: também casa pior que a exata, senão "るーる" poria uma
   * "ルル" mais popular antes de "ルール".
   */
  readonly noBar: boolean;
};

// Letras cuja leitura só se decide na letra seguinte: o Kunrei (ti → chi, tu → tsu, zi → ji,
// di → ji, du → zu, hu → fu) e o m antes de b/p (→ n). No meio da digitação, "sakamit" ainda
// não virou "sakamichi" e deixaria de ser prefixo; sem a última letra, volta a ser. O h depois
// de s ou c fica: "sh" e "ch" já são prefixo de "shi" e "chi".
const PENDING_END = /(?:[tzdm]|(?<![sc])h)$/;

function withoutPendingEnd(text: string): string | undefined {
  const cps = [...text];
  if (cps.length < 2 || !PENDING_END.test(text)) return undefined;
  return cps.slice(0, -1).join("");
}

function variantsOf(query: string): Variant[] {
  const normalized = normalize(query);
  const base = looseKey(normalized); // = searchKey(query), sem normalizar duas vezes
  // Vazia, só símbolo (♡) ou só ー: não há o que buscar.
  if (stripBar(base) === "") return [];
  const exact = [base];
  // Kana vira romaji: "とうきょう" acha "tokyo" e "かあてん" acha "katenkoru".
  if (hasKana(normalized)) exact.push(looseKey(kanaToRomaji(normalized)));
  const candidates: Variant[] = [
    ...exact.map((text) => ({ text, truncated: false, noBar: false })),
    ...exact.flatMap((text) => {
      const cut = withoutPendingEnd(text);
      return cut === undefined ? [] : [{ text: cut, truncated: true, noBar: false }];
    }),
    { text: stripBar(base), truncated: false, noBar: true },
  ];
  // As exatas vêm antes: numa repetição, fica a exata.
  const seen = new Set<string>();
  return candidates.filter((v) => {
    const key = `${v.noBar ? "-" : "+"}${v.text}`;
    if (v.text === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Faixa do casamento (menor é melhor): 0 título começa com a consulta, 1 artista começa,
 * 2 título contém, 3 artista contém. "Contém" exige 2+ letras: uma letra só no meio de uma
 * palavra casaria com quase tudo.
 */
function bandOf(entry: SearchEntry, v: Variant): number | undefined {
  const title = v.noBar ? entry.titleNoBar : entry.title;
  const artist = v.noBar ? entry.artistNoBar : entry.artist;
  if (title.some((k) => k.startsWith(v.text))) return 0;
  if (artist.some((k) => k.startsWith(v.text))) return 1;
  if ([...v.text].length < 2) return undefined;
  if (title.some((k) => k.includes(v.text))) return 2;
  if (artist.some((k) => k.includes(v.text))) return 3;
  return undefined;
}

/**
 * Sugestões para a consulta, da melhor para a pior: faixa do casamento, exata antes de
 * truncada, popularidade decrescente e id crescente. Busca no catálogo inteiro, inclusive
 * faixas que não podem ser sorteadas: o jogador pode chutar qualquer música.
 */
export function search(idx: SearchIndex, query: string, limit = DEFAULT_LIMIT): SearchHit[] {
  const variants = variantsOf(query);
  if (variants.length === 0) return [];
  const hits: { readonly entry: SearchEntry; readonly rank: number }[] = [];
  for (const entry of idx.entries) {
    let best: number | undefined;
    for (const v of variants) {
      const band = bandOf(entry, v);
      if (band === undefined) continue;
      // Na mesma faixa, a exata (par) vence a truncada ou sem ー (ímpar); faixa melhor vence sempre.
      const rank = band * 2 + (v.truncated || v.noBar ? 1 : 0);
      if (best === undefined || rank < best) best = rank;
    }
    if (best !== undefined) hits.push({ entry, rank: best });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.entry.popularity - a.entry.popularity ||
      byCodeUnit(a.entry.id, b.entry.id),
  );
  return hits.slice(0, Math.max(0, limit)).map(({ entry }) => ({ id: entry.id, key: entry.key }));
}
