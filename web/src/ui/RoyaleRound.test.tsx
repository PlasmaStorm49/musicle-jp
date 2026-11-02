// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useReducer } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, AudioUnavailableError, type PlaybackResult } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  createRoyaleGame,
  isRoyaleFinished,
  ROYALE_GAP_SEC,
  ROYALE_SAMPLE_SEC,
  type RoyaleDaily,
  type RoyaleState,
  royaleReducer,
} from "../core/royale.ts";
import { RoyaleRoundView } from "./RoyaleRound.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PLAYED = ["x:tr:1", "x:tr:2", "x:tr:3", "x:tr:4", "x:tr:5"];
const OPTIONS = [
  "x:tr:6",
  "x:tr:1",
  "x:tr:7",
  "x:tr:2",
  "x:tr:3",
  "x:tr:8",
  "x:tr:4",
  "x:tr:9",
  "x:tr:5",
];
const URLS = PLAYED.map((id) => `https://audio.test/${id}.m4a`);
const daily: RoyaleDaily = {
  key: "anime-royale-facil",
  id: "2026-11-02|anime-royale-facil",
  date: "2026-11-02",
  number: 1,
  tier: "facil",
  played: PLAYED,
  options: OPTIONS,
};

/** Só o que a rodada lê do índice: o provedor, a duração da prévia e o 1º tema de cada faixa. */
const index = {
  catalog: { provider: "fixture" },
  tracks: new Map(OPTIONS.map((id) => [id, { preview: { durationSec: 30 } }])),
  anime: {
    themesByTrack: new Map(
      OPTIONS.map((id) => {
        const n = id.slice(-1);
        const cover = {
          small: `anime/small-cover/anime_${n}.svg`,
          large: `anime/large-cover/anime_${n}.svg`,
        };
        return [id, [{ anime: `Anime ${n}`, cover, type: n === "2" ? "ED" : "OP", sequence: 1 }]];
      }),
    ),
  },
} as unknown as CatalogIndex;

/** O motor falso: guarda cada pedido e o termina quando o teste manda; o `fail` falha o pedido `failAt`. */
function royaleEngine(fail?: AudioUnavailableError, failAt?: number) {
  let calls = 0;
  const plays: {
    url: string;
    offset: number;
    seconds: number;
    finish: (r: PlaybackResult) => void;
  }[] = [];
  const engine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    retain: vi.fn(),
    setVolume: vi.fn(),
    volume: () => 1,
    stop: vi.fn(() => {
      for (const p of plays) p.finish({ requested: p.seconds, played: 0, interrupted: true });
    }),
    play: vi.fn(async (url: string, offset: number, seconds: number) => {
      const call = calls++;
      if (fail && call === failAt) throw fail;
      let finish: (result: PlaybackResult) => void = () => {};
      const done = new Promise<PlaybackResult>((resolve) => {
        finish = resolve;
      });
      plays.push({ url, offset, seconds, finish });
      return { t0: 0, seconds, elapsed: () => 0, done };
    }),
  } satisfies AudioEngine;
  return { engine, plays };
}

function Harness({
  engine,
  urls = URLS,
  resolved = URLS.map(() => true),
  announce = () => {},
  onState,
}: {
  readonly engine: AudioEngine;
  readonly urls?: readonly (string | null)[];
  readonly resolved?: readonly boolean[];
  readonly announce?: (message: string) => void;
  readonly onState?: (state: RoyaleState) => void;
}) {
  const [state, dispatch] = useReducer(royaleReducer, daily, createRoyaleGame);
  onState?.(state);
  return (
    <RoyaleRoundView
      daily={daily}
      state={state}
      dispatch={dispatch}
      index={index}
      engine={engine}
      urls={urls}
      resolved={resolved}
      resolveUrl={(url) => url}
      announce={announce}
    />
  );
}

/** Termina o trecho que toca e deixa as promessas andarem. */
async function finish(plays: ReturnType<typeof royaleEngine>["plays"], at: number) {
  await act(async () => {
    plays[at]?.finish({
      requested: ROYALE_SAMPLE_SEC,
      played: ROYALE_SAMPLE_SEC,
      interrupted: false,
    });
  });
}

