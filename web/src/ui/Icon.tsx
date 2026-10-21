import { ICONS, type IconName } from "./assets/icons.ts";
import { PROVISIONAL_ICONS, type ProvisionalIconName } from "./assets/provisional-icons.ts";

/** As peças do guia e as provisórias (P218), num mapa só: com o mesmo nome, a do guia vence. */
const ALL = { ...PROVISIONAL_ICONS, ...ICONS };

export type AnyIconName = IconName | ProvisionalIconName;

/**
 * Um ícone do style guide do designer (M12, P196): o X, o ✓ e o chevron, com os caminhos do guia
 * (assets/icons.ts, gerado); e os provisórios, até o designer mandar os dele (o sol, a lua e o
 * alto-falante, assets/provisional-icons.ts, P218). A cor é a do texto em volta (currentColor),
 * que o CSS escolhe por tema. Sempre decorativo: quem dá o sentido é o texto ao lado, também para o leitor de tela.
 */
export function Icon({ name }: { readonly name: AnyIconName }) {
  const { viewBox, d } = ALL[name];
  return (
    <svg
      class={`icon icon-${name}`}
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
