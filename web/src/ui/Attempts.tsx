import type { CatalogIndex } from "../core/catalog.ts";
import type { RoundState } from "../core/reducer.ts";
import { SYMBOLS } from "../core/share.ts";
import type { Target } from "../core/types.ts";
import { optionView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { ItemLabel } from "./ItemLabel.tsx";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  readonly target: Target;
};

/**
 * As tentativas da digitação, na ordem: ❌ errou, ⬛ pulou, ✅ acertou. Os símbolos são só
 * desenho (aria-hidden); o leitor de tela ouve "Errou:", "Pulou" ou "Acertou:" e o nome.
 */
export function Attempts({ index, round, target }: Props) {
  if (round.attempts.length === 0) return null;
  return (
    <section class="attempts" aria-labelledby="attempts-title">
      <h3 id="attempts-title">{t("attempts.title")}</h3>
      <ol class="attempt-list">
        {round.attempts.map((attempt, i) => {
          // A lista só cresce e nunca reordena: a posição é uma chave estável.
          const key = `attempt-${i + 1}`;
          if (attempt.kind === "skip") {
            return (
              <li key={key} class="attempt skip">
                <span aria-hidden="true">{SYMBOLS.more}</span> {t("attempts.skip")}
              </li>
            );
          }
          const item = optionView(index, attempt.guessId, target);
          return (
            <li key={key} class={attempt.correct ? "attempt right" : "attempt wrong"}>
              <span aria-hidden="true">{attempt.correct ? SYMBOLS.right : SYMBOLS.wrong}</span>
              <span class="sr-only">
                {t(attempt.correct ? "attempts.right" : "attempts.wrong")}
              </span>{" "}
              {item ? <ItemLabel item={item} /> : t("attempts.unknown")}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
