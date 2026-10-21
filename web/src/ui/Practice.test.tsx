// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { indexCatalog } from "../core/catalog.ts";
import type { PracticeSession } from "../core/practice.ts";
import { emptySave, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { Album, Artist, Catalog, Day, Track } from "../core/types.ts";
import { catalogResolver } from "../data/previews.ts";
import { Practice } from "./Practice.tsx";

afterEach(cleanup);
// Os testes do pop-up trocam métodos do HTMLDialogElement: voltam mesmo quando um falha.
afterEach(() => vi.restoreAllMocks());

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
type ModeName = "Normal" | "Desafio";

const choose = (mode: ModeName, init: MouseEventInit = {}) =>
  fireEvent.click(screen.getByRole("button", { name: mode }), init);
const restart = (init: MouseEventInit = {}) =>
  fireEvent.click(screen.getByRole("button", { name: "Reiniciar o Treino" }), init);
const score = () => document.querySelector(".practice-score")?.textContent;
const title = () => screen.getByRole("heading", { level: 1 });

/** Monta o Treino como o App; com `mode`, já escolhe o modo (o clique no cartão). */
function setup(save: Save = emptySave(), day: Day | null = null, mode: ModeName | null = "Normal") {
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
  const current = () => latest;
  const session = () => {
    if (!latest) throw new Error("sessão não começou");
    return latest;
  };
  /** O nome (título) da opção certa da rodada em jogo, para achar o botão. */
  const correctTitle = () => {
    const id = session().game?.rounds[0]?.correctOptionId ?? "";
    return new RegExp(`^Álbum ${id.split(":").at(-1)}`);
  };
  if (mode) choose(mode);
  return { engine, rerender, current, session, correctTitle };
}

describe("Practice: a escolha do modo (P105)", () => {
  it("abre na escolha: o título com o foco, Normal e Desafio, sem rodada nem áudio", () => {
    const { engine, current } = setup(emptySave(), null, null);
    expect(title().textContent).toBe("Treino");
    expect(document.activeElement).toBe(title());
    // O nome acessível de cada cartão é só o do modo; a dica é a descrição.
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-labelledby"))).toEqual([
      "practice-album-name",
      "practice-song-name",
    ]);
    expect(screen.getByRole("button", { name: "Normal" }).getAttribute("aria-describedby")).toBe(
      "practice-album-hint",
    );
    expect(screen.getByRole("button", { name: "Desafio" })).toBeTruthy();
    expect(screen.queryByText(/^Rodada/)).toBeNull();
    expect(score()).toBeUndefined();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(current()).toBeNull();
    expect(engine.retain).not.toHaveBeenCalled();
  });

  it("Normal: o modo no título, a rodada 1, o placar zerado, 4 opções e o foco no Tocar", () => {
    setup(emptySave(), null, "Normal");
    expect(title().textContent).toBe("Treino · Normal");
    expect(screen.getByText("Rodada 1")).toBeTruthy();
    expect(screen.queryByText(/de 3/)).toBeNull();
    expect(score()).toBe("0 pontos em 0 rodadas");
    expect(screen.getByRole("heading", { name: "Qual é o álbum?" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(4);
    expect(document.activeElement?.textContent).toMatch(/^Tocar/);
  });

  it("Desafio: o campo da música, e a próxima rodada continua no Desafio", () => {
    setup(emptySave(), null, "Desafio");
    expect(title().textContent).toBe("Treino · Desafio");
    expect(screen.getByRole("combobox", { name: "Qual é a música?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desistir" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Qual é a música?" })).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(0);
  });

  it("nenhum id igual a uma rota (regra 17), na escolha e com o aviso aberto", () => {
    const { correctTitle } = setup(emptySave(), null, null);
    const noRouteIds = () => {
      for (const route of Object.values(ROUTES)) expect(document.querySelector(route)).toBeNull();
    };
    noRouteIds();
    choose("Normal");
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    restart();
    expect(screen.getByText(/será perdido/)).toBeTruthy();
    noRouteIds();
  });
});

// O Preact redesenha antes do 2º clique de um toque duplo, que cai no botão da tela nova: cada
// trava protege o toque duplo que começou no botão da tela anterior.
describe("Practice: toque duplo entre as telas", () => {
  it("no Reiniciar (sem rodada): o 2º clique cai num cartão e não começa outra sessão", () => {
    const { current } = setup();
    restart();
    choose("Normal", { detail: 2 });
    expect(current()).toBeNull();
    expect(title().textContent).toBe("Treino");
  });

  it("num cartão: o 2º clique cai no Reiniciar e não volta à escolha", () => {
    const { current } = setup();
    restart({ detail: 2 });
    expect(current()).not.toBeNull();
    expect(title().textContent).toBe("Treino · Normal");
  });

  it("no Sim, reiniciar: o 2º clique cai num cartão e não começa outra sessão", () => {
    const { current, correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    restart();
    fireEvent.click(screen.getByRole("button", { name: "Sim, reiniciar" }));
    choose("Desafio", { detail: 2 });
    expect(current()).toBeNull();
  });
});

describe("Practice: a sessão", () => {
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

  it("da rodada à revelação e de volta, a raiz (o palco) e o cabeçalho são os mesmos nós (ME39)", () => {
    setup();
    const root = document.querySelector(".game.practice.screen");
    const head = document.querySelector(".session-head");
    fireEvent.click(screen.getByRole("button", { name: "Não sei" }));
    expect(document.querySelector(".game.practice.screen")).toBe(root);
    expect(document.querySelector(".session-head")).toBe(head);
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    expect(document.querySelector(".game.practice.screen")).toBe(root);
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

  it("sair da aba e voltar mantém a sessão (modo, rodada e placar)", () => {
    const { rerender, correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }));
    rerender({ save: emptySave(), day: null, show: false });
    expect(screen.queryByText(/Treino/)).toBeNull();
    rerender({ save: emptySave(), day: null, show: true });
    expect(title().textContent).toBe("Treino · Normal");
    expect(screen.getByText("Rodada 2")).toBeTruthy();
    expect(score()).toBe("6 pontos em 1 rodada");
  });

  it("sem rodada possível (diário de hoje pendente): aviso com foco, o modo e o Reiniciar", () => {
    const { rerender } = setup(emptySave(), fullDay);
    const message = screen.getByText(/Não há rodada para sortear agora/);
    expect(document.activeElement).toBe(message);
    expect(title().textContent).toBe("Treino · Normal");
    expect(screen.queryByText(/^Rodada/)).toBeNull();
    expect(score()).toBe("0 pontos em 0 rodadas");
    const restart = screen.getByRole("button", { name: "Reiniciar o Treino" });
    // Curto na tela; o nome inteiro, que começa pelo texto visível, para o leitor de tela (P210).
    expect(restart.querySelector('[aria-hidden="true"]')?.textContent).toBe("Reiniciar");
    expect(restart.querySelector(".sr-only")?.textContent).toBe("Reiniciar o Treino");

    // O diário terminou (o App relê o save ao trocar de aba). A rodada sai no clique, e não
    // sozinha: a tela não muda debaixo de quem lê o aviso.
    rerender({ save: finishedBoth, day: fullDay, show: true });
    expect(screen.getByText(/Não há rodada para sortear agora/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sortear de novo" }));
    expect(screen.queryByText(/Não há rodada para sortear agora/)).toBeNull();
    expect(screen.getByText("Rodada 1")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Álbum \d/ })).toHaveLength(4);
  });
});

describe("Practice: reiniciar (P105)", () => {
  it("sem rodada jogada: volta direto à escolha, com o foco no título", () => {
    const { current } = setup();
    restart();
    expect(current()).toBeNull();
    expect(title().textContent).toBe("Treino");
    expect(document.activeElement).toBe(title());
    // E dá para escolher o outro modo.
    choose("Desafio");
    expect(screen.getByRole("combobox", { name: "Qual é a música?" })).toBeTruthy();
  });

  it("depois de uma rodada anulada também (ela não conta)", async () => {
    const { engine, current } = setup();
    vi.mocked(engine.play).mockRejectedValue(new Error("sem áudio"));
    fireEvent.click(screen.getByRole("button", { name: /^Tocar/ }));
    await screen.findByRole("button", { name: "Próxima rodada" });
    restart();
    expect(current()).toBeNull();
  });

  it("com rodada jogada: pergunta num pop-up modal (ME56); Cancelar e Esc devolvem o foco", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { current, correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() })); // revelação na tela
    expect(screen.queryByRole("dialog")).toBeNull(); // fechado, ele some
    restart();
    // O nome do pop-up é o aviso; modal (showModal, e não show): o resto da tela fica inerte.
    const dialog = screen.getByRole("dialog", {
      name: /O placar desta sessão \(6 pontos em 1 rodada\)/,
    }) as HTMLDialogElement;
    expect(showModal).toHaveBeenCalledOnce();
    // O foco vai à escolha que não perde nada.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reiniciar o Treino" }));
    expect(current()).not.toBeNull();

    // O Esc: o pop-up fecha por aqui, e não pelo navegador.
    restart();
    expect(dialog.open).toBe(true);
    const esc = fireEvent.keyDown(screen.getByRole("button", { name: "Cancelar" }), {
      key: "Escape",
    });
    expect(esc).toBe(false); // preventDefault: o navegador não fecha de novo
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reiniciar o Treino" }));

    // Outro jeito de fechar (o "voltar" do Android): o foco também volta.
    restart();
    screen.getByRole("button", { name: "Sim, reiniciar" }).focus();
    act(() => dialog.close());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reiniciar o Treino" }));
    expect(score()).toBe("6 pontos em 1 rodada");
  });

  it("reabre mesmo quando o close não chega como evento (no painel do Claude não chegava)", () => {
    // Sem estado: quem diz se está aberto é o <dialog>. Um "perguntando" ficaria preso em true.
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute("open");
    });
    const { correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    restart();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    restart();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  });

  it("no pop-up, o 2º clique de um toque duplo não confirma o reinício", () => {
    const { current, correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    restart();
    fireEvent.click(screen.getByRole("button", { name: "Sim, reiniciar" }), { detail: 2 });
    expect(current()).not.toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("confirmar: volta à escolha, com o foco no título, e o som para", () => {
    const { engine, current, correctTitle } = setup();
    fireEvent.click(screen.getByRole("button", { name: correctTitle() }));
    restart();
    const stops = vi.mocked(engine.stop).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Sim, reiniciar" }));
    expect(current()).toBeNull();
    expect(document.activeElement).toBe(title());
    expect(title().textContent).toBe("Treino");
    expect(vi.mocked(engine.stop).mock.calls.length).toBeGreaterThan(stops);
  });

  it("a falha de áudio que chega depois de reiniciar não traz a sessão de volta", async () => {
    const { engine, current } = setup();
    let fail: (error: Error) => void = () => {};
    vi.mocked(engine.play).mockReturnValue(new Promise<null>((_, reject) => (fail = reject)));
    fireEvent.click(screen.getByRole("button", { name: /^Tocar/ }));
    restart(); // sem rodada jogada: direto
    await act(async () => fail(new Error("sem áudio")));
    expect(current()).toBeNull();
    // A sessão nova começa limpa: a falha da antiga não anula a rodada 1.
    choose("Normal");
    expect(screen.getByText("Rodada 1")).toBeTruthy();
    expect(screen.queryByText(/Áudio indisponível/)).toBeNull();
  });
});
