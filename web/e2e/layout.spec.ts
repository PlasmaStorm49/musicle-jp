// A interface nova (M12, PR D): as telas cabem sem rolar nos tamanhos de contrato (P214), nada rola
// para o lado em 320 px e os alvos têm 44 px. Cada PR do D acrescentou as telas dele: o D1, as de
// escolha; o D2, as rodadas, com o selo da Apple simulado (appleCatalog) e a altura reservada; o
// D3, a revelação e o resumo do dia. O Anime (M14, PR D2) acrescentou as telas dele e a 4ª aba; o
// Histórico (M15, PR 2), as telas dele e o "Mais" da nav no celular.
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { PLAYLIST_URL } from "../src/core/apple.ts";
import { bucketOf, DAY_MAX } from "../src/core/stats.ts";
import type { AnimeTrack, Catalog, QuizMonth } from "../src/core/types.ts";
import {
  albumOf,
  appleArtistList,
  appleCatalog,
  dailyAnswer,
  expect,
  lastPlayed,
  navLink,
  open,
  openWithMedals,
  overflow,
  seedHistory,
  test,
  trackById,
  viaHits,
} from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";
/** As rodadas do quiz fictício de 08/10 (M18): a resposta de cada uma. */
const QUIZ_ROUNDS =
  (
    JSON.parse(
      readFileSync(new URL("../public/fixtures/anime/quiz/2026-10.json", import.meta.url), "utf8"),
    ) as QuizMonth
  ).days["2026-10-08"]?.rounds ?? [];
/** As 3 músicas da 4ª rodada do "acertar a música" das Misturadas de 08/10 (a agenda fictícia). */
const MIXED_ROUND_4 = ["fixture:tr:tr24", "fixture:tr:tr26", "fixture:tr:tr31"];
/** Em 22/10, o Histórico tem os 14 dias antes, todos na agenda das fixtures (08 a 21/10). */
const HISTORY_DAY = "2026-10-22T12:00:00-03:00";
/** Em 16/10, a 1ª rodada do Normal é a tr10, a faixa explícita das fixtures (P31). */
const EXPLICIT_DAY = "2026-10-16T12:00:00-03:00";

/** O topo de um elemento na página, para ver se ele anda. */
async function top(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.y ?? Number.NaN;
}

/** Toca o 1º trecho e pula n vezes: as tentativas do Desafio, sem depender da resposta. */
async function skip(page: Page, n: number): Promise<void> {
  await page.getByRole("button", { name: /^Tocar/ }).click();
  for (let i = 0; i < n; i++) await page.getByRole("button", { name: /^Pular/ }).click();
}

/** Um nome de franquia de uns 60 caracteres, como o mais longo do catálogo real do C1. */
const LONG_FRANCHISE = (name: string) =>
  `${name}: Tsuihou Sareta Tensei Juukishi wa Game Chishiki`.slice(0, 62);
/** O tema mais longo do catálogo real (68 caracteres com o tipo). */
const LONG_ANIME = "JoJo no Kimyou na Bouken Part 3: Stardust Crusaders 2nd Season";
/** A faixa em 3 temas, o 1º com o nome longo (o real tem faixas em 2 ou mais temas). */
/** O nome mais longo do catálogo real do C1 (61 caracteres), num tema só, como lá. */
const LONG_THEME = (): AnimeTrack["anime"]["themes"] => [
  { anime: LONG_ANIME, type: "ED", sequence: 1 },
];
/** Uma faixa em 3 temas, com um nome médio: a revelação mostra o 1º e "e mais 2". */
const MEDIUM_ANIME = "Kimetsu no Yaiba: Yuukaku-hen";
const THREE_THEMES = (list: AnimeTrack["anime"]["themes"]): AnimeTrack["anime"]["themes"] => [
  { anime: MEDIUM_ANIME, type: "OP", sequence: 1 },
  ...list,
  { anime: list[0].anime, type: "IN", sequence: null },
];

/**
 * A Início no caso mais alto: os dois diários dos Hits, um do Anime e um das Misturadas terminados
 * (uma linha a mais em cada cartão) e a sessão de um artista com placar, no cartão que divide a
 * linha com o das Misturadas. Confere as linhas, o "Tema" na tela, ao lado
 * do switch (P259), e o "Sobre e privacidade" na linha do "Como funciona".
 */
