import type { Page } from "@playwright/test";
import { SAVE_KEY } from "../src/storage/save.ts";
import { animeTab, captureClipboard, expect, hitsTab, navLink, open, test } from "./helpers.ts";

// O Histórico (M15, P260 a P265). Nas fixtures, 22/10 tem os 14 dias antes dele na agenda
// (08/10 a 21/10), e 21/10 é o nº 14.
const TODAY = "2026-10-22T12:00:00-03:00";

/** Termina o Normal aberto sem acertar: o "Não sei" nas 3 rodadas. */
async function giveUpNormal(page: Page): Promise<void> {
  for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Não sei" }).click();
    await page.getByRole("button", { name: next }).click();
  }
}

/** O valor de uma estatística do resumo ("Jogos", "Sequência atual"). */
function stat(page: Page, name: string) {
  return page.locator(".stats-grid > div").filter({ hasText: name }).locator("dd");
}

test("pela nav, no celular: o Mais abre o Histórico, com o foco no título e a aba marcada (P265)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, TODAY, "#inicio");
  const more = page.getByRole("navigation").getByRole("button", { name: "Mais" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await (await navLink(page, "Histórico")).click();
  await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveAttribute("aria-current", "true");
  // O Esc fecha o menu aberto e devolve o foco ao Mais.
  await more.click();
  await expect(page.locator("#nav-more-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nav-more-menu")).toBeHidden();
  await expect(more).toBeFocused();
  // O toque fora também fecha: na dica, que não recebe o foco (só o pointerdown fecha).
  await more.click();
  await page.getByRole("main").locator("header .hint").click();
  await expect(page.locator("#nav-more-menu")).toBeHidden();
});

test("pela Início: o link na linha do tema leva ao Histórico (P264)", async ({ page }) => {
  await open(page, TODAY, "#inicio");
  await page.getByRole("main").getByRole("link", { name: "Histórico" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeFocused();
  await expect(page.locator(".calendar-days > li")).toHaveCount(14);
});

test("jogar o Normal de 21/10 depois: o resumo sem estatísticas, o compartilhar marcado e o dia com ◐ (P263)", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, TODAY, "#historico");
  await page
    .getByRole("link", { name: "Quarta-feira, 21 de outubro: Hits, nenhum diário jogado" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeFocused();
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Normal/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 14");
  await giveUpNormal(page);

  await expect(page.getByText("Jogado depois: não conta nas estatísticas.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estatísticas" })).toHaveCount(0);
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toMatch(
    /^AteMusic · Normal nº 14 \(jogado depois\)\n0\/30\n/,
  );
  // O registro gravado leva a marca (P267).
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    SAVE_KEY,
  );
  expect(saved.schemaVersion).toBe(9);
  expect(saved.history["2026-10-21|album"].late).toBe(true);

  await page.getByRole("link", { name: "Voltar ao dia" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: /^Normal/ })).toContainText(
    "jogado depois",
  );
  await page.getByRole("link", { name: "Voltar ao Histórico" }).click();
  await expect(
    page.getByRole("link", { name: "Quarta-feira, 21 de outubro: Hits, 1 de 2 diários jogados" }),
  ).toBeVisible();

  // O diário de hoje, depois: a estatística não conta o de ontem (nem na sequência).
  await hitsTab(page).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Normal/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 15");
  await giveUpNormal(page);
  await expect(stat(page, "Jogos")).toHaveText("1");
  await expect(stat(page, "Sequência atual")).toHaveText("1 dia");
  await expect(page.getByRole("timer")).toBeVisible();
});

