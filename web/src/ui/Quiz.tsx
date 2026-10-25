// O quiz do dia (M18): a aba própria, com a run de hoje. Usa o catálogo do Anime (a carga do Anime,
// guardada no App) e o mês de hoje da agenda do quiz, que desce só quando a pessoa abre a aba. O
// Histórico do quiz (os dias passados) fica para um PR seguinte.
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { quizDaily } from "../core/quiz.ts";
import type { Save } from "../core/records.ts";
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
import { singleClick } from "./singleClick.ts";

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

/** O mês guardado no App, como as Misturadas: trocar de aba e voltar não baixa de novo. */
export type QuizStore = {
  readonly load: QuizLoad;
  /** Carrega (de novo): ao abrir a aba e no "Tentar de novo". */
  readonly request: () => void;
};

export function useQuizStore({
  fetchFn,
  baseUrl,
  dataDir,
  date,
}: {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
  /** O "hoje" do jogo: o mês dele é o que desce. */
  readonly date: string;
}): QuizStore {
  const [load, setLoad] = useState<QuizLoad>({ status: "idle" });
  const request = useCallback(() => {
    setLoad({ status: "loading" });
    Promise.all([
      loadQuizMonth(fetchFn, baseUrl, dataDir, quizMonthOf(date)),
      loadQuizBonus(fetchFn, baseUrl, dataDir),
    ]).then(
      ([month, bonus]) => setLoad({ status: "ready", month, bonus }),
      (error: unknown) =>
        setLoad({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" }),
    );
  }, [fetchFn, baseUrl, dataDir, date]);
  return { load, request };
}

type Props = {
  /** O Anime do App: o catálogo e o resolvedor das prévias. */
  readonly anime: AnimeStore;
  readonly store: QuizStore;
  /** O "hoje" do jogo. */
  readonly date: string;
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
  const { anime, store, date } = props;
  useEffect(() => {
    if (store.load.status === "idle") store.request();
  }, [store.load.status, store.request]);
  const today = store.load.status === "ready" ? pickQuizDay(store.load.month, date) : null;
  useEffect(() => {
    if (today && anime.load.status === "idle") anime.request();
  }, [today, anime.load.status, anime.request]);
  const retry = useCallback(() => {
    if (anime.load.status === "retry") anime.request();
    if (store.load.status === "retry") store.request();
  }, [anime, store]);

  if (store.load.status === "ready" && !today) {
    return (
      <section class="screen">
        <FocusedNotice text={t("quiz.unavailable")} />
      </section>
    );
  }
  const statuses = [anime.load.status, store.load.status];
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
  if (anime.load.status !== "ready" || store.load.status !== "ready") {
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
      month={store.load.month}
      bonus={store.load.bonus}
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

function Ready({ month, bonus, date, save, ...props }: ReadyProps) {
  const day = pickQuizDay(month, date);
  const daily = useMemo(() => (day ? quizDaily(day, date) : null), [day, date]);
  if (!daily) return null; // o Quiz já avisou: sem o dia de hoje, não chega aqui
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
      today={date}
      bonus={bonus}
    />
  );
}
