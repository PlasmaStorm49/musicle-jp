// As Medalhas (M16): a tela e a aba, com a lista real (P310), e os avisos (P279, P281, P288): o
// 1º de quem já jogava, o que espera o fim da rodada, o do "Ver resultado", o do fim do Superfan,
// o do Treino, o toque duplo e as duas abas. Os avisos se testam com a lista de exemplo
// (`?medalhas=demo`, de limites fáceis) e com a real (`avisos`); o resto dos e2e os cala.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { ArtistCatalog } from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  albumOf,
  appleArtistList,
  bigArtist,
  expect,
  hitsTab,
  lastPlayed,
  navLink,
  open,
  openWithMedals,
  option,
  playSetlistRound,
  seedHistory,
  test,
} from "./helpers.ts";

const DAY = "2026-10-22T12:00:00-03:00";
const lost = { status: "lost", stage: 0, attempts: [] } as const;
const day = { number: 1, rounds: [lost, lost, lost] };

const toast = (page: Page) => page.locator(".medal-toast");

/**
 * Um momento para o efeito que reivindica rodar: sem aviso, não há o que esperar na tela (a
 * conferência de que nada apareceu passaria antes da hora).
 */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(300);
}

/** Joga o diário aberto até a revelação da última rodada, com o "Não sei". */
async function playToLastReveal(page: Page): Promise<void> {
  for (const next of ["Próxima rodada", "Próxima rodada"]) {
    await page.getByRole("button", { name: "Não sei" }).click();
    await page.getByRole("button", { name: next }).click();
  }
  await page.getByRole("button", { name: "Não sei" }).click();
  await expect(page.getByRole("button", { name: "Ver resultado" })).toBeVisible();
}

const shelf = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").shelf, SAVE_KEY);

const seenMedals = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").seenMedals, SAVE_KEY);

