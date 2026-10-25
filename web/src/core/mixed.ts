// As Misturadas (M17): 2 ou 3 prévias do Anime tocando juntas, e a pessoa acha todas. O diário, o
// estado de uma partida, o reducer, os pontos e o que vai para o save. Puro, como o reducer dos
// diários (regra 5): o evento inválido devolve o mesmo objeto, e nada é sorteado aqui. Fica à
// parte do reducer de hoje, que não muda: a rodada tem várias respostas, e o acerto não abre trecho.
import { acceptedIds, type CatalogIndex, franchisesOf } from "./catalog.ts";
import { ANIME_MODES, type AnimeMode, type DailyAnswer } from "./daily.ts";
import type { DailyStatus } from "./home.ts";
import { isLate, type PuzzleId, puzzleId, type Save } from "./records.ts";
import type { Attempt } from "./reducer.ts";
import type { MixedDay, TrackId } from "./types.ts";

/** Os dois modos das Misturadas, os do Anime: acertar a música e acertar o anime. */
export const MIXED_MODES: readonly AnimeMode[] = ANIME_MODES;

/** Um diário das Misturadas sem a data: "misturadas-<modo>". É também a rota dele. */
export type MixedKey = `misturadas-${AnimeMode}`;

export function mixedKey(mode: AnimeMode): MixedKey {
  return `misturadas-${mode}`;
}

/** Os 2 diários das Misturadas, na ordem dos modos. */
export const MIXED_KEYS: readonly MixedKey[] = MIXED_MODES.map(mixedKey);

/** Os ids no save dos 2 diários de um dia (a abertura guarda só os de hoje: não há Histórico). */
export function mixedIds(date: string): PuzzleId[] {
  return MIXED_KEYS.map((key) => puzzleId(date, key));
}

/** Os trechos (P326): cada erro ou pulo abre o seguinte. */
export const MIXED_STAGES: readonly number[] = [4, 8, 16, 30];
export const MIXED_LAST_STAGE = MIXED_STAGES.length - 1;
/** As 4 rodadas do dia (P325): 2, 2, 2 e 3 músicas. */
export const MIXED_ROUNDS = 4;
/** Quantas músicas uma rodada pode ter (o schema da agenda diz o mesmo). */
export const MIXED_MIN_SONGS = 2;
export const MIXED_MAX_SONGS = 3;
/**
 * A rodada difícil (P325): a 3ª, com músicas do Médio para cima (a régua `hard` do pipeline,
 * `anime_mixed.ROUNDS`). Mudou a ordem das réguas lá? Muda aqui também.
 */
export const MIXED_HARD_ROUND = 2;

/** O que faz uma rodada ser difícil, para a etiqueta: músicas mais difíceis ou mais músicas. */
export type MixedRoundTag = "hard" | "more";

/** A etiqueta da rodada `index`, com `songs` músicas; null nas rodadas comuns. */
export function mixedRoundTag(index: number, songs: number): MixedRoundTag | null {
  if (songs > MIXED_MIN_SONGS) return "more";
  return index === MIXED_HARD_ROUND ? "hard" : null;
}

/**
 * Os pontos de uma música achada, pelo trecho em que foi achada (P329); com o "Separar" ligado
 * (P327), os da ajuda. A rodada vale a média das suas músicas, arredondada (`mixedRoundScore`):
 * achar todas no 1º trecho vale 10, e o dia, no máximo 40.
 */
export const MIXED_POINTS: readonly number[] = [10, 7, 5, 3];
export const MIXED_HELP_POINTS: readonly number[] = [5, 4, 3, 2];

/** Um diário das Misturadas do dia: a agenda diz as músicas de cada rodada, e o descritor, o resto. */
export type MixedDaily = {
  readonly key: MixedKey;
  /** O id do jogo no save: "<data>|misturadas-<modo>". */
  readonly id: PuzzleId;
  /** A data do jogo (não o relógio). */
  readonly date: string;
  /** O número do dia na agenda das Misturadas: o "nº" do cabeçalho e do compartilhar. */
  readonly number: number;
  readonly mode: AnimeMode;
  /** O que se acerta: a música, ou a franquia no "acertar o anime" (P234). */
  readonly answer: DailyAnswer;
  /** As faixas que tocam juntas em cada rodada. */
  readonly rounds: readonly (readonly TrackId[])[];
};

