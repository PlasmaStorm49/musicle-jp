// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AudioEngine,
  AudioUnavailableError,
  type ChainEngine,
  type PlaybackResult,
} from "../audio/engine.ts";
import { indexArtist } from "../core/catalog.ts";
import { searchKey } from "../core/normalize.ts";
import {
  drawSetlistRound,
  SETLIST_FINAL,
  type SetlistRun,
  setlistPool,
  setlistStep,
  startSetlist,
} from "../core/setlist.ts";
import type { ArtistAlbum, ArtistCatalog, ArtistListEntry, ArtistTrack } from "../core/types.ts";
import { catalogResolver } from "../data/previews.ts";
import { SetlistView } from "./Setlist.tsx";

afterEach(cleanup);

// Dados no próprio arquivo (web/CLAUDE.md, regra 14): um artista de 14 músicas.
const WHO = { id: "t:ar:1", name: "夜風", nameLatin: "Yokaze", latinSource: "provider" } as const;

function song(n: number): ArtistTrack {
  return {
    id: `t:tr:${n}`,
    songKey: `musica${n}|${WHO.id}`,
    title: `Música ${n}`,
    titleLatin: null,
    latinSource: null,
    artistIds: [WHO.id],
    artistDisplay: WHO.name,
    albumId: `t:al:${n}`,
    releaseDate: "2026-01-01",
    durationMs: 200000,
    explicit: false,
    preview: { url: `audio/${n}.wav`, durationSec: 30, startSec: 0 },
    storeUrl: null,
    popularity: 1 - n / 100,
    eligible: { daily: true, reason: null },
    search: { title: [searchKey(`Música ${n}`)], artist: [] },
    titleKeys: [`musica ${n}`],
  };
}

const NUMBERS = Array.from({ length: 14 }, (_, i) => i + 1);
const FILE: ArtistCatalog = {
  schemaVersion: 1,
  provider: "teste",
  storefront: "jp",
  artistId: WHO.id,
  fetchedAt: "2026-01-01T00:00:00Z",
  artists: [WHO],
  // O schema pede ao menos um: as listas montadas vão como a tupla dele.
  albums: NUMBERS.map(
    (n): ArtistAlbum => ({
      id: `t:al:${n}`,
      title: `Single ${n}`,
      titleLatin: null,
      latinSource: null,
      artistIds: [WHO.id],
      artistDisplay: WHO.name,
      type: "single",
      releaseDate: "2026-01-01",
      artworkUrl: null,
    }),
  ) as ArtistCatalog["albums"],
  tracks: NUMBERS.map(song) as ArtistCatalog["tracks"],
};
const INDEX = indexArtist(FILE);
const POOL = setlistPool(INDEX, new Set());
const RESOLVER = catalogResolver(INDEX, (url) => url);
const ENTRY = {
  id: WHO.id,
  name: WHO.name,
  nameLatin: WHO.nameLatin,
  file: "1.json",
  songs: 14,
  artworkUrl: null,
  medals: { names: {} },
} as unknown as ArtistListEntry;

/**
 * Um motor que toca a sequência e espera: o teste diz quando ela acaba (`end`), quando é
 * interrompida (`hide`, a aba oculta) ou que ela falha (`fail`).
 */
function chainEngine() {
  let finish: (result: PlaybackResult) => void = () => {};
  let failure: AudioUnavailableError | null = null;
  const playChain = vi.fn<ChainEngine["playChain"]>(async (tracks) => {
    if (failure) throw failure;
    const seconds = Math.max(...tracks.map((t) => t.at + t.seconds));
    const done = new Promise<PlaybackResult>((resolve) => {
      finish = resolve;
    });
    return { t0: 0, seconds, elapsed: () => 0, done };
  });
  const engine: AudioEngine & ChainEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    retain: vi.fn(),
    setVolume: vi.fn(),
    volume: () => 1,
    playChain,
  };
  return {
    engine,
    playChain,
    end: () => act(() => finish({ requested: 4.5, played: 4.5, interrupted: false })),
    hide: () => act(() => finish({ requested: 4.5, played: 1, interrupted: true })),
    fail: (kind: "blocked" | "decode" | "network") => {
      failure = new AudioUnavailableError(kind, kind);
    },
  };
}

