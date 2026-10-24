// Uma rodada das Misturadas (M17): o player da mistura, o campo, as ações e a revelação. Não sabe
// de save nem de agenda: quem chama (MixedGame) cuida de gravar, do cabeçalho e do que vem depois.
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import {
  type AudioEngine,
  AudioUnavailableError,
  canMix,
  type MixPlayback,
} from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { spreadPans } from "../core/mix.ts";
import {
  currentMixedRound,
  findsOf,
  MIXED_LAST_STAGE,
  MIXED_POINTS,
  MIXED_STAGES,
  type MixedEvent,
  type MixedRoundState,
  type MixedState,
  mixedReducer,
  mixedRoundScore,
} from "../core/mixed.ts";
import { fillFraction } from "../core/player.ts";
import { secondsAt } from "../core/rules.ts";
import { guessView, langOf, revealView } from "../core/view.ts";
import { t, tn } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { Attribution } from "./Attribution.tsx";
import { GuessInput } from "./GuessInput.tsx";
import { useSuggest } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { ItemLabel } from "./ItemLabel.tsx";
import { VolumeControl } from "./Player.tsx";
import { themesText } from "./Reveal.tsx";
import { SegmentBar } from "./SegmentBar.tsx";
import { singleClick } from "./singleClick.ts";

/** Os motivos de uma rodada anulada que a tela distingue: o navegador que não mistura. */
export const NO_MIX = "mix";

type Props = {
  readonly game: MixedState;
  readonly dispatch: (event: MixedEvent) => void;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  /** O endereço da prévia de cada música da rodada (null enquanto busca) e se já respondeu. */
  readonly urls: readonly (string | null)[];
  readonly resolved: readonly boolean[];
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** "Próxima rodada" ou "Ver resultado". */
  readonly nextLabel: string;
  readonly onNext: () => void;
};

