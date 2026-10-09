import { useEffect, useRef } from "preact/hooks";
import { type FinishedGame, type PuzzleId, recordMax, recordScore } from "../core/records.ts";
import { pointsAtStage } from "../core/rules.ts";
import { shareText } from "../core/share.ts";
import { computeStats } from "../core/stats.ts";
import type { Target } from "../core/types.ts";
import { t, tn } from "../i18n/t.ts";
import { Countdown } from "./Countdown.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { Stats } from "./Stats.tsx";

type Props = {
  readonly game: FinishedGame;
  readonly target: Target;
  /** Data do jogo (não o relógio). */
  readonly date: string;
  /** Histórico com o jogo de hoje já incluído. */
  readonly history: Readonly<Record<PuzzleId, FinishedGame>>;
  readonly scheduleDates: readonly string[];
  readonly shareUrl: string;
  readonly announce: (message: string) => void;
};

/** Fim do dia, a partir do resumo salvo: vale para quem acabou de jogar e para quem voltou. */
export function Summary({ game, target, date, history, scheduleDates, shareUrl, announce }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const stats = computeStats(history, target, date, scheduleDates);
  const max = recordMax(game);
  const header = t("share.header", {
    title: t("app.title"),
    daily: t(target === "song" ? "target.song" : "target.album"),
    number: game.number,
    mode: t(game.answerMode === "choice" ? "mode.choice" : "mode.typing"),
  });

  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" ref={heading} tabIndex={-1}>
        {t("summary.title")}
      </h2>
      <p class="score">{t("summary.score", { score: recordScore(game), max })}</p>
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
      <ShareButton text={shareText(header, game, shareUrl)} announce={announce} />
      <Countdown date={date} announce={announce} />
      <Stats stats={stats} todayScore={max > 0 ? recordScore(game) : null} />
    </section>
  );
}
