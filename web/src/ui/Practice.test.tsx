// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import type { PracticeSession } from "../core/practice.ts";
import { emptySave, type Save } from "../core/records.ts";
import type { Album, Artist, Catalog, Day, Track } from "../core/types.ts";
import { catalogResolver } from "../data/previews.ts";
import { Practice } from "./Practice.tsx";

afterEach(cleanup);

// Catálogo mínimo no próprio arquivo (web/CLAUDE.md, regra 14): 4 faixas, cada uma num álbum.
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
  search: { title: [`musica${n}`], artist: [`artista${n}`] },
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
  similar: [1, 2, 3, 4].filter((m) => m !== n).map((m) => `t:al:${m}`),
});
const artist = (n: number): Artist => ({
  id: `t:ar:${n}`,
  name: `Artista ${n}`,
  nameLatin: null,
  latinSource: null,
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
  artists: [artist(1), artist(2), artist(3), artist(4)],
  albums: [album(1), album(2), album(3), album(4)],
  tracks: [track(1), track(2), track(3), track(4)],
};
const index = indexCatalog(catalog);
const DATE = "2026-10-08";

/** Diário de hoje cujas respostas cobrem as 4 músicas: enquanto ele não termina, o Treino fica vazio. */
type Four = [string, string, string, string];
const albums: Four = ["t:al:1", "t:al:2", "t:al:3", "t:al:4"];
const round = (answer: string) => ({ answer, options: albums });
const fullDay: Day = {
  number: 1,
  catalogVersion: "teste",
  song: [{ answer: "t:tr:1" }, { answer: "t:tr:2" }, { answer: "t:tr:3" }],
  album: [round("t:tr:4"), round("t:tr:1"), round("t:tr:2")],
};
const finishedBoth: Save = {
  ...emptySave(),
  history: {
    [`${DATE}|song`]: { number: 1, rounds: [] },
    [`${DATE}|album`]: { number: 1, rounds: [] },
  },
};

type HarnessProps = { readonly save: Save; readonly day: Day | null; readonly show: boolean };

function setup(save: Save = emptySave(), day: Day | null = null) {
  const engine: AudioEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(),
    retain: vi.fn(),
  };
  const resolver = catalogResolver(index, (url) => `/${url}`);
  let latest: PracticeSession | null = null;
  // Faz o papel do App: guarda a sessão fora do Treino (trocar de aba não zera).
  function Harness({ save, day, show }: HarnessProps) {
    const [session, setSession] = useState<PracticeSession | null>(null);
    latest = session;
    if (!show) return null;
    return (
      <Practice
        index={index}
        day={day}
        date={DATE}
        save={save}
        engine={engine}
        resolver={resolver}
        resolveUrl={(url) => `/${url}`}
        announce={vi.fn()}
        session={session}
        onSession={setSession}
      />
    );
  }
  const view = render(<Harness save={save} day={day} show={true} />);
  const rerender = (props: HarnessProps) => view.rerender(<Harness {...props} />);
  const session = () => {
    if (!latest) throw new Error("sessão não começou");
    return latest;
  };
  /** O nome (título) da opção certa da rodada em jogo, para achar o botão. */
  const correctTitle = () => {
    const id = session().game?.rounds[0]?.correctOptionId ?? "";
    const n = id.split(":").at(-1);
    return new RegExp(`^(Música|Álbum) ${n}`);
  };
  return { engine, rerender, session, correctTitle };
}

const score = () => document.querySelector(".practice-score")?.textContent;

