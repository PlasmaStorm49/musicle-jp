import type { ItemView } from "../core/view.ts";

/**
 * Capa pequena de um álbum (P51). alt vazio: o título ao lado já nomeia o álbum, e um alt
 * repetiria o nome para o leitor de tela.
 */
export function Cover({
  item,
  resolveUrl,
}: {
  readonly item: ItemView;
  readonly resolveUrl: (url: string) => string;
}) {
  if (!item.artworkUrl) return null;
  return <img class="cover" src={resolveUrl(item.artworkUrl)} alt="" width={56} height={56} />;
}

/** Título (com lang="ja" quando japonês), romaji menor embaixo (P32) e artista. */
export function ItemLabel({ item }: { readonly item: ItemView }) {
  return (
    <span class="item">
      <span class="item-title" lang={item.lang}>
        {item.title}
      </span>
      {item.titleLatin && <span class="item-latin">{item.titleLatin}</span>}
      <span class="item-artist" lang={item.lang}>
        {item.artist}
      </span>
    </span>
  );
}
