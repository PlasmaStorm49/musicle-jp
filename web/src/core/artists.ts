// Modo por artista (M13): o que liga o arquivo de um artista à parada. Puro, como o resto do core.
import type { CatalogIndex } from "./catalog.ts";
import { answerAlbums, type PracticeSession } from "./practice.ts";
import type { ArtistCatalog, ArtistListEntry } from "./types.ts";

/**
 * A sessão do modo por artista: o artista escolhido e as rodadas, as do Desafio (P125). Como o
 * Treino, só na memória (P116): recarregar a página volta à lista.
 */
export type ArtistPlay = { readonly artist: ArtistListEntry; readonly session: PracticeSession };

/** A chave do título de um songKey ("夜に駆ける|apple:ar:1" → "夜に駆ける"). */
export function songTitleKey(songKey: string): string {
  const cut = songKey.lastIndexOf("|");
  return cut < 0 ? songKey : songKey.slice(0, cut);
}

/**
 * As músicas do artista que ficam fora do sorteio porque entregariam um diário de hoje ainda sem
 * resultado (P141). Os índices são diferentes (o songKey do artista termina com ele, o da parada
 * com o principal), então a ponte é o título: sai a música com alguma versão de mesmo título de
 * uma resposta pendente (pega o cover, o crédito "(… from …)" e a participação). Sai também a de
 * um álbum que entregaria a resposta, como no Treino: os ids de álbum são os mesmos da parada.
 * O excesso (um título igual de outra música) dura só até o diário terminar.
 *
 * O sorteio (`drawPractice`) ainda pula, no índice do artista, os álbuns de toda música
 * excluída (`answerAlbums`): as outras músicas desses álbuns e as de um lançamento de mesmo
 * nome que só existe no arquivo do artista também saem. É de propósito, o lado seguro: a
 * revelação mostra o álbum, e o nome dele pode ser o da resposta ("X / Y - EP").
 */
export function excludedForArtist(
  file: ArtistCatalog,
  chart: CatalogIndex,
  pending: ReadonlySet<string>,
): Set<string> {
  if (pending.size === 0) return new Set();
  const titles = new Set([...pending].map(songTitleKey));
  const albums = answerAlbums(chart, pending);
  const out = new Set<string>();
  for (const track of file.tracks) {
    if (track.titleKeys.some((key) => titles.has(key)) || albums.has(track.albumId)) {
      out.add(track.songKey);
    }
  }
  return out;
}