export function MixedRoundView({
  game,
  dispatch,
  index,
  engine,
  urls,
  resolved,
  resolveUrl,
  announce,
  nextLabel,
  onNext,
}: Props) {
  const round = currentMixedRound(game);
  const roundKey = game.current;
  const playing = round.status === "playing";

  function voidRound(noMix: boolean) {
    dispatch({ type: "VOID", round: game.current, reason: noMix ? NO_MIX : "audio" });
    announce(noMix ? t("mixed.noMix") : t("void.message"));
  }

  // Uma música sem prévia nenhuma (nem o lookup nem a reserva do catálogo): a mistura não tem como
  // tocar, e a rodada é anulada, como numa falha de áudio.
  const missing = playing && urls.some((url, i) => url === null && resolved[i]);
  // O efeito lê a função de agora pela ficha: roda só quando a falta aparece.
  const onMissing = useRef(voidRound);
  onMissing.current = voidRound;
  useEffect(() => {
    if (missing) onMissing.current(false);
  }, [missing]);

  if (round.status === "void") {
    const text = round.voidReason === NO_MIX ? t("mixed.noMix") : t("void.message");
    return <MixedVoid key={roundKey} text={text} nextLabel={nextLabel} onNext={onNext} />;
  }
  if (round.status === "done") {
    return (
      <MixedReveal
        key={roundKey}
        index={index}
        round={round}
        resolveUrl={resolveUrl}
        nextLabel={nextLabel}
        onNext={onNext}
      />
    );
  }

  const answer = game.answer;
  const offsets = round.songs.map((song) => {
    // O trecho mais longo cabe inteiro na prévia: o começo do catálogo, ou antes dele.
    const preview = index.tracks.get(song.trackId)?.preview;
    const room = Math.max(
      0,
      (preview?.durationSec ?? 30) - secondsAt(MIXED_LAST_STAGE, MIXED_STAGES),
    );
    return Math.min(preview?.startSec ?? 0, room);
  });

  function guess(id: string) {
    const event = { type: "GUESS", guessId: id } as const;
    // O reducer é puro: dá para ver o resultado antes de despachar, sem repetir as regras aqui. O
    // palpite que não muda nada (repetido, ou que acha uma música já achada) não para o som.
    const next = mixedReducer(game, event);
    if (next === game) return;
    const after = next.rounds[game.current];
    const found = (r: MixedRoundState) => r.songs.filter((s) => s.found !== null).length;
    const hit = !!after && found(after) > found(round);
    // O erro abre o trecho seguinte: o de agora para, e o novo toca no Tocar. O acerto deixa a
    // mistura tocando, inteira: a achada continua nela (o usuário, 24/10/2026).
    if (!hit) engine.stop();
    dispatch(event);
    // A revelação leva o foco e se anuncia sozinha; o palpite que não muda nada não diz nada.
    if (after?.status !== "playing" || after.attempts.length === round.attempts.length) {
      return;
    }
    const title = guessView(index, id, "song", answer)?.title ?? t("attempts.unknown");
    announce(
      hit
        ? t("mixed.right", { title, left: tn("mixed.left", after.songs.length - found(after)) })
        : t("mixed.wrong", { title, seconds: secondsAt(after.stage, MIXED_STAGES) }),
    );
  }

  function skip() {
    dispatch({ type: "SKIP" });
    announce(t("mixed.skipped", { seconds: secondsAt(round.stage + 1, MIXED_STAGES) }));
  }

  function separate() {
    if (!round.separated) dispatch({ type: "SEPARATE" });
  }

  function giveUp() {
    engine.stop();
    dispatch({ type: "GIVE_UP" });
  }

  const explicit = round.songs.some((song) => index.tracks.get(song.trackId)?.explicit);
  return (
    <>
      <MixPlayer
        key={roundKey}
        engine={engine}
        urls={urls}
        offsets={offsets}
        separated={round.separated}
        stage={round.stage}
        explicit={explicit}
        onSkip={skip}
        onAudioError={voidRound}
      />
      <MixedTyping
        index={index}
        round={round}
        answer={answer}
        onPick={guess}
        onSeparate={separate}
        onGiveUp={giveUp}
      />
      {/* No fim da página (P112, ME58). O link é a playlist, não as respostas. */}
      {index.catalog.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
    </>
  );
}

type PlayerProps = {
  readonly engine: AudioEngine;
  readonly urls: readonly (string | null)[];
  /** De onde cada prévia começa. */
  readonly offsets: readonly number[];
  readonly separated: boolean;
  readonly stage: number;
  readonly explicit: boolean;
  readonly onSkip: () => void;
  /** `noMix`: o navegador não toca as prévias juntas (o <audio> de reserva assumiu). */
  readonly onAudioError: (noMix: boolean) => void;
};

/**
 * O player da mistura: Tocar e Parar, o Pular e a barra dos 4 trechos, como o do Desafio, com a
 * mistura no lugar da prévia sozinha. As músicas tocam juntas a rodada inteira, também as achadas
 * (o usuário, 24/10/2026: só o "Separar" ajuda), e o "Separar" leva cada uma ao seu lado, já
 * tocando.
 */
function MixPlayer({
  engine,
  urls,
  offsets,
  separated,
  stage,
  explicit,
  onSkip,
  onAudioError,
}: PlayerProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const fillRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const playButton = useRef<HTMLButtonElement>(null);
  // A mistura tocando, com as músicas na ordem da rodada.
  const current = useRef<MixPlayback | null>(null);
  const playId = useRef(0);
  const alive = useRef(true);
  const pans = spreadPans(urls.length);
  const waiting = urls.some((url) => url === null);
  const busy = status === "loading" || waiting;

  // O foco vai ao Tocar ao montar (a rodada nova, a volta pela nav), se ele não está no campo.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.closest("main")) {
      playButton.current?.focus();
    }
  }, []);

  // Desmontar (a revelação, a rodada seguinte) para o som e o laço da barra.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

  // O "Separar" leva a mistura tocando, cada música ao seu lado. A ficha guarda o de agora para a
  // mistura que ainda carrega: o "Separar" no "Carregando…" vale quando ela começa.
  const latest = useRef(separated);
  latest.current = separated;
  useEffect(() => {
    if (current.current && separated) panApart(current.current, urls.length);
  }, [separated, urls.length]);

  function play() {
    if (busy) return;
    // O <audio> de reserva não mistura: sem o Web Audio, a rodada é anulada.
    if (!canMix(engine)) {
      onAudioError(true);
      return;
    }
    // Todas as prévias da rodada: o `busy` já garante que nenhuma falta.
    const tracks = urls.map((url, i) => ({
      url: url ?? "",
      offset: offsets[i] ?? 0,
      pan: separated ? (pans[i] ?? 0) : 0,
    }));
    const id = ++playId.current;
    const mine = () => alive.current && playId.current === id;
    const seconds = secondsAt(stage, MIXED_STAGES);
    setStatus("loading");
    current.current = null;
    // O playMix destrava o áudio na hora, dentro deste clique (regra 9).
    engine
      .playMix(tracks, seconds, { normalize: true, limit: true })
      .then((playback) => {
        if (!mine()) return;
        if (!playback) {
          setStatus("idle");
          return;
        }
        current.current = playback;
        if (latest.current) panApart(playback, urls.length);
        setStatus("playing");
        const draw = () => {
          if (fillRef.current) {
            const width = fillFraction(playback.elapsed(), stage, MIXED_STAGES) * 100;
            fillRef.current.style.width = `${width}%`;
          }
          frame.current = requestAnimationFrame(draw);
        };
        cancelAnimationFrame(frame.current);
        draw();
        return playback.done.then(() => {
          if (!mine()) return;
          current.current = null;
          cancelAnimationFrame(frame.current);
          setStatus("idle");
        });
      })
      .catch((error: unknown) => {
        if (!mine()) return;
        cancelAnimationFrame(frame.current);
        setStatus("idle");
        // O som barrado fora do gesto: a rodada continua, e o próximo clique toca.
        const kind = error instanceof AudioUnavailableError ? error.kind : null;
        if (kind === "blocked") return;
        onAudioError(kind === "decode");
      });
  }

  function stop() {
    playId.current++;
    current.current = null;
    engine.stop();
    cancelAnimationFrame(frame.current);
    setStatus("idle");
  }

  // Com singleClick: o toque duplo não abre 2 trechos. O novo só toca no Tocar (P46).
  function skip() {
    stop();
    onSkip();
    playButton.current?.focus();
  }

  const extra = secondsAt(stage + 1, MIXED_STAGES) - secondsAt(stage, MIXED_STAGES);
  return (
    <section class={explicit ? "player has-explicit" : "player"}>
      {explicit && <p class="badge explicit">{t("player.explicit")}</p>}
      <SegmentBar stage={stage} stages={MIXED_STAGES} fillRef={fillRef} />
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
            // Ocupado: o aria-disabled, e não o disabled, que tiraria o foco do botão (ME37).
            aria-disabled={busy ? "true" : undefined}
            onClick={singleClick(play)}
          >
            {busy
              ? t("player.loading")
              : t("player.play", { seconds: secondsAt(stage, MIXED_STAGES) })}
          </button>
        )}
        {stage < MIXED_LAST_STAGE && (
          <button type="button" onClick={singleClick(skip)} disabled={status === "loading"}>
            <span>
              {t("typing.skip")} <span class="extra">{t("player.extra", { seconds: extra })}</span>
            </span>
          </button>
        )}
        <VolumeControl engine={engine} />
      </div>
    </section>
  );
}

