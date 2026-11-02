// O Setlist Royale (o usuário, 01/11/2026): o 3º submodo do artista. A rodada toca as músicas
// emendadas, uma vez só (o playChain do motor), e depois a pessoa marca as que tocaram; cada toque
// vale na hora. A run é do core/setlist.ts: aqui ficam o som, o sorteio das rodadas (a tela sorteia,
// o reducer recebe pronto) e as telas. Só o recorde vai ao save, pelo store do artista.
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type AudioEngine, AudioUnavailableError, canChain } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { SetlistBest } from "../core/records.ts";
import {
  activeSlots,
  beatenSetlist,
  CHAIN_FADE,
  chainTimeline,
  drawSetlistRound,
  SETLIST_FINAL,
  SETLIST_LIVES,
  type SetlistEvent,
  type SetlistRound,
  type SetlistRun,
  setlistBest,
  setlistOffset,
  setlistStep,
  tapsLeft,
} from "../core/setlist.ts";
import type { ArtistListEntry } from "../core/types.ts";
import { optionView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { ArtistName } from "./ArtistName.tsx";
import { Attribution } from "./Attribution.tsx";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { useMixPreviews } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { VolumeControl } from "./Player.tsx";
import { ConfirmButton } from "./PracticeRun.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly artist: ArtistListEntry;
  readonly run: SetlistRun;
  /** As músicas da run, da mais popular para a menos (`setlistPool`). */
  readonly pool: readonly string[];
  /** O recorde do artista quando a run começou: o fim diz o que ela bateu. */
  readonly before: SetlistBest | null;
  readonly index: CatalogIndex;
  readonly resolver: PreviewResolver;
  readonly engine: AudioEngine;
  readonly announce: (message: string) => void;
  /** Mudança sobre a run de agora (quem a guarda a aplica, se ela ainda existir). */
  readonly onChange: (change: (run: SetlistRun) => SetlistRun) => void;
  /** Outra run com o mesmo artista. */
  readonly onAgain: () => void;
  /** "Trocar de artista": volta à lista (P127). */
  readonly onSwitch: () => void;
};

const NONE: readonly string[] = [];

/** O "Rodada 4 de 10", ou "Rodada 12 · sem fim" depois da setlist completa. */
function roundLabel(run: SetlistRun, round: SetlistRound): string {
  return run.endless
    ? t("setlist.roundEndless", { number: round.number })
    : t("setlist.round", { number: round.number, total: SETLIST_FINAL });
}

/** As vidas como no quiz (P401): "Vidas: 3", "Vidas: 2" e "Última vida". */
function livesLabel(lives: number): string {
  return lives === 1 ? t("setlist.lastLife") : t("setlist.lives", { count: lives });
}

/** O que a run já fez: "3 rodadas completas, 11 músicas achadas". */
function doneLabel(run: SetlistRun): string {
  return t("setlist.done", {
    rounds: tn("setlist.cleared", run.cleared),
    found: tn("setlist.foundTotal", run.found),
  });
}

/**
 * A run do Setlist Royale: o cabeçalho (a rodada, as vidas e o Encerrar) e a fase. Só ela guarda e
 * pré-carrega o áudio: enquanto a pessoa ouve, só a rodada atual; depois, só a próxima, já
 * sorteada. A que tocou não toca de novo, e o motor a solta (no máximo 8 prévias em memória).
 */
