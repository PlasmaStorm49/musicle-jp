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
  type PracticeScore,
  type PracticeSession,
  pendingDailySongKeys,
  practiceScore,
  startPracticeSession,
} from "../core/practice.ts";
import type { Save } from "../core/records.ts";
import { currentRound, type GameEvent, reduce } from "../core/reducer.ts";
import { MODES } from "../core/rules.ts";
import type { Day, Target } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { usePreviews } from "./hooks.ts";
import { modeName } from "./modes.ts";
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
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
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
 * Modo Treino: rodadas sem fim do Normal ou do Desafio, com o modo valendo a partir da próxima
 * rodada. Usa a mesma rodada do diário (RoundView) e não salva nada.
 */
export function Practice({
  index,
  day,
  date,
  save,
  engine,
  resolver,
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

  // 1ª visita: a sessão nasce aqui (precisa do catálogo e do save) e sobe para o App. Começa
  // no Normal, o primeiro modo.
  const [fresh] = useState(
    () => session ?? startPracticeSession(randomSeed(), MODES[0] ?? "album", index, excluded),
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

  // A próxima rodada, já sorteada com o modo de agora: o áudio dela começa a baixar antes.
  const peek = useMemo(
    () => drawPractice(current.practice, index, current.target, excluded),
    [current.practice, current.target, index, excluded],
  );
  const { game } = current;
  // De 2 em 2: a rodada em jogo (quase sempre já resolvida) e a próxima.
  const currentId = game ? currentRound(game).trackId : null;
  const nextId = peek ? peek.round.planned.answer : null;
  const batch = useMemo(
    () => [currentId, nextId].filter((id): id is string => id !== null),
    [currentId, nextId],
  );
  usePreviews(engine, resolver, batch, currentId, nextId);

  const score = practiceScore(current.score, game);

  return (
    <div class="game practice">
      <header>
        <h1>{t("practice.title")}</h1>
        {game && <p>{t("practice.round", { number: current.number })}</p>}
        <p class="practice-score">{practiceScoreText(score)}</p>
      </header>
      <ModeChoice value={current.target} onChange={(target) => update((s) => ({ ...s, target }))} />
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

/** "11 pontos em 3 rodadas": o placar da sessão, no cabeçalho do Treino e no cartão da home. */
export function practiceScoreText(score: PracticeScore): string {
  return t("practice.score", {
    points: tn("count.points", score.points),
    rounds: tn("practice.rounds", score.rounds),
  });
}

/** O modo do Treino (P100), como botões de opção. Mudar não mexe na rodada em jogo. */
function ModeChoice({
  value,
  onChange,
}: {
  readonly value: Target;
  readonly onChange: (target: Target) => void;
}) {
  return (
    <section class="practice-mode">
      <fieldset aria-describedby="practice-mode-hint">
        <legend>{t("practice.mode")}</legend>
        {MODES.map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="practice-mode"
              value={mode}
              checked={mode === value}
              onChange={() => onChange(mode)}
            />
            {modeName(mode)}
          </label>
        ))}
      </fieldset>
      <p id="practice-mode-hint" class="hint">
        {t("practice.modeHint")}
      </p>
    </section>
  );
}

/**
 * Nada para sortear: o aviso leva o foco (o botão de seguir pode ter acabado de sumir). Sortear
 * de novo é um clique, e não automático ao trocar o modo: senão o Player novo puxaria o foco
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
