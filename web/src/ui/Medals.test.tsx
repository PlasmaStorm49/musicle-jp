// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_MEDALS, MEDALS, SUPERFAN_RIGHT } from "../core/medals.ts";
import {
  emptySave,
  type Save,
  withArtistRight,
  withFinished,
  withSuperfanEnd,
} from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import type { ArtistList, ArtistListEntry } from "../core/types.ts";
import { ptBR } from "../i18n/pt-BR.ts";
import type { ArtistStore } from "./Artists.tsx";
import { Medals } from "./Medals.tsx";

afterEach(cleanup);

const DATE = "2026-10-22";
const HITS = ["2026-10-20", "2026-10-21", "2026-10-22"];
const lost = { number: 1, rounds: [{ status: "lost", stage: 0, attempts: [] }] } as const;

// Dados no próprio arquivo (regra 14): dois artistas, um com capa e outro sem.
const LIST: ArtistList = {
  schemaVersion: 1,
  provider: "fixture",
  storefront: "jp",
  artists: [
    {
      id: "t:ar:1",
      name: "夜風",
      nameLatin: "Yokaze",
      file: "1.json",
      songs: 3,
      artworkUrl: "art/1.svg",
      medals: {
        names: {
          acertos: { name: "夜明け", latin: "Yoake" },
          completo: { name: "Round Robin", latin: null },
          perfeito: { name: "夜風劇場" },
        },
      },
    },
    {
      id: "t:ar:2",
      name: "Banda",
      nameLatin: null,
      file: "2.json",
      songs: 2,
      artworkUrl: null,
      medals: {
        names: {
          acertos: { name: "Primeira", latin: null },
          completo: { name: "Segunda", latin: null },
          perfeito: { name: "Terceira" },
        },
      },
    },
  ],
} as ArtistList;

/** O mínimo do estado do modo por artista que a tela usa: a lista e a carga dela. */
function store(list: ArtistStore["list"], loadList = vi.fn()): ArtistStore {
  return {
    list,
    loadList,
    choosing: null,
    choose: vi.fn(),
    cancelChoice: vi.fn(),
    picked: null,
    begin: vi.fn(),
    replay: vi.fn(),
    play: null,
    loaded: null,
    change: vi.fn(),
    changeRun: vi.fn(),
    restart: vi.fn(),
  };
}

function setup(artists: ArtistStore, save: Save = emptySave()) {
  return render(
    <Medals
      save={save}
      date={DATE}
      hitsDates={HITS}
      general={DEMO_MEDALS}
      artists={artists}
      resolveUrl={(url) => `/${url}`}
    />,
  );
}

const cells = (artist: string | RegExp) => [
  ...(screen
    .getByRole("heading", { level: 3, name: artist })
    .closest("li")
    ?.querySelectorAll(".medal-cell") ?? []),
];

/**
 * O texto da célula, sem o da arte (a faixa da perfeita também tem texto, mas é decorativa): o
 * nome e o como ganhar, separados por " | ".
 */
const cellText = (cell: Element) =>
  [...cell.querySelectorAll(":scope > .medal-name, :scope > .medal-how")]
    .map((span) => span.textContent)
    .join(" | ");

