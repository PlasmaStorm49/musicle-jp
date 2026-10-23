// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { PLAYLIST_URL } from "../core/apple.ts";
import { indexCatalog } from "../core/catalog.ts";
import { searchKey } from "../core/normalize.ts";
import { emptySave, type Save } from "../core/records.ts";
import { currentRound, reduce } from "../core/reducer.ts";
import { ROUTES } from "../core/routes.ts";
import { superfanOffset } from "../core/superfan.ts";
import type {
  Artist,
  ArtistAlbum,
  ArtistCatalog,
  ArtistList,
  ArtistListEntry,
  ArtistTrack,
  Catalog,
  Day,
  Track,
} from "../core/types.ts";
import { lookupBudget } from "../data/previews.ts";
import type { FetchLike } from "../data/source.ts";
import { type ArtistStore, Artists, useArtistStore } from "./Artists.tsx";

afterEach(cleanup);
afterEach(() => vi.restoreAllMocks());

const BASE = "http://x.test/";
const DIR = "fixtures/";
const DATE = "2026-10-08";

// Dados no próprio arquivo (web/CLAUDE.md, regra 14): 夜風 (com latino), 3 músicas, e Banda, 2.
const artist = (id: string, name: string, nameLatin: string | null): Artist => ({
  id,
  name,
  nameLatin,
  latinSource: nameLatin ? "provider" : null,
});
const YOKAZE = artist("t:ar:1", "夜風", "Yokaze");
const BANDA = artist("t:ar:2", "Banda", null);

function song(n: number, who: Artist): ArtistTrack {
  return {
    id: `t:tr:${n}`,
    songKey: `musica${n}|${who.id}`,
    title: `Música ${n}`,
    titleLatin: null,
    latinSource: null,
    artistIds: [who.id],
    artistDisplay: who.name,
    albumId: `t:al:${n}`,
    releaseDate: "2026-01-01",
    durationMs: 200000,
    explicit: false,
    preview: { url: `audio/${n}.wav`, durationSec: 30, startSec: 0 },
    storeUrl: null,
    popularity: 1 - n / 10,
    eligible: { daily: true, reason: null },
    search: { title: [searchKey(`Música ${n}`)], artist: [] }, // a chave do pipeline
    titleKeys: [`musica ${n}`],
  };
}

function single(n: number, who: Artist): ArtistAlbum {
  return {
    id: `t:al:${n}`,
    title: `Single ${n}`,
    titleLatin: null,
    latinSource: null,
    artistIds: [who.id],
    artistDisplay: who.name,
    type: "single",
    releaseDate: "2026-01-01",
    artworkUrl: null,
  };
}

function artistFile(who: Artist, numbers: readonly [number, ...number[]]): ArtistCatalog {
  const [first, ...rest] = numbers;
  return {
    schemaVersion: 1,
    provider: "teste",
    storefront: "jp",
    artistId: who.id,
    fetchedAt: "2026-01-01T00:00:00Z",
    artists: [who],
    albums: [single(first, who), ...rest.map((n) => single(n, who))],
    tracks: [song(first, who), ...rest.map((n) => song(n, who))],
  };
}

const FILES: Record<string, unknown> = {
  "index.json": {
    schemaVersion: 1,
    provider: "teste",
    storefront: "jp",
    artists: [
      {
        id: YOKAZE.id,
        name: YOKAZE.name,
        nameLatin: "Yokaze",
        file: "1.json",
        songs: 3,
        artworkUrl: "fixtures/art/al1.svg",
        medals: {
          names: {
            acertos: { name: "夜明け", latin: "Yoake" },
            completo: { name: "Round Robin", latin: null },
            perfeito: { name: "夜風劇場", latin: null },
          },
        },
      },
      // Sem capa: o monograma (P171).
      {
        id: BANDA.id,
        name: BANDA.name,
        nameLatin: null,
        file: "2.json",
        songs: 2,
        artworkUrl: null,
        medals: {
          names: {
            acertos: { name: "夜明け", latin: "Yoake" },
            completo: { name: "Round Robin", latin: null },
            perfeito: { name: "夜風劇場", latin: null },
          },
        },
      },
    ],
  } satisfies ArtistList,
  "1.json": artistFile(YOKAZE, [1, 2, 3]),
  "2.json": artistFile(BANDA, [4, 5]),
};

// A parada: só a faixa 1, de 夜風, que é a resposta dos dois diários de hoje (P141).
const chartTrack: Track = {
  ...song(1, YOKAZE),
  songKey: `musica 1|${YOKAZE.id}`,
  isrc: null,
  chart: {
    firstSeen: DATE,
    lastSeen: DATE,
    bestRank: 1,
    lastRank: 1,
    appearances: 1,
    inLatest: true,
  },
  search: { title: [searchKey("Música 1")], artist: [searchKey("夜風")] },
};
const chartCatalog: Catalog = {
  schemaVersion: 2,
  catalogVersion: "teste",
  generatedAt: "2026-01-01T00:00:00Z",
  provider: "teste",
  storefront: "jp",
  snapshots: [{ id: "s", date: DATE, fetchedAt: "2026-01-01T00:00:00Z", chart: "c", size: 1 }],
  artists: [YOKAZE],
  albums: [{ ...single(1, YOKAZE), similar: [] }],
  tracks: [chartTrack],
};
const chart = indexCatalog(chartCatalog);
const options: [string, string, string, string] = ["t:al:1", "t:al:2", "t:al:3", "t:al:4"];
const today: Day = {
  number: 1,
  catalogVersion: "teste",
  song: [{ answer: "t:tr:1" }, { answer: "t:tr:1" }, { answer: "t:tr:1" }],
  album: [1, 2, 3].map(() => ({ answer: "t:tr:1", options })) as Day["album"],
};

