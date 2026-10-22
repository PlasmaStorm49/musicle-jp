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
import { type DailyStatus, firstToPlay, type Progress, progress, statusOf } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import {
  type AnimeScreen,
  type AnimeTab,
  animeModeTab,
  animeScreen,
  ROUTES,
} from "../core/routes.ts";
import { MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { AnimeDay } from "../core/types.ts";
import {
  appleResolver,
  catalogResolver,
  type LookupBudget,
  type PreviewResolver,
} from "../data/previews.ts";
import {
  type AnimeData,
  type FetchLike,
  loadAnime,
  pickAnimeDay,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import type { KeyValueStore } from "../storage/save.ts";
import { type Card, CardList, dailyText } from "./cards.tsx";
import { FocusedNotice, UpdateNotice } from "./FocusedNotice.tsx";
import { Game } from "./Game.tsx";
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

/**
 * O Anime guardado no App, como o modo por artista: trocar de aba e voltar não baixa de novo. Ele
 * carrega só quando a pessoa abre a categoria (quem joga só os Hits não baixa nada a mais).
 */
export type AnimeStore = {
  readonly load: AnimeLoad;
  /** Carrega (de novo): ao abrir a categoria e no "Tentar de novo". */
  readonly request: () => void;
};

export function useAnimeStore({
  fetchFn,
  baseUrl,
  dataDir,
  budget,
  resolveUrl,
}: AnimeStoreOptions): AnimeStore {
  const [load, setLoad] = useState<AnimeLoad>({ status: "idle" });
  const request = useCallback(() => {
    setLoad({ status: "loading" });
    loadAnime(fetchFn, baseUrl, dataDir).then(
      (data) => {
        // Fixtures: o endereço do catálogo. Anime real: o lookup da Apple, com a reserva.
        const resolver =
          data.index.catalog.provider === APPLE_PROVIDER
            ? appleResolver({ index: data.index, fetchFn, budget })
            : catalogResolver(data.index, resolveUrl);
        setLoad({ status: "ready", data, resolver });
      },
      (error: unknown) =>
        setLoad({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" }),
    );
  }, [fetchFn, baseUrl, dataDir, budget, resolveUrl]);
  return { load, request };
}

type Props = {
  readonly tab: AnimeTab;
  readonly store: AnimeStore;
  /** Data do jogo (não o relógio). */
  readonly date: string;
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
      // Na tela da categoria, tentar de novo; nas outras, voltar a ela.
      return screen.kind === "modes" ? (
        <section class="error screen">
          <FocusedNotice text={t("anime.retry")} />
          <button type="button" class="primary" onClick={singleClick(request)}>
            {t("load.retryButton")}
          </button>
        </section>
      ) : (
        <AnimeUnavailable text={t("anime.retry")} />
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

/** O Anime carregado: a tela da aba, com o dia de hoje na agenda do Anime (ou sem ele). */
function Ready({ screen, data, resolver, date, save, ...props }: ReadyProps) {
  const day = pickAnimeDay(data.schedule, date);
  // O diário aberto, guardado entre os renders: o Game recalcula a sessão quando o descritor muda.
  const mode = screen.kind === "daily" ? screen.mode : null;
  const difficulty = screen.kind === "daily" ? screen.difficulty : null;
  const daily = useMemo(
    () => (day && mode && difficulty ? animeDaily(day, date, mode, difficulty) : null),
    [day, date, mode, difficulty],
  );
  const own = useMemo(() => (daily ? [daily] : []), [daily]);

  switch (screen.kind) {
    case "modes":
      return <AnimeModes day={day} date={date} save={save} />;
    case "levels":
      return <AnimeLevels mode={screen.mode} day={day} date={date} save={save} />;
    case "daily": {
      if (!daily) return <AnimeUnavailable text={t("anime.unavailable")} />;
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
          scheduleDates={Object.keys(data.schedule.days)}
          shareUrl={props.shareUrl}
        />
      );
    }
    default:
      return screen satisfies never;
  }
}

/** O estado dos 3 diários de um modo, numa linha: novos, em andamento ou quantos terminaram. */
function progressText({ done, playing, total }: Progress): string {
  if (done > 0) return t("anime.modeDone", { done, total });
  if (playing > 0) return t("anime.modePlaying");
  return t("anime.modeNew", { total });
}

/**
 * O cartão de um modo: leva à escolha da dificuldade. Sem o dia na agenda, não é link (não há o
 * que jogar lá dentro).
 */
function modeCard(mode: AnimeMode, dailies: readonly Daily[], save: Save, next: boolean): Card {
  const lines =
    dailies.length === 0
      ? [t("home.statusUnavailable")]
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

/** O título da tela, com o foco ao montar (regra 16): a tela nova, e não o link que sumiu. */
function useHeadingFocus() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return heading;
}

type ScreenProps = {
  readonly day: AnimeDay | null;
  readonly date: string;
  readonly save: Save;
};

/**
 * A tela do Anime (P233): os 2 modos, acertar a música e acertar o anime, cada um com o estado
 * dos seus 3 diários numa linha. O 1º modo com um diário por jogar é o cartão oliva. A tela vai
 * receber o Treino do Anime depois.
 */
function AnimeModes({ day, date, save }: ScreenProps) {
  const heading = useHeadingFocus();
  const groups = ANIME_MODES.map((mode) => ({ mode, dailies: modeDailies(day, date, mode) }));
  const next = groups.find((g) => firstToPlay(save, g.dailies))?.mode;
  const cards = groups.map((g) => modeCard(g.mode, g.dailies, save, g.mode === next));
  return (
    // O cabeçalho no centro, como nas outras telas de escolha (.practice).
    <div class="game practice anime screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("anime.title")}
        </h1>
        <p class="hint">{t("anime.hint")}</p>
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

/** O cartão de uma dificuldade: o estado do diário dela. */
function levelCard(
  mode: AnimeMode,
  difficulty: AnimeDifficulty,
  status: DailyStatus,
  next: boolean,
): Card {
  const rule = t(`anime.rule.${mode}`, {
    total: MODE_RULES.song.maxAttempts,
    rounds: ROUNDS_PER_DAY,
  });
  return {
    tab: animeKey(mode, difficulty),
    name: t(`anime.level.${difficulty}`),
    short: t(`anime.levelShort.${difficulty}`),
    hint: `${t(`anime.levelHint.${difficulty}`)} ${rule}`,
    lines: [dailyText(status)],
    next,
    off: status.kind === "unavailable",
  };
}

/**
 * A escolha da dificuldade de um modo (P232): Fácil, Médio e Difícil, numa coluna, cada um com o
 * estado do diário (o número, novo, em andamento ou o resultado). O 1º por jogar é o oliva.
 */
function AnimeLevels({ mode, day, date, save }: ScreenProps & { readonly mode: AnimeMode }) {
  const heading = useHeadingFocus();
  const dailies = modeDailies(day, date, mode);
  const next = firstToPlay(save, dailies);
  const cards = ANIME_DIFFICULTIES.map((difficulty, i) =>
    levelCard(
      mode,
      difficulty,
      statusOf(save, dailies[i] ?? null),
      next?.key === animeKey(mode, difficulty),
    ),
  );
  return (
    <div class="game practice anime-levels screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {animeModeName(mode)}
        </h1>
        <p class="hint">{t("anime.levelsHint")}</p>
      </header>
      <CardList cards={cards} idPrefix="anime-levels" single />
      <AnimeCredits />
    </div>
  );
}

/** Sem o diário (o dia fora da agenda do Anime, a carga que falhou): de volta ao Anime. */
function AnimeUnavailable({ text }: { readonly text: string }) {
  return (
    <section class="unavailable screen">
      <FocusedNotice text={text} />
      <a href={ROUTES.anime}>{t("anime.back")}</a>
    </section>
  );
}
