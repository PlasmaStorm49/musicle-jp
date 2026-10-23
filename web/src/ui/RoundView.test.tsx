// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, AudioUnavailableError, type PlaybackResult } from "../audio/engine.ts";
import { PLAYLIST_URL } from "../core/apple.ts";
import { type CatalogIndex, indexCatalog } from "../core/catalog.ts";
import { createRounds, type GameState, type RoundState, reduce } from "../core/reducer.ts";
import type { Album, Catalog, Target, Track } from "../core/types.ts";
import { catalogResolver, type PreviewResolver } from "../data/previews.ts";
import { type HelpSetup, RoundView } from "./RoundView.tsx";

afterEach(cleanup);

// Catálogo mínimo no próprio arquivo (web/CLAUDE.md, regra 14): 4 faixas, cada uma num álbum.
const track = (n: number): Track => ({
  id: `t:tr:${n}`,
  songKey: `musica${n}|t:ar:1`,
  title: `Música ${n}`,
  titleLatin: null,
  latinSource: null,
  artistIds: ["t:ar:1"],
  artistDisplay: "Artista",
  albumId: `t:al:${n}`,
  releaseDate: "2026-01-01",
  durationMs: 200000,
  explicit: false,
  isrc: null,
  preview: { url: `audio/${n}.wav`, durationSec: 30, startSec: 0 },
  storeUrl: null,
  chart: {
    firstSeen: "2026-01-01",
    lastSeen: "2026-01-01",
    bestRank: n,
    lastRank: n,
    appearances: 1,
    inLatest: true,
  },
  popularity: 1 - n / 10,
  eligible: { daily: true, reason: null },
  search: { title: [`musica${n}`], artist: ["artista"] },
});
const album = (n: number): Album => ({
  id: `t:al:${n}`,
  title: `Álbum ${n}`,
  titleLatin: null,
  latinSource: null,
  artistIds: ["t:ar:1"],
  artistDisplay: "Artista",
  type: "single",
  releaseDate: "2026-01-01",
  artworkUrl: `art/${n}.svg`,
  similar: [1, 2, 3, 4].filter((m) => m !== n).map((m) => `t:al:${m}`),
});
const catalog: Catalog = {
  schemaVersion: 2,
  catalogVersion: "teste",
  generatedAt: "2026-01-01T00:00:00Z",
  provider: "teste",
  storefront: "jp",
  snapshots: [
    { id: "s", date: "2026-01-01", fetchedAt: "2026-01-01T00:00:00Z", chart: "c", size: 4 },
  ],
  artists: [{ id: "t:ar:1", name: "Artista", nameLatin: null, latinSource: null }],
  albums: [album(1), album(2), album(3), album(4)],
  tracks: [track(1), track(2), track(3), track(4)],
};
const index = indexCatalog(catalog);

// A mesma rodada na parada real: a faixa 1 (a resposta) tem link na loja.
const STORE = "https://music.apple.com/jp/album/x/1?i=1";
const appleIndex = indexCatalog({
  ...catalog,
  provider: "apple",
  tracks: catalog.tracks.map((t) =>
    t.id === "t:tr:1" ? { ...t, storeUrl: STORE } : t,
  ) as Catalog["tracks"],
});

/** Uma rodada da faixa 1: no Normal (album), entre os 4 álbuns; no Desafio (song), digitada. */
function game(target: Target, change?: Partial<RoundState>): GameState {
  const options = target === "album" ? ["t:al:1", "t:al:2", "t:al:3", "t:al:4"] : undefined;
  const [round] = createRounds([{ answer: "t:tr:1", options }], target, index);
  if (!round) throw new Error("rodada não montada");
  return { puzzleId: "teste", target, rounds: [{ ...round, ...change }], current: 0 };
}

/** `b` vem depois de `a` na página. */
const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

function setup(
  state: GameState,
  resolver: PreviewResolver = catalogResolver(index, (url) => `/${url}`),
  catalogIndex: CatalogIndex = index,
  engine: AudioEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(),
    retain: vi.fn(),
    setVolume: vi.fn(),
    volume: () => 1,
  },
  help?: HelpSetup,
) {
  const dispatch = vi.fn();
  const onNext = vi.fn();
  const announce = vi.fn();
  render(
    <RoundView
      game={state}
      dispatch={dispatch}
      index={catalogIndex}
      engine={engine}
      resolver={resolver}
      resolveUrl={(url) => `/${url}`}
      announce={announce}
      roundKey={0}
      nextLabel="Próxima rodada"
      onNext={onNext}
      help={help}
    />,
  );
  return { dispatch, onNext, engine, announce };
}

