import { type GameState, maxScore, roundScore, totalScore } from "../core/reducer.ts";
import { t } from "../i18n/t.ts";

/** Fim do dia: pontos sobre o máximo (18, ou menos com rodada anulada) e cada rodada. */
export function Summary({ game }: { readonly game: GameState }) {
  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" tabIndex={-1}>
        {t("summary.title")}
      </h2>
      <p class="score">{t("summary.score", { score: totalScore(game), max: maxScore(game) })}</p>
      <ol>
        {game.rounds.map((round, i) => {
          const result =
            round.status === "won"
              ? t("summary.won", { points: roundScore(round) })
              : round.status === "void"
                ? t("summary.void")
                : t("summary.lost");
          return (
            <li key={round.trackId} class={round.status}>
              {t("summary.round", { number: i + 1, result })}
            </li>
          );
        })}
      </ol>
      <p>{t("summary.comeBack")}</p>
    </section>
  );
}
