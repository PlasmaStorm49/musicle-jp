// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySave, type FinishedGame, type Save } from "../core/records.ts";
import { SAVE_SCHEMA_VERSION } from "../storage/migrations.ts";
import { loadSave, memoryStore, SAVE_KEY } from "../storage/save.ts";
import { exportFile } from "../storage/transfer.ts";
import { ExportButton, ProgressTransfer } from "./Progress.tsx";

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

function setup(save: Save = local) {
  const store = memoryStore({ [SAVE_KEY]: JSON.stringify(save) });
  const announce = vi.fn();
  const download = vi.fn();
  const onImported = vi.fn();
  render(
    <ProgressTransfer
      store={store}
      today={TODAY}
      announce={announce}
      download={download}
      onImported={onImported}
    />,
  );
  return { store, announce, download, onImported };
}

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("sem a escolha do arquivo");
  return input;
};

/** Escolhe um arquivo com o texto dado, como o navegador faria. */
function choose(text: string) {
  const file = new File([text], "progresso.json", { type: "application/json" });
  Object.defineProperty(fileInput(), "files", { value: [file], configurable: true });
  fireEvent.change(fileInput());
}

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

  it("o arquivo bom abre a confirmação com o resumo e o foco no Cancelar; o Cancelar não grava", async () => {
    const { store, onImported } = setup();
    choose(exportFile(other, TODAY));
    const dialog = await screen.findByRole("dialog", {
      name: "O arquivo tem 2 dias jogados e 1 medalha. Substituir o progresso deste aparelho por ele?",
    });
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

describe("ExportButton (o Guardar uma cópia do pop-up, P25)", () => {
  it("com o save de uma versão mais nova (outra aba), não baixa o vazio: avisa", () => {
    const store = memoryStore({
      [SAVE_KEY]: JSON.stringify({ ...local, schemaVersion: SAVE_SCHEMA_VERSION + 1 }),
    });
    const announce = vi.fn();
    const download = vi.fn();
    render(
      <ExportButton
        label="Guardar uma cópia do progresso"
        store={store}
        today={TODAY}
        announce={announce}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar uma cópia do progresso" }));
    expect(download).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      "Há uma versão mais nova do jogo aberta. Recarregue a página para salvar seu progresso.",
    );
  });
});
