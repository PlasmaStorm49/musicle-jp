// O quiz do dia (M18): a aba própria, com a run de hoje ou, pelo Histórico, a de um dia passado (o
// usuário, 26/10/2026). Usa o catálogo do Anime (a carga do Anime, guardada no App) e o mês do dia
// na agenda do quiz, que desce só quando a pessoa abre a aba.
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { quizDaily } from "../core/quiz.ts";
import type { Save } from "../core/records.ts";
import { routeHref } from "../core/routes.ts";
import type { QuizBonus, QuizMonth } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import {
  type FetchLike,
  loadQuizBonus,
  loadQuizMonth,
  pickQuizDay,
  quizMonthOf,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import type { KeyValueStore } from "../storage/save.ts";
import type { AnimeStore } from "./Anime.tsx";
import { FocusedNotice, UpdateNotice } from "./FocusedNotice.tsx";
import { QuizGame } from "./QuizGame.tsx";
import { singleClick, singleClickLink } from "./singleClick.ts";

/**
 * O mês do quiz e o bônus de estreia: "update" é versão que o código não conhece; no ready, null
 * é o mês sem quiz, ou nenhum bônus.
 */
export type QuizLoad =
  | { readonly status: "idle" | "loading" | "retry" | "update" }
  | {
      readonly status: "ready";
      readonly month: QuizMonth | null;
      readonly bonus: QuizBonus | null;
    };

/**
 * O mês guardado no App, como as Misturadas: trocar de aba e voltar não baixa de novo. Um mês por
 * vez: o dia passado de outro mês (a janela do Histórico cruza a virada) troca o guardado.
 */
export type QuizStore = {
  /** O mês (AAAA-MM) da carga guardada; null antes da 1ª. */
  readonly month: string | null;
  readonly load: QuizLoad;
  /** Carrega o mês (de novo): ao abrir a aba, ao trocar de mês e no "Tentar de novo". */
  readonly request: (month: string) => void;
};

export function useQuizStore({
  fetchFn,
  baseUrl,
  dataDir,
}: {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
}): QuizStore {
  const [state, setState] = useState<{ readonly month: string | null; readonly load: QuizLoad }>({
    month: null,
    load: { status: "idle" },
  });
  // A ficha da carga: a resposta de um mês que já foi trocado por outro não vale mais.
  const latest = useRef(0);
  const request = useCallback(
    (month: string) => {
      const id = ++latest.current;
      setState({ month, load: { status: "loading" } });
      Promise.all([
        loadQuizMonth(fetchFn, baseUrl, dataDir, month),
        loadQuizBonus(fetchFn, baseUrl, dataDir),
      ]).then(
        ([data, bonus]) => {
          if (latest.current === id) {
            setState({ month, load: { status: "ready", month: data, bonus } });
          }
        },
        (error: unknown) => {
          if (latest.current !== id) return;
          const status = error instanceof UnsupportedCatalogError ? "update" : "retry";
          setState({ month, load: { status } });
        },
      );
    },
    [fetchFn, baseUrl, dataDir],
  );
  return { month: state.month, load: state.load, request };
}

type Props = {
  /** O Anime do App: o catálogo e o resolvedor das prévias. */
  readonly anime: AnimeStore;
  readonly store: QuizStore;
  /** O dia da run: hoje ou, pelo Histórico, um dia passado. */
  readonly date: string;
  /** O "hoje" do jogo: a run de um dia antes dele termina como jogada depois (`isLate`). */
  readonly today: string;
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly saveStore: KeyValueStore | null;
  readonly onSaved: () => void;
  readonly shareUrl: string;
};

/**
 * A aba do quiz: a carga das duas partes e a run de hoje. O catálogo do Anime (o maior arquivo,
 * P361) só desce quando o mês traz o dia de hoje: sem quiz, o aviso vem na hora.
 */
export function Quiz(props: Props) {
  const { anime, store, date, today } = props;
  const wanted = quizMonthOf(date);
  useEffect(() => {
    if (store.month !== wanted) store.request(wanted);
  }, [store.month, wanted, store.request]);
  // A carga guardada só vale se for a do mês do dia; a de outro mês espera a troca.
  const load: QuizLoad = store.month === wanted ? store.load : { status: "loading" };
  const day = load.status === "ready" ? pickQuizDay(load.month, date) : null;
  useEffect(() => {
    if (day && anime.load.status === "idle") anime.request();
  }, [day, anime.load.status, anime.request]);
  const retry = useCallback(() => {
    if (anime.load.status === "retry") anime.request();
    if (load.status === "retry") store.request(wanted);
  }, [anime, store, load.status, wanted]);

  if (load.status === "ready" && !day) {
    return (
      <section class="unavailable screen" key={date}>
        <FocusedNotice text={date === today ? t("quiz.unavailable") : t("quiz.unavailableDay")} />
        {date !== today && (
          // O 2º clique de um toque duplo não segue o link (regra 23).
          <a href={routeHref({ tab: "history", date })} onClick={singleClickLink}>
            {t("history.backToDay")}
          </a>
        )}
      </section>
    );
  }
  const statuses = [anime.load.status, load.status];
  if (statuses.includes("update")) return <UpdateNotice />;
  if (statuses.includes("retry")) {
    return (
      <section class="error screen">
        <FocusedNotice text={t("quiz.retry")} />
        <button type="button" class="primary" onClick={singleClick(retry)}>
          {t("load.retryButton")}
        </button>
      </section>
    );
  }
  if (anime.load.status !== "ready" || load.status !== "ready") {
    // Com o foco: depois do "Tentar de novo", o botão sumiu (regra 16).
    return (
      <div class="loading screen" key="quiz-loading">
        <FocusedNotice text={t("load.loading")} />
      </div>
    );
  }
  const { data, resolver } = anime.load;
  return (
    <Ready
      {...props}
      month={load.month}
      bonus={load.bonus}
      index={data.index}
      resolver={resolver}
    />
  );
}

type ReadyProps = Props & {
  readonly month: QuizMonth | null;
  readonly bonus: QuizBonus | null;
  readonly index: CatalogIndex;
  readonly resolver: PreviewResolver;
};

function Ready({ month, bonus, date, today, save, ...props }: ReadyProps) {
  const day = pickQuizDay(month, date);
  const daily = useMemo(() => (day ? quizDaily(day, date) : null), [day, date]);
  if (!daily) return null; // o Quiz já avisou: sem o dia, não chega aqui
  return (
    // key: a run monta do zero ao trocar de dia, com o save daquele momento.
    <QuizGame
      key={daily.id}
      daily={daily}
      index={props.index}
      engine={props.engine}
      resolver={props.resolver}
      resolveUrl={props.resolveUrl}
      announce={props.announce}
      store={props.saveStore}
      initialSave={save}
      onSaved={props.onSaved}
      shareUrl={props.shareUrl}
      today={today}
      bonus={bonus}
    />
  );
}
