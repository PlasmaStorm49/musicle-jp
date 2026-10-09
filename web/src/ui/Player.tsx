import { useEffect, useRef, useState } from "preact/hooks";
import type { AudioEngine, Playback } from "../audio/engine.ts";
import { fillFraction } from "../core/player.ts";
import { MAX_STAGE, type ModeRules, secondsAt } from "../core/rules.ts";
import { t } from "../i18n/t.ts";
import { SegmentBar } from "./SegmentBar.tsx";

type Props = {
  readonly engine: AudioEngine;
  readonly url: string;
  readonly offset: number;
  readonly stage: number;
  readonly explicit: boolean;
  /** Regras do modo: decidem entre "Ouvir mais" (4 opções) e "Pular" (digitação). */
  readonly rules: ModeRules;
  /** Mostra "Pular"? Falso na última tentativa (canSkip, em core/rules.ts). */
  readonly skippable: boolean;
  /** Libera a próxima etapa no jogo (o Player toca o trecho maior em seguida, P33). */
  readonly onListenMore: () => void;
  /** Gasta uma tentativa e libera a próxima etapa; não toca sozinho (P46). */
  readonly onSkip: () => void;
  readonly onAudioError: () => void;
};

/** Tocar, Parar e "Ouvir mais" ou "Pular", com a barra segmentada. */
export function Player({
  engine,
  url,
  offset,
  stage,
  explicit,
  rules,
  skippable,
  onListenMore,
  onSkip,
  onAudioError,
}: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const fillRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  // Desmontar (troca de rodada, revelação) para o som e o laço da barra.
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      engine.stop();
    },
    [engine],
  );

  function animate(playback: Playback, atStage: number) {
    const draw = () => {
      if (fillRef.current) {
        fillRef.current.style.width = `${fillFraction(playback.elapsed(), atStage) * 100}%`;
      }
      frame.current = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(frame.current);
    draw();
  }

  function play(atStage: number) {
    setStatus("loading");
    engine
      .play(url, offset, secondsAt(atStage))
      .then((playback) => {
        if (!playback) return; // outra ação tomou o lugar
        setStatus("playing");
        animate(playback, atStage);
        return playback.done.then(() => {
          cancelAnimationFrame(frame.current);
          setStatus((s) => (s === "playing" ? "idle" : s));
        });
      })
      .catch(() => {
        cancelAnimationFrame(frame.current);
        setStatus("idle");
        onAudioError();
      });
  }

  function stop() {
    engine.stop();
    cancelAnimationFrame(frame.current);
    setStatus("idle");
  }

  function listenMore(event: MouseEvent) {
    if (event.detail > 1) return; // toque duplo não gasta 2 pontos
    onListenMore();
    play(stage + 1);
  }

  function skip(event: MouseEvent) {
    if (event.detail > 1) return; // toque duplo não gasta 2 tentativas
    stop(); // o trecho antigo para; o novo só toca no clique em Tocar (P46)
    onSkip();
  }

  const extra = secondsAt(stage + 1) - secondsAt(stage);

  return (
    <section class="player">
      {explicit && <p class="badge explicit">{t("player.explicit")}</p>}
      <SegmentBar stage={stage} fillRef={fillRef} />
      <div class="player-actions">
        {status === "playing" ? (
          <button type="button" class="primary" onClick={stop}>
            {t("player.stop")}
          </button>
        ) : (
          <button
            type="button"
            class="primary"
            disabled={status === "loading"}
            onClick={() => play(stage)}
          >
            {status === "loading"
              ? t("player.loading")
              : t("player.play", { seconds: secondsAt(stage) })}
          </button>
        )}
        {rules.listenMore && stage < MAX_STAGE && (
          <button type="button" onClick={listenMore} disabled={status === "loading"}>
            {t("player.listenMore", { seconds: extra })}
          </button>
        )}
        {skippable && (
          <button type="button" onClick={skip} disabled={status === "loading"}>
            {t("typing.skip", { seconds: extra })}
          </button>
        )}
      </div>
    </section>
  );
}
