import { describe, expect, it } from "vitest";
import { emptySave, type FinishedGame, type SaveV1 } from "../core/records.ts";
import {
  CORRUPT_KEY,
  type KeyValueStore,
  loadSave,
  memoryStore,
  openStore,
  SAVE_KEY,
  updateSave,
} from "./save.ts";

const finished: FinishedGame = {
  answerMode: "choice",
  number: 1,
  rounds: [
    { status: "won", stage: 1, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};

const valid: SaveV1 = {
  schemaVersion: 1,
  settings: {},
  history: { "2026-10-08|song": finished },
  inProgress: {
    "2026-10-09|song": {
      answerMode: "choice",
      events: [{ type: "LISTEN_MORE" }, { type: "GIVE_UP" }],
    },
  },
};

const withRaw = (raw: string) => memoryStore({ [SAVE_KEY]: raw });

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
        "2026-10-10|song": { answerMode: "choice", events: [{ type: "DANCE" }] },
        "2026-02-30|song": { answerMode: "choice", events: [] },
      },
    });
    const result = loadSave(withRaw(raw));
    expect(result.save.history).toEqual(valid.history);
    expect(Object.keys(result.save.inProgress)).toEqual(["2026-10-09|song"]);
    expect(result.notice).toBe("repaired");
  });

  it.each([
    ["inProgress ausente", { schemaVersion: 1, settings: {}, history: valid.history }],
    ["inProgress como lista", { ...valid, inProgress: [] }],
  ])("mapa inválido (%s) vira vazio sem apagar o histórico", (_, data) => {
    const store = withRaw(JSON.stringify(data));
    const result = loadSave(store);
    expect(result.save.history).toEqual(valid.history);
    expect(result.save.inProgress).toEqual({});
    expect(result.notice).toBe("repaired");
    expect(store.getItem(CORRUPT_KEY)).toBe(JSON.stringify(data));
  });

  it("history como lista: o andamento válido fica", () => {
    const result = loadSave(withRaw(JSON.stringify({ ...valid, history: [] })));
    expect(result.save.history).toEqual({});
    expect(result.save.inProgress).toEqual(valid.inProgress);
    expect(result.notice).toBe("repaired");
  });

  it("preferência desconhecida na v1 é descartada com aviso de reparo", () => {
    const result = loadSave(withRaw(JSON.stringify({ ...valid, settings: { mode: "typing" } })));
    expect(result.save.settings).toEqual({});
    expect(result.save.history).toEqual(valid.history);
    expect(result.notice).toBe("repaired");
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

  it("versão futura: não lê e não grava por cima", () => {
    const raw = JSON.stringify({ ...valid, schemaVersion: 2 });
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
      inProgress: { "2026-10-10|song": { answerMode: "choice", events: [{ type: "DANCE" }] } },
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
    updateSave(store, (s) => ({ ...s, settings: {} }));
    expect(Object.keys(loadSave(store).save.history).sort()).toEqual([
      "2026-10-08|song",
      "2026-10-09|song",
    ]);
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
