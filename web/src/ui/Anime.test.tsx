// @vitest-environment happy-dom
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { indexAnime } from "../core/catalog.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "../core/records.ts";
import { type AnimeTab, ROUTES } from "../core/routes.ts";
import type {
  AnimeAlbum,
  AnimeCatalog,
  AnimeDay,
  AnimeSchedule,
  AnimeTrack,
  Artist,
} from "../core/types.ts";
import { catalogResolver, type LookupBudget } from "../data/previews.ts";
import type { AnimeData, FetchLike } from "../data/source.ts";
import { Anime, type AnimeLoad, type AnimeStore, useAnimeStore } from "./Anime.tsx";

afterEach(cleanup);

// Catálogo e agenda mínimos no próprio arquivo (web/CLAUDE.md, regra 14): 6 faixas, cada uma num
// álbum e de um anime.
const track = (n: number): AnimeTrack => ({
  id: `t:tr:${n}`,
  songKey: `musica${n}|t:ar:${n}`,
  title: `Música ${n}`,
  titleLatin: null,
  latinSource: null,
  artistIds: [`t:ar:${n}`],
  artistDisplay: `Artista ${n}`,
  albumId: `t:al:${n}`,
  releaseDate: "2026-01-01",
  durationMs: 200000,
  explicit: false,
  preview: { url: `audio/${n}.wav`, durationSec: 30, startSec: 0 },
  storeUrl: null,
  popularity: 1,
  eligible: { daily: true, reason: null },
  search: { title: [`musica${n}`], artist: [`artista${n}`] },
  anime: {
    franchiseIds: [`anime:fr:${n}`],
    themes: [{ anime: `Anime ${n}`, type: "OP", sequence: 1 }],
    tiers: { musica: "facil", titulo: "facil" },
  },
});
const album = (n: number): AnimeAlbum => ({
  id: `t:al:${n}`,
  title: `Álbum ${n}`,
  titleLatin: null,
  latinSource: null,
  artistIds: [`t:ar:${n}`],
  artistDisplay: `Artista ${n}`,
  type: "single",
  releaseDate: "2026-01-01",
  artworkUrl: null,
});
const artist = (n: number): Artist => ({
  id: `t:ar:${n}`,
  name: `Artista ${n}`,
  nameLatin: null,
  latinSource: null,
});
const NS = [1, 2, 3, 4, 5, 6] as const;
const catalog: AnimeCatalog = {
  schemaVersion: 1,
  catalogVersion: "teste",
  generatedAt: "2026-01-01T00:00:00Z",
  provider: "teste",
  storefront: "jp",
  snapshots: [{ id: "s", fetchedAt: "2026-01-01T00:00:00Z" }],
  franchises: [{ id: "anime:fr:1", name: "Anime 1", search: ["anime1"] }],
  artists: [artist(1), ...NS.slice(1).map(artist)],
  albums: [album(1), ...NS.slice(1).map(album)],
  tracks: [track(1), ...NS.slice(1).map(track)],
};
const DATE = "2026-10-08";
const rounds = (a: number, b: number, c: number): AnimeDay["musica"]["facil"] => [
  { answer: `t:tr:${a}` },
  { answer: `t:tr:${b}` },
  { answer: `t:tr:${c}` },
];
const DAY: AnimeDay = {
  number: 4,
  catalogVersion: "teste",
  musica: { facil: rounds(1, 2, 3), medio: rounds(4, 5, 6), dificil: rounds(3, 1, 5) },
  titulo: { facil: rounds(4, 1, 2), medio: rounds(6, 3, 5), dificil: rounds(2, 4, 6) },
};
const schedule: AnimeSchedule = {
  schemaVersion: 1,
  kind: "anime",
  timezone: "America/Sao_Paulo",
  epoch: "2026-10-05",
  days: { [DATE]: DAY },
};
const data: AnimeData = { index: indexAnime(catalog), schedule };
const resolveUrl = (url: string) => `/${url}`;

// 6 + 0 + 5 = 11 de 18.
const finished: FinishedGame = {
  number: 4,
  rounds: [
    { status: "won", stage: 0, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "won", stage: 1, attempts: ["skip", "right"] },
  ],
};

function engine(): AudioEngine {
  return {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(),
    retain: vi.fn(),
    setVolume: vi.fn(),
    volume: () => 1,
  };
}

function store(
  load: AnimeLoad = { status: "ready", data, resolver: catalogResolver(data.index, resolveUrl) },
) {
  return { load, request: vi.fn() } satisfies AnimeStore;
}

