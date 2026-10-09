// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexCatalog } from "../core/catalog.ts";
import { createRounds } from "../core/reducer.ts";
import type { Album, Catalog, Target, Track } from "../core/types.ts";
import { Options } from "./Options.tsx";

afterEach(cleanup);

// Catálogo mínimo no próprio arquivo (web/CLAUDE.md, regra 13).
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
  chart: {
    firstSeen: "2026-01-01",
    lastSeen: "2026-01-01",
    bestRank: n,
    lastRank: n,
    appearances: 1,
    inLatest: true,
  },
  popularity: 0.5,
  eligible: { daily: true, reason: null },
  similar: [],
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
  similar: [],
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

function setup(target: Target) {
  const prefix = target === "song" ? "t:tr:" : "t:al:";
  const options = [1, 2, 3, 4].map((n) => `${prefix}${n}`);
  const [round] = createRounds([{ answer: "t:tr:1", options }], target, index);
  if (!round) throw new Error("rodada não montada");
  const { container } = render(
    <Options
      index={index}
      round={round}
      target={target}
      resolveUrl={(url) => `/base/${url}`}
      onPick={vi.fn()}
      onGiveUp={vi.fn()}
    />,
  );
  return container;
}

describe("Options: capas no alvo Álbum (P51)", () => {
  it("Álbum: cada opção mostra a capa, com alt vazio (o texto ao lado já nomeia)", () => {
    const container = setup("album");
    // alt="" tira a imagem da árvore de acessibilidade: getByRole("img") não a acha.
    const covers = [...container.querySelectorAll("img")];
    expect(covers).toHaveLength(4);
    expect(covers.map((img) => img.getAttribute("src"))).toContain("/base/art/1.svg");
    expect(covers.every((img) => img.getAttribute("alt") === "")).toBe(true);
    expect(screen.getAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(4);
  });

  it("Música: só texto, sem capa", () => {
    const container = setup("song");
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
