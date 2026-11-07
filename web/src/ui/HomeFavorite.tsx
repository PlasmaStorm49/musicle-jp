// A medalha em destaque na Início (o usuário, 07/11/2026): grande e com a capa, no lugar da da nav,
// que some nesta tela. No celular, no cabeçalho, à direita do nome; a partir de 1100 px, na margem
// ao lado da coluna, com o nome e o feito embaixo (o CSS troca, com o mesmo DOM).
import { ROUTES } from "../core/routes.ts";
import { t } from "../i18n/t.ts";
import { LatinName } from "./ArtistName.tsx";
import { MedalArt, medalWidth } from "./MedalArt.tsx";
import type { NoticeItem } from "./MedalNotice.tsx";

/**
 * A altura da maior delas, a da margem, igual à do `.home-favorite svg` do styles.css (a partir de
 * 1100 px); o CSS a reduz no cabeçalho (96 e 72 px).
 */
export const HOME_FAVORITE_HEIGHT = 200;

/**
 * Um link só para as Medalhas: o leitor de tela ouve o `aria-label` (o nome, o artista e o feito)
 * uma vez, e o desenho e a legenda são decorativos.
 */
export function HomeFavorite({ item }: { readonly item: NoticeItem }) {
  return (
    <a
      class="home-favorite"
      href={ROUTES.medals}
      aria-label={t("favorite.link", { name: item.spoken })}
    >
      <MedalArt
        kind={item.kind}
        art={item.art}
        earned
        size={medalWidth(item.kind, HOME_FAVORITE_HEIGHT)}
        icon={item.id}
      />
      <span class="home-favorite-caption" aria-hidden="true">
        {item.label ? (
          <>
            <span class="home-favorite-name">
              <LatinName name={item.label.name} latin={item.label.latin} stacked />
            </span>
            {item.feat && (
              <span class="home-favorite-feat">
                {item.label.artist
                  ? t("medals.notice.named", { name: item.feat, artist: item.label.artist })
                  : item.feat}
              </span>
            )}
          </>
        ) : (
          <span class="home-favorite-name">{item.name}</span>
        )}
      </span>
    </a>
  );
}
