import { useEffect, useRef } from "preact/hooks";

/**
 * O aviso de uma tela que não tem outro elemento principal (erro de carga, dia sem diário, Treino
 * sem rodada): leva o foco ao montar (regra 16). Sem isso, o botão que sumiu deixava o foco no
 * body, e o leitor de tela não anunciava a tela nova.
 */
export function FocusedNotice({ text }: { readonly text: string }) {
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => message.current?.focus(), []);
  return (
    <p ref={message} tabIndex={-1} class="focused-notice">
      {text}
    </p>
  );
}