export function mixedDaily(day: MixedDay, date: string, mode: AnimeMode): MixedDaily {
  const key = mixedKey(mode);
  return {
    key,
    id: puzzleId(date, key),
    date,
    number: day.number,
    mode,
    answer: mode === "musica" ? "track" : "franchise",
    rounds: day[mode].map((round) => [...round.answers]),
  };
}

/** Os 2 diários das Misturadas do dia, na ordem dos modos. */
export function mixedDailies(day: MixedDay, date: string): MixedDaily[] {
  return MIXED_MODES.map((mode) => mixedDaily(day, date, mode));
}

// ---- o estado da partida ----

/** Uma das músicas da rodada. */
export type MixedSong = {
  readonly trackId: TrackId;
  /** Os ids que a acham: as versões da música ou, no "acertar o anime", as franquias dela. */
  readonly accepted: readonly string[];
  /** O trecho em que foi achada; null enquanto falta. */
  readonly found: number | null;
  /** Achada com o "Separar" ligado: vale os pontos da ajuda. */
  readonly helped: boolean;
};

/** "done": achou todas, errou no último trecho ou desistiu; "void": sem áudio ou sem a faixa. */
export type MixedRoundStatus = "playing" | "done" | "void";

export type MixedRoundState = {
  readonly songs: readonly MixedSong[];
  /** O trecho liberado, de 0 a MIXED_LAST_STAGE. */
  readonly stage: number;
  /** Os palpites (certos e errados) e os pulos, na ordem. */
  readonly attempts: readonly Attempt[];
  /** O "Separar L e R" (P327): uma vez ligado, fica. As achadas depois valem os pontos da ajuda. */
  readonly separated: boolean;
  readonly status: MixedRoundStatus;
  /** Por que foi anulada: "unavailable" (catálogo) ou o motivo do evento VOID. */
  readonly voidReason: string | null;
};

export type MixedState = {
  /** O id no save ("<data>|misturadas-<modo>"). */
  readonly id: PuzzleId;
  readonly answer: DailyAnswer;
  readonly rounds: readonly MixedRoundState[];
  readonly current: number;
};

export type MixedEvent =
  | { readonly type: "GUESS"; readonly guessId: string }
  /** Abre o trecho seguinte sem palpitar (não existe no último). */
  | { readonly type: "SKIP" }
  /** Liga o "Separar L e R" (P327). */
  | { readonly type: "SEPARATE" }
  /** Encerra a rodada com as que faltam. */
  | { readonly type: "GIVE_UP" }
  /** Anula a rodada `round` (falha de áudio). Ignorado se não for a rodada atual. */
  | { readonly type: "VOID"; readonly round: number; readonly reason: string }
  | { readonly type: "NEXT_ROUND" };

/** Os ids que acham uma faixa no modo; vazio se ela sumiu ou não é elegível (a rodada é anulada). */
function acceptedOf(index: CatalogIndex, trackId: TrackId, answer: DailyAnswer): string[] {
  const track = index.tracks.get(trackId);
  if (!track?.eligible.daily) return [];
  if (answer === "franchise") return [...new Set(franchisesOf(index, trackId))].sort();
  return acceptedIds(index, track, "song");
}

/**
 * Monta a partida de um diário: as rodadas da agenda. Uma rodada com uma faixa que sumiu ou deixou
 * de ser elegível (ou, no "acertar o anime", sem franquia) nasce anulada, inteira: as outras
 * músicas sozinhas seriam outra rodada.
 */
export function createMixedGame(daily: MixedDaily, index: CatalogIndex): MixedState {
  const rounds = daily.rounds.map((trackIds): MixedRoundState => {
    const songs = trackIds.map(
      (trackId): MixedSong => ({
        trackId,
        accepted: acceptedOf(index, trackId, daily.answer),
        found: null,
        helped: false,
      }),
    );
    const missing = songs.some((song) => song.accepted.length === 0);
    return {
      songs,
      stage: 0,
      attempts: [],
      separated: false,
      status: missing ? "void" : "playing",
      voidReason: missing ? "unavailable" : null,
    };
  });
  return { id: daily.id, answer: daily.answer, rounds, current: 0 };
}

