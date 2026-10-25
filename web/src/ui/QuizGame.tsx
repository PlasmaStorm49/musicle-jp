// A run do quiz do dia (M18), como o MixedGame das Misturadas: retoma pelos eventos salvos (o
// usuário, 25/10/2026), grava a cada evento aceito e mostra o fim da run. Sem estatísticas nem
// medalhas, que ficam para um PR seguinte, junto com o Histórico do quiz.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  bonusDailies,
  createQuizGame,
  isQuizFinished,
  livesLeft,
  type QuizDaily,
  type QuizEvent,
  type QuizGame as QuizGameRecord,
  type QuizState,
  quizReached,
  quizReducer,
  quizRight,
  quizShareText,
  replaceQuizProgress,
  startQuizSession,
  toQuizGame,
  withQuizFinished,
  withQuizProgress,
} from "../core/quiz.ts";
import { isLate, type Save } from "../core/records.ts";
import type { QuizBonus } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { type MessageKey, ptBR } from "../i18n/pt-BR.ts";
import { t, tn } from "../i18n/t.ts";
import { type KeyValueStore, loadSave, type SaveStatus, updateSave } from "../storage/save.ts";
import { Countdown } from "./Countdown.tsx";
import { useMixPreviews } from "./hooks.ts";
import { QuizRoundView } from "./QuizRound.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly daily: QuizDaily;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** Onde o progresso é salvo; null = não salva nesta sessão. */
  readonly store: KeyValueStore | null;
  /** O save lido quando a aba abriu. Só vale na montagem. */
  readonly initialSave: Save;
  /** Avisa o App que a run terminou e foi gravada (o ✓ da aba). */
  readonly onSaved: () => void;
  readonly shareUrl: string;
  /** O "hoje" do jogo. */
  readonly today: string;
  /** O bônus de estreia (o usuário, 25/10/2026): o botão aparece no fim da run do dia dele. */
  readonly bonus: QuizBonus | null;
};

type Report = (status: SaveStatus, finished?: boolean) => void;

const SAVE_NOTICE = {
  full: "storage.full",
  future: "storage.future",
  unavailable: "storage.unavailable",
} as const;

/** A chave existe nos textos: a agenda vem de fora, e uma família ou fonte nova não quebra a tela. */
function isKey(key: string): key is MessageKey {
  return key in ptBR;
}

/** A pergunta do dia, com o parâmetro (a fonte traduzida; o rótulo e o estúdio, como vêm). */
export function questionText(daily: QuizDaily): string {
  const source = `quiz.source.${String(daily.param)}`;
  const param = daily.family === "fonte" && isKey(source) ? t(source) : String(daily.param ?? "");
  const key = `quiz.q.${daily.family}.${daily.direction}`;
  return isKey(key) ? t(key, { param }) : t("quiz.title");
}

type Played = { readonly game: QuizState; readonly events: readonly QuizEvent[] };

/** Só guarda o evento se ele mudou o estado: é a lista que permite retomar ao recarregar. */
function playReducer(played: Played, event: QuizEvent): Played {
  const game = quizReducer(played.game, event);
  return game === played.game ? played : { game, events: [...played.events, event] };
}