describe("Practice (modo Treino)", () => {
  it("abre no Normal, com a rodada 1, o placar zerado e o foco no Tocar", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Treino" })).toBeTruthy();
    expect(screen.getByText("Rodada 1")).toBeTruthy();
    expect(screen.queryByText(/de 3/)).toBeNull();
    expect(score()).toBe("0 pontos em 0 rodadas");
    const group = screen.getByRole("group", { name: "Modo" });
    expect([...group.querySelectorAll("label")].map((l) => l.textContent)).toEqual([
      "Normal",
      "Desafio",
    ]);
    expect(screen.getByText("Vale a partir da próxima rodada.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Normal" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { name: "Qual é o álbum?" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(4);
    expect(document.activeElement?.textContent).toMatch(/^Tocar/);
  });

  it("pré-sorteia a próxima rodada: guarda o áudio da atual e o da próxima", () => {
    const { engine, session } = setup();
    const retain = vi.mocked(engine.retain);
    const kept = retain.mock.calls.at(-1)?.[0] ?? [];
    expect(kept).toHaveLength(2);
    expect(kept[0]).toBe(`/audio/${session().game?.rounds[0]?.trackId.split(":").at(-1)}.wav`);
    expect(kept[1]).not.toBe(kept[0]);
  });

  it("o placar soma, e Próxima rodada traz uma rodada nova", () => {
    const { session, correctTitle } = setup();
    const first = session().game?.rounds[0]?.trackId;
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    expect(score()).toBe("6 pontos em 1 rodada");

    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(session().game?.rounds[0]?.trackId).not.toBe(first);
    expect(score()).toBe("6 pontos em 1 rodada");

    fireEvent.click(screen.getByRole("button", { name: "Não sei" }));
    expect(score()).toBe("6 pontos em 2 rodadas");
  });

  it("rodada anulada (falha de áudio) não conta no placar", async () => {
    const { engine } = setup();
    vi.mocked(engine.play).mockRejectedValue(new Error("sem áudio"));
    fireEvent.click(screen.getByRole("button", { name: /^Tocar/ }));
    const next = await screen.findByRole("button", { name: "Próxima rodada" });
    expect(screen.getByText(/Áudio indisponível/)).toBeTruthy();
    expect(score()).toBe("0 pontos em 0 rodadas");
    fireEvent.click(next);
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(score()).toBe("0 pontos em 0 rodadas");
  });

  it("perder a rodada conta, com 0 pontos", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Não sei" }));
    expect(score()).toBe("0 pontos em 1 rodada");
  });

  it("trocar o modo não interrompe a rodada atual; vale na próxima", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Desafio" }));
    expect((screen.getByRole("radio", { name: "Desafio" }) as HTMLInputElement).checked).toBe(true);
    // A rodada em jogo continua: Normal, 4 opções.
    expect(screen.getByRole("heading", { name: "Qual é o álbum?" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(4);
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Não sei" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Qual é a música?" })).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^(Música|Álbum) \d/ })).toHaveLength(0);
  });

  it("sair da aba e voltar mantém a sessão (rodada e placar)", () => {
    const { rerender, correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    rerender({ save: emptySave(), day: null, show: false });
    expect(screen.queryByText("Treino")).toBeNull();
    rerender({ save: emptySave(), day: null, show: true });
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(score()).toBe("6 pontos em 1 rodada");
  });

  it("sem rodada possível (diário de hoje pendente): aviso com foco; volta quando o diário termina", () => {
    const { rerender } = setup(emptySave(), fullDay);
    const message = screen.getByText(/Não há rodada para sortear agora/);
    expect(document.activeElement).toBe(message);
    expect(screen.queryByText(/^Rodada/)).toBeNull();
    expect(score()).toBe("0 pontos em 0 rodadas");

    // O diário terminou (o App relê o save ao trocar de aba). A rodada sai no clique, e não
    // sozinha: sortear sozinho puxaria o foco de quem está mexendo no modo.
    rerender({ save: finishedBoth, day: fullDay, show: true });
    expect(screen.getByText(/Não há rodada para sortear agora/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sortear de novo" }));
    expect(screen.queryByText(/Não há rodada para sortear agora/)).toBeNull();
    expect(screen.getByText("Rodada 1")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(4);
  });
});
