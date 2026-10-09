import { describe, expect, it } from "vitest";
import { catalog } from "../../test/fixtures.ts";
import type { FinishedGame } from "./records.ts";
import { shareGrid, shareText } from "./share.ts";

const choiceGame: FinishedGame = {
  answerMode: "choice",
  number: 1,
  rounds: [
    { status: "won", stage: 1, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};

describe("shareGrid", () => {
  it("4 opções: ⬛ por ouvir mais, ✅ ou ❌, ⬜ anulada (P42)", () => {
    expect(shareGrid(choiceGame)).toEqual(["⬛✅", "❌", "⬜"]);
  });

  it("4 opções: desistir depois de ouvir mais fecha com ❌", () => {
    const gaveUp: FinishedGame = {
      ...choiceGame,
      rounds: [{ status: "lost", stage: 2, attempts: [] }, ...choiceGame.rounds.slice(1)],
    };
    expect(shareGrid(gaveUp)[0]).toBe("⬛⬛❌");
  });

  it("digitação: uma marca por tentativa; desistir fecha com ❌", () => {
    const typing: FinishedGame = {
      answerMode: "typing",
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
    expect(shareGrid(typing)).toEqual(["❌⬛✅", "⬛❌", "❌❌⬛❌⬛❌"]);
  });
});

describe("shareText", () => {
  const text = shareText(
    "musicle-jp · Diário Música nº 1 · 4 opções",
    choiceGame,
    "https://x.test/",
  );

  it("cabeçalho, pontos sobre o máximo, rodadas e endereço", () => {
    expect(text).toBe(
      "musicle-jp · Diário Música nº 1 · 4 opções\n5/12\n⬛✅\n❌\n⬜\nhttps://x.test/",
    );
  });

  it("nunca contém título, artista nem ID do catálogo", () => {
    for (const track of catalog.tracks) {
      expect(text).not.toContain(track.title);
      expect(text).not.toContain(track.id);
    }
    for (const artist of catalog.artists) expect(text).not.toContain(artist.name);
  });
});
