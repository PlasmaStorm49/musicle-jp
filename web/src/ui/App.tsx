import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine, EngineOptions, MixLog, PlayLog } from "../audio/engine.ts";
import { FakeAudioEngine } from "../audio/fake.ts";
import { FallbackAudioEngine } from "../audio/fallback.ts";
import { HtmlAudioEngine } from "../audio/htmlaudio.ts";
import { WebAudioEngine } from "../audio/webaudio.ts";
import { APPLE_PROVIDER } from "../core/apple.ts";
import { hitsDailies } from "../core/daily.ts";
import { keptProgressIds } from "../core/history.ts";
import { artistSummary, practiceSummary } from "../core/home.ts";
import {
  DEMO_MEDALS,
  earnedMedals,
  MEDALS,
  type Medal,
  medalContext,
  medalsOf,
  noticeTab,
} from "../core/medals.ts";
import { emptySave, favoriteOf, pruneProgress, type Save, withFavorite } from "../core/records.ts";
import {
  isAnimeTab,
  isMixedTab,
  ROUTES,
  type Route,
  routeFromHash,
  routeHref,
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
  medalsMode,
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
import { History } from "./History.tsx";
import { Hits } from "./Hits.tsx";
import { Home } from "./Home.tsx";
import { MedalDialog, MedalToast, SHOWN } from "./MedalNotice.tsx";
import { Medals } from "./Medals.tsx";
import { Mixed, type MixedStore, useMixedStore } from "./Mixed.tsx";
import {
  announceText,
  hasBig,
  noticeItems,
  noticeOrder,
  noticeTitle,
  toastText,
  useMedalNotices,
} from "./medalNotices.ts";
import { Nav } from "./Nav.tsx";
import {
  Practice,
  type PracticeSession,
  type PracticeSessionSetter,
  usePracticeRecord,
} from "./Practice.tsx";
import { BackupAction, ProgressTransfer, type SaveMode } from "./Progress.tsx";
import { Quiz, type QuizStore, useQuizStore } from "./Quiz.tsx";
import { singleClickLink } from "./singleClick.ts";
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
    /** Só em desenvolvimento, com o motor falso: cada mistura das Misturadas (M17). */
    __musicleMixLog?: MixLog[];
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
// As medalhas gerais (M16): a lista do usuário (P310). Em desenvolvimento, ?medalhas=demo troca pela de
// exemplo, de limites fáceis, e ?medalhas=silencio cala os avisos (os e2e que não os testam). O
// literal import.meta.env.DEV no ponto da escolha tira a lista de exemplo do build (regra 10).
const MEDALS_MODE = import.meta.env.DEV ? medalsMode(window.location.search) : null;
const GENERAL_MEDALS: readonly Medal[] =
  import.meta.env.DEV && MEDALS_MODE === "demo" ? DEMO_MEDALS : MEDALS;

type Storage = {
  /**
   * O save desta sessão (sessionStore): grava no navegador quando dá e sempre guarda em memória,
   * para cada aba de diário reler o próprio andamento mesmo com o navegador sem gravar.
   */
  readonly store: KeyValueStore;
  readonly save: Save;
  readonly notice: string | null;
  /** Onde o progresso fica nesta sessão (o exportar e o importar dependem disso, ME103). */
  readonly mode: SaveMode;
};

/**
 * Abre o armazenamento uma vez: lê, limpa os andamentos que não se retomam mais (os de fora de
 * hoje e do Histórico, P269) e diz se vai salvar.
 */
function openSaves(date: string): Storage {
  const { store, persistent } = openStore(() => window.localStorage);
  let loaded: LoadResult;
  try {
    loaded = loadSave(store);
  } catch {
    loaded = { save: emptySave(), writable: false, notice: "unavailable" };
  }
  // Os andamentos que ficam: os de hoje e os dos dias do Histórico (P269), dos Hits e do Anime, e
  // os das Misturadas de hoje (sem Histórico); o resto é de um dia que não se joga mais.
  const kept = keptProgressIds(date);
  if (loaded.writable) updateSave(store, (s) => pruneProgress(s, kept));
  const mode: SaveMode =
    loaded.notice === "future" ? "future" : !persistent || !loaded.writable ? "memory" : "saves";
  const notice =
    mode === "future" ? t("storage.future") : mode === "memory" ? t("storage.unavailable") : null;
  const save = pruneProgress(loaded.save, kept);
  return { store: sessionStore(store, { ...loaded, save }), save, notice, mode };
}

/**
 * Limpa a região aria-live quando uma sessão termina (ativa → não), e só nessa hora (ME76): o
 * reinício e a troca de artista são um clique que não anuncia nada, e o aviso que a rodada deixou
 * não pode ficar para a tela de escolha.
 */
function useClearWhenEnds(active: boolean, setMessage: (text: string) => void) {
  const was = useRef(active);
  useEffect(() => {
    if (was.current && !active) setMessage("");
    was.current = active;
  }, [active, setMessage]);
}

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState(t("load.loading"));
  const date = useMemo(() => gameDate(new Date(), window.location.search, DEV), []);
  const saves = useMemo(() => openSaves(date), [date]);
  const resolveUrl = useCallback((url: string) => assetUrl(BASE_URL, url), []);
  // A aba e, num dia passado do Histórico, a data dele (P261), lidas do endereço.
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash, date));
  // A última leitura do save, para o ✓ da aba Hits e o Treino. Cada diário recebe a leitura do
  // momento em que a aba abre: voltar ao Desafio terminado mostra o resultado (P39).
  const [latest, setLatest] = useState(saves.save);
  // A sessão do Treino mora aqui, e não no Practice: trocar de aba e voltar não a zera. Só
  // na memória (P50): recarregar a página começa outra; do save, só os acertos (P308). null = a
  // escolha do modo (P105).
  const [practice, setPractice] = useState<PracticeSession | null>(null);
  // A cota e o disjuntor do lookup da Apple, um só para a parada, os artistas e o Anime (P142).
  const budget = useMemo(
    () => lookupBudget({ now: Date.now, disabled: lookupFailForced(window.location.search) }),
    [],
  );
  // O que o modo por artista e o Treino gravam, pelas medalhas: os acertos e o fim do Superfan
  // (P289), e os acertos do Treino (P308). Sem o `refresh`: a tela das Medalhas lê o `latest`, que
  // se relê ao trocar de aba (o `hashchange`); reler a cada acerto recriaria no meio de uma rodada a
  // exclusão das respostas de hoje (P141). Falhar ao gravar não avisa: não se perde um diário.
  const record = useCallback(
    (change: (save: Save) => Save) => void updateSave(saves.store, change),
    [saves],
  );
  usePracticeRecord(practice, record);
  // O modo por artista (M13): a lista, os artistas baixados e a sessão, como a do Treino.
  const artists = useArtistStore({
    fetchFn: FETCH,
    baseUrl: BASE_URL,
    dataDir: DATA_DIR,
    budget,
    resolveUrl,
    record,
  });
  // Os avisos de medalha nova (M16, P288): numa tela calma (a abertura, a troca de tela, o fim de
  // uma partida do Superfan) e no resultado de um diário (o `onResult`), nunca numa rodada. O evento
  // `storage` (outra aba) só relê o save: quem avisa é a aba que reivindicou.
  const hitsDates = useMemo(
    () => (load.status === "ready" ? Object.keys(load.data.schedule.days) : null),
    [load],
  );
  const medalNotices = useMedalNotices({
    store: saves.store,
    general: GENERAL_MEDALS,
    // O save que não grava (versão futura, sem armazenamento) cala os avisos: a sessão grava numa
    // memória (o `sessionStore`), e a marca de avisada se perderia.
    silent: MEDALS_MODE === "silencio" || saves.notice !== null,
    today: date,
    hitsDates,
  });
  const { claim: claimMedals, notice, dismiss: dismissNotice } = medalNotices;
  const onResult = useCallback(() => claimMedals(false), [claimMedals]);
  const artistsCalm =
    artists.play === null || (artists.play.kind === "superfan" && artists.play.run.end !== null);
  const calm = noticeTab(route.tab) || (route.tab === "artists" && artistsCalm);
  // Trocar de tela fecha o aviso, que já foi visto: o pequeno não fica por cima do selo da Apple de
  // uma rodada (P288). A tela nova, se for calma, reivindica de novo; nos Artistas e nas Medalhas,
  // com o selo no pé, o aviso é o grande. Depois do `useArtistStore`, de propósito: os efeitos de
  // um componente rodam na ordem, e o dele grava o fim do Superfan antes que este reivindique a do `completo`.
  const noticeRoute = useRef(route);
  useEffect(() => {
    if (noticeRoute.current !== route) {
      noticeRoute.current = route;
      dismissNotice();
    }
    if (calm) claimMedals(route.tab === "artists" || route.tab === "medals");
  }, [calm, route, claimMedals, dismissNotice]);
  // As do Superfan levam o nome e a capa do artista: o aviso pede a lista, se ela não veio, e
  // espera por ela (ou pela falha). Sem isso, ele sairia só com o nível e mudaria quando ela
  // chegasse, e o leitor de tela ouviria os dois textos.
  const needsList = !!notice?.ids.some((id) => id.startsWith("superfan|"));
  // A medalha em destaque (ME118, P317): a 1ª da estante, só se está entre as ganhas (um id velho
  // não aparece, P320). A do Superfan também pede a lista, para o nome e as cores do artista.
  const favoriteId = favoriteOf(latest);
  const earnedIds = useMemo(
    () =>
      new Set(
        earnedMedals(medalsOf(latest, GENERAL_MEDALS), medalContext(latest, date, hitsDates ?? [])),
      ),
    [latest, date, hitsDates],
  );
  const favoriteEarned = favoriteId !== null && earnedIds.has(favoriteId);
  const favoriteNeedsList = favoriteEarned && !!favoriteId?.startsWith("superfan|");
  useEffect(() => {
    if ((needsList || favoriteNeedsList) && artists.list.status === "idle") artists.loadList();
  }, [needsList, favoriteNeedsList, artists.list.status, artists.loadList]);
  const listSettled = artists.list.status !== "idle" && artists.list.status !== "loading";
  const shown = notice && (!needsList || listSettled) ? notice : null;
  const noticeList = artists.list.status === "ready" ? artists.list.list : null;
  const big = shown?.tier === "major";
  // O aviso pequeno vai sem a capa (P298); o grande a mostra, com o selo da Apple no fim. As grandes
  // e as com capa vêm primeiro (P313).
  const items = shown
    ? noticeOrder(noticeItems(shown.ids, noticeList, resolveUrl, big, GENERAL_MEDALS))
    : [];
  // O selo só quando uma capa da Apple está desenhada (as SHOWN primeiras).
  const attribution =
    big &&
    noticeList?.provider === APPLE_PROVIDER &&
    items.slice(0, SHOWN).some((item) => item.art.image);
  const toastMessage = shown && !big ? toastText(items) : null;
  const toastSpoken = shown && !big ? announceText(items) : null;
  // O Anime (M14): o catálogo e a agenda, carregados só quando a pessoa abre a categoria.
  const anime = useAnimeStore({
    fetchFn: FETCH,
    baseUrl: BASE_URL,
    dataDir: DATA_DIR,
    budget,
    resolveUrl,
  });
  // As Misturadas (M17): a agenda delas, também só quando a pessoa abre a aba; o catálogo é o do
  // Anime.
  const mixed = useMixedStore({ fetchFn: FETCH, baseUrl: BASE_URL, dataDir: DATA_DIR });
  // O quiz do dia (M18): o mês do dia na agenda dele, também só quando a pessoa abre a aba; o
  // catálogo é o do Anime.
  const quiz = useQuizStore({ fetchFn: FETCH, baseUrl: BASE_URL, dataDir: DATA_DIR });
  const refresh = useCallback(() => {
    const read = loadSave(saves.store);
    if (read.writable) setLatest(read.save);
  }, [saves]);
  // Escolher ou tirar a medalha em destaque (P318): grava e relê, para a nav mudar na hora.
  const chooseFavorite = useCallback(
    (id: string, on: boolean) => {
      updateSave(saves.store, (save) => withFavorite(save, id, on));
      refresh();
    },
    [saves, refresh],
  );
  // O desenho sem a capa (P319), como no aviso pequeno: a nav não tem o selo da Apple. A do Superfan
  // espera a lista, e sem o nome dela (o artista saiu da lista) não aparece (P320).
  // Só depois da agenda: as da sequência dependem dela, e assim todas aparecem juntas.
  const favorite = useMemo(() => {
    if (hitsDates === null || !favoriteEarned || favoriteId === null) return null;
    const [item] = noticeItems([favoriteId], noticeList, resolveUrl, false, GENERAL_MEDALS);
    if (!item || (favoriteId.startsWith("superfan|") && !item.label)) return null;
    return item;
  }, [hitsDates, favoriteEarned, favoriteId, noticeList, resolveUrl]);
  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash(window.location.hash, date));
      // O aviso da aba de antes ("Pulou. Tentativa 4 de 6.") não fica na região aria-live da
      // seguinte, onde o leitor de tela poderia relê-lo (ME76). O aviso pequeno de medalha anuncia
      // num efeito, depois da troca, e não se perde.
      setMessage("");
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
  }, [refresh, date]);
  // Texto igual ao anterior não muda o DOM e o leitor de tela fica calado (copiar duas vezes,
  // duas rodadas anuladas): alterna um espaço invisível no fim para ele ler de novo.
  const announce = useCallback(
    (text: string) => setMessage((prev) => (prev === text ? `${text} ` : text)),
    [],
  );

  // O aviso pequeno é aria-hidden: o texto dele vai para a região aria-live.
  useEffect(() => {
    if (toastSpoken) announce(toastSpoken);
  }, [toastSpoken, announce]);
  // Sair de uma sessão também troca a tela, sem trocar o fragmento: o "Reiniciar o Treino" e o
  // "Trocar de artista" voltam a uma escolha, e o aviso da última rodada sai da região (ME76).
  useClearWhenEnds(practice !== null, setMessage);
  useClearWhenEnds(artists.play !== null, setMessage);

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
      onMixed: import.meta.env.DEV
        ? (log: MixLog) => {
            window.__musicleMixLog ??= [];
            window.__musicleMixLog.push(log);
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
      <Nav route={route} save={latest} date={date} favorite={favorite} />
      <main class="app">
        <p class="sr-only" aria-live="polite">
          {message}
        </p>
        {saves.notice && <p class="notice">{saves.notice}</p>}
        {/* O "Sobre e privacidade" não usa dado nenhum: desenha sem esperar a carga dos Hits, e a
            política de privacidade nunca depende dela (nem de uma falha dela). */}
        {route.tab === "about" ? (
          <About
            progress={
              <ProgressTransfer
                store={saves.store}
                today={date}
                mode={saves.mode}
                announce={announce}
                onImported={refresh}
              />
            }
          />
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
                route={route}
                data={load.data}
                date={date}
                engine={engine}
                resolver={resolver}
                resolveUrl={resolveUrl}
                announce={announce}
                saves={saves}
                latest={latest}
                onSaved={refresh}
                onFavorite={chooseFavorite}
                practice={practice}
                onPractice={setPractice}
                artists={artists}
                anime={anime}
                mixed={mixed}
                quiz={quiz}
                onResult={onResult}
              />
            )}
          </>
        )}
      </main>
      {/* Fora do <main>, como a nav: os avisos ficam por cima da tela, sem entrar no fluxo dela. */}
      {/* O pequeno, pela leva (`key`): a que chega com ele na tela recomeça o tempo. */}
      {shown &&
        (big ? (
          <MedalDialog
            title={noticeTitle(shown)}
            items={items}
            onClose={dismissNotice}
            attribution={attribution}
            // Uma conquista grande: guardar uma cópia do progresso (ME103, P347).
            actions={
              hasBig(items) ? (
                <BackupAction store={saves.store} today={date} mode={saves.mode} />
              ) : undefined
            }
          />
        ) : (
          toastMessage && (
            <MedalToast
              key={shown.ids.join("\n")}
              items={items}
              text={toastMessage}
              onDone={dismissNotice}
            />
          )
        ))}
    </>
  );
}

