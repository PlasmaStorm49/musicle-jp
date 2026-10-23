import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n/t.ts";

/**
 * O aviso de uma tela que não tem outro elemento principal (erro de carga, dia sem diário, Treino
 * sem rodada): leva o foco ao montar (regra 16). Sem isso, o botão que sumiu deixava o foco no
 * body, e o leitor de tela não anunciava a tela nova.
 */
export function FocusedNotice({ text }: { readonly text: ComponentChildren }) {
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => message.current?.focus(), []);
  return (
    <p ref={message} tabIndex={-1} class="focused-notice">
      {text}
    </p>
  );
}

/**
 * Dados de uma versão que este código não conhece (os de um artista, os do Anime): recarregar a
 * página, como no App.
 */
export function UpdateNotice() {
  return (
    <section class="error screen">
      <FocusedNotice text={t("load.update")} />
      <button type="button" class="primary" onClick={() => window.location.reload()}>
        {t("load.updateButton")}
      </button>
    </section>
  );
}
