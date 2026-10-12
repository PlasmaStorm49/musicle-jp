import type { CatalogIndex } from "../core/catalog.ts";
import type { RoundState } from "../core/reducer.ts";
import { optionView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { Cover, ItemLabel } from "./ItemLabel.tsx";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  /** Resolve o endereço das capas. */
  readonly resolveUrl: (url: string) => string;
  readonly onPick: (id: string) => void;
  readonly onGiveUp: () => void;
};

/** As 4 opções do Normal durante a rodada: álbuns, com capa (P51). */
export function Options({ index, round, resolveUrl, onPick, onGiveUp }: Props) {
  return (
    <section class="options" aria-labelledby="question">
      <h2 id="question">{t("question.album")}</h2>
      <ul>
        {round.options.map((id) => {
          const item = optionView(index, id, "album");
          return (
            item && (
              <li key={id}>
                <button type="button" class="option" onClick={() => onPick(id)}>
                  <Cover item={item} resolveUrl={resolveUrl} />
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
