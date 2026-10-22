import type { ItemView } from "../core/view.ts";
import { t } from "../i18n/t.ts";

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

/**
 * Título (com lang="ja" quando japonês), romaji menor embaixo (P32) e artista, com o latino dele
 * na mesma linha (ME55). O separador é só visual; os espaços ficam fora dele, para o leitor de
 * tela não colar os dois nomes ("月見坂46Tsukimizaka46").
 */
export function ItemLabel({ item }: { readonly item: ItemView }) {
  return (
    <span class="item">
      <span class="item-title" lang={item.lang}>
        {item.title}
      </span>
      {item.titleLatin && <span class="item-latin">{item.titleLatin}</span>}
      {/* A franquia do Anime não tem artista: sem a linha vazia. */}
      {item.artist !== "" && (
        <span class="item-artist">
          <span lang={item.artistLang}>{item.artist}</span>
          {item.artistLatin && (
            <>
              {" "}
              <span aria-hidden="true">{t("item.artistSeparator")}</span>{" "}
              <span>{item.artistLatin}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
