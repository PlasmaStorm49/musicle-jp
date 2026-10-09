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

  it("versão sem migração conhecida dá erro", () => {
    expect(() => migrate({}, 0)).toThrow(/migração/);
  });
});
