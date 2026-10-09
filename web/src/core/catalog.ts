// Acesso rápido ao catálogo e respostas aceitas de cada rodada.
import type { Album, Artist, Catalog, Target, Track } from "./types.ts";

export const SUPPORTED_SCHEMA_VERSION = 1;

/** Catálogo de uma versão que este código não conhece: o jogo pede para atualizar a página. */
export class UnsupportedCatalogError extends Error {}

export type CatalogIndex = {
  readonly catalog: Catalog;
  readonly tracks: ReadonlyMap<string, Track>;
  readonly albums: ReadonlyMap<string, Album>;
  readonly artists: ReadonlyMap<string, Artist>;
  readonly tracksBySong: ReadonlyMap<string, readonly Track[]>;
};

export function indexCatalog(catalog: Catalog): CatalogIndex {
  if (catalog.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new UnsupportedCatalogError(
      `catálogo com schemaVersion ${String(catalog.schemaVersion)}; esperado ${SUPPORTED_SCHEMA_VERSION}`,
    );
  }
  const tracksBySong = new Map<string, Track[]>();
  for (const track of catalog.tracks) {
    const group = tracksBySong.get(track.songKey) ?? [];
    group.push(track);
    tracksBySong.set(track.songKey, group);
  }
  return {
    catalog,
    tracks: new Map(catalog.tracks.map((t) => [t.id, t])),
    albums: new Map(catalog.albums.map((a) => [a.id, a])),
    artists: new Map(catalog.artists.map((a) => [a.id, a])),
    tracksBySong,
  };
}

/**
 * IDs que contam como acerto para a faixa que toca. Na Música, toda faixa com o mesmo songKey
 * (single, álbum e "TV Size" da mesma música). No Álbum, todo álbum que contém essa música.
 */
export function acceptedIds(index: CatalogIndex, track: Track, target: Target): string[] {
  const sameSong = index.tracksBySong.get(track.songKey) ?? [track];
  const ids = target === "song" ? sameSong.map((t) => t.id) : sameSong.map((t) => t.albumId);
  return [...new Set(ids)].sort();
}