export function SetlistView({
  artist,
  run,
  pool,
  before,
  index,
  resolver,
  engine,
  announce,
  onChange,
  onAgain,
  onSwitch,
}: Props) {
  const dispatch = useCallback(
    (event: SetlistEvent) => onChange((r) => setlistStep(r, event)),
    [onChange],
  );
  const [noChain, setNoChain] = useState(false);
  const round = run.round;
  const toComplete = round?.number === SETLIST_FINAL && !run.endless;
  const upcoming = useMemo(
    () =>
      round && (run.phase === "pick" || run.phase === "reveal") && !run.end && !toComplete
        ? drawSetlistRound(pool, round.number + 1, run.plays, run.seed)
        : null,
    [round, run.phase, run.end, run.plays, run.seed, pool, toComplete],
  );
  const listening = run.phase === "listen" && round !== null;
  const current = listening ? round.played : NONE;
  const next = upcoming?.played ?? NONE;
  const batchKey = [...current, ...next].join("\n");
  const batch = useMemo(() => (batchKey === "" ? [] : batchKey.split("\n")), [batchKey]);
  const { urls, done } = useMixPreviews(engine, resolver, batch, current, next);

  if (noChain) {
    return (
      <section class="game practice setlist error screen">
        <FocusedNotice text={t("setlist.noChain")} />
        <div class="artists-actions">
          <button type="button" class="primary" onClick={singleClick(onSwitch)}>
            {t("artists.restart")}
          </button>
        </div>
      </section>
    );
  }
  if (run.phase === "over" || !round) {
    return (
      <SetlistEnd artist={artist} run={run} before={before} onAgain={onAgain} onSwitch={onSwitch} />
    );
  }
  if (run.phase === "complete") {
    return (
      <SetlistComplete
        artist={artist}
        run={run}
        before={before}
        onContinue={() =>
          dispatch({
            type: "CONTINUE",
            round: drawSetlistRound(pool, round.number + 1, run.plays, run.seed),
          })
        }
        onAgain={onAgain}
        onSwitch={onSwitch}
      />
    );
  }

  const quit = () => dispatch({ type: "QUIT" });
  return (
    <div class="game practice setlist screen">
      <header class="session-head">
        <h1>
          <ArtistName entry={artist} />{" "}
          <span class="title-sep" aria-hidden="true">
            {t("item.artistSeparator")}
          </span>{" "}
          <span class="variant-tag">{t("setlist.name")}</span>
        </h1>
        <p>{roundLabel(run, round)}</p>
        <p class="setlist-lives">{livesLabel(run.lives)}</p>
        {/* Escondido, mas no lugar, na revelação que leva ao fim (como no Superfan). */}
        <ConfirmButton
          label={t("setlist.quit")}
          short={t("setlist.quitShort")}
          warning={t("setlist.quitWarning", { done: doneLabel(run) })}
          confirm={t("setlist.quitConfirm")}
          ask={run.cleared > 0 || run.found > 0}
          onConfirm={quit}
          concealed={run.end !== null}
        />
      </header>
      {run.phase === "listen" ? (
        <SetlistListen
          key={`${round.number}|${round.attempt}`}
          run={run}
          round={round}
          index={index}
          urls={urls}
          resolved={done}
          engine={engine}
          announce={announce}
          dispatch={dispatch}
          redraw={() =>
            drawSetlistRound(
              pool,
              round.number,
              run.plays,
              run.seed,
              round.attempt + 1,
              round.played,
            )
          }
          onNoChain={() => setNoChain(true)}
        />
      ) : (
        <SetlistBoard
          key={`${round.number}|${round.attempt}|${run.phase}`}
          run={run}
          round={round}
          index={index}
          announce={announce}
          dispatch={dispatch}
          nextLabel={
            run.end ? t("setlist.result") : toComplete ? t("setlist.toComplete") : t("setlist.next")
          }
          onNext={() => dispatch({ type: "NEXT", round: upcoming })}
        />
      )}
      {index.catalog.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
    </div>
  );
}

/**
 * Ouvir: as casas numeradas (uma por música, que acendem quando ela toca) e o Tocar, que vale uma
 * vez só. A sequência interrompida (a aba oculta, uma falha, a pessoa saiu da aba) faz a rodada ser
 * sorteada de novo, sem custo: ouvir as mesmas seria ouvir duas vezes.
 */
function SetlistListen({
  run,
  round,
  index,
  urls,
  resolved,
  engine,
  announce,
  dispatch,
  redraw,
  onNoChain,
}: {
  readonly run: SetlistRun;
  readonly round: SetlistRound;
  readonly index: CatalogIndex;
  readonly urls: readonly (string | null)[];
  readonly resolved: readonly boolean[];
  readonly engine: AudioEngine;
  readonly announce: (message: string) => void;
  readonly dispatch: (event: SetlistEvent) => void;
  readonly redraw: () => SetlistRound | null;
  readonly onNoChain: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const playButton = useRef<HTMLButtonElement>(null);
  const slots = useRef<(HTMLLIElement | null)[]>([]);
  const frame = useRef(0);
  const playId = useRef(0);
  const alive = useRef(true);
  const timeline = useMemo(
    () => chainTimeline(round.played.length, round.number),
    [round.played.length, round.number],
  );
  const busy = status === "loading" || urls.some((url) => url === null);
  const locked = run.started || status !== "idle";

  // A ficha guarda a função de agora: os efeitos e as promessas leem a mais nova. O aviso diz se
  // a sequência chegou a tocar (`heard`) ou se a rodada saiu de novo antes (a prévia que falta, a
  // falha de rede).
  const voidRound = useRef((_heard: boolean) => {});
  voidRound.current = (heard) => {
    const round = redraw();
    if (!round) return;
    dispatch({ type: "VOID", round });
    announce(heard ? t("setlist.voided") : t("setlist.redrawn"));
  };

  // O foco vai ao Tocar ao montar (a rodada nova, a volta pela nav), como no Player.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.closest("main")) {
      playButton.current?.focus();
    }
  }, []);

  // Desmontar para o som e o laço das casas.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

  // A sequência que tocava quando a pessoa saiu da aba volta com a rodada já começada: na volta,
  // ela é sorteada de novo. Só o valor da montagem: o `started` de depois é o desta montagem.
  const [startedBefore] = useState(run.started);
  useEffect(() => {
    if (startedBefore) voidRound.current(true);
  }, [startedBefore]);

  // Uma música sem prévia nenhuma (nem o lookup nem a reserva do catálogo): a rodada sai de novo.
  const missing = urls.some((url, i) => url === null && resolved[i]);
  useEffect(() => {
    if (missing && !run.started) voidRound.current(false);
  }, [missing, run.started]);

  function draw(elapsed: () => number) {
    const at = elapsed();
    const on = activeSlots(timeline, at);
    for (const [i, slot] of slots.current.entries()) {
      const span = timeline[i];
      if (!slot || !span) continue;
      slot.classList.toggle("on", on.includes(i));
      slot.classList.toggle("past", at >= span.at + span.seconds);
    }
  }

  function play() {
    if (busy || locked) return;
    // O <audio> de reserva não toca duas prévias juntas: sem o Web Audio, o modo não roda.
    if (!canChain(engine)) {
      onNoChain();
      return;
    }
    const tracks = round.played.map((id, i) => {
      const slot = timeline[i] ?? { at: 0, seconds: 0 };
      const duration = index.tracks.get(id)?.preview?.durationSec ?? null;
      return {
        url: urls[i] ?? "",
        offset: setlistOffset(run.seed, round, id, duration, slot.seconds),
        at: slot.at,
        seconds: slot.seconds,
      };
    });
    const id = ++playId.current;
    const mine = () => alive.current && playId.current === id;
    setStatus("loading");
    // O playChain destrava o áudio na hora, dentro deste clique (regra 9).
    engine
      .playChain(tracks, { fade: CHAIN_FADE })
      .then((playback) => {
        if (!mine()) return;
        if (!playback) {
          setStatus("idle");
          return;
        }
        dispatch({ type: "PLAYED" });
        setStatus("playing");
        const loop = () => {
          draw(playback.elapsed);
          frame.current = requestAnimationFrame(loop);
        };
        cancelAnimationFrame(frame.current);
        loop();
        return playback.done.then((result) => {
          if (!mine()) return;
          cancelAnimationFrame(frame.current);
          if (result.interrupted) {
            setStatus("idle");
            voidRound.current(true);
          } else {
            dispatch({ type: "HEARD" });
          }
        });
      })
      .catch((error: unknown) => {
        if (!mine()) return;
        cancelAnimationFrame(frame.current);
        setStatus("idle");
        // O som barrado fora do gesto: nada tocou, e o próximo clique toca.
        const kind = error instanceof AudioUnavailableError ? error.kind : null;
        if (kind === "blocked") return;
        if (kind === "decode") onNoChain();
        else voidRound.current(false);
      });
  }

  // Carregando (as prévias, ou a decodificação depois do clique), tocando, ou pronto para tocar.
  const label =
    status === "loading" || (busy && !locked)
      ? t("player.loading")
      : locked
        ? t("setlist.playing")
        : t("setlist.play");
  return (
    <section class="setlist-listen">
      <p class="hint setlist-note">{tn("setlist.listen", round.played.length)}</p>
      <ol class="setlist-slots" aria-label={t("setlist.slots")}>
        {round.played.map((id, i) => (
          <li
            key={id}
            class="setlist-slot"
            ref={(el) => {
              slots.current[i] = el;
            }}
            aria-label={t("setlist.slot", { number: i + 1 })}
          >
            {i + 1}
          </li>
        ))}
      </ol>
      <div class="player-actions">
        <button
          ref={playButton}
          type="button"
          class="primary"
          // Ocupado ou já tocado: o aria-disabled, e não o disabled, que tiraria o foco (ME37).
          aria-disabled={busy || locked ? "true" : undefined}
          onClick={singleClick(play)}
        >
          {label}
        </button>
        <VolumeControl engine={engine} />
      </div>
    </section>
  );
}

