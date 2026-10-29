// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import { looseKey, normalize } from "../core/normalize.ts";
import type { QuizDaily } from "../core/quiz.ts";
import { emptySave, type Save } from "../core/records.ts";
import type { Album, Artist, Catalog, Track } from "../core/types.ts";
import { catalogResolver } from "../data/previews.ts";
import { QuizGame } from "./QuizGame.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
const resolveUrl = (url: string) => `/${url}`;

/** O especial do ano (P381): uma rodada só, em que a A é de 2013. */
const special: QuizDaily = {
  id: "2026-10-08|quiz",
  date: "2026-10-08",
  number: 1,
  family: "ano_x",
  direction: "tem",
  param: 2013,
  mal: false,
  rounds: [
    {
      a: "t:tr:1",
      b: "t:tr:2",
      answer: "a",
      info: { years: [2013, 2016] },
    },
  ],
};
/** Um dia comum, o do ano: a mesma rodada, com as temporadas na revelação. */
const regular: QuizDaily = {
  ...special,
  family: "ano",
  direction: "max",
  param: null,
  rounds: special.rounds.map((round) => ({
    ...round,
    info: {
      seasons: [
        { year: 2013, season: "spring" as const },
        { year: 2016, season: "fall" as const },
      ],
    },
  })),
};

/** Um motor que nunca chega a tocar: estes testes não passam do título e do resumo. */
const engine = {
  unlock: vi.fn(),
  preload: vi.fn(),
  retain: vi.fn(),
  setVolume: vi.fn(),
  volume: () => 1,
  stop: vi.fn(),
  play: vi.fn(() => new Promise<never>(() => {})),
} satisfies AudioEngine;

function renderGame(daily: QuizDaily, save: Save = emptySave()) {
  return render(
    <QuizGame
      daily={daily}
      index={index}
      engine={engine}
      resolver={catalogResolver(index, resolveUrl)}
      resolveUrl={resolveUrl}
      announce={vi.fn()}
      store={null}
      initialSave={save}
      onSaved={vi.fn()}
      shareUrl="https://x.test/"
      today={daily.date}
      bonus={null}
    />,
  );
}

describe("QuizGame: o especial da semana (P381; o usuário, 28/10/2026)", () => {
  it("o título leva a etiqueta Especial, com o espaço no nome", () => {
    renderGame(special);
    expect(screen.getByRole("heading", { level: 1, name: "Quiz do dia Especial" })).toBeTruthy();
  });

  it("o dia comum fica sem a etiqueta", () => {
    const { container } = renderGame(regular);
    expect(screen.getByRole("heading", { level: 1, name: "Quiz do dia" })).toBeTruthy();
    expect(container.querySelector(".quiz-special")).toBeNull();
  });

  it("o resumo leva a etiqueta, e o compartilhar diz Especial no cabeçalho", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const save = emptySave();
    const finished: Save = {
      ...save,
      quiz: { ...save.quiz, finished: { [special.id]: { number: 1, results: "w", points: 0 } } },
    };
    renderGame(special, finished);
    expect(screen.getByRole("heading", { level: 1, name: "Quiz do dia Especial" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartilhar resultado" }));
    });
    const text = writeText.mock.calls[0]?.[0] ?? "";
    expect(text.split("\n")[0]).toBe("AteMusic · Quiz do dia · Especial · 08/10");
  });
});
