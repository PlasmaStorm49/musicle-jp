// Uma rodada do quiz do dia (M18): os dois players, a escolha e a revelação. Não sabe de save nem
// de agenda: quem chama (QuizGame) cuida de gravar, do cabeçalho e do que vem depois. O desenho é
// o da revisão de design (M19) e do uso (o usuário, 27 e 28/10/2026).
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { type AudioEngine, AudioUnavailableError, type Playback } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { barSeconds, fillFraction } from "../core/player.ts";
import {
  currentQuizRound,
  isMalFamily,
  isQuizFinished,
  livesShown,
  QUIZ_LAST_STAGE,
  QUIZ_STAGES,
  type QuizDaily,
  type QuizEvent,
  type QuizRoundState,
  type QuizSide,
  type QuizState,
  quizRoundPoints,
} from "../core/quiz.ts";
import { secondsAt } from "../core/rules.ts";
import type { QuizInfo } from "../core/types.ts";
import { langOf, revealView } from "../core/view.ts";
import { t, tn } from "../i18n/t.ts";
import { Attribution } from "./Attribution.tsx";
import { FullPreview } from "./FullPreview.tsx";
import { Icon } from "./Icon.tsx";
import { ItemLabel } from "./ItemLabel.tsx";
import { VolumeControl } from "./Player.tsx";
import { themesText } from "./Reveal.tsx";
import { SegmentBar } from "./SegmentBar.tsx";
import { singleClick, singleClickLink } from "./singleClick.ts";

/** O site do MyAnimeList, no crédito das perguntas dele (P256: o crédito em texto, sem logo). */
const MAL_URL = "https://myanimelist.net/";

const SIDES: readonly QuizSide[] = ["a", "b"];

type Props = {
  readonly daily: QuizDaily;
  readonly game: QuizState;
  readonly dispatch: (event: QuizEvent) => void;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  /** O endereço da prévia da A e da B (null enquanto busca) e se o resolvedor já respondeu. */
  readonly urls: readonly (string | null)[];
  readonly resolved: readonly boolean[];
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly onNext: () => void;
  /** O texto do seguir; sem ele, "Próxima rodada" ou "Ver resultado". */
  readonly nextLabel?: string;
  /** Uma rodada do bônus de estreia: o erro não encerra nada (o usuário, 25/10/2026). */
  readonly bonus?: boolean;
};

export function QuizRoundView({
  daily,
  game,
  dispatch,
  index,
  engine,
  urls,
  resolved,
  resolveUrl,
  announce,
  onNext,
  nextLabel: label,
  bonus = false,
}: Props) {
  const round = currentQuizRound(game);
  const nextLabel = label ?? (isQuizFinished(game) ? t("reveal.finish") : t("reveal.next"));
  const apple = index.catalog.provider === APPLE_PROVIDER;
  if (round.status === "void") {
    return (
      <>
        <QuizVoid nextLabel={nextLabel} onNext={onNext} />
        {apple && <Attribution href={PLAYLIST_URL} />}
      </>
    );
  }
  if (round.status !== "playing") {
    return (
      <QuizReveal
        daily={daily}
        game={game}
        round={round}
        index={index}
        engine={engine}
        urls={urls}
        resolveUrl={resolveUrl}
        announce={announce}
        nextLabel={nextLabel}
        onNext={onNext}
        bonus={bonus}
      />
    );
  }
  // O trecho mais longo cabe inteiro na prévia: o começo do catálogo, ou antes dele (como nas
  // Misturadas).
  const offsets = SIDES.map((side) => {
    const preview = index.tracks.get(round[side])?.preview;
    const room = Math.max(
      0,
      (preview?.durationSec ?? 30) - secondsAt(QUIZ_LAST_STAGE, QUIZ_STAGES),
    );
    return Math.min(preview?.startSec ?? 0, room);
  });
  const explicit = SIDES.some((side) => index.tracks.get(round[side])?.explicit === true);
  return (
    <>
      <QuizPlayers
        // Uma rodada nova monta os players do zero: o trecho volta aos 3 s, e a escolha, à trava.
        key={game.current}
        engine={engine}
        urls={urls}
        resolved={resolved}
        offsets={offsets}
        explicit={explicit}
        onChoose={(side, stage) => dispatch({ type: "CHOOSE", round: game.current, side, stage })}
        onAudioError={() => {
          // O foco vai ao botão de seguir, e o leitor de tela ouve o porquê.
          announce(t("quiz.void"));
          dispatch({ type: "VOID", round: game.current });
        }}
      />
      {apple && <Attribution href={PLAYLIST_URL} />}
    </>
  );
}

