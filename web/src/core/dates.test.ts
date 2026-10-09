import { describe, expect, it } from "vitest";
import {
  addDays,
  dateInZone,
  formatHms,
  isValidDate,
  msUntilNextDay,
  startOfDayInZone,
} from "./dates.ts";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("startOfDayInZone", () => {
  it("dia comum em São Paulo começa às 03:00Z", () => {
    expect(iso(startOfDayInZone("2026-10-09"))).toBe("2026-10-09T03:00:00.000Z");
  });

  it("dia sem meia-noite (início do horário de verão de 2018) começa à 01:00 local", () => {
    // Em 04/11/2018 o relógio saltou de 23:59:59 para 01:00 (-02:00): 01:00 local = 03:00Z.
    expect(iso(startOfDayInZone("2018-11-04"))).toBe("2018-11-04T03:00:00.000Z");
  });

  it("dia de 25 h (fim do horário de verão de 2019)", () => {
    const start = startOfDayInZone("2019-02-16");
    const next = startOfDayInZone("2019-02-17");
    expect(iso(start)).toBe("2019-02-16T02:00:00.000Z");
    expect((next - start) / HOUR).toBe(25);
  });

  it("funciona em outro fuso", () => {
    expect(iso(startOfDayInZone("2026-10-09", "Asia/Tokyo"))).toBe("2026-10-08T15:00:00.000Z");
  });

  it("aceita o fuso mais extremo (+14 h) e recusa data mal formada", () => {
    expect(() => startOfDayInZone("2026-10-09", "Etc/GMT-14")).not.toThrow();
    expect(() => startOfDayInZone("data ruim")).toThrow(RangeError);
  });
});

describe("msUntilNextDay", () => {
  it("às 12:00Z de 08/10 faltam 15 h para o dia 9", () => {
    expect(msUntilNextDay(Date.parse("2026-10-08T12:00:00Z"), "2026-10-08")).toBe(15 * HOUR);
  });

  it("quem joga o dia 8 depois da meia-noite vê zero: o dia 9 já está liberado", () => {
    expect(msUntilNextDay(Date.parse("2026-10-09T03:01:00Z"), "2026-10-08")).toBe(0);
  });
});

describe("formatHms", () => {
  it.each([
    [15 * HOUR, "15:00:00"],
    [HOUR + 61_000, "01:01:01"],
    [999, "00:00:00"],
    [25 * HOUR, "25:00:00"],
    [-5, "00:00:00"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatHms(ms)).toBe(text);
  });
});

describe("isValidDate", () => {
  it.each([
    ["2026-10-08", true],
    ["2028-02-29", true],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["08/10/2026", false],
  ])("%s → %s", (text, ok) => {
    expect(isValidDate(text)).toBe(ok);
  });
});

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
