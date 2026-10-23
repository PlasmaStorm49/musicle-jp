// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_MEDALS, type Medal, SUPERFAN_RIGHT, superfanMedalId } from "../core/medals.ts";
import {
  emptySave,
  type FinishedGame,
  type Save,
  withArtistRight,
  withFinished,
  withSuperfanEnd,
} from "../core/records.ts";
import { ROUNDS_PER_DAY } from "../core/rules.ts";
import type { ArtistList } from "../core/types.ts";
import { SAVE_SCHEMA_VERSION } from "../storage/migrations.ts";
import {
  type KeyValueStore,
  loadSave,
  memoryStore,
  SAVE_KEY,
  sessionStore,
} from "../storage/save.ts";
import { MedalDialog, MedalToast, type NoticeItem, TOAST_MS } from "./MedalNotice.tsx";
import { noticeItems, noticeTitle, toastText, useMedalNotices } from "./medalNotices.ts";

afterEach(cleanup);

const DATE = "2026-10-22";
const HITS = ["2026-10-20", "2026-10-21", "2026-10-22"];
const ARTIST = "t:ar:1";
// Um jogo terminado que o save aceita: as rodadas do dia inteiras.
const lost: FinishedGame = {
  number: 1,
  rounds: Array.from({ length: ROUNDS_PER_DAY }, () => ({
    status: "lost" as const,
    stage: 0,
    attempts: [],
  })),
};