type PlayersProps = {
  readonly engine: AudioEngine;
  readonly urls: readonly (string | null)[];
  readonly resolved: readonly boolean[];
  readonly offsets: readonly number[];
  readonly explicit: boolean;
  /** A escolha, com o trecho liberado até ela (os pontos). */
  readonly onChoose: (side: QuizSide, stage: number) => void;
  readonly onAudioError: () => void;
};

/**
 * Os dois players lado a lado (a A à esquerda, a B à direita), com um Tocar só: ele toca a A e,
 * quando ela acaba, a B (P384). A barra de cada um leva ao ponto do clique, como a do Player
 * (P224): na A, depois dela vem a B. O "Ouvir mais" abre o trecho seguinte (3, 7, 12 e 18 s) e
 * toca as duas de novo; o trecho liberado vai com a escolha (os pontos). A escolha vem embaixo
 * do Tocar, travada até as duas tocarem ao menos uma vez (o usuário, 28/10/2026).
 */
function QuizPlayers({
  engine,
  urls,
  resolved,
  offsets,
  explicit,
  onChoose,
  onAudioError,
}: PlayersProps) {
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const [side, setSide] = useState<QuizSide | null>(null);
  // As duas já tocaram (começaram) ao menos uma vez: só então a escolha vale (o usuário,
  // 28/10/2026). Sem isso, quem vinha dos outros modos ia direto ao botão debaixo da barra.
  const [heard, setHeard] = useState<Readonly<Record<QuizSide, boolean>>>({ a: false, b: false });
  const ready = heard.a && heard.b;
  // A B barrada depois da A (o som fora do gesto, no <audio> de reserva): o próximo Tocar começa
  // por ela, dentro do gesto. Recomeçar pela A a barraria de novo, e a escolha nunca destravaria.
  const resumeB = useRef(false);
  const hintId = useId();
  const fills = { a: useRef<HTMLDivElement>(null), b: useRef<HTMLDivElement>(null) };
  const frame = useRef(0);
  const playButton = useRef<HTMLButtonElement>(null);
  const current = useRef<{ side: QuizSide; playback: Playback; from: number } | null>(null);
  // Uma ficha por reprodução: só a mais nova mexe na tela (regra 9).
  const playId = useRef(0);
  const alive = useRef(true);
  const waiting = urls.some((url) => url === null);
  const busy = status === "loading" || waiting;

  // O foco vai ao Tocar ao montar (a rodada nova, a volta pela nav), se ele não está na tela.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.closest("main")) {
      playButton.current?.focus();
    }
  }, []);

  // Quando o som começa ou para, o foco que se perdeu volta ao Tocar (regra 16): o "Ouvir mais"
  // fica desabilitado no "Carregando…" e some no último trecho, e o navegador joga o foco no body.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || status === "loading") return;
    refocus.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) playButton.current?.focus();
  }, [status]);

  // Uma música sem prévia nenhuma (o resolvedor respondeu, e nada) anula a rodada, como nas
  // Misturadas (regra 21): escolher sem ouvir tiraria uma vida às cegas.
  const missing = urls.some((url, i) => url === null && resolved[i] === true);
  useEffect(() => {
    if (missing) onAudioError();
  }, [missing]);

  // Desmontar (a revelação, a rodada seguinte) para o som e o laço da barra.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

  function clearFills() {
    for (const s of SIDES) {
      const fill = fills[s].current;
      if (fill) fill.style.width = "0%";
    }
  }

  /** Toca a música `which` a partir de `from` segundos, até o fim do trecho; da A, segue para a B. */
  function play(which: QuizSide, atStage: number, from = 0) {
    const url = urls[which === "a" ? 0 : 1];
    if (!url) return;
    const id = ++playId.current;
    const mine = () => alive.current && playId.current === id;
    const offset = offsets[which === "a" ? 0 : 1] ?? 0;
    const seconds = secondsAt(atStage, QUIZ_STAGES);
    refocus.current = true;
    setStatus("loading");
    setSide(which);
    current.current = null;
    cancelAnimationFrame(frame.current);
    clearFills();
    engine
      .play(url, offset + from, seconds - from)
      .then((playback) => {
        if (!mine()) return;
        if (!playback) {
          setStatus("idle");
          setSide(null);
          return;
        }
        current.current = { side: which, playback, from };
        if (which === "b") resumeB.current = false;
        setStatus("playing");
        setHeard((was) => (was[which] ? was : { ...was, [which]: true }));
        const draw = () => {
          const fill = fills[which].current;
          if (fill) {
            const width = fillFraction(from + playback.elapsed(), atStage, QUIZ_STAGES) * 100;
            fill.style.width = `${width}%`;
          }
          frame.current = requestAnimationFrame(draw);
        };
        draw();
        return playback.done.then((result) => {
          if (!mine()) return;
          current.current = null;
          cancelAnimationFrame(frame.current);
          // A A acabou sozinha: a B começa (P384). Parada no meio, não.
          if (which === "a" && !result.interrupted) {
            play("b", atStage);
            return;
          }
          setStatus("idle");
          setSide(null);
        });
      })
      .catch((error: unknown) => {
        if (!mine()) return;
        cancelAnimationFrame(frame.current);
        setStatus("idle");
        setSide(null);
        // O som barrado fora do gesto (a B depois da A, no <audio> de reserva): a rodada
        // continua, e o próximo Tocar começa pela B (regra 9).
        if (error instanceof AudioUnavailableError && error.kind === "blocked") {
          if (which === "b") resumeB.current = true;
          return;
        }
        onAudioError();
      });
  }

  function stop() {
    playId.current++;
    current.current = null;
    engine.stop();
    cancelAnimationFrame(frame.current);
    setStatus("idle");
    setSide(null);
  }

  function listenMore() {
    const next = stage + 1;
    setStage(next);
    play("a", next);
  }

  function choose(which: QuizSide) {
    stop();
    // O trecho liberado vai com a escolha: os pontos (o usuário, 28/10/2026).
    onChoose(which, stage);
  }

  const unlocked = secondsAt(stage, QUIZ_STAGES);
  const total = barSeconds(QUIZ_STAGES);
  const seekOf = (which: QuizSide) => ({
    label: t(which === "a" ? "quiz.seek.a" : "quiz.seek.b"),
    position: () => {
      const playing = current.current;
      return playing && playing.side === which
        ? Math.min(playing.from + playing.playback.elapsed(), unlocked)
        : 0;
    },
    valueText: (at: number) => t("player.seekValue", { at, unlocked, total }),
    onSeek: (seconds: number) => {
      if (!busy) play(which, stage, seconds);
    },
  });
  const extra = secondsAt(stage + 1, QUIZ_STAGES) - unlocked;

  return (
    <section class={explicit ? "player quiz-player has-explicit" : "player quiz-player"}>
      {explicit && <p class="badge explicit">{t("player.explicit")}</p>}
      <div class="quiz-pair">
        {SIDES.map((which) => (
          <div key={which} class={side === which ? "quiz-side playing" : "quiz-side"}>
            {/* O nome pequeno, e o "Tocando" diz em texto qual das duas toca, sem depender só da
                cor (o usuário, 27/10/2026). A letra grande de antes saiu: o foco da rodada é a
                pergunta (o usuário, 28/10/2026). */}
            <p class="quiz-side-name">
              <span>{t(which === "a" ? "quiz.side.a" : "quiz.side.b")}</span>
              {side === which && <span class="quiz-playing">{t("quiz.playing")}</span>}
            </p>
            <SegmentBar
              stage={stage}
              stages={QUIZ_STAGES}
              fillRef={fills[which]}
              seek={seekOf(which)}
            />
          </div>
        ))}
      </div>
      <div class="player-actions">
        {status === "playing" ? (
          <button ref={playButton} type="button" class="primary" onClick={singleClick(stop)}>
            {t("player.stop")}
          </button>
        ) : (
          <button
            ref={playButton}
            type="button"
            class="primary"
            aria-disabled={busy ? "true" : undefined}
            onClick={singleClick(() => {
              if (!busy) play(resumeB.current ? "b" : "a", stage);
            })}
          >
            {busy ? t("player.loading") : t("player.play", { seconds: unlocked })}
          </button>
        )}
        {stage < QUIZ_LAST_STAGE && (
          <button type="button" onClick={singleClick(listenMore)} disabled={busy}>
            <span>
              {t("player.listenMore")}{" "}
              <span class="extra">{t("player.extra", { seconds: extra })}</span>
            </span>
          </button>
        )}
        <VolumeControl engine={engine} />
      </div>
      {/* A escolha fica embaixo do Tocar, e não debaixo da barra, onde os outros modos têm o
          Tocar: quem vinha deles ia direto ao "Escolher a A" (o usuário, 28/10/2026). Até as
          duas tocarem, ela fica travada, com a dica do porquê. Escolher troca a tela (a
          revelação): o 2º clique de um toque duplo não pode cair no botão que fica no lugar
          (regra 23). */}
      <div class="quiz-choices">
        <p id={hintId} class="quiz-hint">
          {t(ready ? "quiz.hint.ready" : "quiz.hint.listen")}
        </p>
        {SIDES.map((which) => (
          <button
            key={which}
            type="button"
            aria-disabled={ready ? undefined : "true"}
            aria-describedby={hintId}
            onClick={singleClick(() => {
              if (ready) choose(which);
            })}
          >
            {t(which === "a" ? "quiz.pick.a" : "quiz.pick.b")}
          </button>
        ))}
      </div>
    </section>
  );
}

