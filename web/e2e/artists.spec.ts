import { readFileSync } from "node:fs";
import type { ArtistCatalog } from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  bigArtist,
  chainTitles,
  expect,
  lastPlayed,
  navLink,
  open,
  playSetlistRound,
  test,
} from "./helpers.ts";

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
    "夜空物語シリーズ · YOZORA Series",
  ]);
  await expect(page.locator(".home-modes .mode-hint")).toHaveText([
    "4 músicas",
    "4 músicas",
    "2 músicas",
    "2 músicas",
    "3 músicas",
    "5 músicas",
  ]);
  // A seção de fora do Japão (P200), embaixo, com o título dela e em ordem alfabética (P201): no
  // artists.toml das fixtures, o Re:Pulse vem antes.
  const foreign = page.getByRole("region", { name: "De fora do Japão" });
  await expect(foreign.getByRole("heading", { level: 2 })).toHaveText("De fora do Japão");
  await expect(foreign.locator(".mode-name")).toHaveText(["Hoshizora Drive", "Re:Pulse"]);
  // A seção de anime (o usuário, 02/11/2026), depois da de fora: um cartão por anime.
  const anime = page.getByRole("region", { name: "Animes" });
  await expect(anime.getByRole("heading", { level: 2 })).toHaveText("Animes");
  await expect(anime.locator(".mode-name")).toHaveText(["夜空物語シリーズ · YOZORA Series"]);
  // A capa de cada um (P168), carregada de verdade (as capas falsas do fake-assets).
  const covers = page.locator(".artist-card img.artist-cover");
  await expect(covers).toHaveCount(6);
  await expect
    .poll(() =>
      covers.evaluateAll(
        (imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length,
      ),
    )
    .toBe(6);

  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  // A escolha do submodo (P161): o Livre é o Desafio sem fim.
  await expect(title).toHaveText("夜風シアター · Yokaze Theater");
  await page.getByRole("button", { name: "Livre" }).click();
  await expect(title).toHaveText("夜風シアター · Yokaze Theater");
  const field = page.getByRole("combobox", { name: "Qual é a música?" });
  await expect(field).toHaveAttribute("placeholder", "Nome da música");

  // 1ª rodada: o nome do artista não acha nada; o título acha, e o acerto vale 10.
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const first = await lastPlayed(page);
  test.info().annotations.push({ type: "faixa sorteada", description: first.id });
  await field.fill("夜風");
  await expect(page.getByText("Nada encontrado.").first()).toBeVisible();
  await field.fill(first.title);
  await page.getByRole("option").filter({ hasText: first.title }).first().click();
  await expect(page.getByRole("heading", { name: "Acertou! 10 de 10 pontos." })).toBeVisible();
  await expect(page.getByText("10 pontos em 1 rodada", { exact: true })).toBeVisible();
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
    page.getByText(`10 pontos em ${songs.length} rodadas`, { exact: true }),
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
  await (await navLink(page, "Artistas")).click();
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

test("trocar de artista limpa o aviso do leitor de tela da rodada (ME76)", async ({ page }) => {
  // A troca não muda o fragmento: a limpeza do hashchange não basta.
  await open(page, DAY, "#artistas");
  const live = page.locator(".sr-only[aria-live]");
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Livre" }).click();
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  await expect(live).toHaveText(/^Pulou\. Tentativa 2 de 6\./);
  // Sem rodada terminada, a troca não pede confirmação (P127).
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Artistas");
  await expect(live).toHaveText("");
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

test("Superfan: o trecho de 1 s sorteado na prévia, o erro que custa uma vida e o fim da partida (ME61, ME107)", async ({
  page,
}) => {
  await open(page, DAY, "#artistas");
  const title = page.getByRole("heading", { level: 1 });
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Superfan" }).click();
  await expect(title).toHaveText("夜風シアター · Yokaze Theater · Superfan");
  await expect(page.locator(".superfan-limits")).toHaveText("Vidas: 3 de 3 · Ajudas: 0 de 3");
  await expect(page.getByRole("button", { name: /^Pedir ajuda/ })).toBeVisible(); // logo de cara

  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const played = await lastPlayed(page);
  test.info().annotations.push({ type: "faixa sorteada", description: played.id });
  const offset = await page.evaluate(() => window.__musicleAudioLog?.at(-1)?.offset ?? -1);
  expect(offset).toBeGreaterThanOrEqual(0);
  expect(offset).toBeLessThanOrEqual(19);

  // Um palpite errado: uma vida, nenhum ponto, e o trecho de 4 s (P158).
  const other = artistFile("ar02.json").tracks.find((t) => t.id !== played.id);
  if (!other) throw new Error("ar02 sem outra música");
  const field = page.getByRole("combobox", { name: "Qual é a música?" });
  await field.fill(other.title);
  await page.getByRole("option").filter({ hasText: other.title }).first().click();
  await expect(page.locator(".superfan-limits")).toHaveText("Vidas: 2 de 3 · Ajudas: 0 de 3");
  await expect(page.getByText("Placar: 0 pontos", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Placar: 0 pontos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await expect(title).toHaveText("Artistas");

  // O recorde (o usuário, 01/11/2026): a encerrada conta, e o cartão do Superfan o mostra na hora
  // e depois de recarregar, lido do save.
  const best = page.locator("#artist-mode-superfan-best");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await expect(best).toHaveText("Recorde: 0 pontos, até a música 1");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "{}").artists?.["fixture:ar:ar02"]?.best,
        SAVE_KEY,
      ),
    )
    .toEqual({ score: 0, song: 1 });
  await page.reload();
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await expect(best).toHaveText("Recorde: 0 pontos, até a música 1");
});

test("Setlist Royale: ouvir uma vez, cada toque na hora, as vidas, a setlist completa e o sem fim (o usuário, 01/11/2026)", async ({
  page,
}) => {
  await bigArtist(page);
  await open(page, DAY, "#artistas");
  const title = page.getByRole("heading", { level: 1 });
  const head = page.locator(".session-head");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Setlist Royale" }).click();
  await expect(title).toHaveText("夜風シアター · Yokaze Theater · Setlist Royale");
  await expect(head).toContainText("Rodada 1 de 10");
  await expect(head).toContainText("Vidas: 3");
  // As opções só aparecem depois da sequência: antes, as 2 casas e o Tocar.
  const options = page.getByRole("list", { name: "As opções" });
  await expect(options).toHaveCount(0);
  await expect(page.locator(".setlist-slots li")).toHaveCount(2);

  // A 1ª rodada com um erro: ele gasta uma vida, e a rodada só passa quando acha as duas.
  const first = await playSetlistRound(page, { wrong: 1, next: false });
  expect(first).toHaveLength(2);
  await expect(page.getByText("Achou 2 de 2. Perdeu 1 vida nesta rodada.")).toBeFocused();
  await expect(head).toContainText("Vidas: 2");
  await expect(page.getByRole("button", { name: "Tocar", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // A sequência emendada: cada música entra antes de a anterior acabar, e o total encolhe.
  await expect(head).toContainText("Rodada 2 de 10");
  for (let n = 2; n <= 10; n += 1) {
    const played = await playSetlistRound(page, { next: false });
    const chain = await page.evaluate(() => window.__musicleChainLog?.at(-1));
    expect(chain?.ats[1]).toBeLessThan((chain?.ats[0] ?? 0) + (chain?.seconds[0] ?? 0));
    expect(played).toEqual(await chainTitles(page));
    await page.locator(".setlist-board .player-actions > button.primary").click();
  }

  // Na 10ª, a setlist acaba; o recorde vai ao save, e o right do artista não muda.
  await expect(title).toHaveText("Setlist completa!");
  await expect(title).toBeFocused();
  await expect(page.getByText("10 rodadas completas, 44 músicas achadas")).toBeVisible();
  const saved = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "{}").artists?.["fixture:ar:ar02"],
      SAVE_KEY,
    );
  await expect.poll(saved).toEqual({ right: 0, setlist: { rounds: 10, found: 44 } });

  // O sem fim, na dificuldade da 10ª: 8 músicas e 12 opções. Dois erros acabam as vidas.
  await page.getByRole("button", { name: "Continuar sem fim" }).click();
  await expect(head).toContainText("Rodada 11 · sem fim");
  await expect(page.locator(".setlist-slots li")).toHaveCount(8);
  await playSetlistRound(page, { wrong: 2, next: false });
  await expect(options.getByRole("button")).toHaveCount(12);
  await expect(page.getByText("Achou 0 de 8. As 3 vidas acabaram.")).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado" }).click();
  await expect(title).toHaveText("Fim da setlist");
  await expect(page.getByText("As 3 vidas acabaram.")).toBeVisible();

  // O recorde no cartão, também depois de recarregar.
  await page.getByRole("button", { name: "Trocar de artista" }).click();
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  const best = page.locator("#artist-mode-setlist-best");
  await expect(best).toHaveText("Recorde: 10 rodadas, 44 músicas");
  await page.reload();
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await expect(best).toHaveText("Recorde: 10 rodadas, 44 músicas");
});

test("Setlist Royale: o Espiar e o Bis, uma de cada por run, e a setlist completa com eles não é perfeita (o usuário, 02/11/2026)", async ({
  page,
}) => {
  await bigArtist(page);
  await open(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Setlist Royale" }).click();
  const options = page.getByRole("list", { name: "As opções" });
  const result = page.locator(".setlist-result");
  /** Marca as que tocaram e ainda faltam (a revelada já está marcada). */
  const pickLeft = async (played: readonly string[]) => {
    const peeked = await options.locator("li.peeked .item-title").allTextContents();
    for (const title of played.filter((t) => !peeked.includes(t))) {
      if ((await result.count()) > 0) break;
      await options.getByText(title, { exact: true }).click();
    }
    await expect(result).toBeVisible();
  };
  // Antes de ouvir, nenhuma ajuda: elas são da hora de escolher.
  await expect(page.getByRole("button", { name: /^Espiar/ })).toHaveCount(0);

  // 1ª rodada: o Espiar revela uma das que tocaram, com o olho, e fica gasto.
  await page.getByRole("button", { name: "Tocar", exact: true }).click();
  await expect(options).toBeVisible();
  const first = await chainTitles(page);
  await page.getByRole("button", { name: "Espiar" }).click();
  await expect(options.locator("li.peeked")).toHaveCount(1);
  expect(first).toContain(await options.locator("li.peeked .item-title").textContent());
  await expect(page.getByText("Quais tocaram? Falta 1 música.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Espiar, já usada" })).toBeVisible();
  await pickLeft(first);
  await page.locator(".setlist-board .player-actions > button.primary").click();

  // 2ª rodada: o Espiar continua gasto; o Bis toca a mesma sequência, e os toques valem.
  await page.getByRole("button", { name: "Tocar", exact: true }).click();
  await expect(options).toBeVisible();
  await expect(page.getByRole("button", { name: "Espiar, já usada" })).toBeVisible();
  const second = await chainTitles(page);
  await page.getByRole("button", { name: "Bis" }).click();
  await expect(page.getByRole("button", { name: "Bis, já usada" })).toBeVisible();
  const chains = await page.evaluate(() => window.__musicleChainLog?.slice(-2) ?? []);
  expect(chains).toHaveLength(2);
  expect(chains[1]).toEqual(chains[0]);
  await pickLeft(second);
  await page.locator(".setlist-board .player-actions > button.primary").click();

  // Até a 10ª, sem erro: a setlist completa, mas sem o perfeito no save (as ajudas o tiram).
  for (let n = 3; n <= 10; n += 1) await playSetlistRound(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Setlist completa!");
  const saved = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "{}").artists?.["fixture:ar:ar02"],
      SAVE_KEY,
    );
  await expect.poll(saved).toEqual({ right: 0, setlist: { rounds: 10, found: 44 } });
  // O sem fim não devolve as ajudas.
  await page.getByRole("button", { name: "Continuar sem fim" }).click();
  await page.getByRole("button", { name: "Tocar", exact: true }).click();
  await expect(options).toBeVisible();
  await expect(page.getByRole("button", { name: "Espiar, já usada" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bis, já usada" })).toBeVisible();
});
