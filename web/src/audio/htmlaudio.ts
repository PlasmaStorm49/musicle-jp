// Reserva do Web Audio (P70): um <audio> só, reaproveitado, tocando a mesma URL. Não exige CORS
// (sem crossOrigin) nem guarda o áudio decodificado na memória, mas corta com menos precisão:
// o corte sai do currentTime, conferido a cada quadro (cerca de 20 ms de erro, contra menos de
// 10 ms do Web Audio), e sem a rampa de volume (o iPhone não deixa mudar o volume pelo código).
// Cuidados, um a um:
// - play() é chamado antes de qualquer await: o Safari só deixa tocar dentro do gesto;
// - uma ficha por reprodução, como no Web Audio: o que chega depois de um Parar é ignorado;
// - aba oculta para o som (o laço de quadros para junto);
// - a tela de bloqueio do celular mostra os metadados da mídia, e o nome da música é a
//   resposta: o título vira o nome do jogo (mediaSession).
import {
  type AudioEngine,
  AudioUnavailableError,
  type EngineOptions,
  type Playback,
  type PlaybackResult,
} from "./engine.ts";
import { enablePlaybackSession } from "./session.ts";

/** O que usamos do <audio>; os testes trocam por um objeto simples. */
export type MediaElement = Pick<
  HTMLAudioElement,
  "src" | "currentTime" | "duration" | "ended" | "error" | "preload" | "play" | "pause"
>;

export type HtmlAudioOptions = EngineOptions & {
  /** Título neutro para a tela de bloqueio (o nome do jogo). */
  readonly mediaTitle?: string;
  readonly createElement?: () => MediaElement;
};

// Códigos do MediaError: o arquivo veio, mas o navegador não sabe tocar.
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

function failureOf(error: unknown, audio: MediaElement): AudioUnavailableError {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") {
    return new AudioUnavailableError("blocked", "o navegador barrou o som fora do gesto");
  }
  const code = audio.error?.code;
  if (code === MEDIA_ERR_DECODE || code === MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return new AudioUnavailableError("decode", `o <audio> não tocou ${audio.src}`);
  }
  return new AudioUnavailableError("network", `falha ao baixar ${audio.src}`);
}

type Current = { readonly token: number; readonly finish: (interrupted: boolean) => void };

export class HtmlAudioEngine implements AudioEngine {
  #audio: MediaElement | null = null;
  #token = 0;
  #current: Current | null = null;
  readonly #options: HtmlAudioOptions;

  constructor(options: HtmlAudioOptions = {}) {
    this.#options = options;
  }

  unlock(): void {
    if (this.#audio) return;
    enablePlaybackSession();
    const audio = this.#options.createElement?.() ?? new Audio();
    audio.preload = "auto";
    this.#audio = audio;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
    });
  }

  /** A reserva não guarda nada na memória: baixa ao tocar. */
  preload(): void {}

  retain(): void {}

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    this.unlock();
    this.stop();
    const token = this.#token;
    const audio = this.#audio as MediaElement;
    if (this.#options.fails?.(url)) {
      throw new AudioUnavailableError("simulated", `falha simulada em ${url}`);
    }
    if (audio.src !== url) audio.src = url;
    audio.currentTime = offset;
    this.#neutralMetadata();
    try {
      await audio.play(); // chamado ainda dentro do clique; só a espera vem depois
    } catch (error) {
      if (token !== this.#token) return null; // um Parar interrompeu o início
      throw failureOf(error, audio);
    }
    if (token !== this.#token) return null;

    const left = Number.isFinite(audio.duration) ? audio.duration - offset : seconds;
    const duration = Math.max(0, Math.min(seconds, left));
    const elapsed = () => Math.min(Math.max(audio.currentTime - offset, 0), duration);
    let frame = 0;
    let finish: (interrupted: boolean) => void = () => {};
    const done = new Promise<PlaybackResult>((resolve) => {
      finish = (interrupted) => {
        cancelAnimationFrame(frame);
        audio.pause();
        if (this.#current?.token === token) this.#current = null;
        const result = {
          requested: duration,
          played: interrupted ? elapsed() : Math.max(audio.currentTime - offset, 0),
          interrupted,
        };
        this.#options.onPlayed?.({ ...result, url, offset, engine: "html" });
        resolve(result);
        finish = () => {}; // termina uma vez só
      };
    });
    const tick = () => {
      // Fim do trecho, fim do arquivo ou erro no meio: termina (senão a tela ficaria tocando).
      if (audio.currentTime - offset >= duration || audio.ended || audio.error) finish(false);
      else frame = requestAnimationFrame(tick);
    };
    this.#current = { token, finish: (interrupted) => finish(interrupted) };
    frame = requestAnimationFrame(tick);
    return { t0: 0, seconds: duration, elapsed, done };
  }

  stop(): void {
    this.#token += 1; // cancela também um início que ainda espera o play()
    const current = this.#current;
    this.#current = null;
    if (current) current.finish(true);
    else this.#audio?.pause();
  }

  #neutralMetadata(): void {
    const title = this.#options.mediaTitle;
    if (!title || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({ title });
  }
}
