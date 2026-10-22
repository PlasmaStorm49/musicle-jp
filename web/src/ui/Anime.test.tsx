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
  AnimeFranchise,
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
    themes: [
      { anime: n === 4 ? "Hoshizora Kaizoku 2nd Season" : `Anime ${n}`, type: "OP", sequence: 1 },
    ],
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
/** A franquia de cada faixa; a 4 tem um sinônimo em inglês, como a "Hoshizora Kaizoku" das fixtures. */
const franchise = (n: number): AnimeFranchise =>
  n === 4
    ? { id: "anime:fr:4", name: "Hoshizora Kaizoku", search: ["hoshizorakaizoku", "starrypirates"] }
    : { id: `anime:fr:${n}`, name: `Anime ${n}`, search: [`anime${n}`] };
const NS = [1, 2, 3, 4, 5, 6] as const;
const catalog: AnimeCatalog = {
  schemaVersion: 1,
  catalogVersion: "teste",
  generatedAt: "2026-01-01T00:00:00Z",
  provider: "teste",
  storefront: "jp",
  snapshots: [{ id: "s", fetchedAt: "2026-01-01T00:00:00Z" }],
  // As franquias 7 a 9 não têm faixa: só servem à ajuda do acertar o anime, que evita as do dia.
  franchises: [franchise(1), ...[...NS.slice(1), 7, 8, 9].map(franchise)],
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

  it("os dois modos levam à dificuldade deles, e os créditos ao Sobre (P241)", () => {
    setup("anime");
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#anime-musica",
      "#anime-titulo",
      "#sobre",
    ]);
    const musica = card(/^Acertar a música/);
    expect(lines(musica)).toEqual(["3 diários novos"]);
    expect(musica.textContent).toContain("Digite o nome da música");
    expect(description(musica)).toContain("em até 6 tentativas");
    const titulo = card(/^Acertar o anime/);
    expect(lines(titulo)).toEqual(["3 diários novos"]);
    expect(titulo.textContent).toContain("Digite o nome do anime");
    expect(description(titulo)).toContain("vale qualquer temporada");
    expect(document.querySelector("ul.home-modes")?.classList.contains("single")).toBe(true);
  });

  it("os créditos: as fontes numa linha, o MyAnimeList só em texto (P256), e o link para o Sobre", () => {
    setup("anime");
    const credits = screen.getByRole("link", { name: /^Dados: AnimeThemes/ });
    expect(credits.textContent).toBe(
      "Dados: AnimeThemes, AnisongDB e MyAnimeList · Prévias: Apple Music (sobre e privacidade)",
    );
    expect(credits.closest(".anime-credits")?.querySelector("img")).toBeNull();
    // No pé da tela: depois dos cartões.
    expect(credits.closest(".screen")?.lastElementChild?.contains(credits)).toBe(true);
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
    // O acertar a música terminado: o oliva passa ao acertar o anime.
    expect(nextCards()).toEqual(["Acertar o anime"]);
    cleanup();
    const both = {
      ...all,
      [puzzleId(DATE, "anime-titulo-facil")]: finished,
      [puzzleId(DATE, "anime-titulo-medio")]: finished,
      [puzzleId(DATE, "anime-titulo-dificil")]: finished,
    };
    setup("anime", { save: { ...emptySave(), history: both } });
    expect(nextCards()).toEqual([]);
  });

  it("dia fora da agenda do Anime: os dois modos avisam, sem link", () => {
    setup("anime", { date: "2026-10-07" });
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["#sobre"]);
    expect(offCards()).toEqual([
      { name: "Acertar a música", lines: ["Não há diário hoje"] },
      { name: "Acertar o anime", lines: ["Não há diário hoje"] },
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
      "#sobre",
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
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["#sobre"]);
    expect(offCards().map((c) => c.lines)).toEqual([
      ["Não há diário hoje"],
      ["Não há diário hoje"],
      ["Não há diário hoje"],
    ]);
  });

  it("o acertar o anime: as 3 dificuldades, com a regra do modo para o leitor de tela", () => {
    setup("anime-titulo");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Acertar o anime");
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "#anime-titulo-facil",
      "#anime-titulo-medio",
      "#anime-titulo-dificil",
      "#sobre",
    ]);
    expect(description(card(/^Difícil/))).toBe(
      "Aberturas, encerramentos e insert songs, também de animes pouco conhecidos. Digite o nome do anime, em até 6 tentativas: vale qualquer temporada. 3 rodadas por dia.",
    );
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

  it("o diário do acertar o anime: o cabeçalho, a pergunta do anime e o campo dos nomes de anime", () => {
    setup("anime-titulo-facil");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Anime · Fácil · nº 4");
    const field = screen.getByRole("combobox", { name: "Qual é o anime?" });
    expect(field.getAttribute("placeholder")).toBe("Nome do anime");
    expect(screen.getByText("Título em romaji, em inglês ou em japonês.")).toBeTruthy();
  });

  it("o acertar o anime: a busca acha o anime pelo sinônimo, mostra o nome dele, e o acerto é a franquia", () => {
    setup("anime-titulo-facil");
    const field = screen.getByRole("combobox", { name: "Qual é o anime?" });
    // Um anime errado primeiro: a tentativa mostra o nome do anime, sem artista.
    fireEvent.input(field, { target: { value: "Anime 5" } });
    const wrong = screen.getByRole("option");
    expect(wrong.textContent).toBe("Anime 5");
    fireEvent.click(wrong);
    expect(document.querySelector(".attempt.wrong")?.textContent).toContain("Anime 5");
    // A rodada 1 toca a faixa 4, da Hoshizora Kaizoku: o sinônimo em inglês acha.
    fireEvent.input(field, { target: { value: "Starry Pirates" } });
    const option = screen.getByRole("option");
    expect(option.textContent).toBe("Hoshizora Kaizoku");
    fireEvent.click(option);
    expect(screen.getByRole("heading", { level: 2, name: /^Acertou!/ })).toBeTruthy();
    // A revelação: as tentativas com o nome do anime, e o cartão com a música e o anime (o tema).
    const attempts = [...document.querySelectorAll(".reveal .attempt")].map((a) => a.textContent);
    expect(attempts).toEqual(["Errou: Anime 5", "Acertou: Hoshizora Kaizoku"]);
    const card = document.querySelector(".reveal .card");
    expect(card?.querySelector(".item-title")?.textContent).toBe("Música 4");
    expect(card?.querySelector(".album")?.textContent).toBe(
      "Anime: Hoshizora Kaizoku 2nd Season · OP1",
    );
  });

  it("a ajuda do acertar o anime: 4 nomes de anime, nunca os das respostas do dia, e acertar vale 1 ponto", () => {
    setup("anime-titulo-facil");
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Pedir ajuda" }));
    const options = screen.getByRole("list", { name: "Opções da ajuda" });
    const names = [...options.querySelectorAll(".item-title")].map((n) => n.textContent).sort();
    // A certa (a franquia da faixa 4) e as 3 sem resposta no dia: as do dia ficam de fora.
    expect(names).toEqual(["Anime 7", "Anime 8", "Anime 9", "Hoshizora Kaizoku"]);
    expect(options.querySelector(".item-artist")).toBeNull();
    const right = [...options.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Hoshizora Kaizoku"),
    );
    if (!right) throw new Error("sem a opção certa");
    fireEvent.click(right);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Acertou com ajuda: 1 ponto.",
    );
  });

  it("no acertar a música, a revelação também diz o anime, no lugar do álbum", () => {
    setup("anime-musica-facil");
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    expect(document.querySelector(".reveal .card .album")?.textContent).toBe(
      "Anime: Anime 1 · OP1",
    );
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