function withRound(state: MixedState, round: MixedRoundState): MixedState {
  return { ...state, rounds: state.rounds.map((r, i) => (i === state.current ? round : r)) };
}

/**
 * Um palpite: acha a 1ª música que falta e o aceita, no trecho de agora, e o trecho fica (dá para
 * seguir tentando as outras nele). O errado abre o trecho seguinte, e no último encerra a rodada.
 * Um palpite repetido, ou que acha uma música já achada (outra versão dela, a outra franquia dela),
 * não conta.
 */
function guess(state: MixedState, round: MixedRoundState, guessId: string): MixedState {
  if (round.attempts.some((a) => a.kind === "guess" && a.guessId === guessId)) return state;
  if (round.songs.some((s) => s.found !== null && s.accepted.includes(guessId))) return state;
  const hit = round.songs.findIndex((s) => s.found === null && s.accepted.includes(guessId));
  const attempts = [...round.attempts, { kind: "guess", guessId, correct: hit !== -1 } as const];
  if (hit !== -1) {
    const songs = round.songs.map((s, i) =>
      i === hit ? { ...s, found: round.stage, helped: round.separated } : s,
    );
    const status = songs.every((s) => s.found !== null) ? "done" : "playing";
    return withRound(state, { ...round, songs, attempts, status });
  }
  if (round.stage >= MIXED_LAST_STAGE)
    return withRound(state, { ...round, attempts, status: "done" });
  return withRound(state, { ...round, attempts, stage: round.stage + 1 });
}

export function mixedReducer(state: MixedState, event: MixedEvent): MixedState {
  const round = state.rounds[state.current];
  if (!round) return state;
  if (event.type === "NEXT_ROUND") {
    const last = state.current >= state.rounds.length - 1;
    return round.status === "playing" || last ? state : { ...state, current: state.current + 1 };
  }
  if (round.status !== "playing") return state;
  switch (event.type) {
    case "GUESS":
      return guess(state, round, event.guessId);
    case "SKIP":
      // No último trecho não há o que abrir: quem quer parar desiste.
      if (round.stage >= MIXED_LAST_STAGE) return state;
      return withRound(state, {
        ...round,
        attempts: [...round.attempts, { kind: "skip" }],
        stage: round.stage + 1,
      });
    case "SEPARATE":
      return round.separated ? state : withRound(state, { ...round, separated: true });
    case "GIVE_UP":
      return withRound(state, { ...round, status: "done" });
    case "VOID":
      // Uma falha de áudio atrasada (o pré-carregamento de outra rodada) não anula a em jogo.
      if (event.round !== state.current) return state;
      return withRound(state, { ...round, status: "void", voidReason: event.reason });
  }
}

/** A rodada em jogo. */
export function currentMixedRound(state: MixedState): MixedRoundState {
  const round = state.rounds[state.current];
  if (!round) throw new RangeError(`rodada ${state.current} não existe`);
  return round;
}

/** O jogo acabou quando nenhuma rodada está em andamento. */
export function isMixedFinished(state: MixedState): boolean {
  return state.rounds.every((r) => r.status !== "playing");
}

// ---- os pontos ----

/** Uma música achada, como o save a guarda: o trecho e, com o "Separar", a marca da ajuda. */
export type MixedFind = { readonly stage: number; readonly help?: true };

/** Os pontos de uma música: os do trecho em que foi achada, ou os da ajuda; 0 se faltou. */
export function findPoints(find: MixedFind | null): number {
  if (!find) return 0;
  const table = find.help ? MIXED_HELP_POINTS : MIXED_POINTS;
  return table[Math.min(Math.max(find.stage, 0), table.length - 1)] ?? 0;
}

/** Uma rodada que se pontua: a do jogo (pelos `findsOf`) ou a do save. */
export type ScorableMixedRound = {
  readonly status: string;
  readonly found: readonly (MixedFind | null)[];
};

