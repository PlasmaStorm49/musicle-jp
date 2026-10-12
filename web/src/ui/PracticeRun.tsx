import type { ComponentChildren } from "preact";
import { useCallback, useId, useMemo, useRef } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  drawPractice,
  nextPracticeRound,
  type PracticeScore,
  type PracticeSession,
  practiceScore,
} from "../core/practice.ts";
import { currentRound, type GameEvent, reduce } from "../core/reducer.ts";
import { HELP_AFTER } from "../core/rules.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { FocusedNotice } from "./FocusedNotice.tsx";
import type { SearchScope } from "./GuessInput.tsx";
import { usePreviews } from "./hooks.ts";
import { type HelpSetup, RoundView } from "./RoundView.tsx";
import { singleClick } from "./singleClick.ts";

/**
 * Semente nova a cada sessão (do Treino e do modo por artista). Fica na tela: o núcleo não
 * sorteia nada sozinho.
 */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** "11 pontos em 3 rodadas": o placar da sessão, no cabeçalho e no cartão da home. */
export function practiceScoreText(score: PracticeScore): string {
  return t("practice.score", {
    points: tn("count.points", score.points),
    rounds: tn("practice.rounds", score.rounds),
  });
}

/** Os textos de cada modo de rodadas sem fim: o Treino e o modo por artista (M13). */
export type RunTexts = {
  /** O título da sessão: um texto, ou o nome do artista com o lang dele. */
  readonly title: ComponentChildren;
  /** O botão que encerra a sessão (P127: no modo por artista, "Trocar de artista"). */
  readonly restart: string;
  /** O aviso do pop-up, com o placar que se perde. */
  readonly restartWarning: (score: string) => string;
  readonly restartConfirm: string;
  /** Nada para sortear: o que fazer. */
  readonly empty: string;
};

type Props = {
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly session: PracticeSession;
  /** Mudança sobre a sessão de agora (quem guarda a sessão a aplica, se ela ainda existir). */
  readonly onChange: (change: (session: PracticeSession) => PracticeSession) => void;
  /** Encerra a sessão: volta à escolha (do modo ou do artista). */
  readonly onRestart: () => void;
  /** As músicas (songKey do índice) fora do sorteio: as respostas dos diários de hoje. */
  readonly excluded: ReadonlySet<string>;
  readonly texts: RunTexts;
  readonly scope?: SearchScope;
};

/**
 * A sessão em jogo, sempre no modo dela: rodadas sem fim do mesmo saco (core/practice.ts), com
 * o placar e o reinício. Só ela pré-sorteia e guarda o áudio. Serve ao Treino e ao modo por
 * artista, que muda só os textos, o índice e a busca.
 */
export function PracticeRun({
  index,
  engine,
  resolver,
  resolveUrl,
  announce,
  session,
  onChange,
  onRestart,
  excluded,
  texts,
  scope,
}: Props) {
  const dispatch = useCallback(
    (event: GameEvent) =>
      onChange((s) => {
        if (!s.game) return s;
        const game = reduce(s.game, event);
        return game === s.game ? s : { ...s, game };
      }),
    [onChange],
  );
  const next = useCallback(
    () => onChange((s) => nextPracticeRound(s, index, excluded)),
    [onChange, index, excluded],
  );

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
  // A ajuda depois da 1ª tentativa (P149, P150), sem nunca mostrar uma resposta de hoje.
  const help = useMemo<HelpSetup>(
    () => ({ after: HELP_AFTER.practice, avoid: excluded }),
    [excluded],
  );

  return (
    <div class="game practice">
      <header>
        <h1>{texts.title}</h1>
        {game && <p>{t("practice.round", { number: session.number })}</p>}
        <p class="practice-score">{practiceScoreText(score)}</p>
        <Restart score={score} texts={texts} onRestart={onRestart} />
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
          scope={scope}
          help={help}
        />
      ) : (
        <Empty text={texts.empty} onRetry={next} />
      )}
    </div>
  );
}

/**
 * Encerra a sessão. Com rodada jogada (a mesma conta do placar), pergunta antes, num pop-up modal
 * (P105, ME56): o <dialog> com showModal() deixa o resto da tela inerte. O foco vai ao
 * "Cancelar", a escolha que não perde nada; ao fechar, volta ao botão, que nunca fica
 * desabilitado (o navegador tiraria o foco dele).
 *
 * Sem estado: o <dialog> fica sempre na página (fechado, ele some) e quem diz se está aberto é
 * ele. Um estado "perguntando" dependeria do evento close para voltar a false, e no painel do
 * Claude ele não chega: o pop-up fechava, e o "Reiniciar" não o abria de novo.
 */
function Restart({
  score,
  texts,
  onRestart,
}: {
  readonly score: PracticeScore;
  readonly texts: RunTexts;
  readonly onRestart: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const warning = useId();
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
        {texts.restart}
      </button>
      {/* O nome do pop-up é o próprio aviso, lido quando o foco entra nele. */}
      <dialog
        ref={dialog}
        class="practice-restart"
        aria-labelledby={warning}
        // O Esc fecha aqui, e não pelo navegador: o foco volta ao botão em todo navegador.
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          close();
        }}
        // Outro jeito de fechar (o "voltar" do Android): o foco também volta ao botão.
        onClose={() => button.current?.focus()}
      >
        <p id={warning}>{texts.restartWarning(practiceScoreText(score))}</p>
        <div class="practice-restart-actions">
          <button type="button" class="primary" onClick={singleClick(onRestart)}>
            {texts.restartConfirm}
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
 * muda sozinha debaixo de quem lê o aviso.
 */
function Empty({ text, onRetry }: { readonly text: string; readonly onRetry: () => void }) {
  return (
    <section class="practice-empty">
      <FocusedNotice text={text} />
      <button type="button" class="primary" onClick={singleClick(onRetry)}>
        {t("practice.retry")}
      </button>
    </section>
  );
}
