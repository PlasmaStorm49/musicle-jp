// Ajudantes dos testes de ponta a ponta. Rodam no Node (Playwright) e leem o catálogo falso do
// disco para saber, pela faixa que o motor falso "tocou", qual é a resposta certa.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type {
  Album,
  ArtistCatalog,
  ArtistList,
  Catalog,
  Schedule,
  Target,
  Track,
} from "../src/core/types.ts";

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
    __musicleAudioLog?: {
      readonly url: string;
      readonly offset: number;
      readonly volume?: number;
    }[];
    /** Texto "copiado" pelo Compartilhar (navigator.clipboard trocado no teste). */
    __copied?: string;
    /** O data-theme do <html> quando o #app aparece, antes do main.tsx (theme.spec.ts). */
    __themeAtLoad?: string;
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
  hash = "#normal",
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

/** Uma faixa do catálogo falso, pelo id. */
export function trackById(id: string): Track {
  const track = catalog.tracks.find((t) => t.id === id);
  if (!track) throw new Error(`faixa ${id} não está no catálogo`);
  return track;
}

export function albumOf(track: Track): Album {
  const album = catalog.albums.find((a) => a.id === track.albumId);
  if (!album) throw new Error(`álbum de ${track.id} não está no catálogo`);
  return album;
}

/** O botão de opção do Normal cujo título (não o romaji nem o artista) é exatamente este. */
export function option(page: Page, title: string): Locator {
  const exactTitle = page.locator(".item-title").and(page.getByText(title, { exact: true }));
  return page.locator(".option").filter({ has: exactTitle });
}

/** Uma capa falsa qualquer, do fake-assets, para responder pelo host da Apple. */
const FAKE_COVER = fileURLToPath(new URL("../public/fixtures/art/al01.svg", import.meta.url));

/**
 * A lista de artistas como se fosse a da parada real: o provedor "apple" (que põe o selo do Apple
 * Music no fim, P170) e as capas num host da Apple, respondidas do disco. Nenhum pedido sai para a
 * rede. Chame antes do `open`.
 */
export async function appleArtistList(page: Page): Promise<void> {
  await page.route("**/fixtures/artists/index.json", async (route) => {
    const response = await route.fetch();
    const list = (await response.json()) as ArtistList;
    const artists = list.artists.map((a) => ({
      ...a,
      artworkUrl: `https://is1-ssl.mzstatic.com/image/thumb/e2e/${a.file}/300x300bb.svg`,
    }));
    await route.fulfill({ response, json: { ...list, provider: "apple", artists } });
  });
  await page.route("https://is1-ssl.mzstatic.com/**", (route) =>
    route.fulfill({ path: FAKE_COVER, contentType: "image/svg+xml" }),
  );
}

/** O fim de um id ("fixture:tr:tr01" → "tr01"), para montar um endereço falso da Apple. */
const tail = (id: string) => id.split(":").at(-1) ?? id;

/**
 * O catálogo e os arquivos dos artistas como os da parada real: o provedor "apple" (que põe o selo
 * do Apple Music no fim da rodada, P69), as prévias no host da Apple (o motor falso nunca as baixa)
 * e as capas num host da Apple, respondidas do disco. O lookup do iTunes falha de propósito, e
 * vale a reserva do catálogo. Nenhum pedido sai para a rede. Chame antes do `open`.
 * `albumTitle` troca o título de um álbum (o real chega a 89 caracteres); `explicit` marca todas
 * as faixas como explícitas (a pílula no player, P31: o caso mais alto da rodada).
 */
export async function appleCatalog(
  page: Page,
  {
    albumTitle = (album) => album.title,
    explicit = false,
  }: {
    readonly albumTitle?: (album: { readonly id: string; readonly title: string }) => string;
    readonly explicit?: boolean;
  } = {},
): Promise<void> {
  await page.route(/\/fixtures\/(catalog|artists\/ar\d+)\.json$/, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as Catalog | ArtistCatalog;
    const tracks = data.tracks.map((t) =>
      t.preview
        ? {
            ...t,
            explicit: explicit || t.explicit,
            preview: {
              ...t.preview,
              url: `https://audio-ssl.itunes.apple.com/e2e/${tail(t.id)}.m4a`,
            },
          }
        : t,
    );
    const albums = data.albums.map((a) => ({
      ...a,
      title: albumTitle(a),
      ...(a.artworkUrl
        ? { artworkUrl: `https://is1-ssl.mzstatic.com/image/thumb/e2e/${tail(a.id)}/1.svg` }
        : {}),
    }));
    await route.fulfill({ response, json: { ...data, provider: "apple", tracks, albums } });
  });
  await page.route("https://is1-ssl.mzstatic.com/**", (route) =>
    route.fulfill({ path: FAKE_COVER, contentType: "image/svg+xml" }),
  );
  await page.route("https://itunes.apple.com/**", (route) => route.abort());
  await page.route("https://audio-ssl.itunes.apple.com/**", (route) => route.abort());
}

/**
 * Quanto a página passa da janela, na vertical e na horizontal (0 ou menos: cabe). Mede depois
 * das fontes e das imagens: com a fonte de reserva, a medida oscila (a lição da ME70). A imagem
 * adiada (loading="lazy") fora da vista nunca termina o decode: a espera tem limite. O load pede
 * os dois pesos da Noto Sans JP: o ready sozinho termina na hora se nada estiver pendente.
 */
export async function overflow(page: Page): Promise<{ vertical: number; horizontal: number }> {
  return page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 1rem "Noto Sans JP"', "AteMusic 夜風"),
      document.fonts.load('700 1rem "Noto Sans JP"', "AteMusic 夜風"),
    ]);
    await document.fonts.ready;
    const images = [...document.images].map((img) => img.decode().catch(() => undefined));
    await Promise.race([Promise.all(images), new Promise((done) => setTimeout(done, 2000))]);
    await new Promise((done) => requestAnimationFrame(done));
    const root = document.documentElement;
    return {
      vertical: root.scrollHeight - window.innerHeight,
      horizontal: root.scrollWidth - window.innerWidth,
    };
  });
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
