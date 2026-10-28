// Um diário das Misturadas (M17), como o Game dos diários: retoma pelos eventos salvos, grava a
// cada evento aceito e mostra o resumo do dia. Sem as estatísticas e a sequência, que ficam para
// depois (P333): o resumo tem os pontos, o compartilhar e a contagem; num dia passado, pelo
// Histórico, a marca do jogado depois e a volta ao dia.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  isMixedFinished,
  MIXED_ROUNDS,
  type MixedDaily,
  type MixedEvent,
  type MixedGame as MixedGameRecord,
  type MixedState,
  mixedMax,
  mixedReducer,
  mixedRoundScore,
  mixedRoundTag,
  mixedScore,
  mixedShareText,
  replaceMixedProgress,
  startMixedSession,
  toMixedGame,
  withMixedFinished,
  withMixedProgress,
} from "../core/mixed.ts";
import { isLate, type Save } from "../core/records.ts";
import { routeHref } from "../core/routes.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { type KeyValueStore, loadSave, type SaveStatus, updateSave } from "../storage/save.ts";
import { Countdown } from "./Countdown.tsx";
import { shortDate } from "./dayLabel.ts";
import { useMixPreviews } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { MixedRoundView } from "./MixedRound.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { singleClickLink } from "./singleClick.ts";

type Props = {
  readonly daily: MixedDaily;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** Onde o progresso é salvo; null = não salva nesta sessão. */
  readonly store: KeyValueStore | null;
  /** O save lido quando a aba abriu. Só vale na montagem. */
  readonly initialSave: Save;
  /** Avisa o App que o dia terminou e foi gravado (o ✓ da aba). */
  readonly onSaved: () => void;
  /**
   * O resultado do dia acabou de aparecer (o "Ver resultado" da última rodada): o App confere as
   * medalhas novas (ME123), como no Game. Nem ao reabrir um dia terminado, nem na revelação.
   */
  readonly onResult?: () => void;
  readonly shareUrl: string;
  /** O "hoje" do jogo: o diário de um dia antes dele termina como jogado depois (`isLate`). */
  readonly today: string;
};

type Report = (status: SaveStatus, finished?: boolean) => void;

const SAVE_NOTICE = {
  full: "storage.full",
  future: "storage.future",
  unavailable: "storage.unavailable",
} as const;

/** "Misturadas · Música", sem o número do diário (o usuário, 28/10/2026). */
function header(daily: MixedDaily): string {
  return t(`daily.${daily.key}`);
}

type Played = { readonly game: MixedState; readonly events: readonly MixedEvent[] };

/** Só guarda o evento se ele mudou o estado: é a lista que permite retomar ao recarregar. */
function playReducer(played: Played, event: MixedEvent): Played {
  const game = mixedReducer(played.game, event);
  return game === played.game ? played : { game, events: [...played.events, event] };
}

export function MixedGame(props: Props) {
  const { daily, index, initialSave, store, announce, onSaved, today } = props;
  const [base] = useState(initialSave);
  const { id } = daily;
  const session = useMemo(
    () => startMixedSession(base, daily, index, today),
    [base, daily, index, today],
  );
  const start = useMemo(
    () => (session.kind === "playing" ? { game: session.state, events: session.events } : null),
    [session],
  );

  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const noticed = useRef(false);
  const report = useCallback<Report>(
    (status, finished = false) => {
      if (finished && (status === "saved" || status === "full")) onSaved();
      if (status === "saved" || noticed.current) return;
      noticed.current = true; // avisa uma vez só, mas o aviso fica na tela
      const message = t(SAVE_NOTICE[status]);
      setSaveNotice(message);
      announce(message);
    },
    [announce, onSaved],
  );

  // Ao abrir, acerta o que está salvo, como no Game: o jogo que a repetição terminou vai para os
  // terminados, e a lista que perdeu eventos (catálogo novo) é trocada.
  useEffect(() => {
    if (!store) return;
    if (session.kind === "finished" && !base.mixed.finished[id]) {
      report(
        updateSave(store, (s) => withMixedFinished(s, id, session.game)),
        true,
      );
    } else if (session.kind === "playing" && session.stale) {
      const progress = { events: session.events };
      report(updateSave(store, (s) => replaceMixedProgress(s, id, progress)));
    }
  }, [session, store, id, base, report]);

  return (
    <>
      {saveNotice && <p class="notice">{saveNotice}</p>}
      {session.kind === "finished" && <MixedSummary {...props} game={session.game} />}
      {start && <Playing {...props} start={start} report={report} />}
    </>
  );
}