describe("RoundView (a rodada do diário e do Treino)", () => {
  it("a prévia que fica pronta entre a pintura e o efeito também libera o Tocar", async () => {
    // O peek ainda não sabia quando a tela foi desenhada; quando o efeito roda, já sabe.
    const url = "https://audio-ssl.itunes.apple.com/itunes-assets/pronta.m4a";
    let calls = 0;
    const resolver: PreviewResolver = {
      peek: () => (calls++ === 0 ? null : url),
      resolve: async () => url,
      prefetch: vi.fn(),
    };
    setup(game("album"), resolver);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
  });

  it("faixa sem prévia nenhuma: a rodada é anulada, como numa falha de áudio", async () => {
    const resolver: PreviewResolver = {
      peek: () => null,
      resolve: async () => null, // nem o lookup nem a reserva do catálogo
      prefetch: vi.fn(),
    };
    const { dispatch } = setup(game("album"), resolver);
    await act(async () => {});
    expect(dispatch).toHaveBeenCalledWith({ type: "VOID", round: 0, reason: "audio" });
  });

  it("a resposta atrasada da rodada anterior não vale para a rodada nova", async () => {
    const deliveries = new Map<string, (url: string | null) => void>();
    const waiting = new Map<string, Promise<string | null>>();
    const resolver: PreviewResolver = {
      peek: () => null,
      resolve: (id) => {
        const known = waiting.get(id);
        if (known) return known;
        const promise = new Promise<string | null>((resolve) => deliveries.set(id, resolve));
        waiting.set(id, promise);
        return promise;
      },
      prefetch: vi.fn(),
    };
    const props = {
      dispatch: vi.fn(),
      index,
      engine: {
        unlock: vi.fn(),
        preload: vi.fn(),
        play: vi.fn(() => Promise.resolve(null)),
        stop: vi.fn(),
        retain: vi.fn(),
        setVolume: vi.fn(),
        volume: () => 1,
      },
      resolver,
      resolveUrl: (url: string) => `/${url}`,
      announce: vi.fn(),
      nextLabel: "Próxima rodada",
      onNext: vi.fn(),
    };
    const first = game("album");
    const second = game("album", { trackId: "t:tr:2" });
    const { rerender } = render(<RoundView {...props} game={first} roundKey={0} />);
    rerender(<RoundView {...props} game={second} roundKey={1} />);
    await act(async () =>
      deliveries.get("t:tr:1")?.("https://audio-ssl.itunes.apple.com/velha.m4a"),
    );
    expect(screen.getByRole("button", { name: "Carregando…" })).toBeTruthy(); // a nova ainda espera
    expect(props.dispatch).not.toHaveBeenCalled();
  });

  it("parada real: o selo no fim da rodada leva à playlist, nunca à música (P69, P112)", () => {
    const resolver = catalogResolver(appleIndex, (url) => `/${url}`);
    setup(game("album"), resolver, appleIndex);
    const badge = screen.getByRole("link", { name: /Ouça no Apple Music/ });
    // No fim da página (ME58): depois do "Não sei", e nada depois dele.
    expect(follows(screen.getByRole("button", { name: "Não sei" }), badge)).toBe(true);
    expect(badge.closest(".attribution")?.nextElementSibling).toBeNull();
    expect(badge.getAttribute("href")).toBe(PLAYLIST_URL);
    expect(badge.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.querySelector(`a[href="${STORE}"]`)).toBeNull(); // não entrega a resposta
    expect(screen.getByText(/provided courtesy of iTunes/)).toBeTruthy();
  });

  it("parada real: na revelação, o selo no fim leva à música", () => {
    const resolver = catalogResolver(appleIndex, (url) => `/${url}`);
    setup(game("album", { status: "won" }), resolver, appleIndex);
    const badge = screen.getByRole("link", { name: /Ouça no Apple Music/ });
    expect(follows(screen.getByRole("button", { name: "Próxima rodada" }), badge)).toBe(true);
    expect(badge.closest(".attribution")?.nextElementSibling).toBeNull();
    expect(badge.getAttribute("href")).toBe(STORE);
    // Fora da seção e do cartão: o último filho do palco, pregado no pé (PR D3).
    expect(badge.closest(".reveal, .card")).toBeNull();
  });

  it("parada real, Desafio: o selo vem depois do Desistir", () => {
    const resolver = catalogResolver(appleIndex, (url) => `/${url}`);
    setup(game("song"), resolver, appleIndex);
    const badge = screen.getByRole("link", { name: /Ouça no Apple Music/ });
    expect(follows(screen.getByRole("button", { name: "Desistir" }), badge)).toBe(true);
  });

  it("o selo ignora o 2º clique de um toque duplo: no fim, fica onde estava o Próxima rodada", () => {
    const resolver = catalogResolver(appleIndex, (url) => `/${url}`);
    setup(game("album"), resolver, appleIndex);
    const badge = screen.getByRole("link", { name: /Ouça no Apple Music/ });
    // Na bolha, depois do selo: anota se ele barrou o clique e barra todos (o happy-dom abriria
    // a aba de verdade).
    const prevented: boolean[] = [];
    const watch = (event: Event) => {
      prevented.push(event.defaultPrevented);
      event.preventDefault();
    };
    document.addEventListener("click", watch);
    fireEvent.click(badge, { detail: 2 });
    fireEvent.click(badge, { detail: 1 });
    document.removeEventListener("click", watch);
    expect(prevented).toEqual([true, false]);
  });

  it("parada fictícia: sem selo da Apple", () => {
    setup(game("album"));
    expect(screen.queryByRole("link", { name: /Ouça no Apple Music/ })).toBeNull();
    expect(screen.queryByText(/iTunes/)).toBeNull();
  });

  it("parada real: o Tocar espera a prévia, e o foco vai para ele quando ela chega", async () => {
    let deliver: (url: string | null) => void = () => {};
    // Como o resolvedor de verdade: a mesma promessa pendente para quem pedir a mesma faixa.
    const pending = new Promise<string | null>((resolve) => (deliver = resolve));
    const resolver: PreviewResolver = {
      peek: () => null, // força o caminho da espera (o lookup da Apple)
      resolve: () => pending,
      prefetch: vi.fn(),
    };
    const { engine } = setup(game("album"), resolver);
    const waiting = screen.getByRole("button", { name: "Carregando…" });
    // Só aria-disabled (ME37): o navegador não tira o foco dele, e o clique não toca nada.
    expect(waiting.hasAttribute("disabled")).toBe(false);
    expect(waiting.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(waiting);
    expect(engine.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Álbum 1/ })).toBeTruthy(); // as opções já aparecem
    const url = "https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a";
    await act(async () => deliver(url));
    const play = screen.getByRole("button", { name: "Tocar 1 s" });
    expect(document.activeElement).toBe(play);
    fireEvent.click(play);
    expect(engine.play).toHaveBeenCalledWith(url, 0, 1);
  });

  it("Normal: a pergunta do álbum, 4 opções com capa, e escolher despacha o palpite", () => {
    const { dispatch } = setup(game("album"));
    expect(screen.getByRole("heading", { name: "Qual é o álbum?" })).toBeTruthy();
    const options = screen.getAllByRole("button", { name: /^Álbum \d/ });
    expect(options).toHaveLength(4);
    expect(document.querySelectorAll(".options img.cover")).toHaveLength(4);
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(options[1] as HTMLElement);
    expect(dispatch).toHaveBeenCalledWith({ type: "GUESS", guessId: "t:al:2" });
  });

  it("Desafio: campo da música, sem opções, e Desistir despacha GIVE_UP", () => {
    const { dispatch } = setup(game("song"));
    const box = screen.getByRole("combobox", { name: "Qual é a música?" });
    expect(box.getAttribute("placeholder")).toBe("Nome da música ou do artista");
    expect(screen.queryAllByRole("button", { name: /^(Música|Álbum) \d/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "GIVE_UP" });
  });

  it("Desafio: a pergunta e a contagem numa linha, e a altura das tentativas reservada desde o início (regra 25)", () => {
    setup(game("song"));
    const typing = document.querySelector<HTMLElement>("section.typing");
    // As linhas que cabem em jogo (5 das 6 do Desafio: a 6ª encerra a rodada), mesmo antes da
    // 1ª tentativa: o Tocar não anda depois.
    expect(typing?.style.getPropertyValue("--slots")).toBe("5");
    expect(typing?.classList.contains("helping")).toBe(false);
    const row = document.querySelector(".question-row");
    expect(row?.querySelector("h2#question")?.textContent).toBe("Qual é a música?");
    expect(row?.querySelector(".hint")?.textContent).toBe("Tentativa 1 de 6");
    expect(document.querySelector(".attempts-slot")).not.toBeNull();
  });

  it("Desafio: a dica do campo numa linha; as setas e o Enter só para o leitor de tela (P210)", () => {
    setup(game("song"));
    const box = screen.getByRole("combobox", { name: "Qual é a música?" });
    const hint = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe(
      "Título, artista, romaji ou kana. Escolha na lista com as setas e Enter.",
    );
    expect(hint?.querySelector(".sr-only")?.textContent).toBe(
      "Escolha na lista com as setas e Enter.",
    );
  });

  it("parada real, Normal com explícita: a pílula fica na linha da barra, antes do Tocar (P31)", () => {
    // A 1ª faixa é a resposta da rodada (t:tr:1).
    const [first, ...rest] = catalog.tracks;
    const explicit = indexCatalog({ ...catalog, tracks: [{ ...first, explicit: true }, ...rest] });
    setup(game("album"), undefined, explicit);
    const player = document.querySelector("section.player");
    expect(player?.classList.contains("has-explicit")).toBe(true);
    const pill = screen.getByText("Conteúdo explícito");
    expect(follows(pill, screen.getByRole("button", { name: /^(Tocar|Carregando)/ }))).toBe(true);
  });

  it("o título das tentativas fica só para o leitor de tela, na rodada e na revelação", () => {
    setup(game("song", { attempts: [{ kind: "skip" }] }));
    expect(screen.getByRole("heading", { name: "Suas tentativas" }).classList).toContain("sr-only");
    cleanup();
    setup(game("song", { status: "lost", attempts: [{ kind: "skip" }] }));
    expect(screen.getByRole("heading", { name: "Suas tentativas" }).classList).toContain("sr-only");
  });

  it("rodada anulada: o foco vai para o botão de seguir, com o texto pedido", () => {
    const { onNext } = setup(game("album", { status: "void" }));
    const next = screen.getByRole("button", { name: "Próxima rodada" });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("revelação do Normal: o X no resultado; a certa com o ✓ e a escolhida com o X, com o texto para o leitor de tela (P206)", () => {
    setup(
      game("album", {
        status: "lost",
        attempts: [{ kind: "guess", guessId: "t:al:2", correct: false }],
      }),
    );
    const result = screen.getByRole("heading", { name: "Não foi dessa vez." });
    expect(result.querySelector('svg.icon-wrong[aria-hidden="true"]')).not.toBeNull();
    const correct = document.querySelector(".options.done li.correct");
    expect(correct?.querySelector('svg.icon-right[aria-hidden="true"]')).not.toBeNull();
    expect(correct?.querySelector(".sr-only")?.textContent).toBe("Resposta certa");
    const wrong = document.querySelector(".options.done li.wrong");
    expect(wrong?.querySelector('svg.icon-wrong[aria-hidden="true"]')).not.toBeNull();
    expect(wrong?.querySelector(".sr-only")?.textContent).toBe("Sua escolha");
    // As outras duas, sem ícone nem texto, e nenhuma etiqueta visível.
    expect(document.querySelectorAll(".options.done li svg")).toHaveLength(2);
    expect(document.querySelector(".options.done .tag")).toBeNull();
  });

  it("revelação do Normal: as 4 opções mostram a capa (P51), com alt vazio", () => {
    setup(game("album", { status: "lost" }));
    const covers = [...document.querySelectorAll(".reveal img.cover")];
    expect(covers).toHaveLength(4);
    expect(covers.every((img) => img.getAttribute("alt") === "")).toBe(true);
  });

  it("revelação do Desafio: as tentativas, sem a lista de opções", () => {
    setup(game("song", { status: "lost", attempts: [{ kind: "skip" }] }));
    expect(document.querySelector(".reveal .options")).toBeNull();
    expect(document.querySelectorAll(".reveal .attempt")).toHaveLength(1);
    expect(document.querySelectorAll(".reveal .card img")).toHaveLength(1); // a capa da resposta
  });

  it("as tentativas com os ícones do designer: X errou, chevron pulou, ✓ acertou; sem emoji (P196, P197)", () => {
    setup(
      game("song", {
        status: "won",
        stage: 2,
        attempts: [
          { kind: "guess", guessId: "t:tr:2", correct: false },
          { kind: "skip" },
          { kind: "guess", guessId: "t:tr:1", correct: true },
        ],
      }),
    );
    const rows = [...document.querySelectorAll(".attempt")];
    expect(rows.map((row) => row.querySelector("svg.icon")?.getAttribute("class"))).toEqual([
      "icon icon-wrong",
      "icon icon-next",
      "icon icon-right",
    ]);
    expect(
      rows.every((row) => row.querySelector("svg")?.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
    // O leitor de tela ouve o que houve; o desenho fica de fora.
    expect(
      rows.map((row) => row.querySelector(".sr-only")?.textContent ?? row.textContent?.trim()),
    ).toEqual(["Errou:", "Pulou", "Acertou:"]);
    expect(document.querySelector(".attempt-list")?.textContent).not.toMatch(/[✅❌⬛]/u);
  });

  it("revelação: o botão de seguir usa o texto pedido (no Treino, nunca 'Ver resultado')", () => {
    setup(game("album", { status: "won" }));
    expect(screen.getByRole("button", { name: "Próxima rodada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver resultado" })).toBeNull();
  });

  // O Preact redesenha antes do 2º clique de um toque duplo, que cai no botão da tela nova: em
  // "Próxima rodada", ele caía no "Não sei" da rodada seguinte e a gastava (ME43).
  it.each([
    ["revelação", { status: "won" } as const],
    ["rodada anulada", { status: "void" } as const],
  ])("%s: o 2º clique de um toque duplo em Próxima rodada é ignorado", (_, change) => {
    const { onNext } = setup(game("album", change));
    const next = screen.getByRole("button", { name: "Próxima rodada" });
    fireEvent.click(next, { detail: 2 });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(next, { detail: 1 });
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("Desafio: o 2º clique de um toque duplo no Desistir é ignorado", () => {
    const { dispatch } = setup(game("song"));
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }), { detail: 2 });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("RoundView: a ajuda (P149)", () => {
  const daily: HelpSetup = { avoid: new Set() };
  const skipped = (n: number) => {
    let state = game("song");
    for (let i = 0; i < n; i++) state = reduce(state, { type: "SKIP" });
    return state;
  };
  const helpButton = () => screen.queryByRole("button", { name: /^Pedir ajuda/ });

  it("no diário, o botão aparece depois da 1ª tentativa gasta (ME107; antes, a 3ª)", () => {
    setup(skipped(0), undefined, undefined, undefined, daily);
    expect(helpButton()).toBeNull();
    cleanup();
    setup(skipped(1), undefined, undefined, undefined, daily);
    expect(helpButton()?.textContent).toBe("Pedir ajuda");
  });

  it("sem a ajuda (Normal ou sem a prop), nunca há botão", () => {
    setup(skipped(5));
    expect(helpButton()).toBeNull();
  });

  it("o pulo que libera a ajuda avisa no aria-live", () => {
    const { announce } = setup(skipped(0), undefined, undefined, undefined, daily);
    fireEvent.click(screen.getByRole("button", { name: /^Pular/ }));
    expect(announce).toHaveBeenCalledWith("Pulou. Tentativa 2 de 6. A ajuda já pode ser pedida.");
  });

  it("pedir a ajuda despacha as opções, com a resposta entre elas", () => {
    const { dispatch } = setup(skipped(1), undefined, undefined, undefined, daily);
    fireEvent.click(helpButton() as HTMLElement);
    const event = dispatch.mock.calls.at(-1)?.[0];
    expect(event?.type).toBe("HELP");
    expect(event?.options).toContain("t:tr:1");
    expect(event?.options).toHaveLength(4);
  });

  it("com a ajuda na tela, o Pular continua e anuncia o trecho novo, sem o contador (P163)", () => {
    const { dispatch } = setup(skipped(1), undefined, undefined, undefined, daily);
    fireEvent.click(helpButton() as HTMLElement);
    const event = dispatch.mock.calls.at(-1)?.[0];
    if (event?.type !== "HELP") throw new Error("esperava o HELP");
    cleanup();
    const { announce } = setup(reduce(skipped(1), event), undefined, undefined, undefined, daily);
    expect(screen.getByRole("list", { name: "Opções da ajuda" })).toBeTruthy();
    // A dica curta na tela; a inteira, que a lista lê como descrição, para o leitor de tela. A
    // ajuda vale a metade do trecho de agora, o 2º (8 pontos): 4 (ME107).
    const hint = document.getElementById("help-hint");
    expect(hint?.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "Errar encerra; acertar vale 4 pontos.",
    );
    expect(hint?.querySelector(".sr-only")?.textContent).toBe(
      "Escolha entre as opções: errar encerra a rodada, e acertar vale 4 pontos.",
    );
    // Com as opções no lugar do campo, a reserva das tentativas sai (a tela cabe, regra 25).
    expect(document.querySelector("section.typing")?.classList.contains("helping")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pular (+2 s)" }));
    expect(announce).toHaveBeenCalledWith("Pulou. O trecho agora tem 4 s.");
  });
});

describe("revelação: a prévia inteira", () => {
  const listen = () => screen.getByRole("button", { name: "Ouvir a prévia inteira" });

  it("um botão só alterna Ouvir e Parar, e o fim da reprodução parada não o desfaz", async () => {
    const ends: Array<() => void> = [];
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      stop: vi.fn(),
      retain: vi.fn(),
      setVolume: vi.fn(),
      volume: () => 1,
      play: vi.fn((_url: string, _offset: number, seconds: number) => {
        let end: (result: PlaybackResult) => void = () => {};
        const done = new Promise<PlaybackResult>((resolve) => (end = resolve));
        ends.push(() => end({ requested: seconds, played: seconds, interrupted: true }));
        return Promise.resolve({ t0: 0, seconds, elapsed: () => 0, done });
      }),
    };
    setup(game("album", { status: "won" }), undefined, index, engine);
    fireEvent.click(listen());
    await act(async () => {});
    expect(engine.play).toHaveBeenCalledWith("/audio/1.wav", 0, 30);
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(engine.stop).toHaveBeenCalled();
    fireEvent.click(listen()); // de novo, antes do fim da 1ª chegar
    await act(async () => {});
    await act(async () => ends[0]?.()); // o fim da 1ª, parada, chega com a 2ª tocando
    expect(screen.getByRole("button", { name: "Parar" })).toBeTruthy();
    await act(async () => ends[1]?.());
    expect(listen()).toBeTruthy();
  });

  it("a barra da prévia leva ao ponto dela (P224) e toca dali até o fim", async () => {
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      stop: vi.fn(),
      retain: vi.fn(),
      setVolume: vi.fn(),
      volume: () => 1,
      play: vi.fn(() => Promise.resolve(null)),
    };
    setup(game("album", { status: "won" }), undefined, index, engine);
    const slider = screen.getByRole("slider", { name: "Ponto da prévia" });
    expect(slider.getAttribute("aria-valuetext")).toBe("Segundo 0 de 30");
    const bar = slider.querySelector<HTMLElement>(".bar");
    if (!bar) throw new Error("sem a barra");
    bar.getBoundingClientRect = () => ({ left: 0, width: 300 }) as DOMRect;
    fireEvent.click(slider, { clientX: 150, detail: 1 }); // a metade: o segundo 15
    await act(async () => {});
    expect(engine.play).toHaveBeenCalledWith("/audio/1.wav", 15, 15);
  });

  it("no Carregando… o botão já é Parar, e o som que chega depois não volta a tocar", async () => {
    let deliver: (playback: null) => void = () => {};
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      stop: vi.fn(),
      retain: vi.fn(),
      setVolume: vi.fn(),
      volume: () => 1,
      play: vi.fn(() => new Promise<null>((resolve) => (deliver = resolve))),
    };
    setup(game("album", { status: "won" }), undefined, index, engine);
    fireEvent.click(listen());
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Parar" })); // antes de o som começar
    expect(engine.stop).toHaveBeenCalled();
    await act(async () => deliver(null));
    expect(listen()).toBeTruthy();
    fireEvent.click(listen(), { detail: 2 }); // toque duplo: o 2º clique não para o 1º
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it("falha ao tocar: avisa na tela e no aria-live, em vez de não fazer nada", async () => {
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      stop: vi.fn(),
      retain: vi.fn(),
      setVolume: vi.fn(),
      volume: () => 1,
      play: vi.fn(() => Promise.reject(new AudioUnavailableError("blocked", "fora do gesto"))),
    };
    const { announce } = setup(game("album", { status: "won" }), undefined, index, engine);
    fireEvent.click(listen());
    expect(await screen.findByText("Não deu para tocar a prévia agora.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Não deu para tocar a prévia agora.");
    expect(listen()).toBeTruthy(); // dá para tentar de novo
  });
});
