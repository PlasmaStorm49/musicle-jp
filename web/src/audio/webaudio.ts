// Motor de áudio com Web Audio: corta o trecho no tempo exato (source.start com duração),
// o que o <audio> não garante. Cuidados, um a um:
// - AudioContext só nasce ou volta a rodar dentro de um clique (bloqueio de autoplay); por
//   isso play() chama unlock() antes do primeiro await.
// - decodeAudioData "desanexa" os bytes: o cache guarda a Promise<AudioBuffer>, não os bytes.
// - Cada reprodução tem uma ficha. Uma ação nova (tocar, parar) troca a ficha, e o que estava
//   carregando ou o onended antigo (que também dispara no stop) é ignorado.
// - O estado do contexto pode ser "suspended" ou "interrupted": testa-se !== "running".
import { type GainPoint, playbackEnvelope, stopEnvelope } from "../core/envelope.ts";
import { clampVolume, gainOf } from "../core/volume.ts";
import {
  type AudioEngine,
  AudioUnavailableError,
  type EngineOptions,
  type Playback,
  type PlaybackResult,
} from "./engine.ts";
import { enablePlaybackSession } from "./session.ts";

export type WebAudioOptions = EngineOptions & {
  /**
   * ?htmlAudio=1 (P76): toda reprodução falha como se o navegador não decodificasse o arquivo,
   * e o motor composto troca de verdade para o <audio>.
   */
  readonly disabled?: boolean;
};

type Entry = { bytes: Promise<ArrayBuffer>; buffer?: Promise<AudioBuffer> };

type Current = {
  readonly token: number;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  interrupted: boolean;
};

const START_DELAY = 0.01; // agenda o início 10 ms à frente, para a rampa começar do zero
const VOLUME_SMOOTHING = 0.015; // a troca de volume chega em ~15 ms, sem estalo

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
  /** O ganho mestre (o volume): entre o ganho de cada reprodução, o do fade, e a saída. */
  #master: GainNode | null = null;
  #volume: number;

  constructor(options: WebAudioOptions = {}) {
    this.#options = options;
    this.#volume = clampVolume(options.volume ?? 1);
  }

  unlock(): void {
    if (!this.#ctx) {
      enablePlaybackSession();
      this.#ctx = new AudioContext();
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = gainOf(this.#volume);
      this.#master.connect(this.#ctx.destination);
      // Aba oculta: o rAF da barra para, então o som também para.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stop();
      });
    }
    if (this.#ctx.state !== "running") void this.#ctx.resume();
  }

  preload(url: string): void {
    if (this.#options.disabled) return;
    const entry = this.#entry(url);
    if (this.#ctx) this.#decoded(url, entry).catch(() => {}); // falha aparece só ao tocar
  }

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    if (this.#options.disabled) {
      throw new AudioUnavailableError("decode", "Web Audio desligado (?htmlAudio=1)");
    }
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
    gain.connect(this.#master ?? ctx.destination);
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
        this.#options.onPlayed?.({ ...result, url, offset, engine: "webaudio" });
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

  setVolume(level: number): void {
    this.#volume = clampVolume(level);
    const ctx = this.#ctx;
    if (ctx && this.#master) {
      this.#master.gain.setTargetAtTime(gainOf(this.#volume), ctx.currentTime, VOLUME_SMOOTHING);
    }
  }

  volume(): number {
    return this.#volume;
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
    if (this.#options.fails?.(url)) {
      throw new AudioUnavailableError("simulated", `falha simulada em ${url}`);
    }
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      // Inclui o CORS barrado: o fetch não diz qual foi, e o <audio> não precisa de CORS.
      throw new AudioUnavailableError("network", `falha de rede ao baixar ${url}`);
    }
    if (!response.ok) throw new AudioUnavailableError("http", `HTTP ${response.status} em ${url}`);
    try {
      return await response.arrayBuffer();
    } catch {
      // A conexão caiu no meio do download: é falha de rede, não um erro qualquer (que o motor
      // composto repassaria sem tentar o <audio>).
      throw new AudioUnavailableError("network", `download interrompido em ${url}`);
    }
  }

  #decoded(url: string, entry: Entry): Promise<AudioBuffer> {
    const ctx = this.#ctx;
    if (!ctx)
      return Promise.reject(new AudioUnavailableError("blocked", "áudio ainda não destravado"));
    entry.buffer ??= entry.bytes.then(async (bytes) => {
      try {
        return await ctx.decodeAudioData(bytes);
      } catch {
        throw new AudioUnavailableError("decode", `não foi possível decodificar ${url}`);
      }
    });
    if (!this.#cache.has(url)) this.#cache.set(url, entry);
    return entry.buffer;
  }
}