test("a lista real, como no site: a aba, a tela com a sequência, as 17 da lista em blocos (com as 4 das Misturadas, ME123) e o Superfan de cada artista (P278, P282, P286, P310)", async ({
  page,
}) => {
  await seedHistory(page, {
    "2026-10-20|song": day,
    "2026-10-21|anime-musica-facil": day,
    "2026-10-22|album": day,
  });
  // O padrão dos e2e: a lista real, com os avisos calados.
  await open(page, DAY, "#inicio");
  await (await navLink(page, "Medalhas")).click();
  const title = page.getByRole("heading", { level: 1, name: "Medalhas" });
  await expect(title).toBeFocused();
  await expect(page.getByText("Dias seguidos jogando: 3. O melhor: 3.")).toBeVisible();
  // As 34, nos blocos (o usuário, 28/10/2026): as gerais (com o Colecionador e o Superfan) e as de
  // cada modo; em cada bloco, as pequenas antes das grandes. O 1º diário ganho, e o progresso das que
  // se ganham aos poucos.
  const rows = page.locator(".medal-list > li");
  await expect(rows.locator(".medal-name")).toHaveText([
    "Primeiro Acorde",
    "Relâmpago",
    "Em Chamas",
    "Maratonista",
    "Já É de Casa",
    "Colecionador",
    "Hora Extra",
    "Superfan",
    "Tá pegando fogo, bicho!!!",
    "Dia de Hit",
    "Saco de Pancadas",
    "Hit Perfeito",
    "Pare de falar em tocar grama...",
    "Sensei",
    "Tudo Junto e Misturado",
    "DJ Residente",
    "Pode juntar mais uma",
    "Harmonia no Caos",
    "Insert Coin",
    "Saindo do Tutorial",
    "Plus Ultra",
    "Edição Especial",
    "Sem um Arranhão",
    "Só acaba quando acabar...",
    "Ouvido Afiado",
    "Três Segundos de Fama",
    "Freguês",
    "Enciclopédia de Anisong",
    "Sabe-Tudo",
    "A Resposta",
    "Magnum Opus",
    "Kami",
    "Ouvido Absoluto",
    "Ritmo Constante",
  ]);
  // O como ganhar em todas, também na ganha (o usuário, 24/10/2026), e o progresso embaixo das
  // que se ganham aos poucos.
  await expect(rows.locator(".medal-how")).toHaveText([
    "Termine um diário no dia",
    /^Acerte uma rodada/,
    "Jogue 7 dias seguidos",
    "Termine os 8 diários no mesmo dia",
    "Termine 50 diários no dia",
    "Chegue a 50 acertos com cada um de 5 artistas",
    "Termine os 8 diários, os 2 das Misturadas e o quiz no mesmo dia",
    "Termine uma partida do Superfan",
    "Jogue 30 dias seguidos",
    /^Acerte todas/,
    "Acerte 100 rodadas no Treino",
    /^Gabarite/,
    /^Acerte todas/,
    /^Gabarite/,
    "Ache todas as músicas de uma rodada das Misturadas",
    "Termine ao menos 1 diário das Misturadas por dia, 15 dias seguidos",
    /^Gabarite os 2 diários das Misturadas/,
    /^Ache todas as músicas de 1 diário das Misturadas por dia \(basta um dos dois\), 7 dias/,
    "Termine o quiz no dia",
    "Chegue à rodada 10 do quiz",
    "Chegue à rodada 25 do quiz",
    "Chegue à rodada 15 num especial da semana",
    "Chegue à rodada 15 do quiz sem errar",
    "Na última vida do quiz, acerte 10 seguidas",
    "Faça 50 pontos numa run do quiz",
    "Numa run com 10 acertos ou mais, acerte todos em 3 s",
    "Termine o quiz 15 dias seguidos",
    "Acerte 300 rodadas no quiz",
    "Chegue à rodada 15 do quiz em 6 tipos de pergunta",
    "Termine uma run do quiz exatamente na rodada 42",
    "Chegue à rodada 50 do quiz",
    "Chegue à rodada 30 do quiz sem errar",
    "Faça 120 pontos numa run do quiz",
    "Chegue à rodada 15 do quiz 7 dias seguidos",
  ]);
  await expect(rows.locator(".medal-progress")).toHaveText([
    "3 de 7 dias seguidos",
    "3 de 50 diários",
    "0 de 5 artistas com 50 acertos",
    "3 de 30 dias seguidos",
    "0 de 100 acertos no Treino",
    "0 de 15 dias seguidos",
    "0 de 7 dias seguidos",
    "0 de 15 dias seguidos",
    "0 de 300 acertos no quiz",
    "0 de 6 tipos de pergunta",
    "0 de 7 dias seguidos",
  ]);
  await expect(page.locator(".medal-list > li.locked")).toHaveCount(33);
  // As 10 grandes na moldura gelo, e todas com o ícone delas (nenhuma com a marca de reserva).
  await expect(rows.locator('svg[viewBox="0 8 110 132"]')).toHaveCount(10);
  await expect(rows.locator("svg text")).toHaveCount(0);
  // As 6 de cada artista das fixtures (as 3 do Superfan e as 3 do Setlist Royale), por ganhar.
  await expect(page.locator(".medal-artist")).toHaveCount(5);
  // Um título por bloco, com a contagem dele; o dos Artistas conta as 6 de cada um.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Gerais 1 de 9",
    "Hits 0 de 3",
    "Anime 0 de 2",
    "Misturadas 0 de 4",
    "Quiz 0 de 16",
    "Artistas 0 de 30",
  ]);
  // O nome próprio de cada uma, com o latino (P295, P300): os fictícios do ar02. As do Setlist: o
  // título de outro álbum com o sufixo do nível (o usuário, 02/11/2026).
  await expect(page.locator(".medal-artist").first().locator(".medal-name")).toHaveText([
    "開幕ベル, Kaimaku Bell",
    "真夜中のカーテンコール, Mayonaka no Curtain Call",
    "夜風劇場, Yokaze Gekijo",
    "ふたりの約束 -\u2060Rehearsal-, Futari no Yakusoku -\u2060Rehearsal-",
    "ふたりの約束 -\u2060Live-, Futari no Yakusoku -\u2060Live-",
    "ふたりの約束 -\u2060One\u00a0Take-, Futari no Yakusoku -\u2060One\u00a0Take-",
  ]);
  await expect(page.getByText("1 de 64 medalhas")).toBeVisible();
  // Calado: a tela fica, e o aviso não.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await seenMedals(page)).toEqual([]);
});