function setup(initial: SetlistRun = startSetlist(1, POOL)) {
  const audio = chainEngine();
  const announce = vi.fn();
  const onSwitch = vi.fn();
  const state = { run: initial };
  function Harness() {
    const [run, setRun] = useState(initial);
    state.run = run;
    return (
      <SetlistView
        artist={ENTRY}
        run={run}
        pool={POOL}
        before={null}
        index={INDEX}
        resolver={RESOLVER}
        engine={audio.engine}
        announce={announce}
        onChange={(change) => setRun((r) => change(r))}
        onAgain={vi.fn()}
        onSwitch={onSwitch}
      />
    );
  }
  render(<Harness />);
  return { ...audio, announce, onSwitch, state };
}

const playButton = () => screen.getByRole("button", { name: /Tocar|Tocando|Carregando/ });
const options = () => screen.queryByRole("list", { name: "As opções" });
const optionFor = (id: string) => {
  const title = INDEX.tracks.get(id)?.title ?? "";
  return screen.getByRole("button", { name: new RegExp(`^${title}\\b`) });
};

describe("SetlistView: ouvir uma vez só", () => {
  it("o Tocar vale uma vez: a sequência emendada toca, e as opções só aparecem no fim", async () => {
    const { playChain, end } = setup();
    expect(screen.getByText("Rodada 1 de 10")).toBeTruthy();
    expect(screen.getByText("Vidas: 3")).toBeTruthy();
    expect(options()).toBeNull();
    fireEvent.click(playButton());
    await waitFor(() => expect(playButton().textContent).toBe("Tocando…"));
    expect(playButton().getAttribute("aria-disabled")).toBe("true");
    // A 1ª rodada: 2 músicas, 4,5 s cada uma no total, a 2ª entrando em 1,5 s.
    const tracks = playChain.mock.calls[0]?.[0] ?? [];
    expect(tracks.map((t) => [t.at, t.seconds])).toEqual([
      [0, 3],
      [1.5, 3],
    ]);
    fireEvent.click(playButton());
    expect(playChain).toHaveBeenCalledTimes(1);
    end();
    await waitFor(() => expect(options()).not.toBeNull());
    expect(screen.getAllByRole("button", { name: /^Música/ })).toHaveLength(3);
    expect(screen.getByText("Quais tocaram? Faltam 2 músicas.")).toBeTruthy();
  });

  it("cada toque vale na hora; o erro gasta uma vida, e a rodada só passa quando acha todas", async () => {
    const { end, state, announce } = setup();
    fireEvent.click(playButton());
    await waitFor(() => expect(playButton().textContent).toBe("Tocando…"));
    end();
    await waitFor(() => expect(options()).not.toBeNull());
    const round = state.run.round;
    if (!round) throw new Error("sem rodada");
    const [first, second] = round.played;
    const wrong = round.options.find((id) => !round.played.includes(id)) ?? "";
    fireEvent.click(optionFor(first ?? ""));
    expect(announce).toHaveBeenLastCalledWith("Tocou.");
    expect(optionFor(first ?? "").closest("li")?.className).toBe("correct");
    // O erro não fecha a rodada (o usuário, 01/11/2026): falta a 2ª música.
    fireEvent.click(optionFor(wrong));
    await waitFor(() => expect(screen.getByText("Vidas: 2")).toBeTruthy());
    expect(announce).toHaveBeenLastCalledWith("Não tocou. Sobram 2 vidas.");
    expect(optionFor(wrong).closest("li")?.className).toBe("wrong");
    expect(screen.getByText("Quais tocaram? Falta 1 música.")).toBeTruthy();
    fireEvent.click(optionFor(second ?? ""));
    await waitFor(() =>
      expect(screen.getByText("Achou 2 de 2. Perdeu 1 vida nesta rodada.")).toBeTruthy(),
    );
    expect(optionFor(second ?? "").textContent).toContain("2ª");
    expect(document.activeElement?.className).toBe("setlist-result");
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    await waitFor(() => expect(screen.getByText("Rodada 2 de 10")).toBeTruthy());
  });

  it("a última vida no meio da rodada: a revelação mostra as que faltaram, na ordem", async () => {
    const { end, state } = setup({ ...startSetlist(1, POOL), lives: 1 });
    fireEvent.click(playButton());
    await waitFor(() => expect(playButton().textContent).toBe("Tocando…"));
    end();
    await waitFor(() => expect(options()).not.toBeNull());
    const round = state.run.round;
    if (!round) throw new Error("sem rodada");
    const wrong = round.options.find((id) => !round.played.includes(id)) ?? "";
    fireEvent.click(optionFor(wrong));
    await waitFor(() =>
      expect(screen.getByText("Achou 0 de 2. As 3 vidas acabaram.")).toBeTruthy(),
    );
    for (const [i, id] of round.played.entries()) {
      expect(optionFor(id).closest("li")?.className).toBe("missed");
      expect(optionFor(id).textContent).toContain(`${i + 1}ª`);
    }
    fireEvent.click(screen.getByRole("button", { name: "Ver resultado" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Fim da setlist" })).toBeTruthy(),
    );
  });

  it("a sequência interrompida (a aba oculta) sorteia a rodada de novo, sem custo", async () => {
    const { hide, state, announce } = setup();
    const before = state.run.round;
    fireEvent.click(playButton());
    await waitFor(() => expect(state.run.started).toBe(true));
    hide();
    await waitFor(() => expect(state.run.round?.attempt).toBe(1));
    // Nenhuma música da sequência cortada volta, nem como opção.
    expect(state.run.round?.options.filter((id) => before?.played.includes(id))).toEqual([]);
    expect(state.run).toMatchObject({ started: false, lives: 3 });
    expect(announce).toHaveBeenCalledWith(
      "A sequência parou no meio. A rodada foi sorteada de novo, sem custo.",
    );
    await waitFor(() => expect(playButton().textContent).toBe("Tocar"));
  });

  it("o som barrado fora do gesto devolve o Tocar, sem gastar a vez", async () => {
    const { fail, state, playChain } = setup();
    fail("blocked");
    fireEvent.click(playButton());
    await waitFor(() => expect(playChain).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(playButton().textContent).toBe("Tocar"));
    expect(state.run.started).toBe(false);
  });

  it("sem o Web Audio (decode), o aviso e a volta à lista", async () => {
    const { fail, onSwitch } = setup();
    fail("decode");
    fireEvent.click(playButton());
    await waitFor(() => expect(screen.getByText(/não toca as prévias emendadas/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Trocar de artista" }));
    expect(onSwitch).toHaveBeenCalled();
  });
  it("a falha de rede antes de tocar sorteia a rodada de novo, com o aviso de que nada tocou", async () => {
    const { fail, state, announce } = setup();
    fail("network");
    fireEvent.click(playButton());
    await waitFor(() => expect(state.run.round?.attempt).toBe(1));
    expect(state.run.started).toBe(false);
    expect(announce).toHaveBeenCalledWith("A rodada foi sorteada de novo, sem custo.");
  });

  it("a rodada que já tocava quando a pessoa saiu da aba é sorteada de novo na volta", async () => {
    const started = setlistStep(startSetlist(1, POOL), { type: "PLAYED" });
    const { state } = setup(started);
    await waitFor(() => expect(state.run.round?.attempt).toBe(1));
    expect(state.run.started).toBe(false);
    await waitFor(() => expect(playButton().textContent).toBe("Tocar"));
  });

  it("o motor sem a sequência emendada (o <audio> de reserva): o aviso, sem tocar", async () => {
    const { engine, playChain } = setup();
    // O motor composto sempre tem o playChain; um motor só de <audio> não tem.
    Object.assign(engine, { playChain: undefined });
    fireEvent.click(playButton());
    await waitFor(() => expect(screen.getByText(/não toca as prévias emendadas/)).toBeTruthy());
    expect(playChain).not.toHaveBeenCalled();
  });
});

describe("SetlistView: a setlist completa", () => {
  /** A run com todas as rodadas certas até a 10ª, na tela da setlist completa. */
  function completed(): SetlistRun {
    let run = startSetlist(3, POOL);
    for (let n = 1; n <= SETLIST_FINAL; n += 1) {
      run = setlistStep(setlistStep(run, { type: "PLAYED" }), { type: "HEARD" });
      for (const id of run.round?.played ?? []) run = setlistStep(run, { type: "PICK", id });
      const next = n < SETLIST_FINAL ? drawSetlistRound(POOL, n + 1, run.plays, run.seed) : null;
      run = setlistStep(run, { type: "NEXT", round: next });
    }
    return run;
  }

  it("diz que acabou e oferece o sem fim, na dificuldade da 10ª", async () => {
    const initial = completed();
    expect(initial.phase).toBe("complete");
    const { state } = setup(initial);
    expect(screen.getByRole("heading", { name: "Setlist completa!" })).toBeTruthy();
    expect(screen.getByText("10 rodadas completas, 44 músicas achadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar sem fim" }));
    await waitFor(() => expect(screen.getByText("Rodada 11 · sem fim")).toBeTruthy());
    // O artista de 14 músicas: 12 opções e 8 que tocam, como na 10ª.
    expect(state.run.round?.options).toHaveLength(12);
    expect(state.run.round?.played).toHaveLength(8);
  });
});