/** O servidor de dados falso: serve FILES, guarda as URLs e falha (ou muda) o que se pedir. */
function server() {
  const calls: string[] = [];
  const failing = new Set<string>();
  const replaced = new Map<string, unknown>();
  // Respostas seguras até soltar: a carga que demora.
  const held = new Map<string, Promise<void>>();
  const hold = (path: string) => {
    let release = () => {};
    held.set(path, new Promise<void>((resolve) => (release = resolve)));
    return release;
  };
  const fetchFn: FetchLike = async (url) => {
    calls.push(url);
    const path = url.replace(`${BASE}${DIR}artists/`, "");
    await held.get(path);
    if (failing.has(path)) throw new TypeError("Failed to fetch");
    const body = replaced.has(path) ? replaced.get(path) : FILES[path];
    return body
      ? { ok: true, status: 200, json: async () => body }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, calls, failing, replaced, hold };
}

type HarnessProps = { readonly show: boolean; readonly save: Save; readonly day: Day | null };

/** Monta o modo como o App: o estado (useArtistStore) mora fora da tela, que some e volta. */
function setup(day: Day | null = null, net = server()) {
  const engine: AudioEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(),
    retain: vi.fn(),
    setVolume: vi.fn(),
    volume: () => 1,
  };
  const budget = lookupBudget({ now: () => 0 });
  const announce = vi.fn();
  // O que o modo grava no save (P289): cada mudança, aplicada em ordem por `saved`.
  const record = vi.fn<(change: (save: Save) => Save) => void>();
  const saved = () => record.mock.calls.reduce((save, [change]) => change(save), emptySave());
  let latest: ArtistStore | null = null;
  function Harness({ show, save, day }: HarnessProps) {
    const store = useArtistStore({
      fetchFn: net.fetchFn,
      baseUrl: BASE,
      dataDir: DIR,
      budget,
      resolveUrl: (url) => `/${url}`,
      record,
    });
    latest = store;
    if (!show) return null;
    return (
      <Artists
        store={store}
        chart={chart}
        day={day}
        date={DATE}
        save={save}
        engine={engine}
        resolveUrl={(url) => `/${url}`}
        announce={announce}
      />
    );
  }
  const view = render(<Harness show={true} save={emptySave()} day={day} />);
  const rerender = (props: HarnessProps) => view.rerender(<Harness {...props} />);
  const store = () => {
    if (!latest) throw new Error("o estado não montou");
    return latest;
  };
  /** A sessão Livre em jogo. */
  const session = () => {
    const play = store().play;
    return play?.kind === "free" ? play.session : null;
  };
  /** A faixa da rodada em jogo. */
  const playing = () => {
    const game = session()?.game;
    return game ? currentRound(game).trackId : null;
  };
  return { engine, net, rerender, store, session, playing, announce, record, saved };
}

const title = () => screen.getByRole("heading", { level: 1 });
const card = (name: RegExp) => screen.getByRole("button", { name });
const score = () => document.querySelector(".practice-score")?.textContent;
const field = () => screen.getByRole("combobox", { name: "Qual é a música?" });

/** Escolhe o modo Livre na tela de escolha (P161), que vem depois do artista. */
async function free() {
  fireEvent.click(await screen.findByRole("button", { name: "Livre" }));
  return screen.findByRole("combobox", { name: "Qual é a música?" });
}

/** Escolhe o artista e o Livre, e espera a rodada (o arquivo dele chega numa microtarefa). */
async function choose(name: RegExp, init: MouseEventInit = {}) {
  fireEvent.click(card(name), init);
  return free();
}

