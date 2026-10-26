// O quiz do dia (M18): a aba própria, a run com as duas prévias em sequência no motor falso, as
// vidas, a retomada ao recarregar, o fim pelo 3º erro e o compartilhar. As respostas saem do mês
// fictício do quiz (08/10: as playlists, max, 28 rodadas).
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { QuizBonus, QuizMonth } from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import { captureClipboard, expect, navLink, open, test } from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";
const month = JSON.parse(
  readFileSync(new URL("../public/fixtures/anime/quiz/2026-10.json", import.meta.url), "utf8"),
) as QuizMonth;
const rounds = month.days["2026-10-08"]?.rounds ?? [];
const bonus = JSON.parse(
  readFileSync(new URL("../public/fixtures/anime/quiz-bonus.json", import.meta.url), "utf8"),
) as QuizBonus;

/** O botão da escolha certa (ou errada) da rodada `n`. */
function pick(page: Page, n: number, right: boolean) {
  const answer = rounds[n]?.answer ?? "a";
  const side = right === (answer === "a") ? "A" : "B";
  return page.getByRole("button", { name: `Escolher a ${side}` });
}

/** Os eventos do quiz de 08/10 já gravados (o save grava num efeito, depois da pintura). */
function savedEvents(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? "{}");
    return save.quiz?.progress?.["2026-10-08|quiz"]?.events?.length ?? 0;
  }, SAVE_KEY);
}

test("Quiz do dia: as duas prévias em sequência, as vidas, a retomada, o fim pelo 3º erro e o compartilhar", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, DAY, "#inicio");
  await (await navLink(page, "Quiz")).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quiz do dia · nº 1");
  await expect(page.getByText("Qual está em mais playlists do AnimeThemes?")).toBeVisible();
  // Sem o total de rodadas (o usuário, 26/10/2026): a run não é para chegar ao fim.
  await expect(page.getByText(/^Rodada 1(?!\d)/)).toBeVisible();
  await expect(page.getByText(/Rodada 1 de/)).toHaveCount(0);
  await expect(page.getByText("Vidas: 2")).toBeVisible();
  const play = page.getByRole("button", { name: "Tocar 3 s" });
  await expect(play).toBeFocused();

  // O Tocar toca a A e, quando ela acaba, a B (P384).
  await play.click();
  await expect.poll(() => page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(2);
  const played = await page.evaluate(() => (window.__musicleAudioLog ?? []).map((log) => log.url));
  expect(played[0]).toContain(`/${rounds[0]?.a.replace("fixture:tr:", "") ?? "?"}.`);
  expect(played[1]).toContain(`/${rounds[0]?.b.replace("fixture:tr:", "") ?? "?"}.`);
  // O "Ouvir mais" abre o trecho de 7 s e toca as duas de novo.
  await page.getByRole("button", { name: /^Ouvir mais/ }).click();
  await expect.poll(() => page.evaluate(() => window.__musicleAudioLog?.length ?? 0)).toBe(4);
  await expect(page.getByRole("button", { name: "Tocar 7 s" })).toBeVisible();

  // Rodada 1: certa.
  await pick(page, 0, true).click();
  await expect(page.getByRole("heading", { name: "Acertou!" })).toBeFocused();
  await expect(page.getByText(/^Em \d+ playlists? do AnimeThemes$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: errada; a vida desce, e a run continua. O trecho voltou aos 3 s.
  await expect(page.getByText(/^Rodada 2(?!\d)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tocar 3 s" })).toBeVisible();
  await pick(page, 1, false).click();
  await expect(page.getByRole("heading", { name: "Errou. Vidas: 1." })).toBeFocused();

  // Recarregar retoma pelos eventos (o usuário, 25/10/2026: a run retoma): a revelação da rodada 2.
  await expect.poll(() => savedEvents(page)).toBe(3);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Errou. Vidas: 1." })).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodadas 3 e 4: erradas. O 3º erro encerra (P377).
  await pick(page, 2, false).click();
  await expect(page.getByRole("heading", { name: "Errou. Vidas: 0." })).toBeFocused();
  await page.getByRole("button", { name: "Próxima rodada" }).click();
  await pick(page, 3, false).click();
  await expect(page.getByRole("heading", { name: "Errou: fim da run." })).toBeFocused();
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByRole("heading", { name: "Fim da run" })).toBeFocused();
  await expect(page.getByText("Chegou à rodada 4", { exact: true })).toBeVisible();
  await expect(page.getByText("1 acerto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  const copied = await page.evaluate(() => window.__copied ?? "");
  expect(copied.split("\n").slice(0, 3)).toEqual([
    "AteMusic · Quiz do dia nº 1",
    "Rodada 4 · 1 acerto",
    "✅❌❌❌",
  ]);
  // O ✓ na aba, e a run terminada fica terminada ao voltar.
  await expect(
    page.getByRole("navigation").getByRole("link", { name: /^Quiz.*já jogou hoje/ }),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Fim da run" })).toBeVisible();

  // O bônus de estreia (o usuário, 25/10/2026): 08/10 é o 1º dia da agenda fictícia, e o botão
  // aparece no fim da run. As 3 rodadas têm cada uma a sua pergunta e não contam no resultado.
  await page.getByRole("button", { name: "Rodadas bônus de estreia" }).click();
  const questions = ["Qual é a mais recente?", "Qual é o encerramento?", /MyAnimeList\?$/];
  for (const [n, round] of bonus.rounds.entries()) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Bônus de estreia · ${n + 1} de 3`,
    );
    await expect(page.getByText(questions[n] ?? "")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tocar 3 s" })).toBeFocused();
    // A 1ª certa, as outras erradas: o erro do bônus não encerra nada.
    const right = n === 0;
    const side = right === (round.answer === "a") ? "A" : "B";
    await page.getByRole("button", { name: `Escolher a ${side}` }).click();
    await expect(page.getByRole("heading", { name: right ? "Acertou!" : "Errou." })).toBeFocused();
    const next = n < 2 ? "Próxima rodada bônus" : "Voltar ao resultado";
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByRole("heading", { name: "Fim da run" })).toBeFocused();
  await expect(page.getByText("Chegou à rodada 4", { exact: true })).toBeVisible();
});

test("Quiz do dia pelo Histórico (o usuário, 26/10/2026): a run de um dia passado, jogada depois, e a volta ao dia", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, "2026-10-10T12:00:00-03:00", "#historico/2026-10-08");
  const card = page.getByRole("link", { name: /^Quiz do dia/ });
  await expect(card).toContainText("nº 1 · novo");
  await card.click();
  await expect(page).toHaveURL(/#quiz\/2026-10-08$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quiz do dia · nº 1");

  // Três erros encerram a run (P377).
  for (const n of [0, 1, 2]) {
    await pick(page, n, false).click();
    const next = n < 2 ? "Próxima rodada" : "Ver resultado";
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByRole("heading", { name: "Fim da run" })).toBeFocused();
  await expect(page.getByText("Jogado depois: não conta nas medalhas.")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  const copied = await page.evaluate(() => window.__copied ?? "");
  expect(copied.split("\n")[0]).toBe("AteMusic · Quiz do dia nº 1 (jogado depois)");

  // Sem a contagem: a volta ao dia, onde o cartão mostra o resultado e a marca do jogado depois.
  await page.getByRole("link", { name: "Voltar ao dia" }).click();
  const done = page.getByRole("link", { name: /^Quiz do dia/ });
  await expect(done).toContainText("Rodada 3, 0 acertos");
  await expect(done).toContainText("jogado depois");
});