/** O número na escrita daqui: "41,5", "1.067". */
function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

/** "OP2" → "Abertura 2"; "ED" → "Encerramento"; "IN" → "Música de inserção". */
function themeLabel(label: string): string {
  const match = /^(OP|ED|IN)(\d*)$/.exec(label);
  if (!match) return label;
  const kind = t(`quiz.theme.${match[1] as "OP" | "ED" | "IN"}`);
  return match[2] ? t("quiz.themeNumber", { kind, number: match[2] }) : kind;
}

/** A estreia de uma das duas: o tipo gerado do par (`Pair & ...[]`) perde o objeto no índice. */
type Season = { readonly year: number; readonly season: "winter" | "spring" | "summer" | "fall" };

/** O dado da revelação de uma das duas (P382): o da pergunta, na ordem a e b; null sem ele. */
function infoText(info: QuizInfo | null, position: 0 | 1): string | null {
  if (!info) return null;
  const season = (info.seasons as readonly Season[] | undefined)?.[position];
  if (season) return t(`quiz.season.${season.season}`, { year: season.year });
  const year = info.years?.[position];
  if (typeof year === "number") return t("quiz.year", { year });
  const rate = info.rates?.[position];
  if (typeof rate === "number") return t("quiz.rate", { rate: formatNumber(rate) });
  const playlists = info.playlists?.[position];
  if (typeof playlists === "number") {
    return tn("quiz.playlists", playlists, { count: formatNumber(playlists) });
  }
  const theme = info.themes?.[position];
  if (typeof theme === "string") return themeLabel(theme);
  return null;
}

