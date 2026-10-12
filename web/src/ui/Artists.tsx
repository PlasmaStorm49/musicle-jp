import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER } from "../core/apple.ts";
import { type ArtistPlay, excludedForArtist } from "../core/artists.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  type PracticeSession,
  pendingDailySongKeys,
  startPracticeSession,
} from "../core/practice.ts";
import type { Save } from "../core/records.ts";
import { MODE_RULES } from "../core/rules.ts";
import type { ArtistList, ArtistListEntry, Day } from "../core/types.ts";
import { langOf } from "../core/view.ts";
import {
  appleResolver,
  catalogResolver,
  type LookupBudget,
  type PreviewResolver,
} from "../data/previews.ts";
import {
  type ArtistData,
  type FetchLike,
  loadArtist,
  loadArtistList,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t, tn } from "../i18n/t.ts";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { PracticeRun, type RunTexts, randomSeed } from "./PracticeRun.tsx";
import { singleClick } from "./singleClick.ts";

/** Uma carga em andamento ou que falhou: "update" é versão de dados que o código não conhece. */
type Pending = { readonly status: "loading" | "retry" | "update" };

type ListLoad =
  | { readonly status: "idle" }
  | Pending
  | { readonly status: "ready"; readonly list: ArtistList };

/** Um artista carregado, com o seu resolvedor de prévias (o orçamento é o da sessão, P142). */
type Loaded = ArtistData & { readonly resolver: PreviewResolver };

export type ArtistStoreOptions = {
  readonly fetchFn: FetchLike;
  readonly baseUrl: string;
  readonly dataDir: string;
  readonly budget: LookupBudget;
  readonly resolveUrl: (url: string) => string;
};

/**
 * O estado do modo por artista, guardado no App (P144): trocar de aba e voltar não perde a
 * lista, os artistas já baixados nem a sessão. A lista carrega ao entrar na aba e cada artista
 * ao ser escolhido; nada fica salvo (P116).
 */
export type ArtistStore = {
  readonly list: ListLoad;
  /** Carrega (de novo) a lista: ao entrar na aba e no "Tentar de novo". */
  readonly loadList: () => void;
  /** O artista escolhido que ainda está carregando, ou cuja carga falhou. */
  readonly choosing: (Pending & { readonly entry: ArtistListEntry }) | null;
  /** Começa a sessão do artista, já com a 1ª rodada (`start`), carregando-o se preciso. */
  readonly choose: (entry: ArtistListEntry, start: (data: ArtistData) => PracticeSession) => void;
  /** Desiste do artista que carrega ou que falhou e volta à lista. */
  readonly cancelChoice: () => void;
  readonly play: ArtistPlay | null;
  /** O artista da sessão, carregado. */
  readonly loaded: Loaded | null;
  readonly change: (change: (session: PracticeSession) => PracticeSession) => void;
  /** "Trocar de artista": volta à lista (P127). */
  readonly restart: () => void;
};

function failure(error: unknown): Pending {
  return { status: error instanceof UnsupportedCatalogError ? "update" : "retry" };
}

