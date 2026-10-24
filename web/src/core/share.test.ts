import { describe, expect, it } from "vitest";
import { catalog } from "../../test/fixtures.ts";
import type { FinishedGame } from "./records.ts";
import { MODE_RULES } from "./rules.ts";
import { shareGrid, shareText } from "./share.ts";

/** Um dia do Normal: ouviu mais e acertou, errou, anulada. */
const normalGame: FinishedGame = {
  number: 1,
  rounds: [
    { status: "won", stage: 1, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};

describe("shareGrid", () => {
  it("Normal: ⬛ por ouvir mais, ✅ ou ❌, ⬜ anulada (P42)", () => {
    expect(shareGrid(normalGame, MODE_RULES.album)).toEqual(["⬛✅", "❌", "⬜"]);
  });

  it("Normal: desistir depois de ouvir mais fecha com ❌", () => {
    const gaveUp: FinishedGame = {
      ...normalGame,
      rounds: [{ status: "lost", stage: 2, attempts: [] }, ...normalGame.rounds.slice(1)],
    };
    expect(shareGrid(gaveUp, MODE_RULES.album)[0]).toBe("⬛⬛❌");
  });

  it("Desafio: uma marca por tentativa; desistir fecha com ❌", () => {
    const desafio: FinishedGame = {
      number: 1,
      rounds: [
        { status: "won", stage: 2, attempts: ["wrong", "skip", "right"] },
        { status: "lost", stage: 1, attempts: ["skip"] },
        {
          status: "lost",
          stage: 5,
          attempts: ["wrong", "wrong", "skip", "wrong", "skip", "wrong"],
        },
      ],
    };
    expect(shareGrid(desafio, MODE_RULES.song)).toEqual(["❌⬛✅", "⬛❌", "❌❌⬛❌⬛❌"]);
  });

  it("Desafio com a ajuda (P149): 💡 onde foi pedida; desistir com ela fecha com ❌", () => {
    const desafio: FinishedGame = {
      number: 1,
      rounds: [
        { status: "won", stage: 3, attempts: ["skip", "wrong", "skip", "right"], help: 3 },
        { status: "lost", stage: 3, attempts: ["skip", "skip", "skip", "wrong"], help: 3 },
        { status: "lost", stage: 3, attempts: ["skip", "skip", "skip"], help: 3 },
      ],
    };
    expect(shareGrid(desafio, MODE_RULES.song)).toEqual(["⬛❌⬛💡✅", "⬛⬛⬛💡❌", "⬛⬛⬛💡❌"]);
    // A ajuda no trecho de 7 s vale 3 (ME107).
    expect(shareText("h", desafio, MODE_RULES.song, "u").split("\n")[1]).toBe("3/30");
  });

  it("Desafio com pulos depois da ajuda (P163): o 💡 antes deles; desistir fecha com ❌", () => {
    const desafio: FinishedGame = {
      number: 1,
      rounds: [
        { status: "won", stage: 4, attempts: ["skip", "skip", "skip", "skip", "right"], help: 3 },
        { status: "lost", stage: 4, attempts: ["skip", "skip", "skip", "skip"], help: 3 },
        { status: "lost", stage: 4, attempts: ["skip", "skip", "skip", "skip", "wrong"], help: 3 },
      ],
    };
    expect(shareGrid(desafio, MODE_RULES.song)).toEqual([
      "⬛⬛⬛💡⬛✅",
      "⬛⬛⬛💡⬛❌",
      "⬛⬛⬛💡⬛❌",
    ]);
  });

  it("Desafio: pular até a 6ª tentativa com a ajuda não ganha ❌ a mais, como sem ela", () => {
    const six = ["skip", "skip", "skip", "skip", "skip", "skip"] as const;
    const desafio: FinishedGame = {
      number: 1,
      rounds: [
        { status: "lost", stage: 5, attempts: [...six], help: 1 },
        { status: "lost", stage: 5, attempts: [...six] },
        { status: "void", stage: 0, attempts: [] },
      ],
    };
    expect(shareGrid(desafio, MODE_RULES.song)).toEqual(["⬛💡⬛⬛⬛⬛⬛", "⬛⬛⬛⬛⬛⬛", "⬜"]);
  });

  it("Desafio: a ajuda na 5ª tentativa e o erro na 6ª, sem ❌ a mais", () => {
    const desafio: FinishedGame = {
      number: 1,
      rounds: [
        {
          status: "lost",
          stage: 5,
          attempts: ["skip", "skip", "skip", "skip", "skip", "wrong"],
          help: 5,
        },
        { status: "void", stage: 0, attempts: [] },
        { status: "void", stage: 0, attempts: [] },
      ],
    };
    expect(shareGrid(desafio, MODE_RULES.song)[0]).toBe("⬛⬛⬛⬛⬛💡❌");
  });

  it("Desafio: 6 pulos ficam só ⬛; desistir sem tentar é um ❌", () => {
    const desafio: FinishedGame = {
      number: 1,
      rounds: [
        { status: "lost", stage: 5, attempts: ["skip", "skip", "skip", "skip", "skip", "skip"] },
        { status: "lost", stage: 0, attempts: [] },
        { status: "void", stage: 0, attempts: [] },
      ],
    };
    expect(shareGrid(desafio, MODE_RULES.song)).toEqual(["⬛⬛⬛⬛⬛⬛", "❌", "⬜"]);
  });
});

describe("shareText", () => {
  const text = shareText("AteMusic · Normal nº 1", normalGame, MODE_RULES.album, "https://x.test/");

  it("cabeçalho, pontos sobre o máximo, rodadas e endereço", () => {
    expect(text).toBe("AteMusic · Normal nº 1\n8/20\n⬛✅\n❌\n⬜\nhttps://x.test/");
  });

  it("nunca contém título, artista nem ID do catálogo", () => {
    for (const track of catalog.tracks) {
      expect(text).not.toContain(track.title);
      expect(text).not.toContain(track.id);
    }
    for (const artist of catalog.artists) expect(text).not.toContain(artist.name);
  });
});
