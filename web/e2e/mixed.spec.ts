// As Misturadas (M17): a aba própria, a escolha do modo e os dois diários, com as prévias tocando
// juntas no motor falso. As respostas saem do __musicleMixLog (as prévias de cada mistura)
// cruzado com o catálogo falso do Anime, que tem as mesmas faixas da parada fictícia.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { MixedGame } from "../src/core/mixed.ts";
import type { AnimeCatalog, AnimeTrack } from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";
import {
  captureClipboard,
  expect,
  franchiseName,
  navLink,
  open,
  seedHistory,
  test,
} from "./helpers.ts";

const DAY = "2026-10-08T12:00:00-03:00";
const catalog = JSON.parse(
  readFileSync(new URL("../public/fixtures/anime/catalog.json", import.meta.url), "utf8"),
) as AnimeCatalog;

declare global {
  interface Window {
    __musicleMixLog?: {
      readonly urls: readonly string[];
      readonly pans: readonly number[];
      readonly seconds: number;
    }[];
  }
}

/** As faixas da última mistura que "tocou". */
async function lastMix(
  page: Page,
): Promise<{ tracks: AnimeTrack[]; pans: number[]; seconds: number }> {
  const mix = await page.evaluate(() => window.__musicleMixLog?.at(-1) ?? null);
  if (!mix) throw new Error("nenhuma mistura tocou");
  const tracks = mix.urls.map((url) => {
    const track = catalog.tracks.find((t) => t.preview && url.endsWith(t.preview.url));
    if (!track) throw new Error(`prévia fora do catálogo do Anime: ${url}`);
    return track;
  });
  return { tracks, pans: [...mix.pans], seconds: mix.seconds };
}

/** Digita o nome da música e escolhe a sugestão dela (o título e o artista). */
async function guessSong(page: Page, track: AnimeTrack): Promise<void> {
  await page.getByRole("combobox", { name: "Quais são as músicas?" }).fill(track.title);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(track.title, { exact: true }) })
    .filter({ hasText: track.artistDisplay })
    .first()
    .click();
}

/** Digita o nome do anime e escolhe a sugestão dele. */
async function guessAnime(page: Page, track: AnimeTrack): Promise<void> {
  const name = franchiseName(track);
  await page.getByRole("combobox", { name: "Quais são os animes?" }).fill(name);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first()
    .click();
}

