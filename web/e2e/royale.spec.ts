// O Anime Royale (o usuário, 01/11/2026): a escolha da dificuldade, a rodada com os 5 trechos e a
// grade das 9 capas, o pop-up de cada uma, o resultado e a próxima dificuldade, com o save.
import { SAVE_KEY } from "../src/storage/save.ts";
import { expect, open, royaleCover, royaleRound, test } from "./helpers.ts";

const NOON = "2026-10-20T12:00:00-03:00";
const DATE = "2026-10-20";

test("da escolha ao resultado: as 5 achadas, a próxima dificuldade e o 1º erro que encerra", async ({
  page,
}) => {
  await open(page, NOON, "#anime");
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Anime Royale/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime Royale");
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Fácil/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime Royale · Fácil");

  // O Tocar toca os 5 trechos em sequência (o motor falso registra cada um).
  const { played, options } = royaleRound(DATE, "facil");
  await expect(page.getByRole("list", { name: "As capas" }).getByRole("button")).toHaveCount(
    options.length,
  );
  await page.getByRole("button", { name: "Tocar as 5" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__musicleAudioLog?.length ?? 0), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1);

  // Cada capa certa, pelo pop-up: a capa grande, o anime e o tema, e o Marcar.
  for (const [n, id] of played.entries()) {
    await royaleCover(page, id).click();
    const dialog = page.locator("dialog.royale-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Marcar" }).click();
    if (n < played.length - 1) await expect(royaleCover(page, id)).toHaveAccessibleName(/tocou\)$/);
  }
  await expect(page.getByRole("heading", { level: 2, name: "Resultado" })).toBeFocused();
  await expect(page.locator(".royale-score")).toContainText("Achou 5 de 5");
  await expect(page.locator("ol.royale-played > li")).toHaveCount(5);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    SAVE_KEY,
  );
  expect(saved.royale.finished[`${DATE}|anime-royale-facil`]).toEqual({
    number: 13,
    found: [0, 1, 2, 3, 4],
  });

  // A próxima dificuldade: o Médio. Uma capa errada encerra.
  await page.getByRole("link", { name: "Jogar o Médio" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime Royale · Médio");
  const medio = royaleRound(DATE, "medio");
  const wrong = medio.options.find((id) => !medio.played.includes(id)) ?? "";
  await royaleCover(page, wrong).click();
  await page.locator("dialog.royale-dialog").getByRole("button", { name: "Marcar" }).click();
  await expect(page.locator(".royale-score")).toContainText("Achou 0 de 5");
  await expect(page.getByText("O erro encerrou a dificuldade.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Jogar o Difícil" })).toBeVisible();

  // Recarregar o terminado mostra o mesmo resultado, pelo save.
  await page.reload();
  await expect(page.locator(".royale-score")).toContainText("Achou 0 de 5");
});

test("recarregar no meio retoma as capas marcadas", async ({ page }) => {
  await open(page, NOON, "#anime-royale-dificil");
  const { played } = royaleRound(DATE, "dificil");
  const first = played[0] ?? "";
  await royaleCover(page, first).click();
  await page.locator("dialog.royale-dialog").getByRole("button", { name: "Marcar" }).click();
  await expect(royaleCover(page, first)).toHaveAccessibleName(/marcada, tocou\)$/);
  await page.reload();
  await expect(royaleCover(page, first)).toHaveAccessibleName(/marcada, tocou\)$/);
  await expect(page.locator(".round-head p")).toHaveText("Faltam 4");
});

test("um dia sem o Royale na agenda falsa (antes dela): o aviso, com a volta ao Anime", async ({
  page,
}) => {
  await open(page, "2026-10-07T12:00:00-03:00", "#anime-royale-facil");
  await expect(page.getByText("Não há Anime Royale hoje.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao Anime" })).toHaveAttribute(
    "href",
    "#anime",
  );
});
