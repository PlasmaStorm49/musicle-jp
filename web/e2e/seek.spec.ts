// A barra que leva ao ponto da música (P224, ME95): na rodada, só no trecho já liberado, e na
// revelação, na prévia inteira. O motor falso registra de onde tocou (o offset do
// __musicleAudioLog), e é isso que o teste confere.
import type { Locator, Page } from "@playwright/test";
import { expect, lastPlayed, open, test } from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";

/** Clica na barra na fração dela (0 a 1). */
async function clickAt(slider: Locator, fraction: number): Promise<void> {
  // A barra e o alvo têm a mesma largura: o respiro do alvo é só em cima e embaixo.
  const box = await slider.boundingBox();
  if (!box) throw new Error("a barra não está na tela");
  await slider.click({ position: { x: box.width * fraction, y: box.height / 2 } });
}

/** O offset da última reprodução. */
function lastOffset(page: Page): Promise<number | undefined> {
  return page.evaluate(() => window.__musicleAudioLog?.at(-1)?.offset);
}

test("a barra da rodada leva ao ponto do liberado, e a parte fechada não toca (P224)", async ({
  page,
}) => {
  await open(page, DAY, "#normal");
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await expect.poll(() => lastOffset(page)).toBeDefined();
  const start = (await lastOffset(page)) ?? 0;
  // Ouvir mais duas vezes: 4 s liberados, numa barra de 16 s.
  await page.getByRole("button", { name: /Ouvir mais/ }).click();
  await page.getByRole("button", { name: /Ouvir mais/ }).click();
  await expect(page.getByRole("button", { name: /^(Tocar 4 s|Parar)$/ })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Ponto do trecho" });
  const plays = await page.evaluate(() => window.__musicleAudioLog?.length ?? 0);
  await clickAt(slider, 2 / 16); // o segundo 2
  await expect
    .poll(() => page.evaluate(() => window.__musicleAudioLog?.length ?? 0))
    .toBe(plays + 1);
  expect((await lastOffset(page)) ?? 0).toBeCloseTo(start + 2, 0);
  // A parte ainda fechada não toca nada.
  await clickAt(slider, 12 / 16);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(plays + 1);
  // A etapa não muda: o Tocar continua com os 4 s.
  await expect(page.getByRole("button", { name: /^(Tocar 4 s|Parar)$/ })).toBeVisible();
});

test("a barra da revelação leva ao ponto da prévia inteira (P224)", async ({ page }) => {
  await open(page, DAY, "#normal");
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const track = await lastPlayed(page);
  await page.getByRole("button", { name: "Não sei" }).click();
  const slider = page.getByRole("slider", { name: "Ponto da prévia" });
  await expect(slider).toBeVisible();
  await clickAt(slider, 0.5);
  const preview = track.preview;
  if (!preview) throw new Error("a faixa não tem prévia");
  await expect
    .poll(async () => Math.round(((await lastOffset(page)) ?? 0) - preview.startSec))
    .toBe(Math.round((preview.durationSec ?? 30) / 2)); // sem a duração, a revelação usa 30 s
});
