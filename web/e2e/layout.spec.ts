// A interface nova (M12, PR D): as telas cabem sem rolar nos tamanhos de contrato (P214), nada rola
// para o lado em 320 px e os alvos têm 44 px. Cada PR do D acrescentou as telas dele: o D1, as de
// escolha; o D2, as rodadas, com o selo da Apple simulado (appleCatalog) e a altura reservada; o
// D3, a revelação e o resumo do dia.
import type { Locator, Page } from "@playwright/test";
import type { Save } from "../src/core/records.ts";
import type { Catalog } from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  albumOf,
  appleArtistList,
  appleCatalog,
  dailyAnswer,
  expect,
  open,
  overflow,
  test,
  trackById,
} from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";
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

    test("a Início no caso mais alto: os dois diários terminados e as duas sessões com placar", async ({
      page,
    }) => {
      const lost = { status: "lost", stage: 0, attempts: [] } as const;
      const day = { number: 1, rounds: [lost, lost, lost] };
      const save = {
        schemaVersion: 5,
        history: { "2026-10-08|album": day, "2026-10-08|song": day },
        inProgress: {},
      } satisfies Save;
      await page.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [
        SAVE_KEY,
        JSON.stringify(save),
      ] as const);
      await open(page, DAY, "#artistas");
      await page.getByRole("button", { name: /^青井ユウ/ }).click();
      await page.getByRole("button", { name: "Livre" }).click();
      await page.getByRole("button", { name: "Desistir" }).click();
      await page.getByRole("navigation").getByRole("link", { name: "Treino" }).click();
      await page.getByRole("button", { name: "Normal", exact: true }).click();
      await page.getByRole("button", { name: "Não sei" }).click();
      await page.getByRole("link", { name: "Início" }).click();
      const cards = page.getByRole("main").getByRole("link");
      await expect(cards.filter({ hasText: "Nesta sessão" })).toHaveCount(2);
      await expect(cards.filter({ hasText: "terminado" })).toHaveCount(2);
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

    test("a ajuda do diário, depois de 3 tentativas, com o selo da Apple: as opções no lugar do campo", async ({
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
      await expect(page.locator(".distribution > li")).toHaveCount(19);
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

test("em 320 px, nenhuma tela rola para o lado", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, DAY, "#inicio");
  for (const [hash, title] of [
    ["#inicio", "AteMusic"],
    ["#normal", "Normal · nº 1"],
    ["#desafio", "Desafio · nº 1"],
    ["#treino", "Treino"],
    ["#artistas", "Artistas"],
  ] as const) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    expect((await overflow(page)).horizontal, hash).toBeLessThanOrEqual(0);
  }
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
  await page.getByRole("navigation").getByRole("link", { name: "Artistas" }).click();
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

test("a nav: o selo é a Início (P205), e as 5 abas têm alvo de 44 × 44 px", async ({ page }) => {
  await open(page, DAY, "#normal");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Início" }).locator("img.nav-logo")).toBeVisible();
  const links = await nav.getByRole("link").all();
  expect(links).toHaveLength(5);
  for (const link of links) {
    const { height, width } = await target(link);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(width).toBeGreaterThanOrEqual(44);
  }
});

test("a Início: o switch do tema e o Como funciona têm alvo de 44 px (P213)", async ({ page }) => {
  await open(page, DAY, "#inicio");
  const how = page.locator("details.home-how-box > summary");
  expect((await target(how)).height).toBeGreaterThanOrEqual(44);
  // O alvo é o botão inteiro: o sol, a trilha e a lua.
  const { height, width } = await target(page.getByRole("switch", { name: "Tema escuro" }));
  expect(height).toBeGreaterThanOrEqual(44);
  expect(width).toBeGreaterThanOrEqual(44);
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
