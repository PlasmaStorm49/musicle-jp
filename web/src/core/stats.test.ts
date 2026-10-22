import { describe, expect, it } from "vitest";
import type { FinishedGame, RoundRecord } from "./records.ts";
import { computeStats } from "./stats.ts";

const won = (stage: number): RoundRecord => ({ status: "won", stage, attempts: ["right"] });
const lost: RoundRecord = { status: "lost", stage: 0, attempts: ["wrong"] };
const voided: RoundRecord = { status: "void", stage: 0, attempts: [] };
const game = (...rounds: RoundRecord[]): FinishedGame => ({
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

  it("o jogado depois (P263) fica fora de tudo: jogos, média, distribuição e sequência", () => {
    const history = {
      "2026-10-08|song": game(won(0), won(0), won(0)),
      "2026-10-09|song": { ...game(won(0), lost, lost), late: true as const },
      "2026-10-10|song": game(won(1), lost, lost),
    };
    const stats = computeStats(history, "song", "2026-10-10", SCHEDULE);
    expect(stats).toMatchObject({ played: 2, average: 11.5, currentStreak: 1, bestStreak: 1 });
    expect(stats.distribution[6]).toBe(0);
    // Sem a marca, o mesmo dia contaria: a sequência seria de 3.
    const onTime = { ...history, "2026-10-09|song": game(won(0), lost, lost) };
    expect(computeStats(onTime, "song", "2026-10-10", SCHEDULE).currentStreak).toBe(3);
  });

  it("uma estatística por diário (P249): cada diário do Anime conta à parte, com a sua agenda", () => {
    const history = {
      "2026-10-10|song": game(won(0), won(0), won(0)),
      "2026-10-09|anime-musica-facil": game(won(0), lost, lost),
      "2026-10-11|anime-musica-facil": game(won(1), lost, lost),
      "2026-10-11|anime-musica-medio": game(lost, lost, lost),
    };
    // A agenda do Anime não tem o dia 10 (a dos Hits tem): pela dela, a sequência não quebra.
    const anime = SCHEDULE.filter((d) => d !== "2026-10-10");
    const facil = computeStats(history, "anime-musica-facil", "2026-10-11", anime);
    expect(facil).toMatchObject({ played: 2, average: 5.5, currentStreak: 2, bestStreak: 2 });
    expect(computeStats(history, "anime-musica-facil", "2026-10-11", SCHEDULE).currentStreak).toBe(
      1,
    );
    const medio = computeStats(history, "anime-musica-medio", "2026-10-11", anime);
    expect(medio).toMatchObject({ played: 1, average: 0, currentStreak: 1 });
    expect(computeStats(history, "anime-titulo-facil", "2026-10-11", anime).played).toBe(0);
    expect(computeStats(history, "song", "2026-10-11", SCHEDULE).played).toBe(1);
  });
});
