import type { Stats as StatsData } from "../core/stats.ts";
import { t, tn } from "../i18n/t.ts";

type Props = {
  readonly stats: StatsData;
  /** Pontos de hoje, para destacar na distribuição (null se o dia foi todo anulado). */
  readonly todayScore: number | null;
};

/** Números do histórico e a distribuição de pontos em barras (com texto para leitor de tela). */
export function Stats({ stats, todayScore }: Props) {
  const biggest = Math.max(1, ...stats.distribution);
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
      <ol class="distribution">
        {stats.distribution.map((games, points) => (
          // 19 baldes fixos (0 a 18 pontos): o próprio valor é a chave.
          <li key={`bucket-${points}`} class={points === todayScore ? "bucket today" : "bucket"}>
            {/* O visível é só desenho; o leitor de tela ouve a frase completa do sr-only. */}
            <span class="bucket-label" aria-hidden="true">
              {points}
            </span>
            <span
              class="bucket-bar"
              style={{ width: `${(games / biggest) * 100}%` }}
              aria-hidden="true"
            />
            <span class="sr-only">
              {t(points === todayScore ? "stats.bucketToday" : "stats.bucket", {
                points: tn("count.points", points),
                games: tn("count.games", games),
              })}
            </span>
            <span class="bucket-count" aria-hidden="true">
              {games}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
