// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoTimestamp = string;
export type NonEmptyText = string;
export type IsoDate = string;
export type ArtistId = string;
export type OptionalText = string | null;
export type LatinSource = "provider" | "manual" | "cutlet" | "pykakasi" | null;
export type SearchKeys = NonEmptyText[];
export type AlbumId = string;
/**
 * @minItems 1
 */
export type ArtistIds = [ArtistId, ...ArtistId[]];
export type AssetUrl = string;
export type TrackId = string;
export type Rank = number;
export type Eligible =
  | {
      daily: true;
      reason: null;
    }
  | {
      daily: false;
      reason: "no-preview" | "short-preview" | "no-artwork" | "explicit" | "blocked";
    };

/**
 * Contrato entre o pipeline (Python) e o jogo (TypeScript). Gerado só pelo pipeline.
 */
export interface Catalog {
  schemaVersion: 1;
  catalogVersion: string;
  generatedAt: IsoTimestamp;
  provider: string;
  storefront: string;
  /**
   * @minItems 1
   */
  snapshots: [Snapshot, ...Snapshot[]];
  /**
   * @minItems 1
   */
  artists: [Artist, ...Artist[]];
  /**
   * @minItems 1
   */
  albums: [Album, ...Album[]];
  /**
   * @minItems 1
   */
  tracks: [Track, ...Track[]];
}
export interface Snapshot {
  id: NonEmptyText;
  date: IsoDate;
  fetchedAt: IsoTimestamp;
  chart: NonEmptyText;
  size: number;
}
export interface Artist {
  id: ArtistId;
  name: NonEmptyText;
  nameLatin: OptionalText;
  latinSource: LatinSource;
  search: SearchKeys;
}
export interface Album {
  id: AlbumId;
  title: NonEmptyText;
  titleLatin: OptionalText;
  latinSource: LatinSource;
  artistIds: ArtistIds;
  artistDisplay: NonEmptyText;
  type: "single" | "album" | "ep" | "compilation";
  releaseDate: IsoDate;
  artworkUrl: AssetUrl | null;
  /**
   * @maxItems 10
   */
  similar: AlbumId[];
  search: SearchKeys;
}
export interface Track {
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
  isrc: string | null;
  preview: Preview | null;
  chart: Chart;
  popularity: number;
  eligible: Eligible;
  /**
   * @maxItems 10
   */
  similar: TrackId[];
  search: {
    title: SearchKeys;
    artist: SearchKeys;
  };
}
export interface Preview {
  url: AssetUrl;
  durationSec: number | null;
  startSec: number;
}
export interface Chart {
  firstSeen: IsoDate;
  lastSeen: IsoDate;
  bestRank: Rank;
  lastRank: Rank;
  appearances: number;
  inLatest: boolean;
}
