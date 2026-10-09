import type { ItemView } from "../core/view.ts";

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
