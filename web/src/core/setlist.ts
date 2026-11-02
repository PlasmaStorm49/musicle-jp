// Setlist Royale (o usuário, 01/11/2026): o 3º submodo do artista. A cada rodada, músicas do
// artista tocam emendadas, uma vez só: a seguinte entra antes de a anterior acabar, e nunca tocam
// três juntas. Depois, a pessoa marca as que tocaram entre as opções, e cada toque vale na hora;
// a rodada só passa quando ela acha todas. A run tem 3 vidas (cada opção errada gasta uma) e 10
// rodadas; na 10ª, a setlist acaba, e a
// pessoa pode continuar sem fim, na dificuldade dela. Puro: a semente e o sorteio vêm da tela, e
// os eventos trazem a rodada já sorteada (regra 5 do web). A run não é salva (P116); só o recorde
// vai ao save (`setlistBest`).

import type { CatalogIndex } from "./catalog.ts";
import { normalize } from "./normalize.ts";
import { answerAlbums, practicePool } from "./practice.ts";
import { seeded } from "./prng.ts";
import type { SetlistBest } from "./records.ts";
import type { PlayableTrack } from "./types.ts";

/** As vidas da run: cada opção errada gasta uma, e a 3ª encerra (o usuário, 01/11/2026). */
export const SETLIST_LIVES = 3;

/**
 * A curva das 10 rodadas (o usuário, 01/11/2026): as opções crescem uma por rodada, sem saltos, e
 * as 12 só aparecem na última; as músicas chegam a 8. As erradas param em 4, e daí em diante a
 * dificuldade é a memória. O sem fim repete a última.
 */
export const SETLIST_ROUNDS: readonly { readonly songs: number; readonly options: number }[] = [
  { songs: 2, options: 3 },
  { songs: 2, options: 4 },
  { songs: 3, options: 5 },
  { songs: 3, options: 6 },
  { songs: 4, options: 7 },
  { songs: 4, options: 8 },
  { songs: 5, options: 9 },
  { songs: 6, options: 10 },
  { songs: 7, options: 11 },
  { songs: 8, options: 12 },
];

/** A rodada em que a setlist acaba (a 10ª). */
export const SETLIST_FINAL = SETLIST_ROUNDS.length;

/**
 * O tempo total de uma música do meio da sequência (junto, sozinha e junto) na 1ª e na última
 * rodada: ele cai aos poucos (o usuário, 01/11/2026). Ajustáveis de ouvido.
 */
export const FIRST_SPAN = 4.5;
export const LAST_SPAN = 3;
/** Nenhuma música toca sozinha menos que isto (o usuário, 01/11/2026). */
export const MIN_SOLO = 1;
/** A rampa de entrada e de saída de cada voz. As duas tocam em volume cheio quando estão juntas. */
export const CHAIN_FADE = 0.15;
/** Na 1ª rodada, as músicas saem das mais populares; a faixa abre até o catálogo inteiro na 10ª. */
export const BAND_START = 20;
/**
 * O peso da música que acabou de tocar, nas rodadas seguintes, para tocar de novo e para virar
 * opção: 0,1 na seguinte, 0,3 na outra e 0,6 na 3ª; depois, volta ao cheio. Pouca chance logo
 * depois, e a chance volta ao normal em poucas rodadas (o usuário, 01/11/2026, jogando).
 */
export const REPEAT_WEIGHTS: readonly number[] = [0.1, 0.3, 0.6];
/**
 * A faixa mais curta que entra (em segundos): as vinhetas e as introduções de álbum, quase sempre
 * instrumentais, ficam de fora (o usuário, 01/11/2026). Nos artistas reais, 8 faixas, como o
 * "ognanje" do Eve (45 s) e o "Open α Door" da Aimer (77 s); as músicas curtas de verdade do
 * System of a Down (de 103 a 118 s) ficam.
 */
export const MIN_SONG_SEC = 80;
/**
 * A chance de o trecho sair perto do começo ou do fim da prévia, fora da região do meio: raro, mas
 * acontece (o usuário, 01/11/2026). 1 em cada 10.
 */
