// O que a tela mostra de cada opção e da revelação. Função pura: os componentes só desenham.
import { APPLE_PROVIDER, isAppleUrl } from "./apple.ts";
import type { CatalogIndex } from "./catalog.ts";
import { searchKey } from "./normalize.ts";
import type { Target } from "./types.ts";

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export type ItemView = {
  readonly id: string;
  readonly title: string;
  /** Romaji ou título oficial em latim; só quando é de fato diferente do título (P32). */
  readonly titleLatin: string | null;
  readonly artist: string;
  readonly artworkUrl: string | null;
  /** "ja" quando o título tem kana ou kanji: leitores de tela pronunciam em japonês. */
  readonly lang: "ja" | undefined;
  /** O mesmo para o artista, que tem o seu: "IRIS OUT" é de 米津玄師. */
  readonly artistLang: "ja" | undefined;
};

export type RevealView = ItemView & {
  readonly albumTitle: string;
  readonly albumLang: "ja" | undefined;
  readonly explicit: boolean;
  readonly preview: {
    readonly url: string;
    readonly startSec: number;
    readonly durationSec: number;
  } | null;
  /** Link da música na loja (P69), só no host da Apple: vai parar num href. */
  readonly storeUrl: string | null;
};

function latinIfDifferent(title: string, latin: string | null): string | null {
  return latin && searchKey(latin) !== searchKey(title) ? latin : null;
}

function langOf(text: string): "ja" | undefined {
  return JAPANESE.test(text) ? "ja" : undefined;
}

/** Capa que vai para um <img>: na parada real, só no host da Apple (as fixtures são relativas). */
function artworkOf(index: CatalogIndex, url: string | null | undefined): string | null {
  if (!url) return null;
  return index.catalog.provider !== APPLE_PROVIDER || isAppleUrl("artwork", url) ? url : null;
}

/** Um item na tela: faixa (tentativa do Desafio) ou álbum (opção do Normal). */
export function optionView(index: CatalogIndex, id: string, target: Target): ItemView | null {
  if (target === "song") {
    const track = index.tracks.get(id);
    if (!track) return null;
    const album = index.albums.get(track.albumId);
    return {
      id,
      title: track.title,
      titleLatin: latinIfDifferent(track.title, track.titleLatin),
      artist: track.artistDisplay,
      artworkUrl: artworkOf(index, album?.artworkUrl),
      lang: langOf(track.title),
      artistLang: langOf(track.artistDisplay),
    };
  }
  const album = index.albums.get(id);
  if (!album) return null;
  return {
    id,
    title: album.title,
    titleLatin: latinIfDifferent(album.title, album.titleLatin),
    artist: album.artistDisplay,
    artworkUrl: artworkOf(index, album.artworkUrl),
    lang: langOf(album.title),
    artistLang: langOf(album.artistDisplay),
  };
}

/** Cartão da resposta: sempre a faixa que tocou, com o álbum dela. */
export function revealView(index: CatalogIndex, trackId: string): RevealView | null {
  const track = index.tracks.get(trackId);
  if (!track) return null;
  const album = index.albums.get(track.albumId);
  const base = optionView(index, trackId, "song");
  if (!base) return null;
  return {
    ...base,
    albumTitle: album?.title ?? "",
    albumLang: langOf(album?.title ?? ""),
    explicit: track.explicit,
    preview: track.preview
      ? {
          url: track.preview.url,
          startSec: track.preview.startSec,
          durationSec: track.preview.durationSec ?? 30,
        }
      : null,
    storeUrl: track.storeUrl && isAppleUrl("store", track.storeUrl) ? track.storeUrl : null,
  };
}