function setup(
  tab: AnimeTab,
  {
    save = emptySave(),
    date = DATE,
    anime = store(),
  }: {
    readonly save?: Save;
    readonly date?: string;
    readonly anime?: AnimeStore;
  } = {},
) {
  render(
    <Anime
      tab={tab}
      store={anime}
      date={date}
      save={save}
      engine={engine()}
      resolveUrl={resolveUrl}
      announce={vi.fn()}
      saveStore={null}
      onSaved={vi.fn()}
      shareUrl="https://x.test/"
    />,
  );
  return anime;
}

const card = (name: RegExp) => screen.getByRole("link", { name });
const lines = (el: Element) => [...el.querySelectorAll(".tag")].map((n) => n.textContent);
/** Os cartões em oliva: o jogo por jogar, a ação da tela. */
const nextCards = () =>
  [...document.querySelectorAll(".home-card.next .mode-name")].map((n) => n.textContent);
/** Os cartões sem link (o modo sem tela, o dia fora da agenda). */
const offCards = () =>
  [...document.querySelectorAll(".home-card.off")].map((c) => ({
    name: c.querySelector(".mode-name")?.textContent,
    lines: lines(c),
  }));
const description = (link: HTMLElement) =>
  document.getElementById(link.getAttribute("aria-describedby") ?? "")?.textContent;

describe("Anime: a carga (sob demanda)", () => {
  it("ao abrir a categoria sem o Anime carregado, pede a carga uma vez, e mostra o Carregando com o foco", () => {
    const anime = setup("anime", { anime: store({ status: "idle" }) });
    expect(anime.request).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toBe("Carregando…");
    cleanup();
    // Já carregando (outra tela do Anime pediu): não pede de novo.
    const loading = setup("anime-musica", { anime: store({ status: "loading" }) });
    expect(loading.request).not.toHaveBeenCalled();
    expect(screen.getByText("Carregando…")).toBeTruthy();
  });

  it("a carga falhou, na tela da categoria: o aviso com o foco e o Tentar de novo, que pede de novo", () => {
    const anime = setup("anime", { anime: store({ status: "retry" }) });
    const notice = screen.getByText("Não foi possível carregar o Anime. Confira a conexão.");
    expect(document.activeElement).toBe(notice);
    const retry = screen.getByRole("button", { name: "Tentar de novo" });
    // O 2º clique de um toque duplo não pede outra carga (regra 23).
    fireEvent.click(retry, { detail: 2 });
    expect(anime.request).not.toHaveBeenCalled();
    fireEvent.click(retry, { detail: 1 });
    expect(anime.request).toHaveBeenCalledTimes(1);
  });

  it("a carga falhou, num diário ou numa dificuldade: o aviso, e o link de volta ao Anime", () => {
    for (const tab of ["anime-musica-facil", "anime-musica"] as const) {
      setup(tab, { anime: store({ status: "retry" }) });
      expect(document.activeElement?.textContent).toBe(
        "Não foi possível carregar o Anime. Confira a conexão.",
      );
      expect(screen.getByRole("link", { name: "Voltar ao Anime" }).getAttribute("href")).toBe(
        "#anime",
      );
      cleanup();
    }
  });

  it("dados de uma versão nova: recarregar a página", () => {
    setup("anime", { anime: store({ status: "update" }) });
    expect(document.activeElement?.textContent).toBe(
      "O jogo foi atualizado desde que esta página abriu.",
    );
    expect(screen.getByRole("button", { name: "Recarregar a página" })).toBeTruthy();
  });
});

describe("Anime: a escolha do modo (P233)", () => {
  it("o título Anime, com o foco ao abrir (regra 16)", () => {
    setup("anime");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Anime" }));
  });

  it("o acertar a música leva à dificuldade dele; o acertar o anime fica em breve, sem link (PR D3)", () => {
    setup("anime");
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#anime-musica",
    ]);
    const musica = card(/^Acertar a música/);
    expect(lines(musica)).toEqual(["3 diários novos"]);
    expect(musica.textContent).toContain("Digite o nome da música");
    expect(description(musica)).toContain("em até 6 tentativas");
    expect(offCards()).toEqual([{ name: "Acertar o anime", lines: ["Em breve"] }]);
    expect(document.querySelector("ul.home-modes")?.classList.contains("single")).toBe(true);
  });

  it("o estado dos 3 diários do modo numa linha, e o oliva enquanto há um por jogar", () => {
    setup("anime");
    expect(nextCards()).toEqual(["Acertar a música"]);
    cleanup();
    setup("anime", {
      save: {
        ...emptySave(),
        inProgress: { [puzzleId(DATE, "anime-musica-medio")]: { events: [{ type: "SKIP" }] } },
      },
    });
    expect(lines(card(/^Acertar a música/))).toEqual(["em andamento"]);
    cleanup();
    const one = { [puzzleId(DATE, "anime-musica-facil")]: finished };
    setup("anime", { save: { ...emptySave(), history: one } });
    expect(lines(card(/^Acertar a música/))).toEqual(["1 de 3 terminados"]);
    expect(nextCards()).toEqual(["Acertar a música"]);
    cleanup();
    const all = {
      ...one,
      [puzzleId(DATE, "anime-musica-medio")]: finished,
      [puzzleId(DATE, "anime-musica-dificil")]: finished,
    };
    setup("anime", { save: { ...emptySave(), history: all } });
    expect(lines(card(/^Acertar a música/))).toEqual(["3 de 3 terminados"]);
    expect(nextCards()).toEqual([]);
  });

  it("dia fora da agenda do Anime: os dois modos avisam, sem link", () => {
    setup("anime", { date: "2026-10-07" });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(offCards()).toEqual([
      { name: "Acertar a música", lines: ["Não há diário hoje"] },
      { name: "Acertar o anime", lines: ["Em breve"] },
    ]);
  });

  it("nenhum id igual a uma rota (o navegador rolaria até ele, regra 17)", () => {
    setup("anime");
    for (const route of Object.values(ROUTES)) expect(document.querySelector(route)).toBeNull();
  });
});

