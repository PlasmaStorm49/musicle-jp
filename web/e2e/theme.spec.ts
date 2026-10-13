// O tema claro e escuro (M12, P176, P191): o Automático segue o aparelho só pelo CSS, e a troca
// na Início vale na hora, fica gravada e volta antes da pintura (o script do index.html).
import type { Page } from "@playwright/test";
import { THEME_KEY } from "../src/storage/theme.ts";
import { expect, open, test } from "./helpers.ts";

const NOW = "2026-10-08T12:00:00-03:00";
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const BLACK = "rgb(0, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

test("no Automático, o aparelho escuro deixa a página escura, sem atributo no <html>", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, NOW, "");
  await expect(page.getByRole("radio", { name: "Automático" })).toBeChecked();
  expect(await background(page)).toBe(BLACK);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});

test("escolher Claro num aparelho escuro vale na hora, e depois de recarregar já vem antes do app", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  // O tema que o <html> tem quando o <div id="app"> aparece: o <head> (com o script do tema) já
  // rodou, e o main.tsx, um módulo, só roda no fim do HTML. O DOMContentLoaded não serve: os
  // módulos rodam antes dele.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.getElementById("app")) return;
      window.__themeAtLoad = document.documentElement.dataset.theme ?? "auto";
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await open(page, NOW, "");
  expect(await background(page)).toBe(BLACK);
  await page.getByRole("radio", { name: "Claro" }).check();
  expect(await background(page)).toBe(WHITE);
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe("light");

  await page.reload();
  await expect(page.getByRole("radio", { name: "Claro" })).toBeChecked();
  expect(await page.evaluate(() => window.__themeAtLoad)).toBe("light");
  expect(await background(page)).toBe(WHITE);
  // A barra do navegador acompanha: as duas metas com o branco.
  const colors = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((metas) => metas.map((m) => (m as HTMLMetaElement).content));
  expect(colors).toEqual(["#ffffff", "#ffffff"]);
});

test("escolher Escuro num aparelho claro deixa o jogo escuro também nas outras abas", async ({
  page,
}) => {
  await open(page, NOW, "");
  // O Automático, num aparelho claro, é claro: o bloco escuro só vale dentro do @media.
  expect(await background(page)).toBe(WHITE);
  await page.getByRole("radio", { name: "Escuro" }).check();
  await page.getByRole("navigation").getByRole("link", { name: "Desafio" }).click();
  await expect(page.getByRole("button", { name: /^Tocar/ })).toBeVisible();
  expect(await background(page)).toBe(BLACK);
});
