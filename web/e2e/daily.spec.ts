import type { Save } from "../src/core/records.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  albumOf,
  captureClipboard,
  dailyAnswer,
  expect,
  hitsTab,
  lastPlayed,
  open,
  option,
  seedHistory,
  test,
} from "./helpers.ts";

test("Normal: do Tocar ao compartilhar", async ({ page }) => {
  await captureClipboard(page);
  await open(page, "2026-10-08T12:00:00-03:00");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 1");
  // Sem escolha de modo: a rodada 1 já começa, com o foco no Tocar.
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();

  // Rodada 1: acerta de primeira (6 pontos).
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  await option(page, albumOf(await lastPlayed(page)).title).click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: não sabe.
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 3: ouve mais (toca o trecho de 2 s) e acerta (5 pontos).
  await page.getByRole("button", { name: /Ouvir mais/ }).click();
  // A parte liberada (e o tocado, da mesma largura) termina onde termina o último pedaço
  // liberado: com o divisor em borda, que ocupava espaço no flex, sobrava uma fresta do trilho.
  // Medida até assentar: a parte liberada cresce com uma transição curta (PR D1).
  await expect(page.locator(".bar-segments .seg.on")).toHaveCount(2);
  await expect
    .poll(() =>
      page.locator(".bar").evaluate((bar) => {
        const right = (el: Element | null | undefined) =>
          el?.getBoundingClientRect().right ?? Number.NaN;
        const lastOn = [...bar.querySelectorAll(".seg.on")].at(-1);
        return Math.abs(right(bar.querySelector(".bar-unlocked")) - right(lastOn));
      }),
    )
    .toBeLessThanOrEqual(0.5);
  await option(page, albumOf(await lastPlayed(page)).title).click();
  await expect(page.getByRole("heading", { name: "Acertou! 5 de 6 pontos." })).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByText("11 de 18 pontos")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  expect(await page.evaluate(() => window.__copied)).toBe(
    "AteMusic · Normal nº 1\n11/18\n✅\n❌\n⬛✅\nhttp://localhost:5173/",
  );
  // Só um diário terminado: o ✓ da aba Hits espera os dois (P227).
  await expect(hitsTab(page)).toHaveAccessibleName("Hits");

  // A home mostra o dia terminado, com os pontos, no cartão dos Hits.
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: /^Hits/ })).toContainText(
    "Normal: terminado, 11 de 18 pontos",
  );
});

test("Desafio: digita o nome da música e acerta", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#desafio");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Desafio · nº 1");
  await page.getByRole("button", { name: "Tocar 1 s" }).click();

  const track = await lastPlayed(page);
  await page.getByRole("combobox", { name: "Qual é a música?" }).fill(track.title);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(track.title, { exact: true }) })
    .filter({ hasText: track.artistDisplay })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Acertou! 6 de 6 pontos." })).toBeVisible();
});

test("Desafio: recarregar no meio retoma as tentativas", async ({ page }) => {
  await open(page, "2026-10-09T10:00:00-03:00", "#desafio");
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  // O save é gravado num efeito depois da pintura: espera ele chegar ao localStorage.
  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
      const save = raw ? (JSON.parse(raw) as Save) : null;
      return save?.inProgress["2026-10-09|song"]?.events.length ?? 0;
    })
    .toBe(1);

  await page.reload();
  await expect(page.getByText("Tentativa 2 de 6")).toBeVisible();
  await expect(page.locator(".attempt")).toContainText(["Pulou"]);
  await expect(page.getByRole("button", { name: "Tocar 2 s" })).toBeVisible();
});

test("trocar de aba limpa o aviso do leitor de tela da aba de antes (ME76)", async ({ page }) => {
  await open(page, "2026-10-09T10:00:00-03:00", "#desafio");
  const live = page.locator(".sr-only[aria-live]");
  await page.getByRole("button", { name: "Pular (+1 s)" }).click();
  await expect(live).toHaveText("Pulou. Tentativa 2 de 6.");
  // Na Início, o texto do pulo não pode continuar lá: o leitor de tela poderia relê-lo.
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();
  await expect(live).toHaveText("");
});

