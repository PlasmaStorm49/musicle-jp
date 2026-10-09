import { type FinishedGame, recordMax, recordScore } from "../core/records.ts";
import { pointsAtStage } from "../core/rules.ts";
import { t, tn } from "../i18n/t.ts";

type Props = {
  readonly game: FinishedGame;
};

/** Fim do dia, a partir do resumo salvo: vale para quem acabou de jogar e para quem voltou. */
export function Summary({ game }: Props) {
  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" tabIndex={-1}>
        {t("summary.title")}
      </h2>
      <p class="score">{t("summary.score", { score: recordScore(game), max: recordMax(game) })}</p>
      <ol>
        {game.rounds.map((round, i) => {
          const result =
            round.status === "won"
              ? t("summary.won", { points: tn("count.points", pointsAtStage(round.stage)) })
              : round.status === "void"
                ? t("summary.void")
                : t("summary.lost");
          return (
            // A ordem das 3 rodadas é fixa: o número é uma chave estável.
            <li key={`round-${i + 1}`} class={round.status}>
              {t("summary.round", { number: i + 1, result })}
            </li>
          );
        })}
      </ol>
      <p>{t("summary.comeBack")}</p>
    </section>
  );
}
