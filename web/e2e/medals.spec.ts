// As Medalhas (M16, PR 2a): a tela e a aba só com a lista de exemplo (?medalhas=demo, em
// desenvolvimento); sem ela, como no site, nada muda. Os avisos vêm no PR 2b.
import { expect, lastPlayed, open, openWithMedals, seedHistory, test } from "./helpers.ts";

const DAY = "2026-10-22T12:00:00-03:00";
const lost = { status: "lost", stage: 0, attempts: [] } as const;
const day = { number: 1, rounds: [lost, lost, lost] };

test("sem a lista, como no site: nem a aba das Medalhas, e o #medalhas abre a Início", async ({
  page,
}) => {
  await open(page, DAY, "#medalhas");
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Medalhas" })).toHaveCount(0);
});

test("com a lista de exemplo: a aba, a tela com a sequência, as gerais e o Superfan de cada artista (P278, P282, P286)", async ({
  page,
}) => {
  await seedHistory(page, {
    "2026-10-20|song": day,
    "2026-10-21|anime-musica-facil": day,
    "2026-10-22|album": day,
  });
  await openWithMedals(page, DAY, "#inicio");
  await page.getByRole("navigation").getByRole("link", { name: "Medalhas" }).click();
  const title = page.getByRole("heading", { level: 1, name: "Medalhas" });
  await expect(title).toBeFocused();
  await expect(page.getByText("Dias seguidos jogando: 3. O melhor: 3.")).toBeVisible();
  // As 3 de exemplo, ganhas com os 3 dias seguidos e o 1º diário; a dos 5, não.
  await expect(page.locator(".medal-list .medal-how")).toHaveText(["Ganha", "3 de 5", "Ganha"]);
  // As 3 do Superfan de cada artista das fixtures, por ganhar.
  await expect(page.locator(".medal-artist")).toHaveCount(5);
  await expect(page.locator(".medal-artist").first().locator(".medal-name")).toHaveText([
    "Prata",
    "Ouro",
    "Suprema",
  ]);
  await expect(page.getByText("2 de 18 medalhas")).toBeVisible();
});

test("um acerto na Livre aparece no progresso da prata do artista (P285, P289)", async ({
  page,
}) => {
  await openWithMedals(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Livre" }).click();
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const first = await lastPlayed(page);
  const field = page.getByRole("combobox", { name: "Qual é a música?" });
  await field.fill(first.title);
  await page.getByRole("option").filter({ hasText: first.title }).first().click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Medalhas" }).click();
  const artist = page.locator(".medal-artist").filter({ hasText: "夜風シアター" });
  await expect(artist.locator(".medal-how").first()).toHaveText("1 de 50 acertos");
});
