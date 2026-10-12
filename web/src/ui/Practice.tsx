import {
  type Dispatch,
  type StateUpdater,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  drawPractice,
  nextPracticeRound,
  type PracticeScore,
  type PracticeSession,
  pendingDailySongKeys,
  practiceScore,
  startPracticeSession,
} from "../core/practice.ts";
import type { Save } from "../core/records.ts";
import { currentRound, type GameEvent, reduce } from "../core/reducer.ts";
import { MODE_RULES, MODES } from "../core/rules.ts";
import type { Day, Target } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { usePreviews } from "./hooks.ts";
import { modeName } from "./modes.ts";
import { RoundView } from "./RoundView.tsx";
import { singleClick } from "./singleClick.ts";

export type { PracticeSession };

/** Quem guarda a sessão (o App) a entrega por um setter de useState. */
export type PracticeSessionSetter = Dispatch<StateUpdater<PracticeSession | null>>;

type Props = {
  readonly index: CatalogIndex;
  /** O dia de hoje na agenda (null se faltar): as respostas dele ficam fora do Treino. */
  readonly day: Day | null;
  readonly date: string;
  /** A última leitura do save, feita pelo App. O Treino não grava nada (P50). */
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /**
   * A sessão mora no App: trocar de aba e voltar não a zera. null = a escolha do modo (antes da
   * 1ª sessão e depois de reiniciar).
   */
  readonly session: PracticeSession | null;
  readonly onSession: PracticeSessionSetter;
};

/** Semente nova a cada sessão. Fica na tela: o núcleo não sorteia nada sozinho. */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Modo Treino: a pessoa escolhe o modo (Normal ou Desafio), e as rodadas sem fim saem só dele;
 * trocar de modo é reiniciar (P105). Usa a mesma rodada do diário (RoundView) e não salva nada.
 */
export function Practice(props: Props) {
  const { index, day, date, save, session, onSession } = props;
  // Relida a cada render: o diário que terminou libera as músicas dele na próxima rodada.
  const excluded = useMemo(
    () => pendingDailySongKeys(save, day, date, index),
    [save, day, date, index],
  );

  if (!session) {
    return (
      <PracticeStart
        onChoose={(target) => {
          // A semente sai fora do setter, que fica puro; o `??` faz um 2º clique não criar outra.
          const seed = randomSeed();
          onSession((s) => s ?? startPracticeSession(seed, target, index, excluded));
        }}
      />
    );
  }
  return <PracticeRun {...props} session={session} excluded={excluded} />;
}

/** "11 pontos em 3 rodadas": o placar da sessão, no cabeçalho do Treino e no cartão da home. */
export function practiceScoreText(score: PracticeScore): string {
  return t("practice.score", {
    points: tn("count.points", score.points),
    rounds: tn("practice.rounds", score.rounds),
  });
}

/**
 * A escolha do modo, antes de começar. Tela nova: o foco vai para o título (regra 16). Um h1
 * próprio, e não o da sessão: assim ele monta de novo a cada reinício, e o foco volta a ele.
 */
