import { ICONS, type IconName } from "./assets/icons.ts";
import { PROVISIONAL_ICONS, type ProvisionalIconName } from "./assets/provisional-icons.ts";
import { STROKE_ICONS, type StrokeIconName } from "./assets/stroke-icons.ts";

/** As peças do guia, as provisórias (P218) e as de traço, num mapa só: com o mesmo nome, a do guia vence. */
const ALL = { ...PROVISIONAL_ICONS, ...STROKE_ICONS, ...ICONS };

export type AnyIconName = IconName | ProvisionalIconName | StrokeIconName;

/**
 * Um ícone do style guide do designer (M12, P196): o X, o ✓ e o chevron, com os caminhos do guia
 * (assets/icons.ts, gerado); e os provisórios, até o designer mandar os dele (o sol, a lua e o
 * alto-falante, assets/provisional-icons.ts, P218). A cor é a do texto em volta (currentColor),
 * que o CSS escolhe por tema. Sempre decorativo: quem dá o sentido é o texto ao lado, também para o leitor de tela.
 * O ✓ do guia vem com o espelho (`transform`, gerado com ele; o usuário, 27/10/2026). Os de traço
 * (o olho e o "repeat" do Tabler, as ajudas do Setlist, assets/stroke-icons.ts) são desenhados em
 * contorno, e não preenchidos.
 */
export function Icon({ name }: { readonly name: AnyIconName }) {
  const icon = ALL[name];
  const transform = "transform" in icon ? icon.transform : undefined;
  if ("stroke" in icon) {
    return (
      <svg
        class={`icon icon-${name}`}
        viewBox={icon.viewBox}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d={icon.d} />
      </svg>
    );
  }
  return (
    <svg
      class={`icon icon-${name}`}
      viewBox={icon.viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={icon.d} transform={transform} />
    </svg>
  );
}
