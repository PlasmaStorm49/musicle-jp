import { readFileSync } from "node:fs";
import type { ArtistCatalog } from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
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
    "Hoshizora Drive",
    "Re:Pulse",
  ]);
  await expect(page.locator(".home-modes .mode-hint")).toHaveText([
    "4 músicas",
    "4 músicas",
    "2 músicas",
    "2 músicas",
    "3 músicas",
  ]);
  // A seção de fora do Japão (P200), embaixo, com o título dela e em ordem alfabética (P201): no
  // artists.toml das fixtures, o Re:Pulse vem antes.
  const foreign = page.getByRole("region", { name: "De fora do Japão" });
  await expect(foreign.getByRole("heading", { level: 2 })).toHaveText("De fora do Japão");
  await expect(foreign.locator(".mode-name")).toHaveText(["Hoshizora Drive", "Re:Pulse"]);
  // A capa de cada um (P168), carregada de verdade (as capas falsas do fake-assets).
  const covers = page.locator(".artist-card img.artist-cover");
  await expect(covers).toHaveCount(5);
  await expect
    .poll(() =>
      covers.evaluateAll(
        (imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length,
      ),
    )
    .toBe(5);

  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  // A escolha do submodo (P161): o Livre é o Desafio sem fim.
  await expect(title).toHaveText("夜風シアター · Yokaze Theater");
  await page.getByRole("button", { name: "Livre" }).click();
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
  // O acerto vai para o save (P289), pelas medalhas: o App grava pelo updateSave.
  const right = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "{}").artists?.["fixture:ar:ar02"]?.right,
      SAVE_KEY,
    );
  await expect.poll(right).toBe(1);

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
  expect(await right()).toBe(1); // desistir não é acerto
  await expect(
    page.getByText(`6 pontos em ${songs.length} rodadas`, { exact: true }),
  ).toBeVisible();
});

test("trocar de artista pede confirmação; a sessão segue entre as abas e some ao recarregar", async ({
  page,
}) => {
  await open(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Livre" }).click();
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
  await page.getByRole("button", { name: "Livre" }).click();
  const notice = page.getByText(/^Não há rodada para sortear agora/);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
  await expect(page.getByRole("button", { name: "Trocar de artista" })).toBeVisible();

  // No Superfan, a partida acaba antes de começar, e o fim diz por quê.
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await page.getByRole("button", { name: /^ミナト/ }).click();
  await page.getByRole("button", { name: "Superfan" }).click();
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Fim da partida");
  await expect(title).toBeFocused();
  await expect(page.getByText(/^Não há música para sortear agora/)).toBeVisible();
  await expect(page.getByText("Placar: 0 pontos", { exact: true })).toBeVisible();
});

test("toque duplo num artista, no Livre e no Superfan, no celular: cada um abre a tela seguinte, sem tocar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, DAY, "#artistas");
  const title = page.getByRole("heading", { level: 1 });
  // O 2º clique no artista cai num cartão da escolha do modo, que o ignora.
  await page.getByRole("button", { name: /^青井ユウ/ }).dblclick();
  await expect(title).toHaveText("青井ユウ · Aoi Yuu");
  await expect(page.getByRole("button", { name: "Livre" })).toBeVisible();
  await expect(page.getByText("Rodada 1")).toHaveCount(0);
  await page.getByRole("button", { name: "Livre" }).dblclick();
  await expect(page.getByText("Rodada 1")).toBeVisible();
  expect(await page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(0);
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await expect(title).toHaveText("Artistas");

  // O mesmo no cartão do Superfan: o 2º clique, no Tocar da partida, não toca.
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Superfan" }).dblclick();
  await expect(page.getByText("Música 1", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(0);
});

test("Superfan: o trecho de 1 s sorteado na prévia, o erro que custa 5 e o fim da partida (ME61)", async ({
  page,
}) => {
  await open(page, DAY, "#artistas");
  const title = page.getByRole("heading", { level: 1 });
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Superfan" }).click();
  await expect(title).toHaveText("夜風シアター · Yokaze Theater · Superfan");
  await expect(page.locator(".superfan-limits")).toHaveText("Erros: 0 de 3 · Ajudas: 0 de 3");
  await expect(page.getByRole("button", { name: /^Pedir ajuda/ })).toBeVisible(); // logo de cara

  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const played = await lastPlayed(page);
  test.info().annotations.push({ type: "faixa sorteada", description: played.id });
  const offset = await page.evaluate(() => window.__musicleAudioLog?.at(-1)?.offset ?? -1);
  expect(offset).toBeGreaterThanOrEqual(0);
  expect(offset).toBeLessThanOrEqual(19);

  // Um palpite errado: −5, um erro, e o trecho de 4 s (P158).
  const other = artistFile("ar02.json").tracks.find((t) => t.id !== played.id);
  if (!other) throw new Error("ar02 sem outra música");
  const field = page.getByRole("combobox", { name: "Qual é a música?" });
  await field.fill(other.title);
  await page.getByRole("option").filter({ hasText: other.title }).first().click();
  await expect(page.locator(".superfan-limits")).toHaveText("Erros: 1 de 3 · Ajudas: 0 de 3");
  await expect(page.getByText("Placar: -5 pontos", { exact: true })).toBeVisible();
  // O trecho de 4 s da mesma música começa no mesmo ponto sorteado.
  await page.getByRole("button", { name: "Tocar 4 s" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__musicleAudioLog?.length ?? 0))
    .toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__musicleAudioLog?.at(-1)?.offset)).toBe(offset);
  expect((await lastPlayed(page)).id).toBe(played.id);

  // Encerrar pergunta antes (há um erro a perder) e mostra o resultado.
  await page.getByRole("button", { name: "Encerrar a partida" }).click();
  await page.getByRole("button", { name: "Sim, encerrar" }).click();
  await expect(title).toHaveText("Fim da partida");
  await expect(title).toBeFocused();
  await expect(page.getByText("Você encerrou a partida.")).toBeVisible();
  await expect(page.getByText("Placar: -5 pontos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await expect(title).toHaveText("Artistas");
});
