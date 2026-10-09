import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { type PlayLog, WebAudioEngine } from "../audio/webaudio.ts";
import {
  assetUrl,
  failAudioTrack,
  type GameData,
  gameDate,
  loadGameData,
  pickDay,
  UnsupportedCatalogError,
} from "../data/source.ts";
import { t } from "../i18n/t.ts";
import { Game } from "./Game.tsx";

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
const DEV = import.meta.env.DEV;

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState(t("load.loading"));
  const date = useMemo(() => gameDate(new Date(), window.location.search, DEV), []);
  const resolveUrl = useCallback((url: string) => assetUrl(BASE_URL, url), []);

  // `attempt` muda quando o jogador clica em "Tentar de novo" e dispara uma nova carga.
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    loadGameData((url, init) => fetch(url, init), BASE_URL, controller.signal)
      .then((data) => {
        setLoad({ status: "ready", data });
        setMessage("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof UnsupportedCatalogError ? "update" : "retry";
        setLoad({ status });
        setMessage(t(status === "update" ? "load.update" : "load.retry"));
      });
    return () => controller.abort();
  }, [attempt]);

  const engine = useMemo<AudioEngine | null>(() => {
    if (load.status !== "ready") return null;
    const failTrack = failAudioTrack(window.location.search, DEV);
    const failPreview = failTrack ? load.data.index.tracks.get(failTrack)?.preview?.url : null;
    return new WebAudioEngine({
      failUrl: failPreview ? resolveUrl(failPreview) : null,
      onPlayed: DEV
        ? (log) => {
            window.__musicleAudioLog ??= [];
            window.__musicleAudioLog.push(log);
          }
        : undefined,
    });
  }, [load, resolveUrl]);

  return (
    <main class="app">
      <p class="sr-only" aria-live="polite">
        {message}
      </p>
      {load.status === "loading" && <p>{t("load.loading")}</p>}
      {load.status === "retry" && (
        <section class="error">
          <p>{t("load.retry")}</p>
          <button type="button" class="primary" onClick={() => setAttempt((n) => n + 1)}>
            {t("load.retryButton")}
          </button>
        </section>
      )}
      {load.status === "update" && (
        <section class="error">
          <p>{t("load.update")}</p>
          <button type="button" class="primary" onClick={() => window.location.reload()}>
            {t("load.updateButton")}
          </button>
        </section>
      )}
      {load.status === "ready" && engine && (
        <Ready
          data={load.data}
          date={date}
          engine={engine}
          resolveUrl={resolveUrl}
          announce={setMessage}
        />
      )}
    </main>
  );
}

type ReadyProps = {
  readonly data: GameData;
  readonly date: string;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
};

function Ready({ data, date, engine, resolveUrl, announce }: ReadyProps) {
  const day = pickDay(data.schedule, date);
  if (!day) return <p class="unavailable">{t("day.unavailable")}</p>;
  return (
    <Game
      day={day}
      date={date}
      index={data.index}
      engine={engine}
      resolveUrl={resolveUrl}
      announce={announce}
    />
  );
}