/**
 * A revelação: acertou ou errou (com as vidas), as duas músicas (a resposta e a escolha marcadas),
 * o dado da pergunta de cada uma e, nas do MAL, a diferença e o crédito dele (P382).
 */
function QuizReveal({
  daily,
  game,
  round,
  index,
  engine,
  urls,
  resolveUrl,
  announce,
  nextLabel,
  onNext,
  bonus,
}: {
  readonly daily: QuizDaily;
  readonly game: QuizState;
  readonly round: QuizRoundState;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  /** O endereço da prévia da A e da B, os mesmos da rodada (null enquanto busca). */
  readonly urls: readonly (string | null)[];
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly nextLabel: string;
  readonly onNext: () => void;
  readonly bonus: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const right = round.status === "right";
  // No bônus, o erro não tira vida nem encerra nada, e o acerto não tem pontos. As vidas contam a
  // de agora: "Errou. Vidas: 2." e "Errou. Última vida." (P377; o usuário, 28/10/2026).
  const lives = livesShown(game.errors);
  const title = right
    ? bonus
      ? t("quiz.revealRight")
      : t("quiz.revealRightPoints", { points: tn("count.points", quizRoundPoints(round)) })
    : bonus
      ? t("quiz.bonusWrong")
      : isQuizFinished(game)
        ? t("quiz.revealEnd")
        : lives === 1
          ? t("quiz.revealWrongLast")
          : t("quiz.revealWrong", { left: lives });
  const diff = round.info?.diff;
  return (
    <>
      <section class="reveal quiz-reveal" aria-labelledby="result">
        <h2 id="result" ref={heading} tabIndex={-1} class={right ? "won" : "lost"}>
          <Icon name={right ? "right" : "wrong"} />
          {title}
        </h2>
        <ul class="mixed-songs">
          {SIDES.map((which, position) => {
            const track = revealView(index, round[which]);
            if (!track) return null;
            const anime = track.themes[0]?.anime ?? "";
            const data = infoText(round.info, position as 0 | 1);
            const answer = round.answer === which;
            // O vermelho e o X só na escolha errada: a outra música, quando você acertou, não é
            // erro seu, e fica neutra, como as opções da revelação do Normal (o usuário, 27/10/2026).
            const missed = round.chosen === which && !answer;
            const tags = [
              t(which === "a" ? "quiz.side.a" : "quiz.side.b"),
              ...(answer ? [t("quiz.answer")] : []),
              ...(round.chosen === which ? [t("reveal.yourPick")] : []),
            ].join(" · ");
            return (
              <li key={which} class={answer ? "right" : missed ? "wrong" : undefined}>
                {track.artworkUrl ? (
                  <img src={resolveUrl(track.artworkUrl)} alt="" width={48} height={48} />
                ) : (
                  <span class="mixed-cover" aria-hidden="true" />
                )}
                <div>
                  <p class="mixed-note">
                    {(answer || missed) && <Icon name={answer ? "right" : "wrong"} />}
                    <span>{tags}</span>
                  </p>
                  <ItemLabel item={track} />
                  {track.themes.length > 0 && (
                    <p class="album">
                      {/* O tipo do tema antes do anime: o nome longo corta no fim, e o "OP"
                          não some (o usuário, 27/10/2026). */}
                      <span lang={langOf(anime)}>{themesText(track.themes, true)}</span>
                    </p>
                  )}
                  {data && <p class="quiz-data">{data}</p>}
                </div>
                {/* Ouvir cada uma inteira depois da escolha, só o botão, à direita da linha: a
                    barra não caberia, e a revelação não cresce (o usuário, 27/10/2026). */}
                <FullPreview
                  engine={engine}
                  url={urls[position] ?? null}
                  preview={track.preview}
                  announce={announce}
                  bar={false}
                />
              </li>
            );
          })}
        </ul>
        {typeof diff === "number" && (daily.family === "nota" || daily.family === "membros") && (
          <p class="quiz-data">{t(`quiz.diff.${daily.family}`, { diff: formatNumber(diff) })}</p>
        )}
        {isMalFamily(daily.family) && (
          <p class="quiz-credit">
            {/* O crédito em texto, sem logo (P256); o 2º clique de um toque duplo não segue. */}
            <a href={MAL_URL} target="_blank" rel="noopener noreferrer" onClick={singleClickLink}>
              {t("quiz.malCredit")}
            </a>
          </p>
        )}
        {/* O 2º clique de um toque duplo cairia na rodada seguinte (ME43). */}
        <button type="button" class="primary" onClick={singleClick(onNext)}>
          {nextLabel}
          <Icon name="next" />
        </button>
      </section>
      {index.catalog.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
    </>
  );
}

/** A rodada anulada: o player some com o foco, então ele vai para o botão de seguir. */
function QuizVoid({
  nextLabel,
  onNext,
}: {
  readonly nextLabel: string;
  readonly onNext: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const why = useId();
  useEffect(() => button.current?.focus(), []);
  return (
    <section class="void">
      <p id={why}>{t("quiz.void")}</p>
      {/* O motivo descreve o botão: o foco cai nele, e o leitor de tela ouve os dois. */}
      <button
        ref={button}
        type="button"
        class="primary"
        aria-describedby={why}
        onClick={singleClick(onNext)}
      >
        {nextLabel}
        <Icon name="next" />
      </button>
    </section>
  );
}
