import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import { expect, hitsTab, open, test } from "./helpers.ts";

test("as três abas (a Início, os Hits e os Artistas) cabem numa linha também em 320 px, com o ✓ dos Hits (P225, P227)", async ({
  page,
}) => {
  // A fonte muda com o sistema (a CI é Linux): o teste mede, e o CSS tem folga para isso.
  await page.setViewportSize({ width: 320, height: 640 });
  // Os dois diários de 08/10 já terminados: a aba Hits ganha o ✓, o caso mais largo.
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  const day = { number: 1, rounds: [lost, lost, lost] };
  const save = {
    schemaVersion: 6,
    history: { "2026-10-08|album": day, "2026-10-08|song": day },
    inProgress: {},
  } satisfies Save;
  await page.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [
    SAVE_KEY,
    JSON.stringify(save),
  ] as const);
  await open(page, "2026-10-08T12:00:00-03:00", "");
  const tabs = page.getByRole("navigation").getByRole("link");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.filter({ hasText: "✓" })).toHaveCount(1);
  await expect(hitsTab(page)).toHaveAccessibleName("Hits (diários terminados)");
  // A Noto Sans JP (P175) chega depois da página: mede com ela, e não com a fonte de reserva. O
  // load pede os dois pesos das abas (o ready sozinho termina na hora se nada estiver pendente).
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 0.9rem "Noto Sans JP"', "Hits Artistas ✓"),
      document.fonts.load('700 0.9rem "Noto Sans JP"', "Início"),
    ]);
    await document.fonts.ready;
  });
  const rows = await tabs.evaluateAll(
    (links) => new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size,
  );
  expect(rows).toBe(1);
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
  await expect(normal).toContainText("nº 1 · novo");
  await normal.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 1");
  // O cartão some com a tela, e o foco vai para a de destino, não para o body (regra 16).
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();
  // Dentro de um jogo dos Hits, a aba fica marcada, mas não é a página atual.
  await expect(hitsTab(page)).toHaveAttribute("aria-current", "true");

  // O Voltar do navegador volta aos Hits (é só o fragmento que muda).
  await page.goBack();
  await expect(hits).toBeFocused();
  await cards.getByRole("link", { name: /^Desafio/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Desafio · nº 1");
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
  // Os Artistas: a tela da categoria, e os Hits sem marca.
  await nav.getByRole("link", { name: "Artistas" }).click();
  await expect(nav.getByRole("link", { name: "Artistas" })).toHaveAttribute("aria-current", "page");
  await expect(hitsTab(page)).not.toHaveAttribute("aria-current");
});

test("toque duplo no cartão dos Hits da Início: abre os Hits, e o 2º clique não abre um diário (regra 23)", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "");
  await page.getByRole("main").getByRole("link", { name: /^Hits/ }).dblclick();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hits");
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
