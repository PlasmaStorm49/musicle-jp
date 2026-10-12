import { readFileSync } from "node:fs";
import type { ArtistCatalog } from "../src/core/types.ts";
import { expect, lastPlayed, open, test } from "./helpers.ts";

/** O arquivo de um artista fictício (pipeline/fixtures/artists), para saber as músicas dele. */
function artistFile(name: string): ArtistCatalog {
  const url = new URL(`../public/fixtures/artists/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as ArtistCatalog;
}

const DAY = "2026-10-08T12:00:00-03:00";

test("Artistas: a lista na ordem, a busca só pelo título e um ciclo sem repetir (M13)", async ({
  page,
}) => {
  await open(page, DAY, "#artistas");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Artistas");
  await expect(title).toBeFocused();
  await expect(page.locator(".home-modes .mode-name")).toHaveText([
    "夜風シアター · Yokaze Theater",
    "青井ユウ · Aoi Yuu",
    "ミナト · Minato",
  ]);
  await expect(page.locator(".home-modes .mode-hint")).toHaveText([
    "4 músicas",
    "4 músicas",
    "2 músicas",
  ]);

  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await expect(title).toHaveText("夜風シアター · Yokaze Theater");
  const field = page.getByRole("combobox", { name: "Qual é a música?" });
  await expect(field).toHaveAttribute("placeholder", "Nome da música");

  // 1ª rodada: o nome do artista não acha nada; o título acha, e o acerto vale 6.
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const first = await lastPlayed(page);
  test.info().annotations.push({ type: "faixa sorteada", description: first.id });
  await field.fill("夜風");
  await expect(page.getByText("Nada encontrado.").first()).toBeVisible();
  await field.fill(first.title);
  await page.getByRole("option").filter({ hasText: first.title }).first().click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await expect(page.getByText("6 pontos em 1 rodada", { exact: true })).toBeVisible();

  // As outras músicas saem antes de alguma repetir (o saco do Treino, P125).
  const played = [first.id];
  const songs = artistFile("ar02.json").tracks.map((t) => t.id);
  for (let round = 2; round <= songs.length; round++) {
    await page.getByRole("button", { name: "Próxima rodada" }).click();
    await expect(page.getByText(`Rodada ${round}`)).toBeVisible();
    await page.getByRole("button", { name: "Tocar 1 s" }).click();
    played.push((await lastPlayed(page)).id);
    await page.getByRole("button", { name: "Desistir" }).click();
  }
  expect([...played].sort()).toEqual([...songs].sort());
  await expect(
    page.getByText(`6 pontos em ${songs.length} rodadas`, { exact: true }),
  ).toBeVisible();
});

test("trocar de artista pede confirmação; a sessão segue entre as abas e some ao recarregar", async ({
  page,
}) => {
  await open(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await page.getByRole("button", { name: "Desistir" }).click();
  await expect(page.getByText("0 pontos em 1 rodada", { exact: true })).toBeVisible();

  // A home mostra o placar da sessão, com o artista (P126); voltar à aba mantém a rodada.
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: /^Artistas/ })).toContainText(
    "Nesta sessão (青井ユウ): 0 pontos em 1 rodada",
  );
  await page.getByRole("navigation").getByRole("link", { name: "Artistas" }).click();
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("青井ユウ · Aoi Yuu");
  await expect(page.getByText("0 pontos em 1 rodada", { exact: true })).toBeVisible();

  // Com rodada jogada, trocar pergunta antes (P127, P146): o Esc mantém, o Sim volta à lista.
  const change = page.getByRole("button", { name: "Trocar de artista" });
  const dialog = page.getByRole("dialog", { name: /^Trocar de artista\? O placar desta sessão/ });
  await change.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(change).toBeFocused();
  await change.click();
  await page.getByRole("button", { name: "Sim, trocar" }).click();
  await expect(title).toHaveText("Artistas");
  await expect(title).toBeFocused();

  // Recarregar volta à lista (P116: nada fica salvo).
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await expect(title).toHaveText("夜風シアター · Yokaze Theater");
  await page.reload();
  await expect(title).toHaveText("Artistas");
});

test("o diário de hoje sem resultado tira as músicas dele do artista (P141)", async ({ page }) => {
  // 08/10: a resposta tr02 é uma versão de 夜明けのめろでぃ (tr01), e o álbum dela entrega 灯台.
  await open(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^ミナト/ }).click();
  const notice = page.getByText(/^Não há rodada para sortear agora/);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
  await expect(page.getByRole("button", { name: "Trocar de artista" })).toBeVisible();
});

test("toque duplo num artista, no celular: começa a sessão sem tocar nem trocar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^青井ユウ/ }).dblclick();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("青井ユウ · Aoi Yuu");
  await expect(page.getByText("Rodada 1")).toBeVisible();
  expect(await page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(0);
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Artistas");
});