describe("Artists: a lista (P147)", () => {
  it("carrega ao entrar, na ordem da lista, com o latino ao lado e a contagem; o foco no título", async () => {
    const { net } = setup();
    expect(screen.getByText("Carregando…")).toBeTruthy();
    const heading = await screen.findByRole("heading", { level: 1, name: "Artistas" });
    // O foco vem num efeito, depois da pintura da lista que chegou pela rede.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    const cards = screen.getAllByRole("button");
    // O "B" é o monograma da Banda, que não tem capa (escondido do leitor de tela).
    expect(cards.map((b) => b.textContent)).toEqual(["夜風 · Yokaze3 músicas", "BBanda2 músicas"]);
    // O nome acessível é o do artista; a contagem é a descrição.
    expect(card(/^夜風/).getAttribute("aria-describedby")).toBe("artist-0-songs");
    expect(screen.getByText("夜風").getAttribute("lang")).toBe("ja");
    expect(screen.getByText("Banda").getAttribute("lang")).toBeNull();
    expect(net.calls).toEqual([`${BASE}${DIR}artists/index.json`]);
  });

  it("a dica curta na tela, fora do leitor de tela; a inteira só para ele (P210)", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const short = screen.getByText("Escolha o artista e depois o modo.");
    expect(short.getAttribute("aria-hidden")).toBe("true");
    const full = screen.getByText(/^Escolha o artista e depois o modo: ouça o trecho/);
    expect(full.classList.contains("sr-only")).toBe(true);
    expect(full.parentElement).toBe(short.parentElement);
  });

  it("a capa no cartão (P168); sem ela, ou se não carregar, o monograma (P171)", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const cover = card(/^夜風/).querySelector("img");
    expect(cover?.getAttribute("src")).toBe("/fixtures/art/al1.svg");
    expect(cover?.getAttribute("alt")).toBe(""); // decorativa: o nome já está no cartão
    const letter = card(/^Banda/).querySelector(".monogram");
    expect(letter?.textContent).toBe("B");
    expect(letter?.getAttribute("aria-hidden")).toBe("true");
    // A capa que não carrega vira o monograma, com a 1ª letra do nome (P171).
    fireEvent.error(cover as HTMLImageElement);
    expect(card(/^夜風/).querySelector("img")).toBeNull();
    expect(card(/^夜風/).querySelector(".monogram")?.textContent).toBe("夜");
    // Fora da lista real, sem o selo da Apple.
    expect(screen.queryByRole("link", { name: /Apple Music/ })).toBeNull();
  });

  it("na lista real: só capa do host da Apple, e o selo no fim, com a playlist (P169, P170)", async () => {
    const net = server();
    const index = FILES["index.json"] as ArtistList;
    const apple = "https://is1-ssl.mzstatic.com/image/thumb/x/300x300bb.jpg";
    net.replaced.set("index.json", {
      ...index,
      provider: "apple",
      artists: [
        { ...index.artists[0], artworkUrl: apple },
        { ...index.artists[1], artworkUrl: "https://evil.test/x.jpg" },
      ],
    });
    setup(null, net);
    await screen.findByRole("heading", { name: "Artistas" });
    expect(card(/^夜風/).querySelector("img")?.getAttribute("src")).toBe(`/${apple}`);
    expect(card(/^Banda/).querySelector("img")).toBeNull(); // o host de fora vira o monograma
    expect(card(/^Banda/).querySelector(".monogram")).not.toBeNull();
    const badge = screen.getByRole("link", { name: /Apple Music/ });
    expect(badge.getAttribute("href")).toBe(PLAYLIST_URL);
    // O selo fecha a página (P112, P170): depois do último cartão.
    const last = card(/^Banda/);
    expect(last.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a seção de fora do Japão (P200): embaixo, com o título dela, e o selo depois dela", async () => {
    const net = server();
    const index = FILES["index.json"] as ArtistList;
    const [yokaze, banda] = index.artists;
    net.replaced.set("index.json", {
      ...index,
      provider: "apple",
      artists: [
        { ...banda, section: "foreign" },
        // Uma seção que este código não conhece fica na lista principal.
        { ...yokaze, section: "outra" } as unknown as ArtistListEntry,
      ],
    });
    setup(null, net);
    await screen.findByRole("heading", { level: 1, name: "Artistas" });
    const region = screen.getByRole("region", { name: "De fora do Japão" });
    expect(screen.getByRole("heading", { level: 2, name: "De fora do Japão" })).toBeTruthy();
    expect(region.contains(card(/^Banda/))).toBe(true);
    expect(region.contains(card(/^夜風/))).toBe(false);
    // A principal vem antes da seção, e os ids seguem a posição no índice: únicos na página.
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-labelledby"))).toEqual([
      "artist-1-name",
      "artist-0-name",
    ]);
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    const badge = screen.getByRole("link", { name: /Apple Music/ });
    expect(region.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem artista de fora do Japão, uma lista só, sem o título da seção", async () => {
    setup();
    await screen.findByRole("heading", { level: 1, name: "Artistas" });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(document.querySelectorAll("ul.home-modes")).toHaveLength(1);
  });

  it("nenhum id igual a uma rota (regra 17), na lista e na rodada", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const noRouteIds = () => {
      for (const route of Object.values(ROUTES)) expect(document.querySelector(route)).toBeNull();
    };
    noRouteIds();
    await choose(/^Banda/);
    noRouteIds();
  });
});

describe("Artists: a sessão (P125)", () => {
  it("escolhido o artista: o Desafio com o nome dele no título, o campo só do título e o foco no Tocar", async () => {
    const { net } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    fireEvent.click(card(/^夜風/));
    // O aviso leva o foco, e o nome vai na língua dele (ME68): o texto fica partido em dois nós.
    const loading = document.querySelector<HTMLElement>(".focused-notice");
    expect(loading?.textContent).toBe("Carregando as músicas de 夜風…");
    expect(loading?.querySelector('[lang="ja"]')?.textContent).toBe("夜風");
    expect(document.activeElement).toBe(loading);
    const input = await free();
    expect(title().textContent).toBe("夜風 · Yokaze");
    expect(screen.getByText("Rodada 1")).toBeTruthy();
    expect(score()).toBe("0 pontos em 0 rodadas");
    expect(input.getAttribute("placeholder")).toBe("Nome da música");
    expect(screen.getByText(/^Título, romaji ou kana\./)).toBeTruthy();
    expect(document.getElementById("guess-hint")?.textContent).not.toMatch(/artista/i);
    // O aviso de carga sumiu com o foco: o Player o leva ao Tocar, num efeito.
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/^Tocar/));
    expect(net.calls.at(-1)).toBe(`${BASE}${DIR}artists/1.json`);
  });

  it("a busca é só pelo título: o nome do artista não sugere nada", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const input = await choose(/^夜風/);
    fireEvent.input(input, { target: { value: "夜風" } });
    expect(screen.queryAllByRole("option", { hidden: true })).toHaveLength(0);
    fireEvent.input(input, { target: { value: "música" } });
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("a resposta de um diário pendente nunca sai, e as outras saem num ciclo", async () => {
    const { playing } = setup(today);
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const id = playing();
      if (id) seen.add(id);
      fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
      fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    }
    expect([...seen].sort()).toEqual(["t:tr:2", "t:tr:3"]);
    expect(score()).toBe("0 pontos em 6 rodadas");
  });

  it("o diário que termina no meio da sessão libera a música dele", async () => {
    const { playing, rerender } = setup(today);
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    expect(playing()).not.toBe("t:tr:1");
    const finished: Save = {
      ...emptySave(),
      history: {
        [`${DATE}|song`]: { number: 1, rounds: [] },
        [`${DATE}|album`]: { number: 1, rounds: [] },
      },
    };
    rerender({ show: true, save: finished, day: today });
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
      fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
      const id = playing();
      if (id) seen.add(id);
    }
    expect(seen.has("t:tr:1")).toBe(true);
  });

  it("sair da aba e voltar mantém o artista, a rodada e o placar", async () => {
    const { rerender } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^Banda/);
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    rerender({ show: false, save: emptySave(), day: null });
    rerender({ show: true, save: emptySave(), day: null });
    expect(title().textContent).toBe("Banda");
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(score()).toBe("0 pontos em 1 rodada");
    expect(field()).toBeTruthy();
  });
});

