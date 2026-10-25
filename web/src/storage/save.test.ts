import { describe, expect, it } from "vitest";
import { artists, realArtists } from "../../test/artists.ts";
import { ANIME_KEYS, DAILY_KEYS } from "../core/daily.ts";
import { MEDALS, SUPERFAN_LEVELS, superfanMedalId, superfanMedals } from "../core/medals.ts";
import { MIXED_KEYS } from "../core/mixed.ts";
import {
  emptySave,
  type FinishedGame,
  type Save,
  withArtistRight,
  withPracticeRight,
  withSeenMedals,
} from "../core/records.ts";
import { SAVE_SCHEMA_VERSION } from "./migrations.ts";
import {
  CORRUPT_KEY,
  type KeyValueStore,
  loadSave,
  memoryStore,
  openStore,
  SAVE_KEY,
  sessionStore,
  updateSave,
} from "./save.ts";

/** Um dia terminado que vale nos dois modos (no máximo 1 tentativa por rodada, sem pulo). */
const finished: FinishedGame = {
  number: 1,
  rounds: [
    { status: "won", stage: 1, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};

const valid: Save = {
  ...emptySave(),
  history: { "2026-10-08|song": finished },
  inProgress: { "2026-10-09|song": { events: [{ type: "SKIP" }, { type: "GIVE_UP" }] } },
  seenMedals: ["superfan|apple:ar:1|acertos", "superfan|apple:ar:1|completo"],
  shelf: ["superfan|apple:ar:1|completo"],
  artists: { "apple:ar:1": { right: 12, done: true }, "fixture:ar:ar01": { right: 3 } },
  practiceRight: 7,
  mixed: {
    finished: {
      "2026-10-08|misturadas-musica": {
        number: 1,
        rounds: [
          { status: "done", found: [{ stage: 0 }, { stage: 1, help: true }] },
          { status: "void", found: [null, null] },
          { status: "done", found: [null, { stage: 3 }] },
          { status: "done", found: [{ stage: 0 }, null, { stage: 2 }] },
        ],
      },
    },
    progress: {
      "2026-10-09|misturadas-titulo": {
        events: [{ type: "SEPARATE" }, { type: "GUESS", guessId: "anime:fr:x" }, { type: "SKIP" }],
      },
    },
  },
};

const withRaw = (raw: string) => memoryStore({ [SAVE_KEY]: raw });

/** O que a v8 (P289) acrescenta a um save migrado: as medalhas e o modo por artista, vazios. */
const V8 = { seenMedals: [], shelf: [], artists: {} };
/** A v9 (P308): os acertos do Treino, zerados. */
const V9 = { practiceRight: 0 };
/** E a v10 (M17): as Misturadas, vazias. */
const V10 = { mixed: { finished: {}, progress: {} } };
/** E a v12 (M18): o quiz do dia, vazio. */
const V12 = { quiz: { finished: {}, progress: {} } };
const LATEST = { ...V8, ...V9, ...V10, ...V12 };

describe("loadSave", () => {
  it("sem nada salvo: save vazio e gravável", () => {
    expect(loadSave(memoryStore())).toEqual({ save: emptySave(), writable: true, notice: null });
  });

  it("ida e volta", () => {
    const store = memoryStore();
    expect(updateSave(store, () => valid)).toBe("saved");
    expect(loadSave(store)).toEqual({ save: valid, writable: true, notice: null });
  });

  it.each([
    ["texto vazio", ""],
    ["null", "null"],
    ["lista", "[]"],
    ["não é JSON", "{isto não é json"],
    ["versão em texto", JSON.stringify({ ...valid, schemaVersion: "1" })],
  ])("corrompido (%s): começa vazio e guarda o original", (_, raw) => {
    const store = withRaw(raw);
    const result = loadSave(store);
    expect(result.save).toEqual(emptySave());
    expect(result.notice).toBe("repaired");
    expect(result.writable).toBe(true);
    expect(store.getItem(CORRUPT_KEY)).toBe(raw);
  });

  it("descarta só a entrada inválida e mantém o resto", () => {
    const raw = JSON.stringify({
      ...valid,
      inProgress: {
        ...valid.inProgress,
        "2026-10-10|song": { events: [{ type: "DANCE" }] },
        "2026-02-30|song": { events: [] },
      },
    });
    const result = loadSave(withRaw(raw));
    expect(result.save.history).toEqual(valid.history);
    expect(Object.keys(result.save.inProgress)).toEqual(["2026-10-09|song"]);
    expect(result.notice).toBe("repaired");
  });

  it.each([
    ["inProgress ausente", { schemaVersion: 3, history: valid.history }],
    ["inProgress como lista", { ...valid, inProgress: [] }],
  ])("mapa inválido (%s) vira vazio sem apagar o histórico", (_, data) => {
    const store = withRaw(JSON.stringify(data));
    const result = loadSave(store);
    expect(result.save.history).toEqual(valid.history);
    expect(result.save.inProgress).toEqual({});
    expect(result.notice).toBe("repaired");
    expect(store.getItem(CORRUPT_KEY)).toBe(JSON.stringify(data));
  });

  it("o desistir salvo nunca traz o forced do Superfan (P186): com ele, o andamento sai", () => {
    const raw = JSON.stringify({
      ...valid,
      inProgress: {
        ...valid.inProgress,
        "2026-10-10|song": { events: [{ type: "GIVE_UP", forced: true }] },
        "2026-10-11|song": { events: [{ type: "GIVE_UP" }] },
      },
    });
    const result = loadSave(withRaw(raw));
    expect(Object.keys(result.save.inProgress).sort()).toEqual([
      "2026-10-09|song",
      "2026-10-11|song",
    ]);
    expect(result.notice).toBe("repaired");
  });

  it("history como lista: o andamento válido fica", () => {
    const result = loadSave(withRaw(JSON.stringify({ ...valid, history: [] })));
    expect(result.save.history).toEqual({});
    expect(result.save.inProgress).toEqual(valid.inProgress);
    expect(result.notice).toBe("repaired");
  });

  it.each([
    ["um pulo", ["skip"]],
    ["duas tentativas", ["wrong", "right"]],
  ])("Normal com %s invalida o jogo terminado (o Desafio aceita)", (_, attempts) => {
    const game = {
      ...finished,
      rounds: [{ status: "won", stage: 1, attempts }, ...finished.rounds.slice(1)],
    };
    const history = { "2026-10-07|album": game, "2026-10-07|song": game };
    const result = loadSave(withRaw(JSON.stringify({ ...valid, history })));
    expect(Object.keys(result.save.history)).toEqual(["2026-10-07|song"]);
    expect(result.notice).toBe("repaired");
  });

  it("a ajuda (P149): o evento HELP no andamento e o help da rodada no Desafio", () => {
    const help = {
      ...finished,
      rounds: [
        { status: "won", stage: 3, attempts: ["skip", "wrong", "skip", "right"], help: 3 },
        // Pulou depois da ajuda (P163) e acertou; pulou e desistiu.
        { status: "won", stage: 4, attempts: ["skip", "skip", "skip", "skip", "right"], help: 1 },
        { status: "lost", stage: 4, attempts: ["wrong", "skip", "skip", "skip"], help: 1 },
      ],
    };
    const events = [
      { type: "SKIP" },
      { type: "HELP", options: ["a", "b", "c", "d"] },
      { type: "SKIP" },
    ];
    const data = {
      ...valid,
      history: { "2026-10-07|song": help },
      inProgress: { "2026-10-09|song": { events } },
    };
    expect(loadSave(withRaw(JSON.stringify(data)))).toEqual({
      save: data,
      writable: true,
      notice: null,
    });
  });

  it.each([
    ["no Normal", "2026-10-07|album", { status: "won", stage: 0, attempts: ["right"], help: 1 }],
    [
      "sem tentativa antes",
      "2026-10-07|song",
      { status: "won", stage: 0, attempts: ["right"], help: 0 },
    ],
    [
      "duas depois",
      "2026-10-07|song",
      { status: "lost", stage: 2, attempts: ["skip", "wrong", "wrong"], help: 1 },
    ],
    [
      "além das tentativas",
      "2026-10-07|song",
      { status: "won", stage: 0, attempts: ["right"], help: 2 },
    ],
    [
      "em texto",
      "2026-10-07|song",
      { status: "won", stage: 1, attempts: ["skip", "right"], help: "1" },
    ],
    // Depois da ajuda, pulos (P163) e, no fim, no máximo a opção; o acerto é ela.
    [
      "pulo depois da opção",
      "2026-10-07|song",
      { status: "lost", stage: 3, attempts: ["skip", "wrong", "skip"], help: 1 },
    ],
    [
      "acerto antes do pulo",
      "2026-10-07|song",
      { status: "won", stage: 2, attempts: ["skip", "right", "skip"], help: 1 },
    ],
    [
      "perdeu com a opção certa",
      "2026-10-07|song",
      { status: "lost", stage: 1, attempts: ["skip", "right"], help: 1 },
    ],
    [
      "anulada depois de escolher",
      "2026-10-07|song",
      { status: "void", stage: 1, attempts: ["skip", "wrong"], help: 1 },
    ],
    [
      "acerto sem opção",
      "2026-10-07|song",
      { status: "won", stage: 1, attempts: ["skip"], help: 1 },
    ],
  ])("ajuda inválida (%s) invalida o jogo terminado", (_, id, round) => {
    const game = { ...finished, rounds: [round, ...finished.rounds.slice(1)] };
    const result = loadSave(withRaw(JSON.stringify({ ...valid, history: { [id]: game } })));
    expect(result.save.history).toEqual({});
    expect(result.notice).toBe("repaired");
  });

  it.each([
    ["sem opções", { type: "HELP", options: [] }],
    ["uma opção só", { type: "HELP", options: ["a"] }],
    ["5 opções", { type: "HELP", options: ["a", "b", "c", "d", "e"] }],
    ["opção vazia", { type: "HELP", options: ["a", ""] }],
    ["sem a lista", { type: "HELP" }],
  ])("evento HELP inválido (%s) descarta o andamento", (_, event) => {
    const data = {
      ...valid,
      inProgress: { "2026-10-09|song": { events: [{ type: "SKIP" }, event] } },
    };
    const result = loadSave(withRaw(JSON.stringify(data)));
    expect(result.save.inProgress).toEqual({});
    expect(result.notice).toBe("repaired");
  });

  it("um save v3 de verdade chega à atual sem aviso, sem cópia e sem perder nada", () => {
    const v3 = {
      schemaVersion: 3,
      history: {
        "2026-10-11|album": finished,
        "2026-10-11|song": {
          number: 4,
          rounds: [
            { status: "won", stage: 2, attempts: ["wrong", "skip", "right"] },
            {
              status: "lost",
              stage: 5,
              attempts: ["skip", "skip", "skip", "skip", "skip", "skip"],
            },
            { status: "void", stage: 0, attempts: [] },
          ],
        },
      },
      inProgress: {
        "2026-10-12|song": { events: [{ type: "SKIP" }, { type: "GUESS", guessId: "apple:tr:1" }] },
      },
    };
    const store = withRaw(JSON.stringify(v3));
    expect(loadSave(store)).toEqual({
      save: { ...v3, ...LATEST, schemaVersion: 12 },
      writable: true,
      notice: null,
    });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    // A 1ª gravação já sai na versão atual.
    expect(updateSave(store, (s) => ({ ...s, inProgress: {} }))).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}").schemaVersion).toBe(12);
  });

  it("um save v4 de verdade, com a ajuda, chega à atual sem aviso, sem cópia e sem perder nada", () => {
    // Como os que estão no ar desde a P149: a ajuda com e sem acerto e um andamento com ela.
    const v4 = {
      schemaVersion: 4,
      history: {
        "2026-10-12|album": finished,
        "2026-10-12|song": {
          number: 5,
          rounds: [
            { status: "won", stage: 3, attempts: ["skip", "wrong", "skip", "right"], help: 3 },
            { status: "lost", stage: 1, attempts: ["wrong", "wrong"], help: 1 },
            { status: "lost", stage: 3, attempts: ["skip", "skip", "skip"], help: 3 },
          ],
        },
      },
      inProgress: {
        "2026-10-13|song": {
          events: [
            { type: "SKIP" },
            { type: "SKIP" },
            { type: "SKIP" },
            { type: "HELP", options: ["apple:tr:1", "apple:tr:2", "apple:tr:3", "apple:tr:4"] },
          ],
        },
      },
    };
    const store = withRaw(JSON.stringify(v4));
    expect(loadSave(store)).toEqual({
      save: { ...v4, ...LATEST, schemaVersion: 12 },
      writable: true,
      notice: null,
    });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
  });

  it("um save v5 de verdade chega à atual sem aviso, sem cópia e sem perder nada", () => {
    // Como os que estão no ar desde a P163: o pulo depois da ajuda e um andamento com ela.
    const v5 = {
      schemaVersion: 5,
      history: {
        "2026-10-20|album": finished,
        "2026-10-20|song": {
          number: 13,
          rounds: [
            {
              status: "won",
              stage: 4,
              attempts: ["skip", "skip", "skip", "skip", "right"],
              help: 3,
            },
            { status: "lost", stage: 4, attempts: ["wrong", "skip", "skip", "skip"], help: 1 },
            { status: "won", stage: 0, attempts: ["right"] },
          ],
        },
      },
      inProgress: {
        "2026-10-21|song": {
          events: [
            { type: "SKIP" },
            { type: "HELP", options: ["apple:tr:1", "apple:tr:2", "apple:tr:3", "apple:tr:4"] },
            { type: "SKIP" },
          ],
        },
      },
    };
    const store = withRaw(JSON.stringify(v5));
    expect(loadSave(store)).toEqual({
      save: { ...v5, ...LATEST, schemaVersion: 12 },
      writable: true,
      notice: null,
    });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    expect(updateSave(store, (s) => ({ ...s, inProgress: {} }))).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}").schemaVersion).toBe(12);
  });

  it("um save v6 de verdade chega à atual sem aviso, sem cópia e sem perder nada", () => {
    // Como os que estão no ar desde a P250: os Hits, o Anime e um andamento do Anime.
    const v6 = {
      schemaVersion: 6,
      history: {
        "2026-10-22|album": finished,
        "2026-10-22|anime-musica-facil": {
          number: 1,
          rounds: [
            {
              status: "won",
              stage: 4,
              attempts: ["skip", "skip", "skip", "skip", "right"],
              help: 3,
            },
            { status: "won", stage: 0, attempts: ["right"] },
            {
              status: "lost",
              stage: 5,
              attempts: ["skip", "skip", "skip", "skip", "skip", "skip"],
            },
          ],
        },
      },
      inProgress: { "2026-10-22|anime-titulo-dificil": { events: [{ type: "SKIP" }] } },
    };
    const store = withRaw(JSON.stringify(v6));
    expect(loadSave(store)).toEqual({
      save: { ...v6, ...LATEST, schemaVersion: 12 },
      writable: true,
      notice: null,
    });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    expect(updateSave(store, (s) => ({ ...s, inProgress: {} }))).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}").schemaVersion).toBe(12);
  });

  describe("o jogado depois (v7, P267)", () => {
    const late: FinishedGame = { ...finished, late: true };

    it("o `late: true` vai e volta", () => {
      const store = memoryStore();
      const save: Save = { ...valid, history: { ...valid.history, "2026-10-07|album": late } };
      expect(updateSave(store, () => save)).toBe("saved");
      expect(loadSave(store)).toEqual({ save, writable: true, notice: null });
    });

    it.each([
      ["false", false],
      ["1", 1],
      ["texto", "sim"],
      ["null", null],
    ])("o `late` que não é `true` (%s) descarta a entrada, e o resto fica", (_, mark) => {
      const history = { ...valid.history, "2026-10-07|album": { ...finished, late: mark } };
      const result = loadSave(withRaw(JSON.stringify({ ...valid, history })));
      expect(result.save.history).toEqual(valid.history);
      expect(result.notice).toBe("repaired");
    });
  });

  it("os 2 diários das Misturadas passam no guard do campo delas, e não no do histórico", () => {
    const game = valid.mixed.finished["2026-10-08|misturadas-musica"];
    const finished = Object.fromEntries(MIXED_KEYS.map((key) => [`2026-10-21|${key}`, game]));
    const ok = loadSave(withRaw(JSON.stringify({ ...valid, mixed: { finished, progress: {} } })));
    expect(Object.keys(ok.save.mixed.finished)).toEqual(Object.keys(finished));
    expect(ok.notice).toBeNull();
    const history = { "2026-10-21|misturadas-musica": finished };
    expect(loadSave(withRaw(JSON.stringify({ ...valid, history }))).notice).toBe("repaired");
  });

  it("todo diário de DAILY_KEYS passa no guard do save: os 2 dos Hits e os 6 do Anime", () => {
    const history = Object.fromEntries(DAILY_KEYS.map((key) => [`2026-10-21|${key}`, finished]));
    const result = loadSave(withRaw(JSON.stringify({ ...valid, history })));
    expect(Object.keys(result.save.history)).toEqual(Object.keys(history));
    expect(result.notice).toBeNull();
  });

  it("os diários e a versão do save andam juntos: diário novo sobe a versão (P250)", () => {
    // Um id só na regex passaria no guard, mas o openSaves (pelo keptProgressIds, que monta os
    // ids de cada dia com o dailyIds) apagaria o andamento dele a cada carga; e um id novo sem
    // versão nova seria apagado pela aba com o código velho.
    // As Misturadas (v10) também: os 2 ids delas andam com a versão (a v11 só marca o jogado
    // depois nelas, pelo Histórico).
    expect({ version: SAVE_SCHEMA_VERSION, keys: DAILY_KEYS, mixed: MIXED_KEYS }).toEqual({
      version: 12,
      mixed: ["misturadas-musica", "misturadas-titulo"],
      keys: [
        "album",
        "song",
        "anime-musica-facil",
        "anime-musica-medio",
        "anime-musica-dificil",
        "anime-titulo-facil",
        "anime-titulo-medio",
        "anime-titulo-dificil",
      ],
    });
  });

  describe("os diários do Anime (v6, P250)", () => {
    // As regras do Desafio: pulos, a ajuda e até 6 tentativas (o Normal recusaria os pulos).
    const desafio = {
      number: 2,
      rounds: [
        { status: "won", stage: 4, attempts: ["skip", "skip", "skip", "skip", "right"], help: 3 },
        { status: "lost", stage: 5, attempts: ["skip", "skip", "skip", "skip", "skip", "skip"] },
        { status: "void", stage: 0, attempts: [] },
      ],
    };
    const anime = {
      history: Object.fromEntries(ANIME_KEYS.map((key) => [`2026-10-21|${key}`, desafio])),
      inProgress: {
        "2026-10-21|anime-titulo-dificil": {
          events: [{ type: "SKIP" }, { type: "HELP", options: ["a", "b", "c", "d"] }],
        },
      },
    };

    it("os 6 ids sobrevivem à carga e à gravação, com as regras do Desafio", () => {
      const store = withRaw(JSON.stringify({ schemaVersion: 6, ...anime }));
      expect(loadSave(store)).toEqual({
        save: { ...emptySave(), ...anime },
        writable: true,
        notice: null,
      });
      const withHits = (s: Save): Save => ({ ...s, history: { ...s.history, ...valid.history } });
      expect(updateSave(store, withHits)).toBe("saved");
      expect(loadSave(store)).toMatchObject({
        save: { inProgress: anime.inProgress },
        notice: null,
      });
      expect(Object.keys(loadSave(store).save.history)).toHaveLength(7);
    });

    it("e às migrações: num save v5, da 5 à 8 não sai nenhum", () => {
      const store = withRaw(JSON.stringify({ schemaVersion: 5, ...anime }));
      expect(loadSave(store)).toEqual({
        save: { ...emptySave(), ...anime },
        writable: true,
        notice: null,
      });
    });

    it("id fora da lista e jogo sem as 3 rodadas são descartados", () => {
      const history = {
        "2026-10-21|anime-musica-extremo": desafio,
        "2026-10-21|anime-album-facil": desafio,
        "2026-10-21|anime": desafio,
        "2026-10-21|anime-musica-facil": { ...desafio, rounds: desafio.rounds.slice(0, 2) },
        "2026-10-21|anime-musica-medio": desafio,
      };
      const result = loadSave(withRaw(JSON.stringify({ ...valid, history })));
      expect(Object.keys(result.save.history)).toEqual(["2026-10-21|anime-musica-medio"]);
      expect(result.notice).toBe("repaired");
    });
  });

  it("Desafio: até 6 tentativas; a 7ª invalida o jogo terminado", () => {
    const withAttempts = (n: number) => ({
      ...finished,
      rounds: [
        { status: "lost", stage: 5, attempts: Array.from({ length: n }, () => "wrong") },
        ...finished.rounds.slice(1),
      ],
    });
    const history = { "2026-10-06|song": withAttempts(6), "2026-10-07|song": withAttempts(7) };
    const result = loadSave(withRaw(JSON.stringify({ ...valid, history })));
    expect(Object.keys(result.save.history)).toEqual(["2026-10-06|song"]);
    expect(result.notice).toBe("repaired");
  });

  it("campo que o save não usa mais (o settings da v2) sai sem aviso", () => {
    const result = loadSave(
      withRaw(JSON.stringify({ ...valid, settings: { answerMode: "typing" } })),
    );
    expect(result).toEqual({ save: valid, writable: true, notice: null });
  });

  it("se nem a cópia do corrompido der para gravar, não grava nada nesta sessão", () => {
    const readOnly: KeyValueStore = {
      getItem: (key) => (key === SAVE_KEY ? "lixo" : null),
      setItem: () => {
        throw new DOMException("cheio", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(loadSave(readOnly)).toMatchObject({ writable: false, notice: "repaired" });
    expect(updateSave(readOnly, () => valid)).toBe("unavailable");
  });

  it("rodada com etapa fora do intervalo invalida o jogo terminado", () => {
    const bad = {
      ...finished,
      rounds: [{ status: "won", stage: 9, attempts: [] }, ...finished.rounds.slice(1)],
    };
    const result = loadSave(
      withRaw(JSON.stringify({ ...valid, history: { "2026-10-08|song": bad } })),
    );
    expect(result.save.history).toEqual({});
  });

  it("guarda o corrompido uma vez só (não sobrescreve a primeira cópia)", () => {
    const store = withRaw("lixo 1");
    loadSave(store);
    store.setItem(SAVE_KEY, "lixo 2");
    loadSave(store);
    expect(store.getItem(CORRUPT_KEY)).toBe("lixo 1");
  });

  it.each([
    [
      // Um save v1 de verdade, como o site publicado gravava antes do M11.
      "v1 (parada fictícia, P68)",
      {
        schemaVersion: 1,
        settings: { answerMode: "typing" },
        history: { "2026-10-11|song": { answerMode: "typing", ...finished } },
        inProgress: { "2026-10-12|album": { answerMode: "choice", events: [{ type: "SKIP" }] } },
      },
    ],
    [
      // Um save v2 de verdade, com o modo de resposta (antes dos dois modos, P100).
      "v2 (modo de resposta, P100)",
      {
        schemaVersion: 2,
        settings: { answerMode: "choice" },
        history: { "2026-10-11|album": { answerMode: "choice", ...finished } },
        inProgress: { "2026-10-12|song": { answerMode: "typing", events: [{ type: "SKIP" }] } },
      },
    ],
  ])("save %s vira o atual vazio, sem aviso nem cópia", (_, old) => {
    const store = withRaw(JSON.stringify(old));
    expect(loadSave(store)).toEqual({ save: emptySave(), writable: true, notice: null });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    // A 1ª gravação do jogo novo já sai na versão atual.
    expect(updateSave(store, (s) => ({ ...s, history: valid.history }))).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}")).toEqual({
      ...emptySave(),
      history: valid.history,
    });
  });

  it("versão futura: não lê e não grava por cima", () => {
    const raw = JSON.stringify({ ...valid, schemaVersion: SAVE_SCHEMA_VERSION + 1 });
    const store = withRaw(raw);
    expect(loadSave(store)).toMatchObject({ writable: false, notice: "future" });
    expect(updateSave(store, () => valid)).toBe("future");
    expect(store.getItem(SAVE_KEY)).toBe(raw);
  });

  it("armazenamento que lança na leitura: não gravável", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadSave(broken)).toMatchObject({ writable: false, notice: "unavailable" });
  });
});