test("com a lista real e os avisos, como no site: quem já jogava ganha um aviso só, com as suas, e cada uma com o ícone (P281, P310)", async ({
  page,
}) => {
  // Um diário de ontem com uma rodada em 1 s: o Primeiro Acorde e o Relâmpago, de quem já jogava.
  const won = { status: "won", stage: 0, attempts: ["right"] } as const;
  await seedHistory(page, { "2026-10-21|album": { number: 1, rounds: [won, lost, lost] } });
  await openWithMedals(page, DAY, "#inicio", "avisos");
  const big = page.getByRole("dialog", { name: "Você já tem 2 medalhas" });
  await expect(big.getByRole("listitem")).toHaveText(["Primeiro Acorde", "Relâmpago"]);
  await expect(big.locator(".medal-notice-arts svg")).toHaveCount(2);
  await expect(big.locator(".medal-notice-arts svg text")).toHaveCount(0);
  await big.getByRole("button", { name: "Ok" }).click();
  await expect(big).toBeHidden();
  expect(await seenMedals(page)).toEqual(["diario-1", "um-segundo"]);
});

test("a medalha em destaque (ME118): destacar nas Medalhas, ver na nav das outras telas e numa rodada, recarregar e tirar (P317, P318)", async ({
  page,
}) => {
  await seedHistory(page, { "2026-10-22|album": day });
  await open(page, DAY, "#medalhas");
  const favorite = page.getByRole("link", {
    name: "Medalha em destaque: Primeiro Acorde. Ver as medalhas",
  });
  await expect(favorite).toHaveCount(0);
  await page.getByRole("button", { name: "Destacar (Primeiro Acorde)" }).click();
  await expect(favorite).toBeVisible();
  // O foco fica no mesmo botão, que muda de nome (regra 16).
  await expect(
    page.getByRole("button", { name: "Tirar o destaque (Primeiro Acorde)" }),
  ).toBeFocused();
  await expect.poll(() => shelf(page)).toEqual(["diario-1"]);
  // Em outra tela e numa rodada, no canto da nav; o toque leva às Medalhas.
  await page.getByRole("navigation").getByRole("link", { name: "Início" }).click();
  await expect(favorite).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "#desafio";
  });
  await expect(page.getByRole("combobox", { name: "Qual é a música?" })).toBeVisible();
  await expect(favorite).toBeVisible();
  await page.reload();
  await expect(favorite).toBeVisible();
  await favorite.click();
  await expect(page.getByRole("heading", { level: 1, name: "Medalhas" })).toBeVisible();
  // Na escolhida, o botão tira o destaque.
  await page.getByRole("button", { name: "Tirar o destaque (Primeiro Acorde)" }).click();
  await expect(favorite).toHaveCount(0);
  await expect.poll(() => shelf(page)).toEqual([]);
  await expect(page.getByRole("button", { name: "Destacar (Primeiro Acorde)" })).toBeFocused();
});

test("a do Superfan em destaque: o nome e as cores do artista, sem a capa da Apple (P319)", async ({
  page,
}) => {
  await appleArtistList(page);
  await seedHistory(
    page,
    {},
    { "fixture:ar:ar02": { right: 50 } },
    { shelf: ["superfan|fixture:ar:ar02|acertos"] },
  );
  await open(page, DAY, "#inicio");
  const favorite = page.getByRole("link", {
    name: "Medalha em destaque: 開幕ベル, Kaimaku Bell, de 夜風シアター (50 acertos). Ver as medalhas",
  });
  await expect(favorite).toBeVisible();
  // O monograma no miolo, e nenhuma capa: a nav não tem o selo da Apple.
  await expect(favorite.locator("image")).toHaveCount(0);
  await expect(favorite.locator("text")).toHaveCount(1);
});

