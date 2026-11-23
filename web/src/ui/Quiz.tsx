// O quiz do dia (M18): a aba própria, com a run de hoje ou, pelo Histórico, a de um dia passado (o
// usuário, 26/10/2026). Usa o catálogo do Anime (a carga do Anime, guardada no App) e o mês do dia
// na agenda do quiz, que desce só quando a pessoa abre a aba.
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER } from "../core/apple.ts";
import { type CatalogIndex, mergeIndexes } from "../core/catalog.ts";
import { quizArtistsOf, quizDaily } from "../core/quiz.ts";
import type { Save } from "../core/records.ts";
import { routeHref } from "../core/routes.ts";
import type { QuizBonus, QuizMonth } from "../core/types.ts";
import {
  appleResolver,
  catalogResolver,
  type LookupBudget,
  type PreviewResolver,
  splitResolver,
} from "../data/previews.ts";
import {
  type FetchLike,
  loadQuizArtists,
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
 * Os arquivos dos artistas de um dia dos artistas parecidos (M18): as músicas deles que não são do
 * Anime, juntas num índice, com o resolvedor das prévias delas.
 */
export type QuizArtistsLoad =
  | { readonly status: "idle" | "loading" | "retry" | "update" }
  | { readonly status: "ready"; readonly index: CatalogIndex; readonly resolver: PreviewResolver };

/**
 * Os meses guardados no App, como as Misturadas: trocar de aba e voltar não baixa de novo. Um mapa
 * pelo mês: o calendário do Histórico pede os da janela de 14 dias (1 ou 2, quando ela cruza a
 * virada), ao lado do mês do dia aberto (o usuário, 27/10/2026).
 */
export type QuizStore = {
  /** A carga de cada mês (AAAA-MM) já pedido; o que nunca foi pedido não está no mapa. */
  readonly loads: ReadonlyMap<string, QuizLoad>;
  /** Carrega o mês (de novo): ao abrir a aba, no calendário e no "Tentar de novo". */
  readonly request: (month: string) => void;
  /** A carga dos artistas de cada grupo já pedido, pelos ids juntos (`artistsKey`). */
  readonly artists: ReadonlyMap<string, QuizArtistsLoad>;
  /** Carrega (de novo) os arquivos dos artistas de um dia dos artistas parecidos. */
  readonly requestArtists: (ids: readonly string[]) => void;
};

/** Só os meses (o Histórico, que não joga a run): sem os artistas. */
export type QuizMonths = Pick<QuizStore, "loads" | "request">;

const IDLE: QuizLoad = { status: "idle" };
const ARTISTS_IDLE: QuizArtistsLoad = { status: "idle" };

/** A carga de um mês: a guardada, ou "idle" se ele nunca foi pedido. */
export function quizLoadOf(store: QuizMonths, month: string): QuizLoad {
  return store.loads.get(month) ?? IDLE;
}

const artistsKey = (ids: readonly string[]) => ids.join(",");

export function useQuizStore({
  fetchFn,
  baseUrl,
  dataDir,
  budget,
  resolveUrl,
}: {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
  /** O orçamento do lookup da sessão (P142), o mesmo de todos os resolvedores. */
  readonly budget: LookupBudget;
  readonly resolveUrl: (url: string) => string;
}): QuizStore {
  const [artists, setArtists] = useState<ReadonlyMap<string, QuizArtistsLoad>>(() => new Map());
  // A ficha de cada grupo, como a dos meses: a resposta de um pedido substituído não vale.
  const latestArtists = useRef(new Map<string, number>());
  const artistsTicket = useRef(0);
  const requestArtists = useCallback(
    (ids: readonly string[]) => {
      const key = artistsKey(ids);
      const id = ++artistsTicket.current;
      latestArtists.current.set(key, id);
      const put = (load: QuizArtistsLoad) => {
        if (latestArtists.current.get(key) === id) {
          setArtists((old) => new Map(old).set(key, load));
        }
      };
      put({ status: "loading" });
      loadQuizArtists(fetchFn, baseUrl, dataDir, ids).then(
        (index) => {
          // Fixtures: o endereço do arquivo. Artistas reais: o lookup da Apple, com a reserva.
          const resolver =
            index.catalog.provider === APPLE_PROVIDER
              ? appleResolver({ index, fetchFn, budget })
              : catalogResolver(index, resolveUrl);
          put({ status: "ready", index, resolver });
        },
        (error: unknown) =>
          put({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" }),
      );
    },
    [fetchFn, baseUrl, dataDir, budget, resolveUrl],
  );
  const [loads, setLoads] = useState<ReadonlyMap<string, QuizLoad>>(() => new Map());
  // A ficha de cada mês: a resposta de um pedido que outro do mesmo mês substituiu não vale mais.
  const latest = useRef(new Map<string, number>());
  const ticket = useRef(0);
  const request = useCallback(
    (month: string) => {
      const id = ++ticket.current;
      latest.current.set(month, id);
      const put = (load: QuizLoad) => setLoads((old) => new Map(old).set(month, load));
      put({ status: "loading" });
      Promise.all([
        loadQuizMonth(fetchFn, baseUrl, dataDir, month),
        loadQuizBonus(fetchFn, baseUrl, dataDir),
      ]).then(
        ([data, bonus]) => {
          if (latest.current.get(month) === id) put({ status: "ready", month: data, bonus });
        },
        (error: unknown) => {
          if (latest.current.get(month) !== id) return;
          put({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" });
        },
      );
    },
    [fetchFn, baseUrl, dataDir],
  );
  return { loads, request, artists, requestArtists };
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
  /** O resumo da run apareceu: as medalhas novas (o `onResult` do App). */
  readonly onResult: () => void;
  readonly shareUrl: string;
};

/**
 * A aba do quiz: a carga das duas partes e a run de hoje. O catálogo do Anime (o maior arquivo,
 * P361) só desce quando o mês traz o dia de hoje: sem quiz, o aviso vem na hora.
 */
export function Quiz(props: Props) {
  const { anime, store, date, today } = props;
  const wanted = quizMonthOf(date);
  const stored = quizLoadOf(store, wanted);
  useEffect(() => {
    if (stored.status === "idle") store.request(wanted);
  }, [stored.status, wanted, store.request]);
  // O mês nunca pedido espera o pedido do efeito, com o aviso da carga.
  const load: QuizLoad = stored.status === "idle" ? { status: "loading" } : stored;
  const day = load.status === "ready" ? pickQuizDay(load.month, date) : null;
  useEffect(() => {
    if (day && anime.load.status === "idle") anime.request();
  }, [day, anime.load.status, anime.request]);
  // Os artistas parecidos (M18): os arquivos dos artistas do grupo, só no dia deles.
  const artistIds = useMemo(() => (day ? quizArtistsOf(day) : []), [day]);
  const extra: QuizArtistsLoad | null =
    artistIds.length > 0 ? (store.artists.get(artistsKey(artistIds)) ?? ARTISTS_IDLE) : null;
  useEffect(() => {
    if (extra?.status === "idle") store.requestArtists(artistIds);
  }, [extra?.status, artistIds, store.requestArtists]);
  const retry = useCallback(() => {
    if (anime.load.status === "retry") anime.request();
    if (load.status === "retry") store.request(wanted);
    if (extra?.status === "retry") store.requestArtists(artistIds);
  }, [anime, store, load.status, wanted, extra?.status, artistIds]);

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
  const statuses = [anime.load.status, load.status, extra?.status ?? "ready"];
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
  if (
    anime.load.status !== "ready" ||
    load.status !== "ready" ||
    (extra && extra.status !== "ready")
  ) {
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
      extra={extra?.status === "ready" ? extra : null}
    />
  );
}

type ReadyProps = Props & {
  readonly month: QuizMonth | null;
  readonly bonus: QuizBonus | null;
  readonly index: CatalogIndex;
  readonly resolver: PreviewResolver;
  /** Os artistas do dia dos artistas parecidos, já carregados; null nos outros dias. */
  readonly extra: { readonly index: CatalogIndex; readonly resolver: PreviewResolver } | null;
};

function Ready({ month, bonus, date, today, save, extra, ...props }: ReadyProps) {
  const day = pickQuizDay(month, date);
  const daily = useMemo(() => (day ? quizDaily(day, date) : null), [day, date]);
  // No dia dos artistas parecidos, o índice e as prévias juntam o Anime e os arquivos deles.
  const index = useMemo(
    () => (extra ? mergeIndexes(props.index, [extra.index]) : props.index),
    [extra, props.index],
  );
  const resolver = useMemo(
    () => (extra ? splitResolver(props.index, props.resolver, extra.resolver) : props.resolver),
    [extra, props.index, props.resolver],
  );
  if (!daily) return null; // o Quiz já avisou: sem o dia, não chega aqui
  return (
    // key: a run monta do zero ao trocar de dia, com o save daquele momento.
    <QuizGame
      key={daily.id}
      daily={daily}
      index={index}
      engine={props.engine}
      resolver={resolver}
      resolveUrl={props.resolveUrl}
      announce={props.announce}
      store={props.saveStore}
      initialSave={save}
      onSaved={props.onSaved}
      onResult={props.onResult}
      shareUrl={props.shareUrl}
      today={today}
      bonus={bonus}
    />
  );
}
