import { albumOf, expect, lastPlayed, open, option, test, viaHits } from "./helpers.ts";

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
  await expect(page.getByText("6 pontos em 1 rodada", { exact: true })).toBeVisible();

  // A próxima rodada continua no Normal.
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qual é o álbum?" })).toBeVisible();

  // Com rodada jogada, reiniciar pergunta antes, num pop-up modal (ME56); Cancelar e Esc mantêm
  // a sessão e devolvem o foco ao botão.
  const restart = page.getByRole("button", { name: "Reiniciar o Treino" });
  const dialog = page.getByRole("dialog", {
    name: /O placar desta sessão \(6 pontos em 1 rodada\)/,
  });
  const cancel = page.getByRole("button", { name: "Cancelar" });
  await restart.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("dialog:modal")).toHaveCount(1); // showModal: o fundo fica inerte
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(restart).toBeFocused();
  await restart.click();
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
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
  await expect(page.getByText("0 pontos em 0 rodadas", { exact: true })).toBeVisible();

  // Sem rodada jogada, reinicia direto.
  await restart.click();
  await expect(title).toHaveText("Treino");
});

test("toque duplo num cartão, no celular: começa a sessão sem tocar, jogar nem reiniciar", async ({
  page,
}) => {
  // O 2º clique cai na tela da sessão, que o Preact já desenhou no lugar dos cartões.
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, "2026-10-08T12:00:00-03:00", "#treino");
  for (const mode of ["Normal", "Desafio"] as const) {
    await page.getByRole("button", { name: mode }).dblclick();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Treino · ${mode}`);
    await expect(page.getByText("Rodada 1")).toBeVisible();
    await expect(page.getByText("0 pontos em 0 rodadas", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(0);
    // Nada jogado: reinicia direto, sem aviso.
    await page.getByRole("button", { name: "Reiniciar o Treino" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
  }
});

test("o Treino continua ao trocar de aba, o cartão dele nos Hits mostra o modo, e recarregar volta à escolha", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#treino");
  await page.getByRole("button", { name: "Normal" }).click();
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2")).toBeVisible();

  await viaHits(page, /^Normal/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 1");
  // O placar da sessão fica no cartão do Treino, na tela dos Hits (P225).
  await page.getByRole("navigation").getByRole("link", { name: /^Hits/ }).click();
  const practiceCard = page.getByRole("main").getByRole("link", { name: /^Treino/ });
  await expect(practiceCard).toContainText("Nesta sessão (Normal): 0 pontos em 1 rodada");
  await practiceCard.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino · Normal");
  await expect(page.getByText("Rodada 2")).toBeVisible();
  await expect(page.getByText("0 pontos em 1 rodada", { exact: true })).toBeVisible();

  // O Treino não salva nada (P50): recarregar começa da escolha.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
  await expect(page.getByRole("button", { name: "Normal" })).toBeVisible();
});
