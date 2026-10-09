import type { CatalogIndex } from "../core/catalog.ts";
import type { RoundState } from "../core/reducer.ts";
import type { Target } from "../core/types.ts";
import { optionView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { ItemLabel } from "./ItemLabel.tsx";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  readonly target: Target;
  readonly onPick: (id: string) => void;
  readonly onGiveUp: () => void;
};

/** As 4 opções durante a rodada. */
export function Options({ index, round, target, onPick, onGiveUp }: Props) {
  return (
    <section class="options" aria-labelledby="question">
      <h2 id="question">{t("game.question")}</h2>
      <ul>
        {round.options.map((id) => {
          const item = optionView(index, id, target);
          return (
            item && (
              <li key={id}>
                <button type="button" class="option" onClick={() => onPick(id)}>
                  <ItemLabel item={item} />
                </button>
              </li>
            )
          );
        })}
      </ul>
      <button type="button" class="link" onClick={onGiveUp}>
        {t("options.giveUp")}
      </button>
    </section>
  );
}
