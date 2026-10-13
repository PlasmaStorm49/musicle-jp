import { ICONS, type IconName } from "./assets/icons.ts";

/**
 * Um ícone do style guide do designer (M12, P196): o X, o ✓ e o chevron, com os caminhos do guia
 * (assets/icons.ts, gerado). A cor é a do texto em volta (currentColor), que o CSS escolhe por
 * tema. Sempre decorativo: quem dá o sentido é o texto ao lado, também para o leitor de tela.
 */
export function Icon({ name }: { readonly name: IconName }) {
  const { viewBox, d } = ICONS[name];
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
