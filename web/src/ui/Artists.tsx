import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import {
  type ArtistPlay,
  artistSections,
  excludedForArtist,
  type ListedArtist,
} from "../core/artists.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  type PracticeSession,
  pendingDailySongKeys,
  startPracticeSession,
} from "../core/practice.ts";
import { type Save, withArtistRight, withSuperfanEnd } from "../core/records.ts";
import { currentRound } from "../core/reducer.ts";
import {
  SUPERFAN_LIVES,
  type SuperfanRun,
  startSuperfan,
  superfanOutcome,
} from "../core/superfan.ts";
import type { ArtistList, ArtistListEntry, Day } from "../core/types.ts";
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
import { t, tAround, tn } from "../i18n/t.ts";
import { ArtistCover } from "./ArtistCover.tsx";
import { ArtistName, WithName } from "./ArtistName.tsx";
import { Attribution } from "./Attribution.tsx";
import { FocusedNotice, UpdateNotice } from "./FocusedNotice.tsx";
import { PracticeRun, type RunTexts, randomSeed } from "./PracticeRun.tsx";
import { SuperfanView } from "./Superfan.tsx";
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
  /**
   * Grava uma mudança no save (o `updateSave` do App): o modo por artista guarda só os acertos e
   * o fim do Superfan, pelas medalhas (P289). Sem ele (os testes), nada é gravado.
   */
  readonly record?: (change: (save: Save) => Save) => void;
};

/**
 * O estado do modo por artista, guardado no App (P144): trocar de aba e voltar não perde a
 * lista, os artistas já baixados nem a sessão. A lista carrega ao entrar na aba e cada artista
 * ao ser escolhido. A sessão fica só na memória (P116); o save recebe só cada música acertada e o
 * fim da partida do Superfan (P289).
 */
