// O Anime (M14, PRs D2 e D3): a categoria na nav, a escolha do modo e da dificuldade, os diários
// do "acertar a música" e do "acertar o anime", a ajuda com 4 animes e o "Sobre e privacidade",
// nas fixtures (a agenda fictícia do Anime vai de 08/10 a 09/11/2026).
import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  animeAnswer,
  animeTab,
  captureClipboard,
  expect,
  franchiseName,
  hitsTab,
  lastPlayedAnime,
  open,
  seedHistory,
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

  // A aba Anime abre a escolha do modo, com o foco no título: os dois modos, e os créditos.
  await animeTab(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  await expect(animeTab(page)).toHaveAttribute("aria-current", "page");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^Acertar o anime/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /^Dados: AnimeThemes/ })).toHaveAttribute(
    "href",
    "#sobre",
  );
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

  // Rodada 1: acerta de primeira (10 pontos).
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await answerWithPlayed(page);
  await expect(page.getByRole("heading", { name: "Acertou! 10 de 10 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: desiste.
  await page.getByRole("button", { name: "Desistir", exact: true }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 3: pula uma vez e acerta (8 pontos).
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  await page.getByRole("button", { name: "Tocar 2 s" }).click();
  await answerWithPlayed(page);
  await expect(page.getByRole("heading", { name: "Acertou! 8 de 10 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByText("18 de 30 pontos")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toBe(
    "AteMusic Anime · Música · Fácil nº 1\n18/30\n✅\n❌\n⬛✅\nhttp://localhost:5173/",
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
    "nº 1 · terminado, 18 de 30 pontos",
  );
  await page.getByRole("link", { name: "Início" }).click();
  await expect(main.getByRole("link", { name: /^Anime/ })).toContainText("Hoje: 1 de 6 terminados");
});

/** Digita um nome do anime e escolhe a sugestão com o nome dele (o "acertar o anime"). */
async function answerAnime(
  page: Parameters<typeof lastPlayedAnime>[0],
  typed: string,
  shown: string,
): Promise<void> {
  await page.getByRole("combobox", { name: "Qual é o anime?" }).fill(typed);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(shown, { exact: true }) })
    .click();
}

test("Anime: acertar o anime no Fácil, pelo nome e por um sinônimo, do Tocar ao compartilhar (P234)", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, DAY, "#anime");
  await viaAnime(page, /^Acertar o anime/, /^Fácil/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime · Fácil · nº 1");
  await expect(page.getByRole("combobox", { name: "Qual é o anime?" })).toHaveAttribute(
    "placeholder",
    "Nome do anime",
  );

  // Rodada 1: o nome do anime da faixa que tocou, de primeira (10 pontos).
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  const first = franchiseName(await lastPlayedAnime(page));
  await answerAnime(page, first, first);
  await expect(page.getByRole("heading", { name: "Acertou! 10 de 10 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: desiste.
  await page.getByRole("button", { name: "Desistir", exact: true }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 3: a 2ª temporada da Hoshizora Kaizoku; "Starry Pirates" (o nome em inglês) acha o
  // anime, e vale qualquer temporada (8 pontos, com um pulo).
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  await page.getByRole("button", { name: "Tocar 2 s" }).click();
  const third = await lastPlayedAnime(page);
  // A faixa que tocou é a da agenda do Anime (a 3ª rodada do Fácil de 08/10).
  expect(third.id).toBe(animeAnswer("2026-10-08", "titulo", "facil", 2));
  expect(franchiseName(third)).toBe("Hoshizora Kaizoku");
  await answerAnime(page, "Starry Pirates", "Hoshizora Kaizoku");
  await expect(page.getByRole("heading", { name: "Acertou! 8 de 10 pontos." })).toBeVisible();
  // A revelação: a tentativa com o nome do anime, e o cartão com a música e o tema.
  await expect(page.locator(".reveal .attempt.right")).toContainText("Hoshizora Kaizoku");
  await expect(page.locator(".reveal .card .item-title")).toHaveText(third.title);
  await expect(page.locator(".reveal .card .album")).toHaveText(
    "Anime: Hoshizora Kaizoku 2nd Season · OP1",
  );
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByText("18 de 30 pontos")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toBe(
    "AteMusic Anime · Anime · Fácil nº 1\n18/30\n✅\n❌\n⬛✅\nhttp://localhost:5173/",
  );
  const saved = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(Object.keys((JSON.parse(saved ?? "{}") as Save).history)).toEqual([
    "2026-10-08|anime-titulo-facil",
  ]);
  await expect(animeTab(page)).toHaveAccessibleName("Anime (já jogou hoje)");
});

test("Anime: a ajuda do acertar o anime mostra 4 animes, nenhum de uma resposta do dia, e vale a metade do trecho", async ({
  page,
}) => {
  await open(page, DAY, "#anime-titulo-facil");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anime · Fácil · nº 1");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Pular/ }).click();
  await page.getByRole("button", { name: "Pedir ajuda", exact: true }).click();
  const options = page.getByRole("list", { name: "Opções da ajuda" }).getByRole("button");
  await expect(options).toHaveCount(4);
  await expect(options.first()).toBeFocused();
  // Em 08/10, as 18 respostas do Anime são de 10 das 13 franquias fictícias: sobram as outras 3,
  // e a certa (a da 1ª rodada, a Tsukimi Gakuen).
  const shown = (await page.locator(".help-options .item-title").allTextContents()).sort();
  expect(shown).toEqual([
    "Kumo no Ue no Shiro",
    "Majo to Kissaten",
    "Tokyo Noise",
    "Tsukimi Gakuen",
  ]);
  await page.getByRole("button", { name: /^Tocar/ }).click();
  const right = franchiseName(await lastPlayedAnime(page));
  await options.filter({ hasText: right }).click();
  // Depois de 3 pulos, no trecho de 7 s: o acerto vale 5, e com a ajuda, 3.
  await expect(page.getByRole("heading", { name: "Acertou com ajuda: 3 pontos." })).toBeVisible();
});

test("o Sobre e privacidade: pelo fim da Início e pelos créditos do Anime (P243, P258)", async ({
  page,
}) => {
  await open(page, DAY, "#inicio");
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();
  await page.getByRole("link", { name: "Sobre e privacidade" }).click();
  const title = page.getByRole("heading", { level: 1, name: "Sobre e privacidade" });
  await expect(title).toBeFocused();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^MyAnimeList/ })).toHaveAttribute(
    "href",
    "https://myanimelist.net",
  );
  await expect(main.getByRole("link", { name: /^as Issues do GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/PlasmaStorm49/musicle-jp/issues",
  );
  await expect(main).toContainText("O jogo não coleta dados pessoais e não tem servidor próprio");
  // Pelos créditos do Anime, o mesmo endereço.
  await animeTab(page).click();
  await page.getByRole("link", { name: /^Dados: AnimeThemes/ }).click();
  await expect(title).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#sobre");
});

test("o Sobre e privacidade abre mesmo com a carga dos Hits falhando (ele não usa dado nenhum)", async ({
  page,
  consoleErrors,
}) => {
  await page.route("**/fixtures/catalog.json", (route) => route.abort());
  await open(page, DAY, "#sobre");
  await expect(page.getByRole("heading", { level: 1, name: "Sobre e privacidade" })).toBeFocused();
  await expect(page.getByRole("main")).toContainText("O jogo não coleta dados pessoais");
  // Fora do Sobre, a falha aparece, como sempre.
  await page.getByRole("link", { name: "Início" }).click();
  await expect(
    page.getByText("Não foi possível carregar o jogo. Confira a conexão."),
  ).toBeVisible();
  // O pedido derrubado de propósito pode aparecer no console como um erro de rede: só essa uma
  // ocorrência sai da conta.
  const network = consoleErrors.findIndex((message) =>
    /Failed to load resource|net::ERR_FAILED/.test(message),
  );
  if (network >= 0) consoleErrors.splice(network, 1);
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

test("dia fora da agenda do Anime: os modos avisam sem link, e o diário volta ao Anime", async ({
  page,
}) => {
  // 07/10 é antes do 1º dia da agenda fictícia do Anime (08/10), que só cresce (P44).
  await open(page, "2026-10-07T12:00:00-03:00", "#anime");
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  // Só o link dos créditos: os dois modos avisam.
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(1);
  await expect(page.getByText("Não há diário hoje")).toHaveCount(2);
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
  // O pedido derrubado de propósito pode aparecer no console como um erro de rede: só essa uma
  // ocorrência sai da conta (outro erro de rede, ou qualquer outro erro, continua reprovando).
  const network = consoleErrors.findIndex((message) =>
    /Failed to load resource|net::ERR_FAILED/.test(message),
  );
  if (network >= 0) consoleErrors.splice(network, 1);
});

test("as voltas sem a nav (ME120): da dificuldade à tela do Anime, e do resumo à dificuldade do modo (P321, P322)", async ({
  page,
}) => {
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  await seedHistory(page, {
    "2026-10-08|anime-musica-facil": { number: 1, rounds: [lost, lost, lost] },
  });
  await open(page, DAY, "#anime-musica-facil");
  await expect(page.getByRole("heading", { name: "Resultado do dia" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar à escolha da dificuldade" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Acertar a música" })).toBeFocused();
  await page.getByRole("link", { name: "Voltar ao Anime" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeFocused();
  expect(page.url()).toMatch(/#anime$/);
});
