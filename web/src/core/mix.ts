// A mistura das Misturadas (M17): a energia de cada prévia e o ganho de cada uma na soma. Puro:
// o motor (audio/webaudio.ts) entrega as amostras e aplica os ganhos.

/**
 * O quanto o igualar mexe numa prévia, para cima ou para baixo (2 = 6 dB): reforçar mais faz o
 * ruído subir junto, e abaixar mais deixa a mistura inteira baixa por causa de uma prévia quieta.
 */
export const MAX_BOOST = 2;

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
 * A folga da soma: n prévias tocando juntas somam até n vezes a amplitude de uma. Com 1/√n, a
 * energia da soma fica perto da de uma prévia sozinha, sem estourar no ganho mestre.
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
