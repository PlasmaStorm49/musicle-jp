import { bucketOf, bucketRange, type Stats as StatsData } from "../core/stats.ts";
import { t, tn } from "../i18n/t.ts";

type Props = {
  readonly stats: StatsData;
  /** Pontos de hoje, para destacar na distribuição (null se o dia foi todo anulado). */
  readonly todayScore: number | null;
};

/** A frase de uma faixa para o leitor de tela: "3 a 5 pontos: 2 jogos", ou "30 pontos: …". */
function bucketText(bucket: number, games: number, today: boolean): string {
  const { from, to } = bucketRange(bucket);
  const count = tn("count.games", games);
  if (from === to) {
    return t(today ? "stats.bucketToday" : "stats.bucket", {
      points: tn("count.points", from),
      games: count,
    });
  }
  return t(today ? "stats.bucketRangeToday" : "stats.bucketRange", { from, to, games: count });
}

/**
 * Números do histórico e a distribuição de pontos em colunas, uma por faixa de 3 pontos (ME77,
 * ME107), com o texto para o leitor de tela. Na tela, o eixo mostra o começo da faixa, e a
 * contagem só aparece em cima da coluna de hoje.
 */
export function Stats({ stats, todayScore }: Props) {
  const biggest = Math.max(1, ...stats.distribution);
  const todayBucket = todayScore === null ? null : bucketOf(todayScore);
  const average = stats.average === null ? t("stats.none") : stats.average.toLocaleString("pt-BR");
  return (
    <section class="stats" aria-labelledby="stats-title">
      <h3 id="stats-title">{t("stats.title")}</h3>
      <dl class="stats-grid">
        <div>
          <dt>{t("stats.played")}</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>{t("stats.average")}</dt>
          <dd>{average}</dd>
        </div>
        <div>
          <dt>{t("stats.currentStreak")}</dt>
          <dd>{tn("count.days", stats.currentStreak)}</dd>
        </div>
        <div>
          <dt>{t("stats.bestStreak")}</dt>
          <dd>{tn("count.days", stats.bestStreak)}</dd>
        </div>
      </dl>
      <h4>{t("stats.distribution")}</h4>
      {/* O número de colunas vai para o CSS: ele sai do máximo do dia (bucketOf). */}
      <ol class="distribution" style={{ "--buckets": stats.distribution.length }}>
        {stats.distribution.map((games, bucket) => (
          // As faixas são fixas (da 1ª à do máximo): a posição é a chave.
          <li key={`bucket-${bucket}`} class={bucket === todayBucket ? "bucket today" : "bucket"}>
            {/* O visível é só desenho; o leitor de tela ouve a frase completa do sr-only. */}
            <span class="bucket-label" aria-hidden="true">
              {bucketRange(bucket).from}
            </span>
            <span
              class="bucket-bar"
              style={{ "--h": `${(games / biggest) * 100}%` }}
              aria-hidden="true"
            />
            <span class="sr-only">{bucketText(bucket, games, bucket === todayBucket)}</span>
            <span class="bucket-count" aria-hidden="true">
              {games}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
