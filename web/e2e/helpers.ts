// Ajudantes dos testes de ponta a ponta. Rodam no Node (Playwright) e leem o catálogo falso do
// disco para saber, pela faixa que o motor falso "tocou", qual é a resposta certa.
import { readFileSync } from "node:fs";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { Album, Catalog, Schedule, Target, Track } from "../src/core/types.ts";

/** Lê um arquivo de dados falso. Os tipos são os do contrato: mudou o schema, o tsc acusa aqui. */
function fixture<T>(name: string): T {
  const url = new URL(`../public/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

const catalog = fixture<Catalog>("catalog.json");
const schedule = fixture<Schedule>("schedule.json");

declare global {
  interface Window {
    /** Em desenvolvimento, o App registra cada reprodução aqui (o motor falso também). */
    __musicleAudioLog?: { readonly url: string }[];
    /** Texto "copiado" pelo Compartilhar (navigator.clipboard trocado no teste). */
    __copied?: string;
  }
}

/**
 * Abre o jogo com o relógio fixo e o motor de áudio falso. A hora é de Brasília (com -03:00):
 * o navegador está no fuso de Tóquio, então a data só sai certa se o jogo usar o fuso do jogo.
 * `failAudio`: id da faixa cujo áudio falha (simula a prévia indisponível).
 */
export async function open(
  page: Page,
  brasilia: string,
  hash = "#musica",
  failAudio?: string,
): Promise<void> {
  const fail = failAudio ? `&failAudio=${encodeURIComponent(failAudio)}` : "";
  await page.clock.setFixedTime(new Date(brasilia));
  await page.goto(`/?fakeAudio=1${fail}${hash}`);
}

/** A faixa-resposta de uma rodada do diário, lida da agenda falsa. */
export function dailyAnswer(date: string, target: Target, round: number): string {
  const answer = schedule.days[date]?.[target][round]?.answer;
  if (!answer) throw new Error(`a agenda não tem a rodada ${round} de ${target} em ${date}`);
  return answer;
}

/** A faixa que acabou de "tocar" (último registro do __musicleAudioLog). */
export async function lastPlayed(page: Page): Promise<Track> {
  const url = await page.evaluate(() => window.__musicleAudioLog?.at(-1)?.url ?? "");
  const track = catalog.tracks.find((t) => t.preview && url.endsWith(t.preview.url));
  if (!track) throw new Error(`faixa tocada não está no catálogo: ${url}`);
  return track;
}

export function albumOf(track: Track): Album {
  const album = catalog.albums.find((a) => a.id === track.albumId);
  if (!album) throw new Error(`álbum de ${track.id} não está no catálogo`);
  return album;
}

export function artistName(album: Album): string {
  const artist = catalog.artists.find((a) => a.id === album.artistIds[0]);
  if (!artist) throw new Error(`artista de ${album.id} não está no catálogo`);
  return artist.name;
}

/** O botão de opção (4 opções) cujo título é exatamente este. */
export function option(page: Page, title: string): Locator {
  return page.locator(".option").filter({ has: page.getByText(title, { exact: true }) });
}

/** Troca a área de transferência por uma que guarda o texto (o Compartilhar copia para ela). */
export async function captureClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          window.__copied = text;
          return Promise.resolve();
        },
      },
    });
  });
}

/** Todo teste falha se o console mostrar erro (inclusive erro não tratado da página). */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "console sem erros").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