test("a do Superfan de um artista que não está na lista não aparece, nem com o monograma de reserva (P320)", async ({
  page,
}) => {
  await seedHistory(
    page,
    {},
    { "fixture:ar:fora": { right: 50 } },
    { shelf: ["superfan|fixture:ar:fora|acertos"] },
  );
  await open(page, DAY, "#artistas");
  // A lista carregou (os artistas na tela), e a medalha continua fora da nav.
  await expect(page.locator(".artist-card").first()).toBeVisible();
  await settle(page);
  await expect(page.locator(".nav-favorite")).toHaveCount(0);
});

test("uma medalha em destaque que não está entre as ganhas não aparece (P320)", async ({
  page,
}) => {
  await seedHistory(page, {}, {}, { shelf: ["seguidos-30"] });
  await open(page, DAY, "#inicio");
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeVisible();
  await settle(page);
  await expect(page.locator(".nav-favorite")).toHaveCount(0);
});

test("o Saco de Pancadas: o 100º acerto do Treino avisa na tela calma seguinte, e não na rodada (P288, P308)", async ({
  page,
}) => {
  await seedHistory(page, {}, {}, { practiceRight: 99 });
  await openWithMedals(page, DAY, "#treino", "avisos");
  await page.getByRole("button", { name: "Normal" }).click();
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await option(page, albumOf(await lastPlayed(page)).title).click();
  await expect(page.getByRole("heading", { name: /^Acertou!/ })).toBeVisible();
  await settle(page);
  await expect(toast(page)).toHaveCount(0);
  await hitsTab(page).click();
  await expect(toast(page).locator(".medal-toast-text")).toHaveText(
    "Medalha nova: Saco de Pancadas",
  );
  expect(await seenMedals(page)).toEqual(["treino-100"]);
});

test("quem já jogava: um aviso só, o grande, com o total; o Ok fecha, devolve o foco e o aviso não volta ao recarregar (P281)", async ({
  page,
}) => {
  await seedHistory(page, {
    "2026-10-20|song": day,
    "2026-10-21|anime-musica-facil": day,
    "2026-10-22|album": day,
  });
  await openWithMedals(page, DAY, "#inicio");
  const big = page.getByRole("dialog", { name: "Você já tem 2 medalhas" });
  await expect(big).toBeVisible();
  // As grandes primeiro (P313).
  await expect(big.getByRole("listitem")).toHaveText(["Três dias seguidos", "Primeiro diário"]);
  const ok = big.getByRole("button", { name: "Ok" });
  await expect(ok).toBeFocused();
  // Pelo teclado (o `detail` 0 do Enter passa pelo singleClick).
  await page.keyboard.press("Enter");
  await expect(big).toBeHidden();
  const home = page.getByRole("heading", { level: 1, name: "AteMusic" });
  await expect(home).toBeFocused();
  expect(await seenMedals(page)).toEqual(["demo-primeiro", "demo-sequencia"]);

  await page.reload();
  await expect(home).toBeVisible();
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page)).toHaveCount(0);
});

test("no meio de um diário, o aviso espera: nada na rodada nem na revelação, e o pequeno no Ver resultado (P288)", async ({
  page,
}) => {
  // A medalha já estava ganha (o diário de ontem), mas a abertura caiu num diário: ela espera.
  await seedHistory(page, { "2026-10-21|song": day });
  await openWithMedals(page, DAY, "#normal");
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeVisible();
  await settle(page);
  await expect(toast(page)).toHaveCount(0);
  await playToLastReveal(page);
  await settle(page);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Ver resultado" }).click();
  await expect(toast(page).locator(".medal-toast-text")).toHaveText(
    "Medalha nova: Primeiro diário",
  );
  // O pequeno é decorativo e não pega o foco: o leitor de tela ouve o texto pela região aria-live,
  // e o foco fica no resumo.
  await expect(toast(page)).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".sr-only[aria-live]")).toHaveText("Medalha nova: Primeiro diário");
  await expect(page.locator("#summary-title")).toBeFocused();
  // Ele some sozinho, depois de 5 s.
  await expect(toast(page)).toBeHidden({ timeout: 10_000 });
});