test("Misturadas: acertar a música, das 4 rodadas ao compartilhar, com o Separar e a música achada fora da mistura", async ({
  page,
}) => {
  await captureClipboard(page);
  await open(page, DAY, "#inicio");
  await (await navLink(page, "Misturadas")).click();
  await expect(page.getByRole("heading", { level: 1, name: "Misturadas" })).toBeFocused();
  const tab = page.getByRole("navigation").getByRole("link", { name: /^Misturadas/ });
  await expect(tab).toHaveAttribute("aria-current", "page");
  const main = page.getByRole("main");
  const musica = main.getByRole("link", { name: /^Acertar a música/ });
  await expect(musica).toContainText("nº 1 · novo");
  await musica.click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Misturadas · Música · nº 1");
  await expect(tab).toHaveAttribute("aria-current", "true");
  const play = (seconds: number) => page.getByRole("button", { name: `Tocar ${seconds} s` });
  await expect(play(4)).toBeFocused();

  // Rodada 1: as duas no 1º trecho (10 pontos).
  await play(4).click();
  const first = await lastMix(page);
  expect(first.tracks).toHaveLength(2);
  expect(first.pans).toEqual([0, 0]);
  expect(first.seconds).toBe(4);
  await guessSong(page, first.tracks[0] as AnimeTrack);
  await expect(page.getByText("1 de 2 achadas")).toBeVisible();
  await guessSong(page, first.tracks[1] as AnimeTrack);
  await expect(page.getByRole("heading", { name: "Achou todas! 10 de 10 pontos." })).toBeFocused();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 2: separa (as achadas depois valem a metade), acha uma e desiste: (5 + 0) / 2 = 3.
  await page.getByRole("button", { name: "Separar L e R" }).click();
  await expect(page.getByRole("button", { name: "Separar L e R" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await play(4).click();
  const second = await lastMix(page);
  expect(second.pans).toEqual([-0.8, 0.8]);
  await guessSong(page, second.tracks[1] as AnimeTrack);
  // Recarregar no meio da rodada retoma pelos eventos: a achada e o Separar ficam.
  await page.reload();
  await expect(page.getByText("1 de 2 achadas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Separar L e R" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // A achada sai da próxima mistura: só a que falta toca.
  await play(4).click();
  const left = await lastMix(page);
  expect(left.tracks.map((t) => t.id)).toEqual([second.tracks[0]?.id]);
  expect(left.pans).toEqual([-0.8]);
  await page.getByRole("button", { name: "Desistir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Achou 1 de 2: 3 pontos." })).toBeFocused();
  await expect(
    page.getByText("achada no trecho de 4 s, separada: metade dos pontos"),
  ).toBeVisible();
  await expect(page.getByText("não achada")).toBeVisible();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 3: um pulo e as duas no trecho de 8 s (7 pontos).
  await page.getByRole("button", { name: "Pular (+4 s)" }).click();
  await play(8).click();
  const third = await lastMix(page);
  expect(third.seconds).toBe(8);
  for (const track of third.tracks) await guessSong(page, track);
  await expect(page.getByRole("heading", { name: "Achou todas! 7 de 10 pontos." })).toBeFocused();
  await page.getByRole("button", { name: "Próxima rodada" }).click();

  // Rodada 4: três juntas, todas no 1º trecho.
  await play(4).click();
  const fourth = await lastMix(page);
  expect(fourth.tracks).toHaveLength(3);
  for (const track of fourth.tracks) await guessSong(page, track);
  await expect(page.getByRole("heading", { name: "Achou todas! 10 de 10 pontos." })).toBeFocused();
  await page.getByRole("button", { name: "Ver resultado" }).click();

  await expect(page.getByRole("heading", { name: "Resultado do dia" })).toBeFocused();
  await expect(page.getByText("30 de 40 pontos")).toBeVisible();
  await page.getByRole("button", { name: "Compartilhar resultado" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__copied))
    .toBe(
      [
        "AteMusic Misturadas · Música nº 1",
        "30/40",
        "1️⃣1️⃣",
        "❌1️⃣💡",
        "2️⃣2️⃣",
        "1️⃣1️⃣1️⃣",
        new URL("/", page.url()).href,
      ].join("\n"),
    );

  // O jogo foi para o campo das Misturadas, e não para o histórico dos diários.
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    SAVE_KEY,
  );
  expect(Object.keys(saved.history)).toEqual([]);
  expect(Object.keys(saved.mixed.finished)).toEqual(["2026-10-08|misturadas-musica"]);
  // Um diário só: a aba ainda sem o ✓. Recarregar mostra o resumo.
  await expect(tab).not.toContainText("✓");
  await page.reload();
  await expect(page.getByText("30 de 40 pontos")).toBeVisible();
});

test("Misturadas: acertar o anime pela franquia, e o ✓ da aba com os dois diários de hoje", async ({
  page,
}) => {
  const done: MixedGame = {
    number: 1,
    rounds: [
      { status: "done", found: [null, null] },
      { status: "done", found: [null, null] },
      { status: "done", found: [null, null] },
      { status: "done", found: [null, null, null] },
    ],
  };
  await seedHistory(
    page,
    {},
    {},
    { mixed: { finished: { "2026-10-08|misturadas-musica": done }, progress: {} } },
  );
  await open(page, DAY, "#misturadas");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^Acertar a música/ })).toContainText(
    "nº 1 · terminado, 0 de 40 pontos",
  );
  await main.getByRole("link", { name: /^Acertar o anime/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Misturadas · Anime · nº 1");
  await page.getByRole("button", { name: "Tocar 4 s" }).click();
  const mix = await lastMix(page);
  for (const track of mix.tracks) await guessAnime(page, track);
  await expect(page.getByRole("heading", { name: "Achou todas! 10 de 10 pontos." })).toBeFocused();
  for (const label of ["Próxima rodada", "Próxima rodada", "Próxima rodada"]) {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: "Desistir", exact: true }).click();
  }
  await page.getByRole("button", { name: "Ver resultado" }).click();
  await expect(page.getByText("10 de 40 pontos")).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: /^Misturadas/ }),
  ).toContainText("✓");
});

test("Misturadas: a falha de áudio anula a rodada, que não conta", async ({ page }) => {
  // A 1ª rodada do "acertar a música" de 08/10 tem a tr21.
  await open(page, DAY, "#misturadas-musica", "fixture:tr:tr21");
  await page.getByRole("button", { name: "Tocar 4 s" }).click();
  await expect(page.locator("section.void")).toHaveText(
    /^Áudio indisponível: esta rodada foi anulada e não conta\./,
  );
  await expect(page.getByRole("button", { name: "Próxima rodada" })).toBeFocused();
});
