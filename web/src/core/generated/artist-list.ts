// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type ArtistId = string;
export type NonEmptyText = string;
export type OptionalText = string | null;
export type AssetUrl = string;

/**
 * O índice do modo por artista (M13): os artistas da lista principal na ordem da curadoria (artists.toml) e, depois, os de cada seção, em ordem alfabética (P200, P201), com o arquivo de cada um. Gerado só pelo pipeline (build-artists).
 */
export interface ArtistList {
  schemaVersion: 1;
  provider: string;
  storefront: string;
  /**
   * @minItems 1
   */
  artists: [ArtistListEntry, ...ArtistListEntry[]];
}
export interface ArtistListEntry {
  id: ArtistId;
  name: NonEmptyText;
  nameLatin: OptionalText;
  /**
   * Arquivo do artista, na mesma pasta do índice.
   */
  file: string;
  songs: number;
  /**
   * A capa do cartão da lista (P168): a do álbum da música mais popular, de preferência um álbum só do artista; sempre a capa de um álbum do arquivo dele. Null sem capa (a tela mostra o monograma, P171).
   */
  artworkUrl: AssetUrl | null;
  /**
   * A seção da lista (P200): ausente na principal, dos artistas japoneses; "foreign" na de fora do Japão. Campo só de acréscimo, sem versão nova: o site antigo o ignora e mostra todos numa lista só.
   */
  section?: "foreign";
}
