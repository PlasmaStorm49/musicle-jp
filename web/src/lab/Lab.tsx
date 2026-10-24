// O laboratório das Misturadas (M17): toca misturas reais do Anime para ouvir e calibrar o diário,
// só no servidor de desenvolvimento (lab.html, fora do build). É ferramenta, não tela do jogo: os
// textos ficam aqui, e não no pt-BR.ts, para nada disto ir ao pacote publicado.
import { useEffect, useRef, useState } from "preact/hooks";
import type { MixPlayback } from "../audio/engine.ts";
import { WebAudioEngine } from "../audio/webaudio.ts";
import { isAppleUrl, PLAYLIST_URL } from "../core/apple.ts";
import { type CatalogIndex, indexAnime } from "../core/catalog.ts";
import type { AnimeCatalog } from "../core/types.ts";
import { appleResolver, lookupBudget, type PreviewResolver } from "../data/previews.ts";
import { ANIME_DIR, REAL_DATA_DIR } from "../data/source.ts";
import { Attribution } from "../ui/Attribution.tsx";
import { singleClick } from "../ui/singleClick.ts";
import {
  type LabMode,
  type LabSong,
  pickMix,
  poolOf,
  type Ruler,
  spreadPans,
  startOffsets,
} from "./pick.ts";

const BASE = new URL(import.meta.env.BASE_URL, window.location.href);
const engine = new WebAudioEngine();

type Data = {
  readonly index: CatalogIndex;
  readonly songs: readonly LabSong[];
  readonly resolver: PreviewResolver;
  /** O web/lab-data/anime-chances.json existe (rode o anime-chances): a régua é pela chance. */
  readonly withChance: boolean;
};

type OnFound = "stop" | "duck" | "keep";

type Settings = {
  readonly mode: LabMode;
  readonly count: number;
  /** A régua da rodada 3: o Médio para cima, em vez da chance mínima. */
  readonly hard: boolean;
  readonly min: number;
  readonly seconds: number;
  readonly spread: boolean;
  readonly normalize: boolean;
  /** O limitador da soma: segura os picos que a folga de 1/√n deixa passar. */
  readonly limit: boolean;
  readonly separate: boolean;
  readonly onFound: OnFound;
};

type Mix = {
  readonly songs: readonly LabSong[];
  readonly urls: readonly string[];
  readonly offsets: readonly number[];
  readonly found: readonly boolean[];
  readonly revealed: readonly boolean[];
};

const PRESETS = [
  { id: "r12", label: "Rodadas 1 e 2: 2 bem conhecidas", count: 2, hard: false },
  { id: "r3", label: "Rodada 3: 2 do Médio para cima", count: 2, hard: true },
  { id: "r4", label: "Rodada 4: 3 bem conhecidas", count: 3, hard: false },
] as const;

const SECONDS = [4, 8, 16, 30] as const;

const ON_FOUND: Readonly<Record<OnFound, { readonly label: string; readonly gain: number }>> = {
  stop: { label: "Para, com fade", gain: 0 },
  duck: { label: "Abaixa a 25%", gain: 0.25 },
  keep: { label: "Continua", gain: 1 },
};

async function loadData(): Promise<Data> {
  // O catálogo real (o do site), e não o das fixtures: as prévias reais da Apple.
  const response = await fetch(new URL(`${REAL_DATA_DIR}${ANIME_DIR}catalog.json`, BASE));
  if (!response.ok) throw new Error(`o catálogo real do Anime não veio (HTTP ${response.status})`);
  const file = (await response.json()) as AnimeCatalog;
  const index = indexAnime(file);
  let chances: Record<string, Record<LabMode, string>> | null = null;
  try {
    const found = await fetch(new URL("lab-data/anime-chances.json", BASE));
    if (found.ok) chances = (await found.json()) as Record<string, Record<LabMode, string>>;
  } catch {
    chances = null; // sem o arquivo, a régua cai nas faixas publicadas
  }
  const songs = file.tracks
    .filter((t) => t.eligible.daily && t.preview)
    .map((t): LabSong => {
      const chance = chances?.[t.songKey];
      return {
        trackId: t.id,
        songKey: t.songKey,
        franchises: t.anime.franchiseIds,
        chance: chance ? { musica: Number(chance.musica), titulo: Number(chance.titulo) } : null,
        tiers: t.anime.tiers,
        previewSeconds: t.preview?.durationSec ?? 30,
      };
    });
  const fetchFn = (url: string, init?: RequestInit) => fetch(url, init);
  const resolver = appleResolver({ index, fetchFn, budget: lookupBudget({ now: Date.now }) });
  return { index, songs, resolver, withChance: chances !== null };
}

