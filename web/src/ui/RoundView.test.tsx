// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import { createRounds, type GameState, type RoundState } from "../core/reducer.ts";
import type { Album, AnswerMode, Catalog, Target, Track } from "../core/types.ts";
import { RoundView } from "./RoundView.tsx";

afterEach(cleanup);

// Catálogo mínimo no próprio arquivo (web/CLAUDE.md, regra 13): 4 faixas, cada uma num álbum.
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

function game(target: Target, answerMode: AnswerMode, change?: Partial<RoundState>): GameState {
  const options =
    target === "song"
      ? ["t:tr:1", "t:tr:2", "t:tr:3", "t:tr:4"]
      : ["t:al:1", "t:al:2", "t:al:3", "t:al:4"];
  const [round] = createRounds([{ answer: "t:tr:1", options }], target, index);
  if (!round) throw new Error("rodada não montada");
  return { puzzleId: "teste", target, answerMode, rounds: [{ ...round, ...change }], current: 0 };
}

function setup(state: GameState) {
  const engine: AudioEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(),
    retain: vi.fn(),
  };
  const dispatch = vi.fn();
  const onNext = vi.fn();
  render(
    <RoundView
      game={state}
      dispatch={dispatch}
      index={index}
      engine={engine}
      resolveUrl={(url) => `/${url}`}
      announce={vi.fn()}
      roundKey={0}
      nextLabel="Próxima rodada"
      onNext={onNext}
    />,
  );
  return { dispatch, onNext };
}

describe("RoundView (a rodada do diário e do Treino)", () => {
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
