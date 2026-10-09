import { describe, expect, it } from "vitest";
import type { FinishedGame, RoundRecord } from "./records.ts";
import { computeStats } from "./stats.ts";

const won = (stage: number): RoundRecord => ({ status: "won", stage, attempts: ["right"] });
const lost: RoundRecord = { status: "lost", stage: 0, attempts: ["wrong"] };
const voided: RoundRecord = { status: "void", stage: 0, attempts: [] };
const game = (...rounds: RoundRecord[]): FinishedGame => ({
  answerMode: "choice",
  number: 1,
  rounds,
});

const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, "0")}`);
const SCHEDULE = days(8, 29);

describe("computeStats", () => {
  it("histórico vazio", () => {
    expect(computeStats({}, "song", "2026-10-08", SCHEDULE)).toEqual({
      played: 0,
      average: null,
      distribution: new Array(19).fill(0),
      currentStreak: 0,
      bestStreak: 0,
    });
  });

  it("média e distribuição com pontos brutos (P41)", () => {
    const history = {
      "2026-10-08|song": game(won(0), won(1), lost), // 6 + 5 = 11
      "2026-10-09|song": game(won(5), lost, lost), // 1
    };
    const stats = computeStats(history, "song", "2026-10-09", SCHEDULE);
    expect(stats.played).toBe(2);
    expect(stats.average).toBe(6);
    expect(stats.distribution[11]).toBe(1);
    expect(stats.distribution[1]).toBe(1);
  });

  it("dia todo anulado conta em jogos e na sequência, mas não na média (P41)", () => {
    const history = {
      "2026-10-08|song": game(voided, voided, voided),
      "2026-10-09|song": game(won(0), lost, lost),
    };
    const stats = computeStats(history, "song", "2026-10-09", SCHEDULE);
    expect(stats.played).toBe(2);
    expect(stats.average).toBe(6);
    expect(stats.distribution.reduce((a, b) => a + b, 0)).toBe(1);
    expect(stats.currentStreak).toBe(2);
  });

  it("dia pulado zera a sequência atual, mas a melhor fica", () => {
    const history = {
      "2026-10-08|song": game(lost, lost, lost),
      "2026-10-09|song": game(lost, lost, lost),
      "2026-10-10|song": game(lost, lost, lost),
      "2026-10-12|song": game(lost, lost, lost),
    };
    const stats = computeStats(history, "song", "2026-10-12", SCHEDULE);
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(3);
  });

  it("hoje ainda não jogado não quebra a sequência (vale até ontem)", () => {
    const history = {
      "2026-10-08|song": game(lost, lost, lost),
      "2026-10-09|song": game(lost, lost, lost),
    };
    expect(computeStats(history, "song", "2026-10-10", SCHEDULE).currentStreak).toBe(2);
  });

  it("dia que não existe na agenda não quebra a sequência (P40)", () => {
    // Agenda com um buraco no dia 10 (ex.: a atualização falhou).
    const withGap = SCHEDULE.filter((d) => d !== "2026-10-10");
    const history = {
      "2026-10-09|song": game(lost, lost, lost),
      "2026-10-11|song": game(lost, lost, lost),
    };
    expect(computeStats(history, "song", "2026-10-11", withGap).currentStreak).toBe(2);
  });

  it("só conta o alvo pedido e ignora datas no futuro", () => {
    const history = {
      "2026-10-08|song": game(won(0), lost, lost),
      "2026-10-08|album": game(won(0), won(0), won(0)),
      "2026-10-20|song": game(won(0), won(0), won(0)),
    };
    const stats = computeStats(history, "song", "2026-10-09", SCHEDULE);
    expect(stats.played).toBe(1);
    expect(stats.average).toBe(6);
  });
});
