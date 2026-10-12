import { describe, expect, it } from "vitest";
import { MIGRATIONS, migrate, SAVE_SCHEMA_VERSION } from "./migrations.ts";

describe("migrate", () => {
  it("a versão atual passa sem mudança", () => {
    const data = { schemaVersion: SAVE_SCHEMA_VERSION, history: {} };
    expect(migrate(data, SAVE_SCHEMA_VERSION)).toBe(data);
  });

  it("toda versão anterior à atual tem migração", () => {
    for (let v = 1; v < SAVE_SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v], `falta a migração v${v} → v${v + 1}`).toBeTypeOf("function");
    }
  });

  it("v1 → v2 guarda só a preferência (P68)", () => {
    const v1 = {
      schemaVersion: 1,
      settings: { answerMode: "typing" },
      history: { x: 1 },
      inProgress: { y: 2 },
    };
    expect(MIGRATIONS[1]?.(v1)).toEqual({
      settings: { answerMode: "typing" },
      history: {},
      inProgress: {},
    });
    expect(MIGRATIONS[1]?.({ schemaVersion: 1 })).toMatchObject({ settings: {} });
  });

  it("v2 → v3 zera tudo, inclusive a preferência do modo de resposta (P100)", () => {
    // Um save v2 de verdade: preferência, um dia terminado e um em andamento.
    const v2 = {
      schemaVersion: 2,
      settings: { answerMode: "choice" },
      history: {
        "2026-10-11|album": {
          answerMode: "choice",
          number: 1,
          rounds: [{ status: "won", stage: 0, attempts: ["right"] }],
        },
      },
      inProgress: { "2026-10-12|song": { answerMode: "typing", events: [{ type: "SKIP" }] } },
    };
    expect(MIGRATIONS[2]?.(v2)).toEqual({ history: {}, inProgress: {} });
    expect(migrate(v2, 2)).toEqual({ schemaVersion: 5, history: {}, inProgress: {} });
  });

  it("v3 → v4 guarda tudo como está: a ajuda (P149) só acrescenta", () => {
    // Um save v3 de verdade: dois dias terminados (3 rodadas cada) e um em andamento.
    const v3 = {
      schemaVersion: 3,
      history: {
        "2026-10-11|album": {
          number: 1,
          rounds: [
            { status: "won", stage: 0, attempts: ["right"] },
            { status: "lost", stage: 1, attempts: ["wrong"] },
            { status: "void", stage: 0, attempts: [] },
          ],
        },
        "2026-10-11|song": {
          number: 1,
          rounds: [
            { status: "lost", stage: 5, attempts: [] },
            { status: "won", stage: 0, attempts: ["right"] },
            { status: "won", stage: 1, attempts: ["skip", "right"] },
          ],
        },
      },
      inProgress: {
        "2026-10-12|song": { events: [{ type: "SKIP" }, { type: "GUESS", guessId: "x" }] },
      },
    };
    expect(MIGRATIONS[3]?.(v3)).toEqual(v3);
    expect(migrate(v3, 3)).toEqual({ ...v3, schemaVersion: 5 });
  });

  it("v4 → v5 guarda tudo como está: o pulo depois da ajuda (P163) só acrescenta", () => {
    // Um save v4 de verdade: um dia do Desafio com a ajuda e um em andamento com ela pedida.
    const v4 = {
      schemaVersion: 4,
      history: {
        "2026-10-12|song": {
          number: 2,
          rounds: [
            { status: "won", stage: 3, attempts: ["skip", "wrong", "skip", "right"], help: 3 },
            { status: "lost", stage: 3, attempts: ["wrong", "wrong", "wrong", "wrong"], help: 3 },
            { status: "won", stage: 0, attempts: ["right"] },
          ],
        },
      },
      inProgress: {
        "2026-10-13|song": {
          events: [
            { type: "SKIP" },
            { type: "SKIP" },
            { type: "SKIP" },
            { type: "HELP", options: ["a", "b", "c", "d"] },
          ],
        },
      },
    };
    expect(MIGRATIONS[4]?.(v4)).toEqual(v4);
    expect(migrate(v4, 4)).toEqual({ ...v4, schemaVersion: 5 });
  });

  it("v1 vai até a atual passando por todas", () => {
    expect(migrate({ schemaVersion: 1, settings: { answerMode: "typing" } }, 1)).toEqual({
      schemaVersion: 5,
      history: {},
      inProgress: {},
    });
  });

  it("versão sem migração conhecida dá erro", () => {
    expect(() => migrate({}, 0)).toThrow(/migração/);
  });
});