export const EDGE_CHANCE = 0.1;
/** A prévia da Apple tem 30 s; vale quando o catálogo não diz a duração. */
const PREVIEW_SEC = 30;
/** Folga no fim da prévia, por causa do fade dela. */
const END_MARGIN_SEC = 2;

/** Os parâmetros da rodada `number`; o sem fim fica nos da última. */
function curveOf(number: number): { readonly songs: number; readonly options: number } {
  const at = Math.min(Math.max(1, number), SETLIST_FINAL) - 1;
  return SETLIST_ROUNDS[at] ?? { songs: 0, options: 0 };
}

/**
 * O tamanho da rodada num artista de `poolSize` músicas: as opções nunca passam do total, e as
 * músicas tocadas, das opções menos 1 (sempre ao menos uma errada). Os artistas reais têm 37 ou
 * mais; os das fixtures, de 2 a 4. Sem 2 músicas, não há rodada (`songs` 0).
 */
export function roundShape(
  number: number,
  poolSize: number,
): { readonly songs: number; readonly options: number } {
  const curve = curveOf(number);
  const options = Math.min(curve.options, poolSize);
  return { songs: Math.max(0, Math.min(curve.songs, options - 1)), options };
}

/**
 * Quantas das mais populares entram na rodada: as certas e as erradas saem da mesma faixa, para a
 * pessoa não acertar só pensando "essa eu conheço, então tocou". Abre em linha reta das
 * `BAND_START` mais populares, na 1ª rodada, ao catálogo inteiro, na 10ª e no sem fim.
 */
export function bandOf(number: number, poolSize: number): number {
  const start = Math.min(poolSize, BAND_START);
  if (number >= SETLIST_FINAL) return poolSize;
  const t = (Math.max(1, number) - 1) / (SETLIST_FINAL - 1);
  return Math.round(start + (poolSize - start) * t);
}

/**
 * O tempo de uma música do meio na rodada `number`: o total, o junto (com a anterior e com a
 * seguinte) e o sozinha. Os três encolhem juntos, mas o sozinha nunca fica abaixo de `MIN_SOLO`.
 */
export function chainParts(number: number): {
  readonly span: number;
  readonly solo: number;
  readonly together: number;
} {
  const t = (Math.min(Math.max(1, number), SETLIST_FINAL) - 1) / (SETLIST_FINAL - 1);
  const span = FIRST_SPAN + (LAST_SPAN - FIRST_SPAN) * t;
  const solo = Math.max(MIN_SOLO, span / 3);
  return { span, solo, together: (span - solo) / 2 };
}

/** Uma voz da sequência: quando entra (do começo dela) e quanto toca, em segundos. */
export type ChainSlot = { readonly at: number; readonly seconds: number };

/**
 * A linha do tempo de `count` músicas na rodada `number`. A do meio toca junto, sozinha e junto;
 * a 1ª e a última têm um junto só, para todas ficarem sozinhas o mesmo tempo. A seguinte entra
 * quando a anterior acaba o sozinha dela: nunca tocam três juntas.
 */
export function chainTimeline(count: number, number: number): ChainSlot[] {
  const { solo, together } = chainParts(number);
  const step = solo + together;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const at = i === 0 ? 0 : solo + (i - 1) * step;
    const sides = (i > 0 ? 1 : 0) + (i < count - 1 ? 1 : 0);
    return { at, seconds: solo + sides * together };
  });
}

/** Quanto dura a sequência inteira. */
export function chainLength(timeline: readonly ChainSlot[]): number {
  return Math.max(0, ...timeline.map((slot) => slot.at + slot.seconds));
}

/** As vozes que tocam no instante `t` (as casas acesas na tela). */
export function activeSlots(timeline: readonly ChainSlot[], t: number): number[] {
  return timeline.flatMap((slot, i) => (t >= slot.at && t < slot.at + slot.seconds ? [i] : []));
}

