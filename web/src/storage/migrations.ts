// Migrações do formato salvo: uma função por versão, de N para N+1, cada uma com um teste que
// lê um save real da versão anterior (web/CLAUDE.md, regra 12).

export const SAVE_SCHEMA_VERSION = 9;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 → v2 (M11, P68): o jogo trocou a parada fictícia pela real. As chaves são por data
  // ("2026-10-12|song"), então o dia fictício e o real do mesmo dia se misturariam, e as
  // estatísticas contariam jogos de outra parada. Ficava só a preferência do modo de resposta.
  1: (data) => ({ settings: data.settings ?? {}, history: {}, inProgress: {} }),
  // v2 → v3 (P100): os dois eixos (alvo × jeito de responder) viraram dois modos fixos, e o
  // modo de resposta saiu do save. Era tudo jogo de teste: começa do zero, e a preferência do
  // modo some junto.
  2: () => ({ history: {}, inProgress: {} }),
  // v3 → v4 (P149): a ajuda do Desafio, com o evento HELP no andamento e o `help` da rodada no
  // histórico. Nada muda no que já existe: a versão sobe para que uma aba com o código velho
  // (que recusaria o HELP e jogaria fora o andamento) veja "versão mais nova" e não grave.
  3: (data) => data,
  // v4 → v5 (P163): com a ajuda na tela, o "Pular" continua (o evento SKIP depois do HELP, e
  // pulos depois do `help` da rodada). Também nada muda: a versão sobe pelo mesmo motivo da v4.
  4: (data) => data,
  // v5 → v6 (P250): o save passa a aceitar os ids dos diários do Anime ("<data>|anime-<modo>-
  // <dificuldade>"). Nada muda no que já existe: a versão sobe para que uma aba com o código velho
  // (que não conhece esses ids e jogaria fora os jogos do Anime) veja "versão mais nova" e não
  // grave.
  5: (data) => data,
  // v6 → v7 (P267): o jogo terminado depois do dia dele, pelo Histórico, leva `late: true`, e
  // fica fora das estatísticas. Nada muda no que já existe: até aqui, jogar depois era impossível
  // no site. A versão sobe para que uma aba com o código velho (que contaria o jogado depois nas
  // estatísticas e apagaria o andamento de um dia passado) veja "versão mais nova" e não grave.
  6: (data) => data,
  // v7 → v8 (P289): as medalhas (M16). Três campos novos, vazios: as medalhas já avisadas, a
  // estante (ME118) e o modo por artista, que passa a guardar os acertos e o fim do Superfan. A
  // versão sobe para que uma aba com o código velho (cujo `sanitize` jogaria fora os três) veja
  // "versão mais nova" e não grave.
  7: (data) => ({ ...data, seenMedals: [], shelf: [], artists: {} }),
  // v8 → v9 (P308): os acertos do Treino, para o Saco de Pancadas. Um número novo, zerado: o
  // Treino começa a contar daqui. A versão sobe pelo mesmo motivo da v8 (o `sanitize` velho o
  // jogaria fora).
  8: (data) => ({ ...data, practiceRight: 0 }),
};

/** Leva um save da versão `from` até a atual. Versão sem migração conhecida: erro. */
export function migrate(data: Record<string, unknown>, from: number): Record<string, unknown> {
  let current = data;
  for (let version = from; version < SAVE_SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`não há migração do save v${version}`);
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return current;
}
