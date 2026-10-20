import { useState } from "preact/hooks";
import { cardArtwork, monogram } from "../core/artists.ts";
import type { ArtistList, ArtistListEntry } from "../core/types.ts";

type Props = {
  readonly list: ArtistList;
  readonly entry: ArtistListEntry;
  readonly resolveUrl: (url: string) => string;
};

/**
 * A imagem do cartão do artista na lista (P168): a capa do álbum da música mais popular. Sem
 * capa, ou se ela não carregar, o monograma (P171): a 1ª letra do nome num disco de cor fixa.
 * Decorativa nos dois casos: o nome no cartão já diz quem é.
 */
export function ArtistCover({ list, entry, resolveUrl }: Props) {
  const url = cardArtwork(list, entry);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        class="artist-cover"
        src={resolveUrl(url)}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const { letter, color } = monogram(entry);
  return (
    <span class={`artist-cover monogram monogram-${color}`} aria-hidden="true">
      {letter}
    </span>
  );
}
