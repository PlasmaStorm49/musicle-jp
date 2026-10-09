// Envelope de volume de uma reprodução: sobe e desce em 10 ms para não estalar.
// Função pura: o motor de áudio só aplica estes pontos num GainNode.

export const FADE_SECONDS = 0.01;

export type GainPoint = {
  /** "set" = salta para o valor; "ramp" = rampa linear até o valor naquele instante. */
  readonly kind: "set" | "ramp";
  readonly value: number;
  readonly time: number;
};

/**
 * Pontos de ganho para tocar `duration` segundos a partir de `t0`. A descida TERMINA no corte
 * (t0 + duration): se começasse ali, vazariam 10 ms do trecho seguinte. O ponto "set" antes da
 * descida segura o volume em 1; sem ele, a rampa partiria do ponto anterior e duraria o trecho.
 */
export function playbackEnvelope(
  t0: number,
  duration: number,
  fade: number = FADE_SECONDS,
): GainPoint[] {
  const f = Math.min(fade, duration / 2);
  return [
    { kind: "set", value: 0, time: t0 },
    { kind: "ramp", value: 1, time: t0 + f },
    { kind: "set", value: 1, time: t0 + duration - f },
    { kind: "ramp", value: 0, time: t0 + duration },
  ];
}

/** Parada antecipada no instante `now`, partindo do volume atual. */
export function stopEnvelope(
  now: number,
  current: number,
  fade: number = FADE_SECONDS,
): { points: GainPoint[]; stopAt: number } {
  return {
    points: [
      { kind: "set", value: current, time: now },
      { kind: "ramp", value: 0, time: now + fade },
    ],
    stopAt: now + fade,
  };
}
