// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoTimestamp = string;
export type NonEmptyText = string;
export type FranchiseId = string;
export type ArtistId = string;
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
export type Tier = "facil" | "medio" | "dificil" | null;

/**
 * As músicas de anime (M14): o áudio é a prévia da Apple, e as fontes de anime só dão dados (P251). Gerado só pelo pipeline (build-anime). Os $defs comuns são cópias dos do catálogo (um teste confere).
 */
export interface AnimeCatalog {
  schemaVersion: 1;
  catalogVersion: string;
  generatedAt: IsoTimestamp;
  provider: string;
  storefront: string;
  /**
   * @minItems 1
   */
  snapshots: [Source, ...Source[]];
  /**
   * @minItems 1
   */
  franchises: [AnimeFranchise, ...AnimeFranchise[]];
  /**
   * @minItems 1
   */
  artists: [Artist, ...Artist[]];
  /**
   * @minItems 1
   */
  albums: [AnimeAlbum, ...AnimeAlbum[]];
  /**
   * @minItems 1
   */
  tracks: [AnimeTrack, ...AnimeTrack[]];
}
/**
 * Um snapshot da busca do Anime (fetch --anime): pode haver mais de um por dia.
 */
export interface Source {
  id: NonEmptyText;
  fetchedAt: IsoTimestamp;
}
/**
 * A resposta do "acertar o anime" (P234): vale qualquer temporada ou sequência. As chaves de busca vêm de todos os títulos e sinônimos dos animes dela.
 */
export interface AnimeFranchise {
  id: FranchiseId;
  name: NonEmptyText;
  /**
   * @minItems 1
   */
  search: [NonEmptyText, ...NonEmptyText[]];
}
export interface Artist {
  id: ArtistId;
  name: NonEmptyText;
  nameLatin: OptionalText;
  latinSource: LatinSource;
}
/**
 * Como o álbum do catálogo, sem os distratores (o Anime é só digitado).
 */
export interface AnimeAlbum {
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
 * Como a faixa do catálogo, sem o histórico da parada (chart) nem o isrc, e com os dados do anime.
 */
export interface AnimeTrack {
  id: TrackId;
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
  /**
   * Página da faixa na loja (link "Ouvir no Apple Music" da revelação); null sem loja.
   */
  storeUrl: AssetUrl | null;
  popularity: number;
  eligible: Eligible;
  /**
   * Chaves da busca do Desafio (digitação).
   */
  search: {
    title: SearchKeys;
    artist: SearchKeys;
  };
  /**
   * De que anime a música é, e a faixa de dificuldade de cada modo (null: não entra nesse modo).
   */
  anime: {
    /**
     * @minItems 1
     */
    franchiseIds: [FranchiseId, ...FranchiseId[]];
    /**
     * @minItems 1
     */
    themes: [
      {
        anime: NonEmptyText;
        type: "OP" | "ED" | "IN";
        sequence: number | null;
      },
      ...{
        anime: NonEmptyText;
        type: "OP" | "ED" | "IN";
        sequence: number | null;
      }[]
    ];
    tiers: {
      musica: Tier;
      titulo: Tier;
    };
    /**
     * Muito conhecida em cada modo, a régua das Misturadas (M17): a chance de acertar a partir do corte fixo (FAMOUS_CUTS), dentro do Fácil do modo. Só sim ou não, sem número (P240, P254).
     */
    famous?: {
      musica: boolean;
      titulo: boolean;
    };
  };
}
export interface Preview {
  url: AssetUrl;
  durationSec: number | null;
  startSec: number;
}
