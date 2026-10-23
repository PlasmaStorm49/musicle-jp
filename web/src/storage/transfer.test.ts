import { describe, expect, it } from "vitest";
import { emptySave, type FinishedGame, type Save } from "../core/records.ts";
import { SAVE_SCHEMA_VERSION } from "./migrations.ts";
import { readSave } from "./save.ts";
import {
  exportFile,
  exportFileName,
  lostDays,
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

  it("leva o save sem o andamento (P26), com a marca e a data", () => {
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
    expect(result.summary).toEqual({
      exportedOn: TODAY,
      days: 2,
      games: 3,
      medals: 2,
      dropped: false,
    });
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
    expect(result.summary).toMatchObject({ days: 2, games: 2, dropped: true });
  });

  it("a entrada que não vale fica de fora, e o resumo diz", () => {
    const odd = { ...save, history: { ...save.history, "2026-10-19|album": { number: 0 } } };
    const result = parseImport(file(odd), TODAY);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.history).not.toHaveProperty("2026-10-19|album");
    expect(result.summary.dropped).toBe(true);
  });

  it("o andamento de um arquivo feito à mão não passa (P26)", () => {
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

describe("lostDays (o que a substituição tira daqui)", () => {
  it("conta os dias jogados aqui que o arquivo não tem", () => {
    const current: Save = {
      ...emptySave(),
      history: {
        "2026-10-20|album": finished, // o arquivo também tem: não sai
        "2026-10-22|album": finished,
        "2026-10-22|song": finished, // o mesmo dia: um só
        "2026-10-23|album": finished,
      },
    };
    expect(lostDays(current, save)).toBe(2);
    expect(lostDays(emptySave(), save)).toBe(0);
  });
});

describe("replaceSave (P24)", () => {
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