const byPopularity = (a: PlayableTrack, b: PlayableTrack) =>
  a.popularity !== b.popularity ? b.popularity - a.popularity : a.id < b.id ? -1 : 1;

/**
 * As músicas da run, da mais popular para a menos: uma faixa por música (o saco do Desafio), com
 * prévia e com ao menos `MIN_SONG_SEC` (sem as vinhetas instrumentais), sem as que entregariam um
 * diário de hoje (P141), nem nas opções erradas, porque o
 * título na tela já entregaria a resposta. Duas com o mesmo título (normalizado) ficam só na
 * mais popular: as opções nunca repetem um nome.
 */
export function setlistPool(index: CatalogIndex, excluded: ReadonlySet<string>): string[] {
  const blocked = answerAlbums(index, excluded);
  const tracks = practicePool(index, "song")
    .flatMap((id) => {
      const track = index.tracks.get(id);
      return track ? [track] : [];
    })
    .filter((t) => t.preview && !excluded.has(t.songKey) && !blocked.has(t.albumId))
    .filter((t) => !t.durationMs || t.durationMs >= MIN_SONG_SEC * 1000)
    .sort(byPopularity);
  const titles = new Set<string>();
  const pool: string[] = [];
  for (const track of tracks) {
    const title = normalize(track.title);
    if (titles.has(title)) continue;
    titles.add(title);
    pool.push(track.id);
  }
  return pool;
}

/** Uma rodada sorteada: as que tocam, na ordem, e as opções, embaralhadas (com as que tocam). */
export type SetlistRound = {
  readonly number: number;
  /** Quantas vezes a rodada foi sorteada de novo (a interrompida, D7 do plano). */
  readonly attempt: number;
  readonly played: readonly string[];
  readonly options: readonly string[];
};

/** A última rodada em que cada música tocou (o peso dela nas seguintes). */
export type SetlistPlays = Readonly<Record<string, number>>;

function weightOf(id: string, number: number, plays: SetlistPlays): number {
  const last = plays[id];
  if (last === undefined || last >= number) return 1;
  return REPEAT_WEIGHTS[number - last - 1] ?? 1;
}

/**
 * Sorteia a rodada `number` (de novo, com `attempt` maior): as que tocam e as erradas, entre as
 * da faixa, pelo peso de cada uma: a que acabou de tocar quase não volta, nem como opção
 * (`REPEAT_WEIGHTS`). A rodada sorteada de novo (a interrompida, D7 do plano)
 * deixa de fora as músicas da cortada (`avoid`), que a pessoa pode ter ouvido: nem tocam nem viram
 * opção, se a faixa tiver outras que bastem. Null: o artista não tem 2 músicas.
 */
export function drawSetlistRound(
  pool: readonly string[],
  number: number,
  plays: SetlistPlays,
  seed: number,
  attempt = 0,
  avoid: readonly string[] = [],
): SetlistRound | null {
  const shape = roundShape(number, pool.length);
  if (shape.songs < 1) return null;
  const band = pool.slice(0, Math.max(bandOf(number, pool.length), shape.options));
  const fresh = band.filter((id) => !avoid.includes(id));
  const rng = seeded(`setlist|${seed}|${number}|${attempt}`);
  const left = fresh.length >= shape.options ? fresh : [...band];
  // Uma por vez, pelo peso de cada uma: primeiro as que tocam, depois as erradas.
  const take = () => {
    const weights = left.map((id) => weightOf(id, number, plays));
    let ticket = rng.random() * weights.reduce((sum, w) => sum + w, 0);
    let at = weights.findIndex((w) => {
      ticket -= w;
      return ticket < 0;
    });
    if (at < 0) at = left.length - 1; // o arredondamento na ponta
    return left.splice(at, 1);
  };
  const played = Array.from({ length: shape.songs }, take).flat();
  const wrong = Array.from({ length: shape.options - shape.songs }, take).flat();
  const options = [...played, ...wrong];
  rng.shuffle(options);
  return { number, attempt, played, options };
}

