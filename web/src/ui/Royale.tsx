// O Anime Royale (o usuário, 01/11/2026), na categoria Anime: a escolha das 3 dificuldades e cada
// uma delas, só de hoje (não há Histórico). Usa o catálogo do Anime (a carga do Anime, guardada no
// App) e a agenda dele, que desce só quando a pessoa abre uma das telas.
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { DailyStatus } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { ROUTES, type RoyaleTab, royaleScreen } from "../core/routes.ts";
import {
  nextRoyale,
  ROYALE_TIERS,
  type RoyaleDaily,
  royaleDailies,
  royaleKey,
  royaleStatusOf,
} from "../core/royale.ts";
import type { RoyaleSchedule } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import {
  type FetchLike,
  loadRoyaleSchedule,
  pickRoyaleDay,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import type { KeyValueStore } from "../storage/save.ts";
import type { AnimeStore } from "./Anime.tsx";
import { type Card, CardList, dailyText } from "./cards.tsx";
import { FocusedNotice, UpdateNotice } from "./FocusedNotice.tsx";
import { useHeadingFocus } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { RoyaleGame } from "./RoyaleGame.tsx";
import { singleClick, singleClickLink } from "./singleClick.ts";

/** A agenda do Royale: "update" é versão que o código não conhece. */
export type RoyaleLoad =
  | { readonly status: "idle" | "loading" | "retry" | "update" }
  | { readonly status: "ready"; readonly schedule: RoyaleSchedule };

/** A agenda guardada no App, como a das Misturadas: trocar de aba e voltar não baixa de novo. */
export type RoyaleStore = {
  readonly load: RoyaleLoad;
  /** Carrega (de novo): ao abrir a tela e no "Tentar de novo". */
  readonly request: () => void;
};

export function useRoyaleStore({
  fetchFn,
  baseUrl,
  dataDir,
}: {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
}): RoyaleStore {
  const [load, setLoad] = useState<RoyaleLoad>({ status: "idle" });
  const request = useCallback(() => {
    setLoad({ status: "loading" });
    loadRoyaleSchedule(fetchFn, baseUrl, dataDir).then(
      (schedule) => setLoad({ status: "ready", schedule }),
      (error: unknown) =>
        setLoad({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" }),
    );
  }, [fetchFn, baseUrl, dataDir]);
  return { load, request };
}

type Props = {
  readonly tab: RoyaleTab;
  /** O Anime do App: o catálogo e o resolvedor das prévias. */
  readonly anime: AnimeStore;
  readonly store: RoyaleStore;
  /** O "hoje" do jogo. */
  readonly today: string;
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly saveStore: KeyValueStore | null;
  readonly onSaved: () => void;
  readonly shareUrl: string;
  readonly onResult?: () => void;
};

/** O Royale: a carga das duas partes e a tela da aba. */
export function Royale(props: Props) {
  const { anime, store } = props;
  useEffect(() => {
    if (anime.load.status === "idle") anime.request();
  }, [anime.load.status, anime.request]);
  useEffect(() => {
    if (store.load.status === "idle") store.request();
  }, [store.load.status, store.request]);
  const retry = useCallback(() => {
    if (anime.load.status === "retry") anime.request();
    if (store.load.status === "retry") store.request();
  }, [anime, store]);

  const statuses = [anime.load.status, store.load.status];
  if (statuses.includes("update")) return <UpdateNotice />;
  if (statuses.includes("retry")) {
    return (
      <section class="error screen">
        <FocusedNotice text={t("royale.retry")} />
        <button type="button" class="primary" onClick={singleClick(retry)}>
          {t("load.retryButton")}
        </button>
      </section>
    );
  }
  if (anime.load.status !== "ready" || store.load.status !== "ready") {
    // Com o foco: depois do "Tentar de novo", o botão sumiu (regra 16).
    return (
      <div class="loading screen" key="royale-loading">
        <FocusedNotice text={t("load.loading")} />
      </div>
    );
  }
  const { data, resolver } = anime.load;
  return <Ready {...props} schedule={store.load.schedule} index={data.index} resolver={resolver} />;
}

type ReadyProps = Props & {
  readonly schedule: RoyaleSchedule;
  readonly index: CatalogIndex;
  readonly resolver: PreviewResolver;
};

function Ready({ tab, schedule, index, resolver, today, save, ...props }: ReadyProps) {
  const day = pickRoyaleDay(schedule, today);
  const dailies = useMemo(() => royaleDailies(day, today), [day, today]);
  const screen = royaleScreen(tab);
  if (screen.kind === "levels") return <RoyaleLevels dailies={dailies} save={save} />;
  const daily = dailies.find((d) => d.tier === screen.tier) ?? null;
  if (!daily) return <RoyaleUnavailable />;
  return (
    // key: cada dificuldade monta do zero, com o save daquele momento.
    <RoyaleGame
      key={daily.id}
      daily={daily}
      next={nextRoyale(save, dailies, daily.tier)}
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
    />
  );
}

/** O estado de uma dificuldade no cartão: o terminado diz os acertos, e não pontos. */
function royaleText(status: DailyStatus) {
  if (status.kind !== "done") return dailyText(status);
  return (
    <span class="tag-done">
      <Icon name="right" />
      {t("royale.statusDone", { score: status.score, max: status.max })}
    </span>
  );
}

/**
 * A escolha da dificuldade: Fácil, Médio e Difícil, numa coluna, cada um com o estado de hoje. A
 * 1ª por jogar é o cartão oliva.
 */
function RoyaleLevels({
  dailies,
  save,
}: {
  readonly dailies: readonly RoyaleDaily[];
  readonly save: Save;
}) {
  const heading = useHeadingFocus();
  const next = dailies.find((d) => !save.royale.finished[d.id]);
  const cards: Card[] = ROYALE_TIERS.map((tier, i) => {
    const status = royaleStatusOf(save, dailies[i] ?? null);
    return {
      tab: royaleKey(tier),
      name: t(`anime.level.${tier}`),
      short: t(`anime.levelShort.${tier}`),
      hint: `${t(`anime.levelHint.${tier}`)} ${t("royale.hint")}`,
      lines: [royaleText(status)],
      next: next?.tier === tier,
      off: status.kind === "unavailable",
    };
  });
  return (
    <div class="game practice anime-levels royale-levels screen">
      <header class="has-back">
        {/* A volta à tela do Anime, como na escolha da dificuldade dele. O 2º clique de um toque
            duplo não segue o link (regra 23): cairia num cartão. */}
        <a class="back-link" href={ROUTES.anime} onClick={singleClickLink}>
          <span class="back-chevron" aria-hidden="true">
            <Icon name="next" />
          </span>
          <span class="sr-only">{t("royale.back")}</span>
        </a>
        <h1 ref={heading} tabIndex={-1}>
          {t("royale.title")}
        </h1>
        <p class="hint">{t("royale.levelsHint")}</p>
      </header>
      <CardList cards={cards} idPrefix="royale-levels" single />
      <p class="anime-credits">
        <a href={ROUTES.about} onClick={singleClickLink}>
          {t("royale.credits")} <span class="sr-only">{t("anime.creditsMore")}</span>
        </a>
      </p>
    </div>
  );
}

/** Sem a dificuldade de hoje na agenda: de volta ao Anime. */
function RoyaleUnavailable() {
  return (
    <section class="unavailable screen">
      <FocusedNotice text={t("royale.unavailable")} />
      {/* O 2º clique de um toque duplo não segue o link (regra 23): cairia num cartão. */}
      <a href={ROUTES.anime} onClick={singleClickLink}>
        {t("royale.back")}
      </a>
    </section>
  );
}
