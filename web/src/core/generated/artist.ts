// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type ArtistId = string;
export type IsoTimestamp = string;
export type NonEmptyText = string;
export type OptionalText = string | null;
export type LatinSource = "provider" | "manual" | "cutlet" | null;
export type AlbumId = string;
/**
 * @minItems 1
 */
export type ArtistIds = [ArtistId, ...ArtistId[]];
export type IsoDate = string;
export type AssetUrl = string;
export type TrackId = string;
export type Eligible =
  | {
      daily: true;
      reason: null;
    }
  | {
      daily: false;
      reason: "no-preview" | "short-preview" | "no-artwork" | "explicit" | "blocked";
    };
export type SearchKeys = NonEmptyText[];

/**
 * As músicas de um artista para o modo por artista (M13): uma faixa por música. Gerado só pelo pipeline (build-artists). Os $defs comuns são cópias dos do catálogo (um teste confere).
 */
export interface ArtistCatalog {
  schemaVersion: 1;
  provider: string;
  storefront: string;
  artistId: ArtistId;
  fetchedAt: IsoTimestamp;
  /**
   * @minItems 1
   */
  artists: [Artist, ...Artist[]];
  /**
   * @minItems 1
   */
  albums: [ArtistAlbum, ...ArtistAlbum[]];
  /**
   * @minItems 1
   * @maxItems 200
   */
  tracks: [ArtistTrack, ...ArtistTrack[]];
}
export interface Artist {
  id: ArtistId;
  name: NonEmptyText;
  nameLatin: OptionalText;
  latinSource: LatinSource;
}
/**
 * Como o álbum do catálogo, sem os distratores (o modo por artista é só digitado).
 */
export interface ArtistAlbum {
  id: AlbumId;
  title: NonEmptyText;
  titleLatin: OptionalText;
  latinSource: LatinSource;
  artistIds: ArtistIds;
  artistDisplay: NonEmptyText;
  type: "single" | "album" | "ep" | "compilation";
  releaseDate: IsoDate;
  artworkUrl: AssetUrl | null;
}
/**
 * Como a faixa do catálogo, sem o histórico da parada (chart) nem o isrc.
 */
export interface ArtistTrack {
  id: TrackId;
  /**
   * Chave do título dentro do artista + | + o artista do arquivo (não o principal da faixa: a participação também é dele).
   */
  songKey: string;
  title: NonEmptyText;
  titleLatin: OptionalText;
  latinSource: LatinSource;
  artistIds: ArtistIds;
  artistDisplay: NonEmptyText;
  albumId: AlbumId;
  releaseDate: IsoDate;
  durationMs: number;
  explicit: boolean;
  preview: Preview | null;
  storeUrl: AssetUrl | null;
  /**
   * Ordem da música no artista: 1 é a primeira (a melhor posição no lookup de músicas da loja), e cai até 1/N. A busca ordena as sugestões por ela.
   */
  popularity: number;
  eligible: Eligible;
  /**
   * Chaves da busca: só o título, sem artista nem álbum (o modo por artista busca só pelo nome da música).
   */
  search: {
    title: SearchKeys;
    /**
     * @maxItems 0
     */
    artist: [];
  };
  /**
   * A chave do título (title_key, a mesma do songKey da parada) de todas as versões da música e a chave do grupo: o jogo tira do sorteio a música que é resposta pendente dos diários de hoje.
   *
   * @minItems 1
   */
  titleKeys: [NonEmptyText, ...NonEmptyText[]];
}
export interface Preview {
  url: AssetUrl;
  durationSec: number | null;
  startSec: number;
}
