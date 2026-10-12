// Acesso rápido ao catálogo e respostas aceitas de cada rodada.
import { normalize } from "./normalize.ts";
import type { Album, Artist, Catalog, Target, Track } from "./types.ts";

export const SUPPORTED_SCHEMA_VERSION = 2;

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
 * IDs que contam como acerto para a faixa que toca. No Desafio, toda faixa com o mesmo songKey
 * (single, álbum e "TV Size" da mesma música). No Normal, todo álbum que contém essa música e,
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

/** O nome de um álbum sem o sufixo da loja e as partes dele ("A / B - EP"), normalizados. */
type AlbumName = { readonly whole: string; readonly parts: readonly string[] };

/** Calculado uma vez por catálogo: o acceptedIds roda a cada rodada e a cada sorteio do Treino. */
const albumNames = new WeakMap<CatalogIndex, ReadonlyMap<string, AlbumName>>();

function namesOf(index: CatalogIndex): ReadonlyMap<string, AlbumName> {
  let names = albumNames.get(index);
  if (!names) {
    names = new Map(
      index.catalog.albums.map((album) => {
        const bare = album.title.replace(STORE_SUFFIX, "");
        const parts = bare.split(" / ").map((part) => normalize(part));
        return [album.id, { whole: normalize(bare), parts }];
      }),
    );
    albumNames.set(index, names);
  }
  return names;
}

/**
 * Álbuns que o catálogo não liga à música, mas que valem por ela. O lookup da Apple traz um
 * álbum só por faixa. Do mesmo artista de um álbum certo, vale:
 * - o álbum com a música numa parte do nome: o EP "爆裂愛してる / 好きすぎて滅! - EP" tem
 *   好きすぎて滅!;
 * - o álbum com o nome inteiro de um álbum certo: há dois "ROSE - Single" da HANA, um só com
 *   ROSE e outro com Tiger no lado B. Na tela eles têm o mesmo nome, e recusar um deles seria
 *   injusto, mesmo para a resposta Tiger.
 * Uma parte só do nome de um álbum certo não basta: a resposta 爆裂愛してる, do EP, não está no
 * "好きすぎて滅! - Single". Nome que a normalização esvazia ("♡", só símbolos) nunca casa.
 */
function sameRelease(index: CatalogIndex, track: Track, albums: ReadonlySet<string>): string[] {
  const names = namesOf(index);
  const song = normalize(track.title);
  const wholes = new Set<string>();
  const artists = new Set<string>();
  for (const id of albums) {
    const album = index.albums.get(id);
    const name = names.get(id);
    if (!album || !name) continue;
    if (name.whole !== "") wholes.add(name.whole);
    for (const artist of album.artistIds) artists.add(artist);
  }
  return index.catalog.albums
    .filter((album) => {
      const name = names.get(album.id);
      return (
        name !== undefined &&
        !albums.has(album.id) &&
        album.artistIds.some((artist) => artists.has(artist)) &&
        (wholes.has(name.whole) || (song !== "" && name.parts.includes(song)))
      );
    })
    .map((album) => album.id);
}