function rulerOf(data: Data, settings: Settings): Ruler {
  if (settings.hard) return { kind: "tiers", tiers: ["medio", "dificil"] };
  return data.withChance
    ? { kind: "chance", min: settings.min }
    : { kind: "tiers", tiers: ["facil"] };
}

export function Lab() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    mode: "musica",
    count: 2,
    hard: false,
    min: 0.5,
    seconds: 8,
    spread: false,
    normalize: true,
    limit: true,
    separate: false,
    onFound: "stop",
  });
  const [mix, setMix] = useState<Mix | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const playback = useRef<MixPlayback | null>(null);
  const bar = useRef<HTMLProgressElement>(null);
  // As fichas do sorteio e do tocar: só o pedido mais novo mexe na tela (um antigo que resolve
  // ou falha depois não apaga a mistura nem o estado de agora).
  const drawn = useRef(0);
  const played = useRef(0);

  useEffect(() => {
    loadData().then(setData, (e: unknown) => setError(String(e)));
    return () => engine.stop();
  }, []);

  // Mudou o trecho ou o "Início": os começos se refazem, para o trecho caber na prévia.
  useEffect(() => {
    setMix((m) =>
      m ? { ...m, offsets: startOffsets(m.songs, settings.seconds, settings.spread) } : m,
    );
  }, [settings.seconds, settings.spread]);

  // Parada ou no fim, a barra volta ao zero.
  useEffect(() => {
    if (status === "idle" && bar.current) bar.current.value = 0;
  }, [status]);

  // A barra lê o tempo do áudio a cada quadro, só enquanto toca.
  useEffect(() => {
    if (status !== "playing") return;
    let frame = 0;
    const draw = () => {
      const p = playback.current;
      if (p && bar.current) bar.current.value = p.seconds > 0 ? p.elapsed() / p.seconds : 0;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const pool = data ? poolOf(data.songs, settings.mode, rulerOf(data, settings)) : [];

  async function draw() {
    if (!data) return;
    const ticket = ++drawn.current;
    stop();
    setError(null);
    setMix(null); // a mistura de antes sai já: nunca fica na tela uma que não é a do sorteio
    const picked = pickMix(pool, settings.count);
    if (!picked) {
      setError("A régua não tem músicas de franquias diferentes que bastem: baixe a régua.");
      return;
    }
    const ids = picked.map((s) => s.trackId);
    data.resolver.prefetch(ids);
    const urls = await Promise.all(ids.map((id) => data.resolver.resolve(id)));
    if (ticket !== drawn.current) return; // outro sorteio tomou o lugar
    if (urls.some((u) => u === null)) {
      setError("Uma das prévias não veio. Sorteie outra.");
      return;
    }
    const kept = urls as string[];
    // Só as prévias desta mistura ficam na memória (uns 10 MB cada, decodificadas): sem isto, o
    // cache do motor cresceria a cada sorteio, como o usePreviews faz no jogo (regra 18).
    engine.retain(kept);
    setMix({
      songs: picked,
      urls: kept,
      offsets: startOffsets(picked, settings.seconds, settings.spread),
      found: picked.map(() => false),
      revealed: picked.map(() => false),
    });
  }

  function play() {
    if (!mix) return;
    const ticket = ++played.current;
    const pans = settings.separate ? spreadPans(mix.urls.length) : mix.urls.map(() => 0);
    const tracks = mix.urls.map((url, i) => ({
      url,
      offset: mix.offsets[i] ?? 0,
      gain: mix.found[i] ? ON_FOUND[settings.onFound].gain : 1,
      pan: pans[i] ?? 0,
    }));
    setStatus("loading");
    // O playMix destrava o áudio na hora, dentro deste clique (regra 9).
    const options = { normalize: settings.normalize, limit: settings.limit };
    engine.playMix(tracks, settings.seconds, options).then(
      (p) => {
        if (!p || ticket !== played.current) return;
        playback.current = p;
        setStatus("playing");
        void p.done.then(() => {
          if (playback.current !== p) return;
          playback.current = null;
          setStatus("idle");
        });
      },
      (e: unknown) => {
        if (ticket !== played.current) return; // a falha de um Tocar antigo
        setStatus("idle");
        setError(`O áudio falhou: ${String(e)}`);
      },
    );
  }

  function stop() {
    played.current += 1;
    engine.stop();
    playback.current = null;
    setStatus("idle");
  }

  function found(i: number) {
    if (!mix) return;
    setMix({ ...mix, found: mix.found.map((f, j) => f || j === i) });
    playback.current?.setGain(i, ON_FOUND[settings.onFound].gain);
  }

  function separate(on: boolean) {
    set({ separate: on });
    const p = playback.current;
    if (!p || !mix) return;
    const pans = on ? spreadPans(mix.urls.length) : mix.urls.map(() => 0);
    for (const [i, pan] of pans.entries()) p.setPan(i, pan);
  }

  if (error && !data) return <p class="lab-error">{error}</p>;
  if (!data) return <p>Carregando o catálogo real do Anime…</p>;

  return (
    <main class="lab">
      <h1>Laboratório das Misturadas</h1>
      <p class="lab-note">
        Só no servidor de desenvolvimento. Use fone para comparar o separar.
        {data.withChance
          ? " A régua é a chance do anime-chances."
          : " Sem o web/lab-data/anime-chances.json (rode o anime-chances): a régua é o Fácil."}
      </p>

      <fieldset>
        <legend>A rodada</legend>
        <label>
          Modo{" "}
          <select
            value={settings.mode}
            onChange={(e) => set({ mode: e.currentTarget.value as LabMode })}
          >
            <option value="musica">Acertar a música</option>
            <option value="titulo">Acertar o anime</option>
          </select>
        </label>
        <div class="lab-row">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => set({ count: p.count, hard: p.hard })}>
              {p.label}
            </button>
          ))}
        </div>
        <label>
          Músicas{" "}
          <select
            value={settings.count}
            onChange={(e) => set({ count: Number(e.currentTarget.value) })}
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.hard}
            onChange={(e) => set({ hard: e.currentTarget.checked })}
          />{" "}
          Médio para cima (a régua da rodada 3)
        </label>
        <label>
          Chance mínima: {settings.min.toFixed(2)}{" "}
          <input
            type="range"
            min={0.3}
            max={0.7}
            step={0.01}
            value={settings.min}
            disabled={settings.hard || !data.withChance}
            onInput={(e) => set({ min: Number(e.currentTarget.value) })}
          />
        </label>
        <p class="lab-note">{pool.length} músicas na régua.</p>
      </fieldset>

      <fieldset>
        <legend>O som</legend>
        <div class="lab-row">
          Trecho
          {SECONDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={settings.seconds === s}
              onClick={() => set({ seconds: s })}
            >
              {/* O escolhido também por texto, e não só pela cor. */}
              {s} s{settings.seconds === s ? " ✓" : ""}
            </button>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={settings.spread}
            onChange={(e) => set({ spread: e.currentTarget.checked })}
          />{" "}
          Cada uma começa num ponto diferente
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.normalize}
            onChange={(e) => set({ normalize: e.currentTarget.checked })}
          />{" "}
          Igualar o volume (vale no próximo Tocar)
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.limit}
            onChange={(e) => set({ limit: e.currentTarget.checked })}
          />{" "}
          Limitador na soma (vale no próximo Tocar)
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.separate}
            onChange={(e) => separate(e.currentTarget.checked)}
          />{" "}
          Separar L e R
        </label>
        <label>
          Ao achar{" "}
          <select
            value={settings.onFound}
            onChange={(e) => set({ onFound: e.currentTarget.value as OnFound })}
          >
            {(Object.keys(ON_FOUND) as OnFound[]).map((k) => (
              <option key={k} value={k}>
                {ON_FOUND[k].label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div class="lab-row">
        <button type="button" onClick={() => void draw()}>
          Sortear outra
        </button>
        {/* O Tocar e o Parar se trocam no mesmo lugar: o 2º clique de um toque duplo cairia no
            outro (regra 23). */}
        {status === "idle" ? (
          <button type="button" class="primary" disabled={!mix} onClick={singleClick(play)}>
            Tocar
          </button>
        ) : (
          <button type="button" class="primary" onClick={singleClick(stop)}>
            {status === "loading" ? "Carregando…" : "Parar"}
          </button>
        )}
      </div>
      <progress ref={bar} class="lab-bar" value={0} max={1} />
      {error && <p class="lab-error">{error}</p>}

      {mix && (
        <ol class="lab-songs">
          {mix.songs.map((song, i) => (
            <li key={song.trackId}>
              <SongLine
                index={data.index}
                song={song}
                hidden={`${settings.mode === "musica" ? "Música" : "Anime"} ${i + 1}`}
                offset={mix.offsets[i] ?? 0}
                found={mix.found[i] ?? false}
                revealed={mix.revealed[i] ?? false}
                onFound={() => found(i)}
                onReveal={() =>
                  setMix({ ...mix, revealed: mix.revealed.map((r, j) => r || j === i) })
                }
              />
            </li>
          ))}
        </ol>
      )}
      <Attribution href={PLAYLIST_URL} />
    </main>
  );
}

function SongLine({
  index,
  song,
  hidden,
  offset,
  found,
  revealed,
  onFound,
  onReveal,
}: {
  readonly index: CatalogIndex;
  readonly song: LabSong;
  readonly hidden: string;
  readonly offset: number;
  readonly found: boolean;
  readonly revealed: boolean;
  readonly onFound: () => void;
  readonly onReveal: () => void;
}) {
  const track = index.tracks.get(song.trackId);
  const themes = index.anime?.themesByTrack.get(song.trackId) ?? [];
  const franchises = song.franchises.map((f) => index.anime?.franchises.get(f)?.name ?? f);
  return (
    <div class="lab-song">
      <div class="lab-row">
        <strong>{hidden}</strong>
        <span class="lab-note">começa em {offset} s</span>
        {/* aria-disabled, e não disabled: o navegador tira o foco do botão desabilitado, e ele
            cairia no body (regra 16). */}
        <button
          type="button"
          aria-disabled={found}
          onClick={() => {
            if (!found) onFound();
          }}
        >
          {found ? "Achada" : "Achei"}
        </button>
        <button
          type="button"
          aria-disabled={revealed}
          onClick={() => {
            if (!revealed) onReveal();
          }}
        >
          Revelar
        </button>
      </div>
      {revealed && track && (
        <div class="lab-reveal">
          <div>
            {track.title}
            {track.titleLatin ? ` (${track.titleLatin})` : ""} · {track.artistDisplay}
          </div>
          <div class="lab-note">
            {themes.map((t) => `${t.anime} · ${t.type}${t.sequence ?? ""}`).join(" | ")}
          </div>
          <div class="lab-note">
            Franquia: {franchises.join(", ")} · faixas: música {song.tiers.musica ?? "nenhuma"},
            anime {song.tiers.titulo ?? "nenhuma"}
            {song.chance
              ? ` · chance: música ${song.chance.musica.toFixed(2)}, anime ${song.chance.titulo.toFixed(2)}`
              : ""}
          </div>
          {/* A URL do catálogo que vai para um href passa pelo isAppleUrl (regra 22). */}
          {track.storeUrl && isAppleUrl("store", track.storeUrl) && (
            <a href={track.storeUrl} target="_blank" rel="noopener noreferrer">
              Ouvir no Apple Music
            </a>
          )}
        </div>
      )}
    </div>
  );
}
