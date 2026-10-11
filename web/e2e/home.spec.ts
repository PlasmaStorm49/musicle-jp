import { expect, open, test } from "./helpers.ts";

test("sem fragmento, o site abre na home, e cada cartão leva ao seu modo", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "");
  const title = page.getByRole("heading", { level: 1, name: "AteMusic" });
  await expect(title).toBeFocused();
  await expect(page).toHaveTitle("AteMusic");
  await expect(page.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");

  const song = page.getByRole("link", { name: /^Diário Música/ });
  await expect(song).toContainText("nº 1 · novo");
  await song.click();
  await expect(page.getByRole("heading", { name: "Como você quer responder hoje?" })).toBeVisible();

  // O Voltar do navegador também volta à home (é só o fragmento que muda).
  await page.goBack();
  await expect(title).toBeFocused();
  await page.getByRole("link", { name: /^Diário Álbum/ }).click();
  await page.getByRole("link", { name: "Início" }).click();
  await expect(title).toBeFocused();
  // O cartão, e não o link "Treino" da nav: os dois começam com "Treino".
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Treino/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
});

test("dia fora da agenda: os diários avisam sem link, e o Treino abre", async ({ page }) => {
  // 07/10 é antes do 1º dia das fixtures (08/10), e a agenda nunca gera dia passado (P44): o
  // teste não quebra quando a agenda cresce.
  await open(page, "2026-10-07T12:00:00-03:00", "");
  await expect(page.getByText("Não há desafio hoje")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /^Diário/ })).toHaveCount(0);
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Treino/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
});