/**
 * O "Separar" na mistura tocando: cada uma das `count` músicas no seu lado, na ordem da rodada.
 * Repetir não muda nada (o lado já é o mesmo).
 */
function panApart(playback: MixPlayback, count: number) {
  for (const [i, pan] of spreadPans(count).entries()) playback.setPan(i, pan);
}

/** O campo, as tentativas, o "Separar" e o "Desistir". */
function MixedTyping({
  index,
  round,
  answer,
  onPick,
  onSeparate,
  onGiveUp,
}: {
  readonly index: CatalogIndex;
  readonly round: MixedRoundState;
  readonly answer: MixedState["answer"];
  readonly onPick: (id: string) => void;
  readonly onSeparate: () => void;
  readonly onGiveUp: () => void;
}) {
  // A música já achada não volta na lista: as outras versões dela, ou a outra franquia dela no
  // "acertar o anime", aparecem como "já tentou".
  const tried = useMemo(
    () => ({
      attempts: [
        ...round.attempts,
        ...round.songs.flatMap((song) =>
          song.found === null
            ? []
            : song.accepted.map((guessId) => ({ kind: "guess", guessId, correct: true }) as const),
        ),
      ],
    }),
    [round],
  );
  const suggest = useSuggest(index, tried, answer);
  const hintId = useId();
  const found = round.songs.filter((song) => song.found !== null).length;
  // A altura das tentativas fica reservada (regra 25): os erros e pulos que cabem (um por trecho
  // antes do último) e os acertos antes do último.
  const slots = { "--slots": MIXED_LAST_STAGE + round.songs.length - 1 };
  return (
    <section class="typing" style={slots} aria-labelledby="question">
      <div class="question-row">
        <h2 id="question">
          {answer === "franchise" ? t("mixed.questionAnime") : t("mixed.questionSong")}
        </h2>
        <p class="hint">{t("mixed.found", { found, total: round.songs.length })}</p>
      </div>
      <GuessInput
        suggest={suggest}
        onPick={onPick}
        labelledBy="question"
        scope={answer === "franchise" ? "anime" : "song"}
      />
      <div class="attempts-slot">
        <Attempts index={index} round={round} answer={answer} hideTitle />
      </div>
      {/* O "Separar" à esquerda e o "Desistir" à direita, longe um do outro (ME71). */}
      <div class="typing-actions">
        <button
          type="button"
          class="help"
          aria-pressed={round.separated}
          aria-disabled={round.separated ? "true" : undefined}
          aria-describedby={hintId}
          // Alterna no mesmo lugar: o 2º clique de um toque duplo não conta (regra 23).
          onClick={singleClick(onSeparate)}
        >
          {t("mixed.separate")}
          {round.separated && <span aria-hidden="true"> ✓</span>}
        </button>
        {/* O custo do "Separar" fica na dica, e não no botão (regra 8). */}
        <span id={hintId} class="sr-only">
          {t("mixed.separateHint")}
        </span>
        <button type="button" class="give-up" onClick={singleClick(onGiveUp)}>
          {t("typing.giveUp")}
        </button>
      </div>
    </section>
  );
}

