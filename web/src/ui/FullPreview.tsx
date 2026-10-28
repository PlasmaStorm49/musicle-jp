import { useEffect, useRef, useState } from "preact/hooks";
import type { AudioEngine, Playback } from "../audio/engine.ts";
import { fillFraction } from "../core/player.ts";
import { t } from "../i18n/t.ts";
import { SegmentBar } from "./SegmentBar.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly engine: AudioEngine;
  /** O endereço da prévia, já resolvido; null enquanto busca (o Ouvir não aparece). */
  readonly url: string | null;
  /** O começo e a duração da prévia no catálogo; sem ela, nada aparece. */
  readonly preview: { readonly startSec: number; readonly durationSec: number } | null | undefined;
  /** Mensagem para a região aria-live (a prévia inteira que não tocou). */
  readonly announce: (message: string) => void;
  /** Com a barra da prévia ao lado (o padrão), ou só o botão, onde a tela não tem a largura. */
  readonly bar?: boolean;
};

/**
 * A prévia inteira de uma faixa já revelada (P34), num botão só, que alterna Ouvir e Parar, como o
 * Tocar do Player, e a barra que leva ao ponto do clique (P224). Saiu da `Reveal` para servir
 * também à revelação do quiz, uma por música (o usuário, 27/10/2026). A ficha impede que o fim de
 * uma reprodução parada mexa na seguinte; o motor é um só, e tocar uma para a outra.
 */
export function FullPreview({ engine, url, preview, announce, bar = true }: Props) {
  const alive = useRef(true);
  const fillRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  useEffect(() => {
    alive.current = true; // um motor novo (outra carga) vale de novo
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

  const [full, setFull] = useState<"idle" | "loading" | "playing" | "failed">("idle");
  const fullId = useRef(0);
  // A prévia tocando e onde ela começou: o teclado da barra anda a partir dali (P224).
  const playing = useRef<{ playback: Playback; from: number } | null>(null);
  // Com singleClick: o toque duplo tocaria e pararia em seguida.
  function toggleFull() {
    if (full === "loading" || full === "playing") {
      fullId.current++;
      playing.current = null;
      cancelAnimationFrame(frame.current);
      engine.stop();
      setFull("idle");
      return;
    }
    playFull(0);
  }

  /** Toca a prévia inteira a partir de `from` segundos (a barra, P224), até o fim dela. */
  function playFull(from: number) {
    if (!preview || !url) return;
    const id = ++fullId.current;
    const current = () => alive.current && fullId.current === id;
    playing.current = null;
    setFull("loading");
    engine
      .play(url, preview.startSec + from, preview.durationSec - from)
      .then((playback) => {
        if (!current()) return;
        if (!playback) {
          setFull("idle");
          return;
        }
        playing.current = { playback, from };
        setFull("playing");
        const stages = [preview.durationSec];
        const draw = () => {
          if (fillRef.current) {
            const played = from + playback.elapsed();
            fillRef.current.style.width = `${fillFraction(played, 0, stages) * 100}%`;
          }
          frame.current = requestAnimationFrame(draw);
        };
        cancelAnimationFrame(frame.current);
        draw();
        return playback.done.then(() => {
          if (!current()) return;
          playing.current = null;
          cancelAnimationFrame(frame.current);
          setFull("idle");
        });
      })
      .catch(() => {
        if (!current()) return;
        cancelAnimationFrame(frame.current);
        // A rodada já acabou: não há o que anular. Antes a falha era engolida e o clique não
        // fazia nada (no iPhone, um som barrado fora do gesto).
        setFull("failed");
        announce(t("reveal.listenFailed"));
      });
  }

  return (
    <>
      {preview && url && (
        // O Ouvir e a barra da prévia numa linha, no lugar do botão sozinho: a revelação não
        // cresce (regra 25). Na tela, "Ouvir"; o nome inteiro, para o leitor de tela.
        <div class="reveal-player">
          <button type="button" onClick={singleClick(toggleFull)}>
            {/* No "Carregando…" o clique também para: o nome diz o que ele faz. */}
            {full === "playing" || full === "loading" ? (
              t("player.stop")
            ) : (
              <>
                <span aria-hidden="true">{t("reveal.listenShort")}</span>
                <span class="sr-only">{t("reveal.listenFull")}</span>
              </>
            )}
          </button>
          {bar && (
            <SegmentBar
              stage={0}
              stages={[preview.durationSec]}
              fillRef={fillRef}
              seek={{
                label: t("reveal.seek"),
                position: () => {
                  const now = playing.current;
                  return now ? now.from + now.playback.elapsed() : 0;
                },
                valueText: (at) => t("reveal.seekValue", { at, total: preview.durationSec }),
                onSeek: (seconds) => {
                  if (full !== "loading") playFull(seconds);
                },
              }}
            />
          )}
        </div>
      )}
      {full === "failed" && <p class="hint">{t("reveal.listenFailed")}</p>}
    </>
  );
}
