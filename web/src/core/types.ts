// Tipos do contrato (gerados de shared/schema) e tipos do jogo.

export type { ArtistAlbum, ArtistCatalog, ArtistTrack } from "./generated/artist.ts";
export type { ArtistList, ArtistListEntry } from "./generated/artist-list.ts";
export type {
  Album,
  AlbumId,
  Artist,
  ArtistId,
  Catalog,
  Chart,
  Eligible,
  IsoDate,
  Preview,
  Snapshot,
  Track,
  TrackId,
} from "./generated/catalog.ts";
export type { AlbumRound, Day, Schedule, SongRound } from "./generated/schedule.ts";

import type { Album, Artist, Track } from "./generated/catalog.ts";

/**
 * O que o núcleo usa de uma faixa, de um álbum e de um catálogo: a parada e o arquivo de um
 * artista (M13, P140) servem, sem dados inventados. O artista não tem o histórico da parada
 * (chart) nem os distratores do Normal (similar), e nada no núcleo os lê.
 */
export type PlayableTrack = Omit<Track, "chart" | "isrc">;
export type PlayableAlbum = Omit<Album, "similar"> & { readonly similar?: Album["similar"] };
export type PlayableCatalog = {
  readonly provider: string;
  readonly artists: readonly Artist[];
  readonly albums: readonly PlayableAlbum[];
  readonly tracks: readonly PlayableTrack[];
};

/**
 * O modo de jogo (P100), pelo que se adivinha. O nome segue as listas da agenda (`song` e
 * `album`), e cada um tem o seu jeito de responder (MODE_RULES, rules.ts):
 * - "album" é o **Normal**: o álbum ou single, entre 4 opções;
 * - "song" é o **Desafio**: o nome exato da música, digitado.
 */
export type Target = "song" | "album";
