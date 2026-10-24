// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoDate = string;
/**
 * As 4 rodadas: 2, 2, 2 e 3 músicas (o pipeline confere a conta).
 *
 * @minItems 4
 * @maxItems 4
 */
export type MixedRounds = [MixedRound, MixedRound, MixedRound, MixedRound];
export type TrackId = string;

/**
 * Os 2 diários de cada dia das Misturadas (M17): acertar a música e acertar o anime, de 4 rodadas cada, com 2, 2, 2 e 3 músicas tocando juntas (P325). Usa o catálogo do Anime. Só cresce: um dia gravado nunca muda. Gerado só pelo pipeline (comando schedule-mixed).
 */
export interface MixedSchedule {
  schemaVersion: 1;
  /**
   * Distingue a agenda das Misturadas das outras (o schedule-check despacha pelo tipo).
   */
  kind: "anime-mixed";
  timezone: "America/Sao_Paulo";
  epoch: IsoDate;
  days: {
    [k: string]: MixedDay;
  };
}
/**
 * O diário do modo musica (acertar a música) e o do modo titulo (acertar o anime).
 */
export interface MixedDay {
  number: number;
  catalogVersion: string;
  musica: MixedRounds;
  titulo: MixedRounds;
}
/**
 * As faixas que tocam juntas, de franquias diferentes. No acertar o anime, cada resposta é a franquia da faixa (P234).
 */
export interface MixedRound {
  /**
   * @minItems 2
   * @maxItems 3
   */
  answers: [TrackId, TrackId, ...TrackId[]];
}
