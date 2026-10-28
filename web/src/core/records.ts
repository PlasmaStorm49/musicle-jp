// O que fica salvo de cada jogo e como uma sessão começa. Funções puras: o armazenamento
// (src/storage) só lê e grava o objeto Save; as regras de retomar e mesclar ficam aqui.
//
// Retomada por EVENTOS, não por estado: guardamos a lista de eventos aceitos e, ao recarregar,
// repetimos tudo no reducer. Como o reducer é puro e determinístico, o jogo volta exatamente
// igual, e o dado salvo é pequeno e fácil de validar.
import type { CatalogIndex } from "./catalog.ts";
import type { Daily, DailyKey } from "./daily.ts";
import type { MixedKey, MixedSave } from "./mixed.ts";
import type { QuizKey, QuizSave } from "./quiz.ts";
import { createGame, type GameEvent, type GameState, isFinished, reduce } from "./reducer.ts";
import { DAILY_SCORING, type ScorableRound, scoreOf } from "./rules.ts";

/**
 * "<data>|<diário>", ex.: "2026-10-08|album" (o Normal), "2026-10-08|song" (o Desafio) ou, no
 * Anime (v6, P250), "2026-10-08|anime-musica-facil"; nas Misturadas (v10, M17), no campo delas,
 * "2026-10-08|misturadas-musica"; no quiz do dia (v12, M18), no campo dele, "2026-10-08|quiz".
 */
export type PuzzleId = string;

export type AttemptMark = "skip" | "wrong" | "right";

export type RoundRecord = {
  readonly status: "won" | "lost" | "void";
  readonly stage: number;
  readonly attempts: readonly AttemptMark[];
  /**
   * Com a ajuda (P149, v4 do save): quantas tentativas já tinham sido gastas quando ela foi
   * pedida. Depois dela vêm só pulos, que aumentam o trecho (P163, v5), e no fim no máximo a
   * opção escolhida. Sem ajuda, o campo não existe.
   */
  readonly help?: number;
};

/**
 * Resumo de um jogo terminado. Sem IDs de faixa: não tem como revelar a resposta. O diário (e,
 * por ele, as regras) vem do id (`PuzzleId`), não daqui.
 */
export type FinishedGame = {
  readonly number: number;
  readonly rounds: readonly RoundRecord[];
  /**
   * Terminado depois do dia dele (v7, P267 e P268), pelo Histórico: não conta em estatística
   * nenhuma (P263). Sem o campo, foi jogado no dia. Só existe com `true`.
   */
  readonly late?: true;
};

/** O andamento: só os eventos aceitos (a retomada repete todos no reducer). */
export type InProgress = {
  readonly events: readonly GameEvent[];
};

/**
 * O que o save guarda do modo por artista (v8, P289): só o mínimo das medalhas do Superfan. A
 * partida em si continua só na memória (P116). Os três campos só crescem.
 */
export type ArtistRecord = {
  /** Músicas do artista acertadas no modo por artista (a Livre e o Superfan somam, P285). */
  readonly right: number;
  /** Terminou uma partida do Superfan: todas as músicas tocadas antes do 3º erro. */
  readonly done?: true;
  /** Terminou uma perfeita: sem erro, sem ajuda e tudo no trecho de 1 s. */
  readonly perfect?: true;
};

/** O fim de uma partida do Superfan, como o save o guarda (`superfanOutcome`). */
export type SuperfanOutcome = { readonly done: boolean; readonly perfect: boolean };

/**
 * O formato salvo. v3 (P100): os dois modos fixos começam do zero, e sai a preferência do modo
 * de resposta, que não existe mais. v4 (P149): a ajuda, no evento HELP e no `help` da rodada.
 * v5 (P163): o pulo depois da ajuda. v6 (P250): os ids dos diários do Anime. v7 (P267): a marca
 * do jogado depois, `late`. v8 (P289): as medalhas já avisadas, a estante (ME118) e o modo por
 * artista. v9 (P308): os acertos do Treino. v10 (M17): as Misturadas. v11: o jogado depois
 * nelas, pelo Histórico. v12 (M18): o quiz do dia. v13: os pontos do quiz. v14: a família da
 * pergunta na run do quiz (storage/migrations.ts).
 */
export type Save = {
  readonly schemaVersion: 14;
  readonly history: Readonly<Record<PuzzleId, FinishedGame>>;
  readonly inProgress: Readonly<Record<PuzzleId, InProgress>>;
  /** Os ids das medalhas que esta pessoa já viu avisadas, em ordem alfabética (P281). */
  readonly seenMedals: readonly string[];
  /** As medalhas favoritas, à mostra o tempo todo (ME118), na ordem da pessoa, até `SHELF_SIZE`. */
  readonly shelf: readonly string[];
  /** O modo por artista, pelo id do artista ("apple:ar:…"). */
  readonly artists: Readonly<Record<string, ArtistRecord>>;
  /**
   * As rodadas acertadas no Treino, com ou sem ajuda (o Saco de Pancadas, P308). Só o total, que
   * só cresce: a sessão continua só na memória (P50).
   */
  readonly practiceRight: number;
  /**
   * As Misturadas (M17): os terminados e os andamentos, à parte do `history` e do `inProgress`.
   * As estatísticas e a sequência do topo não as veem; as medalhas e o Histórico leem os delas.
   */
  readonly mixed: MixedSave;
  /** O quiz do dia (M18, v12): as runs terminadas e as em andamento (P2: a run retoma). */
  readonly quiz: QuizSave;
};

