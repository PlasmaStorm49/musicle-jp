import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/t.ts";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly text: string;
  readonly announce: (message: string) => void;
};

/** Quanto tempo o botão diz "Copiado!" antes de voltar. */
const COPIED_MS = 2000;

/**
 * Copia o resultado para a área de transferência. O navigator.clipboard só existe em HTTPS ou
 * localhost e precisa ser chamado dentro do clique; sem ele, mostra o texto selecionado. Sem a
 * prévia do texto (PR D3): as células do resumo já mostram o resultado.
 */
export function ShareButton({ text, announce }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state === "manual") {
      area.current?.focus();
      area.current?.select();
    }
    if (state !== "copied") return;
    const id = setTimeout(() => setState("idle"), COPIED_MS);
    return () => clearTimeout(id);
  }, [state]);

  function share() {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) {
      setState("manual");
      return;
    }
    clipboard.writeText(text).then(
      () => {
        setState("copied");
        announce(t("share.copied"));
      },
      () => setState("manual"),
    );
  }

  return (
    <section class="share">
      {/* O 2º clique de um toque duplo no "Ver resultado" cairia aqui (regra 23). */}
      <button type="button" class="primary" onClick={singleClick(share)}>
        {/* O "Copiado!" só na tela: o nome do botão focado não muda, e quem usa leitor de tela ouve
            o aviso uma vez só, pelo aria-live. */}
        {state === "copied" ? (
          <>
            <span aria-hidden="true">{t("share.copiedShort")}</span>
            <span class="sr-only">{t("share.button")}</span>
          </>
        ) : (
          t("share.button")
        )}
      </button>
      {state === "manual" && (
        <label class="share-manual">
          {t("share.manual")}
          <textarea ref={area} readOnly rows={6} value={text} />
        </label>
      )}
    </section>
  );
}
