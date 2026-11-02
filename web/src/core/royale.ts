// O Anime Royale (o usuário, 01/11/2026): por dia, 3 dificuldades separadas no menu, cada uma uma
// rodada em que 5 trechos de 8 s tocam em sequência e a pessoa marca, entre 9 capas de anime, as
// 5 que tocaram. Cada marcação vale na hora, e o 1º erro encerra a dificuldade (uma vida). O
// diário, a partida, o reducer, o trecho de cada música e o que vai para o save. Puro, como o das
// Misturadas (regra 5 do web): o evento inválido devolve o mesmo objeto, e nada é sorteado aqui
// (o trecho sai da semente do dia, igual para todos).
import type { CatalogIndex } from "./catalog.ts";
import type { CoverPaths } from "./covers.ts";
import { ANIME_DIFFICULTIES, type AnimeDifficulty } from "./daily.ts";
import type { DailyStatus } from "./home.ts";
import { seeded } from "./prng.ts";
import { type PuzzleId, puzzleId, type Save } from "./records.ts";
import type { RoyaleDay, TrackId } from "./types.ts";

/** As 3 dificuldades, as do Anime (a faixa do acertar o anime). */
export const ROYALE_TIERS: readonly AnimeDifficulty[] = ANIME_DIFFICULTIES;

/** Uma dificuldade do Royale sem a data: "anime-royale-<dificuldade>". É também a rota dela. */
export type RoyaleKey = `anime-royale-${AnimeDifficulty}`;

export function royaleKey(tier: AnimeDifficulty): RoyaleKey {
  return `anime-royale-${tier}`;
}

/** As 3 dificuldades, na ordem. */
export const ROYALE_KEYS: readonly RoyaleKey[] = ROYALE_TIERS.map(royaleKey);

/** Os ids no save das 3 dificuldades de um dia. */
export function royaleIds(date: string): PuzzleId[] {
  return ROYALE_KEYS.map((key) => puzzleId(date, key));
}

/** As músicas que tocam e as capas da grade (o usuário, 01/11/2026; a agenda diz o mesmo). */
export const ROYALE_PLAYED = 5;
export const ROYALE_OPTIONS = 9;
/** O trecho de cada música e a pausa entre dois trechos, em segundos. */
export const ROYALE_SAMPLE_SEC = 8;
export const ROYALE_GAP_SEC = 0.7;
/**
 * A chance de o trecho começar entre o meio e o fim da prévia, para fugir do instrumental (o
 * usuário, 01/11/2026: preferência, nunca garantia). No resto, entre o começo e o meio.
 */
export const ROYALE_MIDDLE_CHANCE = 0.75;
/** A prévia da Apple tem 30 s; vale quando o catálogo não diz a duração. */
const PREVIEW_SEC = 30;
/** Folga no fim da prévia, por causa do fade dela. */
const END_MARGIN_SEC = 2;

/** Uma dificuldade do Royale num dia: a agenda diz as músicas, e o descritor, o resto. */
export type RoyaleDaily = {
  readonly key: RoyaleKey;
  /** O id do jogo no save: "<data>|anime-royale-<dificuldade>". */
  readonly id: PuzzleId;
  /** A data do jogo (não o relógio). */
  readonly date: string;
  /** O número do dia na agenda do Royale (o registro do save o guarda). */
  readonly number: number;
  readonly tier: AnimeDifficulty;
  /** As 5 que tocam, na ordem em que tocam. */
  readonly played: readonly TrackId[];
  /** As 9 capas, na ordem da grade. */
  readonly options: readonly TrackId[];
};

export function royaleDaily(day: RoyaleDay, date: string, tier: AnimeDifficulty): RoyaleDaily {
  const key = royaleKey(tier);
  const round = day[tier];
  return {
    key,
    id: puzzleId(date, key),
    date,
    number: day.number,
    tier,
    played: round.played,
    options: round.options,
  };
}

/** As 3 dificuldades do dia, na ordem; nenhuma sem o dia na agenda. */
export function royaleDailies(day: RoyaleDay | null, date: string): RoyaleDaily[] {
  return day ? ROYALE_TIERS.map((tier) => royaleDaily(day, date, tier)) : [];
}

/**
 * Onde o trecho de 8 s da música `id` começa na prévia, em segundos do 1º som: sorteado pela
 * semente do dia, da dificuldade e da faixa, igual para todos. Com chance `ROYALE_MIDDLE_CHANCE`,
 * entre o meio e o fim da área livre (a prévia menos o trecho e a folga do fade); senão, entre o
 * começo e o meio.
 */
export function royaleOffset(daily: RoyaleDaily, id: TrackId, previewSec: number | null): number {
  const last = Math.floor((previewSec ?? PREVIEW_SEC) - ROYALE_SAMPLE_SEC - END_MARGIN_SEC);
  if (last <= 0) return 0;
  const rng = seeded(`musicle-jp|anime-royale|${daily.date}|${daily.tier}|${id}`);
  const middle = Math.ceil(last / 2);
  return rng.random() < ROYALE_MIDDLE_CHANCE
    ? middle + rng.randint(last - middle + 1)
    : rng.randint(middle);
}