/**
 * Escolher e revelar: as opções numa grade de 3 colunas. Escolhendo, cada toque vale na hora (✓ ou
 * ✗); revelando, a mesma grade diz a ordem em que cada música tocou, as achadas, as que faltaram e
 * as erradas.
 */
function SetlistBoard({
  run,
  round,
  index,
  announce,
  dispatch,
  nextLabel,
  onNext,
}: {
  readonly run: SetlistRun;
  readonly round: SetlistRound;
  readonly index: CatalogIndex;
  readonly announce: (message: string) => void;
  readonly dispatch: (event: SetlistEvent) => void;
  readonly nextLabel: string;
  readonly onNext: () => void;
}) {
  const reveal = run.phase === "reveal";
  const list = useRef<HTMLUListElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  // Escolhendo, o foco vai à 1ª opção (o Tocar sumiu); revelando, ao resultado.
  useEffect(() => {
    if (reveal) result.current?.focus();
    else list.current?.querySelector("button")?.focus();
  }, [reveal]);

  function pick(id: string) {
    const after = setlistStep(run, { type: "PICK", id });
    if (after === run) return;
    dispatch({ type: "PICK", id });
    // O toque que fecha a rodada leva o foco ao resultado, que já diz tudo.
    if (after.phase !== "pick") return;
    announce(
      round.played.includes(id)
        ? t("setlist.right")
        : t("setlist.wrong", { left: tn("setlist.livesLeft", after.lives) }),
    );
  }

  const found = run.picks.filter((id) => round.played.includes(id)).length;
  const lost = run.picks.length - found;
  return (
    <section class="setlist-board">
      {reveal ? (
        <p ref={result} class="setlist-result" tabIndex={-1}>
          {t("setlist.found", { found, total: round.played.length })}{" "}
          {run.end === "errors"
            ? t("setlist.over", { total: SETLIST_LIVES })
            : lost > 0 && tn("setlist.lostLives", lost)}
        </p>
      ) : (
        <p id="setlist-pick-hint" class="hint setlist-note">
          {tn("setlist.pick", tapsLeft(run))}
        </p>
      )}
      <ul
        ref={list}
        class="options setlist-options"
        aria-label={t("setlist.options")}
        aria-describedby={reveal ? undefined : "setlist-pick-hint"}
      >
        {round.options.map((id) => {
          const view = optionView(index, id, "song");
          if (!view) return null;
          const picked = run.picks.includes(id);
          const played = round.played.indexOf(id);
          const mark = picked
            ? played >= 0
              ? "correct"
              : "wrong"
            : reveal && played >= 0
              ? "missed"
              : "";
          const status =
            mark === "correct"
              ? t("setlist.orderLabel", { number: played + 1 })
              : mark === "wrong"
                ? t("setlist.wrongLabel")
                : mark === "missed"
                  ? t("setlist.missedLabel", { number: played + 1 })
                  : "";
          return (
            <li key={id} class={mark || undefined}>
              <button
                type="button"
                class={mark ? `option setlist-option ${mark}` : "option setlist-option"}
                // O já tocado e a revelação: o aria-disabled deixa o foco na grade (ME37).
                aria-disabled={picked || reveal ? "true" : undefined}
                // O 2º clique do toque duplo cai na opção do lado (regra 23).
                onClick={singleClick(() => !reveal && pick(id))}
              >
                {mark === "correct" || mark === "wrong" ? (
                  <span class="setlist-mark" aria-hidden="true">
                    <Icon name={mark === "correct" ? "right" : "wrong"} />
                  </span>
                ) : null}
                <span class="item setlist-item">
                  <span class="item-title setlist-title" lang={view.lang}>
                    {view.title}
                  </span>
                  {view.titleLatin && (
                    <span class="item-latin setlist-latin">{view.titleLatin}</span>
                  )}
                </span>
                {/* A ordem em que tocou, só na revelação (escolhendo, entregaria quem tocou). */}
                {reveal && played >= 0 && (
                  <span class="setlist-order" aria-hidden="true">
                    {t("setlist.order", { number: played + 1 })}
                  </span>
                )}
                {status && <span class="sr-only">{t("setlist.optionStatus", { status })}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {reveal && (
        <button type="button" class="primary" onClick={singleClick(onNext)}>
          {nextLabel}
        </button>
      )}
    </section>
  );
}

/** Os recordes que a run passou (o anterior é o de antes dela; a 1ª não tem o que bater). */
function NewBests({
  run,
  before,
}: {
  readonly run: SetlistRun;
  readonly before: SetlistBest | null;
}) {
  const best = setlistBest(run);
  const beaten = beatenSetlist(before, best);
  if (!before) return null;
  return (
    <>
      {beaten.rounds && (
        <p class="superfan-best">
          {t("setlist.newBestRounds", { previous: tn("setlist.rounds", before.rounds) })}
        </p>
      )}
      {beaten.found && (
        <p class="superfan-best">
          {t("setlist.newBestFound", { previous: tn("setlist.songs", before.found) })}
        </p>
      )}
    </>
  );
}

/** O subtítulo das telas do fim: o artista e o submodo. */
function SubTitle({ artist }: { readonly artist: ArtistListEntry }) {
  return (
    <p>
      <ArtistName entry={artist} /> <span aria-hidden="true">{t("item.artistSeparator")}</span>{" "}
      {t("setlist.name")}
    </p>
  );
}

/**
 * A setlist completa (as 10 rodadas): o resultado e o sem fim, na dificuldade da 10ª, à escolha.
 * Tela nova: o foco vai ao título.
 */
function SetlistComplete({
  artist,
  run,
  before,
  onContinue,
  onAgain,
  onSwitch,
}: {
  readonly artist: ArtistListEntry;
  readonly run: SetlistRun;
  readonly before: SetlistBest | null;
  readonly onContinue: () => void;
  readonly onAgain: () => void;
  readonly onSwitch: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div class="game practice setlist screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("setlist.completeTitle")}
        </h1>
        <SubTitle artist={artist} />
      </header>
      <section class="superfan-end">
        <p>{t("setlist.completeText", { total: SETLIST_FINAL })}</p>
        <p class="practice-score">{doneLabel(run)}</p>
        <p>{livesLabel(run.lives)}</p>
        <NewBests run={run} before={before} />
        <p class="hint" id="setlist-continue-hint">
          {t("setlist.continueHint")}
        </p>
        <div class="artists-actions">
          <button
            type="button"
            class="primary"
            aria-describedby="setlist-continue-hint"
            onClick={singleClick(onContinue)}
          >
            {t("setlist.continue")}
          </button>
          <button type="button" onClick={singleClick(onAgain)}>
            {t("setlist.again")}
          </button>
          <button type="button" onClick={singleClick(onSwitch)}>
            {t("artists.restart")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** O fim da run: o motivo, o que ela fez e os recordes batidos. Tela nova: o foco vai ao título. */
function SetlistEnd({
  artist,
  run,
  before,
  onAgain,
  onSwitch,
}: {
  readonly artist: ArtistListEntry;
  readonly run: SetlistRun;
  readonly before: SetlistBest | null;
  readonly onAgain: () => void;
  readonly onSwitch: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const reason =
    run.end === "errors"
      ? t("setlist.endErrors", { total: SETLIST_LIVES })
      : run.end === "quit"
        ? t("setlist.endQuit")
        : t("setlist.endEmpty");
  return (
    <div class="game practice setlist screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("setlist.endTitle")}
        </h1>
        <SubTitle artist={artist} />
      </header>
      <section class="superfan-end">
        <p>{reason}</p>
        {run.end !== "empty" && <p class="practice-score">{doneLabel(run)}</p>}
        <NewBests run={run} before={before} />
        <div class="artists-actions">
          <button type="button" class="primary" onClick={singleClick(onAgain)}>
            {t("setlist.again")}
          </button>
          <button type="button" onClick={singleClick(onSwitch)}>
            {t("artists.restart")}
          </button>
        </div>
      </section>
    </div>
  );
}