test("recarregar no meio de um diário passado retoma o jogo (P269)", async ({ page }) => {
  await open(page, TODAY, "#normal/2026-10-21");
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await expect(page.getByText("Rodada 2 de 3")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 14");
  await expect(page.getByText("Rodada 2 de 3")).toBeVisible();
  const kept = await page.evaluate(
    (key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").inProgress ?? {}),
    SAVE_KEY,
  );
  expect(kept).toEqual(["2026-10-21|album"]);
});

test("o andamento de fora da janela sai na abertura, e o de dentro fica (P269)", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const progress = { events: [{ type: "SKIP" }] };
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 7,
        history: {},
        inProgress: { "2026-10-08|song": progress, "2026-10-07|song": progress },
      }),
    );
  }, SAVE_KEY);
  await open(page, TODAY, "#inicio");
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeVisible();
  const kept = await page.evaluate(
    (key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").inProgress ?? {}),
    SAVE_KEY,
  );
  expect(kept).toEqual(["2026-10-08|song"]);
  // O save era v7 (P267): a limpeza da abertura o gravou já migrado para a atual (P289, P308).
  const migrated = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    SAVE_KEY,
  );
  expect(migrated).toMatchObject({
    schemaVersion: 9,
    seenMedals: [],
    shelf: [],
    practiceRight: 0,
  });
  expect(migrated.artists).toEqual({});
});

test("a data fora dos 14 dias cai no calendário, e a de uma aba sem data, na Início", async ({
  page,
}) => {
  await open(page, TODAY, "#normal/2026-09-01");
  await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeFocused();
  await page.evaluate(() => {
    window.location.hash = "#treino/2026-10-21";
  });
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeVisible();
});

test("o dia passado sem diário: o aviso com o foco e a volta ao dia (P261)", async ({ page }) => {
  // Em 09/10, o Histórico vai até 25/09, mas a agenda das fixtures começa em 08/10.
  await open(page, "2026-10-09T12:00:00-03:00", "#normal/2026-10-01");
  await expect(page.getByText("Não há diário nesse dia.")).toBeFocused();
  await expect(page.getByRole("link", { name: "Voltar ao dia" })).toHaveAttribute(
    "href",
    "#historico/2026-10-01",
  );
});

test("trocar de dia pelo Voltar do navegador leva o foco ao título do dia novo", async ({
  page,
}) => {
  await open(page, TODAY, "#historico/2026-10-21");
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeFocused();
  await page.evaluate(() => {
    window.location.hash = "#historico/2026-10-20";
  });
  await expect(page.getByRole("heading", { level: 1, name: "Terça-feira, 20/10" })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeFocused();
});

test("toque duplo num dia do calendário: abre o dia, e o 2º clique não abre um diário (regra 23)", async ({
  page,
}) => {
  await open(page, TODAY, "#historico");
  await page
    .getByRole("link", { name: "Quarta-feira, 21 de outubro: Hits, nenhum diário jogado" })
    .dblclick();
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeVisible();
  await expect(page).toHaveURL(/#historico\/2026-10-21$/);
});

// --- o Anime no Histórico (o PR 3) ----------------------------------------------------------

/** Termina o diário do Anime aberto sem acertar: o "Desistir" nas 3 rodadas. */
async function giveUpAnime(page: Page): Promise<void> {
  for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Desistir", exact: true }).click();
    await page.getByRole("button", { name: next }).click();
  }
}

test("jogar o Anime de 21/10 depois: o cartão do dia, os modos com a data, o resumo e a marca do Anime (P261, P277)", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, TODAY, "#historico/2026-10-21");
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeFocused();
  const main = page.getByRole("main");
  const card = main.getByRole("link", { name: /^Anime/ });
  await expect(card).toContainText("6 diários novos");
  await card.click();

  // A escolha do modo do dia passado: a data no lugar da dica, e o Histórico marcado na nav.
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  await expect(main.getByText("Quarta-feira, 21/10")).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Histórico" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(animeTab(page)).not.toHaveAttribute("aria-current", /.*/);
  await main.getByRole("link", { name: /^Acertar a música/ }).click();
  await expect(page).toHaveURL(/#anime-musica\/2026-10-21$/);
  await main.getByRole("link", { name: /^Fácil/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Música · Fácil · nº 14");
  await giveUpAnime(page);

  await expect(page.getByText("Jogado depois: não conta nas estatísticas.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estatísticas" })).toHaveCount(0);
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toMatch(
    /^AteMusic Anime · Música · Fácil nº 14 \(jogado depois\)\n0\/30\n/,
  );
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    SAVE_KEY,
  );
  expect(saved.history["2026-10-21|anime-musica-facil"].late).toBe(true);

  // De volta ao dia e ao calendário: o cartão conta o terminado, e o dia ganha o ✓ do Anime.
  await page.getByRole("link", { name: "Voltar ao dia" }).click();
  await expect(main.getByRole("link", { name: /^Anime/ })).toContainText("1 de 6 terminados");
  await page.getByRole("link", { name: "Voltar ao Histórico" }).click();
  const cell = page.getByRole("link", {
    name: "Quarta-feira, 21 de outubro: Hits, nenhum diário jogado; Anime, ao menos 1 diário jogado",
  });
  await expect(cell.locator(".mark-slot").nth(1).locator(".mark-all")).toHaveText("✓");
  // O Anime de hoje continua por jogar: a aba Anime sem o ✓, e o jogado depois não conta.
  await expect(animeTab(page)).toHaveAccessibleName("Anime");
});