/**
 * Os pontos da rodada (P329): a média dos pontos das músicas, no inteiro mais perto. Sem meio
 * ponto, e a rodada inteira no 1º trecho vale 10. A anulada vale 0 e fica fora do máximo.
 */
export function mixedRoundScore(round: ScorableMixedRound): number {
  if (round.status === "void" || round.found.length === 0) return 0;
  const sum = round.found.reduce((total, find) => total + findPoints(find), 0);
  return Math.round(sum / round.found.length);
}

/** As músicas achadas de uma rodada em jogo, no formato do save. */
export function findsOf(round: MixedRoundState): (MixedFind | null)[] {
  return round.songs.map((song) =>
    song.found === null ? null : { stage: song.found, ...(song.helped ? { help: true } : {}) },
  );
}

// ---- o save ----

/** Uma rodada terminada, como o save a guarda: sem ids de faixa (não tem como revelar a resposta). */
export type MixedRoundRecord = {
  readonly status: "done" | "void";
  /** Uma entrada por música, na ordem da agenda: o achado, ou null. A anulada, só nulls. */
  readonly found: readonly (MixedFind | null)[];
};

/** Um diário das Misturadas terminado. */
export type MixedGame = {
  readonly number: number;
  readonly rounds: readonly MixedRoundRecord[];
  /**
   * Terminado depois do dia dele, pelo Histórico (v11), como o `late` dos diários (P268): fica
   * fora das medalhas, e o resumo diz que foi jogado depois.
   */
  readonly late?: true;
};

/** O andamento: só os eventos aceitos (a retomada repete todos no reducer, como nos diários). */
export type MixedProgress = { readonly events: readonly MixedEvent[] };

/**
 * As Misturadas no save (v10), à parte do `history` dos diários: as estatísticas e a sequência do
 * topo não as veem. As medalhas delas (ME123) leem os terminados no dia, e o jogado depois fica
 * fora, como nos diários (v11).
 */
export type MixedSave = {
  readonly finished: Readonly<Record<PuzzleId, MixedGame>>;
  readonly progress: Readonly<Record<PuzzleId, MixedProgress>>;
};

export const EMPTY_MIXED: MixedSave = { finished: {}, progress: {} };

/** Os pontos do dia: nada derivado é gravado, então sai dos achados. */
export function mixedScore(game: { readonly rounds: readonly ScorableMixedRound[] }): number {
  return game.rounds.reduce((sum, round) => sum + mixedRoundScore(round), 0);
}

/** O máximo do dia: 10 por rodada não anulada. */
export function mixedMax(game: { readonly rounds: readonly ScorableMixedRound[] }): number {
  const best = MIXED_POINTS[0] ?? 0;
  return best * game.rounds.filter((round) => round.status !== "void").length;
}

/**
 * O jogo terminado, no formato do save. `late`: terminou depois do dia dele (`isLate`), e o
 * resumo leva a marca. Sem valor padrão de propósito: toda chamada diz qual é, como no
 * `toFinishedGame` dos diários.
 */
export function toMixedGame(state: MixedState, number: number, late: boolean): MixedGame {
  if (!isMixedFinished(state)) throw new Error("toMixedGame recebeu um jogo em andamento");
  return {
    number,
    rounds: state.rounds.map((round) =>
      round.status === "void"
        ? { status: "void", found: round.songs.map(() => null) }
        : { status: "done", found: findsOf(round) },
    ),
    ...(late ? { late: true } : {}),
  };
}

export type MixedSession =
  | { readonly kind: "finished"; readonly game: MixedGame }
  | {
      readonly kind: "playing";
      readonly state: MixedState;
      readonly events: readonly MixedEvent[];
      /** A repetição descartou eventos salvos (catálogo novo): a lista salva precisa ser trocada. */
      readonly stale: boolean;
    };

/**
 * Como o diário começa: já terminado, retomado pelos eventos salvos, ou novo (o `startSession`).
 * O `today` diz se o jogo que a repetição terminou foi jogado depois do dia dele.
 */
