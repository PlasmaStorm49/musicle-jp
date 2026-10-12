import { albumOf, expect, lastPlayed, open, option, test } from "./helpers.ts";

test("Treino: rodadas seguidas, placar e modo que vale na próxima rodada", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#treino");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
  await expect(page.getByRole("radio", { name: "Normal" })).toBeChecked();

  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  // O Treino sorteia com crypto, sem semente: a faixa vai no relatório, para reproduzir uma falha.
  const played = await lastPlayed(page);
  test.info().annotations.push({ type: "faixa sorteada", description: played.id });
  await option(page, albumOf(played).title).click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await expect(page.getByText("6 pontos em 1 rodada")).toBeVisible();

  // Trocar o modo não mexe na rodada que está na tela.
  await page.getByRole("radio", { name: "Desafio" }).check();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();

  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Qual é a música?" })).toBeVisible();
});

test("o Treino continua ao trocar de aba e voltar", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#treino");
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();

  await page.getByRole("link", { name: "Normal" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 1");
  await page.getByRole("link", { name: "Treino" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();
  await expect(page.getByText("0 pontos em 1 rodada")).toBeVisible();
});
