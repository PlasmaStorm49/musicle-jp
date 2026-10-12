import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import { expect, open, test } from "./helpers.ts";

test("no celular (360 px, o Android comum), as cinco abas cabem numa linha, também com os dois ✓ (ME70)", async ({
  page,
}) => {
  // A fonte muda com o sistema (a CI é Linux): o teste mede, e o CSS tem folga para isso.
  await page.setViewportSize({ width: 360, height: 800 });
  // Os dois diários de 08/10 já terminados: as abas ganham o ✓, o caso mais largo.
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
  await open(page, "2026-10-08T12:00:00-03:00", "");
  const tabs = page.getByRole("navigation").getByRole("link");
  await expect(tabs).toHaveCount(5);
  await expect(tabs.filter({ hasText: "✓" })).toHaveCount(2);
  const rows = await tabs.evaluateAll(
    (links) => new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size,
  );
  expect(rows).toBe(1);
});

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
