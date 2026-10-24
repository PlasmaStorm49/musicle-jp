// Motor de áudio falso, só para os testes de ponta a ponta (Playwright), em desenvolvimento
// com ?fakeAudio=1. "Toca" na hora e sem som: o teste não espera segundos reais nem depende de
// decodificar áudio no navegador da CI. O build de produção nunca o inclui (a CI confere).
// Simplificações (o motor de verdade faz diferente): não conhece a duração do arquivo, então
// não corta o pedido no fim do preview; registra no __musicleAudioLog ao começar, e não ao
// terminar; nunca é interrompido (stop não faz nada). Teste do Parar ou do corte no fim do
// preview fica nos testes de componente, não no e2e.

import { clampVolume } from "../core/volume.ts";
import {
  type AudioEngine,
  AudioUnavailableError,
  type EngineOptions,
  type MixEngine,
  type MixPlayback,
  type MixTrack,
  type Playback,
} from "./engine.ts";

export class FakeAudioEngine implements AudioEngine, MixEngine {
  /** Marca que a CI procura no build: este motor não pode chegar à produção. */
  readonly kind = "musicle-fake-audio";
  readonly #options: EngineOptions;
  #volume: number;

  constructor(options: EngineOptions = {}) {
    this.#options = options;
    this.#volume = clampVolume(options.volume ?? 1);
  }

  unlock(): void {}

  preload(): void {}

  retain(): void {}

  setVolume(level: number): void {
    this.#volume = clampVolume(level);
  }

  volume(): number {
    return this.#volume;
  }

  stop(): void {}

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    // A mesma falha do motor de verdade, para a rodada ser anulada (?failAudio=).
    if (this.#options.fails?.(url)) {
      throw new AudioUnavailableError("simulated", `falha simulada: ${url}`);
    }
    const result = { requested: seconds, played: seconds, interrupted: false };
    this.#options.onPlayed?.({ ...result, url, offset, engine: "fake", volume: this.#volume });
    return { t0: 0, seconds, elapsed: () => seconds, done: Promise.resolve(result) };
  }

  /** A mistura (M17): registra as prévias, o começo e o lado de cada uma, e "toca" na hora. */
  async playMix(tracks: readonly MixTrack[], seconds: number): Promise<MixPlayback | null> {
    const failed = tracks.find((track) => this.#options.fails?.(track.url));
    if (failed) throw new AudioUnavailableError("simulated", `falha simulada: ${failed.url}`);
    this.#options.onMixed?.({
      urls: tracks.map((track) => track.url),
      offsets: tracks.map((track) => track.offset),
      pans: tracks.map((track) => track.pan ?? 0),
      seconds,
      engine: "fake",
    });
    const result = { requested: seconds, played: seconds, interrupted: false };
    return {
      t0: 0,
      seconds,
      elapsed: () => seconds,
      done: Promise.resolve(result),
      setGain: () => {},
      setPan: () => {},
    };
  }
}