describe("Artists: a ajuda (P149 a P152)", () => {
  const helpButton = () => screen.queryByRole("button", { name: /^Pedir ajuda/ });
  const options = () =>
    screen.getByRole("list", { name: "Opções da ajuda" }).querySelectorAll("button");

  it("aparece depois da 1ª tentativa gasta e troca o campo pelas opções, com o foco na 1ª", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    expect(helpButton()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    const help = helpButton();
    expect(help?.textContent).toBe("Pedir ajuda"); // sem os pontos no botão
    if (!help) throw new Error("sem o botão da ajuda");
    help.focus(); // o clique do navegador leva o foco ao botão, que some em seguida
    fireEvent.click(help);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: /^Pular/ })).toBeTruthy(); // continua (P163)
    expect(helpButton()).toBeNull();
    expect(options()).toHaveLength(3);
    expect(document.activeElement).toBe(options()[0]);
    expect(screen.getByText(/^Escolha entre as opções: errar encerra a rodada/)).toBeTruthy();
  });

  it("acertar com a ajuda vale a metade do trecho (ME107); errar encerra a rodada com 0", async () => {
    const { playing } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    const answer = `Música ${playing()?.split(":").at(-1)}`;
    const right = [...options()].find((b) => b.textContent?.startsWith(answer));
    fireEvent.click(right as HTMLElement);
    // No 2º trecho (2 s), o acerto vale 8; com a ajuda, a metade: 4.
    expect(screen.getByText("Acertou com ajuda: 4 pontos.")).toBeTruthy();
    expect(score()).toBe("4 pontos em 1 rodada");

    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    const next = `Música ${playing()?.split(":").at(-1)}`;
    const wrong = [...options()].find((b) => !b.textContent?.startsWith(next));
    fireEvent.click(wrong as HTMLElement);
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    expect(score()).toBe("4 pontos em 2 rodadas");
  });

  it("no Livre, desistir continua de graça: só o Superfan cobra (P186)", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    expect(screen.queryByText(/^Desistiu/)).toBeNull();
    expect(score()).toBe("0 pontos em 1 rodada");
  });

  it("com a ajuda, o Pular aumenta o trecho até a última tentativa, que fica para a opção (P163)", async () => {
    const { playing } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    const before = [...options()].map((b) => b.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Pular (+2 s)" }));
    expect(screen.getByRole("button", { name: "Tocar 4 s" })).toBeTruthy();
    // Até a 5ª tentativa gasta: na 6ª, o botão some, e a opção ainda pode ser escolhida.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    expect(screen.queryByRole("button", { name: /^Pular/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Tocar 16 s" })).toBeTruthy();
    expect([...options()].map((b) => b.textContent)).toEqual(before);
    const answer = `Música ${playing()?.split(":").at(-1)}`;
    fireEvent.click([...options()].find((b) => b.textContent?.startsWith(answer)) as HTMLElement);
    // A ajuda vale a metade do trecho em que se acerta, para cima: no de 16 s (3), 2 (ME107).
    expect(score()).toBe("2 pontos em 1 rodada");
  });

  it("voltar à aba com a ajuda já pedida deixa o foco ir ao Tocar (regra 16)", async () => {
    const { rerender } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    // O link da nav de onde a pessoa volta, fora da tela do modo.
    const nav = document.body.appendChild(document.createElement("a"));
    nav.href = "#artistas";
    nav.focus();
    rerender({ show: false, save: emptySave(), day: null });
    rerender({ show: true, save: emptySave(), day: null });
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/^Tocar/));
    expect(options()).toHaveLength(3);
    nav.remove();
  });

  it("toque duplo no Pedir ajuda: o 2º clique, numa opção, não vale como palpite", async () => {
    const { session } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement, { detail: 1 });
    fireEvent.click(options()[0] as HTMLElement, { detail: 2 });
    const game = session()?.game;
    expect(game?.rounds[0]?.status).toBe("playing");
    expect(game?.rounds[0]?.attempts).toHaveLength(1);
  });

  it("sem outra música para mostrar, não há botão (com uma opção só, nada a escolher)", async () => {
    const { playing } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const input = await choose(/^Banda/);
    // A Banda tem duas músicas: errar a outra deixa só a resposta.
    const other = playing() === "t:tr:4" ? "Música 5" : "Música 4";
    fireEvent.input(input, { target: { value: other } });
    fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    expect(screen.getByText(/^Errou/)).toBeTruthy();
    expect(helpButton()).toBeNull();
  });

  it("nunca mostra a resposta de um diário pendente", async () => {
    setup(today);
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    const titles = [...options()].map((b) => b.textContent ?? "");
    expect(titles).toHaveLength(2); // as músicas 2 e 3: a 1 é o diário de hoje
    expect(titles.some((text) => text.startsWith("Música 1"))).toBe(false);
  });
});

describe("Artists: trocar de artista (P127, P146)", () => {
  it("sem rodada jogada: volta direto à lista; escolher de novo não busca de novo", async () => {
    const { net, store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: "Trocar de artista" }));
    expect(store().play).toBeNull();
    expect(document.activeElement).toBe(title());
    const calls = net.calls.length;
    fireEvent.click(card(/^夜風/)); // já baixado: a escolha do modo vem na hora
    expect(screen.getByRole("button", { name: "Livre" })).toBeTruthy();
    expect(net.calls).toHaveLength(calls);
  });

  it("com rodada jogada: o pop-up com o placar; o Esc fecha, e o Sim volta à lista", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    const change = screen.getByRole("button", { name: "Trocar de artista" });
    // Curto na tela; o nome inteiro, que começa por ele, para o leitor de tela (P210).
    expect(change.querySelector('[aria-hidden="true"]')?.textContent).toBe("Trocar");
    fireEvent.click(change);
    const dialog = screen.getByRole("dialog", {
      name: "Trocar de artista? O placar desta sessão (0 pontos em 1 rodada) será perdido.",
    }) as HTMLDialogElement;
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancelar" }), { key: "Escape" });
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(change);
    expect(store().play).not.toBeNull();

    fireEvent.click(change);
    fireEvent.click(screen.getByRole("button", { name: "Sim, trocar" }));
    expect(store().play).toBeNull();
    expect(title().textContent).toBe("Artistas");
  });

  it("toque duplo no Sim, trocar: o 2º clique cai num cartão e não começa outra sessão", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    fireEvent.click(screen.getByRole("button", { name: "Trocar de artista" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, trocar" }));
    fireEvent.click(card(/^Banda/), { detail: 2 });
    expect(store().play).toBeNull();
    expect(title().textContent).toBe("Artistas");
  });
});

