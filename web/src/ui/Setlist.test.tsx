// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AudioEngine,
  AudioUnavailableError,
  type ChainEngine,
  type Playback,
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

  it("na revelação, o Ouvir de novo toca a mesma sequência e alterna com o Parar (o usuário, 02/11/2026)", async () => {
    const { end, state, playChain, engine } = setup();
    fireEvent.click(playButton());
    await waitFor(() => expect(playButton().textContent).toBe("Tocando…"));
    end();
    await waitFor(() => expect(options()).not.toBeNull());
    for (const id of state.run.round?.played ?? []) fireEvent.click(optionFor(id));
    await waitFor(() => expect(screen.getByText("Achou 2 de 2.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ouvir de novo" }));
    await waitFor(() => expect(playChain).toHaveBeenCalledTimes(2));
    // As mesmas músicas, nos mesmos pontos e nos mesmos instantes.
    expect(playChain.mock.calls[1]?.[0]).toEqual(playChain.mock.calls[0]?.[0]);
    const stop = await screen.findByRole("button", { name: "Parar" });
    fireEvent.click(stop);
    expect(engine.stop).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ouvir de novo" })).toBeTruthy());
    // Durante os toques, continua uma vez só: o Ouvir de novo só existe na revelação.
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    await waitFor(() => expect(screen.getByText("Rodada 2 de 10")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Ouvir de novo" })).toBeNull();
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

describe("SetlistView: as ajudas, o Espiar e o Bis (o usuário, 02/11/2026)", () => {
  /** A tela na escolha da 1ª rodada: tocada e ouvida até o fim. */
  async function picking() {
    const setlist = setup();
    fireEvent.click(playButton());
    await waitFor(() => expect(playButton().textContent).toBe("Tocando…"));
    setlist.end();
    await waitFor(() => expect(options()).not.toBeNull());
    return setlist;
  }
  const peekButton = () => screen.getByRole("button", { name: /^Espiar/ });
  const encoreButton = () => screen.getByRole("button", { name: /^Bis/ });
  const tip = (id: string) => document.getElementById(`${id}-tip`);

  it("só na escolha, com o contador e o tooltip como descrição; o Esc fecha o tooltip", async () => {
    const { end } = setup();
    expect(screen.queryByRole("button", { name: /^Espiar/ })).toBeNull();
    fireEvent.click(playButton());
    await waitFor(() => expect(playButton().textContent).toBe("Tocando…"));
    expect(screen.queryByRole("button", { name: /^Bis/ })).toBeNull();
    // A escolha: os dois, com 1 cada.
    end();
    await waitFor(() => expect(options()).not.toBeNull());
    expect(peekButton().getAttribute("aria-describedby")).toBe("setlist-peek-tip");
    expect(tip("setlist-peek")?.textContent).toBe(
      "Espiar: revela uma das músicas que tocaram. Uma por run.",
    );
    expect(tip("setlist-encore")?.getAttribute("role")).toBe("tooltip");
    expect(peekButton().textContent).toBe("1");
    expect(encoreButton().textContent).toBe("1");
    const wrap = peekButton().parentElement;
    // Os ouvintes do Esc e do mouse saem de um efeito, que o Preact roda depois da pintura: o
    // foco na 1ª opção, efeito da mesma tela, diz que eles já estão lá.
    await waitFor(() =>
      expect(document.activeElement?.classList.contains("setlist-option")).toBe(true),
    );
    // O Esc fecha só o tooltip à vista (o do foco): o do Bis fica como está.
    peekButton().focus();
    fireEvent.keyDown(peekButton(), { key: "Escape" });
    await waitFor(() => expect(wrap?.className).toBe("help-wrap tip-closed"));
    expect(encoreButton().parentElement?.className).toBe("help-wrap");
    fireEvent.mouseLeave(wrap as HTMLElement);
    await waitFor(() => expect(wrap?.className).toBe("help-wrap"));
  });

  it("o Espiar revela uma das que tocaram, com o olho, conta como achada e fica gasto", async () => {
    const { state, announce } = await picking();
    fireEvent.click(peekButton());
    const id = state.run.peeked ?? "";
    expect(state.run.round?.played).toContain(id);
    expect(state.run.helps.peek).toBe(true);
    expect(announce).toHaveBeenLastCalledWith(`Espiou: ${INDEX.tracks.get(id)?.title}.`);
    await waitFor(() => expect(optionFor(id).closest("li")?.className).toBe("peeked"));
    expect(optionFor(id).querySelector(".icon-eye")).not.toBeNull();
    expect(screen.getByText("Quais tocaram? Falta 1 música.")).toBeTruthy();
    expect(peekButton().getAttribute("aria-label")).toBe("Espiar, já usada");
    expect(peekButton().getAttribute("aria-disabled")).toBe("true");
    expect(peekButton().textContent).toBe("0");
    expect(tip("setlist-peek")?.textContent).toBe("Já usada nesta run.");
    // A outra fecha a rodada; a revelação mantém o olho, com a ordem em que ela tocou.
    const other = state.run.round?.played.find((p) => p !== id) ?? "";
    fireEvent.click(optionFor(other));
    await waitFor(() => expect(screen.getByText("Achou 2 de 2.")).toBeTruthy());
    expect(optionFor(id).closest("li")?.className).toBe("peeked");
    expect(optionFor(id).textContent).toMatch(/ª/);
  });

  it("o Bis toca a mesma sequência, gasta quando o som começa, e as opções continuam valendo", async () => {
    const { state, playChain, end, announce } = await picking();
    fireEvent.click(encoreButton());
    await waitFor(() => expect(encoreButton().getAttribute("aria-label")).toBe("Bis, tocando…"));
    expect(playChain).toHaveBeenCalledTimes(2);
    expect(playChain.mock.calls[1]?.[0]).toEqual(playChain.mock.calls[0]?.[0]);
    expect(state.run.helps.encore).toBe(true);
    expect(encoreButton().textContent).toBe("0");
    // Tocando, o toque vale na hora.
    fireEvent.click(optionFor(state.run.round?.played[0] ?? ""));
    expect(announce).toHaveBeenLastCalledWith("Tocou.");
    end();
    await waitFor(() => expect(encoreButton().getAttribute("aria-label")).toBe("Bis, já usada"));
    fireEvent.click(encoreButton());
    expect(playChain).toHaveBeenCalledTimes(2);
  });

  it("a falha antes do som devolve o Bis, com o aviso", async () => {
    const { state, playChain, fail, announce } = await picking();
    fail("network");
    fireEvent.click(encoreButton());
    await waitFor(() => expect(playChain).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(encoreButton().getAttribute("aria-label")).toBe("Bis"));
    expect(announce).toHaveBeenLastCalledWith("O Bis não tocou. A ajuda continua com você.");
    expect(state.run.helps.encore).toBe(false);
    expect(encoreButton().getAttribute("aria-disabled")).toBeNull();
    expect(encoreButton().textContent).toBe("1");
  });

  it("a rodada que fecha com o Bis tocando para o som; a que fecha com ele carregando não o gasta", async () => {
    // Tocando: a última que faltava fecha a rodada, e o motor para.
    const playing = await picking();
    fireEvent.click(encoreButton());
    await waitFor(() => expect(encoreButton().getAttribute("aria-label")).toBe("Bis, tocando…"));
    const stops = vi.mocked(playing.engine.stop).mock.calls.length;
    for (const id of playing.state.run.round?.played ?? []) fireEvent.click(optionFor(id));
    await waitFor(() => expect(screen.getByText("Achou 2 de 2.")).toBeTruthy());
    expect(vi.mocked(playing.engine.stop).mock.calls.length).toBeGreaterThan(stops);
    cleanup();
    // Carregando: o som que chegaria depois do fim da rodada não gasta a ajuda.
    const loading = await picking();
    let start: (playback: Playback) => void = () => {};
    loading.playChain.mockImplementationOnce(
      () =>
        new Promise<Playback>((resolve) => {
          start = resolve;
        }),
    );
    fireEvent.click(encoreButton());
    await waitFor(() => expect(encoreButton().getAttribute("aria-label")).toBe("Bis, carregando…"));
    for (const id of loading.state.run.round?.played ?? []) fireEvent.click(optionFor(id));
    await waitFor(() => expect(screen.getByText("Achou 2 de 2.")).toBeTruthy());
    await act(() =>
      start({ t0: 0, seconds: 1, elapsed: () => 0, done: new Promise<PlaybackResult>(() => {}) }),
    );
    expect(loading.state.run.helps.encore).toBe(false);
  });
});