/**
 * Onde o trecho de `seconds` começa na prévia (o usuário, 01/11/2026). As posições vão do 0 à
 * última que ainda deixa o trecho inteiro antes da folga do fim. Quase sempre o começo sai, com
 * chance igual, da metade do meio delas, onde a voz quase sempre está (a introdução e o fim da
 * prévia são mais vezes instrumentais); de vez em quando (`EDGE_CHANCE`), de um dos quartos das
 * pontas. Nunca um ponto fixo: a pessoa tem de lembrar da música, e não de um trecho decorado. Em
 * passos de 0,25 s. O motor ainda anda até um trecho com som (core/silence.ts).
 */
export function setlistOffset(
  seed: number,
  round: SetlistRound,
  id: string,
  previewSec: number | null,
  seconds: number,
): number {
  const last = (previewSec ?? PREVIEW_SEC) - seconds - END_MARGIN_SEC;
  if (last <= 0) return 0;
  const rng = seeded(`setlist|${seed}|${round.number}|${round.attempt}|${id}`);
  const edge = rng.random() < EDGE_CHANCE;
  const u = rng.random();
  // O meio: de 1/4 a 3/4 das posições. As pontas: o 1º quarto ou o último, metade da chance cada.
  const at = !edge
    ? last / 4 + (u * last) / 2
    : u < 0.5
      ? (u * 2 * last) / 4
      : (3 * last) / 4 + ((u - 0.5) * 2 * last) / 4;
  return Math.round(at * 4) / 4;
}

/**
 * As fases: ouvir (o Tocar, uma vez só), escolher (os toques), revelar (a ordem que tocou),
 * completa (a 10ª passou, com o sem fim à escolha) e o fim.
 */
export type SetlistPhase = "listen" | "pick" | "reveal" | "complete" | "over";

/** Por que a run acabou: as vidas acabaram, a pessoa encerrou ou não há músicas para sortear. */
export type SetlistEnd = "errors" | "quit" | "empty";

export type SetlistRun = {
  readonly seed: number;
  /** A rodada em jogo (ou a última); null só na run sem músicas. */
  readonly round: SetlistRound | null;
  readonly phase: SetlistPhase;
  /** A sequência já começou a tocar: o Tocar não volta (uma vez só). */
  readonly started: boolean;
  /** Os toques da rodada, na ordem: os certos e os errados. */
  readonly picks: readonly string[];
  readonly lives: number;
  /** Rodadas completas: todas as músicas achadas com vida. */
  readonly cleared: number;
  /** Músicas achadas na run. */
  readonly found: number;
  readonly plays: SetlistPlays;
  /** A pessoa escolheu continuar depois da 10ª. */
  readonly endless: boolean;
  readonly end: SetlistEnd | null;
};

export type SetlistEvent =
  | { readonly type: "PLAYED" }
  | { readonly type: "HEARD" }
  | { readonly type: "VOID"; readonly round: SetlistRound }
  | { readonly type: "PICK"; readonly id: string }
  | { readonly type: "NEXT"; readonly round: SetlistRound | null }
  | { readonly type: "CONTINUE"; readonly round: SetlistRound | null }
  | { readonly type: "QUIT" };

/** A run começa na 1ª rodada; sem músicas, já acaba. */
export function startSetlist(seed: number, pool: readonly string[]): SetlistRun {
  const round = drawSetlistRound(pool, 1, {}, seed);
  return {
    seed,
    round,
    phase: round ? "listen" : "over",
    started: false,
    picks: [],
    lives: SETLIST_LIVES,
    cleared: 0,
    found: 0,
    plays: {},
    endless: false,
    end: round ? null : "empty",
  };
}

/** As músicas da rodada que ainda faltam achar. */
export function leftToFind(run: SetlistRun): number {
  const played = run.round?.played ?? [];
  return played.filter((id) => !run.picks.includes(id)).length;
}

