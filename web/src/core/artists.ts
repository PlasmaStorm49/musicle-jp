// Modo por artista (M13): o que liga o arquivo de um artista à parada. Puro, como o resto do core.
import { APPLE_PROVIDER, isAppleUrl } from "./apple.ts";
import type { CatalogIndex } from "./catalog.ts";
import { answerAlbums, type PracticeSession } from "./practice.ts";
import { fnv1a32 } from "./prng.ts";
import type { SuperfanRun } from "./superfan.ts";
import type { ArtistCatalog, ArtistList, ArtistListEntry } from "./types.ts";

/**
 * A capa do cartão de um artista na lista (P168) que pode ir para um <img>: na lista real, só no
 * host da Apple (regra 22 do web); nas fixtures, o caminho relativo. Null: o monograma (P171).
 * O índice antigo, ainda no cache do Pages por alguns minutos, vem sem o campo.
 */
export function cardArtwork(list: ArtistList, entry: ArtistListEntry): string | null {
  const url = entry.artworkUrl ?? null;
  if (!url) return null;
  return list.provider !== APPLE_PROVIDER || isAppleUrl("artwork", url) ? url : null;
}

/** Quantas cores tem o monograma (as classes .monogram-0 a .monogram-7 do CSS). */
export const MONOGRAM_COLORS = 8;

/**
 * O monograma do artista sem capa (P171): a 1ª letra do nome (米, 松, Y), inteira mesmo fora do
 * plano básico do Unicode, e uma das cores, fixa pelo id (o nome muda, "Unlimits" virou
 * "UNLIMITS"; o id não).
 */
export function monogram(entry: ArtistListEntry): {
  readonly letter: string;
  readonly color: number;
} {
  const [letter = "?"] = Array.from(entry.name.trim());
  return { letter, color: fnv1a32(entry.id) % MONOGRAM_COLORS };
}

/**
 * A sessão do modo por artista: o artista escolhido e o submodo (P161). A Livre é o Desafio em
 * rodadas sem fim (P125); a do Superfan é uma partida (ME61). Como o Treino, só na memória
 * (P116): recarregar a página volta à lista.
 */
export type ArtistPlay =
  | {
      readonly kind: "free";
      readonly artist: ArtistListEntry;
      readonly session: PracticeSession;
    }
  | { readonly kind: "superfan"; readonly artist: ArtistListEntry; readonly run: SuperfanRun };

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
