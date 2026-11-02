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

/**
 * A régua das Misturadas (o usuário, 24/10/2026): a voz começa onde a música já engrenou, a 15 dB
 * da energia da prévia inteira. Uma introdução baixa, que sozinha se ouve, some debaixo da outra
 * música, e a rodada soaria como uma música só.
 */
export const MIX_ENTRY_RATIO = 10 ** (-15 / 20);

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
 * de folga, para não cortar o ataque da nota. Com som, a janela chega a `ratio` da energia da
 * prévia inteira (de 0 a 1; a da mistura é mais exigente). A prévia muda inteira dá 0: nada muda.
 */
export function leadIn(
  channels: readonly Float32Array[],
  sampleRate: number,
  ratio: number = SILENCE_RATIO,
): number {
  const length = Math.max(0, ...channels.map((data) => data.length));
  if (length === 0 || !(sampleRate > 0)) return 0;
  const whole = rms(channels, 0, length);
  if (whole < SILENCE_FLOOR) return 0;
  const threshold = Math.max(whole * Math.min(ratio, 1), SILENCE_FLOOR);
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

/** O passo da procura de um trecho com som, em segundos. */
export const LOUD_STEP = 0.25;

/** O pedaço medido dentro do trecho, em segundos: nenhum meio segundo do trecho pode ficar mudo. */
export const LOUD_CHUNK = 0.5;

/**
 * O 1º começo, a partir de `from` (em segundos, no buffer), de um trecho de `seconds` com som: cada
 * meio segundo dele chega a `ratio` da energia da prévia inteira. O Setlist Royale sorteia o ponto
 * de cada prévia, e um trecho que cai numa pausa ou num breakdown não deixa reconhecer a música.
 * Sem nenhum para a frente, procura do começo; sem nenhum na prévia, fica em `from` (ou no último
 * começo que ainda cabe o trecho inteiro).
 */
export function loudFrom(
  channels: readonly Float32Array[],
  sampleRate: number,
  from: number,
  seconds: number,
  ratio: number = MIX_ENTRY_RATIO,
): number {
  const length = Math.max(0, ...channels.map((data) => data.length));
  if (length === 0 || !(sampleRate > 0)) return from;
  const whole = rms(channels, 0, length);
  if (whole < SILENCE_FLOOR) return from;
  const threshold = Math.max(whole * Math.min(ratio, 1), SILENCE_FLOOR);
  const size = Math.max(1, Math.round(seconds * sampleRate));
  const last = length - size;
  if (last < 0) return from;
  const step = Math.max(1, Math.round(LOUD_STEP * sampleRate));
  const start = Math.min(Math.max(0, Math.round(from * sampleRate)), last);
  const chunk = Math.max(1, Math.round(LOUD_CHUNK * sampleRate));
  const heard = (at: number) => {
    for (let part = at; part < at + size; part += chunk) {
      if (rms(channels, part, Math.min(at + size, part + chunk)) < threshold) return false;
    }
    return true;
  };
  for (let at = start; at <= last; at += step) {
    if (heard(at)) return at / sampleRate;
  }
  for (let at = 0; at < start; at += step) {
    if (heard(at)) return at / sampleRate;
  }
  // Nenhum trecho passa: fica no pedido, mas com o trecho inteiro dentro da prévia.
  return start / sampleRate;
}
