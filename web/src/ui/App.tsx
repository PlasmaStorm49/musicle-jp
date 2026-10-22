import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine, EngineOptions, PlayLog } from "../audio/engine.ts";
import { FakeAudioEngine } from "../audio/fake.ts";
import { FallbackAudioEngine } from "../audio/fallback.ts";
import { HtmlAudioEngine } from "../audio/htmlaudio.ts";
import { WebAudioEngine } from "../audio/webaudio.ts";
import { APPLE_PROVIDER } from "../core/apple.ts";
import { dailyIds, hitsDailies } from "../core/daily.ts";
import { animeDone, artistSummary, dailiesDone, practiceSummary } from "../core/home.ts";
import { emptySave, pruneProgress, type Save } from "../core/records.ts";
import {
  type Category,
  categoryOf,
  isAnimeTab,
  ROUTES,
  type Tab,
  tabFromHash,
} from "../core/routes.ts";
import {
  appleResolver,
  catalogResolver,
  lookupBudget,
  type PreviewResolver,
} from "../data/previews.ts";
import {
  assetUrl,
  dataDirFor,
  type FetchLike,
  failAudioTrack,
  fakeAudioEnabled,
  type GameData,
  gameDate,
  htmlAudioForced,
  loadGameData,
  lookupFailForced,
  pickDay,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import {
  type KeyValueStore,
  type LoadResult,
  loadSave,
  openStore,
  SAVE_KEY,
  sessionStore,
  updateSave,
} from "../storage/save.ts";
import { About } from "./About.tsx";
import { Anime, type AnimeStore, useAnimeStore } from "./Anime.tsx";
import { type ArtistStore, Artists, useArtistStore } from "./Artists.tsx";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { Game } from "./Game.tsx";
import { Hits } from "./Hits.tsx";
import { Home } from "./Home.tsx";
import { NavLogo } from "./Logo.tsx";
import { Practice, type PracticeSession, type PracticeSessionSetter } from "./Practice.tsx";
import { savedVolume } from "./volume.ts";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "retry" }
  | { readonly status: "update" }
  | { readonly status: "ready"; readonly data: GameData };

declare global {
  interface Window {
    /** Só em desenvolvimento: registro de cada reprodução (pedido × tocado). */
    __musicleAudioLog?: PlayLog[];
  }
}

const BASE_URL = new URL(import.meta.env.BASE_URL, window.location.href).href;
// Para as funções que recebem o modo por parâmetro (gameDate, failAudioTrack). Para tirar código
// do build, use o literal import.meta.env.DEV no ponto da chamada (web/CLAUDE.md, regra 10).
const DEV = import.meta.env.DEV;
// O site publicado lê a parada real (data/); o desenvolvimento, as fixtures, ou a real com ?data=real.
const DATA_DIR = dataDirFor(DEV, window.location.search);
// Fora do componente: a mesma função a cada render (as cargas do modo por artista dependem dela).
const FETCH: FetchLike = (url, init) => fetch(url, init);

type Storage = {
  /**
   * O save desta sessão (sessionStore): grava no navegador quando dá e sempre guarda em memória,
   * para cada aba de diário reler o próprio andamento mesmo com o navegador sem gravar.
   */
  readonly store: KeyValueStore;
  readonly save: Save;
  readonly notice: string | null;
};

/** Abre o armazenamento uma vez: lê, limpa andamentos de outros dias e diz se vai salvar. */
function openSaves(date: string): Storage {
  const { store, persistent } = openStore(() => window.localStorage);
  let loaded: LoadResult;
  try {
    loaded = loadSave(store);
  } catch {
    loaded = { save: emptySave(), writable: false, notice: "unavailable" };
  }
  // Os andamentos de hoje que ficam: os dos Hits e os do Anime (P250); o resto é de outro dia.
  const today = dailyIds(date);
  if (loaded.writable) updateSave(store, (s) => pruneProgress(s, today));
  const notice =
    loaded.notice === "future"
      ? t("storage.future")
      : !persistent || !loaded.writable
        ? t("storage.unavailable")
        : null;
  const save = pruneProgress(loaded.save, today);
  return { store: sessionStore(store, { ...loaded, save }), save, notice };
}

