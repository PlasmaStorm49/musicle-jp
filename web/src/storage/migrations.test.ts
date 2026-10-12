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
    expect(migrate(v2, 2)).toEqual({ schemaVersion: 3, history: {}, inProgress: {} });
  });

  it("v1 vai até a v3 passando pela v2", () => {
    expect(migrate({ schemaVersion: 1, settings: { answerMode: "typing" } }, 1)).toEqual({
      schemaVersion: 3,
      history: {},
      inProgress: {},
    });
  });

  it("versão sem migração conhecida dá erro", () => {
    expect(() => migrate({}, 0)).toThrow(/migração/);
  });
});
