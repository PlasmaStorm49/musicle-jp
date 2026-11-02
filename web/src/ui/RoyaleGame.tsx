// Uma dificuldade do Anime Royale (o usuário, 01/11/2026), como o diário das Misturadas: retoma
// pelos eventos salvos, grava a cada marcação e mostra o resultado, com as 5 que tocaram, o
// compartilhar, a próxima dificuldade por jogar e a contagem. Sem estatísticas nem sequência.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import {
  isRoyaleFinished,
  ROYALE_PLAYED,
  type RoyaleDaily,
  type RoyaleEvent,
  type RoyaleGame as RoyaleGameRecord,
  type RoyaleState,
  replaceRoyaleProgress,
  royaleFound,
  royaleOption,
  royaleReducer,
  royaleScore,
  royaleShareLine,
  royaleShareText,
  startRoyaleSession,
  toRoyaleGame,
  withRoyaleFinished,
  withRoyaleProgress,
} from "../core/royale.ts";
import { revealView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { type KeyValueStore, loadSave, type SaveStatus, updateSave } from "../storage/save.ts";
import { Attribution } from "./Attribution.tsx";
import { Countdown } from "./Countdown.tsx";
import { shortDate } from "./dayLabel.ts";
import { FullPreview } from "./FullPreview.tsx";
import { useMixPreviews, useResolvedUrls } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { CoverArt, RoyaleRoundView, themeText } from "./RoyaleRound.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { singleClickLink } from "./singleClick.ts";

type Props = {
  readonly daily: RoyaleDaily;
  /** A próxima dificuldade de hoje por jogar, para o botão do resultado; null com as outras feitas. */
  readonly next: RoyaleDaily | null;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** Onde o progresso é salvo; null = não salva nesta sessão. */
  readonly store: KeyValueStore | null;
  /** O save lido quando a aba abriu. Só vale na montagem. */
  readonly initialSave: Save;
  /** Avisa o App que a dificuldade terminou e foi gravada. */
  readonly onSaved: () => void;
  /** O resultado acabou de aparecer (o App confere as medalhas novas, como nos outros diários). */
  readonly onResult?: () => void;
  readonly shareUrl: string;
};

type Report = (status: SaveStatus, finished?: boolean) => void;

const SAVE_NOTICE = {
  full: "storage.full",
  future: "storage.future",
  unavailable: "storage.unavailable",
} as const;

type Played = { readonly game: RoyaleState; readonly events: readonly RoyaleEvent[] };

/** Só guarda o evento se ele mudou o estado: é a lista que permite retomar ao recarregar. */
function playReducer(played: Played, event: RoyaleEvent): Played {
  const game = royaleReducer(played.game, event);
  return game === played.game ? played : { game, events: [...played.events, event] };
}

export function RoyaleGame(props: Props) {
  const { daily, initialSave, store, announce, onSaved } = props;
  const [base] = useState(initialSave);
  const { id } = daily;
  const session = useMemo(() => startRoyaleSession(base, daily), [base, daily]);
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

  // Ao abrir, acerta o que está salvo, como nas Misturadas: o jogo que a repetição terminou vai
  // para os terminados, e a lista que perdeu eventos é trocada.
  useEffect(() => {
    if (!store) return;
    if (session.kind === "finished" && !base.royale.finished[id]) {
      report(
        updateSave(store, (s) => withRoyaleFinished(s, id, session.game)),
        true,
      );
    } else if (session.kind === "playing" && session.stale) {
      const progress = { events: session.events };
      report(updateSave(store, (s) => replaceRoyaleProgress(s, id, progress)));
    }
  }, [session, store, id, base, report]);

  return (
    <>
      {saveNotice && <p class="notice">{saveNotice}</p>}
      {session.kind === "finished" && <RoyaleResult {...props} game={session.game} />}
      {start && <Playing {...props} start={start} report={report} />}
    </>
  );
}

function Playing({
  start,
  report,
  ...props
}: Props & { readonly start: Played; readonly report: Report }) {
  const { daily, index, engine, resolver, resolveUrl, announce, store } = props;
  const { id, number } = daily;
  const [played, dispatch] = useReducer(playReducer, start);
  const { game } = played;
  const over = isRoyaleFinished(game);

  // Salva a cada evento aceito: em andamento, a lista de eventos; terminado, o resultado.
  useEffect(() => {
    if (!store || played === start) return;
    if (isRoyaleFinished(game)) {
      report(
        updateSave(store, (s) => withRoyaleFinished(s, id, toRoyaleGame(game, number))),
        true,
      );
    } else {
      report(updateSave(store, (s) => withRoyaleProgress(s, id, { events: played.events })));
    }
  }, [store, played, start, game, id, number, report]);

  // As 5 prévias numa consulta só; o motor as guarda e já as baixa.
  const { urls, done } = useMixPreviews(engine, resolver, daily.played, daily.played, []);

  // As medalhas novas, depois do resultado na tela (o efeito que grava o fim roda antes deste).
  const { onResult } = props;
  useEffect(() => {
    if (over) onResult?.();
  }, [over, onResult]);

  if (over) return <RoyaleResult {...props} game={toRoyaleGame(game, number)} />;

  // O que falta, ao lado do título, como a rodada dos outros diários: a grade não desce.
  const left = daily.played.length - royaleFound(game);
  return (
    <div class="game royale screen">
      <header class="round-head">
        <h1>{t(`daily.${daily.key}`)}</h1>
        <p>{tn("mixed.left", left)}</p>
      </header>
      <RoyaleRoundView
        daily={daily}
        state={game}
        dispatch={dispatch}
        index={index}
        engine={engine}
        urls={urls}
        resolved={done}
        resolveUrl={resolveUrl}
        announce={announce}
      />
    </div>
  );
}

/**
 * O resultado, a partir do registro salvo (com duas abas, vale o 1º término): os acertos, a linha
 * do compartilhar, as 5 que tocaram (a capa, o anime, a música, o artista e a prévia inteira), o
 * compartilhar, a próxima dificuldade, a volta à escolha e a contagem.
 */
function RoyaleResult({ game, ...props }: Props & { readonly game: RoyaleGameRecord }) {
  const { store, daily, next, index, engine, resolver, resolveUrl, announce, shareUrl } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const saved = useMemo(
    () => (store ? loadSave(store).save.royale.finished[daily.id] : undefined),
    [store, daily.id],
  );
  const shown = saved ?? game;
  const { urls } = useResolvedUrls(resolver, daily.played);
  const shareHeader = t("share.headerRoyale", {
    title: t("app.title"),
    level: t(`anime.level.${daily.tier}`),
    date: shortDate(daily.date),
  });
  const ending = shown.quit ? t("royale.resultQuit") : shown.wrong ? t("royale.resultWrong") : null;
  return (
    <div class="game royale screen">
      <header class="round-head">
        <div class="round-title">
          {/* A volta à escolha da dificuldade, antes do título, como no resumo dos Hits. O 2º
              clique de um toque duplo no último Marcar não segue o link (regra 23). */}
          <a class="back-link" href={ROUTES["anime-royale"]} onClick={singleClickLink}>
            <span class="back-chevron" aria-hidden="true">
              <Icon name="next" />
            </span>
            <span class="sr-only">{t("royale.backToLevels")}</span>
          </a>
          <h1>{t(`daily.${daily.key}`)}</h1>
        </div>
      </header>
      <section class="summary royale-summary" aria-labelledby="royale-result-title">
        <h2 id="royale-result-title" ref={heading} tabIndex={-1}>
          {t("royale.resultTitle")}
        </h2>
        <p class="royale-score">
          {t("royale.result", { found: royaleScore(shown), total: ROYALE_PLAYED })}
          <span class="royale-share-line" aria-hidden="true">
            {royaleShareLine(shown)}
          </span>
        </p>
        {ending && <p class="hint royale-ending">{ending}</p>}
        <ol class="royale-played" aria-label={t("royale.played")}>
          {daily.played.map((id, at) => {
            const option = royaleOption(index, id);
            const view = revealView(index, id);
            if (!option || !view) return null;
            const found = shown.found.includes(at);
            return (
              <li key={id} class={found ? "found" : "missed"}>
                <CoverArt
                  option={option}
                  size="small"
                  provider={index.catalog.provider}
                  resolveUrl={resolveUrl}
                />
                <span class="royale-played-text">
                  <span class="royale-played-anime">
                    <Icon name={found ? "right" : "wrong"} />
                    <span class="sr-only">
                      {found ? t("royale.playedFound") : t("royale.playedMissed")}:{" "}
                    </span>
                    {option.anime} · {themeText(option)}
                  </span>
                  <span class="royale-played-song">
                    <span lang={view.lang}>{view.title}</span>
                    {" · "}
                    <span class="royale-played-artist" lang={view.artistLang}>
                      {view.artist}
                    </span>
                  </span>
                </span>
                <FullPreview
                  engine={engine}
                  url={urls[at] ?? null}
                  preview={view.preview}
                  announce={announce}
                  bar={false}
                />
              </li>
            );
          })}
        </ol>
        <div class="royale-actions">
          <ShareButton text={royaleShareText(shareHeader, shown, shareUrl)} announce={announce} />
          {next && (
            // O 2º clique de um toque duplo no último "Marcar" não segue o link (regra 23).
            <a class="summary-next" href={ROUTES[next.key]} onClick={singleClickLink}>
              {t("anime.playNext", { level: t(`anime.level.${next.tier}`) })}
            </a>
          )}
        </div>
        <Countdown date={daily.date} announce={announce} />
      </section>
      {index.catalog.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
    </div>
  );
}