/** Uma capa da grade: o 1º tema da música (o que o pop-up mostra), sem o nome nem o artista. */
export type RoyaleOption = {
  readonly id: TrackId;
  /** O nome do anime, com a temporada (o do AnimeThemes). */
  readonly anime: string;
  readonly cover: CoverPaths | null;
  readonly type: "OP" | "ED" | "IN";
  /** A ordem do tema ("2ª abertura"); null sem número. */
  readonly sequence: number | null;
};

/** A capa da música `id`, ou null fora do Anime. */
export function royaleOption(index: CatalogIndex, id: TrackId): RoyaleOption | null {
  const theme = index.anime?.themesByTrack.get(id)?.[0];
  if (!theme) return null;
  return { id, anime: theme.anime, cover: theme.cover, type: theme.type, sequence: theme.sequence };
}

// ---- a partida ----

/** Marcar uma capa (o "Marcar" do pop-up) ou desistir da dificuldade. */
export type RoyaleEvent =
  | { readonly type: "PICK"; readonly id: TrackId }
  | { readonly type: "QUIT" };

export type RoyaleState = {
  readonly played: readonly TrackId[];
  readonly options: readonly TrackId[];
  /** As capas marcadas, na ordem. */
  readonly picks: readonly TrackId[];
  readonly quit: boolean;
};

export function createRoyaleGame(daily: RoyaleDaily): RoyaleState {
  return { played: daily.played, options: daily.options, picks: [], quit: false };
}

/** Se a capa marcada é de uma música que tocou. */
export function isRight(state: RoyaleState, id: TrackId): boolean {
  return state.played.includes(id);
}

/** Quantas das que tocaram a pessoa achou. */
export function royaleFound(state: RoyaleState): number {
  return state.picks.filter((id) => isRight(state, id)).length;
}

/** Terminou: achou as 5, errou uma (a vida acabou) ou desistiu. */
export function isRoyaleFinished(state: RoyaleState): boolean {
  if (state.quit) return true;
  return (
    state.picks.some((id) => !isRight(state, id)) || royaleFound(state) === state.played.length
  );
}

/** Aplica um evento. O inválido devolve o mesmo objeto (regra 5 do web). */
export function royaleReducer(state: RoyaleState, event: RoyaleEvent): RoyaleState {
  if (isRoyaleFinished(state)) return state;
  switch (event.type) {
    case "PICK":
      if (!state.options.includes(event.id) || state.picks.includes(event.id)) return state;
      return { ...state, picks: [...state.picks, event.id] };
    case "QUIT":
      return { ...state, quit: true };
  }
}

// ---- o save ----

/**
 * Uma dificuldade terminada, sem ids de faixa: as posições das que tocaram que a pessoa achou (de
 * 0 a 4, na ordem da agenda), na ordem em que achou, e como acabou. O resultado mostra cada uma
 * das 5 com a marca, e o cartão e o compartilhar saem só daqui.
 */
export type RoyaleGame = {
  readonly number: number;
  readonly found: readonly number[];
  /** Uma capa errada encerrou a dificuldade (a vida acabou). */
  readonly wrong?: true;
  /** A pessoa desistiu antes do fim. */
  readonly quit?: true;
};

/** O andamento: só os eventos aceitos (a retomada repete todos no reducer, como nos diários). */
export type RoyaleProgress = { readonly events: readonly RoyaleEvent[] };

/**
 * O Royale no save (v17), à parte do `history` dos diários, como as Misturadas: as estatísticas e
 * a sequência do topo não o veem.
 */
export type RoyaleSave = {
  readonly finished: Readonly<Record<PuzzleId, RoyaleGame>>;
  readonly progress: Readonly<Record<PuzzleId, RoyaleProgress>>;
};

export const EMPTY_ROYALE: RoyaleSave = { finished: {}, progress: {} };

/** Os acertos (nada derivado é gravado: sai das achadas). */
export function royaleScore(game: RoyaleGame): number {
  return game.found.length;
}

/** A dificuldade terminada, no formato do save. */
export function toRoyaleGame(state: RoyaleState, number: number): RoyaleGame {
  if (!isRoyaleFinished(state)) throw new Error("toRoyaleGame recebeu um jogo em andamento");
  const found = state.picks.filter((id) => isRight(state, id));
  return {
    number,
    found: found.map((id) => state.played.indexOf(id)),
    ...(found.length < state.picks.length ? { wrong: true } : {}),
    ...(state.quit ? { quit: true } : {}),
  };
}

export type RoyaleSession =
  | { readonly kind: "finished"; readonly game: RoyaleGame }
  | {
      readonly kind: "playing";
      readonly state: RoyaleState;
      readonly events: readonly RoyaleEvent[];
      /** A repetição descartou eventos salvos: a lista salva precisa ser trocada. */
      readonly stale: boolean;
    };