test("quem abre o Histórico baixa só a agenda do Anime; o catálogo, só com uma tela do Anime (P270)", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/anime/")) asked.push(new URL(request.url()).pathname);
  });
  await open(page, TODAY, "#historico");
  await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeFocused();
  await page.getByRole("link", { name: /^Quarta-feira, 21 de outubro/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeFocused();
  expect(asked).toEqual(["/fixtures/anime/schedule.json"]);
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Anime/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  // A agenda já veio: só o catálogo desce.
  expect(asked).toEqual(["/fixtures/anime/schedule.json", "/fixtures/anime/catalog.json"]);
});

test("o dia passado sem o Anime: o cartão apagado, a marca vazia e o diário que volta ao dia", async ({
  page,
}) => {
  // A agenda do Anime sem 21/10 (o resto igual).
  await page.route("**/fixtures/anime/schedule.json", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { days: Record<string, unknown> };
    delete body.days["2026-10-21"];
    await route.fulfill({ response, json: body });
  });
  await open(page, TODAY, "#historico");
  await expect(
    page.getByRole("link", {
      name: "Quarta-feira, 21 de outubro: Hits, nenhum diário jogado; sem diário do Anime",
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "#historico/2026-10-21";
  });
  await expect(page.getByRole("heading", { level: 1, name: "Quarta-feira, 21/10" })).toBeFocused();
  await expect(page.locator(".home-card.off")).toContainText("Sem diário do Anime");
  await page.evaluate(() => {
    window.location.hash = "#anime-musica-facil/2026-10-21";
  });
  await expect(page.getByText("Não há diário do Anime nesse dia.")).toBeFocused();
  await expect(page.getByRole("link", { name: "Voltar ao dia" })).toHaveAttribute(
    "href",
    "#historico/2026-10-21",
  );
});

test("a agenda do Anime que falhou: o Histórico só com os Hits", async ({
  page,
  consoleErrors,
}) => {
  await page.route("**/fixtures/anime/schedule.json", (route) => route.abort());
  await open(page, TODAY, "#historico");
  await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Quarta-feira, 21 de outubro: Hits, nenhum diário jogado" }),
  ).toBeVisible();
  await expect(page.locator(".calendar-legends")).toHaveCount(0);
  // O pedido derrubado de propósito aparece no console como um erro de rede: só essa ocorrência
  // sai da conta, como no teste da carga do Anime que falha.
  const network = consoleErrors.findIndex((message) =>
    /Failed to load resource|net::ERR_FAILED/.test(message),
  );
  if (network >= 0) consoleErrors.splice(network, 1);
});
