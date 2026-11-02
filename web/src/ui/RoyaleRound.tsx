// A rodada do Anime Royale (o usuário, 01/11/2026): o player dos 5 trechos, tocados em sequência
// com uma pausa curta, a barra de 5 partes (cada parte toca dali até o fim), a grade das 9 capas e
// o pop-up de cada uma, com a capa grande, o anime e o tipo do tema, e o "Marcar". A sequência é o
// `engine.play` em série, como o quiz (P384): serve também ao <audio> de reserva.
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { type AudioEngine, AudioUnavailableError } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { type CoverSize, coverUrl } from "../core/covers.ts";
import {
  isRight,
  isRoyaleFinished,
  ROYALE_GAP_SEC,
  ROYALE_SAMPLE_SEC,
  type RoyaleDaily,
  type RoyaleEvent,
  type RoyaleOption,
  type RoyaleState,
  royaleFound,
  royaleOffset,
  royaleOption,
  royaleReducer,
} from "../core/royale.ts";
import { t, tn } from "../i18n/t.ts";
import { Attribution } from "./Attribution.tsx";
import { Icon } from "./Icon.tsx";
import { VolumeControl } from "./Player.tsx";
import { singleClick } from "./singleClick.ts";

/**
 * "Opening 2" ou, sem número, "Opening": os nomes em inglês, como no quiz (o usuário,
 * 02/11/2026).
 */
export function themeText(option: Pick<RoyaleOption, "type" | "sequence">): string {
  const kind = t(`quiz.theme.${option.type}`);
  return option.sequence === null ? kind : t("quiz.themeNumber", { kind, number: option.sequence });
}

/**
 * A capa como fundo, pelo caminho já conferido do `coverUrl`: o desfoque da vitrine (o usuário,
 * 02/11/2026) e a pequena por baixo da grande no pop-up.
 */
function coverBackground(url: string | null, resolveUrl: (url: string) => string) {
  return url ? { backgroundImage: `url("${resolveUrl(url)}")` } : undefined;
}

/** O nome com mais letras que isto desce um tamanho no pop-up (o "Otome Game no Hametsu…" tem 79). */
const LONG_NAME = 40;

/**
 * A capa de uma opção, a pequena ou a grande; sem o caminho conferido, ou se ela não abrir, um
 * cartão com o nome do anime (o usuário, 01/11/2026). O nome vai no rótulo de quem a usa.
 */