describe("as medalhas e o modo por artista (v8, P289)", () => {
  it("todo id de medalha do Superfan passa no guard, com o id de artista do schema", () => {
    const ids = ["apple:ar:1489581870", "fixture:ar:ar01", "apple:ar:A-b_9"].flatMap((artist) =>
      SUPERFAN_LEVELS.map((level) => superfanMedalId(artist, level)),
    );
    const store = memoryStore();
    expect(updateSave(store, (s) => withSeenMedals(s, ids))).toBe("saved");
    expect(loadSave(store)).toMatchObject({ save: { seenMedals: [...ids].sort() }, notice: null });
  });

  it.each([
    ["um id que não é texto", { seenMedals: ["a", 3] }, { seenMedals: ["a"] }],
    ["um id com espaço", { seenMedals: ["a b", "c"] }, { seenMedals: ["c"] }],
    ["um id repetido", { seenMedals: ["a", "a"] }, { seenMedals: ["a"] }],
    ["a estante com mais de 3", { shelf: ["a", "b", "c", "d"] }, { shelf: ["a", "b", "c"] }],
    ["um artista sem o formato do schema", { artists: { "ar:1": { right: 1 } } }, { artists: {} }],
    ["um acerto negativo", { artists: { "apple:ar:1": { right: -1 } } }, { artists: {} }],
    [
      "um fim que não é true",
      { artists: { "apple:ar:1": { right: 2, done: false } } },
      { artists: {} },
    ],
    ["as medalhas que não são lista", { seenMedals: "a" }, { seenMedals: [] }],
    ["as medalhas ausentes num save v8", { seenMedals: undefined }, { seenMedals: [] }],
    ["os acertos do Treino ausentes", { practiceRight: undefined }, { practiceRight: 0 }],
    ["um acerto do Treino negativo", { practiceRight: -1 }, { practiceRight: 0 }],
    ["um acerto do Treino que não é inteiro", { practiceRight: 2.5 }, { practiceRight: 0 }],
    ["um acerto do Treino em texto", { practiceRight: "3" }, { practiceRight: 0 }],
  ])("descarta %s e avisa o reparo", (_, broken, kept) => {
    const result = loadSave(withRaw(JSON.stringify({ ...valid, ...broken })));
    expect(result.notice).toBe("repaired");
    // `toEqual` em cada campo: o `toMatchObject` com `{}` casaria com qualquer mapa.
    for (const [field, value] of Object.entries(kept)) {
      expect(result.save[field as keyof Save]).toEqual(value);
    }
    expect(result.save.history).toEqual(valid.history);
  });

  it("os ids de artista das listas (as fictícias e a real) passam no guard, com os das medalhas", () => {
    const ids = [...artists.list.artists, ...realArtists.list.artists].map((a) => a.id);
    expect(ids.length).toBeGreaterThan(10);
    const store = memoryStore();
    for (const id of ids) updateSave(store, (s) => withArtistRight(s, id));
    const medals = [
      ...MEDALS.map((m) => m.id),
      ...ids.flatMap((id) => superfanMedals(id).map((m) => m.id)),
    ];
    updateSave(store, (s) => withSeenMedals(s, medals));
    const loaded = loadSave(store);
    expect(loaded.notice).toBeNull();
    expect(Object.keys(loaded.save.artists).sort()).toEqual([...ids].sort());
    expect(loaded.save.seenMedals).toEqual([...new Set(medals)].sort());
  });

  it("a perfeita sem a terminada não vale (a perfeita é também terminada)", () => {
    const raw = { ...valid, artists: { "apple:ar:1": { right: 2, perfect: true } } };
    const result = loadSave(withRaw(JSON.stringify(raw)));
    expect(result.notice).toBe("repaired");
    expect(result.save.artists).toEqual({});
  });

  it("um save v7 de verdade, com o jogado depois, chega à atual sem aviso, sem cópia e sem perder nada", () => {
    const v7 = {
      schemaVersion: 7,
      history: {
        "2026-10-22|song": finished,
        "2026-10-21|album": { ...finished, number: 13, late: true },
      },
      inProgress: { "2026-10-22|anime-musica-facil": { events: [{ type: "SKIP" }] } },
    };
    const store = withRaw(JSON.stringify(v7));
    expect(loadSave(store)).toEqual({
      save: { ...v7, ...LATEST, schemaVersion: 12 },
      writable: true,
      notice: null,
    });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    expect(updateSave(store, (s) => withArtistRight(s, "apple:ar:1"))).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}")).toMatchObject({
      schemaVersion: 12,
      history: v7.history,
    });
  });

  it("o maior id de artista que o guard aceita ainda dá ids de medalha que ele aceita", () => {
    const longest = `${"a".repeat(16)}:ar:${"9".repeat(64)}`;
    const store = memoryStore();
    const ids = SUPERFAN_LEVELS.map((level) => superfanMedalId(longest, level));
    updateSave(store, (s) => withSeenMedals(withArtistRight(s, longest), ids));
    expect(loadSave(store)).toMatchObject({ notice: null });
    expect(loadSave(store).save.seenMedals).toEqual([...ids].sort());
    expect(loadSave(store).save.artists).toEqual({ [longest]: { right: 1 } });
    // Um caractere a mais no id do artista: fora, como reparo.
    const raw = { ...valid, artists: { [`${longest}9`]: { right: 1 } } };
    expect(loadSave(withRaw(JSON.stringify(raw)))).toMatchObject({ notice: "repaired" });
  });

  it("a ordem das avisadas se arruma sem reparo; a da estante é a da pessoa", () => {
    const raw = { ...valid, seenMedals: ["b", "a"], shelf: ["z", "a"] };
    expect(loadSave(withRaw(JSON.stringify(raw)))).toMatchObject({
      save: { seenMedals: ["a", "b"], shelf: ["z", "a"] },
      notice: null,
    });
  });

  it("duas abas: os acertos e as avisadas de cada uma se somam", () => {
    const store = memoryStore();
    updateSave(store, (s) => withArtistRight(s, "apple:ar:1"));
    updateSave(store, (s) => withSeenMedals(withArtistRight(s, "apple:ar:1"), ["a"]));
    updateSave(store, (s) => withSeenMedals(withPracticeRight(s), ["b"]));
    updateSave(store, withPracticeRight);
    expect(loadSave(store).save).toMatchObject({
      seenMedals: ["a", "b"],
      artists: { "apple:ar:1": { right: 2 } },
      practiceRight: 2,
    });
  });
});

