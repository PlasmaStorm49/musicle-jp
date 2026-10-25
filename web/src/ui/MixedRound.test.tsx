// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useReducer } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AudioEngine,
  AudioUnavailableError,
  type MixEngine,
  type PlaybackResult,
} from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import { createMixedGame, type MixedDaily, mixedReducer } from "../core/mixed.ts";
import { looseKey, normalize } from "../core/normalize.ts";
import type { Album, Artist, Catalog, Track } from "../core/types.ts";
import { MixedRoundView } from "./MixedRound.tsx";

afterEach(cleanup);

// Catálogo mínimo no próprio arquivo (web/CLAUDE.md, regra 14): 3 faixas, cada uma num álbum.
const track = (n: number): Track => ({
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
  // As chaves como as do pipeline: a busca dobra o romaji ("si" vira "shi").
  search: {
    title: [looseKey(normalize(`Música ${n}`))],
    artist: [looseKey(normalize(`Artista ${n}`))],
  },
});
const artist = (n: number): Artist => ({
  id: `t:ar:${n}`,
  name: `Artista ${n}`,
  nameLatin: null,
  latinSource: null,
});
const album = (n: number): Album => ({
  id: `t:al:${n}`,
  title: `Álbum ${n}`,
  titleLatin: null,
  latinSource: null,
  artistIds: [`t:ar:${n}`],
  artistDisplay: `Artista ${n}`,
  type: "single",
  releaseDate: "2026-01-01",
  artworkUrl: `art/${n}.svg`,
  similar: [],
});
const catalog: Catalog = {
  schemaVersion: 2,
  catalogVersion: "teste",
  generatedAt: "2026-01-01T00:00:00Z",
  provider: "teste",
  storefront: "jp",
  snapshots: [
    { id: "s", date: "2026-01-01", fetchedAt: "2026-01-01T00:00:00Z", chart: "c", size: 3 },
  ],
  artists: [artist(1), artist(2), artist(3)],
  albums: [album(1), album(2), album(3)],
  tracks: [track(1), track(2), track(3)],
};
const index = indexCatalog(catalog);

/** Uma rodada só: as faixas 1 e 2 tocando juntas. */
const daily: MixedDaily = {
  key: "misturadas-musica",
  id: "2026-10-08|misturadas-musica",
  date: "2026-10-08",
  number: 1,
  mode: "musica",
  answer: "track",
  rounds: [["t:tr:1", "t:tr:2"]],
};
const URLS = ["audio/1.wav", "audio/2.wav"];

/** Um motor que mistura: a mistura toca até o Parar, que a encerra, como no Web Audio. */
function mixEngine() {
  let finish: (result: PlaybackResult) => void = () => {};
  const playback = {
    t0: 0,
    seconds: 4,
    elapsed: () => 0,
    done: new Promise<PlaybackResult>((resolve) => {
      finish = resolve;
    }),
    setGain: vi.fn(),
    setPan: vi.fn(),
  };
  const engine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(() => finish({ requested: 4, played: 1, interrupted: true })),
    retain: vi.fn(),
    setVolume: vi.fn(),
    volume: () => 1,
    playMix: vi.fn(async () => playback),
  } satisfies AudioEngine & MixEngine;
  return { engine, playback };
}

function Harness({
  engine,
  urls = URLS,
  announce,
}: {
  readonly engine: AudioEngine;
  readonly urls?: readonly (string | null)[];
  readonly announce: (message: string) => void;
}) {
  const [game, dispatch] = useReducer(mixedReducer, createMixedGame(daily, index));
  return (
    <MixedRoundView
      game={game}
      dispatch={dispatch}
      index={index}
      engine={engine}
      urls={urls}
      resolved={urls.map(() => true)}
      resolveUrl={(url) => `/${url}`}
      announce={announce}
      nextLabel="Ver resultado"
      onNext={() => {}}
    />
  );
}

/** Digita o título e escolhe a sugestão. */
function guess(title: string) {
  const box = screen.getByRole("combobox", { name: "Quais são as músicas?" });
  fireEvent.input(box, { target: { value: title } });
  const option = screen.queryAllByRole("option").find((o) => o.textContent?.includes(title));
  if (!option) throw new Error(`sem a sugestão ${title}`);
  fireEvent.click(option);
}

async function playMix() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Tocar 4 s" }));
  });
}

