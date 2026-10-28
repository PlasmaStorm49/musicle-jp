import { animeTab, expect, hitsTab, navLink, open, seedHistory, test } from "./helpers.ts";

test("em 320 px, a Início, os Hits, o Anime e o Mais cabem numa linha, com o ✓ dos Hits e o do Anime (P225, P227, P247, P265)", async ({
  page,
}) => {
  // A fonte muda com o sistema (a CI é Linux): o teste mede, e o CSS tem folga para isso.
  await page.setViewportSize({ width: 320, height: 640 });
  // Os dois diários dos Hits e um de cada modo do Anime de 08/10 já terminados: as abas Hits e
  // Anime ganham o ✓, o caso mais largo.
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  const day = { number: 1, rounds: [lost, lost, lost] };
  await seedHistory(page, {
    "2026-10-08|album": day,
    "2026-10-08|song": day,
    "2026-10-08|anime-musica-medio": day,
    "2026-10-08|anime-titulo-dificil": day,
  });
  await open(page, "2026-10-08T12:00:00-03:00", "");
  const nav = page.getByRole("navigation");
  const tabs = nav.getByRole("link");
  // Os Artistas, o Histórico e as Medalhas ficam no Mais (P265, P287).
  await expect(tabs).toHaveCount(3);
  await expect(tabs.filter({ hasText: "✓" })).toHaveCount(2);
  const more = nav.getByRole("button", { name: "Mais" });
  await expect(more).toBeVisible();
  await expect(hitsTab(page)).toHaveAccessibleName("Hits (diários terminados)");
  await expect(animeTab(page)).toHaveAccessibleName("Anime (já jogou hoje)");
  // A Noto Sans JP (P175) chega depois da página: mede com ela, e não com a fonte de reserva. O
  // load pede os dois pesos das abas (o ready sozinho termina na hora se nada estiver pendente).
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 0.9rem "Noto Sans JP"', "Hits Anime Artistas ✓"),
      document.fonts.load('700 0.9rem "Noto Sans JP"', "Início Anime Artistas"),
    ]);
    await document.fonts.ready;
  });
  const rows = () =>
    nav
      .locator(":is(a, button):visible")
      .evaluateAll(
        (items) => new Set(items.map((a) => Math.round(a.getBoundingClientRect().top))).size,
      );
  expect(await rows()).toBe(1);
  // O caso mais largo: o Mais marcado (em negrito), com os dois ✓.
  await page.evaluate(() => {
    window.location.hash = "#historico";
  });
  await expect(more).toHaveAttribute("aria-current", "true");
  await page.evaluate(async () => {
    await document.fonts.load('700 0.9rem "Noto Sans JP"', "Mais");
    await document.fonts.ready;
  });
  expect(await rows()).toBe(1);
});

test("sem fragmento, o site abre na home, e cada cartão leva ao seu modo", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "");
  const title = page.getByRole("heading", { level: 1, name: "AteMusic" });
  await expect(title).toBeFocused();
  await expect(page).toHaveTitle("AteMusic");
  await expect(page.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");
  // O selo do logo (P193) carregou de verdade, e os dois ícones do index.html respondem (o
  // Chromium sem tela nem sempre pede o favicon sozinho, então o teste pede).
  await expect
    .poll(() => page.locator("img.logo").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  for (const icon of ["/favicon.svg", "/apple-touch-icon.png"]) {
    expect((await page.request.get(icon)).status(), icon).toBe(200);
  }

  // Os cartões ficam no main; a nav tem um link com o mesmo nome (Hits).
  const cards = page.getByRole("main");
  const hitsCard = cards.getByRole("link", { name: /^Hits/ });
  await expect(hitsCard).toContainText("Normal: novo");
  await hitsCard.click();
  const hits = page.getByRole("heading", { level: 1, name: "Hits" });
  await expect(hits).toBeFocused();
  await expect(hitsTab(page)).toHaveAttribute("aria-current", "page");
  const normal = cards.getByRole("link", { name: /^Normal/ });
  await expect(normal).toContainText("Novo · Jogar");
  await normal.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal");
  // O cartão some com a tela, e o foco vai para a de destino, não para o body (regra 16).
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();
  // Dentro de um jogo dos Hits, a aba fica marcada, mas não é a página atual.
  await expect(hitsTab(page)).toHaveAttribute("aria-current", "true");

  // O Voltar do navegador volta aos Hits (é só o fragmento que muda).
  await page.goBack();
  await expect(hits).toBeFocused();
  await cards.getByRole("link", { name: /^Desafio/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Desafio");
  await page.getByRole("link", { name: "Início" }).click();
  await expect(title).toBeFocused();
  await hitsCard.click();
  await cards.getByRole("link", { name: /^Treino/ }).click();
  await expect(hitsTab(page)).toHaveAttribute("aria-current", "true");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
  // O Treino abre na escolha do modo (P105), com o foco no título.
  const practice = page.getByRole("heading", { level: 1, name: "Treino", exact: true });
  await expect(practice).toBeFocused();
  // Os Artistas: a tela da categoria, e os Hits sem marca. Eles ficam no Mais (M17), que leva a
  // marca por eles.
  const more = nav.getByRole("button", { name: "Mais" });
  await (await navLink(page, "Artistas")).click();
  await expect(page.getByRole("heading", { level: 1, name: "Artistas" })).toBeVisible();
  await expect(more).toHaveAttribute("aria-current", "true");
  await expect(hitsTab(page)).not.toHaveAttribute("aria-current");
  // O Anime (M14): o cartão da Início abre a tela dele, com a aba marcada.
  await page.getByRole("link", { name: "Início" }).click();
  await expect(title).toBeFocused();
  await cards.getByRole("link", { name: /^Anime/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  await expect(animeTab(page)).toHaveAttribute("aria-current", "page");
  await expect(more).not.toHaveAttribute("aria-current");
});

test("toque duplo no cartão dos Hits da Início: abre os Hits, e o 2º clique não abre um diário (regra 23)", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "");
  await page.getByRole("main").getByRole("link", { name: /^Hits/ }).dblclick();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hits");
});

test("toque duplo no cartão do Anime da Início: abre o Anime, e o 2º clique não abre a dificuldade (regra 23)", async ({
  page,
}) => {
  // O Anime já carregado: sem a carga no meio, o 2º clique cai mesmo na tela dos modos, onde está
  // o cartão do "Acertar a música".
  await open(page, "2026-10-08T12:00:00-03:00", "#anime");
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Anime/ })
    .dblclick();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime");
  await expect(
    page.getByRole("main").getByRole("link", { name: /^Acertar a música/ }),
  ).toBeVisible();
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
  // Na Início, o cartão dos Hits avisa numa linha e continua link: o Treino está lá dentro.
  const cards = page.getByRole("main");
  await expect(cards.getByRole("link", { name: /^Hits/ })).toContainText("Não há diário hoje");
  await cards.getByRole("link", { name: /^Hits/ }).click();
  await expect(page.getByText("Não há diário hoje")).toHaveCount(2);
  await expect(cards.getByRole("link", { name: /^(Normal|Desafio)/ })).toHaveCount(0);
  await cards.getByRole("link", { name: /^Treino/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Treino");
  await page.getByRole("button", { name: "Normal" }).click();
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeVisible();
});
