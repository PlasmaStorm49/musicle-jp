// O que a tela mostra de cada opção e da revelação. Função pura: os componentes só desenham.
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
};

export type RevealView = ItemView & {
  readonly albumTitle: string;
  readonly explicit: boolean;
  readonly preview: {
    readonly url: string;
    readonly startSec: number;
    readonly durationSec: number;
  } | null;
};

function latinIfDifferent(title: string, latin: string | null): string | null {
  return latin && searchKey(latin) !== searchKey(title) ? latin : null;
}

function langOf(text: string): "ja" | undefined {
  return JAPANESE.test(text) ? "ja" : undefined;
}

/** Uma opção do modo 4 opções: faixa (Música) ou álbum (Álbum). */
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
      artworkUrl: album?.artworkUrl ?? null,
      lang: langOf(track.title),
    };
  }
  const album = index.albums.get(id);
  if (!album) return null;
  return {
    id,
    title: album.title,
    titleLatin: latinIfDifferent(album.title, album.titleLatin),
    artist: album.artistDisplay,
    artworkUrl: album.artworkUrl,
    lang: langOf(album.title),
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
    explicit: track.explicit,
    preview: track.preview
      ? {
          url: track.preview.url,
          startSec: track.preview.startSec,
          durationSec: track.preview.durationSec ?? 30,
        }
      : null,
  };
}
