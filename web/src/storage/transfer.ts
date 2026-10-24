// O progresso num arquivo (ME103): exportar e importar, sem servidor. Sem DOM, como o resto do
// storage: o texto entra e sai daqui, e a tela baixa e lê o arquivo. A importação passa pelas
// mesmas migrações e conferências da leitura do navegador (`readSave`, regra 12).
import { isValidDate } from "../core/dates.ts";
import { isRecord } from "../core/guards.ts";
import type { ArtistRecord, FinishedGame, Save } from "../core/records.ts";
import { readSave } from "./save.ts";

/**
 * A marca do arquivo: o app, o tipo e a versão do envelope. Um arquivo sem ela não é um progresso
 * do jogo. Fica à parte do nome do arquivo baixado: trocar o nome nunca invalida um arquivo já
 * guardado. O envelope muda de versão só se mudar o que fica em volta do save (o save tem a dele).
 */
export const TRANSFER_APP = "atemusic";
export const TRANSFER_KIND = "progresso";
export const TRANSFER_FORMAT = 1;
/**
 * O maior arquivo aceito: um ano com os 8 diários todo dia dá perto de 0,6 MB, e o arquivo errado
 * (um vídeo escolhido sem querer) é recusado antes de ser lido e antes de encher a cota do navegador.
 */
export const MAX_IMPORT_CHARS = 2 * 1024 * 1024;

/** O nome do arquivo baixado: `atemusic-progresso-AAAA-MM-DD.json`, pela data do jogo. */
export function exportFileName(today: string): string {
  return `atemusic-progresso-${today}.json`;
}

/**
 * O texto do arquivo: o save de sempre, sem o andamento (P26: só os jogos terminados viajam), com
 * a marca e a data do jogo (`today`, e não o relógio).
 */
export function exportFile(save: Save, today: string): string {
  const { inProgress: _kept, ...rest } = save;
  return JSON.stringify({
    app: TRANSFER_APP,
    kind: TRANSFER_KIND,
    format: TRANSFER_FORMAT,
    exportedOn: today,
    save: rest,
  });
}

/** O que o arquivo traz, para a confirmação: a data, os dias jogados e as medalhas vistas. */
export type ImportSummary = {
  /** O dia do jogo em que o arquivo foi exportado; null se o arquivo não diz. */
  readonly exportedOn: string | null;
  readonly days: number;
  readonly medals: number;
  /** Alguma entrada não valia e ficou de fora. */
  readonly dropped: boolean;
};

/**
 * Por que o arquivo não serve: grande demais, não é JSON, não é um progresso, é de uma versão mais
 * nova do jogo, foi exportado num dia depois do hoje desta aba (aberta desde antes da meia-noite:
 * os jogos de hoje sairiam como do futuro), ou não traz progresso nenhum (um save muito antigo
 * migra para o vazio, P100: importá-lo apagaria o aparelho por um toque).
 */
export type ImportError = "size" | "json" | "format" | "future" | "later" | "empty";

export type ImportResult =
  | { readonly ok: true; readonly save: Save; readonly summary: ImportSummary }
  | { readonly ok: false; readonly reason: ImportError };

/**
 * Um jogo terminado só com os campos conhecidos: o `sanitize` confere o formato, mas guarda um
 * campo estranho dentro do registro (o PLANO, ME103).
 */
function cleanGame(game: FinishedGame): FinishedGame {
  return {
    number: game.number,
    ...(game.late ? { late: true } : {}),
    rounds: game.rounds.map((r) => ({
      status: r.status,
      stage: r.stage,
      attempts: [...r.attempts],
      ...(r.help !== undefined ? { help: r.help } : {}),
    })),
  };
}

function cleanArtist(record: ArtistRecord): ArtistRecord {
  return {
    right: record.right,
    ...(record.done ? { done: true } : {}),
    ...(record.perfect ? { perfect: true } : {}),
  };
}

/**
 * Lê o texto de um arquivo de progresso. Vale o que a leitura do navegador aceita (`readSave`), e
 * mais duas regras que só se conferem com o hoje do jogo: um jogo de um dia depois de hoje não
 * pode ter sido jogado, e o jogado depois (`late`, P267) é sempre de um dia antes de hoje (o guard
 * aceita os dois, porque não conhece o hoje). O que não vale fica de fora, e o resumo diz.
 */
export function parseImport(text: string, today: string): ImportResult {
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, reason: "size" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (
    !isRecord(data) ||
    data.app !== TRANSFER_APP ||
    data.kind !== TRANSFER_KIND ||
    data.format !== TRANSFER_FORMAT ||
    !isRecord(data.save)
  ) {
    return { ok: false, reason: "format" };
  }
  const exportedOn =
    typeof data.exportedOn === "string" && isValidDate(data.exportedOn) ? data.exportedOn : null;
  if (exportedOn !== null && exportedOn > today) return { ok: false, reason: "later" };
  // O andamento não viaja (P26): um arquivo que o traga não o passa adiante.
  const read = readSave({ ...data.save, inProgress: {} });
  if (read.kind === "future") return { ok: false, reason: "future" };
  if (read.kind === "invalid") return { ok: false, reason: "format" };

  let dropped = read.dropped;
  const history: Record<string, FinishedGame> = {};
  for (const [id, game] of Object.entries(read.save.history)) {
    const date = id.split("|")[0] ?? "";
    if (date > today || (game.late && date >= today)) {
      dropped = true;
      continue;
    }
    history[id] = cleanGame(game);
  }
  const artists = Object.fromEntries(
    Object.entries(read.save.artists).map(([id, record]) => [id, cleanArtist(record)]),
  );
  const save: Save = { ...read.save, history, inProgress: {}, artists };
  const empty =
    Object.keys(history).length === 0 &&
    save.seenMedals.length === 0 &&
    save.shelf.length === 0 &&
    Object.keys(artists).length === 0 &&
    save.practiceRight === 0;
  if (empty) return { ok: false, reason: "empty" };
  const days = new Set(Object.keys(history).map((id) => id.split("|")[0])).size;
  return {
    ok: true,
    save,
    summary: { exportedOn, days, medals: save.seenMedals.length, dropped },
  };
}

/**
 * Os jogos terminados aqui que o arquivo não tem: o que a substituição tira deste aparelho, para a
 * confirmação dizer antes. Por jogo, e não por dia: um dia em que o arquivo tem o Normal e aqui
 * há também o Desafio perde só o Desafio.
 */
export function lostGames(current: Save, imported: Save): number {
  return Object.keys(current.history).filter((id) => imported.history[id] === undefined).length;
}

/**
 * Substituir (P24): o progresso importado toma o lugar do daqui. O andamento deste aparelho fica,
 * porque o arquivo não o traz (P26), menos o dos dias que o arquivo traz terminados.
 */
export function replaceSave(current: Save, imported: Save): Save {
  const inProgress = Object.fromEntries(
    Object.entries(current.inProgress).filter(([id]) => imported.history[id] === undefined),
  );
  return { ...imported, inProgress };
}