describe("Anime: a escolha da dificuldade (P232)", () => {
  it("o nome do modo no título, com o foco ao abrir, e as 3 dificuldades numa coluna, na ordem", () => {
    setup("anime-musica");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Acertar a música" }),
    );
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#anime-musica-facil",
      "#anime-musica-medio",
      "#anime-musica-dificil",
    ]);
    expect(document.querySelector("ul.home-modes")?.classList.contains("single")).toBe(true);
  });

  it("cada cartão com o estado do diário (o nº da agenda do Anime) e a dica curta; a inteira, com a regra, para o leitor de tela", () => {
    setup("anime-musica", {
      save: {
        ...emptySave(),
        history: { [puzzleId(DATE, "anime-musica-facil")]: finished },
        inProgress: { [puzzleId(DATE, "anime-musica-medio")]: { events: [{ type: "SKIP" }] } },
      },
    });
    expect(lines(card(/^Fácil/))).toEqual(["nº 4 · terminado, 11 de 18 pontos"]);
    expect(lines(card(/^Médio/))).toEqual(["nº 4 · em andamento"]);
    expect(lines(card(/^Difícil/))).toEqual(["nº 4 · novo"]);
    expect(card(/^Fácil/).textContent).toContain("Os temas mais famosos");
    expect(description(card(/^Fácil/))).toBe(
      "Quase só aberturas, as mais conhecidas. Digite o nome exato da música, em até 6 tentativas. 3 rodadas por dia.",
    );
    // O oliva é o 1º por jogar: o Médio, em andamento.
    expect(nextCards()).toEqual(["Médio"]);
  });

  it("dia fora da agenda: as 3 avisam, sem link", () => {
    setup("anime-musica", { date: "2026-10-07" });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(offCards().map((c) => c.lines)).toEqual([
      ["Não há diário hoje"],
      ["Não há diário hoje"],
      ["Não há diário hoje"],
    ]);
  });

  it("o acertar o anime (PR D3): a tela existe, com as 3 em breve e sem link", () => {
    setup("anime-titulo");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Acertar o anime");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(offCards()).toEqual([
      { name: "Fácil", lines: ["Em breve"] },
      { name: "Médio", lines: ["Em breve"] },
      { name: "Difícil", lines: ["Em breve"] },
    ]);
  });

  it("o 2º clique de um toque duplo não abre o diário (ele cai aqui vindo da tela do Anime, regra 23)", () => {
    setup("anime-musica");
    const facil = card(/^Fácil/);
    const second = createEvent.click(facil, { detail: 2 });
    fireEvent(facil, second);
    expect(second.defaultPrevented).toBe(true);
  });

  it("nenhum id igual a uma rota (regra 17)", () => {
    setup("anime-musica");
    for (const route of Object.values(ROUTES)) expect(document.querySelector(route)).toBeNull();
  });
});

