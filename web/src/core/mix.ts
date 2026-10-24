// A mistura das Misturadas (M17): a energia de cada prévia e o ganho de cada uma na soma. Puro:
// o motor (audio/webaudio.ts) entrega as amostras e aplica os ganhos.

/**
 * O quanto o igualar mexe numa prévia, para cima ou para baixo (4 = 12 dB; era 2, e uma prévia
 * baixa ainda sumia debaixo da outra, o usuário, 24/10/2026). Reforçar mais faz o ruído subir
 * junto, e abaixar mais deixa a mistura inteira baixa por causa de uma prévia quieta. O pico da
 * soma fica com o limitador do motor.
 */
export const MAX_BOOST = 4;

/** A energia média (RMS) das amostras de todos os canais; 0 sem amostras. */
export function rmsOf(channels: readonly Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i += 1) {
      const x = data[i] ?? 0;
      sum += x * x;
    }
    count += data.length;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

/**
 * A folga da soma: n prévias tocando juntas somam a energia de todas. Com 1/√n, a energia da soma
 * fica perto da de uma prévia sozinha. O pico ainda passa (até √n vezes o de uma, com as prévias
 * no talo): quem o segura é o limitador do motor (audio/webaudio.ts).
 */
export function mixHeadroom(count: number): number {
  return count <= 1 ? 1 : 1 / Math.sqrt(count);
}

/**
 * O ganho de cada prévia para todas soarem com a mesma energia. O alvo é a média geométrica das
 * energias (nem a mais alta nem a mais baixa puxam sozinhas), mas a mais alta nunca abaixa mais
 * que `maxBoost` vezes; a mais baixa também não sobe mais que isso. A folga da soma vale para
 * todas, e a prévia em silêncio (energia 0) fica só com ela.
 */
export function mixGains(rms: readonly number[], maxBoost: number = MAX_BOOST): number[] {
  const headroom = mixHeadroom(rms.length);
  const heard = rms.filter((r) => r > 0);
  if (heard.length === 0) return rms.map(() => headroom);
  const mean = Math.exp(heard.reduce((sum, r) => sum + Math.log(r), 0) / heard.length);
  const target = Math.max(mean, Math.max(...heard) / maxBoost);
  return rms.map((r) => (r > 0 ? Math.min(target / r, maxBoost) : 1) * headroom);
}

/**
 * O lado de cada uma de `count` músicas, ao separar (P327): espalhadas de −0,8 a 0,8, na ordem da
 * rodada. A 1ª fica sempre à esquerda: a música não troca de lado quando outra sai da mistura.
 */
export function spreadPans(count: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => -0.8 + (1.6 * i) / (count - 1));
}
