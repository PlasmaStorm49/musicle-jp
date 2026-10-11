// Acesso rápido ao catálogo e respostas aceitas de cada rodada.
import { normalize } from "./normalize.ts";
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
 * (single, álbum e "TV Size" da mesma música). No Álbum, todo álbum que contém essa música e,
 * do mesmo artista, o álbum com o mesmo nome ou com a música no nome (`sameRelease`).
 */
export function acceptedIds(index: CatalogIndex, track: Track, target: Target): string[] {
  const sameSong = index.tracksBySong.get(track.songKey) ?? [track];
  if (target === "song") return [...new Set(sameSong.map((t) => t.id))].sort();
  const albums = new Set(sameSong.map((t) => t.albumId));
  for (const id of sameRelease(index, track, albums)) albums.add(id);
  return [...albums].sort();
}

const STORE_SUFFIX = / - (?:Single|EP)$/;

/** O nome de um álbum sem o sufixo da loja, normalizado. */
const baseTitle = (title: string) => normalize(title.replace(STORE_SUFFIX, ""));

/** As partes do nome: "A / B - EP" junta duas músicas. */
const titleParts = (title: string) =>
  title
    .replace(STORE_SUFFIX, "")
    .split(" / ")
    .map((part) => normalize(part));

/**
 * Álbuns que o catálogo não liga à música, mas que a têm. O lookup da Apple traz um álbum só
 * por faixa: o EP "爆裂愛してる / 好きすぎて滅! - EP" tem 好きすぎて滅!, e há dois "ROSE - Single"
 * da HANA. Sem isto, quem escolhe o outro na digitação erra com a resposta certa. Vale o álbum
 * de um artista dos álbuns certos com o nome inteiro de um deles ou com a música numa parte do
 * nome. Uma parte só de um álbum certo não basta: a resposta 爆裂愛してる, do EP, não está no
 * "好きすぎて滅! - Single".
 */
function sameRelease(index: CatalogIndex, track: Track, albums: ReadonlySet<string>): string[] {
  const song = normalize(track.title);
  const names = new Set<string>();
  const artists = new Set<string>();
  for (const id of albums) {
    const album = index.albums.get(id);
    if (!album) continue;
    names.add(baseTitle(album.title));
    for (const artist of album.artistIds) artists.add(artist);
  }
  return index.catalog.albums
    .filter(
      (album) =>
        !albums.has(album.id) &&
        album.artistIds.some((artist) => artists.has(artist)) &&
        (names.has(baseTitle(album.title)) || titleParts(album.title).includes(song)),
    )
    .map((album) => album.id);
}
