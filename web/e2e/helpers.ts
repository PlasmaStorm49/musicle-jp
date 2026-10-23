// Ajudantes dos testes de ponta a ponta. Rodam no Node (Playwright) e leem o catálogo falso do
// disco para saber, pela faixa que o motor falso "tocou", qual é a resposta certa.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { AnimeDifficulty, AnimeMode } from "../src/core/daily.ts";
import { emptySave, type Save } from "../src/core/records.ts";
import type {
  Album,
  AnimeCatalog,
  AnimeSchedule,
  AnimeTrack,
  ArtistCatalog,
  ArtistList,
  Catalog,
  Schedule,
  Target,
  Track,
} from "../src/core/types.ts";
import { SAVE_KEY } from "../src/storage/save.ts";

/** Lê um arquivo de dados falso. Os tipos são os do contrato: mudou o schema, o tsc acusa aqui. */
function fixture<T>(name: string): T {
  const url = new URL(`../public/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

const catalog = fixture<Catalog>("catalog.json");
const schedule = fixture<Schedule>("schedule.json");
/** O Anime fictício (M14): as faixas são as da parada fictícia (o mesmo áudio sintético). */
const animeCatalog = fixture<AnimeCatalog>("anime/catalog.json");
const animeSchedule = fixture<AnimeSchedule>("anime/schedule.json");

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
 * `failAudio`: id da faixa cujo áudio falha (simula a prévia indisponível). Os avisos de medalha
 * ficam calados (`?medalhas=silencio`, M16): o pop-up grande, modal, travaria os cliques de quem
 * não os testa. Quem testa os avisos usa o `openWithMedals`.
 */
export async function open(
  page: Page,
  brasilia: string,
  hash = "#normal",
  failAudio?: string,
  extra = "",
): Promise<void> {
  const fail = failAudio ? `&failAudio=${encodeURIComponent(failAudio)}` : "";
  const medals = extra.includes("medalhas=") ? "" : "&medalhas=silencio";
  await page.clock.setFixedTime(new Date(brasilia));
  await page.goto(`/?fakeAudio=1${fail}${medals}${extra}${hash}`);
}

/**
 * Abre o jogo com os avisos de medalha ligados (M16, só em desenvolvimento): `demo`, a lista de
 * exemplo, de limites fáceis; `avisos`, a lista real, como no site (o valor não é um modo: vale a
 * lista real, e nada se cala). A lista real calada é o padrão do `open`.
 */
export async function openWithMedals(
  page: Page,
  brasilia: string,
  hash = "#medalhas",
  mode: "demo" | "avisos" = "demo",
) {
  await open(page, brasilia, hash, undefined, `&medalhas=${mode}`);
}

/**
 * Grava, antes da carga, um save da versão atual só com o histórico dado (o resto vazio, ou o de
 * `extra`: o total do Treino e a estante, com a medalha em destaque). Chame
 * antes do `open`. O tipo `Save` trava a versão: subiu a do save, o tsc acusa aqui, e não em
 * cada teste. Grava uma vez por aba (a marca no `sessionStorage`): o recarregar lê o que o jogo
 * gravou (as medalhas já avisadas, M16), e não o save do começo.
 */
let seeds = 0;
export async function seedHistory(
  page: Page,
  history: Save["history"],
  artists: Save["artists"] = {},
  extra: Partial<Pick<Save, "practiceRight" | "shelf">> = {},
): Promise<void> {
  const save: Save = { ...emptySave(), history, artists, ...extra };
  // Uma marca por chamada: a 2ª chamada na mesma página também grava (a última vale).
  const mark = `e2e-seeded-${seeds++}`;
  await page.addInitScript(
    ([key, raw, seeded]) => {
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem(key, raw);
      sessionStorage.setItem(seeded, "1");
    },
    [SAVE_KEY, JSON.stringify(save), mark] as const,
  );
}

/** A aba Hits da nav (P225). Pelo começo do nome: com o ✓, ele vira "Hits (diários terminados)". */
export function hitsTab(page: Page): Locator {
  return page.getByRole("navigation").getByRole("link", { name: /^Hits/ });
}

/**
 * Um link da nav pelo nome, como a pessoa o alcança: abaixo de 720 px, os Artistas, o Histórico e
 * as Medalhas ficam no "Mais" (P265, P287), que abre antes. O getByRole só acha o link visível.
 */
export async function navLink(page: Page, name: string): Promise<Locator> {
  const nav = page.getByRole("navigation");
  const link = nav.getByRole("link", { name, exact: true });
  if (!(await link.isVisible())) await nav.getByRole("button", { name: "Mais" }).click();
  return link;
}

/** Vai a um jogo dos Hits como a pessoa: a aba Hits da nav e o cartão do jogo na tela dela. */
export async function viaHits(page: Page, game: RegExp): Promise<void> {
  await hitsTab(page).click();
  await page.getByRole("main").getByRole("link", { name: game }).click();
}

/** A aba Anime da nav (M14). Pelo começo do nome: com o ✓, ele vira "Anime (já jogou hoje)". */
export function animeTab(page: Page): Locator {
  return page.getByRole("navigation").getByRole("link", { name: /^Anime/ });
}

/**
 * Vai a uma tela do Anime como a pessoa: a aba Anime da nav, o cartão do modo e, com `level`, o
 * cartão da dificuldade (o diário).
 */
export async function viaAnime(page: Page, mode: RegExp, level?: RegExp): Promise<void> {
  await animeTab(page).click();
  await page.getByRole("main").getByRole("link", { name: mode }).click();
  if (level) await page.getByRole("main").getByRole("link", { name: level }).click();
}

/** A faixa-resposta de uma rodada do diário, lida da agenda falsa. */
export function dailyAnswer(date: string, target: Target, round: number): string {
  const answer = schedule.days[date]?.[target][round]?.answer;
  if (!answer) throw new Error(`a agenda não tem a rodada ${round} de ${target} em ${date}`);
  return answer;
}

/** A faixa-resposta de uma rodada de um diário do Anime, lida da agenda falsa do Anime. */
export function animeAnswer(
  date: string,
  mode: AnimeMode,
  difficulty: AnimeDifficulty,
  round: number,
): string {
  const answer = animeSchedule.days[date]?.[mode][difficulty][round]?.answer;
  if (!answer) {
    throw new Error(
      `a agenda do Anime não tem a rodada ${round} de ${mode}/${difficulty} em ${date}`,
    );
  }
  return answer;
}

/** A faixa que acabou de "tocar" (último registro do __musicleAudioLog). */
export async function lastPlayed(page: Page): Promise<Track> {
  const url = await page.evaluate(() => window.__musicleAudioLog?.at(-1)?.url ?? "");
  const track = catalog.tracks.find((t) => t.preview && url.endsWith(t.preview.url));
  if (!track) throw new Error(`faixa tocada não está no catálogo: ${url}`);
  return track;
}

/** O nome do anime (a 1ª franquia) de uma faixa do Anime: a resposta do "acertar o anime". */
export function franchiseName(track: AnimeTrack): string {
  const id = track.anime.franchiseIds[0];
  const franchise = animeCatalog.franchises.find((f) => f.id === id);
  if (!franchise) throw new Error(`a franquia ${id} não está no catálogo do Anime`);
  return franchise.name;
}

/** A faixa do Anime que acabou de "tocar", lida do catálogo falso do Anime. */
export async function lastPlayedAnime(page: Page): Promise<AnimeTrack> {
  const url = await page.evaluate(() => window.__musicleAudioLog?.at(-1)?.url ?? "");
  const track = animeCatalog.tracks.find((t) => t.preview && url.endsWith(t.preview.url));
  if (!track) throw new Error(`faixa tocada não está no catálogo do Anime: ${url}`);
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
    // A capa do cartão e a das medalhas (P296), as duas no host da Apple, como na lista real.
    const artists = list.artists.map((a) => ({
      ...a,
      artworkUrl: `https://is1-ssl.mzstatic.com/image/thumb/e2e/${a.file}/300x300bb.svg`,
      medals: a.medals.artworkUrl
        ? {
            ...a.medals,
            artworkUrl: `https://is1-ssl.mzstatic.com/image/thumb/e2e/medal-${a.file}/300x300bb.svg`,
          }
        : a.medals,
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
 * O catálogo, os arquivos dos artistas e o catálogo do Anime como os reais: o provedor "apple" (que
 * põe o selo do Apple Music no fim da rodada, P69), as prévias no host da Apple (o motor falso
 * nunca as baixa) e as capas num host da Apple, respondidas do disco. O lookup do iTunes falha de
 * propósito, e vale a reserva do catálogo. Nenhum pedido sai para a rede. Chame antes do `open`.
 * `albumTitle` troca o título de um álbum (o real chega a 89 caracteres); `explicit` marca todas
 * as faixas como explícitas (a pílula no player, P31: o caso mais alto da rodada).
 */
export async function appleCatalog(
  page: Page,
  {
    albumTitle = (album) => album.title,
    artistDisplay = (name) => name,
    explicit = false,
    franchiseName = (name) => name,
    themes = (list) => list,
  }: {
    readonly albumTitle?: (album: { readonly id: string; readonly title: string }) => string;
    /** O nome do artista nas faixas e nos álbuns (o da parada real pode ser bem longo). */
    readonly artistDisplay?: (name: string) => string;
    readonly explicit?: boolean;
    /** No Anime: o nome de cada franquia (o do catálogo real chega a uns 60 caracteres). */
    readonly franchiseName?: (name: string) => string;
    /** No Anime: os temas de cada faixa (o nome do anime longo, a faixa em 2 ou mais temas). */
    readonly themes?: (list: AnimeTrack["anime"]["themes"]) => AnimeTrack["anime"]["themes"];
  } = {},
): Promise<void> {
  await page.route(/\/fixtures\/(catalog|artists\/ar\d+|anime\/catalog)\.json$/, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as Catalog | ArtistCatalog | AnimeCatalog;
    const tracks = data.tracks.map((t) =>
      t.preview
        ? {
            ...t,
            artistDisplay: artistDisplay(t.artistDisplay),
            explicit: explicit || t.explicit,
            preview: {
              ...t.preview,
              url: `https://audio-ssl.itunes.apple.com/e2e/${tail(t.id)}.m4a`,
            },
          }
        : { ...t, artistDisplay: artistDisplay(t.artistDisplay) },
    );
    const albums = data.albums.map((a) => ({
      ...a,
      title: albumTitle(a),
      artistDisplay: artistDisplay(a.artistDisplay),
      ...(a.artworkUrl
        ? { artworkUrl: `https://is1-ssl.mzstatic.com/image/thumb/e2e/${tail(a.id)}/1.svg` }
        : {}),
    }));
    // No Anime, as franquias e os temas, como no catálogo real.
    const anime =
      "franchises" in data
        ? {
            franchises: data.franchises.map((f) => ({ ...f, name: franchiseName(f.name) })),
            tracks: tracks.map((t) =>
              "anime" in t ? { ...t, anime: { ...t.anime, themes: themes(t.anime.themes) } } : t,
            ),
          }
        : { tracks };
    await route.fulfill({ response, json: { ...data, provider: "apple", albums, ...anime } });
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
