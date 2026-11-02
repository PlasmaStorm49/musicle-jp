// As capas dos animes (o Anime Royale, o usuário, 01/11/2026): o catálogo do Anime guarda só o
// caminho de cada arquivo no AnimeThemes, e a URL se monta aqui, com a base num lugar só. É a 3ª
// conferência do caminho (regra 5 da raiz), com o mesmo padrão do `anime_covers.py` e do
// `check-anime-pr.sh`: o caminho vai para o `src` de uma imagem.
import { APPLE_PROVIDER } from "./apple.ts";

/** O host das capas do AnimeThemes (a pesquisa de 01/11/2026): um bucket R2 da Cloudflare. */
export const ANIMETHEMES_COVER_BASE = "https://pub-92474f7785774e91a790e086dfa6b2ef.r2.dev/";

/** As duas capas de cada anime: a pequena (100 px, a grade) e a grande (460 px, o pop-up). */
export type CoverSize = "small" | "large";

/** A capa de um tema, como o catálogo a guarda. */
export type CoverPaths = { readonly small: string; readonly large: string };

// O caminho de cada provedor: o do AnimeThemes (letras e números) e o das capas falsas das
// fixtures (o slug, em SVG). Sem "..", "//", esquema nem quebra de linha: o `$` do JavaScript sem
// a flag `m` só casa no fim do texto.
const PATHS: Readonly<Record<string, RegExp>> = {
  [APPLE_PROVIDER]: /^anime\/(small|large)-cover\/[A-Za-z0-9]+\.(?:avif|png|jpe?g|webp)$/,
  fixture: /^anime\/(small|large)-cover\/[a-z0-9_]+\.svg$/,
};

/**
 * A URL da capa `size`, ou null quando o caminho sai do padrão do provedor (a tela mostra o cartão
 * com o nome). Na Apple, a URL do AnimeThemes; nas fixtures, um caminho relativo a `fixtures/`,
 * que quem chama resolve contra a base do site (`resolveUrl`).
 */
export function coverUrl(
  provider: string,
  cover: CoverPaths | null,
  size: CoverSize,
): string | null {
  if (!cover) return null;
  const path = cover[size];
  const pattern = Object.hasOwn(PATHS, provider) ? PATHS[provider] : undefined;
  const match = pattern?.exec(path);
  if (!match || match[1] !== size) return null;
  return provider === APPLE_PROVIDER ? `${ANIMETHEMES_COVER_BASE}${path}` : `fixtures/${path}`;
}