/** A rodada que vem depois da atual (o número; o sorteio é da tela). */
export function nextNumber(run: SetlistRun): number {
  return (run.round?.number ?? 0) + 1;
}

/** Entra na rodada sorteada, se ela for a de número `number`; senão, a run acaba sem músicas. */
function enter(run: SetlistRun, round: SetlistRound | null, endless: boolean): SetlistRun {
  if (!round) return { ...run, phase: "over", end: "empty", endless };
  return { ...run, round, phase: "listen", started: false, picks: [], endless };
}

/** Aplica um evento à run. O inválido devolve o mesmo objeto (regra 5 do web). */
export function setlistStep(run: SetlistRun, event: SetlistEvent): SetlistRun {
  const round = run.round;
  if (run.phase === "over" || !round) return run;
  switch (event.type) {
    case "PLAYED":
      return run.phase === "listen" && !run.started ? { ...run, started: true } : run;
    case "HEARD": {
      if (run.phase !== "listen" || !run.started) return run;
      const plays = { ...run.plays };
      for (const id of round.played) plays[id] = round.number;
      return { ...run, phase: "pick", plays };
    }
    case "VOID":
      // A sequência interrompida (aba oculta, falha de áudio, a pessoa saiu da aba): a rodada
      // é sorteada de novo, com outras músicas e sem custo. Ouvir as mesmas seria ouvir duas vezes.
      if (run.phase !== "listen" || event.round.number !== round.number) return run;
      return { ...run, round: event.round, started: false, picks: [] };
    case "PICK": {
      // Errar não encerra a rodada: a pessoa segue tocando, cada erro gasta uma vida, e a rodada
      // só passa quando ela acha todas (o usuário, 01/11/2026, jogando).
      if (run.phase !== "pick") return run;
      if (!round.options.includes(event.id) || run.picks.includes(event.id)) return run;
      const right = round.played.includes(event.id);
      const lives = right ? run.lives : run.lives - 1;
      const picks = [...run.picks, event.id];
      const found = run.found + (right ? 1 : 0);
      if (lives === 0) return { ...run, picks, lives, found, phase: "reveal", end: "errors" };
      const after = { ...run, picks, lives, found };
      return leftToFind(after) === 0
        ? { ...after, phase: "reveal", cleared: run.cleared + 1 }
        : after;
    }
    case "NEXT":
      if (run.phase !== "reveal") return run;
      if (run.end) return { ...run, phase: "over" };
      if (round.number === SETLIST_FINAL && !run.endless) return { ...run, phase: "complete" };
      if (event.round && event.round.number !== round.number + 1) return run;
      return enter(run, event.round, run.endless);
    case "CONTINUE":
      if (run.phase !== "complete") return run;
      if (event.round && event.round.number !== round.number + 1) return run;
      return enter(run, event.round, true);
    case "QUIT":
      // Na setlist completa não há o que encerrar, e a run que perdeu as vidas já acabou.
      return run.phase === "complete" || run.end ? run : { ...run, phase: "over", end: "quit" };
  }
}

/**
 * O recorde que a run deixa: as rodadas completas e as músicas achadas. Vale no fim e na setlist
 * completa (a pessoa pode sair dali sem continuar). Com a run em jogo, ou na run sem músicas, null.
 */
export function setlistBest(run: SetlistRun): SetlistBest | null {
  if (run.end === null && run.phase !== "complete") return null;
  // A run vazia só não deixa recorde se não fez nada (a do artista sem músicas).
  if (run.end === "empty" && run.cleared === 0 && run.found === 0) return null;
  return { rounds: run.cleared, found: run.found };
}

/** O que a run passou do recorde de antes dela. Sem recorde antes, nada: não havia o que bater. */
export function beatenSetlist(
  before: SetlistBest | null,
  run: SetlistBest | null,
): { readonly rounds: boolean; readonly found: boolean } {
  if (!before || !run) return { rounds: false, found: false };
  return { rounds: run.rounds > before.rounds, found: run.found > before.found };
}