// Dados no próprio arquivo (regra 14): um artista com capa e outro sem.
const LIST: ArtistList = {
  schemaVersion: 1,
  provider: "fixture",
  storefront: "jp",
  artists: [
    {
      id: ARTIST,
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

const resolve = (url: string) => `/base/${url}`;

const item = (id: string, name: string): NoticeItem => ({
  id,
  kind: "geral",
  name,
  image: null,
  letter: "★",
  color: 0,
  sash: "",
});

describe("MedalToast (o aviso pequeno, P279)", () => {
  it("decorativo, com o texto ao lado do desenho, e some sozinho depois do tempo", () => {
    vi.useFakeTimers();
    try {
      const onDone = vi.fn();
      const { container } = render(
        <MedalToast items={[item("a", "Um")]} text="Medalha nova: Um" onDone={onDone} />,
      );
      const toast = container.querySelector(".medal-toast") as HTMLElement;
      // O leitor de tela ouve o texto pela região aria-live do App, e não por aqui.
      expect(toast.getAttribute("aria-hidden")).toBe("true");
      expect(toast.querySelector(".medal-toast-text")?.textContent).toBe("Medalha nova: Um");
      expect(toast.querySelectorAll("svg")).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(TOAST_MS - 1);
      });
      expect(onDone).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDone).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fechado antes do tempo (a troca de tela grande), o temporizador não dispara depois", () => {
    vi.useFakeTimers();
    try {
      const onDone = vi.fn();
      const { unmount } = render(<MedalToast items={[]} text="2 medalhas novas" onDone={onDone} />);
      unmount();
      act(() => {
        vi.advanceTimersByTime(TOAST_MS * 2);
      });
      expect(onDone).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("desenha até 4 medalhas; o resto fica só no texto", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => item(id, id));
    const { container } = render(
      <MedalToast items={items} text="5 medalhas novas" onDone={vi.fn()} />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(4);
  });
});

describe("MedalDialog (o pop-up grande, P279)", () => {
  const ok = () => screen.getByRole("button", { name: "Ok" });

  it("o título dá o nome ao pop-up, com as medalhas e os nomes, e o foco vai ao Ok", () => {
    render(
      <MedalDialog
        title="2 medalhas novas"
        items={[item("a", "Um"), item("b", "Dois")]}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "2 medalhas novas" }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Um", "Dois"]);
    expect(dialog.querySelectorAll(".medal-notice-arts svg")).toHaveLength(2);
    expect(document.activeElement).toBe(ok());
  });

  it("o Ok e o Esc fecham pelo estado; o 2º clique de um toque duplo não (regra 23)", () => {
    const onClose = vi.fn();
    render(<MedalDialog title="Medalha nova!" items={[item("a", "Um")]} onClose={onClose} />);
    fireEvent.click(ok(), { detail: 2 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(ok());
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(ok(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(ok(), { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("fechado pelo próprio navegador (o voltar do Android, o evento cancel): o estado fecha também", () => {
    const onClose = vi.fn();
    render(<MedalDialog title="Medalha nova!" items={[]} onClose={onClose} />);
    const cancel = new Event("cancel", { cancelable: true });
    screen.getByRole("dialog").dispatchEvent(cancel);
    expect(onClose).toHaveBeenCalledOnce();
    expect(cancel.defaultPrevented).toBe(true);
  });

  it("o lugar das ações a mais (o Exportar da ME103) fica antes do Ok", () => {
    render(
      <MedalDialog
        title="Medalha nova!"
        items={[]}
        onClose={vi.fn()}
        actions={
          <button type="button" class="secondary">
            Exportar
          </button>
        }
      />,
    );
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Exportar", "Ok"]);
  });

  it("ao fechar, o foco volta ao elemento de antes; se ele saiu da página, ao título da tela", () => {
    render(
      <main>
        <h1 tabindex={-1}>Hits</h1>
        <button type="button">Ver resultado</button>
      </main>,
    );
    const before = screen.getByRole("button", { name: "Ver resultado" });
    before.focus();
    const first = render(<MedalDialog title="Medalha nova!" items={[]} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(ok());
    first.unmount();
    expect(document.activeElement).toBe(before);

    const second = render(<MedalDialog title="Medalha nova!" items={[]} onClose={vi.fn()} />);
    before.remove(); // o "Ver resultado" virou o resumo
    second.unmount();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Hits" }));
  });
});

describe("noticeItems, noticeTitle e toastText (o texto dos avisos)", () => {
  const acertos = superfanMedalId(ARTIST, "acertos");

  it("a do Superfan leva o nível, o artista, a capa e a faixa; a geral, o nome do i18n", () => {
    const [superfan, general] = noticeItems([acertos, "demo-primeiro"], LIST, resolve);
    expect(superfan).toMatchObject({
      id: acertos,
      kind: "acertos",
      name: "Prata de 夜風",
      image: "/base/art/1.svg",
      letter: "夜",
      sash: "夜風",
    });
    expect(general).toEqual({
      id: "demo-primeiro",
      kind: "geral",
      name: "Primeiro diário",
      image: null,
      letter: "★",
      color: 0,
      sash: "",
    });
  });

  it("sem a lista (ainda carregando) ou fora dela, só o nível; sem capa, o monograma", () => {
    const completo = superfanMedalId("t:ar:2", "completo");
    expect(noticeItems([acertos], null, resolve)[0]).toMatchObject({ name: "Prata", image: null });
    expect(noticeItems([superfanMedalId("t:ar:9", "perfeito")], LIST, resolve)[0]).toMatchObject({
      kind: "perfeito",
      name: "Suprema",
    });
    expect(noticeItems([completo], LIST, resolve)[0]).toMatchObject({
      name: "Ouro de Banda",
      image: null,
      letter: "B",
    });
  });

  it("o título: o 1º aviso com o total, uma nova, ou várias", () => {
    expect(noticeTitle({ ids: ["a", "b", "c"], tier: "major", first: true })).toBe(
      "Você já tem 3 medalhas",
    );
    expect(noticeTitle({ ids: ["a"], tier: "major", first: false })).toBe("Medalha nova!");
    expect(noticeTitle({ ids: ["a", "b"], tier: "simple", first: false })).toBe("2 medalhas novas");
  });

  it("o texto do pequeno: o nome da única, ou quantas", () => {
    expect(toastText([item("a", "Um")])).toBe("Medalha nova: Um");
    expect(toastText([item("a", "Um"), item("b", "Dois")])).toBe("2 medalhas novas");
  });
});

/** O gancho, por um componente mínimo: o botão reivindica, e a saída mostra o aviso. */
function Harness(props: {
  readonly store: KeyValueStore;
  readonly general?: readonly Medal[] | null;
  readonly silent?: boolean;
  readonly hitsDates?: readonly string[] | null;
}) {
  const { notice, claim, dismiss } = useMedalNotices({
    store: props.store,
    general: props.general === undefined ? DEMO_MEDALS : props.general,
    silent: props.silent ?? false,
    today: DATE,
    hitsDates: props.hitsDates === undefined ? HITS : props.hitsDates,
  });
  return (
    <>
      <button type="button" onClick={() => claim()}>
        reivindicar
      </button>
      <button type="button" onClick={() => claim(true)}>
        reivindicar na tela do selo
      </button>
      <button type="button" onClick={dismiss}>
        fechar
      </button>
      <output>{notice ? `${notice.tier}|${notice.first}|${notice.ids.join(",")}` : "nada"}</output>
    </>
  );
}

describe("useMedalNotices: reivindicar antes de mostrar (P281, P288)", () => {
  const seeded = (save: Save) => memoryStore({ [SAVE_KEY]: JSON.stringify(save) });
  const claim = () => fireEvent.click(screen.getByRole("button", { name: "reivindicar" }));
  const shown = () => screen.getByRole("status").textContent;
  const seen = (store: KeyValueStore) => loadSave(store).save.seenMedals;
  const acertos = superfanMedalId(ARTIST, "acertos");
  const completo = superfanMedalId(ARTIST, "completo");
  let rights = emptySave();
  for (let i = 0; i < SUPERFAN_RIGHT; i++) rights = withArtistRight(rights, ARTIST);

  it("grava as novas como avisadas e mostra só elas; a 2ª reivindicação não mostra de novo", () => {
    const store = seeded(withFinished(rights, `${DATE}|song`, lost));
    render(<Harness store={store} />);
    expect(shown()).toBe("nada");
    claim();
    expect(shown()).toBe(`major|true|demo-primeiro,${acertos}`);
    expect(seen(store)).toEqual(["demo-primeiro", acertos].sort());
    fireEvent.click(screen.getByRole("button", { name: "fechar" }));
    claim();
    expect(shown()).toBe("nada");
  });

  it("na tela do selo da Apple (os Artistas, as Medalhas), a simples sai no grande, desde a reivindicação", () => {
    render(<Harness store={seeded(rights)} />);
    fireEvent.click(screen.getByRole("button", { name: "reivindicar na tela do selo" }));
    expect(shown()).toBe(`major|false|${acertos}`);
  });

  it("a leva nova chega com um aviso na tela: um aviso só, do tamanho da maior", () => {
    const store = seeded(withFinished(emptySave(), `${DATE}|song`, lost));
    render(<Harness store={store} />);
    claim();
    expect(shown()).toBe("simple|false|demo-primeiro");
    const now = loadSave(store).save;
    store.setItem(
      SAVE_KEY,
      JSON.stringify(withSuperfanEnd(now, ARTIST, { done: true, perfect: false })),
    );
    claim();
    expect(shown()).toBe(`major|false|demo-primeiro,${completo}`);
  });

  it("a outra aba, que relê o save, encontra tudo avisado e não mostra nada", () => {
    const store = seeded(rights);
    render(<Harness store={store} />);
    render(<Harness store={store} />);
    const [first, second] = screen.getAllByRole("button", { name: "reivindicar" });
    fireEvent.click(first as HTMLElement);
    fireEvent.click(second as HTMLElement);
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([
      `simple|false|${acertos}`,
      "nada",
    ]);
  });

  it("sem a lista das gerais (o site, até o PR 3), calado ou antes da agenda: nada, e nada gravado", () => {
    for (const props of [{ general: null }, { silent: true }, { hitsDates: null }]) {
      const store = seeded(rights);
      const { unmount } = render(<Harness store={store} {...props} />);
      claim();
      expect(shown()).toBe("nada");
      expect(seen(store)).toEqual([]);
      unmount();
    }
  });

  it("save de uma versão futura: não marca nada e não mostra nada", () => {
    const store = memoryStore({
      [SAVE_KEY]: JSON.stringify({ ...rights, schemaVersion: SAVE_SCHEMA_VERSION + 1 }),
    });
    render(<Harness store={store} />);
    claim();
    expect(shown()).toBe("nada");
  });

  it("a cota cheia: a gravação falha, o aviso aparece, e a marca fica na memória da sessão", () => {
    const base = seeded(rights);
    const full: KeyValueStore = {
      ...base,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    // Como no App: o armazenamento da sessão por cima do navegador.
    render(<Harness store={sessionStore(full, loadSave(full))} />);
    claim();
    expect(shown()).toBe(`simple|false|${acertos}`);
    fireEvent.click(screen.getByRole("button", { name: "fechar" }));
    claim();
    expect(shown()).toBe("nada");
  });
});
