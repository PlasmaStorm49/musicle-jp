// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoDate = string;
export type TrackId = string;

/**
 * As 3 dificuldades de cada dia do Anime Royale (o usuário, 01/11/2026): em cada uma, 5 músicas tocam e a pessoa as marca entre 9 opções, cada opção mostrada pela capa do anime dela. Usa o catálogo do Anime. Só cresce: um dia gravado nunca muda. Gerado só pelo pipeline (comando schedule-royale).
 */
export interface RoyaleSchedule {
  schemaVersion: 1;
  /**
   * Distingue a agenda do Royale das outras (o schedule-check despacha pelo tipo).
   */
  kind: "anime-royale";
  timezone: "America/Sao_Paulo";
  epoch: IsoDate;
  days: {
    [k: string]: RoyaleDay;
  };
}
/**
 * Uma rodada por dificuldade (a faixa do acertar o anime, o tiers.titulo do catálogo).
 */
export interface RoyaleDay {
  number: number;
  catalogVersion: string;
  facil: RoyaleRound;
  medio: RoyaleRound;
  dificil: RoyaleRound;
}
/**
 * As 5 que tocam, na ordem, e as 9 opções, embaralhadas: as 5 e 4 erradas, cada uma de um anime diferente (o pipeline confere).
 */
export interface RoyaleRound {
  /**
   * @minItems 5
   * @maxItems 5
   */
  played: [TrackId, TrackId, TrackId, TrackId, TrackId];
  /**
   * @minItems 9
   * @maxItems 9
   */
  options: [TrackId, TrackId, TrackId, TrackId, TrackId, TrackId, TrackId, TrackId, TrackId];
}