export type ArtistStore = {
  readonly list: ListLoad;
  /** Carrega (de novo) a lista: ao entrar na aba e no "Tentar de novo". */
  readonly loadList: () => void;
  /** O artista escolhido que ainda está carregando, ou cuja carga falhou. */
  readonly choosing: (Pending & { readonly entry: ArtistListEntry }) | null;
  /** Escolhe o artista, carregando-o se preciso; carregado, vem a escolha do submodo (P161). */
  readonly choose: (entry: ArtistListEntry) => void;
  /** Desiste do artista que carrega ou que falhou e volta à lista. */
  readonly cancelChoice: () => void;
  /** O artista carregado, à espera da escolha do submodo (Livre ou Superfan). */
  readonly picked: { readonly entry: ArtistListEntry; readonly loaded: Loaded } | null;
  /** Começa a sessão do artista escolhido (`start` monta a 1ª rodada, com o artista carregado). */
  readonly begin: (start: (data: ArtistData) => ArtistPlay) => void;
  /** Troca a sessão em jogo por outra (o "Jogar de novo" do Superfan). */
  readonly replay: (play: ArtistPlay) => void;
  readonly play: ArtistPlay | null;
  /** O artista da sessão, carregado. */
  readonly loaded: Loaded | null;
  /** Mudança sobre a sessão Livre de agora. */
  readonly change: (change: (session: PracticeSession) => PracticeSession) => void;
  /** Mudança sobre a partida do Superfan de agora. */
  readonly changeRun: (change: (run: SuperfanRun) => SuperfanRun) => void;
  /** "Trocar de artista" (ou voltar da escolha do submodo): volta à lista (P127). */
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
  record,
}: ArtistStoreOptions): ArtistStore {
  const [list, setList] = useState<ListLoad>({ status: "idle" });
  const [choosing, setChoosing] = useState<ArtistStore["choosing"]>(null);
  const [play, setPlay] = useState<ArtistPlay | null>(null);
  const [pickedEntry, setPickedEntry] = useState<ArtistListEntry | null>(null);
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
    (entry) => {
      // Com uma carga em andamento, nenhuma outra escolha vale (nem a de um artista em cache):
      // a falha dela ficaria guardada atrás da escolha e apareceria depois.
      if (loading.current) return;
      if (cache.current.has(entry.id)) {
        setPickedEntry(entry);
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
          // Guardado mesmo se a pessoa voltou à lista: escolher de novo não busca de novo.
          cache.current.set(entry.id, { ...data, resolver });
          if (loading.current !== entry.id) return;
          loading.current = null;
          setChoosing(null);
          setPickedEntry(entry);
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

  const begin = useCallback<ArtistStore["begin"]>(
    (start) => {
      const loaded = pickedEntry ? cache.current.get(pickedEntry.id) : undefined;
      if (!pickedEntry || !loaded) return;
      const next = start(loaded);
      // `??`: um 2º clique antes da pintura não troca a sessão que acabou de começar.
      setPlay((current) => current ?? next);
      setPickedEntry(null);
    },
    [pickedEntry],
  );
  const replay = useCallback((next: ArtistPlay) => setPlay(next), []);

  const change = useCallback<ArtistStore["change"]>(
    (update) =>
      setPlay((current) =>
        current?.kind === "free" ? { ...current, session: update(current.session) } : current,
      ),
    [],
  );
  const changeRun = useCallback<ArtistStore["changeRun"]>(
    (update) =>
      setPlay((current) =>
        current?.kind === "superfan" ? { ...current, run: update(current.run) } : current,
      ),
    [],
  );
  const restart = useCallback(() => {
    setPlay(null);
    setPickedEntry(null);
  }, []);

  // Cada música acertada e o fim da partida do Superfan vão para o save uma vez só (P289). A
  // chave é o artista, o submodo, a semente da sessão e o número da rodada: voltar à aba, com a
  // sessão guardada aqui, remonta a revelação, mas não conta de novo. A anulada não é acerto.
  const recorded = useRef(new Set<string>());
  useEffect(() => {
    if (!play || !record) return;
    const session = play.kind === "free" ? play.session : play.run.session;
    const artistId = play.artist.id;
    const base = `${artistId}|${play.kind}|${session.practice.seed}`;
    const once = (key: string, change: (save: Save) => Save) => {
      if (recorded.current.has(key)) return;
      recorded.current.add(key);
      record(change);
    };
    if (session.game && currentRound(session.game).status === "won") {
      once(`${base}|${session.number}`, (save) => withArtistRight(save, artistId));
    }
    if (play.kind === "superfan" && play.run.end !== null) {
      const outcome = superfanOutcome(play.run);
      once(`${base}|fim`, (save) => withSuperfanEnd(save, artistId, outcome));
    }
  }, [play, record]);
  const cancelChoice = useCallback(() => {
    loading.current = null;
    setChoosing(null);
  }, []);
  const loaded = play ? (cache.current.get(play.artist.id) ?? null) : null;
  const pickedLoaded = pickedEntry ? cache.current.get(pickedEntry.id) : undefined;
  const picked = pickedEntry && pickedLoaded ? { entry: pickedEntry, loaded: pickedLoaded } : null;

  return {
    list,
    loadList,
    choosing,
    choose,
    cancelChoice,
    picked,
    begin,
    replay,
    play,
    loaded,
    change,
    changeRun,
    restart,
  };
}

type Props = {
  readonly store: ArtistStore;
  /** O índice da parada: as respostas dos diários de hoje ficam fora do sorteio (P141). */
  readonly chart: CatalogIndex;
  readonly day: Day | null;
  readonly date: string;
  /** A última leitura do save (os diários de hoje). O que o modo grava passa pelo store. */
  readonly save: Save;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
};

const NOTHING: ReadonlySet<string> = new Set();

/**
 * Modo por artista (M13): a lista; escolhido um artista, a escolha do submodo (P161); e a sessão,
 * no Livre (rodadas sem fim do Desafio, o PracticeRun do Treino, com a busca só pelo título) ou
 * no Superfan (a partida, ME61). Trocar de artista volta à lista (P127).
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

  // A semente sai daqui, e não do setter, que fica puro.
  const picked = store.picked;
  const startFree = () => {
    if (!picked) return;
    const seed = randomSeed();
    store.begin(({ file, index }) => ({
      kind: "free",
      artist: picked.entry,
      session: startPracticeSession(
        seed,
        "song",
        index,
        excludedForArtist(file, chart, pendingSongs),
      ),
    }));
  };
  const startSuperfanRun = () => {
    if (!picked) return;
    const seed = randomSeed();
    store.begin(({ file, index }) => ({
      kind: "superfan",
      artist: picked.entry,
      run: startSuperfan(seed, index, excludedForArtist(file, chart, pendingSongs)),
    }));
  };

  if (play && loaded) {
    if (play.kind === "superfan") {
      return (
        <SuperfanView
          artist={play.artist}
          run={play.run}
          index={loaded.index}
          resolver={loaded.resolver}
          excluded={excluded}
          engine={engine}
          resolveUrl={resolveUrl}
          announce={announce}
          onChange={store.changeRun}
          onAgain={() =>
            store.replay({
              kind: "superfan",
              artist: play.artist,
              run: startSuperfan(randomSeed(), loaded.index, excluded),
            })
          }
          onSwitch={store.restart}
        />
      );
    }
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
  if (picked) {
    return (
      <ModeChoice
        entry={picked.entry}
        onFree={startFree}
        onSuperfan={startSuperfanRun}
        onBack={store.restart}
      />
    );
  }
  if (choosing) {
    return <Choosing choosing={choosing} onRetry={store.choose} onBack={store.cancelChoice} />;
  }
  switch (list.status) {
    case "idle":
    case "loading":
      // Com o foco: depois do "Tentar de novo", o botão sumiu (regra 16).
      return (
        <div class="loading screen" key="list-loading">
          <FocusedNotice text={t("load.loading")} />
        </div>
      );
    case "retry":
      return (
        <section class="error screen">
          <FocusedNotice text={t("artists.retry")} />
          <button type="button" class="primary" onClick={singleClick(loadList)}>
            {t("load.retryButton")}
          </button>
        </section>
      );
    case "update":
      return <UpdateNotice />;
    case "ready":
      return <ArtistChoice list={list.list} resolveUrl={resolveUrl} onChoose={store.choose} />;
    default:
      return list satisfies never;
  }
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
      <section class="loading screen">
        <FocusedNotice
          key="loading"
          text={<WithName around={tAround("artists.loadingArtist", "artist")} name={artist} />}
        />
        <div class="artists-actions">{back}</div>
      </section>
    );
  }
  if (choosing.status === "update") return <UpdateNotice />;
  return (
    <section class="error screen">
      <FocusedNotice
        key="retry"
        text={<WithName around={tAround("artists.retryArtist", "artist")} name={artist} />}
      />
      <div class="artists-actions">
        <button type="button" class="primary" onClick={singleClick(() => onRetry(choosing.entry))}>
          {t("load.retryButton")}
        </button>
        {back}
      </div>
    </section>
  );
}

/**
 * A lista dos artistas, com a capa de cada um (P168): a principal, na ordem do artists.toml, e,
 * embaixo, a seção de fora do Japão, com o título dela (P200). Tela nova: o foco vai para o título
 * da página. Na lista real, o selo da Apple fecha a página (P170), com o link da playlist da parada
 * (P169).
 */
function ArtistChoice({
  list,
  resolveUrl,
  onChoose,
}: {
  readonly list: ArtistList;
  readonly resolveUrl: (url: string) => string;
  readonly onChoose: (entry: ArtistListEntry) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const { main, foreign } = artistSections(list);
  const cards = { list, resolveUrl, onChoose };
  return (
    <div class="game practice artists screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("artists.title")}
        </h1>
        {/* A dica curta na tela; a inteira, para o leitor de tela (P210). */}
        <p class="hint">
          <span aria-hidden="true">{t("artists.chooseShort")}</span>
          <span class="sr-only">{t("artists.chooseHint")}</span>
        </p>
      </header>
      {main.length > 0 && <ArtistCards artists={main} {...cards} />}
      {foreign.length > 0 && (
        <section aria-labelledby="artists-foreign">
          <h2 id="artists-foreign">{t("artists.foreign")}</h2>
          <ArtistCards artists={foreign} {...cards} />
        </section>
      )}
      {list.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
    </div>
  );
}

/** Os cartões de uma parte da lista. Os ids seguem a posição no índice: únicos na página. */
function ArtistCards({
  artists,
  list,
  resolveUrl,
  onChoose,
}: {
  readonly artists: readonly ListedArtist[];
  readonly list: ArtistList;
  readonly resolveUrl: (url: string) => string;
  readonly onChoose: (entry: ArtistListEntry) => void;
}) {
  return (
    <ul class="home-modes">
      {artists.map(({ entry, position: i }) => (
        <li key={entry.id}>
          {/* O nome acessível é só o do artista; a contagem vem como descrição. */}
          <button
            type="button"
            class="mode home-card artist-card"
            aria-labelledby={`artist-${i}-name`}
            aria-describedby={`artist-${i}-songs`}
            // O 2º clique de um toque duplo no "Trocar de artista" ou no "Sim" cai aqui.
            onClick={singleClick(() => onChoose(entry))}
          >
            <ArtistCover list={list} entry={entry} resolveUrl={resolveUrl} />
            <span class="artist-card-text">
              <span id={`artist-${i}-name`} class="mode-name">
                <ArtistName entry={entry} />
              </span>
              <span id={`artist-${i}-songs`} class="mode-hint">
                {tn("artists.songs", entry.songs)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * A escolha do submodo, depois do artista (P161): o Livre (o Desafio sem fim) ou o Superfan (a
 * partida difícil, ME61). Tela nova: o foco vai para o título, o nome do artista.
 */
function ModeChoice({
  entry,
  onFree,
  onSuperfan,
  onBack,
}: {
  readonly entry: ArtistListEntry;
  readonly onFree: () => void;
  readonly onSuperfan: () => void;
  readonly onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const modes = [
    { id: "free", name: t("artists.free"), hint: t("artists.freeHint"), start: onFree },
    {
      id: "superfan",
      name: t("superfan.name"),
      hint: t("artists.superfanHint", { total: SUPERFAN_LIVES }),
      start: onSuperfan,
    },
  ] as const;
  return (
    <div class="game practice artists screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          <ArtistName entry={entry} />
        </h1>
        <p class="hint">{t("artists.modeHint")}</p>
      </header>
      <ul class="home-modes">
        {modes.map((mode) => (
          <li key={mode.id}>
            <button
              type="button"
              class="mode home-card"
              aria-labelledby={`artist-mode-${mode.id}-name`}
              aria-describedby={`artist-mode-${mode.id}-hint`}
              // O 2º clique do toque duplo no cartão do artista cai aqui: não começa a sessão.
              onClick={singleClick(mode.start)}
            >
              <span id={`artist-mode-${mode.id}-name`} class="mode-name">
                {mode.name}
              </span>
              <span id={`artist-mode-${mode.id}-hint`} class="mode-hint">
                {mode.hint}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="back" onClick={singleClick(onBack)}>
        {t("artists.back")}
      </button>
    </div>
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
  readonly play: Extract<ArtistPlay, { kind: "free" }>;
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
      restartShort: t("artists.restartShort"),
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
