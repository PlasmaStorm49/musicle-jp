// O progresso num arquivo (ME103): exportar num navegador e importar noutro, limpo, como quem
// troca de aparelho. Cada aparelho é um contexto à parte do Playwright, com o seu localStorage.
import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import { expect, open, seedHistory, test } from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";

test("exportar num aparelho e importar noutro: o dia jogado aparece, e o andamento de lá não vai", async ({
  page,
  browser,
}) => {
  const lost = { status: "lost", stage: 0, attempts: ["wrong"] } as const;
  const won = { status: "won", stage: 0, attempts: ["right"] } as const;
  await seedHistory(page, { "2026-10-08|album": { number: 1, rounds: [won, lost, won] } });
  await open(page, DAY, "#sobre");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sobre e privacidade");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("atemusic-progresso-2026-10-08.json");
  await expect(page.locator(".progress-status")).toHaveText(
    "O arquivo atemusic-progresso-2026-10-08.json foi baixado.",
  );
  const path = await download.path();

  // O outro aparelho: limpo, e com o Desafio de hoje em andamento, que fica.
  const other = await browser.newContext();
  const there = await other.newPage();
  await seedHistory(there, {}, {});
  await there.addInitScript((key) => {
    const raw = localStorage.getItem(key);
    const save = raw ? JSON.parse(raw) : null;
    if (save && !save.inProgress["2026-10-08|song"]) {
      save.inProgress["2026-10-08|song"] = { events: [{ type: "SKIP" }] };
      localStorage.setItem(key, JSON.stringify(save));
    }
  }, SAVE_KEY);
  await open(there, DAY, "#sobre");
  await there.locator('input[type="file"]').setInputFiles(path);
  const dialog = there.getByRole("dialog", {
    name: "O arquivo tem 1 dia jogado e 0 medalhas. Substituir o progresso deste aparelho por ele?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sim, substituir" }).click();
  await expect(there.locator(".progress-status")).toHaveText("Progresso importado: 1 dia jogado.");

  const saved = await there.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}") as Save,
    SAVE_KEY,
  );
  expect(Object.keys(saved.history)).toEqual(["2026-10-08|album"]);
  expect(Object.keys(saved.inProgress)).toEqual(["2026-10-08|song"]);
  // E o jogo já o mostra: o Normal de hoje terminado, no cartão dos Hits.
  await there.getByRole("link", { name: "Início" }).click();
  await expect(there.getByRole("main").getByRole("link", { name: /^Hits/ })).toContainText(
    "Normal: terminado",
  );
  await other.close();
});

test("um arquivo que não é um progresso: o aviso, e nada muda", async ({ page }) => {
  await open(page, DAY, "#sobre");
  await page.locator('input[type="file"]').setInputFiles({
    name: "outro.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"app":"outro"}'),
  });
  await expect(page.locator(".progress-status")).toHaveText(
    "Esse arquivo não é um progresso do AteMusic.",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
