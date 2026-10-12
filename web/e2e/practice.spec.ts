import { albumOf, expect, lastPlayed, open, option, test } from "./helpers.ts";

test("Treino: escolhe o modo, joga e segue nele; reiniciar pede confirmação (P105)", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#treino");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Treino");
  await expect(title).toBeFocused();
  await page.getByRole("button", { name: "Normal" }).click();
  await expect(title).toHaveText("Treino · Normal");

  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  // O Treino sorteia com crypto, sem semente: a faixa vai no relatório, para reproduzir uma falha.
  const played = await lastPlayed(page);
  test.info().annotations.push({ type: "faixa sorteada", description: played.id });
  await option(page, albumOf(played).title).click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await expect(page.getByText("6 pontos em 1 rodada")).toBeVisible();

  // A próxima rodada continua no Normal.
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qual é o álbum?" })).toBeVisible();

  // Com rodada jogada, reiniciar pergunta antes; Cancelar mantém a sessão.
  const restart = page.getByRole("button", { name: "Reiniciar o Treino" });
  await restart.click();
  await expect(page.getByText(/O placar desta sessão \(6 pontos em 1 rodada\)/)).toBeFocused();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(restart).toBeFocused();
  await expect(page.getByText("Rodada 2")).toBeVisible();

  // Confirmar volta à escolha; o Desafio começa com o placar zerado.
  await restart.click();
  await page.getByRole("button", { name: "Sim, reiniciar" }).click();
  await expect(title).toHaveText("Treino");
  await expect(title).toBeFocused();
  await page.getByRole("button", { name: "Desafio" }).click();
  await expect(title).toHaveText("Treino · Desafio");
  await expect(page.getByRole("combobox", { name: "Qual é a música?" })).toBeVisible();
  await expect(page.getByText("0 pontos em 0 rodadas")).toBeVisible();

  // Sem rodada jogada, reinicia direto.
  await restart.click();
  await expect(title).toHaveText("Treino");
});

test("o Treino continua ao trocar de aba, a home mostra o modo, e recarregar volta à escolha", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#treino");
  await page.getByRole("button", { name: "Normal" }).click();
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();

  await page.getByRole("link", { name: "Normal" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 1");
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: /^Treino/ })).toContainText(
    "Nesta sessão (Normal): 0 pontos em 1 rodada",
  );
  await page.getByRole("link", { name: "Treino" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino · Normal");
  await expect(page.getByText("Rodada 2")).toBeVisible();
  await expect(page.getByText("0 pontos em 1 rodada")).toBeVisible();

  // O Treino não salva nada (P50): recarregar começa da escolha.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
  await expect(page.getByRole("button", { name: "Normal" })).toBeVisible();
});
