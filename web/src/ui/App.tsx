import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine, EngineOptions, PlayLog } from "../audio/engine.ts";
import { FakeAudioEngine } from "../audio/fake.ts";
import { FallbackAudioEngine } from "../audio/fallback.ts";
import { HtmlAudioEngine } from "../audio/htmlaudio.ts";
import { WebAudioEngine } from "../audio/webaudio.ts";
import { APPLE_PROVIDER } from "../core/apple.ts";
import { practiceSummary } from "../core/home.ts";
import { emptySave, pruneProgress, puzzleId, type Save } from "../core/records.ts";
import { ROUTES, type Tab, tabFromHash } from "../core/routes.ts";
import { MODES } from "../core/rules.ts";
import { appleResolver, catalogResolver, type PreviewResolver } from "../data/previews.ts";
import {
  assetUrl,
  dataDirFor,
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
import { FocusedNotice } from "./FocusedNotice.tsx";
import { Game } from "./Game.tsx";
import { Home } from "./Home.tsx";
import { modeName } from "./modes.ts";
import { Practice, type PracticeSession, type PracticeSessionSetter } from "./Practice.tsx";

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
  const today = MODES.map((mode) => puzzleId(date, mode));
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

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState(t("load.loading"));
  const date = useMemo(() => gameDate(new Date(), window.location.search, DEV), []);
  const saves = useMemo(() => openSaves(date), [date]);
  const resolveUrl = useCallback((url: string) => assetUrl(BASE_URL, url), []);
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash));
  // A última leitura do save, para o ✓ das abas e o Treino. Cada diário recebe a leitura do
  // momento em que a aba abre: voltar ao Desafio terminado mostra o resultado (P39).
  const [latest, setLatest] = useState(saves.save);
  // A sessão do Treino mora aqui, e não no Practice: trocar de aba e voltar não a zera. Só
  // na memória (P50): recarregar a página começa outra. null = a escolha do modo (P105).
  const [practice, setPractice] = useState<PracticeSession | null>(null);
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
    loadGameData((url, init) => fetch(url, init), BASE_URL, DATA_DIR, controller.signal)
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
      ? appleResolver({
          index,
          fetchFn: (url, init) => fetch(url, init),
          disabled: lookupFailForced(window.location.search),
        })
      : catalogResolver(index, resolveUrl);
  }, [load, resolveUrl]);

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
          {/* Uma aba por link (#inicio, #normal, #desafio, #treino), com aria-current na ativa. */}
          <li>
            <a href={ROUTES.home} aria-current={tab === "home" ? "page" : undefined}>
              {t("nav.home")}
            </a>
          </li>
          {MODES.map((daily) => (
            <li key={daily}>
              <a href={ROUTES[daily]} aria-current={tab === daily ? "page" : undefined}>
                {modeName(daily)}
                {latest.history[puzzleId(date, daily)] && (
                  <>
                    <span aria-hidden="true"> {t("nav.doneMark")}</span>
                    <span class="sr-only">{t("nav.done")}</span>
                  </>
                )}
              </a>
            </li>
          ))}
          <li>
            <a href={ROUTES.practice} aria-current={tab === "practice" ? "page" : undefined}>
              {t("nav.practice")}
            </a>
          </li>
        </ul>
      </nav>
      <main class="app">
        <p class="sr-only" aria-live="polite">
          {message}
        </p>
        {saves.notice && <p class="notice">{saves.notice}</p>}
        {load.status === "loading" && <p>{t("load.loading")}</p>}
        {load.status === "retry" && (
          <section class="error">
            <FocusedNotice text={t("load.retry")} />
            <button type="button" class="primary" onClick={() => setAttempt((n) => n + 1)}>
              {t("load.retryButton")}
            </button>
          </section>
        )}
        {load.status === "update" && (
          <section class="error">
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
          />
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
}: ReadyProps) {
  const day = pickDay(data.schedule, date);
  // Uma tela por aba, sem caso esquecido: uma aba nova sem tela vira erro de compilação.
  switch (tab) {
    case "home":
      // Antes da agenda: sem o dia de hoje, a home avisa no cartão e o Treino continua.
      return <Home day={day} date={date} save={latest} practice={practiceSummary(practice)} />;
    case "song":
    case "album":
      if (!day) return <Unavailable />;
      return (
        // key: cada diário monta do zero ao trocar de aba, com o save daquele momento.
        <Game
          key={tab}
          target={tab}
          day={day}
          date={date}
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
    default:
      return tab satisfies never;
  }
}

/** Dia sem diário na agenda: o Treino continua (PLANO, Apêndice C). */
function Unavailable() {
  return (
    <section class="unavailable">
      <FocusedNotice text={t("day.unavailable")} />
      <a href={ROUTES.practice}>{t("day.practiceLink")}</a>
    </section>
  );
}
