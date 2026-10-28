import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER } from "../core/apple.ts";
import {
  ANIME_DIFFICULTIES,
  ANIME_MODES,
  type AnimeDifficulty,
  type AnimeMode,
  animeDaily,
  animeKey,
  type Daily,
} from "../core/daily.ts";
import { type DailyStatus, firstToPlay, progress, statusOf } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import {
  type AnimeScreen,
  type AnimeTab,
  animeModeTab,
  animeScreen,
  ROUTES,
  routeHref,
} from "../core/routes.ts";
import { MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { AnimeDay, AnimeSchedule } from "../core/types.ts";
import {
  appleResolver,
  catalogResolver,
  type LookupBudget,
  type PreviewResolver,
} from "../data/previews.ts";
import {
  type AnimeData,
  type FetchLike,
  loadAnimeCatalog,
  loadAnimeSchedule,
  pickAnimeDay,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import type { KeyValueStore } from "../storage/save.ts";
import { type Card, CardList, dailyText, progressText } from "./cards.tsx";
import { dayTitle } from "./dayLabel.ts";
import { FocusedNotice, UpdateNotice } from "./FocusedNotice.tsx";
import { Game } from "./Game.tsx";
import { useHeadingFocus } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { animeModeName } from "./modes.ts";
import { singleClick, singleClickLink } from "./singleClick.ts";

/** A carga do Anime: "update" é versão de dados que o código não conhece. */
export type AnimeLoad =
  | { readonly status: "idle" }
  | { readonly status: "loading" | "retry" | "update" }
  | {
      readonly status: "ready";
      readonly data: AnimeData;
      /** O resolvedor das prévias do Anime: o orçamento é o da sessão (P142, regra 21). */
      readonly resolver: PreviewResolver;
    };

export type AnimeStoreOptions = {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
  /** O orçamento do lookup da Apple do App, o mesmo da parada e dos artistas. */
  readonly budget: LookupBudget;
  readonly resolveUrl: (url: string) => string;
};

/** Só a agenda do Anime, para as marcas do Histórico (P270): "update" é versão desconhecida. */
export type AnimeScheduleLoad =
  | { readonly status: "idle" | "loading" | "retry" | "update" }
  | { readonly status: "ready"; readonly schedule: AnimeSchedule };

/**
 * O Anime guardado no App, como o modo por artista: trocar de aba e voltar não baixa de novo. Ele
 * carrega só quando a pessoa abre a categoria (quem joga só os Hits não baixa nada a mais), e o
 * Histórico baixa só a agenda (P270): o catálogo desce quando uma tela do Anime abre.
 */
export type AnimeStore = {
  readonly load: AnimeLoad;
  /** Carrega (de novo): ao abrir a categoria e no "Tentar de novo". A agenda já baixada fica. */
  readonly request: () => void;
  readonly schedule: AnimeScheduleLoad;
  /** Baixa só a agenda (o Histórico), uma vez: a carga inteira usa o mesmo pedido. */
  readonly requestSchedule: () => void;
};

export function useAnimeStore({
  fetchFn,
  baseUrl,
  dataDir,
  budget,
  resolveUrl,
}: AnimeStoreOptions): AnimeStore {
  const [load, setLoad] = useState<AnimeLoad>({ status: "idle" });
  const [schedule, setSchedule] = useState<AnimeScheduleLoad>({ status: "idle" });
  // O pedido da agenda, um só para o Histórico e para a carga inteira. Some quando falha: o
  // "Tentar de novo" (ou a próxima tela que precisar dela) pede outro.
  const pending = useRef<Promise<AnimeSchedule> | null>(null);
  const getSchedule = useCallback((): Promise<AnimeSchedule> => {
    if (pending.current) return pending.current;
    const next = loadAnimeSchedule(fetchFn, baseUrl, dataDir);
    pending.current = next;
    setSchedule({ status: "loading" });
    next.then(
      (loaded) => setSchedule({ status: "ready", schedule: loaded }),
      (error: unknown) => {
        if (pending.current === next) pending.current = null;
        setSchedule({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" });
      },
    );
    return next;
  }, [fetchFn, baseUrl, dataDir]);
  // A falha já vai para o estado da agenda, no próprio pedido (o `then` com os dois lados).
  const requestSchedule = useCallback(() => {
    getSchedule();
  }, [getSchedule]);
  const request = useCallback(() => {
    setLoad({ status: "loading" });
    Promise.all([loadAnimeCatalog(fetchFn, baseUrl, dataDir), getSchedule()]).then(
      ([index, loaded]) => {
        const data: AnimeData = { index, schedule: loaded };
        // Fixtures: o endereço do catálogo. Anime real: o lookup da Apple, com a reserva.
        const resolver =
          index.catalog.provider === APPLE_PROVIDER
            ? appleResolver({ index, fetchFn, budget })
            : catalogResolver(index, resolveUrl);
        setLoad({ status: "ready", data, resolver });
      },
      (error: unknown) =>
        setLoad({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" }),
    );
  }, [fetchFn, baseUrl, dataDir, budget, resolveUrl, getSchedule]);
  return { load, request, schedule, requestSchedule };
}

type Props = {
  readonly tab: AnimeTab;
  readonly store: AnimeStore;
  /** O dia jogado: hoje ou, pelo Histórico, um dia passado (P261). */
  readonly date: string;
  /** O "hoje" do jogo (não o relógio): o diário de um dia antes dele termina como jogado depois. */
  readonly today: string;
  /** A última leitura do save. */
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** Onde o diário grava o andamento; null = não salva nesta sessão. */
  readonly saveStore: KeyValueStore | null;
  readonly onSaved: () => void;
  /** Endereço do jogo no texto compartilhado. */
  readonly shareUrl: string;
  /** O resultado de um diário acabou de aparecer: as medalhas novas (M16, o `onResult` do Game). */
  readonly onResult?: () => void;
};

/** Os 3 diários de um modo no dia, na ordem das dificuldades; sem o dia na agenda, nenhum. */
function modeDailies(day: AnimeDay | null, date: string, mode: AnimeMode): Daily[] {
  return day ? ANIME_DIFFICULTIES.map((difficulty) => animeDaily(day, date, mode, difficulty)) : [];
}

/**
 * A categoria Anime (M14): a escolha do modo (P233), a da dificuldade e o diário, pela aba. Abrir
 * qualquer uma delas carrega o Anime, uma vez por sessão.
 */
export function Anime(props: Props) {
  const { tab, store } = props;
  const { load, request } = store;
  useEffect(() => {
    if (load.status === "idle") request();
  }, [load.status, request]);
  const screen = animeScreen(tab);

  switch (load.status) {
    case "idle":
    case "loading":
      // Com o foco: depois do "Tentar de novo", o botão sumiu (regra 16).
      return (
        <div class="loading screen" key="anime-loading">
          <FocusedNotice text={t("load.loading")} />
        </div>
      );
    case "update":
      return <UpdateNotice />;
    case "retry":
      // Na tela da categoria, tentar de novo; nas outras, voltar a ela (ou ao dia passado).
      return screen.kind === "modes" ? (
        <section class="error screen">
          <FocusedNotice text={t("anime.retry")} />
          <button type="button" class="primary" onClick={singleClick(request)}>
            {t("load.retryButton")}
          </button>
        </section>
      ) : (
        <AnimeUnavailable
          key={props.date}
          text={t("anime.retry")}
          date={props.date}
          today={props.today}
        />
      );
    case "ready":
      return <Ready {...props} screen={screen} data={load.data} resolver={load.resolver} />;
    default:
      return load satisfies never;
  }
}

type ReadyProps = Props & {
  readonly screen: AnimeScreen;
  readonly data: AnimeData;
  readonly resolver: PreviewResolver;
};

/**
 * O Anime carregado: a tela da aba, com o dia jogado na agenda do Anime (ou sem ele). O dia
 * passado (o Histórico) troca a dica do título pela data, e os cartões levam a data no endereço.
 */
function Ready({ screen, data, resolver, date, today, save, ...props }: ReadyProps) {
  const day = pickAnimeDay(data.schedule, date);
  const past = date !== today;
  // O diário aberto, guardado entre os renders: o Game recalcula a sessão quando o descritor muda.
  const mode = screen.kind === "daily" ? screen.mode : null;
  const difficulty = screen.kind === "daily" ? screen.difficulty : null;
  const daily = useMemo(
    () => (day && mode && difficulty ? animeDaily(day, date, mode, difficulty) : null),
    [day, date, mode, difficulty],
  );
  const own = useMemo(() => (daily ? [daily] : []), [daily]);
  // Num dia passado, a ajuda evita também as respostas dos 6 diários de hoje, como nos Hits: a de
  // um diário de hoje ainda não jogado podia sair entre as opções e entregá-lo. Hoje, o próprio
  // diário basta (o `avoid` dele já tem os 6 do dia).
  const todayDay = past ? pickAnimeDay(data.schedule, today) : null;
  const todayDailies = useMemo(
    () => (past ? ANIME_MODES.flatMap((m) => modeDailies(todayDay, today, m)) : own),
    [past, todayDay, today, own],
  );

  switch (screen.kind) {
    case "modes":
      // key: ao trocar de dia (do Histórico para hoje, pela nav), o foco volta ao título.
      return <AnimeModes key={date} day={day} date={date} today={today} save={save} />;
    case "levels":
      return (
        <AnimeLevels
          key={date}
          mode={screen.mode}
          day={day}
          date={date}
          today={today}
          save={save}
        />
      );
    case "daily": {
      if (!daily) {
        const text = past ? t("anime.unavailableDay") : t("anime.unavailable");
        return <AnimeUnavailable key={date} text={text} date={date} today={today} />;
      }
      return (
        // key: cada diário monta do zero ao trocar de diário, com o save daquele momento.
        <Game
          key={daily.id}
          daily={daily}
          // Só as 3 faixas do diário aberto vão na consulta da carga: os outros 5 podem nunca
          // ser jogados, e cada consulta gasta a cota da Apple.
          dailies={own}
          index={data.index}
          engine={props.engine}
          resolver={resolver}
          resolveUrl={props.resolveUrl}
          announce={props.announce}
          store={props.saveStore}
          initialSave={save}
          onSaved={props.onSaved}
          onResult={props.onResult}
          scheduleDates={Object.keys(data.schedule.days)}
          shareUrl={props.shareUrl}
          today={today}
          todayDailies={todayDailies}
          // Do resumo, um passo atrás: a escolha da dificuldade do modo, no dia jogado (P322).
          back={{
            href: hrefOf(animeModeTab(screen.mode), date, today),
            label: t("anime.backToLevels"),
            labelFull: t("anime.backToLevelsFull"),
          }}
        />
      );
    }
    default:
      return screen satisfies never;
  }
}

/** O endereço de uma aba do Anime no dia jogado: com a data, num dia passado (P261). */
function hrefOf(tab: AnimeTab, date: string, today: string): string {
  return routeHref({ tab, date: date === today ? null : date });
}

/**
 * O cartão de um modo: leva à escolha da dificuldade. Sem o dia na agenda, não é link (não há o
 * que jogar lá dentro).
 */
function modeCard(
  mode: AnimeMode,
  dailies: readonly Daily[],
  save: Save,
  next: boolean,
  href: string,
  unavailable: string,
): Card {
  const lines =
    dailies.length === 0
      ? [unavailable]
      : [
          progressText(
            progress(
              save,
              dailies.map((daily) => daily.id),
            ),
          ),
        ];
  return {
    tab: animeModeTab(mode),
    href,
    name: animeModeName(mode),
    short: t(`anime.modeShort.${mode}`),
    hint: t(`anime.modeHint.${mode}`, {
      total: MODE_RULES.song.maxAttempts,
      rounds: ROUNDS_PER_DAY,
    }),
    lines,
    next,
    off: dailies.length === 0,
  };
}

type ScreenProps = {
  readonly day: AnimeDay | null;
  /** O dia jogado: hoje ou um dia passado. */
  readonly date: string;
  readonly today: string;
  readonly save: Save;
};

/** A dica do título: num dia passado, a data dele, no lugar da dica (a tela não cresce). */
function screenHint(hint: string, date: string, today: string): string {
  return date === today ? hint : dayTitle(date);
}

/** O cartão sem diário: "hoje" ou, num dia passado, "nesse dia" (como na tela do dia). */
function unavailableText(date: string, today: string): string {
  return date === today ? t("home.statusUnavailable") : t("history.unavailable");
}

/**
 * A tela do Anime (P233): os 2 modos, acertar a música e acertar o anime, cada um com o estado
 * dos seus 3 diários numa linha. O 1º modo com um diário por jogar é o cartão oliva. A tela vai
 * receber o Treino do Anime depois.
 */
function AnimeModes({ day, date, today, save }: ScreenProps) {
  const heading = useHeadingFocus();
  const groups = ANIME_MODES.map((mode) => ({ mode, dailies: modeDailies(day, date, mode) }));
  const next = groups.find((g) => firstToPlay(save, g.dailies))?.mode;
  const cards = groups.map((g) =>
    modeCard(
      g.mode,
      g.dailies,
      save,
      g.mode === next,
      hrefOf(animeModeTab(g.mode), date, today),
      unavailableText(date, today),
    ),
  );
  return (
    // O cabeçalho no centro, como nas outras telas de escolha (.practice).
    <div class="game practice anime screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("anime.title")}
        </h1>
        <p class="hint">{screenHint(t("anime.hint"), date, today)}</p>
      </header>
      <CardList cards={cards} idPrefix="anime" single />
      <AnimeCredits />
    </div>
  );
}

/**
 * Os créditos das fontes do Anime (P241), numa linha, nas telas de escolha (e não em toda rodada,
 * para caber): o link leva ao "Sobre e privacidade", com o link de cada uma. O MyAnimeList só em
 * texto, sem logo (P256).
 */
function AnimeCredits() {
  return (
    <p class="anime-credits">
      {/* O 2º clique de um toque duplo não segue o link (regra 23). */}
      <a href={ROUTES.about} onClick={singleClickLink}>
        {t("anime.credits")} <span class="sr-only">{t("anime.creditsMore")}</span>
      </a>
    </p>
  );
}

/**
 * O cartão de uma dificuldade: o estado do diário dela. O jogado depois (num dia passado) leva a
 * marca numa linha a mais, como nos Hits (P263).
 */
function levelCard(
  mode: AnimeMode,
  difficulty: AnimeDifficulty,
  status: DailyStatus,
  next: boolean,
  href: string,
  unavailable: string,
): Card {
  const rule = t(`anime.rule.${mode}`, {
    total: MODE_RULES.song.maxAttempts,
    rounds: ROUNDS_PER_DAY,
  });
  const line = status.kind === "unavailable" ? unavailable : dailyText(status);
  return {
    tab: animeKey(mode, difficulty),
    href,
    name: t(`anime.level.${difficulty}`),
    short: t(`anime.levelShort.${difficulty}`),
    hint: `${t(`anime.levelHint.${difficulty}`)} ${rule}`,
    lines: status.kind === "done" && status.late ? [line, t("history.late")] : [line],
    next,
    off: status.kind === "unavailable",
  };
}

/**
 * A escolha da dificuldade de um modo (P232): Fácil, Médio e Difícil, numa coluna, cada um com o
 * estado do diário (o número, novo, em andamento ou o resultado). O 1º por jogar é o oliva.
 */
function AnimeLevels({ mode, day, date, today, save }: ScreenProps & { readonly mode: AnimeMode }) {
  const heading = useHeadingFocus();
  const dailies = modeDailies(day, date, mode);
  const next = firstToPlay(save, dailies);
  const cards = ANIME_DIFFICULTIES.map((difficulty, i) => {
    const key = animeKey(mode, difficulty);
    return levelCard(
      mode,
      difficulty,
      statusOf(save, dailies[i] ?? null),
      next?.key === key,
      hrefOf(key, date, today),
      unavailableText(date, today),
    );
  });
  return (
    <div class="game practice anime-levels screen">
      <header class="has-back">
        {/* A volta à tela do Anime (P321, P323), no dia jogado: a seta à esquerda do título, fora
            do fluxo (a tela não cresce). O 2º clique de um toque duplo não segue o link (regra 23):
            cairia num cartão. */}
        <a class="back-link" href={hrefOf("anime", date, today)} onClick={singleClickLink}>
          <span class="back-chevron" aria-hidden="true">
            <Icon name="next" />
          </span>
          <span class="sr-only">{t("anime.back")}</span>
        </a>
        <h1 ref={heading} tabIndex={-1}>
          {animeModeName(mode)}
        </h1>
        <p class="hint">{screenHint(t("anime.levelsHint"), date, today)}</p>
      </header>
      <CardList cards={cards} idPrefix="anime-levels" single />
      <AnimeCredits />
    </div>
  );
}

type UnavailableProps = {
  readonly text: string;
  readonly date: string;
  readonly today: string;
};

/**
 * Sem o diário (o dia fora da agenda do Anime, a carga que falhou): de volta ao Anime ou, num dia
 * passado, à tela dele no Histórico.
 */
function AnimeUnavailable({ text, date, today }: UnavailableProps) {
  return (
    <section class="unavailable screen">
      <FocusedNotice text={text} />
      {/* O 2º clique de um toque duplo não segue o link (regra 23): cairia num cartão. */}
      {date === today ? (
        <a href={ROUTES.anime} onClick={singleClickLink}>
          {t("anime.back")}
        </a>
      ) : (
        <a href={routeHref({ tab: "history", date })} onClick={singleClickLink}>
          {t("history.backToDay")}
        </a>
      )}
    </section>
  );
}
