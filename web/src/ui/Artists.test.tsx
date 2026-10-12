// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import { searchKey } from "../core/normalize.ts";
import { emptySave, type Save } from "../core/records.ts";
import { currentRound } from "../core/reducer.ts";
import { ROUTES } from "../core/routes.ts";
import { superfanOffset } from "../core/superfan.ts";
import type {
  Artist,
  ArtistAlbum,
  ArtistCatalog,
  ArtistList,
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
      { id: YOKAZE.id, name: YOKAZE.name, nameLatin: "Yokaze", file: "1.json", songs: 3 },
      { id: BANDA.id, name: BANDA.name, nameLatin: null, file: "2.json", songs: 2 },
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
  };
  const budget = lookupBudget({ now: () => 0 });
  const announce = vi.fn();
  let latest: ArtistStore | null = null;
  function Harness({ show, save, day }: HarnessProps) {
    const store = useArtistStore({
      fetchFn: net.fetchFn,
      baseUrl: BASE,
      dataDir: DIR,
      budget,
      resolveUrl: (url) => `/${url}`,
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
  return { engine, net, rerender, store, session, playing, announce };
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
    expect(cards.map((b) => b.textContent)).toEqual(["夜風 · Yokaze3 músicas", "Banda2 músicas"]);
    // O nome acessível é o do artista; a contagem é a descrição.
    expect(card(/^夜風/).getAttribute("aria-describedby")).toBe("artist-0-songs");
    expect(screen.getByText("夜風").getAttribute("lang")).toBe("ja");
    expect(screen.getByText("Banda").getAttribute("lang")).toBeNull();
    expect(net.calls).toEqual([`${BASE}${DIR}artists/index.json`]);
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
    const loading = screen.getByText("Carregando as músicas de 夜風…");
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
    expect(help?.textContent).toBe("Pedir ajuda (3 opções, vale 1 ponto)");
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

  it("acertar com a ajuda vale 1 ponto; errar encerra a rodada com 0", async () => {
    const { playing } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await choose(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    const answer = `Música ${playing()?.split(":").at(-1)}`;
    const right = [...options()].find((b) => b.textContent?.startsWith(answer));
    fireEvent.click(right as HTMLElement);
    expect(screen.getByText("Acertou com ajuda: 1 ponto.")).toBeTruthy();
    expect(score()).toBe("1 ponto em 1 rodada");

    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    fireEvent.click(helpButton() as HTMLElement);
    const next = `Música ${playing()?.split(":").at(-1)}`;
    const wrong = [...options()].find((b) => !b.textContent?.startsWith(next));
    fireEvent.click(wrong as HTMLElement);
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    expect(score()).toBe("1 ponto em 2 rodadas");
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
    expect(score()).toBe("1 ponto em 1 rodada"); // os pontos da ajuda, em qualquer etapa
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
    expect(screen.getByText(/3 erros acabam a partida/)).toBeTruthy();
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
    expect(text(".superfan-limits")).toBe("Erros: 0 de 3 · Ajudas: 0 de 3");
    expect(screen.getByRole("button", { name: "Pular (+3 s)" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^Pedir ajuda \(3 opções, vale -1 ponto\)/ }),
    ).toBeTruthy();
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

  it("o palpite errado é um erro, −5, e passa para o trecho seguinte (P158)", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    const input = await superfan(/^夜風/);
    const game = run(store).session.game;
    const answer = game ? currentRound(game).trackId : "";
    const other = answer === "t:tr:2" ? "Música 3" : "Música 2";
    fireEvent.input(input, { target: { value: other } });
    fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
    expect(text(".superfan-limits")).toBe("Erros: 1 de 3 · Ajudas: 0 de 3");
    expect(score()).toBe("Placar: -5 pontos");
    expect(screen.getByRole("button", { name: "Tocar 4 s" })).toBeTruthy();
  });

  it("o 3º erro, na música seguinte, a revela na hora, e o resultado vem no lugar da próxima", async () => {
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
    // 1ª música: os dois errados e o acerto, na 3ª etapa.
    for (const id of songs.filter((id) => id !== answer())) pick(id);
    pick(answer());
    expect(screen.getByText("Acertou! 1 de 3 pontos.")).toBeTruthy();
    expect(screen.getByText("2 erros: -10 pontos.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima música" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    // 2ª música: o 3º erro encerra a música na hora.
    pick(songs.find((id) => id !== answer()) ?? "");
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    expect(screen.getByText("1 erro: -5 pontos.")).toBeTruthy();
    // A revelação diz que a partida acabou, e o motor só guarda o áudio desta música: o da
    // seguinte, que não vai tocar, sai.
    expect(screen.getByText("3 erros: a partida acabou. Veja o resultado.")).toBeTruthy();
    const current = `/audio/${answer().split(":").at(-1)}.wav`;
    await waitFor(() => expect(vi.mocked(engine.retain).mock.calls.at(-1)?.[0]).toEqual([current]));
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    expect(screen.getByText("3 erros: a partida acabou.")).toBeTruthy();
    expect(score()).toBe("Placar: -14 pontos"); // 1 − 10 − 5
    expect(screen.getByText("Acertou 1 de 2 músicas.")).toBeTruthy();
  });

  it("o palpite errado anuncia o erro da partida; o 3º, que encerra a música, não promete outra tentativa", async () => {
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
    pick(w1 ?? "");
    expect(announce).toHaveBeenLastCalledWith(
      expect.stringMatching(/Tentativa 2 de 3\. Erro 1 de 3: -5 pontos\.$/),
    );
    pick(w2 ?? "");
    pick(answer());
    fireEvent.click(screen.getByRole("button", { name: "Próxima música" }));
    await screen.findByRole("combobox", { name: "Qual é a música?" });
    announce.mockClear();
    pick(songs.find((id) => id !== answer()) ?? "");
    expect(screen.getByText("Não foi dessa vez.")).toBeTruthy();
    // A revelação se anuncia sozinha: nada de "Tentativa 2 de 3" para uma música encerrada.
    expect(announce).not.toHaveBeenCalledWith(expect.stringMatching(/Tentativa/));
    // E encerrar a partida agora é o fim por erros.
    fireEvent.click(screen.getByRole("button", { name: "Encerrar a partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, encerrar" }));
    expect(screen.getByText("3 erros: a partida acabou.")).toBeTruthy();
  });

  it("a ajuda nunca mostra a resposta de um diário pendente, e a dica diz quanto custa errar", async () => {
    // Hoje a faixa 1 é a resposta dos diários: a partida e a ajuda ficam com as faixas 2 e 3.
    setup(today);
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pedir ajuda \(2 opções/ }));
    const list = screen.getByRole("list", { name: "Opções da ajuda" });
    expect(list.textContent).not.toContain("Música 1");
    expect(
      screen.getByText(
        "Escolha entre as opções: errar encerra a rodada e vale -5 pontos, e acertar vale -1 ponto.",
      ),
    ).toBeTruthy();
    expect(text(".superfan-limits")).toBe("Erros: 0 de 3 · Ajudas: 1 de 3");
  });

  it("com a ajuda, o Pular aumenta o trecho sem contar erro, e a 3ª tentativa fica para a opção (P163)", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    await superfan(/^夜風/);
    fireEvent.click(screen.getByRole("button", { name: /^Pedir ajuda/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pular (+3 s)" }));
    fireEvent.click(screen.getByRole("button", { name: "Pular (+5 s)" }));
    expect(screen.getByRole("button", { name: "Tocar 9 s" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pular/ })).toBeNull();
    expect(text(".superfan-limits")).toBe("Erros: 0 de 3 · Ajudas: 1 de 3");
    expect(score()).toBe("Placar: 0 pontos");
    const game = run(store).session.game;
    const answer = `Música ${game ? currentRound(game).trackId.split(":").at(-1) : ""}`;
    const list = screen.getByRole("list", { name: "Opções da ajuda" });
    const right = [...list.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith(answer),
    );
    fireEvent.click(right as HTMLElement);
    expect(screen.getByText("Acertou com ajuda: -1 ponto.")).toBeTruthy();
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

  it("encerrar a partida pergunta antes, com erro cometido; o fim mostra o motivo e o placar", async () => {
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
      screen.getByRole("dialog", { name: "Encerrar a partida? O placar fica em -5 pontos." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sim, encerrar" }));
    const end = screen.getByRole("heading", { level: 1, name: "Fim da partida" });
    await waitFor(() => expect(document.activeElement).toBe(end));
    expect(screen.getByText("Você encerrou a partida.")).toBeTruthy();
    expect(score()).toBe("Placar: -5 pontos");
    expect(screen.getByText("Acertou 0 de 1 música.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Jogar de novo" }));
    expect(screen.getByText("Música 1")).toBeTruthy();
    expect(score()).toBe("Placar: 0 pontos");
    fireEvent.click(screen.getByRole("button", { name: "Encerrar a partida" })); // nada a perder
    fireEvent.click(screen.getByRole("button", { name: "Trocar de artista" }));
    expect(title().textContent).toBe("Artistas");
  });

  it("acertar todas: a partida acaba, com os acertos", async () => {
    const { store } = setup();
    await screen.findByRole("heading", { name: "Artistas" });
    let input = await superfan(/^Banda/);
    for (let i = 0; i < 2; i++) {
      const game = run(store).session.game;
      const answer = game ? currentRound(game).trackId : "";
      fireEvent.input(input, { target: { value: `Música ${answer.split(":").at(-1)}` } });
      fireEvent.click(screen.getAllByRole("option")[0] as HTMLElement);
      expect(screen.getByText("Acertou! 3 de 3 pontos.")).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: i === 0 ? "Próxima música" : "Ver resultado" }),
      );
      if (i === 0) input = await screen.findByRole("combobox", { name: "Qual é a música?" });
    }
    expect(screen.getByText("Todas as músicas da partida tocaram.")).toBeTruthy();
    expect(score()).toBe("Placar: 6 pontos");
    expect(screen.getByText("Acertou 2 de 2 músicas.")).toBeTruthy();
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