describe("Medals (a tela, P278 e P286)", () => {
  it("o título com o foco, a sequência e o total; as gerais com o progresso", async () => {
    let save = withFinished(emptySave(), "2026-10-21|song", lost);
    save = withFinished(save, "2026-10-22|anime-musica-facil", lost);
    setup(store({ status: "ready", list: LIST }), save);
    const title = screen.getByRole("heading", { level: 1, name: "Medalhas" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(screen.getByText("Dias seguidos jogando: 2. O melhor: 2.")).toBeTruthy();
    expect(screen.getByText("1 de 9 medalhas")).toBeTruthy();
    const rows = [...document.querySelectorAll(".medal-list .medal-text")].map(
      (t) => t.textContent,
    );
    expect(rows).toEqual([
      "Primeiro diárioGanha",
      "Cinco diários2 de 5",
      "Três dias seguidos2 de 3",
    ]);
    expect(document.querySelectorAll(".medal-list > li.locked")).toHaveLength(2);
  });

  it("o Superfan: as 3 de cada artista, com o nome próprio, o estado, a capa e o monograma (P300)", () => {
    let save = withArtistRight(emptySave(), "t:ar:2");
    for (let i = 0; i < SUPERFAN_RIGHT; i++) save = withArtistRight(save, "t:ar:1");
    save = withSuperfanEnd(save, "t:ar:1", { done: true, perfect: false });
    setup(store({ status: "ready", list: LIST }), save);
    expect(cells(/^夜風/).map(cellText)).toEqual([
      "夜明け · Yoake | Ganha",
      "Round Robin | Ganha",
      "夜風劇場 | Termine perfeito: sem erro, sem ajuda, tudo em 1 s",
    ]);
    expect(cells("Banda").map(cellText)).toEqual([
      `Primeira | 1 de ${SUPERFAN_RIGHT} acertos`,
      "Segunda | Termine uma partida do Superfan",
      "Terceira | Termine perfeito: sem erro, sem ajuda, tudo em 1 s",
    ]);
    // O leitor de tela ouve qual é cada uma, pelo feito: o desenho é decorativo.
    expect(cells("Banda").map((c) => c.querySelector(".sr-only")?.textContent)).toEqual([
      `${SUPERFAN_RIGHT} acertos`,
      "Superfan completo",
      "Superfan perfeito",
    ]);
    // Nenhum rótulo de nível na tela (P300); o nome japonês com a língua dele, e o ponto decorativo.
    expect(document.body.textContent).not.toMatch(/Prata|Ouro|Suprema/);
    const name = cells(/^夜風/)[0]?.querySelector(".medal-name");
    expect(name?.querySelector('[lang="ja"]')?.textContent).toBe("夜明け");
    expect(name?.querySelector('[aria-hidden="true"]')?.textContent).toBe("·");
    // A capa pelo resolvedor; sem capa, o monograma.
    expect(cells(/^夜風/)[0]?.querySelector("image")?.getAttribute("href")).toBe("/art/1.svg");
    expect(cells("Banda")[0]?.querySelector("text")?.textContent).toBe("B");
    // Nas fixtures, sem o selo da Apple.
    expect(screen.queryByRole("link", { name: /Apple Music/ })).toBeNull();
  });

  it("na lista real, o selo da Apple no pé, por causa das capas (P170, P284)", () => {
    setup(store({ status: "ready", list: { ...LIST, provider: "apple" } }));
    expect(screen.getByRole("link", { name: /Apple Music/ })).toBeTruthy();
  });

  it("a lista que ainda não carregou: pede a carga e espera", () => {
    const loadList = vi.fn();
    setup(store({ status: "idle" }, loadList));
    expect(loadList).toHaveBeenCalledOnce();
    expect(screen.getByText("Carregando…")).toBeTruthy();
    // Sem a lista, o total ficaria só com as gerais: ele espera.
    expect(screen.queryByText(/de \d+ medalhas/)).toBeNull();
  });

  it("a lista que falhou: o aviso e o Tentar de novo, sem tirar o foco do título", async () => {
    const loadList = vi.fn();
    setup(store({ status: "retry" }, loadList));
    const title = screen.getByRole("heading", { level: 1, name: "Medalhas" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(screen.getByText(/^Não foi possível carregar os artistas/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Tentar de novo" });
    retry.focus();
    fireEvent.click(retry);
    expect(loadList).toHaveBeenCalledOnce();
    // O botão some na carga: o foco já está no título, e não fica no body (regra 16).
    expect(document.activeElement).toBe(title);
  });

  it("a lista de uma versão nova: pede para recarregar, com o botão", () => {
    setup(store({ status: "update" }));
    expect(screen.getByText("O jogo foi atualizado desde que esta página abriu.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recarregar a página" })).toBeTruthy();
  });

  it("toda geral, a de exemplo e a de verdade, tem o nome e o como ganhar no i18n", () => {
    const keys = new Set(Object.keys(ptBR));
    for (const medal of [...DEMO_MEDALS, ...MEDALS]) {
      expect(keys.has(`medal.${medal.id}.name`), medal.id).toBe(true);
      expect(keys.has(`medal.${medal.id}.how`), medal.id).toBe(true);
    }
  });

  it("nenhum id igual a uma rota (regra 17)", () => {
    setup(store({ status: "ready", list: LIST }));
    const routes = new Set(Object.values(ROUTES).map((route) => route.slice(1)));
    for (const el of document.querySelectorAll("[id]")) {
      expect(routes.has(el.id), el.id).toBe(false);
    }
  });

  it.each([
    ["sem os nomes", { medals: {} }],
    ["o índice velho, sem o medals", { medals: undefined }],
  ])("a medalha %s: só o como ganhar (P301), e a tela não quebra", (_, change) => {
    const noNames: ArtistList = {
      ...LIST,
      artists: [{ ...LIST.artists[1], ...change } as unknown as ArtistListEntry],
    };
    setup(store({ status: "ready", list: noNames }));
    expect(cells("Banda").map(cellText)).toEqual([
      `0 de ${SUPERFAN_RIGHT} acertos`,
      "Termine uma partida do Superfan",
      "Termine perfeito: sem erro, sem ajuda, tudo em 1 s",
    ]);
  });

  it("o artista sem nome (um índice corrompido) não derruba a tela", () => {
    const broken: ArtistList = {
      ...LIST,
      artists: [{ ...LIST.artists[1], name: null } as unknown as ArtistListEntry],
    };
    setup(store({ status: "ready", list: broken }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });
});
