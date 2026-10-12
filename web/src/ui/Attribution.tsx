import { t } from "../i18n/t.ts";
import badge from "./assets/apple-music-badge-pt-br.svg";

type Props = {
  /** Na rodada, a playlist da parada (não entrega a resposta); na revelação, a música. */
  readonly href: string;
};

/**
 * O que os termos da Apple pedem junto de toda prévia (P69): o selo oficial, sem alteração e
 * com link para a loja, e a frase "provided courtesy of iTunes". Só na parada real.
 */
export function Attribution({ href }: Props) {
  return (
    <p class="attribution">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // No fim da página (ME58), o selo pode estar onde o "Próxima rodada" estava: o 2º clique
        // de um toque duplo nele abriria outra aba (regra 23 do web/CLAUDE.md, ME43).
        onClick={(event) => {
          if (event.detail > 1) event.preventDefault();
        }}
      >
        <img src={badge} alt={t("attribution.badge")} width={140} height={40} />
        <span class="sr-only"> {t("attribution.newTab")}</span>
      </a>
      <span>
        {t("attribution.courtesy")} <span lang="en">{t("attribution.courtesyEn")}</span>
      </span>
    </p>
  );
}