type ReadyProps = {
  /** A aba e, num dia passado do Histórico, a data dele. */
  readonly route: Route;
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
  /** Escolher ou tirar a medalha em destaque (P318). */
  readonly onFavorite: (id: string, on: boolean) => void;
  /** A sessão do Treino, guardada no App. */
  readonly practice: PracticeSession | null;
  readonly onPractice: PracticeSessionSetter;
  /** O modo por artista, também guardado no App. */
  readonly artists: ArtistStore;
  /** O Anime, também guardado no App. */
  readonly anime: AnimeStore;
  /** A agenda das Misturadas, também guardada no App. */
  readonly mixed: MixedStore;
  /** O mês de hoje do quiz do dia, também guardado no App. */
  readonly quiz: QuizStore;
  /** O resultado de um diário acabou de aparecer: as medalhas novas (M16). */
  readonly onResult: () => void;
};

/** A tela da aba ativa. Uma por vez: os ids dos títulos (question, result...) não se repetem. */
function Ready({
  route,
  data,
  date,
  engine,
  resolver,
  resolveUrl,
  announce,
  saves,
  latest,
  onSaved,
  onFavorite,
  practice,
  onPractice,
  artists,
  anime,
  mixed,
  quiz,
  onResult,
}: ReadyProps) {
  const { tab } = route;
  // O dia de hoje: a Início, os Hits, o Treino e os Artistas são sempre de hoje (a exclusão do
  // Treino, P141, também). O dia jogado é o de hoje ou, pelo Histórico, um dia passado (P261).
  const day = pickDay(data.schedule, date);
  const playDay = route.date === null ? day : pickDay(data.schedule, route.date);
  // Os diários dos Hits de hoje e os do dia jogado (os mesmos, sem data na rota), guardados entre
  // os renders: o Game recalcula a sessão quando o descritor muda. Sem o dia na agenda, nenhum. Os
  // de hoje servem também à ajuda de um diário passado, que evita as respostas deles.
  const todayDailies = useMemo(() => (day ? hitsDailies(day, date) : []), [day, date]);
  const dailies = useMemo(
    () => (route.date === null ? todayDailies : playDay ? hitsDailies(playDay, route.date) : []),
    [route.date, todayDailies, playDay],
  );
  const hitsDates = useMemo(() => new Set(Object.keys(data.schedule.days)), [data]);
  // As telas do Anime (a categoria, as dificuldades e os diários) ficam no Anime, com a carga dele,
  // de hoje ou, pelo Histórico, de um dia passado.
  if (isAnimeTab(tab)) {
    return (
      <Anime
        tab={tab}
        store={anime}
        date={route.date ?? date}
        today={date}
        save={latest}
        engine={engine}
        resolveUrl={resolveUrl}
        announce={announce}
        saveStore={saves.store}
        onSaved={onSaved}
        onResult={onResult}
        shareUrl={BASE_URL}
      />
    );
  }
  // As Misturadas (M17): a escolha do modo e os 2 diários, de hoje ou, pelo Histórico, de um dia
  // passado (o usuário, 24/10/2026).
  if (isMixedTab(tab)) {
    return (
      <Mixed
        tab={tab}
        anime={anime}
        store={mixed}
        date={route.date ?? date}
        today={date}
        save={latest}
        engine={engine}
        resolveUrl={resolveUrl}
        announce={announce}
        saveStore={saves.store}
        onSaved={onSaved}
        onResult={onResult}
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
      if (!daily) return <Unavailable date={route.date} />;
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
          today={date}
          todayDailies={todayDailies}
          onResult={onResult}
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
    // O Histórico (P260, P261): o calendário, ou a tela de um dia passado, com a agenda do Anime
    // (só ela, P270) da carga guardada no App.
    case "history":
      return (
        <History
          date={route.date}
          today={date}
          save={latest}
          hitsDates={hitsDates}
          hitsDay={playDay}
          anime={anime.schedule}
          requestAnime={anime.requestSchedule}
          mixed={mixed.load}
          requestMixed={mixed.request}
          quiz={quiz}
        />
      );
    case "medals":
      return (
        <Medals
          save={latest}
          date={date}
          hitsDates={[...hitsDates]}
          general={GENERAL_MEDALS}
          artists={artists}
          resolveUrl={resolveUrl}
          favorite={favoriteOf(latest)}
          onFavorite={onFavorite}
        />
      );
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
    // O quiz do dia (M18): a run de hoje ou, pelo Histórico, a de um dia passado.
    case "quiz":
      return (
        <Quiz
          anime={anime}
          store={quiz}
          date={route.date ?? date}
          today={date}
          save={latest}
          engine={engine}
          resolveUrl={resolveUrl}
          announce={announce}
          saveStore={saves.store}
          onSaved={onSaved}
          shareUrl={BASE_URL}
        />
      );
    default:
      return tab satisfies never;
  }
}

/**
 * Dia sem diário na agenda: hoje, o Treino continua (PLANO, Apêndice C); num dia passado, a volta
 * é ao Histórico.
 */
function Unavailable({ date }: { readonly date: string | null }) {
  return (
    <section class="unavailable screen">
      {date === null ? (
        <>
          <FocusedNotice text={t("day.unavailable")} />
          <a href={ROUTES.practice}>{t("day.practiceLink")}</a>
        </>
      ) : (
        <>
          <FocusedNotice text={t("history.unavailable")} />
          {/* O 2º clique de um toque duplo não segue o link (regra 23). */}
          <a href={routeHref({ tab: "history", date })} onClick={singleClickLink}>
            {t("history.backToDay")}
          </a>
        </>
      )}
    </section>
  );
}