describe("os acertos do Treino (v9, P308)", () => {
  it("um save v8 de verdade chega à atual sem aviso e com o Treino zerado", () => {
    const v8 = {
      schemaVersion: 8,
      history: { "2026-10-22|album": finished },
      inProgress: {},
      seenMedals: ["superfan|apple:ar:1|acertos"],
      shelf: [],
      artists: { "apple:ar:1": { right: 50 } },
    };
    const store = withRaw(JSON.stringify(v8));
    expect(loadSave(store)).toEqual({
      save: { ...v8, ...V9, ...V10, ...V12, schemaVersion: 12 },
      writable: true,
      notice: null,
    });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    expect(updateSave(store, withPracticeRight)).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}")).toMatchObject({
      schemaVersion: 12,
      practiceRight: 1,
      artists: v8.artists,
    });
  });

  it("o total vai e volta pelo save, sem reparo", () => {
    const store = withRaw(JSON.stringify(valid));
    expect(loadSave(store)).toMatchObject({ save: { practiceRight: 7 }, notice: null });
  });
});

describe("as Misturadas (v10, M17)", () => {
  const game = valid.mixed.finished["2026-10-08|misturadas-musica"];
  const round = game?.rounds[0];

  it.each([
    ["um id que não é das Misturadas", { "2026-10-08|song": game }],
    ["um id com a data impossível", { "2026-02-30|misturadas-musica": game }],
    ["3 rodadas", { "2026-10-08|misturadas-musica": { number: 1, rounds: game?.rounds.slice(1) } }],
    [
      "uma rodada com 1 música",
      {
        "2026-10-08|misturadas-musica": {
          number: 1,
          rounds: [{ status: "done", found: [{ stage: 0 }] }, ...(game?.rounds.slice(1) ?? [])],
        },
      },
    ],
    [
      "um trecho além do último",
      {
        "2026-10-08|misturadas-musica": {
          number: 1,
          rounds: [{ ...round, found: [{ stage: 4 }, null] }, ...(game?.rounds.slice(1) ?? [])],
        },
      },
    ],
    [
      "a anulada com uma achada",
      {
        "2026-10-08|misturadas-musica": {
          number: 1,
          rounds: [
            { status: "void", found: [{ stage: 0 }, null] },
            ...(game?.rounds.slice(1) ?? []),
          ],
        },
      },
    ],
    [
      "a ajuda que não é true",
      {
        "2026-10-08|misturadas-musica": {
          number: 1,
          rounds: [
            { ...round, found: [{ stage: 0, help: 1 }, null] },
            ...(game?.rounds.slice(1) ?? []),
          ],
        },
      },
    ],
  ])("descarta o terminado com %s e avisa o reparo", (_, finished) => {
    const raw = { ...valid, mixed: { ...valid.mixed, finished } };
    const result = loadSave(withRaw(JSON.stringify(raw)));
    expect(result.notice).toBe("repaired");
    expect(result.save.mixed.finished).toEqual({});
    expect(result.save.mixed.progress).toEqual(valid.mixed.progress);
  });

  it.each([
    ["um evento dos diários", { events: [{ type: "HELP", options: ["a", "b"] }] }],
    ["um palpite vazio", { events: [{ type: "GUESS", guessId: "" }] }],
    ["sem a lista", {}],
  ])("descarta o andamento com %s", (_, saved) => {
    const raw = {
      ...valid,
      mixed: { ...valid.mixed, progress: { "2026-10-09|misturadas-titulo": saved } },
    };
    const result = loadSave(withRaw(JSON.stringify(raw)));
    expect(result.notice).toBe("repaired");
    expect(result.save.mixed.progress).toEqual({});
    expect(result.save.mixed.finished).toEqual(valid.mixed.finished);
  });

  it("o campo ausente ou fora do formato vira vazio, como reparo, sem levar o resto", () => {
    for (const mixed of [undefined, [], { finished: [] }]) {
      const result = loadSave(withRaw(JSON.stringify({ ...valid, mixed })));
      expect(result.notice).toBe("repaired");
      expect(result.save.mixed).toEqual(V10.mixed);
      expect(result.save.history).toEqual(valid.history);
    }
  });
});

