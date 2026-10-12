import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  type FinishedGame,
  pendingDayTracks,
  puzzleId,
  replaceProgress,
  type Save,
  startSession,
  toFinishedGame,
  withFinished,
  withProgress,
} from "../core/records.ts";
import { type GameEvent, type GameState, isFinished, reduce } from "../core/reducer.ts";
import { HELP_AFTER, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { Day, Target } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t } from "../i18n/t.ts";
import { type KeyValueStore, loadSave, type SaveStatus, updateSave } from "../storage/save.ts";
import { usePreviews } from "./hooks.ts";
import { modeName } from "./modes.ts";
import { type HelpSetup, RoundView } from "./RoundView.tsx";
import { Summary } from "./Summary.tsx";

type Props = {
  /** Qual diário: o Normal ("album") ou o Desafio ("song"). */
  readonly target: Target;
  readonly day: Day;
  readonly date: string;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  /** Mensagem para a região aria-live (eventos assíncronos). */
  readonly announce: (message: string) => void;
  /** Onde o progresso é salvo; null = não salva nesta sessão. */
  readonly store: KeyValueStore | null;
  /** O save lido quando esta aba abriu (o App relê a cada troca de aba). Só vale na montagem. */
  readonly initialSave: Save;
  /** Avisa o App que o dia terminou e foi gravado (✓ da aba, exclusão do Treino). */
  readonly onSaved: () => void;
  /** Dias que existem na agenda (a sequência só conta estes, P40). */
  readonly scheduleDates: readonly string[];
  /** Endereço do jogo no texto compartilhado (sem parâmetros). */
  readonly shareUrl: string;
};

/**
 * Recebe o resultado de cada gravação; na primeira falha, avisa na tela e no leitor de tela.
 * `finished`: a gravação foi o fim do dia, e o App precisa saber (✓ da aba, exclusão do Treino).
 */
type Report = (status: SaveStatus, finished?: boolean) => void;

const SAVE_NOTICE = {
  full: "storage.full",
  future: "storage.future",
  unavailable: "storage.unavailable",
} as const;

function header(target: Target, number: number): string {
  return t("game.header", { mode: modeName(target), number });
}

