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
// - O tempo do jogo começa no 1º som da prévia (core/silence.ts): o silêncio do começo, medido
//   uma vez ao decodificar, soma-se a todo começo pedido, e o fim encurta o mesmo tanto. Na
//   mistura, a régua é mais exigente: cada voz pula também a introdução baixa. O <audio> de
//   reserva não lê as amostras e começa do 0.
import { type GainPoint, playbackEnvelope, stopEnvelope } from "../core/envelope.ts";
import { mixGains, mixHeadroom, rmsOf } from "../core/mix.ts";
import { leadIn, MIX_ENTRY_RATIO, SILENCE_RATIO } from "../core/silence.ts";
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
const LIMIT_THRESHOLD_DB = -3; // o limitador da mistura segura o pico 3 dB abaixo do máximo

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
  /** A energia de cada trecho de cada prévia decodificada (a mistura iguala por ela). */
  readonly #loudness = new WeakMap<AudioBuffer, Map<string, number>>();
  /** O silêncio do começo de cada prévia decodificada, em segundos, por régua (core/silence.ts). */
  readonly #leads = new WeakMap<AudioBuffer, Map<number, number>>();
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

  /**
   * O começo de toda reprodução (o play e o playMix): destrava dentro do clique (até o 1º await,
   * o corpo roda síncrono), para o que tocava, decodifica e retoma o contexto. Null: outra ação
   * tomou o lugar no caminho (a ficha).
   */
  async #ready(urls: readonly string[]): Promise<{
    readonly ctx: AudioContext;
    readonly token: number;
    buffers: AudioBuffer[];
  } | null> {
    if (this.#options.disabled) {
      throw new AudioUnavailableError("decode", "Web Audio desligado (?htmlAudio=1)");
    }
    this.unlock(); // síncrono, ainda dentro do clique
    this.stop();
    const token = this.#token;
    const ctx = this.#ctx as AudioContext;
    const buffers = await Promise.all(urls.map((url) => this.#decoded(url, this.#entry(url))));
    if (token !== this.#token) return null; // outra ação tomou o lugar
    if (ctx.state !== "running") await ctx.resume();
    if (token !== this.#token) return null;
    return { ctx, token, buffers };
  }

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    const ready = await this.#ready([url]);
    if (!ready) return null;
    const { ctx, token } = ready;
    const buffer = ready.buffers[0] as AudioBuffer;

    const lead = this.#lead(buffer);
    const duration = Math.max(0, Math.min(seconds, buffer.duration - lead - offset));
    const gain = ctx.createGain();
    gain.connect(this.#master ?? ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const t0 = ctx.currentTime + START_DELAY;
    apply(gain.gain, playbackEnvelope(t0, duration));
    source.start(t0, lead + offset, duration);

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
        this.#options.onPlayed?.({ ...result, url, offset, lead, engine: "webaudio" });
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
    const ready = await this.#ready(tracks.map((t) => t.url));
    if (!ready) return null;
    const { ctx, buffers } = ready;
    if (typeof ctx.createStereoPanner !== "function") {
      // O Safari antigo (antes do 14.1) não tem o StereoPannerNode: sem ele, não há mistura.
      throw new AudioUnavailableError("decode", "este navegador não mistura (sem StereoPanner)");
    }
    // Um começo negativo ou que não é número faria o start lançar erro no meio das vozes. Cada voz
    // começa onde a música dela já engrenou (a régua da mistura): os primeiros sons ficam
    // alinhados, e uma introdução baixa não some debaixo da outra.
    const offsets = buffers.map((b, i) => {
      const asked = tracks[i]?.offset ?? 0;
      return this.#lead(b, MIX_ENTRY_RATIO) + (Number.isFinite(asked) ? Math.max(0, asked) : 0);
    });
    const durations = buffers.map((b, i) =>
      Math.max(0, Math.min(seconds, b.duration - (offsets[i] ?? 0))),
    );
    const levels = options.normalize
      ? mixGains(buffers.map((b, i) => this.#energy(b, offsets[i] ?? 0, durations[i] ?? 0)))
      : buffers.map(() => mixHeadroom(buffers.length));
    const length = Math.max(0, ...durations);

    // A soma das vozes passa por um limitador antes do mestre: a folga de 1/√n segura a energia,
    // mas não o pico (n prévias no talo somam até √n vezes o de uma).
    const bus = ctx.createGain();
    const out = this.#master ?? ctx.destination;
    let limiter: DynamicsCompressorNode | null = null;
    if (options.limit !== false && typeof ctx.createDynamicsCompressor === "function") {
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = LIMIT_THRESHOLD_DB;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      bus.connect(limiter);
      limiter.connect(out);
    } else {
      bus.connect(out);
    }
    // Primeiro todas as vozes, e só depois os starts: uma falha no meio não deixa som sem dono.
    const voices = tracks.map((track, i): Voice => {
      const level = levels[i] ?? 1;
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan ?? 0;
      panner.connect(bus);
      const gain = ctx.createGain();
      // A voz vai a mono antes do lado: numa entrada estéreo, o StereoPanner soma um canal no
      // outro, e o "Separar" mudaria o volume, e não só o lugar.
      gain.channelCount = 1;
      gain.channelCountMode = "explicit";
      gain.channelInterpretation = "speakers";
      gain.gain.value = level * (track.gain ?? 1);
      gain.connect(panner);
      const envelope = ctx.createGain();
      envelope.connect(gain);
      const source = ctx.createBufferSource();
      source.buffer = buffers[i] ?? null;
      source.connect(envelope);
      return { source, envelope, gain, panner, level };
    });

    const mix: Mix = { voices, interrupted: false };
    this.#mix = mix;
    const t0 = ctx.currentTime + START_DELAY;
    for (const [i, voice] of voices.entries()) {
      const duration = durations[i] ?? 0;
      apply(voice.envelope.gain, playbackEnvelope(t0, duration));
      voice.source.start(t0, offsets[i] ?? 0, duration); // todas no mesmo t0: alinhadas
    }
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
      bus.disconnect();
      limiter?.disconnect();
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

  /**
   * A energia do trecho que toca (core/mix.ts): a da prévia inteira levaria a entrada, o fade da
   * Apple e as pausas. Lida das amostras uma vez por buffer e trecho.
   */
  #energy(buffer: AudioBuffer, offset: number, seconds: number): number {
    let byStretch = this.#loudness.get(buffer);
    if (!byStretch) {
      byStretch = new Map();
      this.#loudness.set(buffer, byStretch);
    }
    const key = `${offset}:${seconds}`;
    let energy = byStretch.get(key);
    if (energy === undefined) {
      const from = Math.floor(offset * buffer.sampleRate);
      const to = Math.min(buffer.length, Math.ceil((offset + seconds) * buffer.sampleRate));
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c).subarray(from, to),
      );
      energy = rmsOf(channels);
      byStretch.set(key, energy);
    }
    return energy;
  }

  /** O silêncio do começo (core/silence.ts), lido das amostras uma vez por prévia e régua. */
  #lead(buffer: AudioBuffer, ratio = SILENCE_RATIO): number {
    let byRatio = this.#leads.get(buffer);
    if (!byRatio) {
      byRatio = new Map();
      this.#leads.set(buffer, byRatio);
    }
    let lead = byRatio.get(ratio);
    if (lead === undefined) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c),
      );
      lead = leadIn(channels, buffer.sampleRate, ratio);
      byRatio.set(ratio, lead);
    }
    return lead;
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
      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(bytes);
      } catch {
        throw new AudioUnavailableError("decode", `não foi possível decodificar ${url}`);
      }
      // Já no pré-carregamento, e não no clique do Tocar: as duas réguas.
      this.#lead(buffer);
      this.#lead(buffer, MIX_ENTRY_RATIO);
      return buffer;
    });
    if (!this.#cache.has(url)) this.#cache.set(url, entry);
    return entry.buffer;
  }
}
