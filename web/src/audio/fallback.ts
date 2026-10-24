// Motor composto (P70): o Web Audio primeiro (corte exato); se ele falhar, o <audio> toca a
// mesma URL. A reserva depende do motivo (AudioUnavailableError.kind):
// - decode (o navegador não decodifica o AAC): o Web Audio não vai funcionar nesta sessão, e
//   tudo passa para o <audio>;
// - network e http (rede caiu, CORS barrado, 404, 403): a reserva vale só para aquela URL. Uma
//   queda de sinal passageira não tira o corte exato do resto do dia; com o CORS barrado de vez,
//   cada prévia nova tenta o Web Audio uma vez (falha rápida) e vai para o <audio>;
// - blocked e simulated (?failAudio=): não troca; a falha segue para a tela.
// A mistura das Misturadas (M17, playMix) é só do Web Audio: o <audio> não toca duas prévias no
// mesmo instante. Depois de um decode, ela falha de vez, e a tela anula a rodada.
import {
  type AudioEngine,
  AudioUnavailableError,
  canMix,
  type MixEngine,
  type MixOptions,
  type MixPlayback,
  type MixTrack,
  type Playback,
} from "./engine.ts";

const SESSION_WIDE = new Set(["decode"]);
const THIS_URL = new Set(["network", "http"]);

export class FallbackAudioEngine implements AudioEngine, MixEngine {
  readonly #primary: AudioEngine;
  readonly #reserve: AudioEngine;
  #reserveOnly = false;
  readonly #reserveUrls = new Set<string>();
  #token = 0;

  constructor(primary: AudioEngine, reserve: AudioEngine) {
    this.#primary = primary;
    this.#reserve = reserve;
  }

  unlock(): void {
    this.#primary.unlock();
    this.#reserve.unlock();
  }

  preload(url: string): void {
    if (!this.#usesReserve(url)) this.#primary.preload(url);
  }

  retain(urls: readonly string[]): void {
    this.#primary.retain(urls);
  }

  // Aos dois: a sessão pode passar para o <audio> no meio do jogo.
  setVolume(level: number): void {
    this.#primary.setVolume(level);
    this.#reserve.setVolume(level);
  }

  volume(): number {
    return this.#primary.volume();
  }

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    this.#token += 1;
    const token = this.#token;
    if (this.#usesReserve(url)) {
      this.#primary.stop();
      return this.#reserve.play(url, offset, seconds);
    }
    this.#reserve.stop();
    try {
      return await this.#primary.play(url, offset, seconds);
    } catch (error) {
      // Um Parar (ou outra reprodução) chegou durante a espera: a reserva não pode tocar.
      if (token !== this.#token) return null;
      if (!(error instanceof AudioUnavailableError)) throw error;
      if (SESSION_WIDE.has(error.kind)) this.#reserveOnly = true;
      else if (THIS_URL.has(error.kind)) this.#reserveUrls.add(url);
      else throw error;
      return this.#reserve.play(url, offset, seconds);
    }
  }

  async playMix(
    tracks: readonly MixTrack[],
    seconds: number,
    options?: MixOptions,
  ): Promise<MixPlayback | null> {
    // Como um Parar para a prévia sozinha que ainda carrega: a reserva dela não toca por cima.
    this.#token += 1;
    this.#reserve.stop();
    if (this.#reserveOnly || !canMix(this.#primary)) {
      throw new AudioUnavailableError("decode", "a mistura precisa do Web Audio");
    }
    try {
      return await this.#primary.playMix(tracks, seconds, options);
    } catch (error) {
      // O navegador não decodifica: daqui em diante, as prévias sozinhas vão para o <audio>.
      if (error instanceof AudioUnavailableError && SESSION_WIDE.has(error.kind)) {
        this.#reserveOnly = true;
      }
      throw error;
    }
  }

  stop(): void {
    this.#token += 1;
    this.#primary.stop();
    this.#reserve.stop();
  }

  #usesReserve(url: string): boolean {
    return this.#reserveOnly || this.#reserveUrls.has(url);
  }
}
