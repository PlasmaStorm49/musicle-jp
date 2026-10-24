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
import type { ArtistList, ArtistListEntry } from "../core/types.ts";
import { SAVE_SCHEMA_VERSION } from "../storage/migrations.ts";
import {
  type KeyValueStore,
  loadSave,
  memoryStore,
  SAVE_KEY,
  sessionStore,
} from "../storage/save.ts";
import { generalArt } from "./MedalArt.tsx";
import { LISTED, MedalDialog, MedalToast, type NoticeItem, TOAST_MS } from "./MedalNotice.tsx";
import {
  announceText,
  hasBig,
  noticeItems,
  noticeOrder,
  noticeTitle,
  toastText,
  useMedalNotices,
} from "./medalNotices.ts";

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
          perfeito: { name: "夜風劇場", latin: null },
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
          perfeito: { name: "Terceira", latin: null },
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
  spoken: name,
  feat: null,
  art: generalArt("★"),
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

  it("com um botão a mais antes do Ok (o Guardar uma cópia, ME103), o foco continua no Ok", () => {
    render(
      <MedalDialog
        title="Medalha nova"
        items={[item("a", "Um")]}
        onClose={vi.fn()}
        actions={
          <button type="button" onClick={vi.fn()}>
            Guardar uma cópia do progresso
          </button>
        }
      />,
    );
    expect(screen.getByRole("button", { name: "Guardar uma cópia do progresso" })).toBeTruthy();
    expect(document.activeElement).toBe(ok());
  });

  it(`com mais de ${LISTED}, lista as ${LISTED} primeiras e "e mais N" (P313)`, () => {
    const many = Array.from({ length: LISTED + 3 }, (_, i) => item(`m${i}`, `Medalha ${i}`));
    render(<MedalDialog title="Você já tem 9 medalhas" items={many} onClose={vi.fn()} />);
    const names = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(names).toHaveLength(LISTED + 1);
    expect(names.slice(0, 2)).toEqual(["Medalha 0", "Medalha 1"]);
    expect(names.at(-1)).toBe("e mais 3 medalhas");
    cleanup();
    const seven = Array.from({ length: LISTED + 1 }, (_, i) => item(`s${i}`, `Medalha ${i}`));
    render(<MedalDialog title="Você já tem 7 medalhas" items={seven} onClose={vi.fn()} />);
    expect(screen.getAllByRole("listitem").at(-1)?.textContent).toBe("e mais 1 medalha");
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

  it("com a capa da Apple, o selo fecha o pop-up, depois do Ok (P298, regra 22)", () => {
    const { container, unmount } = render(
      <MedalDialog title="Medalha nova!" items={[]} onClose={vi.fn()} attribution />,
    );
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.lastElementChild?.classList.contains("attribution")).toBe(true);
    expect(screen.getByRole("link").getAttribute("href")).toContain("music.apple.com");
    unmount();
    render(<MedalDialog title="Medalha nova!" items={[]} onClose={vi.fn()} />);
    expect(screen.queryByRole("link")).toBeNull();
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

  it("a do Superfan leva o nome próprio, com o latino, e o artista (P295, P300); a geral, o do i18n", () => {
    const [superfan, general] = noticeItems([acertos, "demo-primeiro"], LIST, resolve, true);
    expect(superfan).toMatchObject({
      id: acertos,
      kind: "acertos",
      name: "夜明け · Yoake, de 夜風",
      art: { image: "/base/art/1.svg", letter: "夜", name: "夜風" },
    });
    expect(general).toEqual({
      id: "demo-primeiro",
      kind: "geral",
      name: "Primeiro diário",
      spoken: "Primeiro diário",
      feat: null,
      art: generalArt("★"),
    });
    const completo = noticeItems([superfanMedalId(ARTIST, "completo")], LIST, resolve, true)[0];
    expect(completo?.name).toBe("Round Robin, de 夜風");
  });

  it("a ordem do aviso (P313): as grandes primeiro, depois as com capa, e o resto como veio", () => {
    const ids = [
      "seguidos-7",
      superfanMedalId(ARTIST, "acertos"),
      "seguidos-30",
      superfanMedalId(ARTIST, "completo"),
      "diario-1",
    ];
    const ordered = noticeOrder(noticeItems(ids, LIST, resolve, true));
    expect(ordered.map((item) => item.id)).toEqual([
      superfanMedalId(ARTIST, "completo"),
      "seguidos-30",
      superfanMedalId(ARTIST, "acertos"),
      "seguidos-7",
      "diario-1",
    ]);
  });

  it("hasBig: só a Superfan completa ou perfeita e as gerais grandes pedem a cópia (ME103, P347)", () => {
    const of = (...ids: string[]) => hasBig(noticeItems(ids, LIST, resolve, true));
    expect(of("diario-1", "seguidos-7")).toBe(false);
    expect(of(superfanMedalId(ARTIST, "acertos"))).toBe(false);
    expect(of("diario-1", "seguidos-30")).toBe(true);
    expect(of(superfanMedalId(ARTIST, "completo"))).toBe(true);
    expect(of(superfanMedalId(ARTIST, "perfeito"))).toBe(true);
  });

  it("as gerais com o desenho do tamanho delas, pela lista (P312)", () => {
    const items = noticeItems(["seguidos-7", "seguidos-30"], LIST, resolve, true);
    expect(items.map((item) => [item.kind, item.name])).toEqual([
      ["geral", "Em Chamas"],
      ["geral-grande", "Tá pegando fogo, bicho!!!"],
    ]);
    // Com outra lista (a de exemplo), vale o tamanho dela.
    const demo = noticeItems(["demo-sequencia"], LIST, resolve, true, DEMO_MEDALS);
    expect(demo[0]?.kind).toBe("geral-grande");
  });

  it("o pop-up desenha o nome como a tela: o japonês com o lang, e o ponto decorativo", () => {
    const items = noticeItems([acertos], LIST, resolve, true);
    expect(items[0]?.label).toEqual({ name: "夜明け", latin: "Yoake", artist: "夜風" });
    render(<MedalDialog title="Medalha nova!" items={items} onClose={vi.fn()} />);
    const li = screen.getByRole("listitem");
    // O feito, só para o leitor de tela: o desenho que diz qual é a medalha é decorativo.
    expect(li.textContent).toBe("夜明け · Yoake, de 夜風 (50 acertos)");
    expect(li.querySelector(".sr-only")?.textContent).toBe(" (50 acertos)");
    const ja = [...li.querySelectorAll('[lang="ja"]')].map((el) => el.textContent);
    expect(ja).toEqual(["夜明け", "夜風"]); // o nome e o artista, cada um com a língua dele
    expect(li.querySelector('[aria-hidden="true"]')?.textContent).toBe("·");
    // Com o foco no Ok, o leitor de tela lê também os nomes.
    const dialog = screen.getByRole("dialog");
    const names = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(names?.tagName).toBe("UL");
  });

  it('o artista sem nome (um índice corrompido): o nome da medalha, sem o ", de" solto', () => {
    const noArtist: ArtistList = {
      ...LIST,
      artists: [{ ...LIST.artists[0], name: null } as unknown as ArtistListEntry],
    };
    expect(noticeItems([acertos], noArtist, resolve, true)[0]?.name).toBe("夜明け · Yoake");
  });

  it("o aviso pequeno vai sem a capa: as telas dele não têm o selo da Apple (P298)", () => {
    expect(noticeItems([acertos], LIST, resolve, false)[0]?.art).toMatchObject({
      image: null,
      letter: "夜",
    });
  });

  it("sem a lista (a carga falhou) ou fora dela, o feito; sem o nome, o feito com o artista", () => {
    expect(noticeItems([acertos], null, resolve, true)[0]).toMatchObject({
      name: "50 acertos",
      art: { image: null },
    });
    expect(
      noticeItems([superfanMedalId("t:ar:9", "perfeito")], LIST, resolve, true)[0],
    ).toMatchObject({ kind: "perfeito", name: "Superfan perfeito" });
    const noName: ArtistList = {
      ...LIST,
      artists: [{ ...LIST.artists[1], medals: {} } as unknown as ArtistListEntry],
    };
    expect(
      noticeItems([superfanMedalId("t:ar:2", "completo")], noName, resolve, true)[0],
    ).toMatchObject({ name: "Superfan completo, de Banda", art: { image: null, letter: "B" } });
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

  it("o do leitor de tela: sem o ponto do latino, e com o feito, porque o desenho é decorativo", () => {
    const items = noticeItems([acertos], LIST, resolve, false);
    expect(toastText(items)).toBe("Medalha nova: 夜明け · Yoake, de 夜風");
    expect(announceText(items)).toBe("Medalha nova: 夜明け, Yoake, de 夜風 (50 acertos)");
    // Sem o nome próprio, o feito já diz qual é: sem ele duas vezes.
    expect(announceText(noticeItems([acertos], null, resolve, false))).toBe(
      "Medalha nova: 50 acertos",
    );
    expect(announceText([item("a", "Um"), item("b", "Dois")])).toBe("2 medalhas novas");
  });
});

/** O gancho, por um componente mínimo: o botão reivindica, e a saída mostra o aviso. */
function Harness(props: {
  readonly store: KeyValueStore;
  readonly general?: readonly Medal[];
  readonly silent?: boolean;
  readonly hitsDates?: readonly string[] | null;
}) {
  const { notice, claim, dismiss } = useMedalNotices({
    store: props.store,
    general: props.general ?? DEMO_MEDALS,
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
    // Um jogo de ontem: quem já jogava (P314).
    const store = seeded(withFinished(rights, "2026-10-21|song", lost));
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

  it("calado ou antes da agenda: nada, e nada gravado", () => {
    for (const props of [{ silent: true }, { hitsDates: null }]) {
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
