// Reserva do Web Audio (P70): um <audio> só, reaproveitado, tocando a mesma URL. Não exige CORS
// (sem crossOrigin) nem guarda o áudio decodificado na memória, mas corta com menos precisão:
// o corte sai do currentTime, conferido por um laço de setTimeout (alguns ms de erro, contra
// menos de 10 ms do Web Audio), e sem a rampa de volume (o iPhone não deixa mudar o volume pelo
// código). Cuidados, um a um:
// - play() é chamado antes de qualquer await: o Safari só deixa tocar dentro do gesto;
// - uma ficha por reprodução, como no Web Audio: o que chega depois de um Parar é ignorado;
// - aba oculta para o som;
// - a tela de bloqueio do celular mostra os metadados da mídia, e o nome da música é a
//   resposta: o título vira o nome do jogo (mediaSession).

import { clampVolume, gainOf } from "../core/volume.ts";
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
  | "src"
  | "currentTime"
  | "duration"
  | "ended"
  | "error"
  | "preload"
  | "play"
  | "pause"
  | "volume"
  | "muted"
>;

export type HtmlAudioOptions = EngineOptions & {
  /** Título neutro para a tela de bloqueio (o nome do jogo). */
  readonly mediaTitle?: string;
  readonly createElement?: () => MediaElement;
};

// O laço do corte acorda um pouco antes do fim e depois confere de 5 em 5 ms.
const EARLY_MS = 25;
const MIN_CHECK_MS = 5;
// Diferença entre o início pedido e o real a partir da qual o seek é refeito.
const SEEK_SLACK_SEC = 0.25;

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
  #volume: number;

  constructor(options: HtmlAudioOptions = {}) {
    this.#options = options;
    this.#volume = clampVolume(options.volume ?? 1);
  }

  unlock(): void {
    if (this.#audio) return;
    enablePlaybackSession();
    const audio = this.#options.createElement?.() ?? new Audio();
    audio.preload = "auto";
    this.#audio = audio;
    this.#applyVolume();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
    });
    this.#takeMediaKeys();
  }

  /**
   * Teclas de mídia, botão do fone e a tela de bloqueio dão play no <audio> pelo navegador, sem
   * passar pelo jogo: tocariam além do corte e entregariam a música. Com um tratador próprio o
   * navegador não faz a ação padrão: tocar e avançar não fazem nada; pausar é o Parar.
   */
  #takeMediaKeys(): void {
    if (!("mediaSession" in navigator)) return;
    const ignore = () => {};
    const handlers: [MediaSessionAction, () => void][] = [
      ["play", ignore],
      ["pause", () => this.stop()],
      ["stop", () => this.stop()],
      ["seekbackward", ignore],
      ["seekforward", ignore],
      ["seekto", ignore],
      ["previoustrack", ignore],
      ["nexttrack", ignore],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ação que este navegador não conhece: segue com as outras.
      }
    }
  }

  /** A reserva não guarda nada na memória: baixa ao tocar. */
  preload(): void {}

  setVolume(level: number): void {
    this.#volume = clampVolume(level);
    this.#applyVolume();
  }

  /**
   * O volume do elemento e o mudo. No iPhone, o volume do <audio> é só leitura (vale sempre 1):
   * lá, a reserva não segue o nível da barra, mas o muted, sim, e o 0% fica mudo também nela.
   */
  #applyVolume(): void {
    if (!this.#audio) return;
    this.#audio.volume = gainOf(this.#volume);
    this.#audio.muted = this.#volume === 0;
  }

  volume(): number {
    return this.#volume;
  }

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
    // Há Safari que ignora o currentTime pedido antes de os metadados chegarem (tocaria do 0):
    // com o play() já começado, eles chegaram, e o pedido vale.
    if (Math.abs(audio.currentTime - offset) > SEEK_SLACK_SEC) audio.currentTime = offset;

    const left = Number.isFinite(audio.duration) ? audio.duration - offset : seconds;
    const duration = Math.max(0, Math.min(seconds, left));
    const elapsed = () => Math.min(Math.max(audio.currentTime - offset, 0), duration);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finish: (interrupted: boolean) => void = () => {};
    const done = new Promise<PlaybackResult>((resolve) => {
      finish = (interrupted) => {
        clearTimeout(timer);
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
    // Dorme até perto do fim do trecho e confere de novo. Com setTimeout, e não com quadros: o
    // requestAnimationFrame para quando a página não pinta (janela encoberta), mesmo visível,
    // e o som passaria do corte. Se o áudio travar para carregar, o currentTime para e o laço
    // só espera mais.
    const tick = () => {
      const left = offset + duration - audio.currentTime;
      // Fim do trecho, fim do arquivo ou erro no meio: termina (senão a tela ficaria tocando).
      if (left <= 0 || audio.ended || audio.error) finish(false);
      else timer = setTimeout(tick, Math.max(MIN_CHECK_MS, left * 1000 - EARLY_MS));
    };
    this.#current = { token, finish: (interrupted) => finish(interrupted) };
    tick();
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
