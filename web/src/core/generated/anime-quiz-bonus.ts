// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type TrackId = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [unknown, unknown];

/**
 * As rodadas bônus do dia da estreia do quiz do dia (M18; o usuário, 25/10/2026): 3 rodadas, cada uma com uma pergunta de outro tipo, para mostrar a variedade do modo. Não contam no resultado. Um arquivo só, ao lado do catálogo do Anime. Gerado só pelo pipeline (comando quiz-bonus). O dado da revelação é o mesmo do anime-quiz.schema.json (o `info` de lá): mudou um, muda o outro.
 */
export interface QuizBonus {
  schemaVersion: 1;
  kind: "anime-quiz-bonus";
  /**
   * O dia da estreia: só nele o bônus aparece.
   */
  date: string;
  catalogVersion: string;
  /**
   * Se os dados do MAL estavam na geração (P380).
   */
  mal: boolean;
  /**
   * @minItems 3
   * @maxItems 3
   */
  rounds: [QuizBonusRound, QuizBonusRound, QuizBonusRound];
}
/**
 * A pergunta da rodada (a família, a direção e o parâmetro, como no dia do quiz), as duas faixas, a resposta e o dado da revelação.
 */
export interface QuizBonusRound {
  family: "ano" | "nota" | "membros" | "playlists" | "amq" | "rotulo" | "fonte" | "tema";
  direction: "max" | "min" | "tem" | "nao";
  param?: string | number;
  a: TrackId;
  b: TrackId;
  answer: "a" | "b";
  info?: QuizBonusInfo;
}
/**
 * O mesmo `info` do anime-quiz.schema.json, na ordem a e b (P382).
 */
export interface QuizBonusInfo {
  seasons?: Pair &
    {
      year: number;
      season: "winter" | "spring" | "summer" | "fall";
    }[];
  years?: Pair & number[];
  rates?: Pair & number[];
  playlists?: Pair & number[];
  themes?: Pair & string[];
  diff?: number;
}
