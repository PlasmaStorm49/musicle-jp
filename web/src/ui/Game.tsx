import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  type FinishedGame,
  lockedMode,
  puzzleId,
  replaceProgress,
  type SaveV1,
  startSession,
  toFinishedGame,
  withFinished,
  withModeChoice,
  withProgress,
} from "../core/records.ts";
import {
  currentRound,
  type GameEvent,
  type GameState,
  isFinished,
  reduce,
} from "../core/reducer.ts";
import { canSkip, MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import { buildSearchIndex, search } from "../core/search.ts";
import type { AnswerMode, Day } from "../core/types.ts";
import { optionView, revealView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { type KeyValueStore, loadSave, type SaveStatus, updateSave } from "../storage/save.ts";
import { Attempts } from "./Attempts.tsx";
import { GuessInput, type Suggestion } from "./GuessInput.tsx";
import { ModePicker } from "./ModePicker.tsx";
import { Options } from "./Options.tsx";
import { Player } from "./Player.tsx";
import { Reveal } from "./Reveal.tsx";
import { Summary } from "./Summary.tsx";

type Props = {
  readonly day: Day;
  readonly date: string;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  /** Mensagem para a região aria-live (eventos assíncronos). */
  readonly announce: (message: string) => void;
  /** Onde o progresso é salvo; null = não salva nesta sessão. */
  readonly store: KeyValueStore | null;
  /** O save lido ao abrir a página. */
  readonly initialSave: SaveV1;
  /** Dias que existem na agenda (a sequência só conta estes, P40). */
  readonly scheduleDates: readonly string[];
  /** Endereço do jogo no texto compartilhado (sem parâmetros). */
  readonly shareUrl: string;
};

/** Recebe o resultado de cada gravação; na primeira falha, avisa na tela e no leitor de tela. */
type Report = (status: SaveStatus) => void;

const SAVE_NOTICE = {
  full: "storage.full",
  future: "storage.future",
  unavailable: "storage.unavailable",
} as const;

/** O resumo do dia com tudo o que ele precisa; o histórico já inclui o jogo de hoje. */
function DaySummary({ game, ...props }: Props & { readonly game: FinishedGame }) {
  const { store, initialSave, date } = props;
  const id = puzzleId(date, "song");
  // Relê o save: com duas abas, o que ficou gravado (o primeiro término) vale sobre o desta aba,
  // e as estatísticas incluem o que a outra aba terminou depois que esta página abriu.
  const history = useMemo(() => {
    const merged = { ...initialSave.history, ...(store ? loadSave(store).save.history : {}) };
    return { ...merged, [id]: merged[id] ?? game };
  }, [store, initialSave, id, game]);
  return (
    <>
      <header>
        <h1>{t("game.header", { number: props.day.number })}</h1>
      </header>
      <Summary
        game={history[id] ?? game}
        target="song"
        date={date}
        history={history}
        scheduleDates={props.scheduleDates}
        shareUrl={props.shareUrl}
        announce={props.announce}
      />
    </>
  );
}

type Played = { readonly game: GameState; readonly events: readonly GameEvent[] };

/** Só guarda o evento se ele mudou o estado: é a lista que permite retomar ao recarregar. */
function playReducer(played: Played, event: GameEvent): Played {
  const game = reduce(played.game, event);
  return game === played.game ? played : { game, events: [...played.events, event] };
}

/**
 * O Diário Música. Dia sem começar pede o modo (P13, P45); dia começado retoma no modo salvo;
 * dia terminado mostra direto o resultado (P39).
 */
export function Game(props: Props) {
  const { day, date, index, initialSave, store, announce } = props;
  const id = puzzleId(date, "song");
  const [mode, setMode] = useState<AnswerMode | null>(() => lockedMode(initialSave, id));
  const session = useMemo(
    () => (mode === null ? null : startSession(initialSave, day, date, "song", mode, index)),
    [initialSave, day, date, index, mode],
  );
  const start = useMemo(
    () => (session?.kind === "playing" ? { game: session.state, events: session.events } : null),
    [session],
  );

  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const noticed = useRef(false);
  const report = useCallback<Report>(
    (status) => {
      if (status === "saved" || noticed.current) return;
      noticed.current = true; // avisa uma vez só, mas o aviso fica na tela
      const message = t(SAVE_NOTICE[status]);
      setSaveNotice(message);
      announce(message);
    },
    [announce],
  );

  // Ao abrir, acerta o que está salvo: a repetição pode ter chegado a um jogo terminado que não
  // foi para o histórico, ou ter descartado eventos (catálogo novo) que impediriam gravar os
  // próximos, já que vence a lista mais longa.
  useEffect(() => {
    if (!store || !session) return;
    if (session.kind === "finished" && !initialSave.history[id]) {
      report(updateSave(store, (s) => withFinished(s, id, session.game)));
    } else if (session.kind === "playing" && session.stale) {
      const progress = { answerMode: session.state.answerMode, events: session.events };
      report(updateSave(store, (s) => replaceProgress(s, id, progress)));
    }
  }, [session, store, id, initialSave, report]);

  // Grava a escolha e relê: se outra aba já começou o dia, vale o modo dela (P13).
  const choose = useCallback(
    (chosen: AnswerMode) => {
      if (!store) return setMode(chosen);
      report(updateSave(store, (s) => withModeChoice(s, id, chosen)));
      setMode(lockedMode(loadSave(store).save, id) ?? chosen);
    },
    [store, id, report],
  );

  return (
    <>
      {saveNotice && <p class="notice">{saveNotice}</p>}
      {session === null && (
        <div class="game">
          <header>
            <h1>{t("game.header", { number: day.number })}</h1>
          </header>
          <ModePicker preferred={initialSave.settings.answerMode} onChoose={choose} />
        </div>
      )}
      {session?.kind === "finished" && <DaySummary {...props} game={session.game} />}
      {start && <Playing {...props} start={start} report={report} />}
    </>
  );
}

function Playing({
  start,
  report,
  ...props
}: Props & { readonly start: Played; readonly report: Report }) {
  const { day, date, index, engine, resolveUrl, announce, store } = props;
  const [played, dispatch] = useReducer(playReducer, start);
  const [summary, setSummary] = useState<FinishedGame | null>(null);
  const { game } = played;
  const round = currentRound(game);
  const isLast = game.current === game.rounds.length - 1;

  // Salva a cada evento aceito: em andamento, a lista de eventos; terminado, o resumo. O estado
  // inicial não precisa: ele acabou de sair do save.
  useEffect(() => {
    if (!store || played === start) return;
    const id = puzzleId(date, game.target);
    report(
      isFinished(game)
        ? updateSave(store, (s) => withFinished(s, id, toFinishedGame(game, day.number)))
        : updateSave(store, (s) =>
            withProgress(s, id, { answerMode: game.answerMode, events: played.events }),
          ),
    );
  }, [store, played, start, game, date, day.number, report]);

  const urls = useMemo(
    () =>
      game.rounds.map((r) => {
        const preview = revealView(index, r.trackId)?.preview;
        return preview ? resolveUrl(preview.url) : null;
      }),
    [game.rounds, index, resolveUrl],
  );
  const url = urls[game.current] ?? null;
  const nextUrl = urls[game.current + 1] ?? null;
  const preview = revealView(index, round.trackId)?.preview ?? null;

  // A busca do autocompletar: o índice sai do catálogo uma vez; "já tentou" é por música
  // (songKey), não por faixa, para outra versão da mesma música errada não parecer nova.
  const searchIndex = useMemo(() => buildSearchIndex(index), [index]);
  const triedSongs = useMemo(
    () =>
      new Set(
        round.attempts.flatMap((a) =>
          a.kind === "guess" ? [index.tracks.get(a.guessId)?.songKey ?? a.guessId] : [],
        ),
      ),
    [round.attempts, index],
  );
  const suggest = useCallback(
    (query: string): Suggestion[] =>
      search(searchIndex, query).flatMap((hit) => {
        const item = optionView(index, hit.id, "song");
        return item ? [{ id: hit.id, item, tried: triedSongs.has(hit.songKey) }] : [];
      }),
    [searchIndex, index, triedSongs],
  );

  // A cada rodada: guarda só o áudio dela e o da próxima, e já começa a baixar os dois.
  useEffect(() => {
    const keep = [url, nextUrl].filter((u): u is string => u !== null);
    engine.retain(keep);
    for (const u of keep) engine.preload(u);
  }, [engine, url, nextUrl]);

  function next() {
    if (isLast && isFinished(game)) setSummary(toFinishedGame(game, day.number));
    else dispatch({ type: "NEXT_ROUND" });
  }

  if (summary) return <DaySummary {...props} game={summary} />;

  const track = revealView(index, round.trackId);
  const rules = MODE_RULES[game.answerMode];
  // Próxima tentativa, contando a que acabou de ser gasta (para os anúncios de pulo e erro).
  const attemptLabel = (used: number) => ({ current: used + 1, total: rules.maxAttempts });

  function giveUp() {
    engine.stop();
    dispatch({ type: "GIVE_UP" });
  }

  function guess(id: string) {
    engine.stop();
    dispatch({ type: "GUESS", guessId: id });
    // Erro que não encerra a rodada: o foco fica no campo, então o aviso vai para o aria-live.
    // Acerto e último erro abrem a revelação, que leva o foco e se anuncia sozinha.
    const used = round.attempts.length + 1;
    if (!round.accepted.includes(id) && used < rules.maxAttempts) {
      const title = optionView(index, id, game.target)?.title ?? t("attempts.unknown");
      announce(t("typing.wrong", { title, ...attemptLabel(used) }));
    }
  }

  return (
    <div class="game">
      <header>
        <h1>{t("game.header", { number: day.number })}</h1>
        <p>{t("game.round", { current: game.current + 1, total: ROUNDS_PER_DAY })}</p>
      </header>

      {round.status === "playing" && url && preview && (
        <>
          <Player
            key={game.current}
            engine={engine}
            url={url}
            offset={preview.startSec}
            stage={round.stage}
            explicit={track?.explicit ?? false}
            rules={rules}
            skippable={canSkip(rules, round.attempts.length)}
            onListenMore={() => dispatch({ type: "LISTEN_MORE" })}
            onSkip={() => {
              dispatch({ type: "SKIP" });
              announce(t("typing.skipped", attemptLabel(round.attempts.length + 1)));
            }}
            onAudioError={() => {
              dispatch({ type: "VOID", round: game.current, reason: "audio" });
              announce(t("void.message"));
            }}
          />
          {game.answerMode === "choice" ? (
            <Options
              index={index}
              round={round}
              target={game.target}
              onPick={(id) => {
                engine.stop();
                dispatch({ type: "GUESS", guessId: id });
              }}
              onGiveUp={giveUp}
            />
          ) : (
            <section class="typing" aria-labelledby="question">
              <h2 id="question">{t("game.question")}</h2>
              <p class="hint">{t("typing.attempt", attemptLabel(round.attempts.length))}</p>
              <GuessInput suggest={suggest} onPick={guess} labelledBy="question" />
              <Attempts index={index} round={round} target={game.target} />
              <button type="button" class="link" onClick={giveUp}>
                {t("typing.giveUp")}
              </button>
            </section>
          )}
        </>
      )}

      {round.status === "void" && (
        <section class="void">
          <p>{t("void.message")}</p>
          <button type="button" class="primary" onClick={next}>
            {isLast ? t("reveal.finish") : t("reveal.next")}
          </button>
        </section>
      )}

      {(round.status === "won" || round.status === "lost") && (
        <Reveal
          key={game.current}
          index={index}
          round={round}
          target={game.target}
          answerMode={game.answerMode}
          engine={engine}
          resolveUrl={resolveUrl}
          isLast={isLast}
          onNext={next}
        />
      )}
    </div>
  );
}
