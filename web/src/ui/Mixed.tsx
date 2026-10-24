// As Misturadas (M17, P26): a aba própria, com a escolha dos dois modos e os dois diários. Usa o
// catálogo do Anime (a carga do Anime, guardada no App) e a agenda delas, que desce só quando a
// pessoa abre a aba.
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  MIXED_MODES,
  MIXED_ROUNDS,
  type MixedDaily,
  mixedDailies,
  mixedKey,
  mixedStatusOf,
} from "../core/mixed.ts";
import type { Save } from "../core/records.ts";
import { type MixedTab, ROUTES } from "../core/routes.ts";
import type { MixedSchedule } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import {
  type FetchLike,
  loadMixedSchedule,
  pickMixedDay,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import type { KeyValueStore } from "../storage/save.ts";
import type { AnimeStore } from "./Anime.tsx";
import { type Card, CardList, dailyText } from "./cards.tsx";
import { FocusedNotice, UpdateNotice } from "./FocusedNotice.tsx";
import { useHeadingFocus } from "./hooks.ts";
import { MixedGame } from "./MixedGame.tsx";
import { animeModeName } from "./modes.ts";
import { singleClick, singleClickLink } from "./singleClick.ts";

/** A agenda das Misturadas: "update" é versão que o código não conhece. */
export type MixedLoad =
  | { readonly status: "idle" | "loading" | "retry" | "update" }
  | { readonly status: "ready"; readonly schedule: MixedSchedule };

/** A agenda guardada no App, como o Anime: trocar de aba e voltar não baixa de novo. */
export type MixedStore = {
  readonly load: MixedLoad;
  /** Carrega (de novo): ao abrir a aba e no "Tentar de novo". */
  readonly request: () => void;
};

export function useMixedStore({
  fetchFn,
  baseUrl,
  dataDir,
}: {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
}): MixedStore {
  const [load, setLoad] = useState<MixedLoad>({ status: "idle" });
  const request = useCallback(() => {
    setLoad({ status: "loading" });
    loadMixedSchedule(fetchFn, baseUrl, dataDir).then(
      (schedule) => setLoad({ status: "ready", schedule }),
      (error: unknown) =>
        setLoad({ status: error instanceof UnsupportedCatalogError ? "update" : "retry" }),
    );
  }, [fetchFn, baseUrl, dataDir]);
  return { load, request };
}

type Props = {
  readonly tab: MixedTab;
  /** O Anime do App: o catálogo e o resolvedor das prévias. */
  readonly anime: AnimeStore;
  readonly store: MixedStore;
  /** O "hoje" do jogo: as Misturadas são sempre de hoje (sem Histórico, P26). */
  readonly date: string;
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly saveStore: KeyValueStore | null;
  readonly onSaved: () => void;
  readonly shareUrl: string;
};

/** A aba das Misturadas: a carga das duas partes e a tela da aba. */
export function Mixed(props: Props) {
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
        <FocusedNotice text={t("mixed.retry")} />
        <button type="button" class="primary" onClick={singleClick(retry)}>
          {t("load.retryButton")}
        </button>
      </section>
    );
  }
  if (anime.load.status !== "ready" || store.load.status !== "ready") {
    // Com o foco: depois do "Tentar de novo", o botão sumiu (regra 16).
    return (
      <div class="loading screen" key="mixed-loading">
        <FocusedNotice text={t("load.loading")} />
      </div>
    );
  }
  const { data, resolver } = anime.load;
  return <Ready {...props} schedule={store.load.schedule} index={data.index} resolver={resolver} />;
}

type ReadyProps = Props & {
  readonly schedule: MixedSchedule;
  readonly index: CatalogIndex;
  readonly resolver: PreviewResolver;
};

function Ready({ tab, schedule, date, save, ...props }: ReadyProps) {
  const day = pickMixedDay(schedule, date);
  const dailies = useMemo(() => (day ? mixedDailies(day, date) : []), [day, date]);
  if (tab === "misturadas") return <MixedModes dailies={dailies} save={save} />;
  const daily = dailies.find((d) => d.key === tab);
  if (!daily) return <MixedUnavailable />;
  return (
    // key: cada diário monta do zero ao trocar de diário, com o save daquele momento.
    <MixedGame
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
    />
  );
}

/** O cartão de um modo: o estado do diário dele hoje. */
function modeCard(
  mode: (typeof MIXED_MODES)[number],
  daily: MixedDaily | null,
  save: Save,
  next: boolean,
): Card {
  const status = mixedStatusOf(save, daily);
  return {
    tab: mixedKey(mode),
    name: animeModeName(mode),
    short: t(`mixed.modeShort.${mode}`),
    hint: t(`mixed.modeHint.${mode}`, { rounds: MIXED_ROUNDS }),
    lines: [dailyText(status)],
    next,
    off: status.kind === "unavailable",
  };
}

/**
 * A tela das Misturadas: os 2 modos, acertar a música e acertar o anime, cada um com o estado do
 * diário de hoje. O 1º por jogar é o cartão oliva.
 */
function MixedModes({
  dailies,
  save,
}: {
  readonly dailies: readonly MixedDaily[];
  readonly save: Save;
}) {
  const heading = useHeadingFocus();
  // O 1º por jogar (novo ou em andamento), como o `firstToPlay` dos diários.
  const next = dailies.find((daily) => {
    const kind = mixedStatusOf(save, daily).kind;
    return kind === "new" || kind === "playing";
  });
  const cards = MIXED_MODES.map((mode) => {
    const daily = dailies.find((d) => d.mode === mode) ?? null;
    return modeCard(mode, daily, save, !!daily && daily === next);
  });
  return (
    <div class="game practice mixed-modes screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("mixed.title")}
        </h1>
        <p class="hint">{t("mixed.hint")}</p>
      </header>
      <CardList cards={cards} idPrefix="mixed" single />
    </div>
  );
}

/** Sem o diário de hoje na agenda: de volta à escolha do modo. */
function MixedUnavailable() {
  return (
    <section class="unavailable screen">
      <FocusedNotice text={t("mixed.unavailable")} />
      {/* O 2º clique de um toque duplo não segue o link (regra 23): cairia num cartão. */}
      <a href={ROUTES.misturadas} onClick={singleClickLink}>
        {t("mixed.back")}
      </a>
    </section>
  );
}