export function QuizGame(props: Props) {
  const { daily, index, initialSave, store, announce, onSaved, today } = props;
  const [base] = useState(initialSave);
  const { id } = daily;
  const session = useMemo(
    () => startQuizSession(base, daily, index, today),
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

  // Ao abrir, acerta o que está salvo: a run que a repetição terminou vai para as terminadas, e a
  // lista que perdeu eventos (catálogo novo) é trocada.
  useEffect(() => {
    if (!store) return;
    if (session.kind === "finished" && !base.quiz.finished[id]) {
      report(
        updateSave(store, (s) => withQuizFinished(s, id, session.game)),
        true,
      );
    } else if (session.kind === "playing" && session.stale) {
      const progress = { events: session.events };
      report(updateSave(store, (s) => replaceQuizProgress(s, id, progress)));
    }
  }, [session, store, id, base, report]);

  return (
    <>
      {saveNotice && <p class="notice">{saveNotice}</p>}
      {session.kind === "finished" && <QuizSummary {...props} game={session.game} />}
      {start && <Playing {...props} start={start} report={report} />}
    </>
  );
}

function Playing({
  start,
  report,
  ...props
}: Props & { readonly start: Played; readonly report: Report }) {
  const { daily, index, engine, resolver, resolveUrl, store, today } = props;
  const { id, number } = daily;
  const late = isLate(daily.date, today);
  const [played, dispatch] = useReducer(playReducer, start);
  const [summary, setSummary] = useState<QuizGameRecord | null>(null);
  const { game } = played;

  // Salva a cada evento aceito: em andamento, a lista de eventos; terminada, o resultado.
  useEffect(() => {
    if (!store || played === start) return;
    if (isQuizFinished(game)) {
      report(
        updateSave(store, (s) => withQuizFinished(s, id, toQuizGame(game, number, late))),
        true,
      );
    } else {
      report(updateSave(store, (s) => withQuizProgress(s, id, { events: played.events })));
    }
  }, [store, played, start, game, id, number, late, report]);

  // As prévias da rodada atual e da seguinte, numa consulta só: o dia inteiro teria 100 faixas,
  // e a run quase nunca chega ao fim.
  // Pelo texto dos ids (sem espaço): a lista só muda quando a rodada muda.
  const pairOf = (n: number) => {
    const round = game.rounds[n];
    return round ? `${round.a} ${round.b}` : "";
  };
  const currentKey = pairOf(game.current);
  const nextKey = pairOf(game.current + 1);
  const current = useMemo(() => (currentKey ? currentKey.split(" ") : []), [currentKey]);
  const next = useMemo(() => (nextKey ? nextKey.split(" ") : []), [nextKey]);
  const batch = useMemo(() => [...current, ...next], [current, next]);
  const { urls, done } = useMixPreviews(engine, resolver, batch, current, next);

  function onNext() {
    if (!isQuizFinished(game)) {
      dispatch({ type: "NEXT" });
      return;
    }
    const record = toQuizGame(game, number, late);
    // A run que já nasceu terminada (todas as rodadas anuladas na montagem) não passou pelo efeito
    // do save: grava aqui, para o ✓ e o resumo ao voltar.
    if (store && played === start) {
      report(
        updateSave(store, (s) => withQuizFinished(s, id, record)),
        true,
      );
    }
    setSummary(record);
  }

  if (summary) return <QuizSummary {...props} game={summary} />;

  const left = livesLeft(game.errors);
  return (
    <div class="game quiz screen">
      <header class="round-head">
        <h1>{t("quiz.header", { number })}</h1>
        <p>
          {t("quiz.round", { current: game.current + 1, total: game.rounds.length })}
          <span class="round-tag">{t("quiz.lives", { left })}</span>
        </p>
      </header>
      {/* A pergunta do dia, a mesma em todas as rodadas (P374), embaixo do cabeçalho. */}
      <p class="quiz-question">{questionText(daily)}</p>
      <QuizRoundView
        daily={daily}
        game={game}
        dispatch={dispatch}
        index={index}
        engine={engine}
        urls={urls}
        resolved={done}
        resolveUrl={resolveUrl}
        announce={props.announce}
        onNext={onNext}
      />
    </div>
  );
}

/**
 * O fim da run, a partir do resultado salvo: a rodada alcançada, os acertos, o compartilhar e a
 * contagem do próximo quiz. Relê o save: com duas abas, vale o 1º término.
 */
function QuizSummary({ game, ...props }: Props & { readonly game: QuizGameRecord }) {
  const { daily, bonus } = props;
  const [playingBonus, setPlayingBonus] = useState(false);
  if (playingBonus && bonus) {
    return <BonusRun {...props} bonus={bonus} onDone={() => setPlayingBonus(false)} />;
  }
  return (
    <SummaryView
      {...props}
      game={game}
      onBonus={bonus?.date === daily.date ? () => setPlayingBonus(true) : null}
    />
  );
}

function SummaryView({
  game,
  onBonus,
  ...props
}: Props & { readonly game: QuizGameRecord; readonly onBonus: (() => void) | null }) {
  const { store, daily, announce, shareUrl } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const saved = useMemo(
    () => (store ? loadSave(store).save.quiz.finished[daily.id] : undefined),
    [store, daily.id],
  );
  const shown = saved ?? game;
  const reached = quizReached(shown);
  const right = tn("quiz.right", quizRight(shown));
  const header = t("quiz.shareHeader", { title: t("app.title"), number: shown.number });
  const result = t("quiz.shareResult", { reached, right });
  return (
    <div class="game quiz screen">
      <header class="round-head">
        <h1>{t("quiz.header", { number: shown.number })}</h1>
      </header>
      <p class="quiz-question">{questionText(daily)}</p>
      <section class="summary quiz-summary" aria-labelledby="summary-title">
        <h2 id="summary-title" ref={heading} tabIndex={-1}>
          {t("quiz.summaryTitle")}
        </h2>
        <p class="score">{t("quiz.reached", { reached, total: daily.rounds.length })}</p>
        <p>{right}</p>
        <ShareButton text={quizShareText(header, result, shown, shareUrl)} announce={announce} />
        {onBonus && (
          <>
            {/* O bônus de estreia (o usuário, 25/10/2026): troca a tela, e o 2º clique de um
                toque duplo não pode cair na 1ª rodada dele (regra 23). */}
            <button
              type="button"
              class="primary"
              aria-describedby="quiz-bonus-hint"
              onClick={singleClick(onBonus)}
            >
              {t("quiz.bonusButton")}
            </button>
            <p id="quiz-bonus-hint" class="quiz-data">
              {t("quiz.bonusHint")}
            </p>
          </>
        )}
        <Countdown date={daily.date} announce={announce} />
      </section>
    </div>
  );
}

/**
 * As rodadas bônus de estreia (o usuário, 25/10/2026): as 3, uma depois da outra, cada uma com a
 * pergunta dela, e a volta ao resultado. Fora do save e do resultado: dá para jogar de novo.
 */
function BonusRun({
  bonus,
  onDone,
  ...props
}: Props & { readonly bonus: QuizBonus; readonly onDone: () => void }) {
  const { index, engine, resolver, resolveUrl, announce } = props;
  const dailies = useMemo(() => bonusDailies(bonus), [bonus]);
  const [n, setN] = useState(0);
  const daily = dailies[n] ?? dailies[0];
  const [game, setGame] = useState(() => createQuizGame(daily as QuizDaily, index));
  const batch = useMemo(
    () => dailies.flatMap((d) => d.rounds.flatMap((r) => [r.a, r.b])),
    [dailies],
  );
  const pair = useMemo(() => {
    const round = daily?.rounds[0];
    return round ? [round.a, round.b] : [];
  }, [daily]);
  const after = useMemo(() => {
    const round = dailies[n + 1]?.rounds[0];
    return round ? [round.a, round.b] : [];
  }, [dailies, n]);
  const { urls, done } = useMixPreviews(engine, resolver, batch, pair, after);
  if (!daily) return null;
  const last = n >= dailies.length - 1;

  function onNext() {
    if (last) {
      onDone();
      return;
    }
    const following = dailies[n + 1];
    if (!following) return;
    setN(n + 1);
    setGame(createQuizGame(following, index));
  }

  return (
    <div class="game quiz screen">
      <header class="round-head">
        <h1>{t("quiz.bonusHeader", { current: n + 1, total: dailies.length })}</h1>
      </header>
      <p class="quiz-question">{questionText(daily)}</p>
      <QuizRoundView
        // Uma rodada nova monta do zero: o trecho volta aos 3 s, e o foco vai ao Tocar.
        key={n}
        daily={daily}
        game={game}
        dispatch={(event) => setGame((g) => quizReducer(g, event))}
        index={index}
        engine={engine}
        urls={urls}
        resolved={done}
        resolveUrl={resolveUrl}
        announce={announce}
        onNext={onNext}
        nextLabel={last ? t("quiz.bonusBack") : t("quiz.bonusNext")}
        bonus
      />
    </div>
  );
}