describe("Artists: a escolha do modo (P161)", () => {
  it("depois do artista: o título com o nome e o foco, Livre e Superfan, e Voltar à lista", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    fireEvent.click(card(/^夜風/));
    const heading = await screen.findByRole("heading", { level: 1, name: /^夜風/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole("button", { name: "Livre" }).getAttribute("aria-describedby")).toBe(
      "artist-mode-free-hint",
    );
    expect(screen.getByRole("button", { name: "Superfan" })).toBeTruthy();
    expect(screen.getByText(/São 3 vidas: cada erro e cada desistir custam uma/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar à lista" }));
    expect(title().textContent).toBe("Artistas");
  });
});

describe("Artists: o Superfan (ME61)", () => {
  /** Escolhe o artista e o Superfan, e espera a partida. */
  async function superfan(name: RegExp) {
    fireEvent.click(card(name));
    fireEvent.click(await screen.findByRole("button", { name: "Superfan" }));
    return screen.findByRole("combobox", { name: "Qual é a música?" });
  }
  const run = (store: () => ArtistStore) => {
    const play = store().play;
    if (play?.kind !== "superfan") throw new Error("sem partida");
    return play.run;
  };
  const text = (selector: string) => document.querySelector(selector)?.textContent;

  it("o cabeçalho da partida, os 3 trechos e a ajuda logo de cara (P159)", async () => {
    // Uma semente cujo começo não é o 0 do catálogo: o teste vê se o sorteado chega ao motor.
    const first = "treino|song|0|0"; // o puzzleId da 1ª música
    const seed = [1, 2, 3, 4, 5].find((s) => superfanOffset(s, first, 30) > 0) ?? 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
      array[0] = seed;
      return array;
    }) as typeof crypto.getRandomValues);
    const { engine, store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    expect(title().textContent).toBe("夜風 · Yokaze · Superfan");
    expect(screen.getByText("Música 1")).toBeTruthy();
    expect(score()).toBe("Placar: 0 pontos");
    expect(text(".superfan-limits")).toBe("Vidas: 3 de 3 · Ajudas: 0 de 3");
    expect(screen.getByRole("button", { name: "Pular (+3 s)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pedir ajuda" })).toBeTruthy();
    // O trecho começa num ponto sorteado da prévia de 30 s, até os 19 s, e os trechos seguintes
    // da mesma música começam no mesmo ponto.
    const game = run(store).session.game;
    expect(game?.puzzleId).toBe(first);
    expect(run(store).session.practice.seed).toBe(seed);
    const expected = superfanOffset(seed, first, 30);
    expect(expected).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }));
    expect(vi.mocked(engine.play).mock.calls.at(-1)?.slice(1)).toEqual([expected, 1]);
    // O Pular fica desabilitado enquanto o trecho carrega.
    const skip = screen.getByRole("button", { name: "Pular (+3 s)" }) as HTMLButtonElement;
    await waitFor(() => expect(skip.disabled).toBe(false));
    fireEvent.click(skip);
    fireEvent.click(await screen.findByRole("button", { name: "Tocar 4 s" }));
    expect(vi.mocked(engine.play).mock.calls.at(-1)?.slice(1)).toEqual([expected, 4]);
  });

  it("o palpite errado custa uma vida, e não pontos, e passa para o trecho seguinte (P158, ME107)", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const input = await superfan(/^夜風/);
    const game = run(store).session.game;
    const answer = game ? currentRound(game).trackId : "";
    const other = answer === "t:tr:2" ? "Música 3" : "Música 2";
    fireEvent.input(input, { target: { value: other } });
    fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    expect(text(".superfan-limits")).toBe("Vidas: 2 de 3 · Ajudas: 0 de 3");
    expect(score()).toBe("Placar: 0 pontos");
    expect(screen.getByRole("button", { name: "Tocar 4 s" })).toBeTruthy();
  });

  it("a 3ª vida perdida, na música seguinte, a revela na hora, e o resultado vem no lugar da próxima", async () => {
    const { store, engine } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    const answer = () => {
      const game = run(store).session.game;
      return game ? currentRound(game).trackId : "";
    };
    const titleOf = (id: string) => `Música ${id.split(":").at(-1)}`;
    const pick = (id: string) => {
      fireEvent.input(field(), { target: { value: titleOf(id) } });
      fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    };
    const songs = ["t:tr:1", "t:tr:2", "t:tr:3"];
    // 1ª música: os dois errados e o acerto, na 3ª etapa (9 s): 4 pontos, e as vidas à parte.
    for (const id of songs.filter((id) => id !== answer())) pick(id);
    pick(answer());
    expect(screen.getByText("Acertou! 4 de 10 pontos.")).toBeTruthy();
    // Errar não tira pontos (ME107): a revelação não tem mais a conta dos erros.
    expect(document.querySelector(".reveal-errors")).toBeNull();
    expect(text(".superfan-limits")).toBe("Vidas: 1 de 3 · Ajudas: 0 de 3");
    fireEvent.click(screen.getByRole("button", { name: "Próxima música" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    // 2ª música: a última vida encerra a música na hora.
    pick(songs.find((id) => id !== answer()) ?? "");
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    expect(text(".superfan-limits")).toBe("Vidas: 0 de 3 · Ajudas: 0 de 3");
    // Quem encerrou foi a partida, e não a pessoa: o desistir forçado não conta (P290).
    const game = run(store).session.game;
    expect(game && currentRound(game).gaveUp).toBe(false);
    // A revelação diz que a partida acabou, e o motor só guarda o áudio desta música: o da
    // seguinte, que não vai tocar, sai.
    expect(screen.getByText("As 3 vidas acabaram. Veja o resultado.")).toBeTruthy();
    const current = `/audio/${answer().split(":").at(-1)}.wav`;
    await waitFor(() => expect(vi.mocked(engine.retain).mock.calls.at(-1)?.[0]).toEqual([current]));
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    expect(screen.getByText("As 3 vidas acabaram: a partida acabou.")).toBeTruthy();
    // Sem vida no fim, nenhum bônus: o placar é o das músicas (4 + 0).
    expect(score()).toBe("Placar: 4 pontos");
    expect(screen.queryByText(/^Bônus/)).toBeNull();
    expect(screen.getByText("Acertou 1 de 2 músicas.")).toBeTruthy();
  });

  it("o palpite errado anuncia a vida perdida; o que leva a última, e encerra a música, não promete outra tentativa", async () => {
    const { store, announce } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    const answer = () => {
      const game = run(store).session.game;
      return game ? currentRound(game).trackId : "";
    };
    const pick = (id: string) => {
      fireEvent.input(field(), { target: { value: `Música ${id.split(":").at(-1)}` } });
      fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    };
    const songs = ["t:tr:1", "t:tr:2", "t:tr:3"];
    const [w1, w2] = songs.filter((id) => id !== answer());
    // O Encerrar, curto na tela (P210), fica enquanto a música está em jogo.
    const quit = screen.getByRole("button", { name: "Encerrar a partida" });
    expect(quit.querySelector('[aria-hidden="true"]')?.textContent).toBe("Encerrar");
    pick(w1 ?? "");
    expect(announce).toHaveBeenLastCalledWith(
      expect.stringMatching(/Tentativa 2 de 3\. Perdeu uma vida\. Sobram 2\.$/),
    );
    pick(w2 ?? "");
    expect(announce).toHaveBeenLastCalledWith(
      expect.stringMatching(/Tentativa 3 de 3\. Perdeu uma vida\. Sobra 1\.$/),
    );
    pick(answer());
    fireEvent.click(screen.getByRole("button", { name: "Próxima música" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    announce.mockClear();
    pick(songs.find((id) => id !== answer()) ?? "");
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    // A revelação se anuncia sozinha: nada de "Tentativa 2 de 3" para uma música encerrada.
    expect(announce).not.toHaveBeenCalledWith(expect.stringMatching(/Tentativa/));
    // Sem vidas, a revelação leva ao resultado: o Encerrar sai, e o fim é pelas vidas.
    expect(screen.queryByRole("button", { name: "Encerrar a partida" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    expect(screen.getByText("As 3 vidas acabaram: a partida acabou.")).toBeTruthy();
  });

  it("a ajuda nunca mostra a resposta de um diário pendente, e a dica diz que errar custa uma vida", async () => {
    // Hoje a faixa 1 é a resposta dos diários: a partida e a ajuda ficam com as faixas 2 e 3.
    setup(today);
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: "Pedir ajuda" }));
    const list = screen.getByRole("list", { name: "Opções da ajuda" });
    expect(list.querySelectorAll("button")).toHaveLength(2); // a resposta e a outra que sobrou
    expect(list.textContent).not.toContain("Música 1");
    // No 1º trecho, o acerto vale 10; com a ajuda, a metade (ME107). A dica curta na tela; a
    // inteira, para o leitor de tela (P210).
    expect(screen.getByText("Errar custa uma vida; acertar vale 5 pontos.")).toBeTruthy();
    expect(
      screen.getByText(
        "Escolha entre as opções: errar encerra a música e custa uma vida, e acertar vale 5 pontos.",
      ),
    ).toBeTruthy();
    expect(text(".superfan-limits")).toBe("Vidas: 3 de 3 · Ajudas: 1 de 3");
  });

  it("com a ajuda, o Pular aumenta o trecho sem custar vida, e a 3ª tentativa fica para a opção (P163)", async () => {
    const { store, announce } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pedir ajuda/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pular (+3 s)" }));
    // O trecho novo pela barra do Superfan (1, 4 e 9 s), e não pela dos diários.
    expect(announce).toHaveBeenLastCalledWith(
      "Pulou. O trecho agora tem 4 s, e o acerto com a ajuda vale 3 pontos.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pular (+5 s)" }));
    expect(screen.getByRole("button", { name: "Tocar 9 s" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pular/ })).toBeNull();
    expect(text(".superfan-limits")).toBe("Vidas: 3 de 3 · Ajudas: 1 de 3");
    expect(score()).toBe("Placar: 0 pontos");
    const game = run(store).session.game;
    const answer = `Música ${game ? currentRound(game).trackId.split(":").at(-1) : ""}`;
    const list = screen.getByRole("list", { name: "Opções da ajuda" });
    const right = [...list.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith(answer),
    );
    fireEvent.click(right as HTMLElement);
    // No 3º trecho (9 s), o acerto vale 4; com a ajuda, a metade (ME107).
    expect(screen.getByText("Acertou com ajuda: 2 pontos.")).toBeTruthy();
  });

  it("toque duplo no cartão do Superfan: o 2º clique não toca nem pula", async () => {
    const { engine } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    fireEvent.click(card(/^夜風/));
    const superfanCard = await screen.findByRole("button", { name: "Superfan" });
    // O 2º clique de um toque duplo sozinho (o 1º caiu no cartão do artista) não começa a partida.
    fireEvent.click(superfanCard, { detail: 2 });
    expect(screen.getByRole("button", { name: "Superfan" })).toBe(superfanCard);
    fireEvent.click(superfanCard, { detail: 1 });
    // O 2º clique cai no que estiver no mesmo lugar da tela nova: aqui, no próprio Tocar.
    fireEvent.click(await screen.findByRole("button", { name: "Tocar 1 s" }), { detail: 2 });
    expect(engine.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
  });

  it("o desistir da rodada diz que é só a música", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    expect(screen.getByRole("button", { name: "Desistir da música" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Desistir" })).toBeNull();
  });

  it("desistir da música custa uma vida, e não pontos (P290, ME107)", async () => {
    setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: "Desistir da música" }));
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    // A revelação não tem mais a conta do desistir, mas diz a vida perdida: o cabeçalho não é
    // aria-live, e o leitor de tela a ouve com a revelação.
    expect(document.querySelector(".reveal-errors")).toBeNull();
    expect(text(".reveal-note")).toBe("Perdeu 1 vida. Sobram 2.");
    expect(score()).toBe("Placar: 0 pontos");
    expect(text(".superfan-limits")).toBe("Vidas: 2 de 3 · Ajudas: 0 de 3");
  });

  it("encerrar a partida pergunta antes, com uma vida perdida; o fim mostra o motivo e o placar, sem bônus", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const input = await superfan(/^Banda/);
    const game = run(store).session.game;
    const answer = game ? currentRound(game).trackId : "";
    const other = answer === "t:tr:4" ? "Música 5" : "Música 4";
    fireEvent.input(input, { target: { value: other } });
    fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Encerrar a partida" }));
    expect(
      screen.getByRole("dialog", { name: "Encerrar a partida? O placar fica em 0 pontos." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sim, encerrar" }));
    const end = screen.getByRole("heading", { level: 1, name: "Fim da partida" });
    await waitFor(() => expect(document.activeElement).toBe(end));
    expect(screen.getByText("Você encerrou a partida.")).toBeTruthy();
    // Encerrar não dá o bônus das vidas que sobraram (ME107).
    expect(score()).toBe("Placar: 0 pontos");
    expect(screen.queryByText(/^Bônus/)).toBeNull();
    expect(screen.getByText("Acertou 0 de 1 música.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Jogar de novo" }));
    expect(screen.getByText("Música 1")).toBeTruthy();
    expect(score()).toBe("Placar: 0 pontos");
    fireEvent.click(screen.getByRole("button", { name: "Encerrar a partida" })); // nada a perder
    fireEvent.click(screen.getByRole("button", { name: "Trocar de artista" }));
    expect(title().textContent).toBe("Artistas");
  });

  it("acertar todas: a partida acaba completa, com os acertos e o bônus das vidas (ME107)", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    let input = await superfan(/^Banda/);
    for (let i = 0; i < 2; i++) {
      const game = run(store).session.game;
      const answer = game ? currentRound(game).trackId : "";
      fireEvent.input(input, { target: { value: `Música ${answer.split(":").at(-1)}` } });
      fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
      expect(screen.getByText("Acertou! 10 de 10 pontos.")).toBeTruthy();
      // Na revelação da última música, o único passo é o resultado: encerrar ali perderia o
      // bônus da partida completa.
      expect(screen.queryAllByRole("button", { name: "Encerrar a partida" })).toHaveLength(
        i === 0 ? 1 : 0,
      );
      fireEvent.click(
        screen.getByRole("button", { name: i === 0 ? "Próxima música" : "Ver resultado" }),
      );
      if (i === 0) input = await screen.findByRole("combobox", { name: "Qual é a música?" });
    }
    expect(screen.getByText("Todas as músicas da partida tocaram.")).toBeTruthy();
    // O placar do fim já soma o bônus: 10 + 10 das músicas e 5 por vida que sobrou.
    expect(score()).toBe("Placar: 35 pontos");
    expect(screen.getByText("Bônus de 3 vidas que sobraram: 15 pontos.")).toBeTruthy();
    expect(screen.getByText("Acertou 2 de 2 músicas.")).toBeTruthy();
  });
});

describe("Artists: o que vai para o save (P289)", () => {
  /** Acerta a música em jogo pelo campo, sem tocar (o trecho de 1 s, o máximo de pontos). */
  const right = (store: () => ArtistStore) => {
    const play = store().play;
    const session = play?.kind === "free" ? play.session : play?.run.session;
    const game = session?.game;
    const answer = game ? currentRound(game).trackId : "";
    fireEvent.input(field(), { target: { value: `Música ${answer.split(":").at(-1)}` } });
    fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
  };

  it("na Livre, cada música acertada uma vez só: voltar à aba não conta de novo, e desistir não conta", async () => {
    const { store, rerender, record, saved } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    right(store);
    rerender({ show: false, save: emptySave(), day: null });
    rerender({ show: true, save: emptySave(), day: null });
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    right(store);
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    expect(record).toHaveBeenCalledTimes(2);
    expect(saved().artists).toEqual({ "t:ar:1": { right: 2 } });
  });

  it("a rodada anulada (falha de áudio) não é acerto", async () => {
    const { store, record } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^Banda/);
    act(() =>
      store().change((session) => ({
        ...session,
        game: session.game && reduce(session.game, { type: "VOID", round: 0, reason: "falha" }),
      })),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it("o Superfan perfeito: os acertos, o fim e a perfeita", async () => {
    const { store, saved } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    fireEvent.click(card(/^Banda/));
    fireEvent.click(await screen.findByRole("button", { name: "Superfan" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    right(store);
    fireEvent.click(screen.getByRole("button", { name: "Próxima música" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    right(store);
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    expect(screen.getByText("Todas as músicas da partida tocaram.")).toBeTruthy();
    expect(saved().artists).toEqual({ "t:ar:2": { right: 2, done: true, perfect: true } });
  });

  it("o Superfan que acaba ao perder as 3 vidas não termina; o Jogar de novo conta a partida nova à parte", async () => {
    const { store, saved, record } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    fireEvent.click(card(/^夜風/));
    fireEvent.click(await screen.findByRole("button", { name: "Superfan" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    // 3 desistências custam as 3 vidas (P290): a partida acaba, sem o fim.
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Desistir da música" }));
      fireEvent.click(
        screen.getByRole("button", { name: i < 2 ? "Próxima música" : "Ver resultado" }),
      );
      if (i < 2) await screen.findByRole("combobox", { name: "Qual é a música?" });
    }
    expect(screen.getByText("As 3 vidas acabaram: a partida acabou.")).toBeTruthy();
    expect(saved().artists).toEqual({});
    const before = record.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Jogar de novo" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    right(store);
    expect(record.mock.calls.length).toBe(before + 1);
    expect(saved().artists).toEqual({ "t:ar:1": { right: 1 } });
  });

  it("o Superfan encerrado: só os acertos, sem o fim", async () => {
    const { store, saved } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    fireEvent.click(card(/^Banda/));
    fireEvent.click(await screen.findByRole("button", { name: "Superfan" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    right(store);
    fireEvent.click(screen.getByRole("button", { name: "Próxima música" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    fireEvent.click(screen.getByRole("button", { name: "Encerrar a partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, encerrar" }));
    await screen.findByRole("heading", { level: 1, name: "Fim da partida" });
    expect(saved().artists).toEqual({ "t:ar:2": { right: 1 } });
  });
});

describe("Artists: falhas ao carregar (P144)", () => {
  it("a lista que falha: o aviso com o foco, e o Tentar de novo busca outra vez", async () => {
    const net = server();
    net.failing.add("index.json");
    const { net: fresh } = setup(null, net);
    const notice = await screen.findByText(/Não foi possível carregar os artistas/);
    await waitFor(() => expect(document.activeElement).toBe(notice));
    fresh.failing.clear();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { name: "Artistas" })).toBeTruthy();
    expect(fresh.calls).toHaveLength(2);
  });

  it("o artista que falha: o aviso com o nome dele, Tentar de novo e Voltar à lista", async () => {
    const { net } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    net.failing.add("2.json");
    fireEvent.click(card(/^Banda/));
    const notice = await screen.findByText(
      "Não foi possível carregar as músicas de Banda. Confira a conexão.",
    );
    await waitFor(() => expect(document.activeElement).toBe(notice));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à lista" }));
    expect(title().textContent).toBe("Artistas");

    fireEvent.click(card(/^Banda/));
    await screen.findByText(/Não foi possível carregar as músicas de Banda/);
    net.failing.clear();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await free()).toBeTruthy();
    expect(title().textContent).toBe("Banda");
  });

  it("o artista de nome japonês que falha: o nome na língua dele e o foco no aviso (ME68)", async () => {
    const { net } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    net.failing.add("1.json");
    fireEvent.click(card(/^夜風/));
    // O aviso da falha é outro elemento (a `key`): o foco passa a ele quando a carga falha.
    const failed = () => document.querySelector<HTMLElement>(".focused-notice");
    await waitFor(() =>
      expect(failed()?.textContent).toBe(
        "Não foi possível carregar as músicas de 夜風. Confira a conexão.",
      ),
    );
    expect(failed()?.querySelector('[lang="ja"]')?.textContent).toBe("夜風");
    await waitFor(() => expect(document.activeElement).toBe(failed()));
  });

  it("voltar à lista durante a carga: o arquivo que chega depois não começa a sessão", async () => {
    const { net, store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const release = net.hold("1.json");
    fireEvent.click(card(/^夜風/));
    expect(document.activeElement?.textContent).toBe("Carregando as músicas de 夜風…");
    fireEvent.click(screen.getByRole("button", { name: "Voltar à lista" }));
    expect(title().textContent).toBe("Artistas");
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(store().play).toBeNull();
    expect(title().textContent).toBe("Artistas");
    // Ficou guardado: escolher de novo leva à escolha do modo na hora, sem buscar outra vez.
    const calls = net.calls.length;
    fireEvent.click(card(/^夜風/));
    expect(screen.getByRole("button", { name: "Livre" })).toBeTruthy();
    expect(net.calls).toHaveLength(calls);
  });

  it("a lista de uma versão que o código não conhece: pede para recarregar a página", async () => {
    const net = server();
    net.replaced.set("index.json", { ...(FILES["index.json"] as object), schemaVersion: 2 });
    setup(null, net);
    expect(
      await screen.findByText("O jogo foi atualizado desde que esta página abriu."),
    ).toBeTruthy();
  });

  it("a carga que termina com a aba escondida leva à escolha do modo, que aparece ao voltar", async () => {
    const { net, rerender } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const release = net.hold("2.json");
    fireEvent.click(card(/^Banda/));
    rerender({ show: false, save: emptySave(), day: null });
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    rerender({ show: true, save: emptySave(), day: null });
    expect(title().textContent).toBe("Banda");
    expect(screen.getByRole("button", { name: "Livre" })).toBeTruthy();
    expect(net.calls.filter((url) => url.endsWith("/2.json"))).toHaveLength(1);
  });

  it("durante uma carga, outra escolha não vale: nem a mesma de novo, nem um artista em cache", async () => {
    const { net, store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^Banda/); // a Banda fica em cache
    fireEvent.click(screen.getByRole("button", { name: "Trocar de artista" }));
    const { list } = store();
    if (list.status !== "ready") throw new Error("a lista não carregou");
    const [yokaze, banda] = list.list.artists;
    if (!banda) throw new Error("lista sem os dois artistas");
    const release = net.hold("1.json");
    act(() => {
      store().choose(yokaze);
      store().choose(yokaze);
      store().choose(banda);
    });
    expect(store().picked).toBeNull();
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(store().picked?.entry.id).toBe(YOKAZE.id);
    expect(net.calls.filter((url) => url.endsWith("/1.json"))).toHaveLength(1);
  });

  it("arquivo de uma versão que o código não conhece: pede para recarregar a página", async () => {
    const { net } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    net.replaced.set("1.json", { ...(FILES["1.json"] as object), schemaVersion: 2 });
    fireEvent.click(card(/^夜風/));
    expect(
      await screen.findByText("O jogo foi atualizado desde que esta página abriu."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recarregar a página" })).toBeTruthy();
  });
});