test("reabrir um diário terminado não avisa: a medalha que falta espera a tela calma (P288)", async ({
  page,
}) => {
  // Terminado e nunca avisado: abrir direto no resumo não reivindica.
  await seedHistory(page, { "2026-10-22|album": day });
  await openWithMedals(page, DAY, "#normal");
  await expect(page.locator("#summary-title")).toBeVisible();
  await settle(page);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Havia o que avisar: a Início avisa.
  await page.getByRole("navigation").getByRole("link", { name: "Início" }).click();
  await expect(toast(page).locator(".medal-toast-text")).toHaveText(
    "Medalha nova: Primeiro diário",
  );
});

test("no Anime, o Ver resultado de um diário também avisa (o onResult do Game)", async ({
  page,
}) => {
  await openWithMedals(page, DAY, "#anime-musica-facil");
  for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Desistir", exact: true }).click();
    await page.getByRole("button", { name: next }).click();
  }
  await expect(toast(page).locator(".medal-toast-text")).toHaveText(
    "Medalha nova: Primeiro diário",
  );
});

test("o jogado depois, pelo Histórico, não ganha medalha (P263)", async ({ page }) => {
  await openWithMedals(page, DAY, "#normal/2026-10-21");
  await playToLastReveal(page);
  await page.getByRole("button", { name: "Ver resultado" }).click();
  await expect(page.locator("#summary-title")).toBeVisible();
  await settle(page);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await seenMedals(page)).toEqual([]);
});

test("toque duplo no Ver resultado: o 2º clique não fecha o pop-up grande, e o Ok devolve o foco ao resumo (regra 23)", async ({
  page,
}) => {
  // Hoje é o 3º dia seguido: a sequência, a grande, junto com o 1º diário.
  await seedHistory(page, { "2026-10-20|song": day, "2026-10-21|song": day });
  await openWithMedals(page, DAY, "#normal");
  await playToLastReveal(page);
  await page.getByRole("button", { name: "Ver resultado" }).dblclick();
  const big = page.getByRole("dialog", { name: "Você já tem 2 medalhas" });
  await expect(big).toBeVisible();
  await settle(page);
  await expect(big).toBeVisible();
  // O 2º clique de um toque duplo que cai no Ok (o `detail` 2) não o fecha.
  const ok = big.getByRole("button", { name: "Ok" });
  await ok.dispatchEvent("click", { detail: 2 });
  await expect(big).toBeVisible();
  await ok.click();
  await expect(big).toBeHidden();
  await expect(page.locator("#summary-title")).toBeFocused();
});

