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

/** O que o jogador adivinha: a música (título) ou o álbum. */
export type Target = "song" | "album";

/** Como o jogador responde: escolhendo entre 4 opções ou digitando com autocompletar. */
export type AnswerMode = "choice" | "typing";