/**
 * O aria-current do link de uma categoria: "page" na tela dela, "true" dentro de um jogo dela (o
 * diário ou o Treino, nos Hits), e nada nas outras.
 */
function current(tab: Tab, category: Category): "page" | "true" | undefined {
  if (categoryOf(tab) !== category) return undefined;
  return tab === category ? "page" : "true";
}

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState(t("load.loading"));
  const date = useMemo(() => gameDate(new Date(), window.location.search, DEV), []);
  const saves = useMemo(() => openSaves(date), [date]);
  const resolveUrl = useCallback((url: string) => assetUrl(BASE_URL, url), []);
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash));
  // A última leitura do save, para o ✓ da aba Hits e o Treino. Cada diário recebe a leitura do
  // momento em que a aba abre: voltar ao Desafio terminado mostra o resultado (P39).
  const [latest, setLatest] = useState(saves.save);
  // A sessão do Treino mora aqui, e não no Practice: trocar de aba e voltar não a zera. Só
  // na memória (P50): recarregar a página começa outra. null = a escolha do modo (P105).
  const [practice, setPractice] = useState<PracticeSession | null>(null);
  // A cota e o disjuntor do lookup da Apple, um só para a parada, os artistas e o Anime (P142).
  const budget = useMemo(
    () => lookupBudget({ now: Date.now, disabled: lookupFailForced(window.location.search) }),
    [],
  );
  // O modo por artista (M13): a lista, os artistas baixados e a sessão, como a do Treino.
  const artists = useArtistStore({
    fetchFn: FETCH,
    baseUrl: BASE_URL,
    dataDir: DATA_DIR,
    budget,
    resolveUrl,
  });
  // O Anime (M14): o catálogo e a agenda, carregados só quando a pessoa abre a categoria.
  const anime = useAnimeStore({
    fetchFn: FETCH,
    baseUrl: BASE_URL,
    dataDir: DATA_DIR,
    budget,
    resolveUrl,
  });
  const refresh = useCallback(() => {
    const read = loadSave(saves.store);
    if (read.writable) setLatest(read.save);
  }, [saves]);
  useEffect(() => {
    const onHashChange = () => {
      setTab(tabFromHash(window.location.hash));
      refresh();
    };
    // Outra aba do navegador gravou (terminou um diário): o ✓ e o Treino acompanham.
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVE_KEY) refresh();
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);
  // Texto igual ao anterior não muda o DOM e o leitor de tela fica calado (copiar duas vezes,
  // duas rodadas anuladas): alterna um espaço invisível no fim para ele ler de novo.
  const announce = useCallback(
    (text: string) => setMessage((prev) => (prev === text ? `${text} ` : text)),
    [],
  );

  // `attempt` muda quando o jogador clica em "Tentar de novo" e dispara uma nova carga.
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    loadGameData(FETCH, BASE_URL, DATA_DIR, controller.signal)
      .then((data) => {
        setLoad({ status: "ready", data });
        setMessage(saves.notice ?? "");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof UnsupportedCatalogError ? "update" : "retry";
        setLoad({ status });
        // O aviso da tela leva o foco (FocusedNotice) e já é lido: o aria-live repetiria.
        setMessage("");
      });
    return () => controller.abort();
  }, [attempt, saves]);

  // Fixtures: o endereço do catálogo. Parada real: o lookup da Apple, com a reserva do catálogo.
  const resolver = useMemo<PreviewResolver | null>(() => {
    if (load.status !== "ready") return null;
    const { index } = load.data;
    return index.catalog.provider === APPLE_PROVIDER
      ? appleResolver({ index, fetchFn: FETCH, budget })
      : catalogResolver(index, resolveUrl);
  }, [load, resolveUrl, budget]);

  const engine = useMemo<AudioEngine | null>(() => {
    if (load.status !== "ready" || !resolver) return null;
    const search = window.location.search;
    const failTrack = failAudioTrack(search, DEV);
    const stored = failTrack ? load.data.index.tracks.get(failTrack)?.preview?.url : undefined;
    const options: EngineOptions = {
      // A faixa de ?failAudio= falha no endereço do lookup e no do catálogo.
      fails: failTrack
        ? (url) => url === resolver.peek(failTrack) || (!!stored && url === resolveUrl(stored))
        : undefined,
      // O volume salvo (P216): o motor nasce com ele.
      volume: savedVolume(),
      onPlayed: import.meta.env.DEV
        ? (log: PlayLog) => {
            window.__musicleAudioLog ??= [];
            window.__musicleAudioLog.push(log);
          }
        : undefined,
    };
    // O literal import.meta.env.DEV no próprio ponto da escolha: no build vira `false && ...`, e
    // o Vite tira o motor falso do pacote sem depender de o minificador propagar a constante DEV
    // (a CI procura a marca dele no dist).
    return import.meta.env.DEV && fakeAudioEnabled(search)
      ? new FakeAudioEngine(options)
      : new FallbackAudioEngine(
          new WebAudioEngine({ ...options, disabled: htmlAudioForced(search) }),
          new HtmlAudioEngine({ ...options, mediaTitle: t("app.title") }),
        );
  }, [load, resolver, resolveUrl]);

  return (
    <>
      <nav class="tabs" aria-label={t("nav.label")}>
        <ul>
          {/* Uma aba por categoria (P225): a Início, os Hits (a tela deles, os dois diários e o
              Treino), o Anime (a tela dele, as dificuldades e os 6 diários) e os Artistas. A da aba
              atual leva aria-current: "page" na tela dela, e "true" dentro de um jogo dela (o link
              leva a outra página). */}
          {/* A Início é o selo do logo (P205): o nome do link fica em texto, para o leitor de tela. */}
          <li>
            <a class="nav-home" href={ROUTES.home} aria-current={current(tab, "home")}>
              <NavLogo />
              <span class="sr-only">{t("nav.home")}</span>
            </a>
          </li>
          {/* O ✓ quando os dois diários do dia terminaram (P227). */}
          <li>
            <a href={ROUTES.hits} aria-current={current(tab, "hits")}>
              {t("nav.hits")}
              {dailiesDone(latest, date) && (
                <>
                  <span class="done-mark" aria-hidden="true">
                    {" "}
                    {t("nav.doneMark")}
                  </span>
                  <span class="sr-only">{t("nav.hitsDone")}</span>
                </>
              )}
            </a>
          </li>
          {/* O ✓ quando qualquer um dos 6 diários do Anime de hoje terminou (P247). */}
          <li>
            <a href={ROUTES.anime} aria-current={current(tab, "anime")}>
              {t("nav.anime")}
              {animeDone(latest, date) && (
                <>
                  <span class="done-mark" aria-hidden="true">
                    {" "}
                    {t("nav.doneMark")}
                  </span>
                  <span class="sr-only">{t("nav.animeDone")}</span>
                </>
              )}
            </a>
          </li>
          {/* O modo por artista fica na nav até o site ficar público (P117): é só tirar o <li>. */}
          <li>
            <a href={ROUTES.artists} aria-current={current(tab, "artists")}>
              {t("nav.artists")}
            </a>
          </li>
        </ul>
      </nav>
      <main class="app">
        <p class="sr-only" aria-live="polite">
          {message}
        </p>
        {saves.notice && <p class="notice">{saves.notice}</p>}
        {/* O "Sobre e privacidade" não usa dado nenhum: desenha sem esperar a carga dos Hits, e a
            política de privacidade nunca depende dela (nem de uma falha dela). */}
        {tab === "about" ? (
          <About />
        ) : (
          <>
            {load.status === "loading" && (
              <div class="loading screen">
                <p>{t("load.loading")}</p>
              </div>
            )}
            {load.status === "retry" && (
              <section class="error screen">
                <FocusedNotice text={t("load.retry")} />
                <button type="button" class="primary" onClick={() => setAttempt((n) => n + 1)}>
                  {t("load.retryButton")}
                </button>
              </section>
            )}
            {load.status === "update" && (
              <section class="error screen">
                <FocusedNotice text={t("load.update")} />
                <button type="button" class="primary" onClick={() => window.location.reload()}>
                  {t("load.updateButton")}
                </button>
              </section>
            )}
            {load.status === "ready" && engine && resolver && (
              <Ready
                tab={tab}
                data={load.data}
                date={date}
                engine={engine}
                resolver={resolver}
                resolveUrl={resolveUrl}
                announce={announce}
                saves={saves}
                latest={latest}
                onSaved={refresh}
                practice={practice}
                onPractice={setPractice}
                artists={artists}
                anime={anime}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}

type ReadyProps = {
  readonly tab: Tab;
  readonly data: GameData;
  readonly date: string;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  readonly saves: Storage;
  /** A última leitura do save. */
  readonly latest: Save;
  readonly onSaved: () => void;
  /** A sessão do Treino, guardada no App. */
  readonly practice: PracticeSession | null;
  readonly onPractice: PracticeSessionSetter;
  /** O modo por artista, também guardado no App. */
  readonly artists: ArtistStore;
  /** O Anime, também guardado no App. */
  readonly anime: AnimeStore;
};

/** A tela da aba ativa. Uma por vez: os ids dos títulos (question, result...) não se repetem. */
function Ready({
  tab,
  data,
  date,
  engine,
  resolver,
  resolveUrl,
  announce,
  saves,
  latest,
  onSaved,
  practice,
  onPractice,
  artists,
  anime,
}: ReadyProps) {
  const day = pickDay(data.schedule, date);
  // Os diários dos Hits do dia, guardados entre os renders: o Game recalcula a sessão quando o
  // descritor muda. Sem o dia na agenda, nenhum.
  const dailies = useMemo(() => (day ? hitsDailies(day, date) : []), [day, date]);
  // As telas do Anime (a categoria, as dificuldades e os diários) ficam no Anime, com a carga dele.
  if (isAnimeTab(tab)) {
    return (
      <Anime
        tab={tab}
        store={anime}
        date={date}
        save={latest}
        engine={engine}
        resolveUrl={resolveUrl}
        announce={announce}
        saveStore={saves.store}
        onSaved={onSaved}
        shareUrl={BASE_URL}
      />
    );
  }
  // Uma tela por aba, sem caso esquecido: uma aba nova sem tela vira erro de compilação.
  switch (tab) {
    case "home":
      // Antes da agenda: sem o dia de hoje, a home avisa no cartão e o Treino continua.
      return <Home day={day} date={date} save={latest} artists={artistSummary(artists.play)} />;
    case "hits":
      return <Hits day={day} date={date} save={latest} practice={practiceSummary(practice)} />;
    case "song":
    case "album": {
      const daily = dailies.find((d) => d.key === tab);
      if (!daily) return <Unavailable />;
      return (
        // key: cada diário monta do zero ao trocar de diário, com o save daquele momento (no
        // Anime, os 6 diários podem dividir a tela).
        <Game
          key={daily.id}
          daily={daily}
          dailies={dailies}
          index={data.index}
          engine={engine}
          resolver={resolver}
          resolveUrl={resolveUrl}
          announce={announce}
          store={saves.store}
          initialSave={latest}
          onSaved={onSaved}
          scheduleDates={Object.keys(data.schedule.days)}
          shareUrl={BASE_URL}
        />
      );
    }
    case "practice":
      return (
        <Practice
          index={data.index}
          day={day}
          date={date}
          save={latest}
          engine={engine}
          resolver={resolver}
          resolveUrl={resolveUrl}
          announce={announce}
          session={practice}
          onSession={onPractice}
        />
      );
    // O App já desenha o Sobre antes da carga (ele não usa dado nenhum): aqui, só para o switch
    // ficar completo.
    case "about":
      return <About />;
    case "artists":
      return (
        <Artists
          store={artists}
          chart={data.index}
          day={day}
          date={date}
          save={latest}
          engine={engine}
          resolveUrl={resolveUrl}
          announce={announce}
        />
      );
    default:
      return tab satisfies never;
  }
}

/** Dia sem diário na agenda: o Treino continua (PLANO, Apêndice C). */
function Unavailable() {
  return (
    <section class="unavailable screen">
      <FocusedNotice text={t("day.unavailable")} />
      <a href={ROUTES.practice}>{t("day.practiceLink")}</a>
    </section>
  );
}
