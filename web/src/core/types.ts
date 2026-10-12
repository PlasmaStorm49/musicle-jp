// Tipos do contrato (gerados de shared/schema) e tipos do jogo.

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

/**
 * O modo de jogo (P100), pelo que se adivinha. O nome segue as listas da agenda (`song` e
 * `album`), e cada um tem o seu jeito de responder (MODE_RULES, rules.ts):
 * - "album" é o **Normal**: o álbum ou single, entre 4 opções;
 * - "song" é o **Desafio**: o nome exato da música, digitado.
 */
export type Target = "song" | "album";
