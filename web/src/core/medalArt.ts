// O que o desenho das medalhas do Superfan sabe de cada artista (M16, P296, P299): a capa das 3,
// o enquadramento, as cores do buquê, a faixa e os nomes, do `medals` do índice dos artistas. O
// `loadArtistList` não confere as entradas, então tudo aqui confere o que lê: um índice velho (no
// cache do Pages) ou corrompido cai no padrão, e a tela nunca quebra. Puro, como o resto do core;
// a geometria do enquadramento e da faixa também fica aqui, para ser testada no Node.
import { APPLE_PROVIDER, isAppleUrl } from "./apple.ts";
import { cardArtwork, monogram } from "./artists.ts";
import { isRecord } from "./guards.ts";
import type { SuperfanLevel } from "./medals.ts";
import type { ArtistList, ArtistListEntry } from "./types.ts";

type MedalData = ArtistListEntry["medals"];
type FlowerKey = keyof NonNullable<MedalData["flowers"]>;

/** Os papéis das cores do buquê, na ordem do schema (e do `FLOWER_ROLES` do pipeline). */
export const FLOWER_ROLES = [
  "d",
  "m",
  "ml",
  "l",
  "w",
  "line",
  "core",
  "ink",
  "bow",
  "ring",
  "spark",
  "leaf1",
  "leaf2",
] as const satisfies readonly FlowerKey[];
export type FlowerRole = (typeof FLOWER_ROLES)[number];
/** Uma chave do schema fora da lista acima quebra a compilação aqui. */
type AssertNever<T extends never> = T;
export type FlowerRolesAreComplete = AssertNever<Exclude<FlowerKey, FlowerRole>>;
export type LevelsAreTheSchemaNames = AssertNever<
  | Exclude<keyof MedalData["names"], SuperfanLevel>
  | Exclude<SuperfanLevel, keyof MedalData["names"]>
>;

export type Flowers = Readonly<Record<FlowerRole, string>>;
/** O zoom (de 1 a 4) e o ponto da capa (de 0 a 1) que fica no centro do círculo. */
export type Crop = { readonly z: number; readonly x: number; readonly y: number };
/** O texto da faixa da perfeita e se ele vai deitado, ao longo dela (P299). */
export type Sash = { readonly text: string; readonly along: boolean };

/** A capa inteira, centrada: o enquadramento de quem não escolheu nenhum. */
export const CENTER: Crop = { z: 1, x: 0.5, y: 0.5 };

/** O desenho de um artista: o mesmo nas 3 medalhas (P296), com as flores só na perfeita. */
export type SuperfanArt = {
  /** A capa, ainda sem o `resolveUrl`; null é o monograma. */
  readonly image: string | null;
  readonly crop: Crop;
  /** As cores do buquê; null é a paleta lilás de sempre. */
  readonly flowers: Flowers | null;
  /** A faixa escolhida; null segue a regra da P299 com o nome. */
  readonly sash: Sash | null;
  readonly letter: string;
  readonly color: number;
  /** O nome do artista, para a faixa sem escolha. */
  readonly name: string;
};

const COLOR = /^#[0-9a-f]{6}$/;
const SIZED = /\/300x300bb\.([a-z]+)$/;

/**
 * A capa no tamanho do zoom: a mzstatic serve o tamanho pelo endereço, e a do catálogo é de 300 px.
 * Com zoom de 1,5 ou mais, a de 1000 (o usuário pediu "sem deixar a resolução ruim"); senão, a de
 * 600. Um endereço de outro formato (o das fixtures) fica igual.
 */
export function sizedArtwork(url: string, z: number): string {
  const px = z >= 1.5 ? 1000 : 600;
  return url.replace(SIZED, `/${px}x${px}bb.$1`);
}

const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function cropOf(value: unknown): Crop | null {
  if (!isRecord(value)) return null;
  const { z, x, y } = value;
  return inRange(z, 1, 4) && inRange(x, 0, 1) && inRange(y, 0, 1) ? { z, x, y } : null;
}

function flowersOf(value: unknown): Flowers | null {
  if (!isRecord(value)) return null;
  const out: Partial<Record<FlowerRole, string>> = {};
  for (const role of FLOWER_ROLES) {
    const color = value[role];
    if (typeof color !== "string" || !COLOR.test(color)) return null;
    out[role] = color;
  }
  return out as Flowers;
}

function sashOf(value: unknown): Sash | null {
  if (!isRecord(value) || typeof value.text !== "string" || !value.text.trim()) return null;
  return { text: value.text.trim(), along: value.along === true };
}

/**
 * O desenho do artista nas medalhas. A capa é a da medalha (a de um álbum escolhido, no tamanho do
 * zoom, e só no host da Apple na lista real, regra 22); sem ela, a do cartão, inteira; sem
 * nenhuma, o monograma.
 */
