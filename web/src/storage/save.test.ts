import { describe, expect, it } from "vitest";
import { emptySave, type FinishedGame, type Save } from "../core/records.ts";
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
  schemaVersion: 3,
  history: { "2026-10-08|song": finished },
  inProgress: { "2026-10-09|song": { events: [{ type: "SKIP" }, { type: "GIVE_UP" }] } },
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
  ])("save %s vira v3 vazio, sem aviso nem cópia", (_, old) => {
    const store = withRaw(JSON.stringify(old));
    expect(loadSave(store)).toEqual({ save: emptySave(), writable: true, notice: null });
    expect(store.getItem(CORRUPT_KEY)).toBeNull();
    // A 1ª gravação do jogo novo já sai em v3.
    expect(updateSave(store, (s) => ({ ...s, history: valid.history }))).toBe("saved");
    expect(JSON.parse(store.getItem(SAVE_KEY) ?? "{}")).toEqual({
      schemaVersion: 3,
      history: valid.history,
      inProgress: {},
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