describe("Anime: o diário", () => {
  it("o diário do acertar a música é o do Desafio: o cabeçalho com o nome dele e o campo da música", () => {
    setup("anime-musica-facil");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Música · Fácil · nº 4");
    expect(screen.getByText("Rodada 1 de 3")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Qual é a música?" })).toBeTruthy();
    // Sem o selo da Apple: o catálogo de teste não é o da Apple.
    expect(screen.queryByRole("link", { name: /Apple Music/ })).toBeNull();
  });

  it("o diário terminado mostra o resultado (P39), com o nome do diário", () => {
    setup("anime-musica-dificil", {
      save: { ...emptySave(), history: { [puzzleId(DATE, "anime-musica-dificil")]: finished } },
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Música · Difícil · nº 4");
    expect(screen.getByRole("heading", { name: "Resultado do dia" })).toBeTruthy();
    expect(screen.getByText("11 de 18 pontos")).toBeTruthy();
  });

  it("sem o dia na agenda do Anime: o aviso com o foco, e de volta ao Anime", () => {
    setup("anime-musica-medio", { date: "2026-10-07" });
    const notice = screen.getByText("Não há diário do Anime hoje.");
    expect(document.activeElement).toBe(notice);
    expect(screen.getByRole("link", { name: "Voltar ao Anime" }).getAttribute("href")).toBe(
      "#anime",
    );
  });

  it("o diário do acertar o anime ainda não abre (PR D3): em breve, e de volta ao Anime", () => {
    setup("anime-titulo-facil");
    expect(document.activeElement?.textContent).toBe("Acertar o anime: em breve.");
    expect(screen.getByRole("link", { name: "Voltar ao Anime" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("useAnimeStore", () => {
  /** Serve o catálogo e a agenda do Anime pela URL, com o provedor dado. */
  function fetchFor(
    provider: string,
    fail?: "network" | "version",
  ): FetchLike & { urls: string[] } {
    const urls: string[] = [];
    const ids = (n: number) => (provider === "apple" ? `apple:tr:${n}` : `t:tr:${n}`);
    const tracks = NS.map((n) => ({
      ...track(n),
      id: ids(n),
      preview: {
        url:
          provider === "apple" ? `https://audio-ssl.itunes.apple.com/x/${n}.m4a` : `audio/${n}.wav`,
        durationSec: 30,
        startSec: 0,
      },
    }));
    const fetchFn = async (url: string) => {
      urls.push(url);
      if (fail === "network") throw new TypeError("Failed to fetch");
      const body = url.endsWith("anime/catalog.json")
        ? { ...catalog, provider, tracks, schemaVersion: fail === "version" ? 2 : 1 }
        : url.endsWith("anime/schedule.json")
          ? schedule
          : { results: [] };
      return { ok: true, status: 200, json: async () => body };
    };
    return Object.assign(fetchFn, { urls });
  }

  function budget(): LookupBudget {
    return {
      take: vi.fn(() => true),
      isOpen: () => false,
      succeeded: vi.fn(),
      failed: vi.fn(),
      stop: vi.fn(),
    };
  }

  let current: AnimeStore | null = null;
  function Harness(props: { readonly fetchFn: FetchLike; readonly budget: LookupBudget }) {
    current = useAnimeStore({
      fetchFn: props.fetchFn,
      baseUrl: "http://x.test/",
      dataDir: "fixtures/",
      budget: props.budget,
      resolveUrl,
    });
    return null;
  }
  const flush = () => act(async () => await new Promise((done) => setTimeout(done, 0)));

  it("começa parado e só busca quando pedem; nas fixtures, as prévias do catálogo, na hora", async () => {
    const fetchFn = fetchFor("fixture");
    render(<Harness fetchFn={fetchFn} budget={budget()} />);
    expect(current?.load.status).toBe("idle");
    expect(fetchFn.urls).toEqual([]);
    act(() => current?.request());
    expect(current?.load.status).toBe("loading");
    await flush();
    const load = current?.load;
    if (load?.status !== "ready") throw new Error("o Anime não carregou");
    expect(fetchFn.urls.sort()).toEqual([
      "http://x.test/fixtures/anime/catalog.json",
      "http://x.test/fixtures/anime/schedule.json",
    ]);
    expect(load.resolver.peek("t:tr:1")).toBe("/audio/1.wav");
  });

  it("no Anime real, o lookup da Apple com o orçamento do App (regra 21)", async () => {
    const fetchFn = fetchFor("apple");
    const shared = budget();
    render(<Harness fetchFn={fetchFn} budget={shared} />);
    act(() => current?.request());
    await flush();
    const load = current?.load;
    if (load?.status !== "ready") throw new Error("o Anime não carregou");
    expect(load.resolver.peek("apple:tr:1")).toBeNull(); // ainda não consultou
    await act(async () => {
      await load.resolver.resolve("apple:tr:1");
    });
    expect(shared.take).toHaveBeenCalledTimes(1);
    expect(fetchFn.urls.some((u) => u.startsWith("https://itunes.apple.com/lookup"))).toBe(true);
    // A Apple não trouxe a faixa: vale a reserva do catálogo.
    expect(load.resolver.peek("apple:tr:1")).toBe("https://audio-ssl.itunes.apple.com/x/1.m4a");
  });

  it("falha de rede: tentar de novo; versão desconhecida: atualizar a página", async () => {
    render(<Harness fetchFn={fetchFor("fixture", "network")} budget={budget()} />);
    act(() => current?.request());
    await flush();
    expect(current?.load.status).toBe("retry");
    cleanup();
    render(<Harness fetchFn={fetchFor("fixture", "version")} budget={budget()} />);
    act(() => current?.request());
    await flush();
    expect(current?.load.status).toBe("update");
  });
});
