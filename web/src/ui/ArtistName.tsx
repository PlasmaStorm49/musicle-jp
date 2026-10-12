import type { ArtistListEntry } from "../core/types.ts";
import { langOf } from "../core/view.ts";
import { t } from "../i18n/t.ts";

/** O nome do artista, com o latino ao lado quando há (como o artista da revelação, ME55, P147). */
export function ArtistName({ entry }: { readonly entry: ArtistListEntry }) {
  return (
    <>
      <span lang={langOf(entry.name)}>{entry.name}</span>
      {entry.nameLatin && (
        <>
          {" "}
          <span aria-hidden="true">{t("item.artistSeparator")}</span> <span>{entry.nameLatin}</span>
        </>
      )}
    </>
  );
}
