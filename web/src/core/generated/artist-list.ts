// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type ArtistId = string;
export type NonEmptyText = string;
export type OptionalText = string | null;

/**
 * O índice do modo por artista (M13): os artistas na ordem da curadoria (artists.toml) e o arquivo de cada um. Gerado só pelo pipeline (build-artists).
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
}
