import { useEffect, useRef, useState } from "preact/hooks";
import { type AudioEngine, AudioUnavailableError, type Playback } from "../audio/engine.ts";
import { fillFraction } from "../core/player.ts";
import { MAX_STAGE, type ModeRules, secondsAt } from "../core/rules.ts";
import { t } from "../i18n/t.ts";
import { SegmentBar } from "./SegmentBar.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly engine: AudioEngine;
  /** Endereço da prévia; null enquanto o resolvedor busca (o Tocar fica em "Carregando…"). */
  readonly url: string | null;
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
  const playButton = useRef<HTMLButtonElement>(null);
  // O foco vai para o botão principal (Tocar ou Parar):
  // - "section": ao montar (o Player monta a cada rodada, inclusive logo depois da escolha do
  //   modo) e depois de um pulo, se o foco está no body, no próprio Player ou ainda no lugar de
  //   fora do jogo onde estava ao montar (a nav: quem entra num diário pelo link da aba fica com o
  //   foco nele, regra 16): o "Pular" pode ter sumido (última tentativa), e o próximo passo
  //   natural é ouvir o trecho liberado (P46);
  // - "lost": quando o som começa (ou falha), só se o foco se perdeu. O "Ouvir mais" da última
  //   etapa some, e o botão desabilitado no "Carregando…" o navegador joga no body; já o "Ouvir
  //   mais" de uma etapa do meio continua na tela, e quem usa teclado aperta Enter de novo nele.
  // Com a prévia ainda em busca o botão está desabilitado e não recebe foco: ele vai quando a
  // URL chega (até 3 s depois), mas só se o jogador não foi para outro lugar enquanto isso (o
  // campo de digitação, uma opção): o foco fica onde ele está.
  const [focusPlay, setFocusPlay] = useState<"section" | "lost" | null>("section");
  const section = useRef<HTMLElement>(null);
  // Quem foi para outro link da nav enquanto a prévia chegava não é puxado de volta.
  const [entryFocus] = useState(() => document.activeElement);
  const waiting = url === null;
  useEffect(() => {
    if (focusPlay === null || status === "loading" || waiting) return;
    setFocusPlay(null);
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    const outside = active === entryFocus && !active?.closest("main");
    if (lost || (focusPlay === "section" && (outside || section.current?.contains(active)))) {
      playButton.current?.focus();
    }
  }, [focusPlay, status, waiting]);

  // Desmontar (troca de rodada, revelação) para o som e o laço da barra. `alive` evita que uma
  // falha de áudio que chega depois (rede lenta) anule a rodada seguinte: no Treino toda rodada
  // é a de número 0, e o reducer não teria como saber que o VOID era da anterior.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // um motor novo (outra carga) vale de novo
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

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

  // Uma ficha por reprodução: só a mais nova mexe na tela. No Web Audio, o fim de um trecho
  // interrompido chega uns 10 ms depois do stop, quando o trecho do "Ouvir mais" já começou; sem
  // a ficha, ele parava a barra do novo e devolvia o Tocar com o som tocando.
  const playId = useRef(0);

  function play(atStage: number) {
    if (url === null) return;
    const id = ++playId.current;
    const current = () => alive.current && playId.current === id;
    setStatus("loading");
    setFocusPlay("lost");
    engine
      .play(url, offset, secondsAt(atStage))
      .then((playback) => {
        if (!current()) return;
        if (!playback) {
          // O motor foi parado antes de o som começar (um palpite na digitação, a aba oculta):
          // sem isto, o botão ficava em "Carregando…" até o fim da rodada.
          setStatus("idle");
          return;
        }
        setStatus("playing");
        animate(playback, atStage);
        return playback.done.then(() => {
          if (!current()) return;
          cancelAnimationFrame(frame.current);
          setStatus("idle");
        });
      })
      .catch((error: unknown) => {
        if (!current()) return; // a falha de um trecho que já foi substituído
        cancelAnimationFrame(frame.current);
        setStatus("idle");
        // O navegador barrou o som fora do gesto (a reserva entrou depois de uma espera): a
        // rodada continua, e o próximo clique toca direto no <audio>, dentro do gesto.
        if (error instanceof AudioUnavailableError && error.kind === "blocked") return;
        onAudioError();
      });
  }

  function stop() {
    playId.current++; // o fim do trecho parado não mexe em mais nada
    engine.stop();
    cancelAnimationFrame(frame.current);
    setStatus("idle");
  }

  // Com singleClick: o toque duplo não gasta 2 pontos.
  function listenMore() {
    onListenMore();
    play(stage + 1);
  }

  // Com singleClick: o toque duplo não gasta 2 tentativas.
  function skip() {
    stop(); // o trecho antigo para; o novo só toca no clique em Tocar (P46)
    onSkip();
    setFocusPlay("section");
  }

  const extra = secondsAt(stage + 1) - secondsAt(stage);
  const busy = status === "loading" || waiting;

  return (
    <section class="player" ref={section}>
      {explicit && <p class="badge explicit">{t("player.explicit")}</p>}
      <SegmentBar stage={stage} fillRef={fillRef} />
      <div class="player-actions">
        {status === "playing" ? (
          // O 2º clique de um toque duplo no Tocar cairia aqui (o mesmo botão, que vira Parar) e
          // pararia o som que acabou de começar.
          <button ref={playButton} type="button" class="primary" onClick={singleClick(stop)}>
            {t("player.stop")}
          </button>
        ) : (
          <button
            ref={playButton}
            type="button"
            class="primary"
            disabled={busy}
            // O 2º clique de um toque duplo no Parar (ou num botão da tela anterior) tocaria de novo.
            onClick={singleClick(() => play(stage))}
          >
            {busy ? t("player.loading") : t("player.play", { seconds: secondsAt(stage) })}
          </button>
        )}
        {rules.listenMore && stage < MAX_STAGE && (
          <button type="button" onClick={singleClick(listenMore)} disabled={busy}>
            {t("player.listenMore", { seconds: extra })}
          </button>
        )}
        {skippable && (
          <button type="button" onClick={singleClick(skip)} disabled={status === "loading"}>
            {t("typing.skip", { seconds: extra })}
          </button>
        )}
      </div>
    </section>
  );
}
