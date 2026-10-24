// Motor de áudio com Web Audio: corta o trecho no tempo exato (source.start com duração),
// o que o <audio> não garante. Cuidados, um a um:
// - AudioContext só nasce ou volta a rodar dentro de um clique (bloqueio de autoplay); por
//   isso play() chama unlock() antes do primeiro await.
// - decodeAudioData "desanexa" os bytes: o cache guarda a Promise<AudioBuffer>, não os bytes.
// - Cada reprodução tem uma ficha. Uma ação nova (tocar, parar) troca a ficha, e o que estava
//   carregando ou o onended antigo (que também dispara no stop) é ignorado.
// - O estado do contexto pode ser "suspended" ou "interrupted": testa-se !== "running".
// - A mistura das Misturadas (M17, playMix) toca várias prévias no mesmo t0, cada uma com o seu
//   ganho e o seu lado; o stop() para a mistura também, com a mesma ficha.
import { type GainPoint, playbackEnvelope, stopEnvelope } from "../core/envelope.ts";
import { mixGains, mixHeadroom, rmsOf } from "../core/mix.ts";
import { clampVolume, gainOf } from "../core/volume.ts";
import {
  type AudioEngine,
  AudioUnavailableError,
  type EngineOptions,
  type MixEngine,
  type MixOptions,
  type MixPlayback,
  type MixTrack,
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

/**
 * Uma prévia da mistura: a fonte, o envelope de sempre (a subida e a descida de 10 ms), o ganho
 * dela (a folga ou o igualado, e o "Achei") e o lado. O ganho é outro nó porque o envelope agenda
 * valores no dele, e o stop os cancela.
 */
type Voice = {
  readonly source: AudioBufferSourceNode;
  readonly envelope: GainNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  /** O ganho da mistura: o setGain é relativo a ele. */
  readonly level: number;
};

type Mix = { readonly voices: readonly Voice[]; interrupted: boolean };

const START_DELAY = 0.01; // agenda o início 10 ms à frente, para a rampa começar do zero
const VOLUME_SMOOTHING = 0.015; // a troca de volume chega em ~15 ms, sem estalo
const MIX_RAMP = 0.3; // uma prévia que sai da mistura (ou abaixa) em 0,3 s
const PAN_SMOOTHING = 0.05; // o lado muda em ~50 ms, sem estalo

function apply(param: AudioParam, points: readonly GainPoint[]): void {
  for (const p of points) {
    if (p.kind === "set") param.setValueAtTime(p.value, p.time);
    else param.linearRampToValueAtTime(p.value, p.time);
  }
}

/** Corta uma fonte em `now` com a rampa curta, partindo do ganho atual do envelope. */
function cut(envelope: GainNode, source: AudioBufferSourceNode, now: number): void {
  const { points, stopAt } = stopEnvelope(now, envelope.gain.value);
  envelope.gain.cancelScheduledValues(now);
  apply(envelope.gain, points);
  source.stop(stopAt);
}

export class WebAudioEngine implements AudioEngine, MixEngine {
  #ctx: AudioContext | null = null;
  readonly #cache = new Map<string, Entry>();
  #token = 0;
  #current: Current | null = null;
  #mix: Mix | null = null;
  /** A energia de cada prévia decodificada, calculada uma vez (a mistura iguala por ela). */
  readonly #loudness = new WeakMap<AudioBuffer, number>();
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

  async playMix(
    tracks: readonly MixTrack[],
    seconds: number,
    options: MixOptions = {},
  ): Promise<MixPlayback | null> {
    if (this.#options.disabled) {
      throw new AudioUnavailableError("decode", "Web Audio desligado (?htmlAudio=1)");
    }
    this.unlock(); // síncrono, ainda dentro do clique
    this.stop();
    const token = this.#token;
    const ctx = this.#ctx as AudioContext;
    const buffers = await Promise.all(tracks.map((t) => this.#decoded(t.url, this.#entry(t.url))));
    if (token !== this.#token) return null; // outra ação tomou o lugar
    if (ctx.state !== "running") await ctx.resume();
    if (token !== this.#token) return null;

    const levels = options.normalize
      ? mixGains(buffers.map((b) => this.#energy(b)))
      : buffers.map(() => mixHeadroom(buffers.length));
    const durations = tracks.map((t, i) =>
      Math.max(0, Math.min(seconds, (buffers[i]?.duration ?? 0) - t.offset)),
    );
    const length = Math.max(0, ...durations);
    const t0 = ctx.currentTime + START_DELAY;
    const voices = tracks.map((track, i): Voice => {
      const level = levels[i] ?? 1;
      const duration = durations[i] ?? 0;
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan ?? 0;
      panner.connect(this.#master ?? ctx.destination);
      const gain = ctx.createGain();
      gain.gain.value = level * (track.gain ?? 1);
      gain.connect(panner);
      const envelope = ctx.createGain();
      envelope.connect(gain);
      const source = ctx.createBufferSource();
      source.buffer = buffers[i] ?? null;
      source.connect(envelope);
      apply(envelope.gain, playbackEnvelope(t0, duration));
      source.start(t0, track.offset, duration); // todas no mesmo t0: alinhadas
      return { source, envelope, gain, panner, level };
    });

    const mix: Mix = { voices, interrupted: false };
    this.#mix = mix;
    const live = () => this.#mix === mix;
    const elapsed = () => Math.min(Math.max(ctx.currentTime - t0, 0), length);
    const ended = voices.map(
      (voice) =>
        new Promise<void>((resolve) => {
          voice.source.onended = () => {
            for (const node of [voice.source, voice.envelope, voice.gain, voice.panner]) {
              node.disconnect();
            }
            resolve();
          };
        }),
    );
    // Abaixar uma prévia (o "Achei") não a para: a mistura acaba quando todas acabam.
    const done = Promise.all(ended).then((): PlaybackResult => {
      if (live()) this.#mix = null;
      return {
        requested: length,
        played: mix.interrupted ? elapsed() : Math.max(ctx.currentTime - t0, 0),
        interrupted: mix.interrupted,
      };
    });
    return {
      t0,
      seconds: length,
      elapsed,
      done,
      setGain: (index, value, rampSeconds = MIX_RAMP) => {
        const voice = voices[index];
        if (!voice || !live()) return;
        const now = ctx.currentTime;
        const param = voice.gain.gain;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(voice.level * value, now + rampSeconds);
      },
      setPan: (index, pan) => {
        const voice = voices[index];
        if (!voice || !live()) return;
        voice.panner.pan.setTargetAtTime(pan, ctx.currentTime, PAN_SMOOTHING);
      },
    };
  }

  stop(): void {
    this.#token += 1; // cancela também o que ainda estava carregando
    const ctx = this.#ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const mix = this.#mix;
    if (mix) {
      this.#mix = null;
      mix.interrupted = true;
      for (const voice of mix.voices) cut(voice.envelope, voice.source, now);
    }
    const current = this.#current;
    if (!current) return;
    this.#current = null;
    current.interrupted = true;
    cut(current.gain, current.source, now);
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

  /** A energia da prévia (core/mix.ts), lida das amostras uma vez por buffer. */
  #energy(buffer: AudioBuffer): number {
    let energy = this.#loudness.get(buffer);
    if (energy === undefined) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c),
      );
      energy = rmsOf(channels);
      this.#loudness.set(buffer, energy);
    }
    return energy;
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
