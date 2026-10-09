import { describe, expect, it } from "vitest";
import { addDays, dateInZone } from "./dates.ts";

describe("dateInZone", () => {
  it("os testes rodam com fuso de Tóquio, para pegar uso da hora local por engano", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Tokyo");
  });

  it("vira o dia à meia-noite de Brasília", () => {
    expect(dateInZone(new Date("2026-10-09T02:59:59.999Z"))).toBe("2026-10-08");
    expect(dateInZone(new Date("2026-10-09T03:00:00.000Z"))).toBe("2026-10-09");
  });

  it("não usa a data local (em Tóquio já é dia 9)", () => {
    expect(dateInZone(new Date("2026-10-08T15:30:00Z"))).toBe("2026-10-08");
  });

  it("usa o fuso pelo nome: em 2019 havia horário de verão (-02:00)", () => {
    // Com -03:00 fixo daria 2019-01-14.
    expect(dateInZone(new Date("2019-01-15T02:30:00Z"))).toBe("2019-01-15");
  });

  it("aceita outro fuso", () => {
    expect(dateInZone(new Date("2026-10-08T15:30:00Z"), "Asia/Tokyo")).toBe("2026-10-09");
  });
});

describe("addDays", () => {
  it.each([
    ["2026-10-08", 1, "2026-10-09"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-10-08", -8, "2026-09-30"],
    ["2026-10-08", 0, "2026-10-08"],
  ])("%s + %i = %s", (day, n, expected) => {
    expect(addDays(day, n)).toBe(expected);
  });

  it("recusa data fora do formato", () => {
    expect(() => addDays("08/10/2026", 1)).toThrow(RangeError);
  });
});
