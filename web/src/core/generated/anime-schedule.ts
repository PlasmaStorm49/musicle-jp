// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoDate = string;
/**
 * @minItems 3
 * @maxItems 3
 */
export type AnimeRounds = [AnimeRound, AnimeRound, AnimeRound];
export type TrackId = string;

/**
 * Os 6 diários de cada dia do Anime (M14): 2 modos (acertar a música e acertar o anime) × 3 dificuldades, de 3 rodadas digitadas cada (P231, P232). Só cresce: um dia gravado nunca muda. Gerado só pelo pipeline (comando schedule-anime).
 */
export interface AnimeSchedule {
  schemaVersion: 1;
  /**
   * Distingue a agenda do Anime da dos Hits (o schedule-check despacha pelo tipo).
   */
  kind: "anime";
  timezone: "America/Sao_Paulo";
  epoch: IsoDate;
  days: {
    [k: string]: AnimeDay;
  };
}
/**
 * Os diários do modo musica (acertar a música) e do modo titulo (acertar o anime).
 */
export interface AnimeDay {
  number: number;
  catalogVersion: string;
  musica: AnimeModeDailies;
  titulo: AnimeModeDailies;
}
/**
 * Um diário por dificuldade (P232).
 */
export interface AnimeModeDailies {
  facil: AnimeRounds;
  medio: AnimeRounds;
  dificil: AnimeRounds;
}
/**
 * A faixa tocada. No acertar o anime, a resposta é a franquia dela (P234).
 */
export interface AnimeRound {
  answer: TrackId;
}
