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
  lostDays,
  MAX_IMPORT_CHARS,
  parseImport,
  replaceSave,
} from "../storage/transfer.ts";
import { shortDate } from "./dayLabel.ts";
import { downloadText } from "./download.ts";
import { singleClick } from "./singleClick.ts";

/** Baixar um texto como arquivo: o do navegador, ou outro nos testes. */
export type Download = (name: string, text: string) => void;

/**
 * Como esta sessão guarda o progresso: no navegador ("saves"); em nenhum lugar, porque outra aba
 * gravou com uma versão mais nova do jogo ("future"); ou só na memória, até recarregar, porque o
 * navegador não deixa ("memory"). O App sabe na abertura (o `openSaves`).
 */
export type SaveMode = "saves" | "future" | "memory";

type Shared = {
  readonly store: KeyValueStore;
  /** A data do jogo (`gameDate`): a do nome do arquivo e a régua da importação. */
  readonly today: string;
  readonly mode: SaveMode;
  readonly announce: (message: string) => void;
  readonly download?: Download;
};

/**
 * Baixa o arquivo do progresso e diz o que aconteceu. O save é relido na hora (outra aba pode ter
 * gravado). Com um save de uma versão mais nova, o que daria para ler aqui seria o vazio, e um
 * arquivo vazio, importado noutro aparelho, apagaria o de lá: não baixa, e avisa. Só na memória
 * (o navegador não grava), baixa: é o que salva o jogo desta visita.
 */
function exportProgress(
  store: KeyValueStore,
  today: string,
  mode: SaveMode,
  download: Download,
): string {
  const loaded = loadSave(store);
  if (mode === "future" || loaded.notice === "future") return t("storage.future");
  if (loaded.notice === "unavailable") return t("storage.unavailable");
  const name = exportFileName(today);
  download(name, exportFile(loaded.save, today));
  return t("progress.exported", { name });
}

/** O botão que baixa o arquivo: o "Exportar" do Sobre e o "Guardar uma cópia" do pop-up (P25). */
export function ExportButton({
  label,
  store,
  today,
  mode,
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
        const message = exportProgress(store, today, mode, download);
        announce(message);
        onMessage?.(message);
      })}
    >
      {label}
    </button>
  );
}

/**
 * O "Guardar uma cópia" do pop-up de medalha nova (P25), com a frase do que aconteceu dentro do
 * pop-up: ele é modal, e a região aria-live do App, atrás dele, fica inerte. A frase vem num
 * `role="status"`, que já existe vazio, para o leitor de tela ouvir quando ela chega.
 */
export function BackupAction(props: Omit<Shared, "announce">) {
  const [message, setMessage] = useState("");
  return (
    <>
      <ExportButton {...props} label={t("progress.backup")} announce={setMessage} />
      <p class="progress-status" role="status">
        {message}
      </p>
    </>
  );
}

const ERRORS: Readonly<Record<ImportError, Parameters<typeof t>[0]>> = {
  size: "progress.error.size",
  json: "progress.error.format",
  format: "progress.error.format",
  future: "progress.error.future",
  later: "progress.error.later",
};

/** A falha da gravação, pelos mesmos avisos do resto do jogo. */
function saveError(status: Exclude<SaveStatus, "saved">): string {
  if (status === "full") return t("storage.full");
  return status === "future" ? t("storage.future") : t("storage.unavailable");
}

const daysText = (summary: ImportSummary) => tn("progress.days", summary.days);

type Pending = {
  readonly save: Save;
  readonly summary: ImportSummary;
  /** Os dias jogados aqui que o arquivo não tem: saem com a substituição. */
  readonly lost: number;
};

/**
 * A seção "Seu progresso" do Sobre. Importar substitui o progresso daqui (P24), depois da
 * confirmação com o que o arquivo traz e o que sai; o andamento deste aparelho fica
 * (`replaceSave`). Sem o navegador gravando, importar não vale: avisa, e não abre o arquivo.
 */
export function ProgressTransfer({
  store,
  today,
  mode,
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

  function pick() {
    if (mode === "future") return tell(t("storage.future"));
    if (mode === "memory") return tell(t("progress.error.memory"));
    input.current?.click();
  }

  async function onFile() {
    const file = input.current?.files?.[0];
    if (!file) return;
    if (input.current) input.current.value = ""; // o mesmo arquivo, de novo, também dispara
    // Antes de ler: um arquivo errado e grande (um vídeo) não vira texto na memória.
    if (file.size > MAX_IMPORT_CHARS) return tell(t("progress.error.size"));
    let text: string;
    try {
      text = await file.text();
    } catch {
      return tell(t("progress.error.read"));
    }
    const result = parseImport(text, today);
    if (!result.ok) return tell(t(ERRORS[result.reason]));
    const lost = lostDays(loadSave(store).save, result.save);
    setPending({ save: result.save, summary: result.summary, lost });
  }

  function confirm() {
    if (!pending) return;
    const { save, summary } = pending;
    const saved = updateSave(store, (current) => replaceSave(current, save));
    setPending(null);
    // Com a cota cheia, a sessão passa a ler o importado da memória (o sessionStore): a tela
    // acompanha, e o aviso diz que não ficou guardado.
    if (saved === "saved" || saved === "full") onImported();
    if (saved !== "saved") return tell(saveError(saved));
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
          mode={mode}
          announce={announce}
          download={download}
          onMessage={setStatus}
        />
        <button ref={importButton} type="button" onClick={singleClick(pick)}>
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
        <ConfirmImport pending={pending} onConfirm={confirm} onCancel={() => setPending(null)} />
      )}
    </section>
  );
}

/** A frase da confirmação: o que o arquivo traz (com a data, se ele diz), o que sai daqui e a pergunta. */
function confirmText({ summary, lost }: Pending): string {
  const counts = {
    days: daysText(summary),
    medals: tn("progress.medals", summary.medals),
  };
  const file =
    summary.exportedOn === null
      ? t("progress.confirmFile", counts)
      : t("progress.confirmFileDated", { ...counts, date: shortDate(summary.exportedOn) });
  const parts = [file, lost > 0 ? tn("progress.confirmLost", lost) : "", t("progress.confirmAsk")];
  return parts.filter((part) => part !== "").join(" ");
}

/**
 * A confirmação, num pop-up modal como o do reinício do Treino (ME56): o que o arquivo traz e o
 * que sai deste aparelho. O foco começa no Cancelar, e o Esc e o voltar do Android cancelam.
 */
function ConfirmImport({
  pending,
  onConfirm,
  onCancel,
}: {
  readonly pending: Pending;
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
      <p id={textId}>{confirmText(pending)}</p>
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
