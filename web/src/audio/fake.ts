// Motor de áudio falso, só para os testes de ponta a ponta (Playwright), em desenvolvimento
// com ?fakeAudio=1. "Toca" na hora e sem som: o teste não espera segundos reais nem depende de
// decodificar áudio no navegador da CI. O build de produção nunca o inclui (a CI confere).
// Simplificações (o motor de verdade faz diferente): não conhece a duração do arquivo, então
// não corta o pedido no fim do preview; registra no __musicleAudioLog ao começar, e não ao
// terminar; nunca é interrompido (stop não faz nada). Teste do Parar ou do corte no fim do
// preview fica nos testes de componente, não no e2e.
import { type AudioEngine, AudioUnavailableError, type Playback } from "./engine.ts";
import type { WebAudioOptions } from "./webaudio.ts";

export class FakeAudioEngine implements AudioEngine {
  /** Marca que a CI procura no build: este motor não pode chegar à produção. */
  readonly kind = "musicle-fake-audio";
  readonly #options: WebAudioOptions;

  constructor(options: WebAudioOptions = {}) {
    this.#options = options;
  }

  unlock(): void {}

  preload(): void {}

  retain(): void {}

  stop(): void {}

  async play(url: string, offset: number, seconds: number): Promise<Playback | null> {
    // A mesma falha do motor de verdade, para a rodada ser anulada (?failAudio=).
    if (url === this.#options.failUrl) throw new AudioUnavailableError(`falha simulada: ${url}`);
    const result = { requested: seconds, played: seconds, interrupted: false };
    this.#options.onPlayed?.({ ...result, url, offset });
    return { t0: 0, seconds, elapsed: () => seconds, done: Promise.resolve(result) };
  }
}