function Playing({
  start,
  report,
  ...props
}: Props & { readonly start: Played; readonly report: Report }) {
  const { daily, index, engine, resolver, resolveUrl, announce, store, today } = props;
  const { id, number } = daily;
  const late = isLate(daily.date, today);
  const [played, dispatch] = useReducer(playReducer, start);
  const [summary, setSummary] = useState<MixedGameRecord | null>(null);
  const { game } = played;
  const isLast = game.current === game.rounds.length - 1;

  // Salva a cada evento aceito: em andamento, a lista de eventos; terminado, o resumo.
  useEffect(() => {
    if (!store || played === start) return;
    if (isMixedFinished(game)) {
      report(
        updateSave(store, (s) => withMixedFinished(s, id, toMixedGame(game, number, late))),
        true,
      );
    } else {
      report(updateSave(store, (s) => withMixedProgress(s, id, { events: played.events })));
    }
  }, [store, played, start, game, id, number, late, report]);

  // As prévias do diário numa consulta só; o motor guarda as da rodada e as da próxima.
  const batch = useMemo(() => daily.rounds.flat(), [daily]);
  const trackIds = (n: number) => game.rounds[n]?.songs.map((song) => song.trackId) ?? [];
  const { urls, done } = useMixPreviews(
    engine,
    resolver,
    batch,
    trackIds(game.current),
    trackIds(game.current + 1),
  );

  // As medalhas novas, depois do resumo na tela, e não no clique: o efeito que grava o fim do dia
  // roda antes deste, e a reivindicação o encontra (como no Game).
  const { onResult } = props;
  useEffect(() => {
    if (summary) onResult?.();
  }, [summary, onResult]);

  function next() {
    if (isLast && isMixedFinished(game)) setSummary(toMixedGame(game, number, late));
    else dispatch({ type: "NEXT_ROUND" });
  }

  if (summary) return <MixedSummary {...props} game={summary} />;

  // A rodada difícil avisa no cabeçalho (P325): músicas mais difíceis ou mais músicas juntas.
  const tag = mixedRoundTag(game.current, trackIds(game.current).length);

  return (
    <div class="game mixed screen">
      <header class="round-head">
        <h1>{header(daily)}</h1>
        <p>
          {t("game.round", { current: game.current + 1, total: MIXED_ROUNDS })}
          {tag && <span class="round-tag">{t(`mixed.tag.${tag}`)}</span>}
        </p>
      </header>
      <MixedRoundView
        game={game}
        dispatch={dispatch}
        index={index}
        engine={engine}
        urls={urls}
        resolved={done}
        resolveUrl={resolveUrl}
        announce={announce}
        nextLabel={isLast ? t("reveal.finish") : t("reveal.next")}
        onNext={next}
      />
    </div>
  );
}

/** O texto de uma rodada no resumo: a frase inteira (o leitor de tela) e os pontos da célula. */
function roundTexts(round: MixedGameRecord["rounds"][number]) {
  if (round.status === "void") return { result: t("summary.void"), points: t("summary.void") };
  const found = round.found.filter((f) => f !== null).length;
  const points = tn("count.points", mixedRoundScore(round));
  return {
    result: t("mixed.summaryResult", { found, total: round.found.length, points }),
    points,
  };
}

/**
 * O fim do dia, a partir do resumo salvo: os pontos, as rodadas, o compartilhar, a volta à escolha
 * do modo e a contagem do próximo diário; num dia passado, a marca do jogado depois e a volta ao
 * dia no Histórico, no lugar da contagem. Relê o save: com duas abas, vale o 1º término.
 */
function MixedSummary({ game, ...props }: Props & { readonly game: MixedGameRecord }) {
  const { store, daily, announce, shareUrl, today } = props;
  const past = isLate(daily.date, today);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const saved = useMemo(
    () => (store ? loadSave(store).save.mixed.finished[daily.id] : undefined),
    [store, daily.id],
  );
  const shown = saved ?? game;
  const plainHeader = t("share.headerMixed", {
    title: t("app.title"),
    mode: t(`mixed.shareMode.${daily.mode}`),
    date: shortDate(daily.date),
  });
  const shareHeader = shown.late ? t("share.late", { header: plainHeader }) : plainHeader;
  return (
    <div class="game mixed screen">
      <header class="round-head">
        <h1>{header(daily)}</h1>
      </header>
      <section class="summary mixed-summary" aria-labelledby="summary-title">
        <h2 id="summary-title" ref={heading} tabIndex={-1}>
          {t("summary.title")}
        </h2>
        <p class="score">
          {t("summary.score", { score: mixedScore(shown), max: mixedMax(shown) })}
        </p>
        <ol class="summary-rounds">
          {shown.rounds.map((round, i) => {
            const { result, points } = roundTexts(round);
            const all = round.found.every((f) => f !== null);
            return (
              // A ordem das 4 rodadas é fixa: o número é uma chave estável.
              <li
                key={`round-${i + 1}`}
                class={round.status === "void" ? "void" : all ? "won" : "lost"}
              >
                <span class="sr-only">{t("summary.round", { number: i + 1, result })}</span>
                <span aria-hidden="true">{t("summary.roundShort", { number: i + 1 })}</span>
                {round.status !== "void" && <Icon name={all ? "right" : "wrong"} />}
                <span class="round-points" aria-hidden="true">
                  {points}
                </span>
              </li>
            );
          })}
        </ol>
        {shown.late && <p class="summary-late">{t("mixed.lateNote")}</p>}
        <ShareButton text={mixedShareText(shareHeader, shown, shareUrl)} announce={announce} />
        {/* A volta à escolha do modo, como a do Anime (P322). O 2º clique de um toque duplo no
            "Ver resultado" não segue o link (regra 23). */}
        <a
          class="summary-levels"
          href={routeHref({ tab: "misturadas", date: past ? daily.date : null })}
          onClick={singleClickLink}
        >
          <span class="back-chevron" aria-hidden="true">
            <Icon name="next" />
          </span>
          <span aria-hidden="true">{t("anime.backToLevels")}</span>
          <span class="sr-only">{t("mixed.backFull")}</span>
        </a>
        {past ? (
          // Sem a contagem: num dia passado, ela já estaria zerada (como no resumo dos diários).
          <a
            class="summary-back"
            href={routeHref({ tab: "history", date: daily.date })}
            onClick={singleClickLink}
          >
            {t("history.backToDay")}
          </a>
        ) : (
          <Countdown date={daily.date} announce={announce} />
        )}
      </section>
    </div>
  );
}
