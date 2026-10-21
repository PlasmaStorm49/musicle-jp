import type { CatalogIndex } from "../core/catalog.ts";
import type { RoundState } from "../core/reducer.ts";
import { optionView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { Icon } from "./Icon.tsx";
import { ItemLabel } from "./ItemLabel.tsx";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  /** O título "Suas tentativas" só para o leitor de tela (na rodada, PR D2). */
  readonly hideTitle?: boolean;
};

/**
 * As tentativas do Desafio, na ordem, com os ícones do designer (P196, P197): o X errou, o
 * chevron pulou, o ✓ acertou. Os ícones são só desenho (aria-hidden); o leitor de tela ouve
 * "Errou:", "Pulou" ou "Acertou:" e o nome. O texto de compartilhar continua com os emojis.
 */
export function Attempts({ index, round, hideTitle = false }: Props) {
  if (round.attempts.length === 0) return null;
  return (
    <section class="attempts" aria-labelledby="attempts-title">
      <h3 id="attempts-title" class={hideTitle ? "sr-only" : undefined}>
        {t("attempts.title")}
      </h3>
      <ol class="attempt-list">
        {round.attempts.map((attempt, i) => {
          // A lista só cresce e nunca reordena: a posição é uma chave estável.
          const key = `attempt-${i + 1}`;
          if (attempt.kind === "skip") {
            return (
              <li key={key} class="attempt skip">
                <Icon name="next" /> {t("attempts.skip")}
              </li>
            );
          }
          const item = optionView(index, attempt.guessId, "song");
          return (
            <li key={key} class={attempt.correct ? "attempt right" : "attempt wrong"}>
              <Icon name={attempt.correct ? "right" : "wrong"} />
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
