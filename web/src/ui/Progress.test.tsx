// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySave, type FinishedGame, type Save } from "../core/records.ts";
import { SAVE_SCHEMA_VERSION } from "../storage/migrations.ts";
import {
  type KeyValueStore,
  loadSave,
  memoryStore,
  SAVE_KEY,
  sessionStore,
} from "../storage/save.ts";
import { exportFile, MAX_IMPORT_CHARS } from "../storage/transfer.ts";
import { BackupAction, ProgressTransfer, type SaveMode } from "./Progress.tsx";

afterEach(cleanup);

const TODAY = "2026-10-23";

const finished: FinishedGame = {
  number: 1,
  rounds: [
    { status: "won", stage: 1, attempts: ["right"] },
    { status: "lost", stage: 0, attempts: ["wrong"] },
    { status: "void", stage: 0, attempts: [] },
  ],
};

/** O progresso deste aparelho: um dia, e o diário de hoje em andamento. */
const local: Save = {
  ...emptySave(),
  history: { "2026-10-01|album": finished },
  inProgress: { "2026-10-23|song": { events: [{ type: "SKIP" }] } },
};

/** O de outro aparelho: dois dias e uma medalha vista. */
const other: Save = {
  ...emptySave(),
  history: { "2026-10-20|album": finished, "2026-10-21|album": finished },
  seenMedals: ["diario-1"],
};

function setup(save: Save = local, mode: SaveMode = "saves", store?: KeyValueStore) {
  const kept = store ?? memoryStore({ [SAVE_KEY]: JSON.stringify(save) });
  const announce = vi.fn();
  const download = vi.fn();
  const onImported = vi.fn();
  render(
    <ProgressTransfer
      store={kept}
      today={TODAY}
      mode={mode}
      announce={announce}
      download={download}
      onImported={onImported}
    />,
  );
  return { store: kept, announce, download, onImported };
}

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("sem a escolha do arquivo");
  return input;
};

/** Escolhe um arquivo, como o navegador faria: um texto, ou um objeto que finge ser o arquivo. */
function choose(content: string | { readonly size: number; readonly text: () => Promise<string> }) {
  const file =
    typeof content === "string"
      ? new File([content], "progresso.json", { type: "application/json" })
      : content;
  Object.defineProperty(fileInput(), "files", { value: [file], configurable: true });
  fireEvent.change(fileInput());
}

/** A confirmação do arquivo de outro aparelho: a data, o que ele traz e o dia daqui que sai. */
const CONFIRM =
  "O arquivo, de 23/10, tem 2 dias jogados e 1 medalha. Sai deste aparelho 1 jogo terminado que o arquivo não tem. Substituir o progresso deste aparelho por ele?";

const importButton = () => screen.getByRole("button", { name: "Importar" });

