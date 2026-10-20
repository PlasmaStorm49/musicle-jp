// A interface nova (M12, PR D): as telas cabem sem rolar nos tamanhos de contrato (P214), nada rola
// para o lado em 320 px e os alvos da nav têm 44 px. Cada PR do D acrescenta as telas dele.
import type { Locator } from "@playwright/test";
import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import { appleArtistList, expect, open, overflow, test } from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";

// O iPhone SE e o Android comum (P214): as telas de escolha do PR D1 cabem inteiras.
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

test("a Início: os segmentos do tema e o Como funciona têm alvo de 44 px (P213)", async ({
  page,
}) => {
  await open(page, DAY, "#inicio");
  const how = page.locator("details.home-how-box > summary");
  expect((await target(how)).height).toBeGreaterThanOrEqual(44);
  // O alvo é o segmento inteiro (o rótulo), e não só o rádio.
  for (const name of ["Automático", "Claro", "Escuro"]) {
    const label = page.locator(".theme-options label").filter({ hasText: name });
    const { height, width } = await target(label);
    expect(height, name).toBeGreaterThanOrEqual(44);
    expect(width, name).toBeGreaterThanOrEqual(44);
  }
});
