import type { Ref } from "preact";
import { BAR_SECONDS, segments, unlockedFraction } from "../core/player.ts";
import { secondsAt } from "../core/rules.ts";
import { t } from "../i18n/t.ts";

type Props = {
  readonly stage: number;
  /** A barra de progresso é atualizada por rAF direto no DOM, sem redesenhar o Preact. */
  readonly fillRef: Ref<HTMLDivElement>;
};

/** Barra com pedaços proporcionais às etapas (1, 1, 2, 3, 4, 5 s) e o preenchimento tocado. */
export function SegmentBar({ stage, fillRef }: Props) {
  const unlocked = secondsAt(stage);
  return (
    <div
      class="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={BAR_SECONDS}
      aria-valuenow={unlocked}
      aria-valuetext={t("player.bar", { unlocked, total: BAR_SECONDS })}
    >
      <div class="bar-unlocked" style={{ width: `${unlockedFraction(stage) * 100}%` }} />
      <div class="bar-fill" ref={fillRef} aria-hidden="true" />
      <div class="bar-segments" aria-hidden="true">
        {segments(stage).map((s, i) => (
          // A ordem dos 6 pedaços é fixa: o índice é uma chave estável aqui.
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