describe("updateSave", () => {
  it("cota cheia: devolve false e o jogo continua", () => {
    const full: KeyValueStore = {
      ...memoryStore(),
      getItem: () => null,
      setItem: () => {
        throw new DOMException("cheio", "QuotaExceededError");
      },
    };
    expect(updateSave(full, () => valid)).toBe("full");
  });

  it("save reparado é regravado limpo mesmo sem mudança", () => {
    const raw = JSON.stringify({
      ...valid,
      inProgress: { "2026-10-10|song": { events: [{ type: "DANCE" }] } },
    });
    const store = withRaw(raw);
    expect(updateSave(store, (s) => s)).toBe("saved");
    expect(loadSave(store)).toEqual({
      save: { ...valid, inProgress: {} },
      writable: true,
      notice: null,
    });
  });

  it("relê antes de gravar: mudança de outra aba não se perde", () => {
    const store = memoryStore();
    updateSave(store, () => valid);
    // "Outra aba" grava um dia terminado novo direto no armazenamento.
    const other = { ...valid, history: { ...valid.history, "2026-10-09|song": finished } };
    store.setItem(SAVE_KEY, JSON.stringify(other));
    // Esta aba grava algo sem saber do dia 9: a mudança da outra continua lá.
    updateSave(store, (s) => ({ ...s, inProgress: {} }));
    expect(Object.keys(loadSave(store).save.history).sort()).toEqual([
      "2026-10-08|song",
      "2026-10-09|song",
    ]);
  });
});

