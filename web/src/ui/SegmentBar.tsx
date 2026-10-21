import type { Ref } from "preact";
import { useRef } from "preact/hooks";
import {
  barSeconds,
  clampSeek,
  SEEK_STEP,
  seekSeconds,
  segments,
  unlockedFraction,
} from "../core/player.ts";
import { secondsAt } from "../core/rules.ts";
import { t } from "../i18n/t.ts";
import { singleClick } from "./singleClick.ts";

/** A barra que leva a um ponto do liberado (P224): sem ela, a barra só mostra. */
export type Seek = {
  /** O nome da barra para o leitor de tela. */
  readonly label: string;
  /** Onde o som está, em segundos (o teclado anda a partir dali). */
  readonly position: () => number;
  /** O texto do ponto para o leitor de tela. */
  readonly valueText: (at: number) => string;
  /** Toca do ponto, em segundos, até o fim do liberado. */
  readonly onSeek: (seconds: number) => void;
};

type Props = {
  readonly stage: number;
  /** A barra do modo (`ModeRules.stages`). */
  readonly stages: readonly number[];
  /** A barra de progresso é atualizada por rAF direto no DOM, sem redesenhar o Preact. */
  readonly fillRef: Ref<HTMLDivElement>;
  readonly seek?: Seek;
};

/** Barra com pedaços proporcionais às etapas (1, 1, 2, 3, 4, 5 s) e o preenchimento tocado. */
export function SegmentBar({ stage, stages, fillRef, seek }: Props) {
  const unlocked = secondsAt(stage, stages);
  const total = barSeconds(stages);
  const bar = useRef<HTMLDivElement>(null);
  const drawn = (
    <>
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
    </>
  );
  if (!seek) {
    return (
      <div
        class="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={unlocked}
        aria-valuetext={t("player.bar", { unlocked, total })}
      >
        {drawn}
      </div>
    );
  }
  const at = Math.round(seek.position());
  return (
    // O alvo de toque tem 44 px de altura (P213): um respiro transparente em volta da barra de
    // 12 px, que não muda o espaço que ela ocupa. O toque na parte fechada não faz nada.
    <div
      class="bar-seek"
      role="slider"
      tabIndex={0}
      aria-label={seek.label}
      aria-valuemin={0}
      aria-valuemax={unlocked}
      aria-valuenow={at}
      aria-valuetext={seek.valueText(at)}
      // O 2º clique de um toque duplo voltaria ao mesmo ponto: o som recomeçaria (regra 23).
      onClick={singleClick((event) => {
        const box = bar.current?.getBoundingClientRect();
        if (!box || box.width <= 0) return;
        const seconds = seekSeconds((event.clientX - box.left) / box.width, total, unlocked);
        if (seconds !== null) seek.onSeek(seconds);
      })}
      onKeyDown={(event) => {
        const step =
          event.key === "ArrowRight" || event.key === "ArrowUp"
            ? SEEK_STEP
            : event.key === "ArrowLeft" || event.key === "ArrowDown"
              ? -SEEK_STEP
              : null;
        if (event.key !== "Home" && step === null) return;
        event.preventDefault();
        seek.onSeek(step === null ? 0 : clampSeek(seek.position() + step, unlocked));
      }}
    >
      <div class="bar" ref={bar}>
        {drawn}
      </div>
    </div>
  );
}