function PracticeStart({ onChoose }: { readonly onChoose: (target: Target) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div class="game practice">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("practice.title")}
        </h1>
        <p class="hint">{t("practice.chooseHint")}</p>
      </header>
      <ul class="home-modes">
        {MODES.map((mode) => (
          <li key={mode}>
            {/* O nome acessível é só o do modo; a dica vem como descrição. */}
            <button
              type="button"
              class="mode home-card"
              aria-labelledby={`practice-${mode}-name`}
              aria-describedby={`practice-${mode}-hint`}
              // O 2º clique de um toque duplo no Reiniciar ou no Sim cai aqui: não começa outra.
              onClick={singleClick(() => onChoose(mode))}
            >
              <span id={`practice-${mode}-name`} class="mode-name">
                {modeName(mode)}
              </span>
              <span id={`practice-${mode}-hint`} class="mode-hint">
                {t(`practice.${mode}Hint`, { total: MODE_RULES[mode].maxAttempts })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RunProps = Omit<Props, "save" | "day" | "date" | "session"> & {
  readonly session: PracticeSession;
  readonly excluded: ReadonlySet<string>;
};

/** A sessão em jogo, sempre no modo escolhido: só ela pré-sorteia e guarda o áudio. */
function PracticeRun({
  index,
  engine,
  resolver,
  resolveUrl,
  announce,
  session,
  onSession,
  excluded,
}: RunProps) {
  // Mudança sobre a sessão de agora; depois de reiniciar (null), nada a mudar.
  const update = useCallback(
    (change: (s: PracticeSession) => PracticeSession) => onSession((s) => (s ? change(s) : s)),
    [onSession],
  );
  const dispatch = useCallback(
    (event: GameEvent) =>
      update((s) => {
        if (!s.game) return s;
        const game = reduce(s.game, event);
        return game === s.game ? s : { ...s, game };
      }),
    [update],
  );
  const next = useCallback(
    () => update((s) => nextPracticeRound(s, index, excluded)),
    [update, index, excluded],
  );
  const restart = useCallback(() => onSession(null), [onSession]);

  // A próxima rodada, já sorteada: o áudio dela começa a baixar antes.
  const peek = useMemo(
    () => drawPractice(session.practice, index, excluded),
    [session.practice, index, excluded],
  );
  const { game } = session;
  // De 2 em 2: a rodada em jogo (quase sempre já resolvida) e a próxima.
  const currentId = game ? currentRound(game).trackId : null;
  const nextId = peek ? peek.round.planned.answer : null;
  const batch = useMemo(
    () => [currentId, nextId].filter((id): id is string => id !== null),
    [currentId, nextId],
  );
  usePreviews(engine, resolver, batch, currentId, nextId);

  const score = practiceScore(session.score, game);

  return (
    <div class="game practice">
      <header>
        <h1>{t("practice.header", { mode: modeName(session.practice.target) })}</h1>
        {game && <p>{t("practice.round", { number: session.number })}</p>}
        <p class="practice-score">{practiceScoreText(score)}</p>
        <Restart score={score} onRestart={restart} />
      </header>
      {game ? (
        <RoundView
          game={game}
          dispatch={dispatch}
          index={index}
          engine={engine}
          resolver={resolver}
          resolveUrl={resolveUrl}
          announce={announce}
          roundKey={game.puzzleId}
          nextLabel={t("reveal.next")}
          onNext={next}
        />
      ) : (
        <Empty onRetry={next} />
      )}
    </div>
  );
}

/**
 * "Reiniciar o Treino": volta à escolha do modo. Com rodada jogada (a mesma conta do placar),
 * pergunta antes, num pop-up modal (P105, ME56): o <dialog> com showModal() deixa o resto da tela
 * inerte. O foco vai ao "Cancelar", a escolha que não perde nada; ao fechar, volta ao botão, que
 * nunca fica desabilitado (o navegador tiraria o foco dele).
 *
 * Sem estado: o <dialog> fica sempre na página (fechado, ele some) e quem diz se está aberto é
 * ele. Um estado "perguntando" dependeria do evento close para voltar a false, e no painel do
 * Claude ele não chega: o pop-up fechava, e o "Reiniciar" não o abria de novo.
 */
function Restart({
  score,
  onRestart,
}: {
  readonly score: PracticeScore;
  readonly onRestart: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const close = () => {
    dialog.current?.close();
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        // O 2º clique de um toque duplo num cartão de modo cai aqui (a tela já mudou).
        onClick={singleClick(() => {
          if (score.rounds === 0) {
            onRestart();
            return;
          }
          if (!dialog.current?.open) dialog.current?.showModal();
          cancel.current?.focus();
        })}
      >
        {t("practice.restart")}
      </button>
      {/* O nome do pop-up é o próprio aviso, lido quando o foco entra nele. */}
      <dialog
        ref={dialog}
        class="practice-restart"
        aria-labelledby="practice-restart-warning"
        // O Esc fecha aqui, e não pelo navegador: o foco volta ao botão em todo navegador.
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          close();
        }}
        // Outro jeito de fechar (o "voltar" do Android): o foco também volta ao botão.
        onClose={() => button.current?.focus()}
      >
        <p id="practice-restart-warning">
          {t("practice.restartWarning", { score: practiceScoreText(score) })}
        </p>
        <div class="practice-restart-actions">
          <button type="button" class="primary" onClick={singleClick(onRestart)}>
            {t("practice.restartConfirm")}
          </button>
          {/* Fecha o pop-up: o 2º clique cairia no que está embaixo (regra 23). */}
          <button ref={cancel} type="button" onClick={singleClick(close)}>
            {t("practice.restartCancel")}
          </button>
        </div>
      </dialog>
    </>
  );
}

/**
 * Nada para sortear no modo da sessão: o aviso leva o foco (o botão de seguir pode ter acabado
 * de sumir). Sortear de novo é um clique, e não automático quando um diário termina: a tela não
 * muda sozinha debaixo de quem lê o aviso. Para jogar o outro modo, "Reiniciar o Treino".
 */
function Empty({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <section class="practice-empty">
      <FocusedNotice text={t("practice.empty")} />
      <button type="button" class="primary" onClick={singleClick(onRetry)}>
        {t("practice.retry")}
      </button>
    </section>
  );
}
