import { describe, expect, it } from "vitest";
import type { MixedGame } from "../core/mixed.ts";
import { emptySave, type FinishedGame, type Save } from "../core/records.ts";
import { SAVE_SCHEMA_VERSION } from "./migrations.ts";
import { readSave } from "./save.ts";
import {
  exportFile,
  exportFileName,
  lostGames,
  MAX_IMPORT_CHARS,
  parseImport,
  replaceSave,
  TRANSFER_APP,
  TRANSFER_FORMAT,
  TRANSFER_KIND,
} from "./transfer.ts";

const TODAY = "2026-10-23";

/** Um dia terminado que vale nos dois modos (no máximo 1 tentativa por rodada, sem pulo). */
const finished: FinishedGame = {
  number: 1,
  rounds: [
    { status: "won", stage: 1, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};

const save: Save = {
  ...emptySave(),
  history: {
    "2026-10-20|album": finished,
    "2026-10-21|album": finished,
    "2026-10-21|song": { ...finished, late: true },
  },
  inProgress: { "2026-10-23|song": { events: [{ type: "SKIP" }] } },
  seenMedals: ["diario-1", "superfan|apple:ar:1|completo"],
  shelf: ["diario-1"],
  artists: { "apple:ar:1": { right: 4, done: true } },
  practiceRight: 12,
};

/** O texto de um arquivo com o `save` dado (para os arquivos feitos à mão). */
const file = (inner: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: TRANSFER_APP,
    kind: TRANSFER_KIND,
    format: TRANSFER_FORMAT,
    exportedOn: TODAY,
    save: inner,
    ...extra,
  });

describe("exportFile (ME103)", () => {
  it("o nome tem a data do jogo", () => {
    expect(exportFileName(TODAY)).toBe("atemusic-progresso-2026-10-23.json");
  });

  it("leva o save sem o andamento (P346), com a marca e a data", () => {
    const data = JSON.parse(exportFile(save, TODAY));
    expect(data).toMatchObject({
      app: "atemusic",
      kind: "progresso",
      format: TRANSFER_FORMAT,
      exportedOn: TODAY,
    });
    expect(data.save).not.toHaveProperty("inProgress");
    expect(data.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(data.save.history).toEqual(save.history);
  });
});

describe("parseImport (ME103)", () => {
  it("a ida e a volta devolvem o mesmo save, sem o andamento, e o resumo", () => {
    const result = parseImport(exportFile(save, TODAY), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save).toEqual({ ...save, inProgress: {} });
    expect(result.summary).toEqual({ exportedOn: TODAY, days: 2, medals: 2, dropped: false });
  });

  it("recusa o que não é JSON, o que não é um progresso e o grande demais", () => {
    expect(parseImport("{nada", TODAY)).toEqual({ ok: false, reason: "json" });
    expect(parseImport(JSON.stringify({ save }), TODAY)).toEqual({ ok: false, reason: "format" });
    expect(parseImport(file(save, { app: "outro" }), TODAY)).toEqual({
      ok: false,
      reason: "format",
    });
    expect(parseImport(file("texto"), TODAY)).toEqual({ ok: false, reason: "format" });
    expect(parseImport(file({ history: {} }), TODAY)).toEqual({ ok: false, reason: "format" });
    expect(parseImport(" ".repeat(MAX_IMPORT_CHARS + 1), TODAY)).toEqual({
      ok: false,
      reason: "size",
    });
  });

  it("sem a versão do envelope, ou com outra, não é um progresso", () => {
    expect(parseImport(file(save, { format: undefined }), TODAY)).toEqual({
      ok: false,
      reason: "format",
    });
    expect(parseImport(file(save, { format: 2 }), TODAY)).toEqual({ ok: false, reason: "format" });
  });

  it("o arquivo de um dia depois do hoje desta página é recusado; sem a data, vale (e o resumo diz null)", () => {
    expect(parseImport(file(save, { exportedOn: "2026-10-24" }), TODAY)).toEqual({
      ok: false,
      reason: "later",
    });
    const undated = parseImport(file(save, { exportedOn: "ontem" }), TODAY);
    if (!undated.ok) throw new Error(undated.reason);
    expect(undated.summary.exportedOn).toBeNull();
  });

  it("o __proto__ de um arquivo editado não contamina nada", () => {
    const text = file(save).replace(
      '"history":{',
      '"__proto__":{"polluted":true},"history":{"__proto__":{"polluted":true},',
    );
    const result = parseImport(text, TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(result.save.history).sort()).toEqual(Object.keys(save.history).sort());
    expect(result.summary.dropped).toBe(true);
  });

  it("o save de uma versão mais nova não entra, como na leitura do navegador", () => {
    const future = { ...save, schemaVersion: SAVE_SCHEMA_VERSION + 1 };
    expect(parseImport(file(future), TODAY)).toEqual({ ok: false, reason: "future" });
  });

  it("o save de uma versão antiga passa pelas migrações (a v8 ganha o total do Treino)", () => {
    const { practiceRight: _gone, ...rest } = save;
    const v8 = { ...rest, schemaVersion: 8 };
    const result = parseImport(file(v8), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.save.practiceRight).toBe(0);
    expect(result.save.history).toEqual(save.history);
  });

  it("o campo estranho sai de cada jogo e de cada artista", () => {
    const odd = {
      ...save,
      history: {
        "2026-10-20|album": {
          ...finished,
          extra: "x",
          rounds: finished.rounds.map((r) => ({ ...r, extra: 1 })),
        },
      },
      artists: { "apple:ar:1": { right: 4, done: true, extra: true } },
    };
    const result = parseImport(file(odd), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.history["2026-10-20|album"]).toEqual(finished);
    expect(result.save.artists["apple:ar:1"]).toEqual({ right: 4, done: true });
  });

  it("descarta o jogo de um dia depois de hoje e o jogado depois com a data de hoje", () => {
    const odd = {
      ...save,
      history: {
        "2026-10-20|album": finished,
        "2026-10-24|album": finished,
        "2026-10-23|song": { ...finished, late: true },
        // Jogado hoje, no dia: vale.
        "2026-10-23|album": finished,
      },
    };
    const result = parseImport(file(odd), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(Object.keys(result.save.history).sort()).toEqual([
      "2026-10-20|album",
      "2026-10-23|album",
    ]);
    expect(result.summary).toMatchObject({ days: 2, dropped: true });
  });

  it("a entrada que não vale fica de fora, e o resumo diz", () => {
    const odd = { ...save, history: { ...save.history, "2026-10-19|album": { number: 0 } } };
    const result = parseImport(file(odd), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.history).not.toHaveProperty("2026-10-19|album");
    expect(result.summary.dropped).toBe(true);
  });

  it("o arquivo sem progresso nenhum (um save muito antigo migra para o vazio) é recusado", () => {
    expect(parseImport(file({ schemaVersion: 2, history: {}, inProgress: {} }), TODAY)).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(parseImport(file(emptySave()), TODAY)).toEqual({ ok: false, reason: "empty" });
    // Só o total do Treino já é progresso.
    expect(parseImport(file({ ...emptySave(), practiceRight: 3 }), TODAY).ok).toBe(true);
  });

  it("as medalhas e os artistas que não valem ficam de fora, e o resumo diz", () => {
    const odd = {
      ...save,
      seenMedals: ["diario-1", "Não é id", 7],
      shelf: ["diario-1", "?"],
      artists: {
        "apple:ar:1": { right: 4 },
        "não-é-artista": { right: 1 },
        "apple:ar:2": { right: -1 },
      },
    };
    const result = parseImport(file(odd), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.seenMedals).toEqual(["diario-1"]);
    expect(result.save.shelf).toEqual(["diario-1"]);
    expect(Object.keys(result.save.artists)).toEqual(["apple:ar:1"]);
    expect(result.summary.dropped).toBe(true);
  });

  it("o andamento de um arquivo feito à mão não passa (P346)", () => {
    const result = parseImport(file(save), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.inProgress).toEqual({});
  });

  it("o save importado é um save que a leitura do navegador aceita sem reparo", () => {
    const result = parseImport(exportFile(save, TODAY), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(readSave(JSON.parse(JSON.stringify(result.save)))).toMatchObject({
      kind: "ok",
      dropped: false,
    });
  });
});

describe("lostGames (o que a substituição tira daqui)", () => {
  it("conta os jogos terminados aqui que o arquivo não tem, e não os dias", () => {
    const current: Save = {
      ...emptySave(),
      history: {
        "2026-10-20|album": finished, // o arquivo também tem: não sai
        "2026-10-21|album": finished, // o arquivo tem: não sai, e o Desafio dele também não
        "2026-10-22|album": finished,
        "2026-10-22|song": finished,
        "2026-10-23|album": finished,
      },
    };
    expect(lostGames(current, save)).toBe(3);
    expect(lostGames(emptySave(), save)).toBe(0);
  });
});

describe("replaceSave (P345)", () => {
  it("o importado toma o lugar; o andamento daqui fica, menos o de um dia que o arquivo traz terminado", () => {
    const current: Save = {
      ...emptySave(),
      history: { "2026-10-01|album": finished },
      inProgress: {
        "2026-10-23|song": { events: [{ type: "SKIP" }] },
        "2026-10-21|album": { events: [{ type: "LISTEN_MORE" }] },
      },
      practiceRight: 99,
    };
    const imported: Save = { ...save, inProgress: {} };
    const next = replaceSave(current, imported);
    expect(next.history).toEqual(imported.history);
    expect(next.practiceRight).toBe(12);
    expect(next.inProgress).toEqual({ "2026-10-23|song": { events: [{ type: "SKIP" }] } });
  });
});

describe("as Misturadas no arquivo (v10, M17)", () => {
  const game: MixedGame = {
    number: 3,
    rounds: [
      { status: "done", found: [{ stage: 0 }, { stage: 2, help: true }] },
      { status: "void", found: [null, null] },
      { status: "done", found: [null, { stage: 1 }] },
      { status: "done", found: [{ stage: 0 }, { stage: 0 }, null] },
    ],
  };
  const withMixed: Save = {
    ...emptySave(),
    mixed: {
      finished: { "2026-10-22|misturadas-musica": game },
      progress: { "2026-10-23|misturadas-titulo": { events: [{ type: "SEPARATE" }] } },
    },
  };

  it("viajam só os terminados, e a ida e a volta os devolvem; só elas já são um progresso", () => {
    const data = JSON.parse(exportFile(withMixed, TODAY));
    expect(data.save.mixed).toEqual({ finished: withMixed.mixed.finished, progress: {} });
    const result = parseImport(exportFile(withMixed, TODAY), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.mixed).toEqual({ finished: withMixed.mixed.finished, progress: {} });
    expect(result.summary).toMatchObject({ days: 1, dropped: false });
  });

  it("o andamento de um arquivo feito à mão não passa, e o jogo de depois de hoje sai", () => {
    const later = { ...withMixed.mixed.finished, "2026-10-24|misturadas-musica": game };
    const result = parseImport(
      file({ ...withMixed, mixed: { ...withMixed.mixed, finished: later } }),
      TODAY,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.mixed).toEqual({ finished: withMixed.mixed.finished, progress: {} });
    expect(result.summary.dropped).toBe(true);
  });

  it("um arquivo de antes das Misturadas (v9) entra, com o campo vazio", () => {
    const { mixed: _none, ...v9 } = { ...save, schemaVersion: 9 };
    const result = parseImport(file(v9), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.mixed).toEqual({ finished: {}, progress: {} });
  });

  it("a substituição conta os terminados daqui que o arquivo não tem e guarda o andamento daqui", () => {
    const imported: Save = { ...save, inProgress: {} };
    expect(lostGames(withMixed, imported)).toBe(1);
    expect(lostGames(withMixed, { ...imported, mixed: withMixed.mixed })).toBe(0);
    const next = replaceSave(withMixed, { ...imported, mixed: { finished: {}, progress: {} } });
    expect(next.mixed).toEqual({ finished: {}, progress: withMixed.mixed.progress });
    const done = {
      ...imported,
      mixed: { finished: { "2026-10-23|misturadas-titulo": game }, progress: {} },
    };
    expect(replaceSave(withMixed, done).mixed.progress).toEqual({});
  });
});

describe("o quiz do dia no arquivo (v12, M18)", () => {
  // Com os pontos (v13) e a família (v14): o importar os guarda (o usuário, 28/10/2026).
  const run = { number: 1, results: "rrw", points: 7, family: "estudio" };
  const withQuiz: Save = {
    ...emptySave(),
    quiz: {
      finished: { "2026-10-22|quiz": run },
      progress: { "2026-10-23|quiz": { events: [{ type: "NEXT" }] } },
    },
  };

  it("viajam só as runs terminadas, e a ida e a volta as devolvem; só elas já são um progresso", () => {
    const data = JSON.parse(exportFile(withQuiz, TODAY));
    expect(data.save.quiz).toEqual({ finished: withQuiz.quiz.finished, progress: {} });
    const result = parseImport(exportFile(withQuiz, TODAY), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.quiz).toEqual({ finished: withQuiz.quiz.finished, progress: {} });
    expect(result.summary).toMatchObject({ days: 1, dropped: false });
  });

  it("o campo estranho sai, e nem a run de depois de hoje nem o jogado depois de hoje entram", () => {
    const finished = {
      "2026-10-22|quiz": { ...run, extra: "x".repeat(50) },
      "2026-10-24|quiz": run,
      "2026-10-23|quiz": { ...run, late: true },
    };
    const result = parseImport(file({ ...withQuiz, quiz: { finished, progress: {} } }), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.quiz).toEqual({ finished: { "2026-10-22|quiz": run }, progress: {} });
    expect(result.summary.dropped).toBe(true);
  });

  it("a substituição conta as runs daqui que o arquivo não tem e guarda o andamento daqui", () => {
    const imported: Save = { ...save, inProgress: {} };
    expect(lostGames(withQuiz, imported)).toBe(1);
    const next = replaceSave(withQuiz, imported);
    expect(next.quiz).toEqual({ finished: {}, progress: withQuiz.quiz.progress });
    const done = { ...imported, quiz: { finished: { "2026-10-23|quiz": run }, progress: {} } };
    expect(replaceSave(withQuiz, done).quiz.progress).toEqual({});
  });
});