async function homeWorstCase(page: Page): Promise<void> {
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  const day = { number: 1, rounds: [lost, lost, lost] };
  const found = { status: "done", found: [{ stage: 0 }, { stage: 0 }] } as const;
  const three = { status: "done", found: [{ stage: 0 }, { stage: 0 }, { stage: 0 }] } as const;
  const mixedGame = { number: 1, rounds: [found, found, found, three] };
  await seedHistory(
    page,
    {
      "2026-10-08|album": day,
      "2026-10-08|song": day,
      "2026-10-08|anime-musica-facil": day,
    },
    {},
    {
      mixed: { finished: { "2026-10-08|misturadas-musica": mixedGame }, progress: {} },
      // O quiz do dia (M18): a linha da run no cartão dele.
      quiz: {
        finished: { "2026-10-08|quiz": { number: 1, results: "rrrrrrrrrrrw" } },
        progress: {},
      },
    },
  );
  await open(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Livre" }).click();
  await page.getByRole("button", { name: "Desistir" }).click();
  await page.getByRole("link", { name: "Início" }).click();
  const cards = page.getByRole("main").getByRole("link");
  await expect(cards.filter({ hasText: "Nesta sessão" })).toHaveCount(1);
  await expect(cards.filter({ hasText: /^Hits/ }).locator(".tag")).toHaveText([
    "Normal: terminado, 0 de 30 pontos",
    "Desafio: terminado, 0 de 30 pontos",
  ]);
  await expect(cards.filter({ hasText: /^Anime/ }).locator(".tag")).toHaveText([
    "Hoje: 1 de 6 terminados",
  ]);
  await expect(cards.filter({ hasText: /^Misturadas/ }).locator(".tag")).toHaveText([
    "Hoje: 1 de 2 terminados",
  ]);
  await expect(cards.filter({ hasText: /^Quiz do dia/ }).locator(".tag")).toHaveText([
    "Hoje: rodada 12, 11 acertos",
  ]);
  // O bloco Agora: os Hits terminados, o Anime é o próximo (o usuário, 27/10/2026).
  await expect(page.locator(".home-next")).toHaveAttribute("href", "#anime");
  await expect(page.getByRole("switch", { name: "Tema escuro" })).toBeVisible();
  const about = page.getByRole("link", { name: "Sobre e privacidade" });
  expect(await top(about)).toBe(await top(page.locator("details.home-how-box > summary")));
}

// O iPhone SE e o Android comum (P214): as telas de escolha (PR D1), as rodadas (PR D2), a
// revelação e o resumo (PR D3) cabem inteiros. Os do jogo, no caso mais alto: com o selo da Apple
// no pé, como na parada real.
for (const viewport of [
  { width: 375, height: 667 },
  { width: 360, height: 640 },
]) {
  test.describe(`cabe na tela em ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test("a Início", async ({ page }) => {
      await open(page, DAY, "#inicio");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("AteMusic");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o Histórico: o calendário, a tela do dia no caso mais alto e o resumo do jogado depois (P260, P271)", async ({
      page,
    }) => {
      // Os dois diários de 21/10 jogados depois: os dois cartões com a linha a mais. E os 3 do
      // "acertar a música" do Anime, para a escolha da dificuldade no caso mais alto, uma das
      // Misturadas, com o cartão delas também no dia, e o quiz jogado depois, ao lado delas, com
      // as duas linhas (o usuário, 26/10/2026).
      const lost = { status: "lost", stage: 0, attempts: ["wrong"] } as const;
      const late = { number: 14, rounds: [lost, lost, lost], late: true as const };
      const found = { status: "done", found: [{ stage: 0 }, null] } as const;
      const three = { status: "done", found: [{ stage: 0 }, null, null] } as const;
      const mixedLate = { number: 14, rounds: [found, found, found, three], late: true as const };
      await seedHistory(
        page,
        {
          "2026-10-21|album": late,
          "2026-10-21|song": late,
          "2026-10-21|anime-musica-facil": late,
          "2026-10-21|anime-musica-medio": late,
          "2026-10-21|anime-musica-dificil": late,
        },
        {},
        {
          mixed: { finished: { "2026-10-21|misturadas-musica": mixedLate }, progress: {} },
          quiz: {
            finished: { "2026-10-21|quiz": { number: 14, results: "www", late: true } },
            progress: {},
          },
        },
      );
      await open(page, HISTORY_DAY, "#historico");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Histórico");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      // Os dias com 44 px nos dois sentidos (P213, P271).
      for (const day of await page.locator(".calendar-day").all()) {
        const { height, width } = await target(day);
        expect(height).toBeGreaterThanOrEqual(44);
        expect(width).toBeGreaterThanOrEqual(44);
      }
      // As 4 marcas na grade 2×2: o quiz jogado depois, embaixo à direita (o usuário, 27/10/2026).
      const day21 = page.getByRole("link", { name: /^Quarta-feira, 21 de outubro/ });
      await expect(day21.locator(".mark-slot").nth(3).locator(".mark-all")).toBeVisible();
      await page.evaluate(() => {
        window.location.hash = "#historico/2026-10-21";
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quarta-feira, 21/10");
      await expect(page.getByText("jogado depois")).toHaveCount(3);
      await expect(page.getByRole("main").getByRole("link", { name: /^Anime/ })).toBeVisible();
      await expect(page.getByRole("main").getByRole("link", { name: /^Misturadas/ })).toContainText(
        "1 de 2 terminados",
      );
      await expect(
        page.getByRole("main").getByRole("link", { name: /^Quiz do dia/ }),
      ).toContainText("Rodada 3, 0 acertos");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      // A escolha da dificuldade de um dia passado, com os 3 jogados depois.
      await page.evaluate(() => {
        window.location.hash = "#anime-musica/2026-10-21";
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acertar a música");
      await expect(page.getByText("jogado depois")).toHaveCount(3);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await page.evaluate(() => {
        window.location.hash = "#normal/2026-10-21";
      });
      await expect(page.getByText("Jogado depois: não conta nas estatísticas.")).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: "Voltar ao dia" })).toBeInViewport({ ratio: 1 });
    });

    test("a escolha do modo do Treino", async ({ page }) => {
      await open(page, DAY, "#treino");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a lista de artistas, com o selo da Apple no pé (P170)", async ({ page }) => {
      await appleArtistList(page);
      await open(page, DAY, "#artistas");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Artistas");
      const badge = page.getByRole("link", { name: /Apple Music/ });
      await expect(badge).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(badge).toBeInViewport({ ratio: 1 });
      // A diretriz da Apple: o selo tem pelo menos 30 px de altura no digital.
      const height = await badge
        .locator("img")
        .evaluate((img) => img.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(30);
    });

    test("a escolha do submodo", async ({ page }) => {
      await open(page, DAY, "#artistas");
      await page.getByRole("button", { name: /^夜風シアター/ }).click();
      await expect(page.getByRole("button", { name: "Livre" })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o fim da partida do Superfan", async ({ page }) => {
      // Em 08/10, a ミナト não tem música para sortear: a partida acaba antes de começar.
      await open(page, DAY, "#artistas");
      await page.getByRole("button", { name: /^ミナト/ }).click();
      await page.getByRole("button", { name: "Superfan" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fim da partida");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o fim do Superfan no caso mais alto: a partida completa, com o bônus das vidas e os acertos", async ({
      page,
    }) => {
      await open(page, DAY, "#artistas");
      await page.getByRole("button", { name: /^夜風シアター/ }).click();
      await page.getByRole("button", { name: "Superfan" }).click();
      const field = page.getByRole("combobox", { name: "Qual é a música?" });
      const end = page.getByRole("heading", { level: 1, name: "Fim da partida" });
      const play = page.getByRole("button", { name: "Tocar 1 s" });
      // Todas as músicas que sobram no sorteio, acertadas no 1 s: a partida completa, com as 3 vidas.
      for (let song = 1; song <= 4; song++) {
        await expect(play.or(end)).toBeVisible();
        if (await end.isVisible()) break;
        await play.click();
        const track = await lastPlayed(page);
        await field.fill(track.title);
        await page.getByRole("option").filter({ hasText: track.title }).first().click();
        await expect(
          page.getByRole("heading", { name: "Acertou! 10 de 10 pontos." }),
        ).toBeVisible();
        await page.getByRole("button", { name: /^(Próxima música|Ver resultado)$/ }).click();
      }
      await expect(end).toBeVisible();
      await expect(page.getByText(/^Bônus de 3 vidas que sobraram/)).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a Início no caso mais alto: os dois diários terminados no cartão dos Hits, um do Anime e a sessão do artista", async ({
      page,
    }) => {
      await homeWorstCase(page);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a tela das Misturadas: os dois modos (M17)", async ({ page }) => {
      await open(page, DAY, "#misturadas");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Misturadas");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("as Misturadas com o selo da Apple, no caso mais alto: as 3 músicas, os pulos até o último trecho, a revelação e o resumo (M17)", async ({
      page,
    }) => {
      await appleCatalog(page, { artistDisplay: LONG_ARTIST });
      await open(page, DAY, "#misturadas-musica");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Misturadas · Música · nº 1",
      );
      for (let i = 0; i < 3; i++) {
        await page.getByRole("button", { name: "Desistir", exact: true }).click();
        await page.getByRole("button", { name: "Próxima rodada" }).click();
      }
      const play = page.getByRole("button", { name: /^Tocar/ });
      await expect(play).toBeEnabled();
      await overflow(page);
      const before = await top(play);
      // As 5 tentativas que cabem: os 3 pulos e 2 das 3 músicas, no último trecho.
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Pular/ }).click();
      for (const id of MIXED_ROUND_4.slice(0, 2)) {
        const track = trackById(id);
        await page.getByRole("combobox", { name: "Quais são as músicas?" }).fill(track.title);
        await page
          .getByRole("option")
          .filter({ has: page.getByText(track.title, { exact: true }) })
          .first()
          .click();
      }
      await expect(page.getByText("2 de 3 achadas")).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      expect(await top(play)).toBe(before);
      const badge = page.getByRole("link", { name: /Apple Music/ });
      await expect(badge).toHaveAttribute("href", PLAYLIST_URL);
      await expect(badge).toBeInViewport({ ratio: 1 });
      // A revelação das 3 músicas, com o artista longo.
      await page.getByRole("button", { name: "Desistir", exact: true }).click();
      await expect(page.getByRole("heading", { name: /^Achou 2 de 3/ })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(badge).toBeInViewport({ ratio: 1 });
      await page.getByRole("button", { name: "Ver resultado" }).click();
      await expect(page.getByRole("heading", { name: "Resultado do dia" })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o quiz do dia com o selo da Apple: a rodada, a revelação com o artista longo e o fim da run (M18)", async ({
      page,
    }) => {
      await appleCatalog(page, { artistDisplay: LONG_ARTIST, themes: LONG_THEME });
      await open(page, DAY, "#quiz");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quiz do dia · nº 1");
      const badge = page.getByRole("link", { name: /Apple Music/ });
      await expect(page.getByRole("button", { name: /^Tocar/ })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(badge).toHaveAttribute("href", PLAYLIST_URL);
      await expect(badge).toBeInViewport({ ratio: 1 });
      // A revelação das duas, e o fim da run pelos 3 erros: a escolha errada de cada rodada, pela
      // resposta do mês fictício.
      for (let n = 0; n < 3; n++) {
        // Depois de 2 erros, a run segue com a "Última vida" (o usuário, 27/10/2026).
        if (n === 2) await expect(page.locator(".round-head .round-tag")).toHaveText("Última vida");
        const wrong = QUIZ_ROUNDS[n]?.answer === "a" ? "B" : "A";
        await page.getByRole("button", { name: `Escolher a ${wrong}` }).click();
        await expect(page.getByRole("heading", { name: /^Errou/ })).toBeVisible();
        expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
        await expect(badge).toBeInViewport({ ratio: 1 });
        if (n === 0) {
          // O tipo do tema vem antes do anime longo: o corte cai no nome, e o "ED1" fica à vista
          // (o usuário, 27/10/2026).
          await expect(page.locator(".quiz-reveal .album").first()).toHaveText(
            `ED1 · ${LONG_ANIME}`,
          );
        }
        if (n < 2) await page.getByRole("button", { name: "Próxima rodada" }).click();
      }
      await page.getByRole("button", { name: "Ver resultado" }).click();
      await expect(page.getByRole("heading", { name: "Fim da run" })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    for (const [date, label] of [
      ["2026-10-09", "a nota do MAL, com a diferença e o crédito"],
      ["2026-10-11", "a pergunta do rótulo"],
    ] as const) {
      test(`o quiz do dia em ${date}: ${label}, com o selo da Apple e o artista longo (M18)`, async ({
        page,
      }) => {
        const day = (
          JSON.parse(
            readFileSync(
              new URL("../public/fixtures/anime/quiz/2026-10.json", import.meta.url),
              "utf8",
            ),
          ) as QuizMonth
        ).days[date];
        // Com o anime longo, cortado no fim da linha da revelação, e a explícita na rodada, o caso
        // mais alto dela com a letra grande de cada lado (o usuário, 27/10/2026).
        await appleCatalog(page, {
          artistDisplay: LONG_ARTIST,
          themes: LONG_THEME,
          explicit: true,
        });
        await open(page, `${date}T12:00:00-03:00`, "#quiz");
        await expect(page.getByRole("button", { name: /^Tocar/ })).toBeVisible();
        expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
        const wrong = day?.rounds[0]?.answer === "a" ? "B" : "A";
        await page.getByRole("button", { name: `Escolher a ${wrong}` }).click();
        await expect(page.getByRole("heading", { name: /^Errou/ })).toBeVisible();
        expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
        await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
      });
    }

    test("o bônus de estreia (M18): a rodada e a revelação da nota, com o crédito do MAL", async ({
      page,
    }) => {
      await appleCatalog(page, { artistDisplay: LONG_ARTIST });
      await seedHistory(
        page,
        {},
        {},
        {
          quiz: { finished: { "2026-10-08|quiz": { number: 1, results: "www" } }, progress: {} },
        },
      );
      await open(page, DAY, "#quiz");
      await page.getByRole("button", { name: "Rodadas bônus de estreia" }).click();
      for (let n = 0; n < 2; n++) {
        await page.getByRole("button", { name: "Escolher a A" }).click();
        await page.getByRole("button", { name: "Próxima rodada bônus" }).click();
      }
      await expect(page.getByRole("button", { name: /^Tocar/ })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Escolher a A" }).click();
      await expect(page.getByRole("link", { name: "Dados do MyAnimeList" })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test("a tela do Anime: os dois modos (P233)", async ({ page }) => {
      await open(page, DAY, "#anime");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a escolha da dificuldade do Anime, com os 3 diários terminados", async ({ page }) => {
      const lost = { status: "lost", stage: 0, attempts: [] } as const;
      const day = { number: 1, rounds: [lost, lost, lost] };
      await seedHistory(page, {
        "2026-10-08|anime-musica-facil": day,
        "2026-10-08|anime-musica-medio": day,
        "2026-10-08|anime-musica-dificil": day,
      });
      await open(page, DAY, "#anime-musica");
      await expect(page.getByRole("main").getByRole("link", { name: /^Difícil/ })).toContainText(
        "nº 1 · terminado, 0 de 30 pontos",
      );
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o diário do Anime com o selo da Apple: o Tocar não anda até a última tentativa, e o selo leva à playlist, nunca à música", async ({
      page,
    }) => {
      await appleCatalog(page);
      await open(page, DAY, "#anime-musica-facil");
      const play = page.getByRole("button", { name: /^Tocar/ });
      await expect(play).toBeEnabled();
      const badge = page.getByRole("link", { name: /Apple Music/ });
      await expect(badge).toHaveAttribute("href", PLAYLIST_URL);
      await overflow(page); // as fontes e as imagens, antes de medir
      const before = await top(play);
      await skip(page, 5);
      await expect(page.getByText("Tentativa 6 de 6", { exact: true })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      expect(await top(play)).toBe(before);
      await expect(badge).toBeInViewport({ ratio: 1 });
    });

    test("a revelação do diário do Anime com 5 tentativas e o selo da Apple", async ({ page }) => {
      await appleCatalog(page);
      await open(page, DAY, "#anime-musica-medio");
      await skip(page, 5);
      await page.getByRole("button", { name: "Desistir" }).click();
      await expect(page.locator(".reveal .attempt")).toHaveCount(5);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test("a revelação do acertar o anime com o tema mais longo, 5 tentativas e o selo da Apple", async ({
      page,
    }) => {
      // Em 17/10, a 1ª rodada do Fácil é a da 2ª temporada da Hoshizora Kaizoku: o tema mais longo
      // das fixtures ("Anime: Hoshizora Kaizoku 2nd Season · OP1") no lugar do álbum.
      await appleCatalog(page);
      await open(page, "2026-10-17T12:00:00-03:00", "#anime-titulo-facil");
      await skip(page, 5);
      await page.getByRole("button", { name: "Desistir" }).click();
      await expect(page.locator(".reveal .card .album")).toHaveText(
        "Anime: Hoshizora Kaizoku 2nd Season · OP1",
      );
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test("a ajuda do acertar o anime: os 4 nomes de anime no lugar do campo", async ({ page }) => {
      await appleCatalog(page);
      await open(page, DAY, "#anime-titulo-facil");
      await skip(page, 3);
      await page.getByRole("button", { name: /^Pedir ajuda/ }).click();
      await expect(page.locator(".help-options .option")).toHaveCount(4);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a ajuda do acertar o anime com nomes longos (como os do catálogo real): os 4 numa coluna, inteiros", async ({
      page,
    }) => {
      await appleCatalog(page, { franchiseName: LONG_FRANCHISE });
      await open(page, DAY, "#anime-titulo-facil");
      await skip(page, 3);
      await page.getByRole("button", { name: /^Pedir ajuda/ }).click();
      const titles = page.locator(".help-options .item-title");
      await expect(titles).toHaveCount(4);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      // Numa coluna (a mesma esquerda) e com o nome inteiro, sem reticências.
      const lefts = await page
        .locator(".help-options .option")
        .evaluateAll(
          (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size,
        );
      expect(lefts).toBe(1);
      for (const title of await titles.all()) {
        expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect((await title.textContent())?.length).toBeGreaterThanOrEqual(50);
      }
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    // O nome mais longo do catálogo real, com 5 tentativas e o selo. Um nome de 61 caracteres em
    // 3 temas ("e mais 2") passava 4 px em 360 × 640: não existe no catálogo real (toda faixa tem
    // um tema só), e fica medido com um nome médio, abaixo.
    test("a revelação do acertar o anime com o nome mais longo do catálogo real", async ({
      page,
    }) => {
      await appleCatalog(page, { themes: LONG_THEME });
      await open(page, DAY, "#anime-titulo-facil");
      await skip(page, 5);
      await page.getByRole("button", { name: "Desistir" }).click();
      await expect(page.locator(".reveal .card .album")).toHaveText(`Anime: ${LONG_ANIME} · ED1`);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test('a revelação do acertar o anime com 3 temas: o 1º e "e mais 2"', async ({ page }) => {
      await appleCatalog(page, { themes: THREE_THEMES });
      await open(page, DAY, "#anime-titulo-facil");
      await skip(page, 5);
      await page.getByRole("button", { name: "Desistir" }).click();
      await expect(page.locator(".reveal .card .album")).toHaveText(
        `Anime: ${MEDIUM_ANIME} · OP1 e mais 2`,
      );
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test("o Sobre e privacidade (P243): rola, com o Seu progresso (ME103), e nunca para o lado", async ({
      page,
    }) => {
      // Uma página de leitura, como as Medalhas (P286): com a seção do progresso, ela passa da
      // altura da tela, e rola.
      await open(page, DAY, "#sobre");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sobre e privacidade");
      await expect(page.getByRole("button", { name: "Importar" })).toBeVisible();
      expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
    });

    test("o resumo do diário do Anime", async ({ page }) => {
      await open(page, DAY, "#anime-musica-dificil");
      for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
        await page.getByRole("button", { name: "Desistir" }).click();
        await page.getByRole("button", { name: next }).click();
      }
      await expect(page.getByRole("heading", { name: "Resultado do dia" })).toBeFocused();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("button", { name: "Compartilhar resultado" })).toBeInViewport({
        ratio: 1,
      });
    });

    test("os Hits no caso mais alto: os dois diários terminados e a sessão do Treino com placar (P225)", async ({
      page,
    }) => {
      const lost = { status: "lost", stage: 0, attempts: [] } as const;
      const day = { number: 1, rounds: [lost, lost, lost] };
      await seedHistory(page, { "2026-10-08|album": day, "2026-10-08|song": day });
      await open(page, DAY, "#treino");
      await page.getByRole("button", { name: "Normal", exact: true }).click();
      await page.getByRole("button", { name: "Não sei" }).click();
      await page.getByRole("navigation").getByRole("link", { name: /^Hits/ }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Hits" })).toBeFocused();
      await expect(page.getByRole("main").getByRole("link", { name: /^Treino/ })).toContainText(
        "Nesta sessão (Normal)",
      );
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a rodada do Normal com a explícita e o selo da Apple: a pílula vem antes do Tocar (P31)", async ({
      page,
    }) => {
      await appleCatalog(page);
      await open(page, EXPLICIT_DAY, "#normal");
      const play = page.getByRole("button", { name: "Tocar 1 s" });
      await expect(play).toBeEnabled();
      const pill = page.getByText("Conteúdo explícito");
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(pill).toBeInViewport({ ratio: 1 });
      expect(await top(pill)).toBeLessThan(await top(play));
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test("o Normal com o selo da Apple e um título de álbum em 2 linhas, como na parada real", async ({
      page,
    }) => {
      // O álbum da resposta de 08/10 com um título longo: na parada real, um por rodada é comum.
      const answer = albumOf(trackById(dailyAnswer("2026-10-08", "album", 0))).id;
      await appleCatalog(page, {
        albumTitle: (a) =>
          a.id === answer ? `${a.title} - Original Soundtrack (Deluxe Edition)` : a.title,
      });
      await open(page, DAY, "#normal");
      await expect(page.getByRole("button", { name: /^Tocar/ })).toBeEnabled();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      const heights = await page
        .locator(".option .item-title")
        .evaluateAll((titles) => titles.map((t) => t.getBoundingClientRect().height));
      expect(Math.max(...heights)).toBeGreaterThan(30); // o caso existe: 2 linhas de 20 px
    });

    test("o Desafio com o selo da Apple: o Tocar não anda até a última tentativa (a reserva)", async ({
      page,
    }) => {
      await appleCatalog(page);
      await open(page, DAY, "#desafio");
      const play = page.getByRole("button", { name: /^Tocar/ });
      await expect(play).toBeEnabled();
      await overflow(page); // as fontes e as imagens, antes de medir
      const before = await top(play);
      await skip(page, 5);
      await expect(page.getByText("Tentativa 6 de 6", { exact: true })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      expect(await top(play)).toBe(before);
    });

    test("o Desafio do Treino com o selo da Apple e a explícita (o cabeçalho da sessão tem duas linhas)", async ({
      page,
    }) => {
      // Toda faixa explícita: o sorteio do Treino é ao acaso, e este é o caso mais alto.
      await appleCatalog(page, { explicit: true });
      await open(page, DAY, "#treino");
      await page.getByRole("button", { name: "Desafio", exact: true }).click();
      await skip(page, 5);
      await expect(page.getByText("Tentativa 6 de 6", { exact: true })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o Livre de um artista com o selo da Apple", async ({ page }) => {
      await appleCatalog(page);
      await open(page, DAY, "#artistas");
      await page.getByRole("button", { name: /^青井ユウ/ }).click();
      await page.getByRole("button", { name: "Livre" }).click();
      await expect(page.getByRole("button", { name: /^Tocar/ })).toBeEnabled();
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o Superfan com o selo da Apple, com o cabeçalho da partida", async ({ page }) => {
      await appleCatalog(page);
      await open(page, DAY, "#artistas");
      await page.getByRole("button", { name: /^夜風シアター/ }).click();
      await page.getByRole("button", { name: "Superfan" }).click();
      await expect(page.locator(".superfan-limits")).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a ajuda do diário, depois de 3 tentativas (o caso mais alto), com o selo da Apple: as opções no lugar do campo", async ({
      page,
    }) => {
      await appleCatalog(page);
      await open(page, DAY, "#desafio");
      await skip(page, 3);
      await page.getByRole("button", { name: /^Pedir ajuda/ }).click();
      await expect(page.locator(".help-options")).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("a revelação do Normal com a explícita e o selo da Apple: o botão de seguir e o selo na tela", async ({
      page,
    }) => {
      await appleCatalog(page);
      await open(page, EXPLICIT_DAY, "#normal");
      await page.getByRole("button", { name: "Não sei" }).click();
      await expect(page.getByRole("heading", { name: "Não foi dessa vez." })).toBeFocused();
      await expect(page.locator(".card").getByText("Conteúdo explícito")).toBeVisible();
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("button", { name: "Próxima rodada" })).toBeInViewport({
        ratio: 1,
      });
      await expect(page.getByRole("link", { name: /Apple Music/ })).toBeInViewport({ ratio: 1 });
    });

    test("a revelação do Desafio com 5 tentativas e o selo da Apple", async ({ page }) => {
      await appleCatalog(page);
      await open(page, DAY, "#desafio");
      await skip(page, 5);
      await page.getByRole("button", { name: "Desistir" }).click();
      await expect(page.locator(".reveal .attempt")).toHaveCount(5);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });

    test("o resumo do dia: o placar, as 3 rodadas, o compartilhar e as estatísticas", async ({
      page,
    }) => {
      await open(page, DAY, "#normal");
      for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
        await page.getByRole("button", { name: "Não sei" }).click();
        await page.getByRole("button", { name: next }).click();
      }
      await expect(page.getByRole("heading", { name: "Resultado do dia" })).toBeFocused();
      await expect(page.locator(".summary-rounds > li")).toHaveCount(3);
      await expect(page.locator(".distribution > li")).toHaveCount(bucketOf(DAY_MAX) + 1);
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
      await expect(page.getByRole("button", { name: "Compartilhar resultado" })).toBeInViewport({
        ratio: 1,
      });
    });

    test("o resumo com o novo diário: o compartilhar e o Jogar lado a lado, e cabe", async ({
      page,
    }) => {
      await open(page, DAY, "#normal");
      await toSummary(page);
      // A virada em Brasília: a contagem zera no próximo tique.
      await page.clock.setFixedTime(new Date("2026-10-09T00:00:01-03:00"));
      const play = page.getByRole("button", { name: "Jogar o novo diário" });
      await expect(play).toBeVisible();
      const share = page.getByRole("button", { name: "Compartilhar resultado" });
      expect(await top(play)).toBe(await top(share));
      expect((await overflow(page)).vertical).toBeLessThanOrEqual(0);
    });
  });
}

test("em 320 px, as telas do Histórico não rolam para o lado, e os dias têm 44 px de altura (P271)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, HISTORY_DAY, "#historico");
  for (const [hash, title] of [
    ["#historico", "Histórico"],
    ["#historico/2026-10-21", "Quarta-feira, 21/10"],
    ["#normal/2026-10-21", "Normal · nº 14"],
    ["#desafio/2026-10-21", "Desafio · nº 14"],
    ["#anime/2026-10-21", "Anime"],
    ["#anime-musica-dificil/2026-10-21", "Música · Difícil · nº 14"],
  ] as const) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    expect((await overflow(page)).horizontal, hash).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => {
    window.location.hash = "#historico";
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Histórico");
  for (const day of await page.locator(".calendar-day").all()) {
    expect((await target(day)).height).toBeGreaterThanOrEqual(44);
    // A grade 2×2 das marcas cabe dentro do dia, de uns 39 px de largura (o usuário, 27/10/2026).
    const inside = await day.evaluate((cell) => {
      const box = cell.getBoundingClientRect();
      const marks = cell.querySelector(".calendar-marks")?.getBoundingClientRect();
      return (
        marks !== undefined &&
        marks.left >= box.left &&
        marks.right <= box.right &&
        marks.top >= box.top &&
        marks.bottom <= box.bottom
      );
    });
    expect(inside).toBe(true);
  }
});

test("em 320 px, nenhuma tela rola para o lado", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, DAY, "#inicio");
  for (const [hash, title] of [
    ["#inicio", "AteMusic"],
    ["#hits", "Hits"],
    ["#normal", "Normal · nº 1"],
    ["#desafio", "Desafio · nº 1"],
    ["#treino", "Treino"],
    ["#artistas", "Artistas"],
    ["#anime", "Anime"],
    ["#anime-musica", "Acertar a música"],
    ["#anime-titulo", "Acertar o anime"],
    ["#anime-musica-dificil", "Música · Difícil · nº 1"],
    ["#anime-titulo-dificil", "Anime · Difícil · nº 1"],
    ["#misturadas", "Misturadas"],
    ["#misturadas-musica", "Misturadas · Música · nº 1"],
    ["#misturadas-titulo", "Misturadas · Anime · nº 1"],
    ["#sobre", "Sobre e privacidade"],
    ["#historico", "Histórico"],
  ] as const) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    expect((await overflow(page)).horizontal, hash).toBeLessThanOrEqual(0);
  }
});

test("em 320 px, a revelação das Misturadas com a nota mais longa (o Separar) não rola para o lado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await appleCatalog(page, { artistDisplay: LONG_ARTIST });
  await open(page, DAY, "#misturadas-musica");
  await page.getByRole("button", { name: "Ajuda: separar L e R" }).click();
  // A 1ª rodada de 08/10 tem a tr33.
  const track = trackById("fixture:tr:tr33");
  await page.getByRole("combobox", { name: "Quais são as músicas?" }).fill(track.title);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(track.title, { exact: true }) })
    .first()
    .click();
  await page.getByRole("button", { name: "Desistir", exact: true }).click();
  await expect(page.getByText(/separada: metade dos pontos/)).toBeVisible();
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
});

test("em 320 px, o cabeçalho do diário do Anime fica numa linha: o nome do diário e a rodada", async ({
  page,
}) => {
  // O nome mais longo ("Música · Difícil") com o nº de dois algarismos (21/10 é o nº 14): numa
  // linha, a rodada tem a altura da do Desafio, que cabe em 360 × 640 com pouca folga.
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, "2026-10-21T12:00:00-03:00", "#anime-musica-dificil");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Música · Difícil · nº 14");
  await overflow(page);
  expect(await top(page.locator(".round-head > p"))).toBe(await top(title));
});

// Na parada real, a linha do artista passa da tela ("米津玄師 & 宇多田ヒカル · Kenshi Yonezu &
// Hikaru Utada"): ela não quebra, ganha reticências. A coluna do grid não pode crescer até ela.
const LONG_ARTIST = (name: string) =>
  `${name} & 宇多田ヒカル & ONE OK ROCK & CHICO CARLITO & Paledusk`;

test("em 320 px, a Início no caso mais alto não rola para o lado, com o Tema e o Sobre nas linhas deles (P259)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await homeWorstCase(page);
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
});

test("em 320 px, um artista longo não empurra a página para o lado: a rodada, a revelação e as tentativas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await appleCatalog(page, { artistDisplay: LONG_ARTIST });
  /** Nada rola para o lado, e a linha do artista ganha reticências. */
  const fits = async (name: string, line: string) => {
    expect((await overflow(page)).horizontal, name).toBeLessThanOrEqual(0);
    const cut = await page
      .locator(line)
      .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).length);
    expect(cut, name).toBeGreaterThan(0);
  };
  await open(page, DAY, "#normal");
  await expect(page.getByRole("button", { name: /^Tocar/ })).toBeEnabled();
  await fits("a rodada do Normal", ".option .item-artist");
  await page.getByRole("button", { name: "Não sei" }).click();
  await expect(page.getByRole("button", { name: "Próxima rodada" })).toBeVisible();
  await fits("a revelação do Normal", ".options.done .item-artist");
  const answer = dailyAnswer("2026-10-08", "song", 0);
  const other = trackById(answer === "fixture:tr:tr01" ? "fixture:tr:tr02" : "fixture:tr:tr01");
  await viaHits(page, /^Desafio/);
  await page.getByRole("button", { name: /^Tocar/ }).click();
  await page.getByRole("combobox", { name: "Qual é a música?" }).fill(other.title);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(other.title, { exact: true }) })
    .first()
    .click();
  await expect(page.getByText("Tentativa 2 de 6", { exact: true })).toBeVisible();
  await fits("as tentativas do Desafio", ".attempt .item-artist");
});

test("em 320 px, o cabeçalho das sessões cabe: o placar e os limites quebram a linha, sem invadir o botão", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const head = page.locator(".session-head");
  /** Nenhum texto do cabeçalho passa da sua área, e nada rola para o lado. */
  const fits = async (name: string) => {
    await expect(head).toBeVisible();
    const cut = await head
      .locator(":scope > p")
      .evaluateAll((ps) => ps.filter((p) => p.scrollWidth > p.clientWidth).length);
    expect(cut, name).toBe(0);
    expect((await overflow(page)).horizontal, name).toBeLessThanOrEqual(0);
  };
  await open(page, DAY, "#treino");
  await page.getByRole("button", { name: "Desafio", exact: true }).click();
  await fits("Treino");
  await (await navLink(page, "Artistas")).click();
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Livre" }).click();
  await fits("Livre");
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Superfan" }).click();
  await fits("Superfan");
});

/** A altura e a largura do alvo de toque (P213: 44 px nos dois sentidos). */
async function target(locator: Locator): Promise<{ height: number; width: number }> {
  const box = await locator.boundingBox();
  return { height: box?.height ?? 0, width: box?.width ?? 0 };
}

test("a nav: o selo é a Início (P205), e em 320 px a Início, os Hits, o Anime e o Mais têm alvo de 44 × 44 px, como as Misturadas, o Quiz, os Artistas, o Histórico e as Medalhas no menu aberto, que não rola a página para o lado (P225, P265, P287)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, DAY, "#normal");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Início" }).locator("img.nav-logo")).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText(["Início", /^Hits/, /^Anime/]);
  const more = nav.getByRole("button", { name: "Mais" });
  const targets = [...(await nav.getByRole("link").all()), more];
  expect(targets).toHaveLength(4);
  for (const item of targets) {
    const { height, width } = await target(item);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(width).toBeGreaterThanOrEqual(44);
  }
  await more.click();
  await expect(nav.getByRole("link")).toHaveText([
    "Início",
    /^Hits/,
    /^Anime/,
    "Misturadas",
    "Quiz",
    "Artistas",
    "Histórico",
    "Medalhas",
  ]);
  for (const name of ["Misturadas", "Quiz", "Artistas", "Histórico", "Medalhas"]) {
    const { height, width } = await target(nav.getByRole("link", { name }));
    expect(height, name).toBeGreaterThanOrEqual(44);
    expect(width, name).toBeGreaterThanOrEqual(44);
  }
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
});

test("as Medalhas (M16) em 320 px: as 17 gerais e o Superfan, com os botões do destaque, sem rolar para o lado (P286, P310, P318)", async ({
  page,
}) => {
  // As ganhas, com o botão: os 6 do Anime de hoje acertados (a geral de nome mais longo, em
  // destaque, com o "Tirar o destaque") e as 3 de um artista.
  const won = { status: "won", stage: 0, attempts: ["right"] } as const;
  const day = { number: 1, rounds: [won, won, won] };
  const anime = [
    "anime-musica-facil",
    "anime-musica-medio",
    "anime-musica-dificil",
    "anime-titulo-facil",
    "anime-titulo-medio",
    "anime-titulo-dificil",
  ];
  await seedHistory(
    page,
    Object.fromEntries(anime.map((key) => [`2026-10-08|${key}`, day])),
    { "fixture:ar:ar02": { right: 50, done: true, perfect: true } },
    { shelf: ["anime-todos"] },
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, DAY, "#medalhas");
  await expect(page.getByRole("button", { name: /^Tirar o destaque/ })).toBeVisible();
  for (const button of await page.locator(".medal-pin").all()) {
    const box = await button.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Medalhas" })).toBeVisible();
  await expect(page.locator(".medal-list > li")).toHaveCount(17);
  await expect(page.locator(".medal-artist")).toHaveCount(5);
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
  // O nome mais longo das gerais cabe na linha, sem passar da tela.
  const longest = page.getByText("Pare de falar em tocar grama...", { exact: true });
  const box = await longest.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
});

// Um teste por tamanho: o aviso some em 5 s, e medir os dois na mesma página dependeria da pressa.
for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
]) {
  test(`o aviso pequeno de medalha (M16) em ${viewport.width} px: inteiro dentro da tela, por cima, sem rolar a página (P279)`, async ({
    page,
  }) => {
    const lost = { status: "lost", stage: 0, attempts: [] } as const;
    await seedHistory(page, { "2026-10-07|album": { number: 1, rounds: [lost, lost, lost] } });
    await page.setViewportSize(viewport);
    await openWithMedals(page, DAY, "#inicio");
    const toast = page.locator(".medal-toast");
    await expect(toast.locator(".medal-toast-text")).toHaveText("Medalha nova: Primeiro diário");
    const box = await toast.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // Fixo, ele não entra no fluxo: nada rola para o lado, e em 375 × 667 a Início cabe sem rolar.
    const { vertical, horizontal } = await overflow(page);
    expect(horizontal).toBeLessThanOrEqual(0);
    if (viewport.width === 375) expect(vertical).toBeLessThanOrEqual(0);
  });
}

test("o pop-up de medalha (M16) em 320 px: 4 medalhas numa linha, os nomes longos, o Guardar uma cópia, o Ok e o selo da Apple dentro da tela (P279, P298, ME103)", async ({
  page,
}) => {
  // Como na lista real: as capas da Apple, e o selo no fim do pop-up.
  await appleArtistList(page);
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  const day = { number: 1, rounds: [lost, lost, lost] };
  // O 1º diário e as 3 de um artista: o aviso de 4, com a perfeita, o desenho mais alto.
  // O diário de um dia antes: o 1º aviso de quem já jogava (P314).
  await seedHistory(
    page,
    { "2026-10-09|album": day },
    { "fixture:ar:ar02": { right: 50, done: true, perfect: true } },
  );
  await page.setViewportSize({ width: 320, height: 640 });
  // Em 10/10: a agenda das fixtures começa em 08/10, e os 3 dias seguidos precisam estar nela.
  await openWithMedals(page, "2026-10-10T12:00:00-03:00", "#inicio");
  const dialog = page.getByRole("dialog", { name: "Você já tem 4 medalhas" });
  await expect(dialog.getByRole("listitem")).toHaveText([
    "真夜中のカーテンコール · Mayonaka no Curtain Call, de 夜風シアター (Superfan completo)",
    "夜風劇場 · Yokaze Gekijo, de 夜風シアター (Superfan perfeito)",
    "開幕ベル · Kaimaku Bell, de 夜風シアター (50 acertos)",
    "Primeiro diário",
  ]);
  const tops = await dialog
    .locator(".medal-notice-arts svg")
    .evaluateAll((svgs) => svgs.map((svg) => Math.round(svg.getBoundingClientRect().bottom)));
  expect(tops).toHaveLength(4);
  // Alinhadas por baixo, como no CSS: a perfeita, mais alta, sobe acima das outras.
  expect(new Set(tops).size, "as 4 na mesma linha").toBe(1);
  const badge = dialog.locator(".attribution");
  await expect(badge).toBeVisible();
  // As medalhas grandes (a Superfan completa e a perfeita) pedem a cópia do progresso (P347).
  const backup = dialog.getByRole("button", { name: "Guardar uma cópia do progresso" });
  await expect(backup).toBeVisible();
  for (const target of [dialog, backup, dialog.getByRole("button", { name: "Ok" }), badge]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(640);
  }
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
});

test("a medalha em destaque na nav (ME118, P317): em 320 px, a nav numa linha no caso mais largo, com o enfeite; a partir de 360 px, o link com alvo de 44 × 44", async ({
  page,
}) => {
  // Os dois ✓ e o Mais marcado (o caso mais largo), e a medalha do 1º diário em destaque. A linha
  // é a mesma quando o centro de cada item é o mesmo: o enfeite, menor, fica centrado nela.
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  const day = { number: 1, rounds: [lost, lost, lost] };
  await seedHistory(
    page,
    {
      "2026-10-08|album": day,
      "2026-10-08|song": day,
      "2026-10-08|anime-musica-medio": day,
    },
    {},
    { shelf: ["diario-1"] },
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, "2026-10-08T12:00:00-03:00", "#historico");
  const nav = page.getByRole("navigation");
  const link = nav.getByRole("link", { name: /^Medalha em destaque/ });
  const small = nav.locator(".nav-favorite-small");
  await expect(small).toBeVisible();
  await expect(link).toBeHidden();
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 0.9rem "Noto Sans JP"', "Hits Anime ✓"),
      document.fonts.load('700 0.9rem "Noto Sans JP"', "Mais"),
    ]);
    await document.fonts.ready;
  });
  const rows = await nav
    .locator(":is(a, button, .nav-favorite-small):visible")
    .evaluateAll(
      (items) =>
        new Set(
          items.map((a) => Math.round(((r) => r.top + r.height / 2)(a.getBoundingClientRect()))),
        ).size,
    );
  expect(rows, "a nav numa linha só").toBe(1);
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
  // Com o Anime marcado, em negrito, uma palavra mais longa que o Mais.
  await page.evaluate(() => {
    window.location.hash = "#anime";
  });
  await expect(nav.getByRole("link", { name: /^Anime/ })).toHaveAttribute("aria-current", "page");
  await page.evaluate(async () => {
    await document.fonts.load('700 0.9rem "Noto Sans JP"', "Anime");
    await document.fonts.ready;
  });
  const animeRows = await nav
    .locator(":is(a, button, .nav-favorite-small):visible")
    .evaluateAll(
      (items) =>
        new Set(
          items.map((a) => Math.round(((r) => r.top + r.height / 2)(a.getBoundingClientRect()))),
        ).size,
    );
  expect(animeRows, "a nav numa linha só, com o Anime marcado").toBe(1);
  // Em 360 px, o link, com o alvo de 44 × 44, ainda na mesma linha.
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(link).toBeVisible();
  await expect(small).toBeHidden();
  const { height, width } = await target(link);
  expect(height).toBeGreaterThanOrEqual(44);
  expect(width).toBeGreaterThanOrEqual(44);
  const tops = await nav
    .locator(":is(a, button):visible")
    .evaluateAll(
      (items) =>
        new Set(
          items.map((a) => Math.round(((r) => r.top + r.height / 2)(a.getBoundingClientRect()))),
        ).size,
    );
  expect(tops, "a nav numa linha só").toBe(1);
});

test("o Mais em todas as larguras, e os diários na linha quando cabem: as Misturadas a partir de 460 px e o Quiz a partir de 720 (P287, M17, M18)", async ({
  page,
}) => {
  // Os dois diários dos Hits, um do Anime, os dois das Misturadas e o quiz de hoje terminados: os
  // quatro ✓, o caso mais largo.
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  const day = { number: 1, rounds: [lost, lost, lost] };
  const none = { status: "done", found: [null, null] } as const;
  const mixed = {
    number: 1,
    rounds: [none, none, none, { status: "done", found: [null, null, null] }],
  } as const;
  // E a medalha em destaque (P317), o caso mais largo da linha.
  await seedHistory(
    page,
    {
      "2026-10-08|album": day,
      "2026-10-08|song": day,
      "2026-10-08|anime-musica-facil": day,
    },
    {},
    {
      shelf: ["diario-1"],
      mixed: {
        finished: { "2026-10-08|misturadas-musica": mixed, "2026-10-08|misturadas-titulo": mixed },
        progress: {},
      },
      quiz: { finished: { "2026-10-08|quiz": { number: 1, results: "www" } }, progress: {} },
    },
  );
  await page.setViewportSize({ width: 459, height: 800 });
  await open(page, DAY, "#inicio");
  const nav = page.getByRole("navigation");
  const more = nav.getByRole("button", { name: "Mais" });
  const links = nav.getByRole("link");
  await expect(more).toBeVisible();
  // A medalha em destaque é um link sem texto, com o nome no aria-label.
  await expect(links).toHaveText(["Início", /^Hits/, /^Anime/, ""]);
  const oneLine = async (label: string) => {
    await page.evaluate(() => document.fonts.ready);
    const tops = await links.evaluateAll((all) => all.map((a) => a.getBoundingClientRect().top));
    expect(new Set(tops).size, `a nav numa linha só (${label})`).toBe(1);
    expect(
      (await overflow(page)).horizontal,
      `sem rolar para o lado (${label})`,
    ).toBeLessThanOrEqual(0);
  };
  await oneLine("459 px");
  // O menu aberto fecha ao cruzar um corte (um diário muda de lugar), e não volta aberto.
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 460, height: 800 });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(links).toHaveText(["Início", /^Hits/, /^Anime/, /^Misturadas/, ""]);
  await oneLine("460 px");
  // Até 719 px, a coluna tem 460 px úteis: o Quiz fica no menu.
  await page.setViewportSize({ width: 719, height: 800 });
  await expect(links).toHaveText(["Início", /^Hits/, /^Anime/, /^Misturadas/, ""]);
  await oneLine("719 px");
  // Em 720 px, os 4 diários na linha, na coluna do conteúdo, e a medalha em destaque alinhada com
  // o fim dele; o Mais continua, com os Artistas, o Histórico e as Medalhas.
  await more.click();
  await page.setViewportSize({ width: 720, height: 800 });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(links).toHaveText(["Início", /^Hits/, /^Anime/, /^Misturadas/, /^Quiz/, ""]);
  await expect(more).toBeVisible();
  await oneLine("720 px");
  const box = (el: Locator) => el.evaluate((e) => e.getBoundingClientRect().toJSON());
  const row = await box(nav.locator("ul").first());
  expect(row.width).toBeLessThanOrEqual(560);
  const contentRight = await page
    .locator("main.app")
    .evaluate(
      (e) => e.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(e).paddingRight),
    );
  const favoriteRight = (await box(nav.locator(".nav-favorite"))).right;
  expect(Math.abs(favoriteRight - contentRight)).toBeLessThanOrEqual(2);
});

test("a Início: o switch do tema e o Como funciona têm alvo de 44 px (P213)", async ({ page }) => {
  await open(page, DAY, "#inicio");
  const how = page.locator("details.home-how-box > summary");
  expect((await target(how)).height).toBeGreaterThanOrEqual(44);
  // O "Sobre e privacidade", na mesma linha (P259), com o mesmo alvo.
  const about = page.getByRole("link", { name: "Sobre e privacidade" });
  expect((await target(about)).height).toBeGreaterThanOrEqual(44);
  // O alvo é o botão inteiro: o sol, a trilha e a lua.
  const { height, width } = await target(page.getByRole("switch", { name: "Tema escuro" }));
  expect(height).toBeGreaterThanOrEqual(44);
  expect(width).toBeGreaterThanOrEqual(44);
  // Em 320 px, o resumo do "Como funciona" e o lado direito (o Sobre e o tema) cabem na mesma
  // linha sem se cruzar (o usuário, 27/10/2026).
  await page.setViewportSize({ width: 320, height: 640 });
  const gap = await page.evaluate(() => {
    const chevron = document.querySelector(".home-how-box summary svg")?.getBoundingClientRect();
    const end = document.querySelector(".home-more-end")?.getBoundingClientRect();
    return chevron && end ? end.left - chevron.right : -1;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
});

test("desistir é um botão vermelho, e não um link (P220): o texto e o anel no --bad, sem sublinhado, com alvo de 44 px", async ({
  page,
}) => {
  for (const [hash, name] of [
    ["#normal", "Não sei"],
    ["#desafio", "Desistir"],
  ] as const) {
    await open(page, DAY, hash);
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const style = await button.evaluate((el) => {
      const bad = getComputedStyle(document.documentElement).getPropertyValue("--bad").trim();
      const probe = document.createElement("span");
      probe.style.color = bad;
      document.body.append(probe);
      const red = getComputedStyle(probe).color;
      probe.remove();
      const cs = getComputedStyle(el);
      return { red, color: cs.color, ring: cs.boxShadow, line: cs.textDecorationLine };
    });
    expect(style.color, name).toBe(style.red);
    expect(style.ring, name).toContain(style.red);
    expect(style.line, name).toBe("none");
    expect((await target(button)).height, name).toBeGreaterThanOrEqual(44);
  }
});

test("a lista de sugestões flutua: aberta, a página não muda de altura e o Tocar não anda", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, DAY, "#desafio");
  const play = page.getByRole("button", { name: /^Tocar/ });
  await expect(play).toBeEnabled();
  await overflow(page);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const before = await top(play);
  await page.getByRole("combobox").fill("a");
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  expect(await top(play)).toBe(before);
  // Sem resultado, o aviso também flutua.
  await page.getByRole("combobox").fill("zzzz");
  await expect(page.locator(".no-results")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  expect(await top(play)).toBe(before);
});

test("títulos longos (o real chega a 89 caracteres): o do álbum quebra a linha, sem corte nem rolagem para o lado (P212)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const long =
    "Kimi no Na wa (Your Name) Original Motion Picture Soundtrack - Deluxe Edition (TV Size)";
  await page.route("**/fixtures/catalog.json", async (route) => {
    const response = await route.fetch();
    const catalog = (await response.json()) as Catalog;
    const albums = catalog.albums.map((a) => ({ ...a, title: `${a.title} ${long}`.slice(0, 89) }));
    await route.fulfill({ response, json: { ...catalog, albums } });
  });
  await open(page, DAY, "#normal");
  const titles = page.locator(".option .item-title");
  await expect(titles).toHaveCount(4);
  expect((await overflow(page)).horizontal).toBeLessThanOrEqual(0);
  // Inteiro: nada escondido pelas reticências.
  for (const title of await titles.all()) {
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await title.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
  }
});

/** Joga o Normal de 08/10 até o resumo, com "Não sei" nas 3 rodadas. */
async function toSummary(page: Page): Promise<void> {
  for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Não sei" }).click();
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByRole("heading", { name: "Resultado do dia" })).toBeVisible();
}

test('saiu o novo diário: o "Jogar o novo diário" é o único botão oliva do resumo', async ({
  page,
}) => {
  await open(page, DAY, "#normal");
  await toSummary(page);
  // A virada em Brasília: a contagem zera no próximo tique.
  await page.clock.setFixedTime(new Date("2026-10-09T00:00:01-03:00"));
  const play = page.getByRole("button", { name: "Jogar o novo diário" });
  await expect(play).toBeVisible();
  const share = page.getByRole("button", { name: "Compartilhar resultado" });
  const background = (locator: Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background(share)).not.toBe(await background(play));
});

test("no computador (1280 px), a revelação e o resumo em duas colunas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, DAY, "#normal");
  await page.getByRole("button", { name: "Não sei" }).click();
  const card = await page.locator(".reveal > .card").boundingBox();
  const result = await page.locator(".reveal > h2").boundingBox();
  // A capa grande à esquerda, o resultado à direita, na mesma altura.
  expect((card?.x ?? 0) + (card?.width ?? 0)).toBeLessThanOrEqual(result?.x ?? 0);
  expect(Math.abs((card?.y ?? 0) - (result?.y ?? 0))).toBeLessThan(40);
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  for (const next of ["Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Não sei" }).click();
    await page.getByRole("button", { name: next }).click();
  }
  const rounds = await page.locator(".summary-rounds").boundingBox();
  const stats = await page.locator(".summary > .stats").boundingBox();
  // As estatísticas ao lado do resultado.
  expect((rounds?.x ?? 0) + (rounds?.width ?? 0)).toBeLessThanOrEqual(stats?.x ?? 0);
});

test("o volume (P216): a barra abre sem mudar a altura nos dois tamanhos, o trecho toca com ele e ele continua depois de recarregar", async ({
  page,
}) => {
  const range = page.getByRole("slider", { name: "Volume" });
  const play = page.getByRole("button", { name: /^Tocar/ });
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await open(page, DAY, "#normal");
    await expect(play).toBeEnabled();
    await overflow(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const before = await top(play);
    await page.getByRole("button", { name: /^Volume/ }).click();
    await expect(range).toBeFocused();
    await range.evaluate((el) => {
      (el as HTMLInputElement).value = "30";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
      `${viewport.width}`,
    ).toBe(height);
    expect(await top(play), `${viewport.width}`).toBe(before);
    expect((await overflow(page)).horizontal, `${viewport.width}`).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
    await expect(range).toBeHidden();
  }
  await play.click();
  await expect.poll(() => page.evaluate(() => window.__musicleAudioLog?.at(-1)?.volume)).toBe(0.3);
  // Depois de recarregar, o motor nasce com o volume salvo.
  await page.reload();
  await expect(play).toBeEnabled();
  await play.click();
  await expect.poll(() => page.evaluate(() => window.__musicleAudioLog?.at(-1)?.volume)).toBe(0.3);
});

test("a aba ativa em negrito não empurra as vizinhas (ME106): o Mais e o link das Medalhas ficam no mesmo lugar ao trocar de aba", async ({
  page,
}) => {
  const nav = page.getByRole("navigation");
  const left = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().left);
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, DAY, "#inicio");
  const more = nav.getByRole("button", { name: "Mais" });
  await page.evaluate(() => document.fonts.ready);
  const atHome = await left(more);
  for (const hash of ["#hits", "#anime"]) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(
      nav.getByRole("link", { name: new RegExp(`^${hash === "#hits" ? "Hits" : "Anime"}`) }),
    ).toHaveAttribute("aria-current", "page");
    await page.evaluate(() => document.fonts.ready);
    expect(await left(more), hash).toBe(atHome);
  }
  // Em 720 px, com as Misturadas na linha: o Mais, depois delas, também não anda quando elas
  // viram a aba ativa.
  await page.setViewportSize({ width: 720, height: 800 });
  await page.evaluate(() => {
    window.location.hash = "#inicio";
  });
  await expect(nav.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => document.fonts.ready);
  const moreAtHome = await left(more);
  await page.evaluate(() => {
    window.location.hash = "#misturadas";
  });
  await expect(nav.getByRole("link", { name: /^Misturadas/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.evaluate(() => document.fonts.ready);
  expect(await left(more)).toBe(moreAtHome);
});
