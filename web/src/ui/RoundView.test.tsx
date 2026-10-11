// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, AudioUnavailableError, type PlaybackResult } from "../audio/engine.ts";
import { PLAYLIST_URL } from "../core/apple.ts";
import { type CatalogIndex, indexCatalog } from "../core/catalog.ts";
import { createRounds, type GameState, type RoundState } from "../core/reducer.ts";
import type { Album, AnswerMode, Catalog, Target, Track } from "../core/types.ts";
import { catalogResolver, type PreviewResolver } from "../data/previews.ts";
import { RoundView } from "./RoundView.tsx";

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
  similar: [1, 2, 3, 4].filter((m) => m !== n).map((m) => `t:tr:${m}`),
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
  search: [`album${n}`],
});
const catalog: Catalog = {
  schemaVersion: 1,
  catalogVersion: "teste",
  generatedAt: "2026-01-01T00:00:00Z",
  provider: "teste",
  storefront: "jp",
  snapshots: [
    { id: "s", date: "2026-01-01", fetchedAt: "2026-01-01T00:00:00Z", chart: "c", size: 4 },
  ],
  artists: [
    { id: "t:ar:1", name: "Artista", nameLatin: null, latinSource: null, search: ["artista"] },
  ],
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

function game(target: Target, answerMode: AnswerMode, change?: Partial<RoundState>): GameState {
  const options =
    target === "song"
      ? ["t:tr:1", "t:tr:2", "t:tr:3", "t:tr:4"]
      : ["t:al:1", "t:al:2", "t:al:3", "t:al:4"];
  const [round] = createRounds([{ answer: "t:tr:1", options }], target, index);
  if (!round) throw new Error("rodada não montada");
  return { puzzleId: "teste", target, answerMode, rounds: [{ ...round, ...change }], current: 0 };
}

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
  },
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
    setup(game("song", "choice"), resolver);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
  });

  it("faixa sem prévia nenhuma: a rodada é anulada, como numa falha de áudio", async () => {
    const resolver: PreviewResolver = {
      peek: () => null,
      resolve: async () => null, // nem o lookup nem a reserva do catálogo
      prefetch: vi.fn(),
    };
    const { dispatch } = setup(game("song", "choice"), resolver);
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
      },
      resolver,
      resolveUrl: (url: string) => `/${url}`,
      announce: vi.fn(),
      nextLabel: "Próxima rodada",
      onNext: vi.fn(),
    };
    const first = game("song", "choice");
    const second = game("song", "choice", { trackId: "t:tr:2" });
    const { rerender } = render(<RoundView {...props} game={first} roundKey={0} />);
    rerender(<RoundView {...props} game={second} roundKey={1} />);
    await act(async () =>
      deliveries.get("t:tr:1")?.("https://audio-ssl.itunes.apple.com/velha.m4a"),
    );
    expect(screen.getByRole("button", { name: "Carregando…" })).toBeTruthy(); // a nova ainda espera
    expect(props.dispatch).not.toHaveBeenCalled();
  });

  it("parada real: o selo junto do player leva à playlist, nunca à música da rodada (P69)", () => {
    const resolver = catalogResolver(appleIndex, (url) => `/${url}`);
    setup(game("song", "choice"), resolver, appleIndex);
    const badge = screen.getByRole("link", { name: /Ouça no Apple Music/ });
    expect(badge.getAttribute("href")).toBe(PLAYLIST_URL);
    expect(badge.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.querySelector(`a[href="${STORE}"]`)).toBeNull(); // não entrega a resposta
    expect(screen.getByText(/provided courtesy of iTunes/)).toBeTruthy();
  });

  it("parada real: na revelação, o selo leva à música", () => {
    const resolver = catalogResolver(appleIndex, (url) => `/${url}`);
    setup(game("song", "choice", { status: "won" }), resolver, appleIndex);
    const badge = screen.getByRole("link", { name: /Ouça no Apple Music/ });
    expect(badge.getAttribute("href")).toBe(STORE);
  });

  it("parada fictícia: sem selo da Apple", () => {
    setup(game("song", "choice"));
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
    const { engine } = setup(game("song", "choice"), resolver);
    const waiting = screen.getByRole("button", { name: "Carregando…" });
    expect(waiting.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Música 1/ })).toBeTruthy(); // as opções já aparecem
    const url = "https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a";
    await act(async () => deliver(url));
    const play = screen.getByRole("button", { name: "Tocar 1 s" });
    expect(document.activeElement).toBe(play);
    fireEvent.click(play);
    expect(engine.play).toHaveBeenCalledWith(url, 0, 1);
  });

  it("4 opções da Música: pergunta, 4 opções, e escolher despacha o palpite", () => {
    const { dispatch } = setup(game("song", "choice"));
    expect(screen.getByRole("heading", { name: "Qual é a música?" })).toBeTruthy();
    const options = screen.getAllByRole("button", { name: /^Música \d/ });
    expect(options).toHaveLength(4);
    fireEvent.click(options[1] as HTMLElement);
    expect(dispatch).toHaveBeenCalledWith({ type: "GUESS", guessId: "t:tr:2" });
  });

  it("Álbum: a pergunta muda", () => {
    setup(game("album", "choice"));
    expect(screen.getByRole("heading", { name: "Qual é o álbum?" })).toBeTruthy();
  });

  it("digitação: campo com o exemplo do alvo, e Desistir despacha GIVE_UP", () => {
    const { dispatch } = setup(game("album", "typing"));
    const box = screen.getByRole("combobox", { name: "Qual é o álbum?" });
    expect(box.getAttribute("placeholder")).toBe("Nome do álbum ou do artista");
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "GIVE_UP" });
  });

  it("rodada anulada: o foco vai para o botão de seguir, com o texto pedido", () => {
    const { onNext } = setup(game("song", "choice", { status: "void" }));
    const next = screen.getByRole("button", { name: "Próxima rodada" });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("revelação do Álbum: as 4 opções mostram a capa (P51), com alt vazio", () => {
    setup(game("album", "choice", { status: "lost" }));
    const covers = [...document.querySelectorAll(".reveal img.cover")];
    expect(covers).toHaveLength(4);
    expect(covers.every((img) => img.getAttribute("alt") === "")).toBe(true);
  });

  it("revelação: o botão de seguir usa o texto pedido (no Treino, nunca 'Ver resultado')", () => {
    setup(game("song", "choice", { status: "won" }));
    expect(screen.getByRole("button", { name: "Próxima rodada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver resultado" })).toBeNull();
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
      play: vi.fn((_url: string, _offset: number, seconds: number) => {
        let end: (result: PlaybackResult) => void = () => {};
        const done = new Promise<PlaybackResult>((resolve) => (end = resolve));
        ends.push(() => end({ requested: seconds, played: seconds, interrupted: true }));
        return Promise.resolve({ t0: 0, seconds, elapsed: () => 0, done });
      }),
    };
    setup(game("song", "choice", { status: "won" }), undefined, index, engine);
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

  it("falha ao tocar: avisa na tela e no aria-live, em vez de não fazer nada", async () => {
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      stop: vi.fn(),
      retain: vi.fn(),
      play: vi.fn(() => Promise.reject(new AudioUnavailableError("blocked", "fora do gesto"))),
    };
    const { announce } = setup(game("song", "choice", { status: "won" }), undefined, index, engine);
    fireEvent.click(listen());
    expect(await screen.findByText("Não deu para tocar a prévia agora.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Não deu para tocar a prévia agora.");
    expect(listen()).toBeTruthy(); // dá para tentar de novo
  });
});
