// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoDate = string;
export type TrackId = string;
export type AlbumId = string;

/**
 * Só cresce: um dia gravado nunca muda. Gerado só pelo pipeline (comando schedule).
 */
export interface Schedule {
  schemaVersion: 1;
  timezone: "America/Sao_Paulo";
  epoch: IsoDate;
  days: {
    [k: string]: Day;
  };
}
export interface Day {
  number: number;
  catalogVersion: string;
  /**
   * @minItems 3
   * @maxItems 3
   */
  song: [SongRound, SongRound, SongRound];
  /**
   * @minItems 3
   * @maxItems 3
   */
  album: [AlbumRound, AlbumRound, AlbumRound];
}
/**
 * Rodada do Desafio (digitação). Só os dias de antes dos dois modos (P100) têm options, que o jogo ignora.
 */
export interface SongRound {
  answer: TrackId;
  /**
   * @minItems 4
   * @maxItems 4
   */
  options?: [TrackId, TrackId, TrackId, TrackId];
}
/**
 * Rodada do Normal: a resposta é o álbum da faixa, entre as 4 opções.
 */
export interface AlbumRound {
  answer: TrackId;
  /**
   * @minItems 4
   * @maxItems 4
   */
  options: [AlbumId, AlbumId, AlbumId, AlbumId];
}
