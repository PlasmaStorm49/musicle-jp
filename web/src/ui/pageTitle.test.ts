import { describe, expect, it } from "vitest";
import { pageTitle } from "./pageTitle.ts";

describe("pageTitle (o usuário, 27/10/2026)", () => {
  it("a Início, só o nome do jogo; as outras, o nome da categoria antes dele", () => {
    expect(pageTitle({ tab: "home", date: null })).toBe("AteMusic");
    expect(pageTitle({ tab: "quiz", date: null })).toBe("Quiz do dia · AteMusic");
    expect(pageTitle({ tab: "hits", date: null })).toBe("Hits · AteMusic");
    expect(pageTitle({ tab: "medals", date: null })).toBe("Medalhas · AteMusic");
  });

  it("um jogo de uma categoria tem o nome dela, como a aba marcada na nav", () => {
    expect(pageTitle({ tab: "album", date: null })).toBe("Hits · AteMusic");
    expect(pageTitle({ tab: "anime-musica-facil", date: null })).toBe("Anime · AteMusic");
    expect(pageTitle({ tab: "misturadas-titulo", date: null })).toBe("Misturadas · AteMusic");
  });

  it("o Sobre pelo nome dele; um dia passado, na categoria da rota", () => {
    expect(pageTitle({ tab: "about", date: null })).toBe("Sobre e privacidade · AteMusic");
    expect(pageTitle({ tab: "history", date: "2026-10-21" })).toBe("Histórico · AteMusic");
  });
});
