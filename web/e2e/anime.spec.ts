// O Anime (M14, PR D2): a categoria na nav, a escolha do modo e da dificuldade, e o diário do
// "acertar a música", nas fixtures (a agenda fictícia do Anime vai de 08/10 a 09/11/2026).
import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  animeTab,
  captureClipboard,
  expect,
  hitsTab,
  lastPlayedAnime,
  open,
  test,
  viaAnime,
} from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";

/** Digita o nome da faixa que tocou e escolhe a sugestão dela (o título e o artista). */
async function answerWithPlayed(page: Parameters<typeof lastPlayedAnime>[0]): Promise<void> {
  const track = await lastPlayedAnime(page);
  await page.getByRole("combobox", { name: "Qual é a música?" }).fill(track.title);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(track.title, { exact: true }) })
    .filter({ hasText: track.artistDisplay })
    .first()
    .click();
}

test("Anime: acertar a música no Fácil, do Tocar ao compartilhar, com o ✓ da aba Anime (P247)", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, DAY, "#inicio");
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();

  // A aba Anime abre a escolha do modo, com o foco no título; o acertar o anime fica em breve.
  await animeTab(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  await expect(animeTab(page)).toHaveAttribute("aria-current", "page");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^Acertar o anime/ })).toHaveCount(0);
  await expect(main.getByText("Em breve")).toBeVisible();
  await main.getByRole("link", { name: /^Acertar a música/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Acertar a música" })).toBeFocused();
  const facil = main.getByRole("link", { name: /^Fácil/ });
  await expect(facil).toContainText("nº 1 · novo");
  await facil.click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Música · Fácil · nº 1");
  // Dentro de um diário do Anime, a aba fica marcada, mas não é a página atual.
  await expect(animeTab(page)).toHaveAttribute("aria-current", "true");
  // O cartão some com a tela, e o foco vai ao Tocar (regra 16).
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();

  // Rodada 1: acerta de primeira (6 pontos).
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await answerWithPlayed(page);
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: desiste.
  await page.getByRole("button", { name: "Desistir", exact: true }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 3: pula uma vez e acerta (5 pontos).
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  await page.getByRole("button", { name: "Tocar 2 s" }).click();
  await answerWithPlayed(page);
  await expect(page.getByRole("heading", { name: "Acertou! 5 de 6 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByText("11 de 18 pontos")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toBe(
    "AteMusic Anime · Música · Fácil nº 1\n11/18\n✅\n❌\n⬛✅\nhttp://localhost:5173/",
  );
  // O save leva o id do diário do Anime (P250).
  const saved = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(Object.keys((JSON.parse(saved ?? "{}") as Save).history)).toEqual([
    "2026-10-08|anime-musica-facil",
  ]);
  // Um diário do Anime terminado já põe o ✓ na aba Anime (P247), e não na dos Hits.
  await expect(animeTab(page)).toHaveAccessibleName("Anime (já jogou hoje)");
  await expect(hitsTab(page)).toHaveAccessibleName("Hits");

  // A escolha do modo e a da dificuldade mostram o resultado; a Início, a linha do Anime.
  await animeTab(page).click();
  await expect(main.getByRole("link", { name: /^Acertar a música/ })).toContainText(
    "1 de 3 terminados",
  );
  await main.getByRole("link", { name: /^Acertar a música/ }).click();
  await expect(main.getByRole("link", { name: /^Fácil/ })).toContainText(
    "nº 1 · terminado, 11 de 18 pontos",
  );
  await page.getByRole("link", { name: "Início" }).click();
  await expect(main.getByRole("link", { name: /^Anime/ })).toContainText("Hoje: 1 de 3 terminados");
});

test("o Anime só é baixado quando a pessoa abre a categoria (quem joga só os Hits não baixa nada)", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/anime/")) asked.push(request.url());
  });
  await open(page, DAY, "#normal");
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeVisible();
  await page.getByRole("link", { name: "Início" }).click();
  await hitsTab(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hits" })).toBeVisible();
  expect(asked).toEqual([]);
  await animeTab(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeVisible();
  expect(asked.map((url) => new URL(url).pathname).sort()).toEqual([
    "/fixtures/anime/catalog.json",
    "/fixtures/anime/schedule.json",
  ]);
  // Trocar de aba e voltar não baixa de novo.
  await page.getByRole("link", { name: "Início" }).click();
  await viaAnime(page, /^Acertar a música/, /^Médio/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Música · Médio · nº 1");
  expect(asked).toHaveLength(2);
});

test("Anime: recarregar no meio do diário retoma as tentativas", async ({ page }) => {
  await open(page, "2026-10-09T10:00:00-03:00", "#anime-musica-dificil");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Música · Difícil · nº 2");
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
      const save = raw ? (JSON.parse(raw) as Save) : null;
      return save?.inProgress["2026-10-09|anime-musica-dificil"]?.events.length ?? 0;
    })
    .toBe(1);
  await page.reload();
  await expect(page.getByText("Tentativa 2 de 6")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tocar 2 s" })).toBeVisible();
});

test("Anime: entrar no diário com o teclado leva o foco ao Tocar (regra 16)", async ({ page }) => {
  await open(page, DAY, "#anime-musica");
  await expect(page.getByRole("heading", { level: 1, name: "Acertar a música" })).toBeFocused();
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Difícil/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Música · Difícil · nº 1");
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();
});

test("Anime: o acertar o anime ainda não abre (PR D3): a escolha da dificuldade e o diário avisam", async ({
  page,
}) => {
  await open(page, DAY, "#anime-titulo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acertar o anime");
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  await expect(page.getByText("Em breve")).toHaveCount(3);
  await page.evaluate(() => {
    window.location.hash = "#anime-titulo-facil";
  });
  await expect(page.getByText("Acertar o anime: em breve.")).toBeFocused();
  await page.getByRole("link", { name: "Voltar ao Anime" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
});

test("dia fora da agenda do Anime: os modos avisam sem link, e o diário volta ao Anime", async ({
  page,
}) => {
  // 07/10 é antes do 1º dia da agenda fictícia do Anime (08/10), que só cresce (P44).
  await open(page, "2026-10-07T12:00:00-03:00", "#anime");
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  await expect(page.getByText("Não há diário hoje")).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "#anime-musica-facil";
  });
  await expect(page.getByText("Não há diário do Anime hoje.")).toBeFocused();
  await page.getByRole("link", { name: "Voltar ao Anime" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
});

test("a carga do Anime falhou: o aviso e o Tentar de novo, que carrega", async ({
  page,
  consoleErrors,
}) => {
  let fail = true;
  await page.route("**/fixtures/anime/schedule.json", (route) =>
    fail ? route.abort() : route.continue(),
  );
  await open(page, DAY, "#anime");
  const notice = page.getByText("Não foi possível carregar o Anime. Confira a conexão.");
  await expect(notice).toBeFocused();
  fail = false;
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  // O pedido derrubado de propósito pode aparecer no console como erro de rede: só ele sai da
  // conta (qualquer outro erro continua reprovando o teste).
  const network = /Failed to load resource|net::ERR_FAILED/;
  const others = consoleErrors.filter((message) => !network.test(message));
  consoleErrors.splice(0, consoleErrors.length, ...others);
});