/** A estante (ME118) mostra até 3. */
export const SHELF_SIZE = 3;

export function emptySave(): Save {
  return {
    schemaVersion: 14,
    history: {},
    inProgress: {},
    seenMedals: [],
    shelf: [],
    artists: {},
    practiceRight: 0,
    mixed: { finished: {}, progress: {} },
    quiz: { finished: {}, progress: {} },
  };
}

export function puzzleId(date: string, key: DailyKey | MixedKey | QuizKey): PuzzleId {
  return `${date}|${key}`;
}

/**
 * As faixas dos diários dados que ainda não têm resultado: o lote de prévias que a carga
 * resolve. Um diário terminado só mostra o resumo, e consultar a Apple por ele gastaria a cota.
 */
export function pendingDayTracks(save: Save, dailies: readonly Daily[]): string[] {
  return dailies
    .filter((daily) => !save.history[daily.id])
    .flatMap((daily) => daily.rounds.map((round) => round.answer));
}

/**
 * O diário de `date`, jogado com o "hoje" do jogo em `today` (o `gameDate`, fixado na carga),
 * termina depois do dia dele (P268): o resumo leva a marca `late` e fica fora das estatísticas. A
 * aba aberta antes da meia-noite tem o `today` da carga, então quem termina depois da virada
 * ainda joga no dia (Apêndice F, "Virada do dia").
 */
export function isLate(date: string, today: string): boolean {
  return date < today;
}

/**
 * Converte um jogo terminado no resumo que vai para o histórico. `late`: terminou depois do dia
 * dele (`isLate`, P268), e o resumo leva a marca. Sem valor padrão de propósito: toda chamada diz
 * se é do dia ou não, e uma esquecida não compila.
 */
export function toFinishedGame(state: GameState, number: number, late: boolean): FinishedGame {
  if (!isFinished(state)) throw new Error("toFinishedGame recebeu um jogo em andamento");
  return {
    number,
    ...(late ? { late: true } : {}),
    rounds: state.rounds.map((r) => ({
      status: r.status as RoundRecord["status"],
      stage: r.stage,
      attempts: r.attempts.map((a) => (a.kind === "skip" ? "skip" : a.correct ? "right" : "wrong")),
      // O ponto em que a ajuda foi pedida, guardado pelo reducer: os pulos depois dela (P163)
      // não deixam deduzir das tentativas.
      ...(r.help && r.helpAt !== null ? { help: r.helpAt } : {}),
    })),
  };
}

type Scorable = { readonly rounds: readonly ScorableRound[] };

/**
 * Pontos de uma rodada de um diário, pela mesma conta do jogo (`scoreOf`), com a pontuação dos
 * diários: o resumo salvo não guarda as regras.
 */
export function roundRecordScore(round: ScorableRound): number {
  return scoreOf(round, DAILY_SCORING);
}

/** Pontos do dia: nada derivado é gravado, então sai do status, da etapa e da ajuda. */
export function recordScore(game: Scorable): number {
  return game.rounds.reduce((sum, r) => sum + roundRecordScore(r), 0);
}

/** Máximo do dia: o acerto no 1º trecho, por rodada não anulada (P27). */
export function recordMax(game: Scorable): number {
  const best = DAILY_SCORING.points[0] ?? 0;
  return best * game.rounds.filter((r) => r.status !== "void").length;
}

export type Session =
  | { readonly kind: "finished"; readonly game: FinishedGame }
  | {
      readonly kind: "playing";
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      /** A repetição descartou eventos salvos (ex.: catálogo novo): a lista salva precisa ser trocada. */
      readonly stale: boolean;
    };

/**
 * Como o diário começa: já terminado (P39: mostra o resultado), retomado pelos eventos salvos,
 * ou novo. `today`: o "hoje" do jogo; se a repetição terminar um diário de antes dele, o resumo
 * leva a marca do jogado depois (`isLate`, P268). O registro já gravado volta como está: vale o
 * 1º término (duas abas).
 */
export function startSession(
  save: Save,
  daily: Daily,
  index: CatalogIndex,
  today: string,
): Session {
  const done = save.history[daily.id];
  if (done) return { kind: "finished", game: done };

  const saved = save.inProgress[daily.id];
  let state = createGame(daily, index);
  const events: GameEvent[] = [];
  for (const event of saved?.events ?? []) {
    const next = reduce(state, event);
    if (next !== state) {
      events.push(event);
      state = next;
    }
  }
  // Salvou o último evento mas não chegou a gravar o histórico: o jogo já está terminado.
  if (isFinished(state) && events.length > 0) {
    return {
      kind: "finished",
      game: toFinishedGame(state, daily.number, isLate(daily.date, today)),
    };
  }
  return { kind: "playing", state, events, stale: events.length < (saved?.events.length ?? 0) };
}