export function CoverArt({
  option,
  size,
  provider,
  resolveUrl,
}: {
  readonly option: RoyaleOption;
  readonly size: CoverSize;
  readonly provider: string;
  readonly resolveUrl: (url: string) => string;
}) {
  const [failed, setFailed] = useState(false);
  const url = coverUrl(provider, option.cover, size);
  if (!url || failed) {
    return (
      <span class={`royale-art royale-art-name ${size}`} aria-hidden="true">
        {option.anime}
      </span>
    );
  }
  return (
    <img
      class={`royale-art ${size}`}
      src={resolveUrl(url)}
      alt=""
      loading={size === "small" ? "lazy" : undefined}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

type Props = {
  readonly daily: RoyaleDaily;
  readonly state: RoyaleState;
  readonly dispatch: (event: RoyaleEvent) => void;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  /** O endereço de cada uma das 5 que tocam, na ordem; null enquanto o resolvedor busca. */
  readonly urls: readonly (string | null)[];
  /** Se o resolvedor terminou cada uma: terminada e sem endereço, a prévia não existe. */
  readonly resolved: readonly boolean[];
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
};

/** A rodada: o player, a grade, o desistir e o selo da Apple no pé (regra 22). */
export function RoyaleRoundView(props: Props) {
  const { state, dispatch, index } = props;
  return (
    <>
      <RoyalePlayer {...props} />
      <RoyaleBoard {...props} />
      <button
        type="button"
        class="give-up"
        onClick={singleClick(() => dispatch({ type: "QUIT" }))}
        aria-disabled={isRoyaleFinished(state) ? "true" : undefined}
      >
        {t("royale.giveUp")}
      </button>
      {index.catalog.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
    </>
  );
}

/**
 * O player: o Tocar (as 5, ou do trecho em que o som foi barrado), a barra de 5 partes e o volume.
 * Uma ficha por sequência: só a mais nova mexe no estado (o fim de um trecho parado chega depois
 * que o seguinte começou, regra 9).
 */
function RoyalePlayer({ daily, index, engine, urls, resolved, announce }: Props) {
  const ready = urls.length === daily.played.length && urls.every((u) => u !== null);
  // Uma das 5 sem prévia nenhuma: a dificuldade não tem como ser jogada (o aviso, e só o Desistir).
  const missing = urls.some((url, at) => url === null && resolved[at] === true);
  const offsets = useMemo(
    () =>
      daily.played.map((id) =>
        royaleOffset(daily, id, index.tracks.get(id)?.preview?.durationSec ?? null),
      ),
    [daily, index],
  );
  const [playing, setPlaying] = useState<number | null>(null);
  // O trecho em que o som foi barrado fora do gesto (o <audio> de reserva): o próximo Tocar
  // começa por ele (P403), porque recomeçar pelo 1º o barraria de novo.
  const [resumeAt, setResumeAt] = useState(0);
  // A falha de áudio, na tela (o announce é só do leitor de tela); some no próximo Tocar.
  const [failed, setFailed] = useState(false);
  const playButton = useRef<HTMLButtonElement>(null);
  const ticket = useRef(0);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef(0);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ticket.current++;
      clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

  // O foco vai ao Tocar ao montar (a dificuldade nova, a próxima, a volta da carga), como nas
  // Misturadas, se ele não ficou noutro lugar da tela (regra 16).
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.closest("main")) {
      playButton.current?.focus();
    }
  }, []);

  function paint(at: number, fraction: number) {
    const fill = fills.current[at];
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
  }

  function idle() {
    cancelAnimationFrame(frame.current);
    setPlaying(null);
  }

  /** Toca o trecho `at` e, se ele acabar sozinho, o seguinte, depois da pausa. */
  function step(at: number, mine: () => boolean) {
    const url = urls[at];
    if (!url) return idle();
    setPlaying(at);
    engine
      .play(url, offsets[at] ?? 0, ROYALE_SAMPLE_SEC)
      .then((playback) => {
        if (!mine()) return;
        if (!playback) return idle();
        const draw = () => {
          paint(at, playback.elapsed() / ROYALE_SAMPLE_SEC);
          frame.current = requestAnimationFrame(draw);
        };
        draw();
        return playback.done.then((result) => {
          if (!mine()) return;
          cancelAnimationFrame(frame.current);
          paint(at, 1);
          if (result.interrupted || at + 1 >= daily.played.length) return idle();
          // A pausa entre dois trechos: setTimeout, que roda com a página sem pintar (regra 9).
          timer.current = setTimeout(() => {
            if (mine()) step(at + 1, mine);
          }, ROYALE_GAP_SEC * 1000);
        });
      })
      .catch((error: unknown) => {
        if (!mine()) return;
        idle();
        if (error instanceof AudioUnavailableError && error.kind === "blocked") {
          if (at > 0) setResumeAt(at);
          return;
        }
        setFailed(true);
        announce(t("royale.audioError"));
      });
  }

  /** Começa no trecho `from` (dentro do clique: o 1º play destrava o áudio, regra 9). */
  function start(from: number) {
    if (!ready) return;
    const id = ++ticket.current;
    clearTimeout(timer.current);
    cancelAnimationFrame(frame.current);
    for (let at = 0; at < daily.played.length; at++) paint(at, 0);
    setResumeAt(0);
    setFailed(false);
    step(from, () => alive.current && ticket.current === id);
  }

  function stop() {
    ticket.current++;
    clearTimeout(timer.current);
    engine.stop();
    idle();
  }

  const label = !ready
    ? t("player.loading")
    : playing !== null
      ? t("player.stop")
      : resumeAt > 0
        ? t("royale.playFrom", { number: resumeAt + 1 })
        : t("royale.play");
  return (
    <section class="player royale-player">
      <div class="royale-controls">
        {/* Um botão só, que troca o texto: o foco fica nele ao tocar e ao parar (o 2º clique de
            um toque duplo não para o que acabou de começar, regra 23). */}
        <button
          ref={playButton}
          type="button"
          class="primary royale-play"
          aria-disabled={ready ? undefined : "true"}
          onClick={singleClick(() => (playing !== null ? stop() : start(resumeAt)))}
        >
          {label}
        </button>
        <VolumeControl engine={engine} />
      </div>
      {missing && <p class="notice">{t("royale.noPreview")}</p>}
      {failed && <p class="hint royale-failed">{t("royale.audioError")}</p>}
      <ol class="royale-samples" aria-label={t("royale.samples")}>
        {daily.played.map((id, at) => (
          <li key={id}>
            <button
              type="button"
              class={playing === at ? "royale-sample on" : "royale-sample"}
              aria-disabled={ready ? undefined : "true"}
              aria-current={playing === at ? "true" : undefined}
              onClick={singleClick(() => start(at))}
            >
              <span class="royale-sample-track" aria-hidden="true">
                <span
                  class="royale-sample-fill"
                  ref={(el) => {
                    fills.current[at] = el;
                  }}
                />
              </span>
              <span class="royale-sample-number" aria-hidden="true">
                {at + 1}
              </span>
              <span class="sr-only">
                {playing === at
                  ? t("royale.samplePlaying", { number: at + 1 })
                  : t("royale.sample", { number: at + 1 })}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A marca de uma capa: marcada e certa, ou marcada e errada. A que tocou e ficou sem marcar só
 * aparece no resultado, que tira a grade da tela.
 */
type Mark = "correct" | "wrong" | "";

function markOf(state: RoyaleState, id: string): Mark {
  if (!state.picks.includes(id)) return "";
  return isRight(state, id) ? "correct" : "wrong";
}

const MARK_TEXT = { correct: "royale.optionRight", wrong: "royale.optionWrong" } as const;

/** A grade das 9 capas e o pop-up da capa aberta. */
function RoyaleBoard({ daily, state, dispatch, index, resolveUrl, announce }: Props) {
  const provider = index.catalog.provider;
  const options = useMemo(
    () =>
      daily.options
        .map((id) => royaleOption(index, id))
        .filter((o): o is RoyaleOption => o !== null),
    [daily, index],
  );
  const [open, setOpen] = useState<RoyaleOption | null>(null);
  // Os botões das capas, para o foco voltar à capa aberta ao fechar o pop-up (no Safari, o clique
  // não foca o botão, e o foco de antes seria o body).
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const over = isRoyaleFinished(state);

  function mark(id: string) {
    const after = royaleReducer(state, { type: "PICK", id });
    if (after === state) return;
    dispatch({ type: "PICK", id });
    setOpen(null);
    const left = daily.played.length - royaleFound(after);
    announce(
      !isRight(state, id)
        ? t("royale.wrong")
        : left === 0
          ? t("royale.allFound")
          : t("royale.right", { left: tn("mixed.left", left) }),
    );
  }

  return (
    <>
      <p id="royale-pick-hint" class="sr-only">
        {t("royale.pickHint")}
      </p>
      <ul class="options royale-options" aria-label={t("royale.options")}>
        {options.map((option) => {
          const mark = markOf(state, option.id);
          const label = `${option.anime}, ${themeText(option)}`;
          const background = coverBackground(coverUrl(provider, option.cover, "small"), resolveUrl);
          return (
            <li key={option.id}>
              <button
                ref={(el) => {
                  if (el) buttons.current.set(option.id, el);
                  else buttons.current.delete(option.id);
                }}
                type="button"
                class={mark ? `royale-cover ${mark}` : "royale-cover"}
                aria-label={mark ? `${label} (${t(MARK_TEXT[mark])})` : label}
                // A dica na capa, e não na lista: o leitor de tela costuma não ler a da lista.
                aria-describedby="royale-pick-hint"
                // O 2º clique do toque duplo cai na capa do lado (regra 23).
                onClick={singleClick(() => setOpen(option))}
              >
                <span class="royale-cover-frame">
                  {background && (
                    <span class="royale-backdrop" style={background} aria-hidden="true" />
                  )}
                  <CoverArt
                    option={option}
                    size="small"
                    provider={provider}
                    resolveUrl={resolveUrl}
                  />
                </span>
                {(mark === "correct" || mark === "wrong") && (
                  <span class="royale-mark" aria-hidden="true">
                    <Icon name={mark === "correct" ? "right" : "wrong"} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <CoverDialog
          option={open}
          provider={provider}
          resolveUrl={resolveUrl}
          canMark={!over && !state.picks.includes(open.id)}
          onMark={() => mark(open.id)}
          onClose={() => setOpen(null)}
          returnFocus={() => buttons.current.get(open.id)}
        />
      )}
    </>
  );
}

/**
 * O pop-up de uma capa, a folha da vitrine, que sobe de baixo sem esconder a grade (o usuário,
 * 02/11/2026): a capa grande, que desce só agora, por cima da pequena, ao lado do anime e do tipo do
 * tema, sem o nome da música nem o artista (o usuário, 01/11/2026), sobre a capa desfocada; e os
 * botões numa linha, o "Fechar" e o "Marcar". O foco vai ao "Marcar" (ou ao "Fechar") e, ao fechar,
 * volta à capa da grade.
 */
function CoverDialog({
  option,
  provider,
  resolveUrl,
  canMark,
  onMark,
  onClose,
  returnFocus,
}: {
  readonly option: RoyaleOption;
  readonly provider: string;
  readonly resolveUrl: (url: string) => string;
  readonly canMark: boolean;
  readonly onMark: () => void;
  readonly onClose: () => void;
  /** O botão da capa na grade, que recebe o foco ao fechar. */
  readonly returnFocus: () => HTMLButtonElement | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const themeId = useId();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    first.current?.focus();
    return () => {
      if (dialog.current?.open) dialog.current.close();
      // A capa da grade; se ela saiu (a dificuldade acabou), quem montou a tela nova leva o foco.
      const cover = returnFocus();
      if (cover?.isConnected) cover.focus();
    };
    // Só ao abrir e ao fechar: a capa do pop-up não muda enquanto ele está aberto.
  }, []);
  // A pequena, que já veio com a grade: o desfoque e o fundo enquanto a grande desce.
  const background = coverBackground(coverUrl(provider, option.cover, "small"), resolveUrl);
  return (
    <dialog
      ref={dialog}
      class="royale-dialog"
      aria-labelledby={titleId}
      aria-describedby={themeId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div class="royale-sheet-hero">
        {background && <span class="royale-backdrop" style={background} aria-hidden="true" />}
        <div class="royale-dialog-cover" style={background}>
          <CoverArt option={option} size="large" provider={provider} resolveUrl={resolveUrl} />
        </div>
        <div class="royale-sheet-info">
          <h2 id={titleId} class={option.anime.length > LONG_NAME ? "long" : undefined}>
            {option.anime}
          </h2>
          <p id={themeId} class="royale-dialog-theme">
            {themeText(option)}
          </p>
        </div>
      </div>
      <div class="royale-sheet-actions">
        <button ref={canMark ? undefined : first} type="button" onClick={singleClick(onClose)}>
          {t("royale.close")}
        </button>
        {canMark && (
          <button ref={first} type="button" class="primary" onClick={singleClick(onMark)}>
            {t("royale.mark")}
          </button>
        )}
      </div>
    </dialog>
  );
}