export function useArtistStore({
  fetchFn,
  baseUrl,
  dataDir,
  budget,
  resolveUrl,
}: ArtistStoreOptions): ArtistStore {
  const [list, setList] = useState<ListLoad>({ status: "idle" });
  const [choosing, setChoosing] = useState<ArtistStore["choosing"]>(null);
  const [play, setPlay] = useState<ArtistPlay | null>(null);
  // Os artistas já baixados, com o resolvedor de cada um: escolher de novo não busca de novo.
  const cache = useRef(new Map<string, Loaded>());
  // O artista que está carregando (o estado só muda na próxima pintura: um 2º Enter não busca
  // de novo). Voltar à lista o esquece, e a carga que chegar depois não começa a sessão.
  const loading = useRef<string | null>(null);

  const loadList = useCallback(() => {
    setList({ status: "loading" });
    loadArtistList(fetchFn, baseUrl, dataDir).then(
      (value) => setList({ status: "ready", list: value }),
      (error: unknown) => setList(failure(error)),
    );
  }, [fetchFn, baseUrl, dataDir]);

  const choose = useCallback<ArtistStore["choose"]>(
    (entry, start) => {
      const begin = (loaded: Loaded) => {
        const session = start(loaded);
        // `??`: um 2º clique antes da pintura não troca a sessão que acabou de começar.
        setPlay((current) => current ?? { artist: entry, session });
      };
      // Com uma carga em andamento, nenhuma outra escolha vale (nem a de um artista em cache):
      // a falha dela ficaria guardada atrás da sessão e apareceria depois do "Trocar".
      if (loading.current) return;
      const cached = cache.current.get(entry.id);
      if (cached) {
        begin(cached);
        return;
      }
      loading.current = entry.id;
      setChoosing({ entry, status: "loading" });
      loadArtist(fetchFn, baseUrl, dataDir, entry).then(
        (data) => {
          const resolver =
            data.index.catalog.provider === APPLE_PROVIDER
              ? appleResolver({ index: data.index, fetchFn, budget })
              : catalogResolver(data.index, resolveUrl);
          const loaded = { ...data, resolver };
          // Guardado mesmo se a pessoa voltou à lista: escolher de novo não busca de novo.
          cache.current.set(entry.id, loaded);
          if (loading.current !== entry.id) return;
          loading.current = null;
          setChoosing(null);
          begin(loaded);
        },
        (error: unknown) => {
          if (loading.current !== entry.id) return;
          loading.current = null;
          setChoosing({ entry, ...failure(error) });
        },
      );
    },
    [fetchFn, baseUrl, dataDir, budget, resolveUrl],
  );

  const change = useCallback<ArtistStore["change"]>(
    (update) =>
      setPlay((current) => (current ? { ...current, session: update(current.session) } : current)),
    [],
  );
  const restart = useCallback(() => setPlay(null), []);
  const cancelChoice = useCallback(() => {
    loading.current = null;
    setChoosing(null);
  }, []);
  const loaded = play ? (cache.current.get(play.artist.id) ?? null) : null;

  return { list, loadList, choosing, choose, cancelChoice, play, loaded, change, restart };
}

type Props = {
  readonly store: ArtistStore;
  /** O índice da parada: as respostas dos diários de hoje ficam fora do sorteio (P141). */
  readonly chart: CatalogIndex;
  readonly day: Day | null;
  readonly date: string;
  /** A última leitura do save. O modo por artista não grava nada (P116). */
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
};

const NOTHING: ReadonlySet<string> = new Set();

/**
 * Modo por artista (M13): a lista e, escolhido um artista, rodadas sem fim do Desafio com as
 * músicas dele (o PracticeRun do Treino, com a busca só pelo título). Trocar de artista é
 * reiniciar (P127).
 */
export function Artists({ store, chart, day, date, save, engine, resolveUrl, announce }: Props) {
  const { list, loadList, choosing, play, loaded } = store;
  // Relidas a cada render, como no Treino: o diário que terminou libera as músicas dele.
  const pendingSongs = useMemo(
    () => pendingDailySongKeys(save, day, date, chart),
    [save, day, date, chart],
  );
  const excluded = useMemo(
    () => (loaded ? excludedForArtist(loaded.file, chart, pendingSongs) : NOTHING),
    [loaded, chart, pendingSongs],
  );

  useEffect(() => {
    if (list.status === "idle") loadList();
  }, [list.status, loadList]);

  const choose = (entry: ArtistListEntry) => {
    // A semente sai daqui, e não do setter, que fica puro.
    const seed = randomSeed();
    store.choose(entry, ({ file, index }) =>
      startPracticeSession(seed, "song", index, excludedForArtist(file, chart, pendingSongs)),
    );
  };

  if (play && loaded) {
    return (
      <ArtistRun
        play={play}
        loaded={loaded}
        excluded={excluded}
        store={store}
        engine={engine}
        resolveUrl={resolveUrl}
        announce={announce}
      />
    );
  }
  if (choosing) {
    return <Choosing choosing={choosing} onRetry={choose} onBack={store.cancelChoice} />;
  }
  switch (list.status) {
    case "idle":
    case "loading":
      // Com o foco: depois do "Tentar de novo", o botão sumiu (regra 16).
      return <FocusedNotice key="list-loading" text={t("load.loading")} />;
    case "retry":
      return (
        <section class="error">
          <FocusedNotice text={t("artists.retry")} />
          <button type="button" class="primary" onClick={singleClick(loadList)}>
            {t("load.retryButton")}
          </button>
        </section>
      );
    case "update":
      return <UpdateNotice />;
    case "ready":
      return <ArtistChoice list={list.list} onChoose={choose} />;
    default:
      return list satisfies never;
  }
}

