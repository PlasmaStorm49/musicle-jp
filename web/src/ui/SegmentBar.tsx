import type { Ref } from "preact";
import { barSeconds, segments, unlockedFraction } from "../core/player.ts";
import { secondsAt } from "../core/rules.ts";
import { t } from "../i18n/t.ts";

type Props = {
  readonly stage: number;
  /** A barra do modo (`ModeRules.stages`). */
  readonly stages: readonly number[];
  /** A barra de progresso é atualizada por rAF direto no DOM, sem redesenhar o Preact. */
  readonly fillRef: Ref<HTMLDivElement>;
};

/** Barra com pedaços proporcionais às etapas (1, 1, 2, 3, 4, 5 s) e o preenchimento tocado. */
export function SegmentBar({ stage, stages, fillRef }: Props) {
  const unlocked = secondsAt(stage, stages);
  const total = barSeconds(stages);
  return (
    <div
      class="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={unlocked}
      aria-valuetext={t("player.bar", { unlocked, total })}
    >
      <div class="bar-unlocked" style={{ width: `${unlockedFraction(stage, stages) * 100}%` }} />
      <div class="bar-fill" ref={fillRef} aria-hidden="true" />
      <div class="bar-segments" aria-hidden="true">
        {segments(stage, stages).map((s, i) => (
          // A ordem dos pedaços é fixa: o índice é uma chave estável aqui.
          <span
            key={`seg-${i}`}
            class={s.unlocked ? "seg on" : "seg"}
            style={{ flexGrow: s.weight }}
          />
        ))}
      </div>
    </div>
  );
}
