// O sorteio do laboratório das Misturadas (M17): as músicas de uma mistura. Não é o da agenda
// (esse vai ser do pipeline, com semente): aqui vale o Math.random, para ouvir várias seguidas.
import type { AnimeDifficulty, AnimeMode } from "../core/daily.ts";

/** Os dois modos e as três faixas do Anime (core/daily.ts): um modo novo lá aparece aqui. */
export type LabMode = AnimeMode;
export type LabTier = AnimeDifficulty;

/** Uma música do acervo do Anime, com o que a régua precisa. */
export type LabSong = {
  readonly trackId: string;
  readonly songKey: string;
  readonly franchises: readonly string[];
  /** A chance de acertar em cada modo (o anime-chances do pipeline); null sem o arquivo. */
  readonly chance: Readonly<Record<LabMode, number>> | null;
  readonly tiers: Readonly<Record<LabMode, LabTier | null>>;
  /** A duração da prévia, em segundos (a do catálogo; a Apple dá uns 30). */
  readonly previewSeconds: number;
};

/**
 * A régua de uma rodada: a chance mínima, dentro do Fácil do modo (como a faixa "muito conhecida"
 * que o diário vai publicar), ou as faixas publicadas (o Médio para cima da rodada 3, ou a reserva
 * sem o arquivo da chance).
 */
export type Ruler =
  | { readonly kind: "chance"; readonly min: number }
  | { readonly kind: "tiers"; readonly tiers: readonly LabTier[] };

/** As músicas que passam na régua, no modo. */
export function poolOf(songs: readonly LabSong[], mode: LabMode, ruler: Ruler): LabSong[] {
  return songs.filter((song) => {
    const tier = song.tiers[mode];
    if (ruler.kind === "tiers") return tier !== null && ruler.tiers.includes(tier);
    return tier === "facil" && (song.chance?.[mode] ?? -1) >= ruler.min;
  });
}

/**
 * `count` músicas do acervo, com músicas e franquias diferentes (duas da mesma franquia fariam um
 * palpite servir às duas); null se o acervo não dá.
 */
export function pickMix(
  pool: readonly LabSong[],
  count: number,
  random: () => number = Math.random,
): LabSong[] | null {
  const left = [...pool];
  const chosen: LabSong[] = [];
  const songs = new Set<string>();
  const franchises = new Set<string>();
  while (chosen.length < count && left.length > 0) {
    const [song] = left.splice(Math.floor(random() * left.length), 1);
    if (!song || songs.has(song.songKey) || song.franchises.some((f) => franchises.has(f)))
      continue;
    chosen.push(song);
    songs.add(song.songKey);
    for (const f of song.franchises) franchises.add(f);
  }
  return chosen.length === count ? chosen : null;
}

/** O lado de cada música ao separar: o mesmo do diário (core/mix.ts). */
export { spreadPans } from "../core/mix.ts";

/**
 * De onde cada música começa: todas do começo da prévia, ou cada uma num ponto diferente, até
 * 12 s, deixando tocar o trecho inteiro dentro da prévia dela.
 */
export function startOffsets(
  songs: readonly Pick<LabSong, "previewSeconds">[],
  seconds: number,
  spread: boolean,
  random: () => number = Math.random,
): number[] {
  return songs.map((song) => {
    const room = Math.max(0, Math.min(12, song.previewSeconds - seconds));
    return spread ? Math.round(random() * room) : 0;
  });
}