/** Como a dificuldade começa: já terminada, retomada pelos eventos salvos, ou nova. */
export function startRoyaleSession(save: Save, daily: RoyaleDaily): RoyaleSession {
  const done = save.royale.finished[daily.id];
  if (done) return { kind: "finished", game: done };
  const saved = save.royale.progress[daily.id];
  let state = createRoyaleGame(daily);
  const events: RoyaleEvent[] = [];
  for (const event of saved?.events ?? []) {
    const next = royaleReducer(state, event);
    if (next !== state) {
      events.push(event);
      state = next;
    }
  }
  // Salvou o último evento mas não chegou a gravar o terminado: o jogo já acabou.
  if (isRoyaleFinished(state) && events.length > 0) {
    return { kind: "finished", game: toRoyaleGame(state, daily.number) };
  }
  return { kind: "playing", state, events, stale: events.length < (saved?.events.length ?? 0) };
}

/** Troca o andamento salvo pela lista dada, mesmo mais curta. Dia terminado não muda. */
export function replaceRoyaleProgress(save: Save, id: PuzzleId, progress: RoyaleProgress): Save {
  if (save.royale.finished[id]) return save;
  return {
    ...save,
    royale: { ...save.royale, progress: { ...save.royale.progress, [id]: progress } },
  };
}

/** Grava o andamento. Se outra aba foi mais longe ou já terminou este jogo, ela vence. */
export function withRoyaleProgress(save: Save, id: PuzzleId, progress: RoyaleProgress): Save {
  const current = save.royale.progress[id];
  if (current && current.events.length > progress.events.length) return save;
  return replaceRoyaleProgress(save, id, progress);
}

/** Grava o jogo terminado e limpa o andamento. O primeiro término vence (duas abas). */
export function withRoyaleFinished(save: Save, id: PuzzleId, game: RoyaleGame): Save {
  const { finished, progress } = save.royale;
  if (finished[id] && !progress[id]) return save; // já gravado: nada a fazer
  const { [id]: _done, ...rest } = progress;
  return {
    ...save,
    royale: { finished: finished[id] ? finished : { ...finished, [id]: game }, progress: rest },
  };
}

/** O estado de uma dificuldade no cartão dela: fora da agenda, nova, em andamento ou terminada. */
export function royaleStatusOf(save: Save, daily: RoyaleDaily | null): DailyStatus {
  if (!daily) return { kind: "unavailable" };
  const finished = save.royale.finished[daily.id];
  if (finished) {
    return {
      kind: "done",
      number: daily.number,
      score: royaleScore(finished),
      max: ROYALE_PLAYED,
      late: false,
    };
  }
  if (save.royale.progress[daily.id]?.events.length) {
    return { kind: "playing", number: daily.number };
  }
  return { kind: "new", number: daily.number };
}

/** O andamento das 3 de um dia, só pelo save: a Início não carrega a agenda do Royale. */
export function royaleProgress(
  save: Save,
  date: string,
): { readonly done: number; readonly playing: boolean } {
  const ids = royaleIds(date);
  return {
    done: ids.filter((id) => save.royale.finished[id] !== undefined).length,
    playing: ids.some((id) => (save.royale.progress[id]?.events.length ?? 0) > 0),
  };
}

/** A próxima dificuldade de hoje por jogar depois da `tier`, na ordem; null com as outras feitas. */
export function nextRoyale(
  save: Save,
  dailies: readonly RoyaleDaily[],
  tier: AnimeDifficulty,
): RoyaleDaily | null {
  const at = ROYALE_TIERS.indexOf(tier);
  const after = [...dailies.slice(at + 1), ...dailies.slice(0, at)];
  return after.find((d) => d.tier !== tier && !save.royale.finished[d.id]) ?? null;
}

/**
 * As marcas do compartilhar (formas diferentes, não só cores, P42): a capa certa, a errada (a vida
 * que acabou) e a que tocou e ficou sem achar.
 */
export const ROYALE_SHARE = { right: "✅", wrong: "❌", missed: "⬜" } as const;

/**
 * A linha do compartilhar: as achadas, a errada que encerrou (uma 6ª marca, só com o erro) e as
 * que ficaram sem achar. Sem ids.
 */
export function royaleShareLine(game: RoyaleGame): string {
  const missed = Math.max(0, ROYALE_PLAYED - royaleScore(game));
  return (
    ROYALE_SHARE.right.repeat(royaleScore(game)) +
    (game.wrong ? ROYALE_SHARE.wrong : "") +
    ROYALE_SHARE.missed.repeat(missed)
  );
}

/** O texto do compartilhar: o cabeçalho (montado pela tela), os acertos, a linha e o endereço. */
export function royaleShareText(header: string, game: RoyaleGame, url: string): string {
  return [header, `${royaleScore(game)}/${ROYALE_PLAYED}`, royaleShareLine(game), url].join("\n");
}
