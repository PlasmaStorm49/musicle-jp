// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type IsoDate = string;
export type TrackId = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [unknown, unknown];

/**
 * Um mês da agenda do quiz do dia (M18, Apêndice Q do PLANO): a run de cada dia, com a pergunta (a família, a direção e o parâmetro) e os pares de prévias de temas de anime. Um arquivo por mês (AAAA-MM.json, P379); os meses juntos são uma agenda só, que só cresce: um dia gravado nunca muda. Usa o catálogo do Anime. Gerado só pelo pipeline (comando schedule-quiz).
 */
export interface QuizMonth {
  schemaVersion: 1;
  /**
   * Distingue a agenda do quiz das outras (o schedule-check despacha pelo tipo).
   */
  kind: "anime-quiz";
  timezone: "America/Sao_Paulo";
  epoch: IsoDate;
  /**
   * O mês do arquivo (o nome dele, sem o .json); todos os dias são desse mês.
   */
  month: string;
  days: {
    [k: string]: QuizDay;
  };
}
/**
 * A run do dia: a pergunta e até 50 rodadas (o especial, até 30; menos só no acervo curto das fixtures).
 */
export interface QuizDay {
  number: number;
  catalogVersion: string;
  /**
   * A pergunta (Apêndice Q, Q.2): as comparações ano, nota, membros, playlists e amq; as propriedades rotulo, fonte e tema; os especiais estudio e ano_x.
   */
  family:
    | "ano"
    | "nota"
    | "membros"
    | "playlists"
    | "amq"
    | "rotulo"
    | "fonte"
    | "tema"
    | "estudio"
    | "ano_x";
  /**
   * Nas comparações, a resposta tem o maior (max) ou o menor (min) valor; nas propriedades, a resposta tem (tem) ou não tem (nao) a propriedade.
   */
  direction: "max" | "min" | "tem" | "nao";
  /**
   * O parâmetro da pergunta de propriedade: o rótulo do MAL, o grupo da fonte, o estúdio ou o ano. As comparações e o tipo do tema não têm.
   */
  param?: string | number;
  /**
   * Se os dados do MAL estavam na geração: com eles, as famílias do MAL podiam ser sorteadas (P380).
   */
  mal: boolean;
  /**
   * @minItems 1
   * @maxItems 50
   */
  rounds: [QuizRound, ...QuizRound[]];
}
/**
 * As duas faixas (a toca primeiro, depois b), qual delas responde à pergunta e o dado da revelação.
 */
export interface QuizRound {
  a: TrackId;
  b: TrackId;
  answer: "a" | "b";
  info?: QuizInfo;
}
/**
 * O que a revelação da rodada mostra, na ordem a e b (P382). A estreia de cada uma, no ano e na temporada (a pergunta do ano); os anos (o especial do ano); a taxa de acerto no Anime Music Quiz, em %; as playlists do AnimeThemes; o tema de cada uma (o tipo do tema); a diferença entre os dois animes (a nota e os membros do MAL, nunca o número de cada um). As perguntas de propriedade do MAL não levam dado.
 */
export interface QuizInfo {
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