test("duas abas: só a que reivindicou avisa; a outra, que relê o save, não (P288)", async ({
  page,
}) => {
  // As duas abertas antes de qualquer reivindicação, num diário terminado (que não reivindica): a
  // 2ª precisa reler o save na hora, e não usar o da abertura.
  await seedHistory(page, { "2026-10-22|album": day });
  await openWithMedals(page, DAY, "#normal");
  await expect(page.locator("#summary-title")).toBeVisible();
  const other = await page.context().newPage();
  try {
    await openWithMedals(other, DAY, "#normal");
    await expect(other.locator("#summary-title")).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: "Início" }).click();
    await expect(toast(page)).toBeVisible();
    await other.getByRole("navigation").getByRole("link", { name: "Início" }).click();
    await expect(other.getByRole("heading", { level: 1, name: "AteMusic" })).toBeVisible();
    await settle(other);
    await expect(toast(other)).toHaveCount(0);
    await expect(other.getByRole("dialog")).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("o aviso pequeno da lista real vai com o monograma, sem a capa da Apple, porque a Início não tem o selo (P298)", async ({
  page,
}) => {
  await appleArtistList(page);
  await seedHistory(page, {}, { "fixture:ar:ar02": { right: 50 } });
  await openWithMedals(page, DAY, "#inicio");
  await expect(toast(page).locator(".medal-toast-text")).toHaveText(
    "Medalha nova: 開幕ベル · Kaimaku Bell, de 夜風シアター",
  );
  await expect(toast(page).locator("image")).toHaveCount(0);
  await expect(page.locator(".attribution")).toHaveCount(0);
});

test("um acerto na Livre aparece no progresso da medalha dos acertos do artista (P285, P289)", async ({
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
  await expect(page.getByRole("heading", { name: "Acertou! 10 de 10 pontos." })).toBeVisible();
  await (await navLink(page, "Medalhas")).click();
  const artist = page.locator(".medal-artist").filter({ hasText: "夜風シアター" });
  await expect(artist.locator(".medal-progress")).toHaveText(["1 de 50 acertos", "0 de 7 rodadas"]);
});

test("terminar o Superfan, com um erro: o pop-up da completa com o artista no fim da partida, e a completa ganha na tela (P285)", async ({
  page,
}) => {
  const file = new URL("../public/fixtures/artists/ar02.json", import.meta.url);
  const { tracks } = JSON.parse(readFileSync(file, "utf8")) as ArtistCatalog;
  await openWithMedals(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Superfan" }).click();
  const field = page.getByRole("combobox", { name: "Qual é a música?" });
  const guess = async (title: string) => {
    await field.fill(title);
    await page.getByRole("option").filter({ hasText: title }).first().click();
  };
  for (let round = 0; ; round++) {
    await page.getByRole("button", { name: "Tocar 1 s" }).click();
    const played = await lastPlayed(page);
    // Um erro na 1ª música: a partida termina, mas não perfeita (só a completa, e não a perfeita).
    const wrong = tracks.find((t) => t.id !== played.id);
    if (round === 0 && wrong) await guess(wrong.title);
    await guess(played.title);
    const next = page.getByRole("button", { name: /^(Próxima música|Ver resultado)$/ });
    const label = await next.textContent();
    await next.click();
    if (label === "Ver resultado") break;
  }
  const end = page.getByRole("heading", { level: 1, name: "Fim da partida" });
  await expect(end).toBeVisible();
  await expect(page.getByText("Todas as músicas da partida tocaram.")).toBeVisible();
  const big = page.getByRole("dialog", { name: "Medalha nova!" });
  await expect(big).toBeVisible();
  // O feito vai junto, só para o leitor de tela (o .sr-only).
  await expect(big.getByRole("listitem")).toHaveText([
    "真夜中のカーテンコール · Mayonaka no Curtain Call, de 夜風シアター (Superfan completo)",
  ]);
  await big.getByRole("button", { name: "Ok" }).click();
  await expect(end).toBeFocused();
  await (await navLink(page, "Medalhas")).click();
  const artist = page.locator(".medal-artist").filter({ hasText: "夜風シアター" });
  // A completa, ganha, vem na frente e continua com o como ganhar; o progresso, só nas que se
  // ganham aos poucos.
  await expect(artist.locator(".medal-how")).toHaveText([
    "Termine uma partida do Superfan",
    "Chegue a 50 acertos com o artista",
    /^Termine perfeito/,
    "Chegue à 8ª rodada do Setlist Royale",
    "Termine as 10 rodadas do Setlist Royale",
    "Termine as 10 rodadas do Setlist sem perder vida",
  ]);
  await expect(artist.locator(".medal-progress")).toHaveText([/de 50 acertos$/, "0 de 7 rodadas"]);
});

test("chegar à 8ª rodada do Setlist Royale: o pop-up da -Rehearsal- no fim da run, e ela na frente na tela (o usuário, 02/11/2026)", async ({
  page,
}) => {
  await bigArtist(page);
  await openWithMedals(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Setlist Royale" }).click();
  // 7 rodadas sem erro e, na 8ª, os 3 erros: a run acaba lá, com a 7ª terminada.
  for (let n = 1; n <= 7; n += 1) await playSetlistRound(page);
  await expect(page.locator(".session-head")).toContainText("Rodada 8 de 10");
  // Na rodada, nenhum aviso: ele espera o fim da run.
  await playSetlistRound(page, { wrong: 3, next: false });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver resultado" }).click();
  const end = page.getByRole("heading", { level: 1, name: "Fim da setlist" });
  await expect(end).toBeVisible();
  const big = page.getByRole("dialog", { name: "Medalha nova!" });
  await expect(big.getByRole("listitem")).toHaveText([
    "ふたりの約束 -\u2060Rehearsal- · Futari no Yakusoku -\u2060Rehearsal-, de 夜風シアター (Setlist até a 8ª rodada)",
  ]);
  await big.getByRole("button", { name: "Ok" }).click();
  await expect(end).toBeFocused();
  await (await navLink(page, "Medalhas")).click();
  const artist = page.locator(".medal-artist").filter({ hasText: "夜風シアター" });
  await expect(artist.locator(".medal-cell:not(.locked) .medal-name")).toHaveText([
    "ふたりの約束 -\u2060Rehearsal-, Futari no Yakusoku -\u2060Rehearsal-",
  ]);
  await expect(artist.locator(".medal-cell").first()).not.toHaveClass(/locked/);
});

test("a setlist perfeita: as 10 rodadas sem perder vida gravam o perfeito, e o pop-up traz as 3 do Setlist, as grandes primeiro (o usuário, 02/11/2026)", async ({
  page,
}) => {
  await bigArtist(page);
  await openWithMedals(page, DAY, "#artistas");
  await page.getByRole("button", { name: /^夜風シアター/ }).click();
  await page.getByRole("button", { name: "Setlist Royale" }).click();
  for (let n = 1; n <= 10; n += 1) await playSetlistRound(page);
  const title = page.getByRole("heading", { level: 1, name: "Setlist completa!" });
  await expect(title).toBeVisible();
  const saved = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "{}").artists?.["fixture:ar:ar02"],
      SAVE_KEY,
    );
  await expect
    .poll(saved)
    .toEqual({ right: 0, setlist: { rounds: 10, found: 44 }, setlistPerfect: true });
  // A setlist completa é calma: o pop-up vem nela, com as grandes antes da pequena (P313).
  const big = page.getByRole("dialog", { name: "3 medalhas novas" });
  await expect(big.getByRole("listitem")).toHaveText([
    "ふたりの約束 -\u2060Live- · Futari no Yakusoku -\u2060Live-, de 夜風シアター (Setlist completa)",
    "ふたりの約束 -\u2060One\u00a0Take- · Futari no Yakusoku -\u2060One\u00a0Take-, de 夜風シアター (Setlist perfeita)",
    "ふたりの約束 -\u2060Rehearsal- · Futari no Yakusoku -\u2060Rehearsal-, de 夜風シアター (Setlist até a 8ª rodada)",
  ]);
  // O vinil, quadrado, entre os desenhos.
  await expect(big.locator('.medal-notice-arts svg[viewBox="0 0 92 92"]')).toHaveCount(1);
  await big.getByRole("button", { name: "Ok" }).click();
  await expect(title).toBeFocused();
});

test("o carrossel de cada artista: as setas no computador andam uma vista e travam nas pontas (o usuário, 02/11/2026)", async ({
  page,
}) => {
  await open(page, DAY, "#medalhas");
  const artist = page.locator(".medal-artist").first();
  const track = artist.locator(".medal-track");
  const prev = artist.getByRole("button", { name: /^Ver as medalhas anteriores de/ });
  const next = artist.getByRole("button", { name: /^Ver as próximas medalhas de/ });
  await expect(prev).toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("aria-disabled", "true");
  await next.click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(prev).not.toHaveAttribute("aria-disabled", "true");
  // As 6 cabem em duas vistas: a 2ª chega ao fim, e a seta de seguir trava.
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await prev.click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(prev).toHaveAttribute("aria-disabled", "true");
});
