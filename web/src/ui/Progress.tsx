// O progresso num arquivo, na tela (ME103): o "Seu progresso" do Sobre, com o exportar e o
// importar, e o botão de guardar uma cópia, que o pop-up das medalhas grandes também usa (P25). A
// conta fica em storage/transfer.ts; aqui, o arquivo baixado e o escolhido, a confirmação e os avisos.
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { Save } from "../core/records.ts";
import { t, tn } from "../i18n/t.ts";
import { type KeyValueStore, loadSave, type SaveStatus, updateSave } from "../storage/save.ts";
import {
  exportFile,
  exportFileName,
  type ImportError,
  type ImportSummary,
  parseImport,
  replaceSave,
} from "../storage/transfer.ts";
import { downloadText } from "./download.ts";
import { singleClick } from "./singleClick.ts";

/** Baixar um texto como arquivo: o do navegador, ou outro nos testes. */
export type Download = (name: string, text: string) => void;

type Shared = {
  readonly store: KeyValueStore;
  /** A data do jogo (`gameDate`): a do nome do arquivo e a régua da importação. */
  readonly today: string;
  readonly announce: (message: string) => void;
  readonly download?: Download;
};

/**
 * Baixa o arquivo do progresso e diz o que aconteceu. O save é relido na hora (outra aba pode ter
 * gravado). Com um save de uma versão mais nova (outra aba), o que daria para ler aqui seria o
 * vazio: não baixa, e avisa.
 */
function exportProgress(store: KeyValueStore, today: string, download: Download): string {
  const loaded = loadSave(store);
  if (loaded.notice === "future") return t("storage.future");
  const name = exportFileName(today);
  download(name, exportFile(loaded.save, today));
  return t("progress.exported", { name });
}

/** O botão que baixa o arquivo: o "Exportar" do Sobre e o "Guardar uma cópia" do pop-up (P25). */
export function ExportButton({
  label,
  store,
  today,
  announce,
  download = downloadText,
  onMessage,
}: Shared & {
  readonly label: string;
  /** Além do aviso ao leitor de tela, quem quiser mostrar a frase na tela. */
  readonly onMessage?: (message: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={singleClick(() => {
        const message = exportProgress(store, today, download);
        announce(message);
        onMessage?.(message);
      })}
    >
      {label}
    </button>
  );
}

const ERRORS: Readonly<Record<ImportError, Parameters<typeof t>[0]>> = {
  size: "progress.error.size",
  json: "progress.error.format",
  format: "progress.error.format",
  future: "progress.error.future",
};

/** A falha da gravação, pelos mesmos avisos do resto do jogo. */
function saveError(status: Exclude<SaveStatus, "saved">): string {
  if (status === "full") return t("storage.full");
  return status === "future" ? t("storage.future") : t("storage.unavailable");
}

const daysText = (summary: ImportSummary) => tn("progress.days", summary.days);

type Pending = { readonly save: Save; readonly summary: ImportSummary };

/**
 * A seção "Seu progresso" do Sobre. Importar substitui o progresso daqui (P24), depois da
 * confirmação com o que o arquivo traz; o andamento deste aparelho fica (`replaceSave`).
 */
export function ProgressTransfer({
  store,
  today,
  announce,
  download = downloadText,
  onImported,
}: Shared & {
  /** O save mudou: quem o guarda o relê (o App, para a nav, o ✓ e as estatísticas). */
  readonly onImported: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  const tell = (message: string) => {
    setStatus(message);
    announce(message);
  };

  // Fechado o pop-up da confirmação, o foco volta ao Importar (regra 16).
  useEffect(() => {
    if (pending) asked.current = true;
    else if (asked.current) importButton.current?.focus();
  }, [pending]);

  async function onFile() {
    const file = input.current?.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      tell(t("progress.error.read"));
      return;
    } finally {
      // O mesmo arquivo, escolhido de novo, também dispara o change.
      if (input.current) input.current.value = "";
    }
    const result = parseImport(text, today);
    if (!result.ok) {
      tell(t(ERRORS[result.reason]));
      return;
    }
    setPending({ save: result.save, summary: result.summary });
  }

  function confirm() {
    if (!pending) return;
    const { save, summary } = pending;
    const saved = updateSave(store, (current) => replaceSave(current, save));
    setPending(null);
    if (saved !== "saved") {
      tell(saveError(saved));
      return;
    }
    onImported();
    tell(
      t(summary.dropped ? "progress.importedDropped" : "progress.imported", {
        days: daysText(summary),
      }),
    );
  }

  return (
    <section class="about-part" aria-labelledby="about-progress">
      <h2 id="about-progress" class="about-heading">
        {t("progress.title")}
      </h2>
      <p class="about-text">{t("progress.intro")}</p>
      <div class="progress-actions">
        <ExportButton
          label={t("progress.export")}
          store={store}
          today={today}
          announce={announce}
          download={download}
          onMessage={setStatus}
        />
        <button
          ref={importButton}
          type="button"
          onClick={singleClick(() => input.current?.click())}
        >
          {t("progress.import")}
        </button>
      </div>
      {/* A escolha do arquivo do navegador: escondida, aberta pelo Importar. */}
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={() => void onFile()}
      />
      {status && <p class="about-text progress-status">{status}</p>}
      {pending && (
        <ConfirmImport
          summary={pending.summary}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

/**
 * A confirmação, num pop-up modal como o do reinício do Treino (ME56): o que o arquivo traz e o
 * que vai sair. O foco começa no Cancelar, e o Esc e o voltar do Android cancelam.
 */
function ConfirmImport({
  summary,
  onConfirm,
  onCancel,
}: {
  readonly summary: ImportSummary;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const textId = useId();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    cancel.current?.focus();
    return () => {
      if (dialog.current?.open) dialog.current.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      class="practice-restart"
      aria-labelledby={textId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <p id={textId}>
        {t("progress.confirm", {
          days: daysText(summary),
          medals: tn("progress.medals", summary.medals),
        })}
      </p>
      <div class="practice-restart-actions">
        <button type="button" class="primary" onClick={singleClick(onConfirm)}>
          {t("progress.confirmYes")}
        </button>
        {/* Fecha o pop-up: o 2º clique cairia no que está embaixo (regra 23). */}
        <button ref={cancel} type="button" onClick={singleClick(onCancel)}>
          {t("practice.restartCancel")}
        </button>
      </div>
    </dialog>
  );
}
