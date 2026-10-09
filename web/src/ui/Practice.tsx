import {
  type Dispatch,
  type StateUpdater,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  drawPractice,
  nextPracticeRound,
  type PracticeSession,
  pendingDailySongKeys,
  practiceScore,
  startPracticeSession,
} from "../core/practice.ts";
import type { SaveV1 } from "../core/records.ts";
import { currentRound, type GameEvent, reduce } from "../core/reducer.ts";
import type { AnswerMode, Day, Target } from "../core/types.ts";
import type { MessageKey } from "../i18n/pt-BR.ts";
import { t, tn } from "../i18n/t.ts";
import { previewUrl, usePreload } from "./hooks.ts";
import { RoundView } from "./RoundView.tsx";

export type { PracticeSession };

/** Quem guarda a sessão (o App) a entrega por um setter de useState. */
export type PracticeSessionSetter = Dispatch<StateUpdater<PracticeSession | null>>;

type Props = {
  readonly index: CatalogIndex;
  /** O dia de hoje na agenda (null se faltar): as respostas dele ficam fora do Treino. */
  readonly day: Day | null;
  readonly date: string;
  /** A última leitura do save, feita pelo App. O Treino não grava nada (P50). */
  readonly save: SaveV1;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** A sessão mora no App: trocar de aba e voltar não a zera. null = ainda não começou. */
  readonly session: PracticeSession | null;
  readonly onSession: PracticeSessionSetter;
};

/** Semente nova a cada sessão. Fica na tela: o núcleo não sorteia nada sozinho. */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Modo Treino: rodadas sem fim, com filtros de alvo e de resposta que valem a partir da
 * próxima rodada. Usa a mesma rodada do diário (RoundView) e não salva nada.
 */
export function Practice({
  index,
  day,
  date,
  save,
  engine,
  resolveUrl,
  announce,
  session,
  onSession,
}: Props) {
  // Relida a cada render: o diário que terminou libera as músicas dele na próxima rodada.
  const excluded = useMemo(
    () => pendingDailySongKeys(save, day, date, index),
    [save, day, date, index],
  );

  // 1ª visita: a sessão nasce aqui (precisa do catálogo e do save) e sobe para o App.
  const [fresh] = useState(
    () =>
      session ??
      startPracticeSession(
        randomSeed(),
        "song",
        save.settings.answerMode ?? "choice",
        index,
        excluded,
      ),
  );
  const current = session ?? fresh;
  useEffect(() => {
    if (session === null) onSession(fresh);
  }, [session, fresh, onSession]);

  const update = useCallback(
    (change: (s: PracticeSession) => PracticeSession) => onSession((s) => change(s ?? fresh)),
    [onSession, fresh],
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

  // A próxima rodada, já sorteada com os filtros de agora: o áudio dela começa a baixar antes.
  const peek = useMemo(
    () => drawPractice(current.practice, index, current.target, excluded),
    [current.practice, current.target, index, excluded],
  );
  const { game } = current;
  usePreload(
    engine,
    game ? previewUrl(index, currentRound(game).trackId, resolveUrl) : null,
    peek ? previewUrl(index, peek.round.planned.answer, resolveUrl) : null,
  );

  const score = practiceScore(current.score, game);

  return (
    <div class="game practice">
      <header>
        <h1>{t("practice.title")}</h1>
        {game && <p>{t("practice.round", { number: current.number })}</p>}
        <p class="practice-score">
          {t("practice.score", {
            points: tn("count.points", score.points),
            rounds: tn("practice.rounds", score.rounds),
          })}
        </p>
      </header>
      <Filters
        target={current.target}
        answerMode={current.answerMode}
        onTarget={(target) => update((s) => ({ ...s, target }))}
        onAnswerMode={(answerMode) => update((s) => ({ ...s, answerMode }))}
      />
      {game ? (
        <RoundView
          game={game}
          dispatch={dispatch}
          index={index}
          engine={engine}
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

type Choice<T> = { readonly value: T; readonly label: MessageKey };

const TARGETS: readonly Choice<Target>[] = [
  { value: "song", label: "practice.targetSong" },
  { value: "album", label: "practice.targetAlbum" },
];

const MODES: readonly Choice<AnswerMode>[] = [
  { value: "choice", label: "mode.choiceName" },
  { value: "typing", label: "mode.typingName" },
];

type FiltersProps = {
  readonly target: Target;
  readonly answerMode: AnswerMode;
  readonly onTarget: (target: Target) => void;
  readonly onAnswerMode: (answerMode: AnswerMode) => void;
};

/** Os dois filtros, como botões de opção. Mudar não mexe na rodada em jogo. */
function Filters({ target, answerMode, onTarget, onAnswerMode }: FiltersProps) {
  return (
    <section class="practice-filters">
      <RadioGroup
        name="practice-target"
        legend="practice.target"
        choices={TARGETS}
        value={target}
        onChange={onTarget}
      />
      <RadioGroup
        name="practice-answer"
        legend="practice.answer"
        choices={MODES}
        value={answerMode}
        onChange={onAnswerMode}
      />
      <p id="practice-filters-hint" class="hint">
        {t("practice.filtersHint")}
      </p>
    </section>
  );
}

type RadioGroupProps<T extends string> = {
  readonly name: string;
  readonly legend: MessageKey;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
};

function RadioGroup<T extends string>({
  name,
  legend,
  choices,
  value,
  onChange,
}: RadioGroupProps<T>) {
  return (
    <fieldset aria-describedby="practice-filters-hint">
      <legend>{t(legend)}</legend>
      {choices.map((choice) => (
        <label key={choice.value}>
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={choice.value === value}
            onChange={() => onChange(choice.value)}
          />
          {t(choice.label)}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Nada para sortear: o aviso leva o foco (o botão de seguir pode ter acabado de sumir). Sortear
 * de novo é um clique, e não automático ao trocar o filtro: senão o Player novo puxaria o foco
 * de quem está escolhendo nos botões de opção.
 */
function Empty({ onRetry }: { readonly onRetry: () => void }) {
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => message.current?.focus(), []);
  return (
    <section class="practice-empty">
      <p ref={message} tabIndex={-1}>
        {t("practice.empty")}
      </p>
      <button type="button" class="primary" onClick={onRetry}>
        {t("practice.retry")}
      </button>
    </section>
  );
}