describe("sessionStore (o save da sessão, mesmo quando o navegador não grava)", () => {
  const full = (initial: Record<string, string>): KeyValueStore => {
    const real = memoryStore(initial);
    return {
      ...real,
      setItem: () => {
        throw new DOMException("cheio", "QuotaExceededError");
      },
    };
  };

  it("gravável: grava no navegador normalmente", () => {
    const real = memoryStore();
    const store = sessionStore(real, loadSave(real));
    expect(updateSave(store, () => valid)).toBe("saved");
    expect(loadSave(real).save).toEqual(valid);
  });

  it("gravável: o que outra aba gravou depois continua visível (a memória não esconde)", () => {
    const real = memoryStore();
    const store = sessionStore(real, loadSave(real));
    updateSave(store, () => valid);
    const other = { ...valid, history: { ...valid.history, "2026-10-09|song": finished } };
    real.setItem(SAVE_KEY, JSON.stringify(other)); // "outra aba"
    expect(Object.keys(loadSave(store).save.history)).toContain("2026-10-09|song");
  });

  it("cota cheia: avisa 'full', mas a sessão continua lendo o que tentou gravar", () => {
    const real = full({});
    const store = sessionStore(real, loadSave(real));
    expect(updateSave(store, () => valid)).toBe("full");
    // Trocar de aba relê o save: o andamento desta sessão tem de estar lá.
    expect(loadSave(store).save).toEqual(valid);
  });

  it("não gravável (versão futura): a sessão grava em memória, sem tocar no navegador", () => {
    const raw = JSON.stringify({ ...valid, schemaVersion: SAVE_SCHEMA_VERSION + 1 });
    const real = withRaw(raw);
    const loaded = loadSave(real);
    const store = sessionStore(real, loaded);
    expect(updateSave(store, (s) => ({ ...s, history: valid.history }))).toBe("saved");
    expect(loadSave(store).save.history).toEqual(valid.history);
    expect(real.getItem(SAVE_KEY)).toBe(raw);
  });
});

