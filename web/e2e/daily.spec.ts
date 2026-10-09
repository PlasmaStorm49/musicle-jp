import {
  albumOf,
  artistName,
  captureClipboard,
  expect,
  lastPlayed,
  open,
  option,
  test,
} from "./helpers.ts";

test("Diário Música no 4 opções: do seletor de modo ao compartilhar", async ({ page }) => {
  await captureClipboard(page);
  await open(page, "2026-10-08T12:00:00-03:00");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diário Música · nº 1");
  await page.getByRole("button", { name: /^4 opções/ }).click();

  // Rodada 1: acerta de primeira (6 pontos).
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await option(page, (await lastPlayed(page)).title).click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: não sabe.
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 3: ouve mais (toca o trecho de 2 s) e acerta (5 pontos).
  await page.getByRole("button", { name: /Ouvir mais/ }).click();
  await option(page, (await lastPlayed(page)).title).click();
  await expect(page.getByRole("heading", { name: "Acertou! 5 de 6 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByText("11 de 18 pontos")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toBe(
    "musicle-jp · Diário Música nº 1 · 4 opções\n11/18\n✅\n❌\n⬛✅\nhttp://localhost:5173/",
  );
  // O ✓ é aria-hidden; o texto para leitor de tela vem num span à parte, e o navegador junta os
  // dois com um espaço: "Música (terminado)".
  await expect(page.getByRole("link", { name: "Música (terminado)" })).toBeVisible();
});

test("recarregar no meio retoma o modo e as tentativas", async ({ page }) => {
  await open(page, "2026-10-09T10:00:00-03:00");
  await page.getByRole("button", { name: /^Digitação/ }).click();
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  // O save é gravado num efeito depois da pintura: espera ele chegar ao localStorage.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const save = JSON.parse(localStorage.getItem("musicle-jp:save") ?? "{}");
        return save.inProgress?.["2026-10-09|song"]?.events?.length ?? 0;
      }),
    )
    .toBe(1);

  await page.reload();
  await expect(page.getByText("Tentativa 2 de 6")).toBeVisible();
  await expect(page.locator(".attempt")).toContainText(["Pulou"]);
  await expect(page.getByRole("button", { name: "Tocar 2 s" })).toBeVisible();
});

test("Diário Álbum na digitação: busca pelo artista e acerta", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#album");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diário Álbum · nº 1");
  await page.getByRole("button", { name: /^Digitação/ }).click();
  await page.getByRole("button", { name: "Tocar 1 s" }).click();

  const album = albumOf(await lastPlayed(page));
  await page.getByRole("combobox", { name: "Qual é o álbum?" }).fill(artistName(album));
  await page
    .getByRole("option")
    .filter({ has: page.getByText(album.title, { exact: true }) })
    .click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
});

test.describe("a virada é à meia-noite de Brasília, não no fuso do navegador (Tóquio)", () => {
  test("23:30 de 15/10 em Brasília (já 16/10 em Tóquio) ainda é o dia 15", async ({ page }) => {
    await open(page, "2026-10-15T23:30:00-03:00");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diário Música · nº 8");
  });

  test("00:30 de 16/10 em Brasília já é o dia 16", async ({ page }) => {
    await open(page, "2026-10-16T00:30:00-03:00");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diário Música · nº 9");
  });
});
