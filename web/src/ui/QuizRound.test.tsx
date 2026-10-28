// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useReducer } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, AudioUnavailableError, type PlaybackResult } from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import { looseKey, normalize } from "../core/normalize.ts";
import { createQuizGame, type QuizDaily, type QuizState, quizReducer } from "../core/quiz.ts";
import type { Album, Artist, Catalog, Track } from "../core/types.ts";
import { QuizRoundView } from "./QuizRound.tsx";

afterEach(cleanup);

// Catálogo mínimo no próprio arquivo (web/CLAUDE.md, regra 14): 2 faixas, cada uma num álbum.
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
    { id: "s", date: "2026-01-01", fetchedAt: "2026-01-01T00:00:00Z", chart: "c", size: 2 },
  ],
  artists: [artist(1), artist(2)],
  albums: [album(1), album(2)],
  tracks: [track(1), track(2)],
};
const index = indexCatalog(catalog);

/** Uma rodada só: a A (faixa 1) é a mais recente. */
const daily: QuizDaily = {
  id: "2026-10-08|quiz",
  date: "2026-10-08",
  number: 1,
  family: "ano",
  direction: "max",
  param: null,
  mal: false,
  rounds: [
    {
      a: "t:tr:1",
      b: "t:tr:2",
      answer: "a",
      info: {
        seasons: [
          { year: 2020, season: "spring" as const },
          { year: 2010, season: "fall" as const },
        ],
      },
    },
  ],
};
const URLS = ["audio/1.wav", "audio/2.wav"];

/** Um motor em que cada reprodução acaba quando o teste manda (`finish`), ou no Parar. */
function quizEngine(fail?: AudioUnavailableError) {
  const plays: {
    url: string;
    seconds: number;
    finish: (result: PlaybackResult) => void;
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
    play: vi.fn(async (url: string, _offset: number, seconds: number) => {
      if (fail) throw fail;
      let finish: (result: PlaybackResult) => void = () => {};
      const done = new Promise<PlaybackResult>((resolve) => {
        finish = resolve;
      });
      plays.push({ url, seconds, finish });
      return { t0: 0, seconds, elapsed: () => 0, done };
    }),
  } satisfies AudioEngine;
  return { engine, plays };
}

/** Três rodadas iguais à do `daily`, para chegar à última vida. */
const daily3: QuizDaily = {
  ...daily,
  rounds: [daily.rounds[0], daily.rounds[0], daily.rounds[0]].filter((r) => r !== undefined),
};

