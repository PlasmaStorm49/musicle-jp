import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/t.ts";

type Props = {
  readonly text: string;
  readonly announce: (message: string) => void;
};

/**
 * Copia o resultado para a área de transferência. O navigator.clipboard só existe em HTTPS ou
 * localhost e precisa ser chamado dentro do clique; sem ele, mostra o texto selecionado.
 */
export function ShareButton({ text, announce }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state === "manual") {
      area.current?.focus();
      area.current?.select();
    }
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
      <pre class="share-preview" aria-hidden="true">
        {text}
      </pre>
      <button type="button" class="primary" onClick={share}>
        {t("share.button")}
      </button>
      {state === "copied" && <p class="share-done">{t("share.copied")}</p>}
      {state === "manual" && (
        <label class="share-manual">
          {t("share.manual")}
          <textarea ref={area} readOnly rows={6} value={text} />
        </label>
      )}
    </section>
  );
}