describe("ProgressTransfer (o Seu progresso do Sobre, ME103)", () => {
  it("Exportar baixa o arquivo com o nome do dia, sem o andamento, e diz o que fez", () => {
    const { download, announce } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(download).toHaveBeenCalledOnce();
    const [name, text] = download.mock.calls[0] ?? [];
    expect(name).toBe("atemusic-progresso-2026-10-23.json");
    const data = JSON.parse(text);
    expect(data.save.history).toEqual(local.history);
    expect(data.save).not.toHaveProperty("inProgress");
    const message = "O arquivo atemusic-progresso-2026-10-23.json foi baixado.";
    expect(announce).toHaveBeenCalledWith(message);
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("Importar abre a escolha do arquivo, que só aceita JSON", () => {
    setup();
    const click = vi.spyOn(fileInput(), "click");
    fireEvent.click(importButton());
    expect(click).toHaveBeenCalledOnce();
    expect(fileInput().accept).toBe(".json,application/json");
  });

  it("o arquivo bom abre a confirmação com a data, o que ele traz e o que sai daqui, e o foco no Cancelar; o Cancelar não grava", async () => {
    const { store, onImported } = setup();
    choose(exportFile(other, TODAY));
    const dialog = await screen.findByRole("dialog", { name: CONFIRM });
    expect(dialog).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadSave(store).save).toEqual(local);
    expect(onImported).not.toHaveBeenCalled();
    // Fechado o pop-up, o foco volta ao Importar (regra 16).
    await waitFor(() => expect(document.activeElement).toBe(importButton()));
  });

  it("Sim, substituir: o progresso do arquivo toma o lugar, o andamento daqui fica, e avisa", async () => {
    const { store, onImported, announce } = setup();
    choose(exportFile(other, TODAY));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Sim, substituir" }));
    const saved = loadSave(store).save;
    expect(saved.history).toEqual(other.history);
    expect(saved.seenMedals).toEqual(["diario-1"]);
    expect(saved.inProgress).toEqual(local.inProgress);
    expect(onImported).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith("Progresso importado: 2 dias jogados.");
    await waitFor(() => expect(document.activeElement).toBe(importButton()));
  });

  it("o arquivo com entradas que não valem: importa o resto e diz", async () => {
    const { announce } = setup();
    const odd = JSON.parse(exportFile(other, TODAY));
    odd.save.history["2026-10-30|album"] = finished; // um dia depois de hoje
    choose(JSON.stringify(odd));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Sim, substituir" }));
    expect(announce).toHaveBeenCalledWith(
      "Progresso importado: 2 dias jogados. Algumas entradas do arquivo não valiam e ficaram de fora.",
    );
  });

  it("sem a data no arquivo e sem nada a perder: a confirmação só diz o que ele traz", async () => {
    setup(emptySave());
    const data = JSON.parse(exportFile(other, TODAY));
    delete data.exportedOn;
    choose(JSON.stringify(data));
    expect(
      await screen.findByRole("dialog", {
        name: "O arquivo tem 2 dias jogados e 1 medalha. Substituir o progresso deste aparelho por ele?",
      }),
    ).toBeTruthy();
  });

  it("o arquivo grande demais é recusado antes de ser lido", async () => {
    const { announce } = setup();
    const text = vi.fn(async () => "{}");
    choose({ size: MAX_IMPORT_CHARS + 1, text });
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        "Esse arquivo é grande demais para ser um progresso do AteMusic.",
      ),
    );
    expect(text).not.toHaveBeenCalled();
  });

  it("o arquivo que não dá para ler: o aviso", async () => {
    const { announce } = setup();
    choose({ size: 10, text: () => Promise.reject(new Error("sem acesso")) });
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Não foi possível ler o arquivo."));
  });

  it("o arquivo de um dia depois do hoje desta página (aberta desde ontem): recarregar", async () => {
    const { announce } = setup();
    choose(exportFile(other, "2026-10-24"));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        "Esse arquivo é de um dia depois do de hoje nesta página. Recarregue a página e tente de novo.",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    [
      "future",
      "Há uma versão mais nova do jogo aberta. Recarregue a página para salvar seu progresso.",
    ],
    [
      "memory",
      "Este navegador não deixa guardar o progresso: importar valeria só até recarregar a página.",
    ],
  ] as const)("na sessão %s, o Importar avisa e não abre o arquivo", (mode, message) => {
    const { announce } = setup(local, mode);
    const click = vi.spyOn(fileInput(), "click");
    fireEvent.click(importButton());
    expect(click).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(message);
  });

  it("na sessão de uma versão mais nova (como o App a abre), o Exportar não baixa o vazio", () => {
    // O App lê o save mais novo como vazio e abre a sessão na memória: a trava é o `mode`.
    const raw = memoryStore({
      [SAVE_KEY]: JSON.stringify({ ...local, schemaVersion: SAVE_SCHEMA_VERSION + 1 }),
    });
    const { download, announce } = setup(local, "future", sessionStore(raw, loadSave(raw)));
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(download).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      "Há uma versão mais nova do jogo aberta. Recarregue a página para salvar seu progresso.",
    );
  });

  it("só na memória (o navegador não grava), o Exportar baixa: é o que salva a visita", () => {
    const { download } = setup(local, "memory");
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(download).toHaveBeenCalledOnce();
  });

  it("com a cota cheia, a tela relê o importado (a sessão o lê da memória) e avisa", async () => {
    const base = memoryStore({ [SAVE_KEY]: JSON.stringify(local) });
    const full: KeyValueStore = {
      ...base,
      getItem: (key) => base.getItem(key),
      setItem: () => {
        throw new Error("cota cheia");
      },
    };
    const { onImported, announce } = setup(local, "saves", full);
    choose(exportFile(other, TODAY));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Sim, substituir" }));
    expect(onImported).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(
      "Não foi possível salvar o progresso: o armazenamento do navegador está cheio.",
    );
  });

  it.each([
    ["que não é JSON", "{nada", "Esse arquivo não é um progresso do AteMusic."],
    [
      "de outro app",
      JSON.stringify({ app: "outro", save: {} }),
      "Esse arquivo não é um progresso do AteMusic.",
    ],
    [
      "de uma versão mais nova",
      JSON.stringify({
        app: "atemusic",
        kind: "progresso",
        format: 1,
        save: { ...other, schemaVersion: SAVE_SCHEMA_VERSION + 1 },
      }),
      "Esse arquivo é de uma versão mais nova do jogo. Recarregue a página e tente de novo.",
    ],
  ])("o arquivo %s: o aviso, sem pop-up e sem gravar", async (_, text, message) => {
    const { store, announce } = setup();
    choose(text);
    await waitFor(() => expect(announce).toHaveBeenCalledWith(message));
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadSave(store).save).toEqual(local);
  });
});

describe("BackupAction (o Guardar uma cópia do pop-up, P25)", () => {
  it("baixa, e a frase fica num role=status dentro do pop-up (o aria-live do App, atrás do modal, fica inerte)", () => {
    const store = memoryStore({ [SAVE_KEY]: JSON.stringify(local) });
    const download = vi.fn();
    render(<BackupAction store={store} today={TODAY} mode="saves" download={download} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Guardar uma cópia do progresso" }));
    expect(download).toHaveBeenCalledOnce();
    expect(status.textContent).toBe("O arquivo atemusic-progresso-2026-10-23.json foi baixado.");
  });

  it("com o save de uma versão mais nova (outra aba, no meio da sessão), não baixa o vazio: avisa", () => {
    const store = memoryStore({
      [SAVE_KEY]: JSON.stringify({ ...local, schemaVersion: SAVE_SCHEMA_VERSION + 1 }),
    });
    const download = vi.fn();
    render(<BackupAction store={store} today={TODAY} mode="saves" download={download} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar uma cópia do progresso" }));
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(
      "Há uma versão mais nova do jogo aberta. Recarregue a página para salvar seu progresso.",
    );
  });
});
