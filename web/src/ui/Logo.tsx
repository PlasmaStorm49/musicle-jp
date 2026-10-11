import { t } from "../i18n/t.ts";

/**
 * Rascunho A do logo (P95, P99): o 当 de 当てる num círculo vermelho. Decorativo: o nome do jogo
 * vem ao lado, em texto. Provisório até o design final, que traz o kanji como contorno, sem
 * depender da fonte japonesa do aparelho.
 */
export function Logo() {
  return (
    <svg class="logo" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle class="logo-disc" cx="50" cy="50" r="50" />
      <text
        class="logo-mark"
        lang="ja"
        x="50"
        y="52"
        text-anchor="middle"
        dominant-baseline="central"
      >
        {t("app.logoMark")}
      </text>
    </svg>
  );
}
