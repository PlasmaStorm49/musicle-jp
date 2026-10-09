// Motor de áudio com Web Audio: corta o trecho no tempo exato (source.start com duração),
// o que o <audio> não garante. Cuidados, um a um:
// - AudioContext só nasce ou volta a rodar dentro de um clique (bloqueio de autoplay); por
//   isso play() chama unlock() antes do primeiro await.
// - decodeAudioData "desanexa" os bytes: o cache guarda a Promise<AudioBuffer>, não os bytes.
// - Cada reprodução tem uma ficha. Uma ação nova (tocar, parar) troca a ficha, e o que estava
//   carregando ou o onended antigo (que também dispara no stop) é ignorado.
// - O estado do contexto pode ser "suspended" ou "interrupted": testa-se !== "running".
import { type GainPoint, playbackEnvelope, stopEnvelope } from "../core/envelope.ts";
import {
  type AudioEngine,
  AudioUnavailableError,
  type Playback,
  type PlaybackResult,
} from "./engine.ts";

export type PlayLog = PlaybackResult & { readonly url: string; readonly offset: number };

export type WebAudioOptions = {
  /** Só em desenvolvimento: força falha de áudio nesta URL (?failAudio=). */
  readonly failUrl?: string | null;
  /** Avisado ao fim de cada reprodução (em DEV vai para window.__musicleAudioLog). */
  readonly onPlayed?: (log: PlayLog) => void;
};

type Entry = { bytes: Promise<ArrayBuffer>; buffer?: Promise<AudioBuffer> };

type Current = {
  readonly token: number;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  interrupted: boolean;
};

const START_DELAY = 0.01; // agenda o início 10 ms à frente, para a rampa começar do zero

function apply(param: AudioParam, points: readonly GainPoint[]): void {
  for (const p of points) {
    if (p.kind === "set") param.setValueAtTime(p.value, p.time);
    else param.linearRampToValueAtTime(p.value, p.time);
  }
}

export class WebAudioEngine implements AudioEngine {
  #ctx: AudioContext | null = null;
  readonly #cache = new Map<string, Entry>();
  #token = 0;
  #current: Current | null = null;
  readonly #options: WebAudioOptions;

  constructor(options: WebAudioOptions = {}) {
    this.#options = options;
  }

  unlock(): void {
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      // Aba oculta: o rAF da barra para, então o som também para.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stop();
      });
    }
    if (this.#ctx.state !== "running") void this.#ctx.resume();
  }

  preload(url: string): void {
    const entry = this.#entry(url);
    if (this.#ctx) this.#decoded(url, entry).catch(() => {}); // falha aparece só ao tocar
  }

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    this.unlock(); // síncrono, ainda dentro do clique
    this.stop();
    const token = this.#token;
    const ctx = this.#ctx as AudioContext;
    const buffer = await this.#decoded(url, this.#entry(url));
    if (token !== this.#token) return null; // outra ação tomou o lugar
    if (ctx.state !== "running") await ctx.resume();
    if (token !== this.#token) return null;

    const duration = Math.max(0, Math.min(seconds, buffer.duration - offset));
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const t0 = ctx.currentTime + START_DELAY;
    apply(gain.gain, playbackEnvelope(t0, duration));
    source.start(t0, offset, duration);

    const current: Current = { token, source, gain, interrupted: false };
    this.#current = current;
    const elapsed = () => Math.min(Math.max(ctx.currentTime - t0, 0), duration);
    const done = new Promise<PlaybackResult>((resolve) => {
      source.onended = () => {
        const result = {
          requested: duration,
          played: current.interrupted ? elapsed() : Math.max(ctx.currentTime - t0, 0),
          interrupted: current.interrupted,
        };
        source.disconnect();
        gain.disconnect();
        if (this.#current === current) this.#current = null;
        this.#options.onPlayed?.({ ...result, url, offset });
        resolve(result);
      };
    });
    return { t0, seconds: duration, elapsed, done };
  }

  stop(): void {
    this.#token += 1; // cancela também o que ainda estava carregando
    const current = this.#current;
    const ctx = this.#ctx;
    if (!current || !ctx) return;
    this.#current = null;
    current.interrupted = true;
    const now = ctx.currentTime;
    const { points, stopAt } = stopEnvelope(now, current.gain.gain.value);
    current.gain.gain.cancelScheduledValues(now);
    apply(current.gain.gain, points);
    current.source.stop(stopAt);
  }

  retain(urls: readonly string[]): void {
    const keep = new Set(urls);
    for (const url of this.#cache.keys()) {
      if (!keep.has(url)) this.#cache.delete(url);
    }
  }

  #entry(url: string): Entry {
    let entry = this.#cache.get(url);
    if (!entry) {
      entry = { bytes: this.#fetchBytes(url) };
      entry.bytes.catch(() => {}); // evita "Uncaught (in promise)"; a falha aparece ao tocar
      this.#cache.set(url, entry);
    }
    return entry;
  }

  async #fetchBytes(url: string): Promise<ArrayBuffer> {
    if (this.#options.failUrl && url === this.#options.failUrl) {
      throw new AudioUnavailableError(`falha simulada em ${url}`);
    }
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new AudioUnavailableError(`falha de rede ao baixar ${url}`);
    }
    if (!response.ok) throw new AudioUnavailableError(`HTTP ${response.status} em ${url}`);
    return response.arrayBuffer();
  }

  #decoded(url: string, entry: Entry): Promise<AudioBuffer> {
    const ctx = this.#ctx;
    if (!ctx) return Promise.reject(new AudioUnavailableError("áudio ainda não destravado"));
    entry.buffer ??= entry.bytes.then(async (bytes) => {
      try {
        return await ctx.decodeAudioData(bytes);
      } catch {
        throw new AudioUnavailableError(`não foi possível decodificar ${url}`);
      }
    });
    if (!this.#cache.has(url)) this.#cache.set(url, entry);
    return entry.buffer;
  }
}