describe("MixedRoundView (M17)", () => {
  it("toca as duas juntas, no centro, com o volume igualado e o limitador", async () => {
    const { engine } = mixEngine();
    render(<Harness engine={engine} announce={vi.fn()} />);
    await playMix();
    expect(engine.playMix).toHaveBeenCalledWith(
      [
        { url: "audio/1.wav", offset: 0, pan: 0 },
        { url: "audio/2.wav", offset: 0, pan: 0 },
      ],
      4,
      { normalize: true, limit: true, from: 0 },
    );
    expect(screen.getByRole("button", { name: "Parar" })).toBeTruthy();
  });

  it("a música achada continua na mistura tocando, e o som continua (o usuário, 24/10/2026)", async () => {
    const { engine, playback } = mixEngine();
    const announce = vi.fn();
    render(<Harness engine={engine} announce={announce} />);
    await playMix();
    guess("Música 2");
    // Só o "Separar" ajuda: a achada não sai nem abaixa.
    expect(playback.setGain).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith("Achou: Música 2. Falta 1.");
    expect(screen.getByText("1 de 2 achadas")).toBeTruthy();
  });

  it("o erro para o som e libera o trecho seguinte", async () => {
    const { engine } = mixEngine();
    const announce = vi.fn();
    render(<Harness engine={engine} announce={announce} />);
    await playMix();
    guess("Música 3");
    // O Parar do motor encerra a mistura: o fim dela chega numa microtarefa.
    await act(async () => {});
    expect(engine.stop).toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith("Errou: Música 3. Trecho de 8 s liberado.");
    expect(screen.getByRole("button", { name: "Tocar 8 s" })).toBeTruthy();
  });

  it("o Separar leva cada uma ao seu lado, já tocando, e fica pressionado", async () => {
    const { engine, playback } = mixEngine();
    render(<Harness engine={engine} announce={vi.fn()} />);
    await playMix();
    const separate = screen.getByRole("button", { name: "Ajuda: separar L e R" });
    expect(separate.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(separate);
    expect(playback.setPan).toHaveBeenCalledWith(0, -0.8);
    expect(playback.setPan).toHaveBeenCalledWith(1, 0.8);
    // O mesmo nome, pressionado (o ✓ é só desenho).
    const pressed = screen.getByRole("button", { name: "Ajuda: separar L e R" });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    // A dica diz o custo; o botão, não (regra 8).
    expect(pressed.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("a barra leva a mistura ao ponto do liberado, também depois do Separar (P224)", async () => {
    const { engine } = mixEngine();
    render(<Harness engine={engine} announce={vi.fn()} />);
    await playMix();
    fireEvent.click(screen.getByRole("button", { name: "Ajuda: separar L e R" }));
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("slider", { name: "Ponto do trecho" }), {
        key: "ArrowRight",
      });
    });
    // O trecho inteiro de 4 s, que o motor iguala, e o som do segundo 1, cada uma no seu lado.
    expect(engine.playMix).toHaveBeenLastCalledWith(
      [
        { url: "audio/1.wav", offset: 0, pan: -0.8 },
        { url: "audio/2.wav", offset: 0, pan: 0.8 },
      ],
      4,
      { normalize: true, limit: true, from: 1 },
    );
    expect(screen.getByRole("button", { name: "Parar" })).toBeTruthy();
  });

  it("o Separar no Carregando… vale quando a mistura começa, e a achada continua nela", async () => {
    const { engine, playback } = mixEngine();
    let start: (value: typeof playback) => void = () => {};
    engine.playMix.mockImplementation(
      () =>
        new Promise((resolve) => {
          start = resolve;
        }),
    );
    render(<Harness engine={engine} announce={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar 4 s" }));
    guess("Música 1");
    fireEvent.click(screen.getByRole("button", { name: "Ajuda: separar L e R" }));
    expect(playback.setPan).not.toHaveBeenCalled();
    await act(async () => start(playback));
    expect(playback.setGain).not.toHaveBeenCalled();
    expect(playback.setPan).toHaveBeenCalledWith(0, -0.8);
    expect(playback.setPan).toHaveBeenCalledWith(1, 0.8);
  });

  it("o palpite que não muda nada não para o som", async () => {
    const { engine } = mixEngine();
    render(<Harness engine={engine} announce={vi.fn()} />);
    await playMix();
    guess("Música 1");
    // A mesma música de novo: na lista, ela aparece como já tentada, e o clique não faz nada.
    const box = screen.getByRole("combobox", { name: "Quais são as músicas?" });
    fireEvent.input(box, { target: { value: "Música 1" } });
    const option = screen.queryAllByRole("option").find((o) => o.textContent?.includes("Música 1"));
    expect(option?.textContent).toContain("já tentou");
    if (option) fireEvent.click(option);
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it("desmontar com a mistura tocando para o som", async () => {
    const { engine } = mixEngine();
    const view = render(<Harness engine={engine} announce={vi.fn()} />);
    await playMix();
    view.unmount();
    expect(engine.stop).toHaveBeenCalled();
  });

  it("o som barrado fora do gesto (blocked) volta ao Tocar, sem anular a rodada", async () => {
    const { engine } = mixEngine();
    engine.playMix.mockRejectedValueOnce(new AudioUnavailableError("blocked", "blocked"));
    const announce = vi.fn();
    render(<Harness engine={engine} announce={announce} />);
    await playMix();
    expect(screen.getByRole("button", { name: "Tocar 4 s" })).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
    expect(screen.queryByText(/anulada/)).toBeNull();
  });

  it("achar todas abre a revelação, com o foco no resultado", async () => {
    const { engine } = mixEngine();
    render(<Harness engine={engine} announce={vi.fn()} />);
    await playMix();
    guess("Música 1");
    guess("Música 2");
    const result = screen.getByRole("heading", { name: "Achou todas! 10 de 10 pontos." });
    expect(document.activeElement).toBe(result);
    expect(screen.getAllByText("achada no trecho de 4 s")).toHaveLength(2);
  });

  it("o navegador que não mistura (o <audio> de reserva) anula a rodada, com o aviso", async () => {
    const { engine } = mixEngine();
    const { playMix: _none, ...single } = engine;
    const announce = vi.fn();
    render(<Harness engine={single} announce={announce} />);
    await playMix();
    const text = "Este navegador não toca as prévias juntas: esta rodada foi anulada e não conta.";
    expect(screen.getByText(text)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(text);
  });

  it("uma música sem prévia nenhuma anula a rodada", () => {
    const { engine } = mixEngine();
    render(<Harness engine={engine} urls={["audio/1.wav", null]} announce={vi.fn()} />);
    expect(
      screen.getByText("Áudio indisponível: esta rodada foi anulada e não conta."),
    ).toBeTruthy();
  });
});
