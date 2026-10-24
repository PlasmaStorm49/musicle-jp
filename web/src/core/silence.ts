// O silêncio do começo de uma prévia. Algumas da Apple começam mudas (ou quase), e o trecho de
// 1 s não deixava distinguir a música. Puro: o motor (audio/webaudio.ts) entrega as amostras e
// começa toda reprodução depois do silêncio; o fim da prévia encurta o mesmo tanto.
import { rmsOf } from "./mix.ts";

/** O tamanho de cada janela medida, em segundos. */
export const SILENCE_WINDOW = 0.05;

/**
 * Abaixo disto da energia da prévia inteira (−30 dB), a janela conta como silêncio: o chiado, o
 * ruído de fundo e o começo de um fade-in. Uma introdução baixa, mas que se ouve, fica acima.
 */
export const SILENCE_RATIO = 10 ** (-30 / 20);

/** E abaixo disto (−60 dBFS), sempre, também numa prévia inteira quieta. */
export const SILENCE_FLOOR = 10 ** (-60 / 20);

/**
 * O máximo que se pula, em segundos: a barra dos diários (16 s) ainda cabe inteira numa prévia de
 * 30 s. Uma prévia muda por mais tempo que isso começa daqui.
 */
export const MAX_LEAD = 10;

/** A energia das amostras `from` a `to` de todos os canais (o `subarray` não copia). */
function rms(channels: readonly Float32Array[], from: number, to: number): number {
  return rmsOf(channels.map((data) => data.subarray(from, to)));
}

/**
 * Os segundos de silêncio no começo da prévia: onde começa a 1ª janela com som, menos uma janela
 * de folga, para não cortar o ataque da nota. A prévia muda inteira dá 0: nada muda.
 */
export function leadIn(channels: readonly Float32Array[], sampleRate: number): number {
  const length = Math.max(0, ...channels.map((data) => data.length));
  if (length === 0 || !(sampleRate > 0)) return 0;
  const whole = rms(channels, 0, length);
  if (whole < SILENCE_FLOOR) return 0;
  const threshold = Math.max(whole * SILENCE_RATIO, SILENCE_FLOOR);
  const window = Math.max(1, Math.round(SILENCE_WINDOW * sampleRate));
  const limit = Math.min(length, Math.round(MAX_LEAD * sampleRate));
  for (let from = 0; from < limit; from += window) {
    if (rms(channels, from, from + window) >= threshold) {
      return Math.max(0, from - window) / sampleRate;
    }
  }
  // Só chega aqui a prévia muda até o máximo e com som depois (alguma janela tem ao menos a
  // energia da prévia inteira): começa no máximo.
  return limit / sampleRate;
}