test("Desafio: a ajuda só depois da 3ª tentativa, volta igual ao recarregar e vale 1 ponto (P149)", async ({
  page,
}) => {
  await open(page, "2026-10-09T10:00:00-03:00", "#desafio");
  const help = page.getByRole("button", { name: "Pedir ajuda", exact: true });
  for (let i = 0; i < 3; i++) {
    await expect(help).toHaveCount(0);
    await page.getByRole("button", { name: /^Pular/ }).click();
  }
  // Sem pontos no botão, e o "Desistir" do outro lado, longe dele (ME71): um toque não cai no
  // botão errado.
  const helpBox = await help.boundingBox();
  const giveUpBox = await page.getByRole("button", { name: "Desistir", exact: true }).boundingBox();
  if (!helpBox || !giveUpBox) throw new Error("sem os dois botões");
  expect(giveUpBox.x - (helpBox.x + helpBox.width)).toBeGreaterThan(24);
  await help.click();
  const options = page.getByRole("list", { name: "Opções da ajuda" }).getByRole("button");
  await expect(options).toHaveCount(4);
  await expect(options.first()).toBeFocused();
  const shown = await options.allTextContents();

  // O save leva o evento HELP: recarregar mostra as mesmas opções.
  const lastEvent = async () => {
    const raw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
    const save = raw ? (JSON.parse(raw) as Save) : null;
    return save?.inProgress["2026-10-09|song"]?.events.at(-1)?.type;
  };
  await expect.poll(lastEvent).toBe("HELP");
  await page.reload();
  await expect(options).toHaveText(shown);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  // Voltar à rodada com a ajuda já pedida: o foco vai ao Tocar, como em toda rodada (regra 16).
  await expect(page.getByRole("button", { name: /^Tocar/ })).toBeFocused();

  // Com a ajuda, o Pular continua (P163): o trecho cresce, e as opções ficam as mesmas, também
  // depois de recarregar (o SKIP depois do HELP refaz a rodada igual).
  await page.getByRole("button", { name: "Pular (+4 s)" }).click();
  await expect(page.getByRole("button", { name: "Tocar 11 s" })).toBeVisible();
  await expect.poll(lastEvent).toBe("SKIP");
  await page.reload();
  await expect(options).toHaveText(shown);
  await expect(page.getByRole("button", { name: "Tocar 11 s" })).toBeVisible();

  // A faixa certa sai do que tocou (o motor falso registra), como nos outros testes.
  await page.getByRole("button", { name: /^Tocar/ }).click();
  const track = await lastPlayed(page);
  await options.filter({ hasText: track.title }).first().click();
  await expect(page.getByRole("heading", { name: "Acertou com ajuda: 1 ponto." })).toBeVisible();
});

test("áudio indisponível anula a rodada, que fica fora da conta", async ({ page }) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#normal", dailyAnswer("2026-10-08", "album", 0));
  await page.getByRole("button", { name: "Tocar 1 s" }).click();
  // O aviso aparece na tela e é anunciado ao leitor de tela (região aria-live).
  const voided = "Áudio indisponível: esta rodada foi anulada e não conta.";
  await expect(page.locator("p:not(.sr-only)", { hasText: voided })).toBeVisible();
  await expect(page.locator(".sr-only[aria-live]")).toHaveText(voided);
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // As outras duas rodadas tocam normalmente.
  for (const next of ["Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Não sei" }).click();
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByText("Rodada 1: anulada")).toBeVisible();
  await expect(page.getByText("0 de 12 pontos")).toBeVisible();
});

test("Normal no celular: toque duplo em Próxima rodada não gasta a rodada seguinte (ME43)", async ({
  page,
}) => {
  // O 2º clique cai na rodada nova, que o Preact já desenhou: em 320 px, no "Não sei".
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, "2026-10-08T12:00:00-03:00");
  await page.getByRole("button", { name: "Não sei" }).click();
  await page.getByRole("button", { name: "Próxima rodada" }).dblclick();
  await expect(page.getByText("Rodada 2 de 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qual é o álbum?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Não sei" })).toBeVisible();
  await expect(page.locator(".reveal")).toHaveCount(0);
});

test("terminar o 2º diário do dia põe o ✓ na aba Hits na hora, sem trocar de aba (P227)", async ({
  page,
}) => {
  const lost = { status: "lost", stage: 0, attempts: [] } as const;
  await seedHistory(page, { "2026-10-08|song": { number: 1, rounds: [lost, lost, lost] } });
  await open(page, "2026-10-08T12:00:00-03:00", "#normal");
  await expect(hitsTab(page)).toHaveAccessibleName("Hits");
  for (const next of ["Próxima rodada", "Próxima rodada", "Ver resultado"]) {
    await page.getByRole("button", { name: "Não sei" }).click();
    await page.getByRole("button", { name: next }).click();
  }
  await expect(hitsTab(page)).toHaveAccessibleName("Hits (diários terminados)");
});

test("entrar num diário pelos Hits, com o teclado, leva o foco ao Tocar (regra 16, ME49)", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#inicio");
  // A Início leva o foco ao título depois da pintura: espera, senão ele tira o foco da aba.
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();
  await hitsTab(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Hits" })).toBeFocused();
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Desafio/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Desafio · nº 1");
  // O cartão some com a troca de tela: o foco que se perdeu vai ao Tocar.
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();
});

test("voltar pela aba Artistas a uma rodada aberta, com o teclado, leva o foco ao Tocar (a nav fica fora do main)", async ({
  page,
}) => {
  await open(page, "2026-10-08T12:00:00-03:00", "#artistas");
  await page.getByRole("button", { name: /^青井ユウ/ }).click();
  await page.getByRole("button", { name: "Livre" }).click();
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeVisible();
  await page.getByRole("link", { name: "Início" }).click();
  // A Início leva o foco ao título depois da pintura: espera, senão ele tira o foco da aba.
  await expect(page.getByRole("heading", { level: 1, name: "AteMusic" })).toBeFocused();
  await page.getByRole("navigation").getByRole("link", { name: "Artistas" }).focus();
  await page.keyboard.press("Enter");
  // A sessão mora no App: a rodada volta, e o foco sai do link da nav para o Tocar.
  await expect(page.getByRole("button", { name: "Tocar 1 s" })).toBeFocused();
});

test.describe("a virada é à meia-noite de Brasília, não no fuso do navegador (Tóquio)", () => {
  test("23:30 de 15/10 em Brasília (já 16/10 em Tóquio) ainda é o dia 15", async ({ page }) => {
    await open(page, "2026-10-15T23:30:00-03:00");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 8");
  });

  test("00:30 de 16/10 em Brasília já é o dia 16", async ({ page }) => {
    await open(page, "2026-10-16T00:30:00-03:00");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normal · nº 9");
  });
});