/**
 * A revelação da rodada: quantas achou e os pontos, e cada música com o anime e o trecho em que
 * foi achada (ou que faltou).
 */
function MixedReveal({
  index,
  round,
  resolveUrl,
  nextLabel,
  onNext,
}: {
  readonly index: CatalogIndex;
  readonly round: MixedRoundState;
  readonly resolveUrl: (url: string) => string;
  readonly nextLabel: string;
  readonly onNext: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const total = round.songs.length;
  const found = round.songs.filter((song) => song.found !== null).length;
  const points = mixedRoundScore({ status: round.status, found: findsOf(round) });
  const all = found === total;
  const title = all
    ? t("mixed.revealAll", { points, max: MIXED_POINTS[0] ?? points })
    : found > 0
      ? t("mixed.revealSome", { found, total, points: tn("count.points", points) })
      : t("mixed.revealNone");
  return (
    <>
      <section class="reveal mixed-reveal" aria-labelledby="result">
        <h2
          id="result"
          ref={heading}
          tabIndex={-1}
          class={all ? "won" : found === 0 ? "lost" : undefined}
        >
          {(all || found === 0) && <Icon name={all ? "right" : "wrong"} />}
          {title}
        </h2>
        <ul class="mixed-songs">
          {round.songs.map((song) => {
            const track = revealView(index, song.trackId);
            if (!track) return null;
            const anime = track.themes[0]?.anime ?? "";
            const note =
              song.found === null
                ? t("mixed.missed")
                : t(song.helped ? "mixed.foundHelp" : "mixed.foundAt", {
                    seconds: secondsAt(song.found, MIXED_STAGES),
                  });
            return (
              <li key={song.trackId} class={song.found === null ? "wrong" : "right"}>
                {track.artworkUrl ? (
                  <img src={resolveUrl(track.artworkUrl)} alt="" width={48} height={48} />
                ) : (
                  <span class="mixed-cover" aria-hidden="true" />
                )}
                <div>
                  <ItemLabel item={track} />
                  {track.themes.length > 0 && (
                    <p class="album">
                      <span lang={langOf(anime)}>{themesText(track.themes)}</span>
                    </p>
                  )}
                  <p class="mixed-note">
                    <Icon name={song.found === null ? "wrong" : "right"} />
                    <span>{note}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
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
function MixedVoid({
  text,
  nextLabel,
  onNext,
}: {
  readonly text: string;
  readonly nextLabel: string;
  readonly onNext: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section class="void">
      <p>{text}</p>
      <button ref={button} type="button" class="primary" onClick={singleClick(onNext)}>
        {nextLabel}
        <Icon name="next" />
      </button>
    </section>
  );
}