function Harness({
  engine,
  urls = URLS,
  resolved = [true, true],
  announce = () => {},
  quiz = daily,
  start,
}: {
  readonly engine: AudioEngine;
  readonly urls?: readonly (string | null)[];
  readonly resolved?: readonly boolean[];
  readonly announce?: (message: string) => void;
  readonly quiz?: QuizDaily;
  /** O jogo de partida; sem ele, o jogo novo do `quiz`. */
  readonly start?: QuizState;
}) {
  const [game, dispatch] = useReducer(quizReducer, start ?? createQuizGame(quiz, index));
  return (
    <QuizRoundView
      daily={quiz}
      game={game}
      dispatch={dispatch}
      index={index}
      engine={engine}
      urls={urls}
      resolved={resolved}
      resolveUrl={(url) => `/${url}`}
      announce={announce}
      onNext={() => {}}
    />
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

/** A reprodução `n` acaba sozinha (o fim do trecho). */
async function ends(plays: ReturnType<typeof quizEngine>["plays"], n: number) {
  await act(async () => {
    const p = plays[n];
    p?.finish({ requested: p.seconds, played: p.seconds, interrupted: false });
  });
}

describe("QuizRoundView (M18)", () => {
  it("o Tocar toca a A e, só quando ela acaba sozinha, a B (P384)", async () => {
    const { engine, plays } = quizEngine();
    render(<Harness engine={engine} />);
    await click("Tocar 3 s");
    expect(plays.map((p) => [p.url, p.seconds])).toEqual([["audio/1.wav", 3]]);
    await ends(plays, 0);
    expect(plays.map((p) => [p.url, p.seconds])).toEqual([
      ["audio/1.wav", 3],
      ["audio/2.wav", 3],
    ]);
    await ends(plays, 1);
    expect(plays).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Tocar 3 s" })).not.toBeNull();
  });

  it("o Parar no meio da A não deixa a B começar", async () => {
    const { engine, plays } = quizEngine();
    render(<Harness engine={engine} />);
    await click("Tocar 3 s");
    await click("Parar");
    expect(engine.stop).toHaveBeenCalled();
    expect(plays).toHaveLength(1);
  });

  it("escolher para o som, sem a B, e mostra a revelação", async () => {
    const { engine, plays } = quizEngine();
    render(<Harness engine={engine} />);
    await click("Tocar 3 s");
    await click("Escolher a A");
    expect(plays).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Acertou!" })).not.toBeNull();
    expect(screen.getByText("Primavera de 2020 (abr. a jun.)")).not.toBeNull();
  });

  it("no acerto, a outra música fica neutra: sem o fundo e sem o X (o usuário, 27/10/2026)", async () => {
    const { engine } = quizEngine();
    render(<Harness engine={engine} />);
    await click("Escolher a A");
    const [a, b] = document.querySelectorAll(".mixed-songs > li");
    expect(a?.className).toBe("right");
    expect(a?.querySelector("svg.icon-right")).not.toBeNull();
    expect(b?.className).toBe("");
    expect(b?.querySelector("svg")).toBeNull();
    // O nome da música fica no texto, para o leitor de tela; sem "Resposta" nem "Sua escolha".
    expect(b?.querySelector(".mixed-note")?.textContent).toBe("Música B");
  });

  it("no erro, a escolha leva o X e o vermelho, e a resposta o ✓", async () => {
    const { engine } = quizEngine();
    render(<Harness engine={engine} />);
    await click("Escolher a B");
    const [a, b] = document.querySelectorAll(".mixed-songs > li");
    expect(a?.className).toBe("right");
    expect(a?.querySelector("svg.icon-right")).not.toBeNull();
    expect(b?.className).toBe("wrong");
    expect(b?.querySelector("svg.icon-wrong")).not.toBeNull();
  });

  it("o 2º erro diz 'Última vida', e não 'Vidas: 0' (P377; o usuário, 27/10/2026)", async () => {
    const { engine } = quizEngine();
    const once = quizReducer(createQuizGame(daily3, index), {
      type: "CHOOSE",
      round: 0,
      side: "b",
    });
    render(<Harness engine={engine} quiz={daily3} start={quizReducer(once, { type: "NEXT" })} />);
    await click("Escolher a B");
    expect(screen.getByRole("heading", { name: "Errou. Última vida." })).not.toBeNull();
  });

  it("o 3º erro encerra: 'Errou: fim da run.', e não 'Última vida' (P377)", async () => {
    const { engine } = quizEngine();
    let start = createQuizGame(daily3, index);
    for (const round of [0, 1]) {
      start = quizReducer(start, { type: "CHOOSE", round, side: "b" });
      start = quizReducer(start, { type: "NEXT" });
    }
    render(<Harness engine={engine} quiz={daily3} start={start} />);
    await click("Escolher a B");
    expect(screen.getByRole("heading", { name: "Errou: fim da run." })).not.toBeNull();
  });

  it("o Ouvir mais abre o trecho de 7 s e toca a A de novo", async () => {
    const { engine, plays } = quizEngine();
    render(<Harness engine={engine} />);
    await click("Ouvir mais (+4 s)");
    expect(plays.map((p) => [p.url, p.seconds])).toEqual([["audio/1.wav", 7]]);
  });

  it("a falha de áudio anula a rodada, com o aviso; o som barrado volta ao Tocar", async () => {
    const announce = vi.fn();
    const failing = quizEngine(new AudioUnavailableError("decode", "teste"));
    render(<Harness engine={failing.engine} announce={announce} />);
    await click("Tocar 3 s");
    expect(screen.getByText(/^Rodada anulada/)).not.toBeNull();
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^Rodada anulada/));
    cleanup();
    const blocked = quizEngine(new AudioUnavailableError("blocked", "teste"));
    render(<Harness engine={blocked.engine} />);
    await click("Tocar 3 s");
    expect(screen.queryByText(/^Rodada anulada/)).toBeNull();
    expect(screen.getByRole("button", { name: "Tocar 3 s" })).not.toBeNull();
  });

  it("uma música sem prévia nenhuma anula a rodada; a que ainda busca, não (regra 21)", async () => {
    const { engine } = quizEngine();
    const waiting = render(
      <Harness engine={engine} urls={[null, URLS[1] ?? ""]} resolved={[false, true]} />,
    );
    expect(screen.queryByText(/^Rodada anulada/)).toBeNull();
    expect(screen.getByRole("button", { name: "Carregando…" })).not.toBeNull();
    waiting.unmount();
    render(<Harness engine={engine} urls={[null, URLS[1] ?? ""]} resolved={[true, true]} />);
    expect(screen.getByText(/^Rodada anulada/)).not.toBeNull();
  });
});