/** Troca o andamento salvo pela lista dada, mesmo mais curta. Dia terminado não muda. */
export function replaceProgress(save: Save, id: PuzzleId, progress: InProgress): Save {
  if (save.history[id]) return save;
  return { ...save, inProgress: { ...save.inProgress, [id]: progress } };
}

/** Grava o andamento. Se outra aba foi mais longe ou já terminou este jogo, ela vence. */
export function withProgress(save: Save, id: PuzzleId, progress: InProgress): Save {
  const current = save.inProgress[id];
  if (current && current.events.length > progress.events.length) return save;
  return replaceProgress(save, id, progress);
}

/** Grava o jogo terminado e limpa o andamento. O primeiro término vence (duas abas). */
export function withFinished(save: Save, id: PuzzleId, game: FinishedGame): Save {
  if (save.history[id] && !save.inProgress[id]) return save; // já gravado: nada a fazer
  const { [id]: _done, ...inProgress } = save.inProgress;
  return {
    ...save,
    history: save.history[id] ? save.history : { ...save.history, [id]: game },
    inProgress,
  };
}

/**
 * Marca as medalhas como avisadas: a união, em ordem alfabética. Sem nenhuma nova, o mesmo
 * objeto (o `updateSave` então não grava).
 */
export function withSeenMedals(save: Save, ids: readonly string[]): Save {
  const seen = new Set(save.seenMedals);
  const fresh = ids.filter((id) => !seen.has(id));
  if (fresh.length === 0) return save;
  return { ...save, seenMedals: [...new Set([...save.seenMedals, ...fresh])].sort() };
}

/** A medalha em destaque (ME118, P317): a 1ª da estante. Por enquanto, a estante mostra só ela. */
export function favoriteOf(save: Save): string | null {
  return save.shelf[0] ?? null;
}

/**
 * Escolhe a medalha em destaque (`on`), e a estante fica só com ela; ou tira (P318), só se ela
 * ainda é a favorita: a aba que não viu a troca feita na outra não apaga a escolha de lá. Sem
 * mudança, o mesmo objeto (o `updateSave` então não grava).
 */
export function withFavorite(save: Save, id: string, on: boolean): Save {
  if (!on) return favoriteOf(save) === id ? { ...save, shelf: [] } : save;
  const same = save.shelf.length === 1 && save.shelf[0] === id;
  return same ? save : { ...save, shelf: [id] };
}

/** Mais uma rodada acertada no Treino (P308). */
export function withPracticeRight(save: Save): Save {
  return { ...save, practiceRight: save.practiceRight + 1 };
}

/** O artista sem registro: nenhum acerto, nada terminado. */
export const NO_ARTIST: ArtistRecord = { right: 0 };

/** Mais uma música do artista acertada no modo por artista (P285). */
export function withArtistRight(save: Save, artistId: string): Save {
  const current = save.artists[artistId] ?? NO_ARTIST;
  return {
    ...save,
    artists: { ...save.artists, [artistId]: { ...current, right: current.right + 1 } },
  };
}

/**
 * O fim de uma partida do Superfan: marca o terminar e o perfeito, que nunca voltam atrás. A
 * perfeita é também terminada. Sem nada novo (a partida encerrada, ou o feito que já estava
 * marcado), o mesmo objeto.
 */
export function withSuperfanEnd(save: Save, artistId: string, outcome: SuperfanOutcome): Save {
  const current = save.artists[artistId] ?? NO_ARTIST;
  const done = (outcome.done || outcome.perfect) && !current.done;
  const perfect = outcome.perfect && !current.perfect;
  if (!done && !perfect) return save;
  const next: ArtistRecord = {
    ...current,
    ...(done ? { done: true } : {}),
    ...(perfect ? { perfect: true } : {}),
  };
  return { ...save, artists: { ...save.artists, [artistId]: next } };
}

/**
 * Limpa ao abrir o jogo os andamentos que não podem mais ser retomados: os que não estão em
 * `keep` (hoje e os dias do Histórico, P269), também nas Misturadas e no quiz. Sem nada a limpar, o
 * mesmo objeto.
 */
export function pruneProgress(save: Save, keep: readonly PuzzleId[]): Save {
  const kept = new Set(keep);
  const stale = (map: Readonly<Record<PuzzleId, unknown>>) =>
    Object.keys(map).some((id) => !kept.has(id));
  if (!stale(save.inProgress) && !stale(save.mixed.progress) && !stale(save.quiz.progress)) {
    return save;
  }
  const only = <T>(map: Readonly<Record<PuzzleId, T>>) =>
    Object.fromEntries(Object.entries(map).filter(([id]) => kept.has(id)));
  return {
    ...save,
    inProgress: only(save.inProgress),
    mixed: { ...save.mixed, progress: only(save.mixed.progress) },
    quiz: { ...save.quiz, progress: only(save.quiz.progress) },
  };
}
