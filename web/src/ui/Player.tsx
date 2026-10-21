import { useEffect, useId, useRef, useState } from "preact/hooks";
import { type AudioEngine, AudioUnavailableError, type Playback } from "../audio/engine.ts";
import { barSeconds, fillFraction } from "../core/player.ts";
import { lastStage, type ModeRules, secondsAt } from "../core/rules.ts";
import { VOLUME_STEP } from "../core/volume.ts";
import { t } from "../i18n/t.ts";
import { Icon } from "./Icon.tsx";
import { SegmentBar } from "./SegmentBar.tsx";
import { singleClick } from "./singleClick.ts";
import { useVolume } from "./volume.ts";

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

  // O trecho tocando e onde ele começou no liberado: o teclado da barra anda a partir dali.
  const current = useRef<{ playback: Playback; from: number } | null>(null);

  function animate(playback: Playback, atStage: number, from: number) {
    const draw = () => {
      if (fillRef.current) {
        const played = from + playback.elapsed();
        fillRef.current.style.width = `${fillFraction(played, atStage, rules.stages) * 100}%`;
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

  /** Toca o trecho da etapa a partir de `from` segundos (a barra, P224), até o fim dele. */
  function play(atStage: number, from = 0) {
    if (url === null) return;
    const id = ++playId.current;
    const mine = () => alive.current && playId.current === id;
    setStatus("loading");
    setFocusPlay("lost");
    current.current = null;
    engine
      .play(url, offset + from, secondsAt(atStage, rules.stages) - from)
      .then((playback) => {
        if (!mine()) return;
        if (!playback) {
          // O motor foi parado antes de o som começar (um palpite na digitação, a aba oculta):
          // sem isto, o botão ficava em "Carregando…" até o fim da rodada.
          setStatus("idle");
          return;
        }
        current.current = { playback, from };
        setStatus("playing");
        animate(playback, atStage, from);
        return playback.done.then(() => {
          if (!mine()) return;
          current.current = null;
          cancelAnimationFrame(frame.current);
          setStatus("idle");
        });
      })
      .catch((error: unknown) => {
        if (!mine()) return; // a falha de um trecho que já foi substituído
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
    current.current = null;
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

  const extra = secondsAt(stage + 1, rules.stages) - secondsAt(stage, rules.stages);
  const busy = status === "loading" || waiting;
  const unlocked = secondsAt(stage, rules.stages);
  const total = barSeconds(rules.stages);
  // A barra leva ao ponto do liberado e toca dali até o fim dele (P224): não muda a etapa nem os
  // pontos. Parado, o teclado anda a partir do começo.
  const seek = {
    label: t("player.seek"),
    position: () => {
      const playing = current.current;
      return playing ? Math.min(playing.from + playing.playback.elapsed(), unlocked) : 0;
    },
    valueText: (at: number) => t("player.seekValue", { at, unlocked, total }),
    onSeek: (seconds: number) => {
      if (!busy) play(stage, seconds);
    },
  };

  return (
    <section class={explicit ? "player has-explicit" : "player"} ref={section}>
      {explicit && <p class="badge explicit">{t("player.explicit")}</p>}
      <SegmentBar stage={stage} stages={rules.stages} fillRef={fillRef} seek={seek} />
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
            {busy
              ? t("player.loading")
              : t("player.play", { seconds: secondsAt(stage, rules.stages) })}
          </button>
        )}
        {rules.listenMore && stage < lastStage(rules) && (
          <button type="button" onClick={singleClick(listenMore)} disabled={busy}>
            <ExtraLabel label={t("player.listenMore")} seconds={extra} />
          </button>
        )}
        {skippable && (
          <button type="button" onClick={singleClick(skip)} disabled={status === "loading"}>
            <ExtraLabel label={t("typing.skip")} seconds={extra} />
          </button>
        )}
        <VolumeControl engine={engine} />
      </div>
    </section>
  );
}

/**
 * "Ouvir mais (+1 s)" e "Pular (+1 s)" num item só do botão (que é flex): quando falta espaço, o
 * texto quebra como texto, e o "(+1 s)" desce inteiro, sem se partir (ME98).
 */
function ExtraLabel({ label, seconds }: { readonly label: string; readonly seconds: number }) {
  return (
    <span>
      {label} <span class="extra">{t("player.extra", { seconds })}</span>
    </span>
  );
}

/**
 * O volume (P216, P219): um botão com o alto-falante (o mudo no 0%) que abre uma barra de 0% a
 * 100%, flutuando sobre a linha da barra de trechos: a página não muda de altura (regra 25). A
 * barra leva o foco ao abrir; o Esc, um clique fora e a saída pelo Tab fecham, e o Esc devolve o
 * foco ao botão. O botão alterna no mesmo lugar: o 2º clique de um toque duplo não fecha (regra 23).
 */
function VolumeControl({ engine }: { readonly engine: AudioEngine }) {
  const { level, apply, save } = useVolume(engine);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const percent = Math.round(level * 100);

  useEffect(() => {
    if (!open) return;
    range.current?.focus();
    // Um clique fora (na tela, não no controle) fecha a barra.
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div
      ref={box}
      class="volume"
      onFocusOut={(event) => {
        // Sair pelo Tab (o foco foi para fora do controle) fecha a barra.
        const next = event.relatedTarget as Node | null;
        if (open && next && !box.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        class="volume-toggle"
        // O nome diz o volume, e o mudo: o ícone é só desenho (P219).
        aria-label={percent === 0 ? t("player.volumeMuted") : t("player.volumeButton", { percent })}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={singleClick(() => {
          setOpen(!open);
          // Fechar pelo botão deixa o foco nele: no Safari, o clique não foca o botão, e o foco
          // ficaria na barra que some (regra 16).
          if (open) button.current?.focus();
        })}
        onKeyDown={(event) => {
          // O Esc fecha também com o foco no botão (o Shift+Tab volta a ele com a barra aberta).
          if (event.key !== "Escape" || !open) return;
          event.preventDefault();
          setOpen(false);
        }}
      >
        <Icon name={percent === 0 ? "speakerMuted" : "speaker"} />
      </button>
      <div id={panelId} class="volume-panel" hidden={!open}>
        <label for={`${panelId}-range`}>{t("player.volume")}</label>
        <input
          ref={range}
          id={`${panelId}-range`}
          type="range"
          min={0}
          max={100}
          step={VOLUME_STEP}
          value={percent}
          aria-valuetext={t("player.volumeValue", { percent })}
          onInput={(event) => apply(Number(event.currentTarget.value) / 100)}
          onChange={save}
          onKeyDown={(event) => {
            // O Esc fecha a barra e devolve o foco ao botão.
            if (event.key !== "Escape") return;
            event.preventDefault();
            setOpen(false);
            button.current?.focus();
          }}
        />
        <output for={`${panelId}-range`} aria-hidden="true">
          {t("player.volumeValue", { percent })}
        </output>
      </div>
    </div>
  );
}
