// O volume do jogo (P216, P219): o nível da barra, de 0 a 1, e o ganho que ele dá. O ouvido
// percebe o volume em escala, e não em linha reta: com o ganho igual ao nível, 10% ainda soa alto.
// Por isso o ganho é o quadrado do nível (10% na barra dá 1% do som).

/** O nível de quem nunca mexeu: o volume cheio, como antes da barra. */
export const DEFAULT_VOLUME = 1;

/** O passo da barra, em porcentagem. */
export const VOLUME_STEP = 5;

/** O nível entre 0 e 1. Um valor que não é número volta ao padrão. */
export function clampVolume(level: number): number {
  return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : DEFAULT_VOLUME;
}

/** O ganho do som para um nível da barra: o quadrado dele. */
export function gainOf(level: number): number {
  const v = clampVolume(level);
  return v * v;
}
