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
  type PracticeSession,
  pendingDailySongKeys,
  startPracticeSession,
} from "../core/practice.ts";
import type { Save } from "../core/records.ts";
import { MODE_RULES, MODES } from "../core/rules.ts";
import type { Day, Target } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t } from "../i18n/t.ts";
import { modeName } from "./modes.ts";
import { PracticeRun, randomSeed } from "./PracticeRun.tsx";
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
  return <PracticeSessionRun {...props} session={session} excluded={excluded} />;
}

type RunProps = Omit<Props, "save" | "day" | "date" | "session"> & {
  readonly session: PracticeSession;
  readonly excluded: ReadonlySet<string>;
};

/**
 * A sessão em jogo, no modo escolhido (PracticeRun). "Reiniciar o Treino" volta à escolha do
 * modo; para jogar o outro modo, é reiniciar (P105).
 */
function PracticeSessionRun({ session, onSession, ...props }: RunProps) {
  // Mudança sobre a sessão de agora; depois de reiniciar (null), nada a mudar.
  const onChange = useCallback(
    (change: (s: PracticeSession) => PracticeSession) => onSession((s) => (s ? change(s) : s)),
    [onSession],
  );
  const onRestart = useCallback(() => onSession(null), [onSession]);
  const { target } = session.practice;
  const texts = useMemo(
    () => ({
      title: t("practice.header", { mode: modeName(target) }),
      restart: t("practice.restart"),
      restartShort: t("practice.restartShort"),
      restartWarning: (score: string) => t("practice.restartWarning", { score }),
      restartConfirm: t("practice.restartConfirm"),
      empty: t("practice.empty"),
    }),
    [target],
  );
  return (
    <PracticeRun
      {...props}
      session={session}
      onChange={onChange}
      onRestart={onRestart}
      texts={texts}
    />
  );
}

/**
 * A escolha do modo, antes de começar. Tela nova: o foco vai para o título (regra 16). Um h1
 * próprio, e não o da sessão: assim ele monta de novo a cada reinício, e o foco volta a ele.
 */
function PracticeStart({ onChoose }: { readonly onChoose: (target: Target) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div class="game practice screen">
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
