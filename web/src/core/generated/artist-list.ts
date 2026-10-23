// GERADO por web/scripts/gen-types.ts a partir de shared/schema. Não edite à mão.
// Para atualizar: npm run types --prefix web

export type ArtistId = string;
export type NonEmptyText = string;
export type OptionalText = string | null;
export type AssetUrl = string;

/**
 * O índice do modo por artista (M13): os artistas da lista principal na ordem da curadoria (artists.toml) e, depois, os de cada seção, em ordem alfabética (P200, P201), com o arquivo de cada um. Gerado só pelo pipeline (build-artists).
 */
export interface ArtistList {
  schemaVersion: 1;
  provider: string;
  storefront: string;
  /**
   * @minItems 1
   */
  artists: [ArtistListEntry, ...ArtistListEntry[]];
}
export interface ArtistListEntry {
  id: ArtistId;
  name: NonEmptyText;
  nameLatin: OptionalText;
  /**
   * Arquivo do artista, na mesma pasta do índice.
   */
  file: string;
  songs: number;
  /**
   * A capa do cartão da lista (P168): a do álbum da música mais popular, de preferência um álbum só do artista; sempre a capa de um álbum do arquivo dele. Null sem capa (a tela mostra o monograma, P171).
   */
  artworkUrl: AssetUrl | null;
  /**
   * A seção da lista (P200): ausente na principal, dos artistas japoneses; "foreign" na de fora do Japão. Campo só de acréscimo, sem versão nova: o site antigo o ignora e mostra todos numa lista só.
   */
  section?: "foreign";
  /**
   * As 3 medalhas do Superfan do artista (M16), escolhidas à mão no artists.toml: os nomes (P295, obrigatórios pela P301), a capa das 3 (P296: a de um álbum do arquivo dele), o enquadramento, a faixa da perfeita (P299) e as cores do buquê (P296). Sem a capa, o enquadramento, a faixa ou as flores, a tela usa o padrão. Obrigatório no índice novo, sem versão nova; o site o lê como opcional, porque o índice velho, no cache do Pages, vem sem ele.
   */
  medals: {
    names: {
      /**
       * O nome da medalha dos 50 acertos; o latino (o romaji, sem mácron, P297) só quando o nome tem kana, kanji ou hangul.
       */
      acertos: {
        name: NonEmptyText;
        latin: string | null;
      };
      /**
       * O nome da medalha do Superfan completo, com o latino como o do acertos.
       */
      completo: {
        name: NonEmptyText;
        latin: string | null;
      };
      /**
       * O nome da medalha do Superfan perfeito: só o original, sem o latino (P295).
       */
      perfeito: {
        name: NonEmptyText;
      };
    };
    /**
     * A capa das 3 medalhas: a de um álbum do arquivo do artista, em 300 px (a tela pede o tamanho).
     */
    artworkUrl?: string;
    /**
     * O enquadramento da capa no círculo: o zoom (z) e o ponto da capa no centro (x e y, de 0 a 1).
     */
    crop?: {
      z: number;
      x: number;
      y: number;
    };
    /**
     * O texto da faixa da perfeita: em pé, um caractere por linha, até 6; ou deitado ao longo dela (along), só em letra latina (P299).
     */
    sash?: {
      text: NonEmptyText;
      along: boolean;
    };
    /**
     * As cores do buquê da perfeita, por papel: as pétalas (d, m, ml, l, w), o contorno (line), o miolo da branca (core), a tinta da faixa (ink), o laço (bow), o aro (ring), os brilhos (spark) e as folhas (leaf1, leaf2). O d pinta também as caudas das outras duas (P305).
     */
    flowers?: {
      d: string;
      m: string;
      ml: string;
      l: string;
      w: string;
      line: string;
      core: string;
      ink: string;
      bow: string;
      ring: string;
      spark: string;
      leaf1: string;
      leaf2: string;
    };
  };
}