export function startMixedSession(
  save: Save,
  daily: MixedDaily,
  index: CatalogIndex,
  today: string,
): MixedSession {
  const done = save.mixed.finished[daily.id];
  if (done) return { kind: "finished", game: done };
  const saved = save.mixed.progress[daily.id];
  let state = createMixedGame(daily, index);
  const events: MixedEvent[] = [];
  for (const event of saved?.events ?? []) {
    const next = mixedReducer(state, event);
    if (next !== state) {
      events.push(event);
      state = next;
    }
  }
  // Salvou o último evento mas não chegou a gravar o terminado: o jogo já acabou.
  if (isMixedFinished(state) && events.length > 0) {
    return {
      kind: "finished",
      game: toMixedGame(state, daily.number, isLate(daily.date, today)),
    };
  }
  return { kind: "playing", state, events, stale: events.length < (saved?.events.length ?? 0) };
}

/** Troca o andamento salvo pela lista dada, mesmo mais curta. Dia terminado não muda. */
export function replaceMixedProgress(save: Save, id: PuzzleId, progress: MixedProgress): Save {
  if (save.mixed.finished[id]) return save;
  return {
    ...save,
    mixed: { ...save.mixed, progress: { ...save.mixed.progress, [id]: progress } },
  };
}

/** Grava o andamento. Se outra aba foi mais longe ou já terminou este jogo, ela vence. */
export function withMixedProgress(save: Save, id: PuzzleId, progress: MixedProgress): Save {
  const current = save.mixed.progress[id];
  if (current && current.events.length > progress.events.length) return save;
  return replaceMixedProgress(save, id, progress);
}

/** Grava o jogo terminado e limpa o andamento. O primeiro término vence (duas abas). */
export function withMixedFinished(save: Save, id: PuzzleId, game: MixedGame): Save {
  const { finished, progress } = save.mixed;
  if (finished[id] && !progress[id]) return save; // já gravado: nada a fazer
  const { [id]: _done, ...rest } = progress;
  return {
    ...save,
    mixed: { finished: finished[id] ? finished : { ...finished, [id]: game }, progress: rest },
  };
}

/** Os 2 diários de hoje terminados: o ✓ da aba Misturadas, só pelo save (como o dos Hits). */
export function mixedDone(save: Save, date: string): boolean {
  return mixedIds(date).every((id) => save.mixed.finished[id] !== undefined);
}

/**
 * O estado de um diário das Misturadas no cartão dele, como o dos diários (`statusOf`): fora da
 * agenda, novo, em andamento ou terminado, com os pontos.
 */
export function mixedStatusOf(save: Save, daily: MixedDaily | null): DailyStatus {
  if (!daily) return { kind: "unavailable" };
  const finished = save.mixed.finished[daily.id];
  if (finished) {
    return {
      kind: "done",
      number: daily.number,
      score: mixedScore(finished),
      max: mixedMax(finished),
      late: finished.late === true,
    };
  }
  if (save.mixed.progress[daily.id]?.events.length) {
    return { kind: "playing", number: daily.number };
  }
  return { kind: "new", number: daily.number };
}

/**
 * As marcas do compartilhar: o trecho em que cada música foi achada (formas diferentes, não só
 * cores, P42), o ❌ da que faltou, o ⬜ da rodada anulada e o 💡 do "Separar".
 */
export const MIXED_SHARE = {
  stages: ["1️⃣", "2️⃣", "3️⃣", "4️⃣"],
  missed: "❌",
  void: "⬜",
  help: "💡",
} as const;

/** Uma linha por rodada: uma marca por música, na ordem da agenda. Sem ids: não revela nada. */
export function mixedShareLines(game: MixedGame): string[] {
  return game.rounds.map((round) => {
    if (round.status === "void") return MIXED_SHARE.void;
    return round.found
      .map((find) => {
        if (!find) return MIXED_SHARE.missed;
        const mark = MIXED_SHARE.stages[find.stage] ?? MIXED_SHARE.missed;
        return find.help ? `${mark}${MIXED_SHARE.help}` : mark;
      })
      .join("");
  });
}

/** O texto do compartilhar: o cabeçalho (montado pela tela), os pontos, as rodadas e o endereço. */
export function mixedShareText(header: string, game: MixedGame, url: string): string {
  return [header, `${mixedScore(game)}/${mixedMax(game)}`, ...mixedShareLines(game), url].join(
    "\n",
  );
}
