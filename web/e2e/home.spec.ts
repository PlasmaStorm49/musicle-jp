import { expect, open, test } from "./helpers.ts";

test("sem fragmento, o site abre na home, e cada cartão leva ao seu modo", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "");
  const title = page.getByRole("heading", { level: 1, name: "AteMusic" });
  await expect(title).toBeFocused();
  await expect(page).toHaveTitle("AteMusic");
  await expect(page.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");

  // Os cartões ficam no main; a nav tem links com os mesmos nomes.
  const cards = page.getByRole("main");
  const normal = cards.getByRole("link", { name: /^Normal/ });
  await expect(normal).toContainText("nº 1 · novo");
  await normal.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 1");
  // O cartão some com a home, e o foco vai para a tela de destino, não para o body (regra 16).
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();

  // O Voltar do navegador também volta à home (é só o fragmento que muda).
  await page.goBack();
  await expect(title).toBeFocused();
  await cards.getByRole("link", { name: /^Desafio/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Desafio · nº 1");
  await page.getByRole("link", { name: "Início" }).click();
  await expect(title).toBeFocused();
  await cards.getByRole("link", { name: /^Treino/ }).click();
  // O Treino abre na escolha do modo (P105), com o foco no título.
  const practice = page.getByRole("heading", { level: 1, name: "Treino", exact: true });
  await expect(practice).toBeFocused();
});

test("links de antes dos dois modos (#musica, #album) abrem a home", async ({ page }) => {
  for (const hash of ["#musica", "#album"]) {
    await open(page, "2026-10-08T12:00:00-03:00", hash);
    await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();
  }
});

test("dia fora da agenda: os diários avisam sem link, e o Treino abre", async ({ page }) => {
  // 07/10 é antes do 1º dia das fixtures (08/10), e a agenda nunca gera dia passado (P44): o
  // teste não quebra quando a agenda cresce.
  await open(page, "2026-10-07T12:00:00-03:00", "");
  await expect(page.getByText("Não há diário hoje")).toHaveCount(2);
  const cards = page.getByRole("main");
  await expect(cards.getByRole("link", { name: /^(Normal|Desafio)/ })).toHaveCount(0);
  await cards.getByRole("link", { name: /^Treino/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
  await page.getByRole("button", { name: "Normal" }).click();
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeVisible();
});