/** Dados de uma versão que este código não conhece: recarregar a página (como no App). */
function UpdateNotice() {
  return (
    <section class="error">
      <FocusedNotice text={t("load.update")} />
      <button type="button" class="primary" onClick={() => window.location.reload()}>
        {t("load.updateButton")}
      </button>
    </section>
  );
}

/**
 * O artista escolhido carregando, ou a falha dele: o aviso leva o foco (o cartão sumiu). Dá
 * para voltar à lista também durante a carga: numa rede lenta, ela pode demorar minutos.
 */
function Choosing({
  choosing,
  onRetry,
  onBack,
}: {
  readonly choosing: NonNullable<ArtistStore["choosing"]>;
  readonly onRetry: (entry: ArtistListEntry) => void;
  readonly onBack: () => void;
}) {
  const artist = choosing.entry.name;
  const back = (
    <button type="button" onClick={singleClick(onBack)}>
      {t("artists.back")}
    </button>
  );
  if (choosing.status === "loading") {
    return (
      <section>
        <FocusedNotice key="loading" text={t("artists.loadingArtist", { artist })} />
        <div class="artists-actions">{back}</div>
      </section>
    );
  }
  if (choosing.status === "update") return <UpdateNotice />;
  return (
    <section class="error">
      <FocusedNotice key="retry" text={t("artists.retryArtist", { artist })} />
      <div class="artists-actions">
        <button type="button" class="primary" onClick={singleClick(() => onRetry(choosing.entry))}>
          {t("load.retryButton")}
        </button>
        {back}
      </div>
    </section>
  );
}

/** A lista dos artistas, na ordem do artists.toml. Tela nova: o foco vai para o título. */
function ArtistChoice({
  list,
  onChoose,
}: {
  readonly list: ArtistList;
  readonly onChoose: (entry: ArtistListEntry) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div class="game practice artists">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("artists.title")}
        </h1>
        <p class="hint">{t("artists.chooseHint", { total: MODE_RULES.song.maxAttempts })}</p>
      </header>
      <ul class="home-modes">
        {list.artists.map((entry, i) => (
          <li key={entry.id}>
            {/* O nome acessível é só o do artista; a contagem vem como descrição. */}
            <button
              type="button"
              class="mode home-card"
              aria-labelledby={`artist-${i}-name`}
              aria-describedby={`artist-${i}-songs`}
              // O 2º clique de um toque duplo no "Trocar de artista" ou no "Sim" cai aqui.
              onClick={singleClick(() => onChoose(entry))}
            >
              <span id={`artist-${i}-name`} class="mode-name">
                <ArtistName entry={entry} />
              </span>
              <span id={`artist-${i}-songs`} class="mode-hint">
                {tn("artists.songs", entry.songs)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O nome, com o latino ao lado quando há (como o artista da revelação, ME55, P147). */
function ArtistName({ entry }: { readonly entry: ArtistListEntry }) {
  return (
    <>
      <span lang={langOf(entry.name)}>{entry.name}</span>
      {entry.nameLatin && (
        <>
          {" "}
          <span aria-hidden="true">{t("item.artistSeparator")}</span> <span>{entry.nameLatin}</span>
        </>
      )}
    </>
  );
}

/** A sessão em jogo, com o artista escolhido: o título é o nome dele (com o lang certo). */
function ArtistRun({
  play,
  loaded,
  excluded,
  store,
  engine,
  resolveUrl,
  announce,
}: {
  readonly play: ArtistPlay;
  readonly loaded: Loaded;
  readonly excluded: ReadonlySet<string>;
  readonly store: ArtistStore;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
}) {
  const { artist } = play;
  const texts = useMemo<RunTexts>(
    () => ({
      title: <ArtistName entry={artist} />,
      restart: t("artists.restart"),
      restartWarning: (score) => t("artists.restartWarning", { score }),
      restartConfirm: t("artists.restartConfirm"),
      empty: t("artists.empty"),
    }),
    [artist],
  );
  return (
    <PracticeRun
      index={loaded.index}
      engine={engine}
      resolver={loaded.resolver}
      resolveUrl={resolveUrl}
      announce={announce}
      session={play.session}
      onChange={store.change}
      onRestart={store.restart}
      excluded={excluded}
      texts={texts}
      scope="title"
    />
  );
}
