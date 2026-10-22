import { useEffect, useRef } from "preact/hooks";
import type { Daily } from "../core/daily.ts";
import {
  type FinishedGame,
  type PuzzleId,
  recordMax,
  recordScore,
  roundRecordScore,
} from "../core/records.ts";
import { MODE_RULES } from "../core/rules.ts";
import { shareText } from "../core/share.ts";
import { computeStats } from "../core/stats.ts";
import { t, tn } from "../i18n/t.ts";
import { Countdown } from "./Countdown.tsx";
import { Icon } from "./Icon.tsx";
import { shareHeader } from "./modes.ts";
import { ShareButton } from "./ShareButton.tsx";
import { Stats } from "./Stats.tsx";

type Props = {
  readonly game: FinishedGame;
  /**
   * O diário: o nome e as regras do compartilhar, a data do jogo (não o relógio) e a estatística,
   * que é só dele (P249).
   */
  readonly daily: Daily;
  /** Histórico com o jogo de hoje já incluído. */
  readonly history: Readonly<Record<PuzzleId, FinishedGame>>;
  /** Dias da agenda do diário: a sequência só conta estes (P40). */
  readonly scheduleDates: readonly string[];
  readonly shareUrl: string;
  readonly announce: (message: string) => void;
};

/**
 * O texto de uma rodada no resumo: a frase inteira (o leitor de tela) e os pontos da célula. A
 * ajuda aparece nos dois (P149): na célula, "1 ponto · ajuda".
 */
function roundTexts(round: FinishedGame["rounds"][number]): {
  readonly result: string;
  readonly points: string;
} {
  if (round.status === "void") return { result: t("summary.void"), points: t("summary.void") };
  if (round.status !== "won") return { result: t("summary.lost"), points: tn("count.points", 0) };
  const points = tn("count.points", roundRecordScore(round));
  return round.help !== undefined
    ? { result: t("summary.wonHelp", { points }), points: t("summary.pointsHelp", { points }) }
    : { result: t("summary.won", { points }), points };
}

/** Fim do dia, a partir do resumo salvo: vale para quem acabou de jogar e para quem voltou. */
export function Summary({ game, daily, history, scheduleDates, shareUrl, announce }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const stats = computeStats(history, daily.key, daily.date, scheduleDates);
  const max = recordMax(game);
  const header = shareHeader(daily, game.number);

  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" ref={heading} tabIndex={-1}>
        {t("summary.title")}
      </h2>
      <p class="score">{t("summary.score", { score: recordScore(game), max })}</p>
      <ol class="summary-rounds">
        {game.rounds.map((round, i) => {
          const { result, points } = roundTexts(round);
          return (
            // A ordem das 3 rodadas é fixa: o número é uma chave estável.
            <li key={`round-${i + 1}`} class={round.status}>
              <span class="sr-only">{t("summary.round", { number: i + 1, result })}</span>
              <span aria-hidden="true">{t("summary.roundShort", { number: i + 1 })}</span>
              {round.status !== "void" && (
                <Icon name={round.status === "won" ? "right" : "wrong"} />
              )}
              <span class="round-points" aria-hidden="true">
                {points}
              </span>
            </li>
          );
        })}
      </ol>
      <ShareButton
        text={shareText(header, game, MODE_RULES[daily.target], shareUrl)}
        announce={announce}
      />
      <Countdown date={daily.date} announce={announce} />
      <Stats stats={stats} todayScore={max > 0 ? recordScore(game) : null} />
    </section>
  );
}
