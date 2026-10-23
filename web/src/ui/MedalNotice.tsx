// Os avisos de medalha nova (M16, P279): o pequeno, no canto de baixo à direita, que some sozinho,
// e o pop-up grande, com o "Ok". O pequeno é decorativo (`aria-hidden`): o texto dele vai para a
// região aria-live do App. O grande leva o foco ao "Ok" e o devolve ao fechar.
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { t } from "../i18n/t.ts";
import { MedalArt, type MedalKind } from "./MedalArt.tsx";
import { singleClick } from "./singleClick.ts";

/** Uma medalha do aviso, já com o nome e o desenho. */
export type NoticeItem = {
  readonly id: string;
  readonly kind: MedalKind;
  readonly name: string;
  readonly image: string | null;
  readonly letter: string;
  readonly color: number;
  /** O nome da faixa da perfeita (o do artista). */
  readonly sash: string;
};

/** Quanto tempo o aviso pequeno fica na tela. */
export const TOAST_MS = 5000;
/** Até quantas medalhas o aviso desenha; o resto fica só no texto. */
const SHOWN = 4;

function Arts({ items, size }: { readonly items: readonly NoticeItem[]; readonly size: number }) {
  return (
    <span class="medal-notice-arts">
      {items.slice(0, SHOWN).map((item) => (
        <MedalArt
          key={item.id}
          kind={item.kind}
          image={item.image}
          letter={item.letter}
          color={item.color}
          name={item.sash}
          earned
          size={size}
        />
      ))}
    </span>
  );
}

/**
 * O aviso pequeno: fora do <main>, sem receber toque nem foco, e some depois de `TOAST_MS`. O
 * temporizador é um `setTimeout` (a página pode estar sem pintar, regra 9).
 */
export function MedalToast({
  items,
  text,
  onDone,
}: {
  readonly items: readonly NoticeItem[];
  readonly text: string;
  readonly onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div class="medal-toast" aria-hidden="true">
      <Arts items={items} size={36} />
      <span class="medal-toast-text">{text}</span>
    </div>
  );
}

/**
 * O pop-up grande (P279): o título, as medalhas e o "Ok". O lugar das ações a mais (`actions`) é o
 * do "Exportar o save", que a ME103 traz. O Esc e o "Ok" fecham pelo estado do App, e não pelo
 * evento close do <dialog>, que não chega no painel do Claude (como no `ConfirmButton`).
 */
export function MedalDialog({
  title,
  items,
  onClose,
  actions,
}: {
  readonly title: string;
  readonly items: readonly NoticeItem[];
  readonly onClose: () => void;
  readonly actions?: ComponentChildren;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    // O foco de antes (o título do resumo, a tela calma): volta a ele ao fechar, ou ao título da
    // tela, se ele saiu da página.
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.current?.open) dialog.current?.showModal();
    ok.current?.focus();
    return () => {
      if (dialog.current?.open) dialog.current.close();
      const back =
        before?.isConnected && before !== document.body
          ? before
          : document.querySelector<HTMLElement>('main [tabindex="-1"]');
      back?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      class="medal-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      // O fechamento do próprio navegador, sem tecla (o voltar do Android): o estado do App fecha,
      // senão o aviso ficaria preso, montado e fechado, e os seguintes não abririam.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {/* Com 4, menores: cabem numa linha só em 320 px. */}
      <Arts items={items} size={items.length > 3 ? 52 : 72} />
      <ul class="medal-notice-names">
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <div class="medal-dialog-actions">
        {actions}
        {/* O "Ok" fica no lugar do "Ver resultado", que sumiu: o 2º toque de um toque duplo não
            pode fechar o pop-up (regra 23). */}
        <button ref={ok} type="button" class="primary" onClick={singleClick(onClose)}>
          {t("medals.notice.ok")}
        </button>
      </div>
    </dialog>
  );
}