export function superfanArt(list: ArtistList, entry: ArtistListEntry): SuperfanArt {
  const medals: unknown = entry.medals;
  const m = isRecord(medals) ? medals : {};
  const crop = cropOf(m.crop) ?? CENTER;
  const own =
    typeof m.artworkUrl === "string" && m.artworkUrl ? sizedArtwork(m.artworkUrl, crop.z) : null;
  const image =
    own && (list.provider !== APPLE_PROVIDER || isAppleUrl("artwork", own)) ? own : null;
  const { letter, color } = monogram(entry);
  return {
    image: image ?? cardArtwork(list, entry),
    crop: image ? crop : CENTER,
    flowers: flowersOf(m.flowers),
    sash: sashOf(m.sash),
    letter,
    color,
    name: typeof entry.name === "string" ? entry.name : "",
  };
}

/** O nome de uma medalha, com o latino ao lado (P295); o da perfeita vai sem ele. */
export type MedalName = { readonly name: string; readonly latin: string | null };

/** O nome próprio da medalha (P300); null quando falta (um índice corrompido, P301). */
export function medalName(entry: ArtistListEntry, level: SuperfanLevel): MedalName | null {
  const medals: unknown = entry.medals;
  const names = isRecord(medals) ? medals.names : null;
  const n = isRecord(names) ? names[level] : null;
  if (!isRecord(n) || typeof n.name !== "string" || !n.name.trim()) return null;
  const latin =
    level !== "perfeito" && typeof n.latin === "string" && n.latin.trim() ? n.latin.trim() : null;
  return { name: n.name.trim(), latin };
}

/**
 * A capa no círculo de raio `R` em volta de (cx, cy): o quadrado de lado `2·R·z`, com o ponto
 * escolhido no centro, preso para que a capa cubra o círculo inteiro (nenhum canto vazio).
 */
export function coverFrame(
  cx: number,
  cy: number,
  R: number,
  crop: Crop,
): { readonly x: number; readonly y: number; readonly size: number } {
  const size = 2 * R * crop.z;
  const clamp = (v: number, c: number) => Math.min(c - R, Math.max(c + R - size, v));
  return { x: clamp(cx - crop.x * size, cx), y: clamp(cy - crop.y * size, cy), size };
}

/** Até quantos caracteres cabem na faixa em pé, um por linha. */
export const SASH_UPRIGHT = 6;
/** Até quantos cabem deitados, no corpo mínimo (2); a mais longa vira a letra do monograma. */
export const SASH_ALONG = 28;
const LATIN = /^[\x20-\x7e]+$/;
/** O meio da faixa (de y 92 a 140, com o laço cobrindo o começo), no desenho da perfeita. */
const SASH_MIDDLE = 116;

/** Como o texto vai na faixa: em pé, um caractere por linha, ou deitado ao longo dela. */
export type SashLayout =
  | {
      readonly kind: "up";
      readonly chars: readonly { readonly ch: string; readonly y: number }[];
      readonly size: number;
    }
  | { readonly kind: "along"; readonly text: string; readonly size: number };

function upright(chars: readonly string[]): SashLayout {
  const step = chars.length > 5 ? 8.2 : 9.5;
  const size = chars.length > 5 ? 7 : 7.5;
  return {
    kind: "up",
    size,
    chars: chars.map((ch, i) => ({
      ch,
      y: SASH_MIDDLE + (i - (chars.length - 1) / 2) * step + size * 0.36,
    })),
  };
}

/** O espaço entre as letras da faixa deitada (no desenho de 110 de largura). */
export const SASH_SPACING = 0.3;
/** O comprimento que cabe na faixa deitada, de y 94 a 138. */
const SASH_LENGTH = 44;

function along(text: string): SashLayout {
  // A largura é a das letras (0,64 do corpo cada) mais o espaço entre elas.
  const n = text.length;
  const fit = (SASH_LENGTH - SASH_SPACING * (n - 1)) / (n * 0.64);
  return { kind: "along", text, size: Math.max(2, Math.min(7.6, fit)) };
}

/**
 * A faixa da perfeita (P299). A escolhida vai como foi escolhida (a em pé com mais de 6 caracteres,
 * que o pipeline recusa, cai na letra). Sem escolha: o nome em pé, sem os espaços, até 6
 * caracteres; o latino mais longo, deitado; o resto, a letra do monograma.
 */
export function sashLayout(sash: Sash | null, name: string, letter: string): SashLayout {
  if (sash?.along) return sash.text.length <= SASH_ALONG ? along(sash.text) : upright([letter]);
  if (sash) {
    const chars = Array.from(sash.text);
    return upright(chars.length <= SASH_UPRIGHT ? chars : [letter]);
  }
  const chars = Array.from(name.trim().replace(/\s+/g, ""));
  if (chars.length > 0 && chars.length <= SASH_UPRIGHT) return upright(chars);
  const latin = name.trim();
  if (chars.length > 0 && LATIN.test(latin) && latin.length <= SASH_ALONG) return along(latin);
  return upright([letter]);
}