describe("openStore", () => {
  it("usa o armazenamento quando a sonda funciona", () => {
    const real = memoryStore();
    expect(openStore(() => real)).toEqual({ store: real, persistent: true });
  });

  it("cota cheia: a sonda só lê, então o save que já existe continua valendo", () => {
    const saved = JSON.stringify(valid);
    const full: KeyValueStore = {
      getItem: (key) => (key === SAVE_KEY ? saved : null),
      setItem: () => {
        throw new DOMException("cheio", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    const { store, persistent } = openStore(() => full);
    expect(persistent).toBe(true);
    expect(loadSave(store).save).toEqual(valid);
    expect(updateSave(store, (s) => ({ ...s, history: {} }))).toBe("full");
  });

  it.each([
    [
      "getter que lança (cookies bloqueados)",
      () => {
        throw new Error("SecurityError");
      },
    ],
    ["armazenamento ausente", () => null],
  ])("cai para a memória: %s", (_, getter) => {
    const { store, persistent } = openStore(getter as () => KeyValueStore | null);
    expect(persistent).toBe(false);
    store.setItem("x", "1");
    expect(store.getItem("x")).toBe("1");
  });
});

describe("o quiz do dia no save (v12, M18)", () => {
  it("as runs terminadas e os andamentos que valem ficam; o que não vale sai, e vira reparo", () => {
    const quiz = {
      finished: {
        "2026-10-24|quiz": { number: 1, results: "rrw" },
        "2026-10-23|quiz": { number: 2, results: "rrw", late: true },
        "2026-10-22|quiz": { number: 3, results: "" }, // nenhuma rodada
        "2026-10-21|quiz": { number: 4, results: "rrx" }, // letra fora
        "2026-10-20|quiz": { number: 0, results: "r" }, // número fora
        "2026-10-19|quiz": { number: 5, results: "r", late: false },
        "2026-02-30|quiz": { number: 6, results: "r" }, // data impossível
        "2026-10-18|misturadas-musica": { number: 7, results: "r" }, // id de outro jogo
      },
      progress: {
        "2026-10-25|quiz": {
          events: [
            { type: "CHOOSE", round: 0, side: "a" },
            { type: "NEXT" },
            { type: "VOID", round: 1 },
          ],
        },
        "2026-10-17|quiz": { events: [{ type: "CHOOSE", round: 0, side: "c" }] },
        "2026-10-16|quiz": { events: [{ type: "VOID", round: -1 }] },
        "2026-10-15|quiz": { events: [{ type: "PULAR" }] },
      },
    };
    const store = withRaw(JSON.stringify({ ...emptySave(), quiz }));
    const { save, notice } = loadSave(store);
    expect(notice).toBe("repaired");
    expect(save.quiz).toEqual({
      finished: {
        "2026-10-24|quiz": { number: 1, results: "rrw" },
        "2026-10-23|quiz": { number: 2, results: "rrw", late: true },
      },
      progress: { "2026-10-25|quiz": quiz.progress["2026-10-25|quiz"] },
    });
  });

  it("sem o campo do quiz numa v12, ele volta vazio, como reparo", () => {
    const { quiz: _quiz, ...rest } = emptySave();
    const { save, notice } = loadSave(withRaw(JSON.stringify(rest)));
    expect(notice).toBe("repaired");
    expect(save.quiz).toEqual({ finished: {}, progress: {} });
  });
});