describe("a rodada do Anime Royale (o usuário, 01/11/2026)", () => {
  it("o Tocar toca os 5 trechos de 8 s em sequência, com a pausa entre eles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { engine, plays } = royaleEngine();
    render(<Harness engine={engine} />);
    const play = screen.getByRole("button", { name: "Tocar as 5" });
    await act(async () => {
      fireEvent.click(play);
    });
    expect(plays.map((p) => [p.url, p.seconds])).toEqual([[URLS[0], ROYALE_SAMPLE_SEC]]);
    expect(play.textContent).toBe("Parar");
    for (let at = 0; at < 4; at++) {
      await finish(plays, at);
      // A pausa: o seguinte só entra depois dela.
      expect(plays).toHaveLength(at + 1);
      await act(async () => {
        vi.advanceTimersByTime(ROYALE_GAP_SEC * 1000);
      });
      expect(plays).toHaveLength(at + 2);
    }
    expect(plays.map((p) => p.url)).toEqual(URLS);
    await finish(plays, 4);
    expect(play.textContent).toBe("Tocar as 5");
  });

  it("cada parte da barra toca daquele trecho até o fim, e o Parar corta a sequência", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { engine, plays } = royaleEngine();
    render(<Harness engine={engine} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tocar do trecho 4 até o fim" }));
    });
    expect(plays.map((p) => p.url)).toEqual([URLS[3]]);
    await finish(plays, 0);
    await act(async () => {
      vi.advanceTimersByTime(ROYALE_GAP_SEC * 1000);
    });
    expect(plays.map((p) => p.url)).toEqual([URLS[3], URLS[4]]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    });
    expect(engine.stop).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(plays).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Tocar as 5" })).toBeTruthy();
  });

  it("o som barrado fora do gesto (o <audio> de reserva): o próximo Tocar começa por ele", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { engine, plays } = royaleEngine(new AudioUnavailableError("blocked", "teste"), 1);
    render(<Harness engine={engine} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tocar as 5" }));
    });
    await finish(plays, 0);
    await act(async () => {
      vi.advanceTimersByTime(ROYALE_GAP_SEC * 1000);
    });
    // A recusa passa por duas promessas (o play e o then) antes do catch.
    await act(async () => {});
    const resume = screen.getByRole("button", { name: "Continuar do trecho 2" });
    await act(async () => {
      fireEvent.click(resume);
    });
    expect(engine.play.mock.calls.at(-1)?.[0]).toBe(URLS[1]);
  });

  it("sem as 5 prévias, o Tocar espera, e o clique não toca", async () => {
    const { engine } = royaleEngine();
    render(
      <Harness
        engine={engine}
        urls={[...URLS.slice(0, 4), null]}
        resolved={[true, true, true, true, false]}
      />,
    );
    const play = screen.getByRole("button", { name: "Carregando…" });
    expect(play.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(play);
    });
    expect(engine.play).not.toHaveBeenCalled();
    expect(screen.queryByText(/Não foi possível carregar as músicas/)).toBeNull();
  });

  it("uma das 5 sem prévia nenhuma: o aviso na tela, e o Tocar não toca", () => {
    const { engine } = royaleEngine();
    render(<Harness engine={engine} urls={[...URLS.slice(0, 4), null]} />);
    expect(
      screen.getByText("Não foi possível carregar as músicas desta dificuldade. Tente mais tarde."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Carregando…" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("o foco vai ao Tocar ao montar, e a falha de áudio aparece na tela até o próximo Tocar", async () => {
    const { engine } = royaleEngine(new AudioUnavailableError("decode", "teste"), 0);
    render(<Harness engine={engine} />);
    const play = screen.getByRole("button", { name: "Tocar as 5" });
    expect(document.activeElement).toBe(play);
    await act(async () => {
      fireEvent.click(play);
    });
    await act(async () => {});
    expect(screen.getByText("Não foi possível tocar. Tente de novo.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(play);
    });
    expect(screen.queryByText("Não foi possível tocar. Tente de novo.")).toBeNull();
  });

  it("o pop-up leva o foco ao Marcar e, ao fechar, devolve à capa; o 2º clique de um toque duplo não abre outra", async () => {
    const { engine } = royaleEngine();
    render(<Harness engine={engine} />);
    const cover = screen.getByRole("button", { name: "Anime 6, Opening 1" });
    await act(async () => {
      fireEvent.click(cover, { detail: 2 });
    });
    expect(document.querySelector("dialog.royale-dialog")).toBeNull();
    await act(async () => {
      fireEvent.click(cover);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Marcar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    expect(document.querySelector("dialog.royale-dialog")).toBeNull();
    expect(document.activeElement).toBe(cover);
  });

  it("a capa abre o pop-up com o anime e o tema; o Marcar vale na hora, e o 1º erro encerra", async () => {
    const { engine } = royaleEngine();
    const said: string[] = [];
    let state: RoyaleState | null = null;
    render(<Harness engine={engine} announce={(m) => said.push(m)} onState={(s) => (state = s)} />);
    const covers = screen.getAllByRole("button", { name: /^Anime \d, / });
    expect(covers).toHaveLength(9);
    expect(screen.getByText("Toque numa capa para ver o anime e o tema, e marcar.")).toBeTruthy();
    // Uma capa certa: o pop-up mostra o anime e o tema, sem a música nem o artista.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anime 2, Ending 1" }));
    });
    const dialog = document.querySelector("dialog.royale-dialog");
    expect(dialog?.querySelector("h2")?.textContent).toBe("Anime 2");
    expect(dialog?.textContent).toContain("Ending 1");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Marcar" }));
    });
    expect(document.querySelector("dialog.royale-dialog")).toBeNull();
    expect(said.at(-1)).toBe("Tocou! Faltam 4.");
    expect(screen.getByRole("button", { name: "Anime 2, Ending 1 (marcada, tocou)" })).toBeTruthy();
    // A marcada abre o pop-up de novo, sem o Marcar.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Anime 2,/ }));
    });
    expect(screen.queryByRole("button", { name: "Marcar" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    // Uma errada: a dificuldade acaba.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anime 7, Opening 1" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Marcar" }));
    });
    expect(said.at(-1)).toBe("Não tocou: a dificuldade acabou.");
    expect(state && isRoyaleFinished(state)).toBe(true);
  });

  it("o Desistir encerra a dificuldade", async () => {
    const { engine } = royaleEngine();
    let state: RoyaleState | null = null;
    render(<Harness engine={engine} onState={(s) => (state = s)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desistir da dificuldade" }));
    });
    expect(state && isRoyaleFinished(state)).toBe(true);
  });
});