/** O resumo do dia com tudo o que ele precisa; o histórico já inclui o jogo de hoje. */
function DaySummary({ game, ...props }: Props & { readonly game: FinishedGame }) {
  const { store, initialSave, date, target } = props;
  const id = puzzleId(date, target);
  // Relê o save: com duas abas, o que ficou gravado (o primeiro término) vale sobre o desta aba,
  // e as estatísticas incluem o que a outra aba terminou depois que esta página abriu.
  const history = useMemo(() => {
    const merged = { ...initialSave.history, ...(store ? loadSave(store).save.history : {}) };
    return { ...merged, [id]: merged[id] ?? game };
  }, [store, initialSave, id, game]);
  return (
    <>
      <header>
        <h1>{header(target, props.day.number)}</h1>
      </header>
      <Summary
        game={history[id] ?? game}
        target={target}
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
 * Um diário (Normal ou Desafio). Dia começado retoma pelos eventos salvos; dia terminado mostra
 * direto o resultado (P39).
 */
export function Game(props: Props) {
  const { target, day, date, index, initialSave, store, announce, onSaved, resolver } = props;
  // O save da abertura da aba, guardado na montagem: o App passa o save relido a cada gravação,
  // e recalcular a sessão com ele pularia a revelação da última rodada (o dia já estaria no
  // histórico). Cada troca de aba remonta o diário (key no App) e relê.
  const [base] = useState(initialSave);
  // As faixas do dia (Normal e Desafio) numa consulta só, já na carga (decisão 7 do plano): no
  // clique a URL quase sempre já chegou, e o Tocar nasce liberado. Só as dos diários sem
  // resultado: o terminado mostra o resumo, que não toca nada.
  const dayTracks = useMemo(() => pendingDayTracks(base, day, date), [base, day, date]);
  useEffect(() => resolver.prefetch(dayTracks), [resolver, dayTracks]);
  const id = puzzleId(date, target);
  const session = useMemo(
    () => startSession(base, day, date, target, index),
    [base, day, date, target, index],
  );
  const start = useMemo(
    () => (session.kind === "playing" ? { game: session.state, events: session.events } : null),
    [session],
  );

  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const noticed = useRef(false);
  const report = useCallback<Report>(
    (status, finished = false) => {
      // Com a cota cheia o fim do dia fica na memória da sessão (sessionStore): o App relê dali.
      if (finished && (status === "saved" || status === "full")) onSaved();
      if (status === "saved" || noticed.current) return;
      noticed.current = true; // avisa uma vez só, mas o aviso fica na tela
      const message = t(SAVE_NOTICE[status]);
      setSaveNotice(message);
      announce(message);
    },
    [announce, onSaved],
  );

  // Ao abrir, acerta o que está salvo: a repetição pode ter chegado a um jogo terminado que não
  // foi para o histórico, ou ter descartado eventos (catálogo novo) que impediriam gravar os
  // próximos, já que vence a lista mais longa.
  useEffect(() => {
    if (!store) return;
    if (session.kind === "finished" && !base.history[id]) {
      report(
        updateSave(store, (s) => withFinished(s, id, session.game)),
        true,
      );
    } else if (session.kind === "playing" && session.stale) {
      const progress = { events: session.events };
      report(updateSave(store, (s) => replaceProgress(s, id, progress)));
    }
  }, [session, store, id, base, report]);

  return (
    <>
      {saveNotice && <p class="notice">{saveNotice}</p>}
      {session.kind === "finished" && (
        <DaySummary {...props} initialSave={base} game={session.game} />
      )}
      {start && <Playing {...props} initialSave={base} start={start} report={report} />}
    </>
  );
}

function Playing({
  start,
  report,
  ...props
}: Props & { readonly start: Played; readonly report: Report }) {
  const { day, date, index, engine, resolver, resolveUrl, announce, store } = props;
  const [played, dispatch] = useReducer(playReducer, start);
  const [summary, setSummary] = useState<FinishedGame | null>(null);
  const { game } = played;
  const isLast = game.current === game.rounds.length - 1;
  // A ajuda do Desafio só depois da 3ª tentativa gasta (P149), e nunca com uma resposta de
  // hoje (as dos dois diários): as opções são as mesmas para todo mundo (helpSeed).
  const help = useMemo<HelpSetup>(() => {
    const answers = [...day.song, ...day.album].map((r) => index.tracks.get(r.answer)?.songKey);
    return {
      after: HELP_AFTER.daily,
      avoid: new Set(answers.filter((key): key is string => key !== undefined)),
    };
  }, [day, index]);

  // Salva a cada evento aceito: em andamento, a lista de eventos; terminado, o resumo. O estado
  // inicial não precisa: ele acabou de sair do save.
  useEffect(() => {
    if (!store || played === start) return;
    const id = puzzleId(date, game.target);
    if (isFinished(game)) {
      report(
        updateSave(store, (s) => withFinished(s, id, toFinishedGame(game, day.number))),
        true,
      );
    } else {
      report(updateSave(store, (s) => withProgress(s, id, { events: played.events })));
    }
  }, [store, played, start, game, date, day.number, report]);

  // As 3 rodadas deste diário: o lote do dia inteiro já saiu na carga do Game; aqui só garante
  // as que faltarem e pré-carrega a atual e a próxima.
  const trackIds = useMemo(() => game.rounds.map((r) => r.trackId), [game.rounds]);
  usePreviews(
    engine,
    resolver,
    trackIds,
    trackIds[game.current] ?? null,
    trackIds[game.current + 1] ?? null,
  );

  function next() {
    if (isLast && isFinished(game)) setSummary(toFinishedGame(game, day.number));
    else dispatch({ type: "NEXT_ROUND" });
  }

  if (summary) return <DaySummary {...props} game={summary} />;

  return (
    <div class="game">
      <header>
        <h1>{header(game.target, day.number)}</h1>
        <p>{t("game.round", { current: game.current + 1, total: ROUNDS_PER_DAY })}</p>
      </header>
      <RoundView
        game={game}
        dispatch={dispatch}
        index={index}
        engine={engine}
        resolver={resolver}
        resolveUrl={resolveUrl}
        announce={announce}
        roundKey={game.current}
        nextLabel={isLast ? t("reveal.finish") : t("reveal.next")}
        onNext={next}
        help={help}
      />
    </div>
  );
}
