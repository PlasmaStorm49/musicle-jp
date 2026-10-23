import type { ArtistListEntry } from "../core/types.ts";
import { langOf } from "../core/view.ts";
import { t } from "../i18n/t.ts";

/**
 * Um nome com o latino ao lado, quando há ("歌い手 · Utaite"): o do artista (como o da revelação,
 * ME55, P147) e o de uma medalha (P295). O ponto é decorativo, e o nome leva a língua dele.
 * Empilhado (`stacked`, as células do Superfan, P316): o latino embaixo, menor e sem o ponto, e o
 * leitor de tela ouve a pausa.
 */
export function LatinName({
  name,
  latin,
  stacked = false,
}: {
  readonly name: string;
  readonly latin: string | null;
  readonly stacked?: boolean;
}) {
  if (stacked) {
    return (
      <>
        <span lang={langOf(name)}>{name}</span>
        {latin && (
          <>
            <span class="sr-only">{t("medals.latinPause")}</span>
            <span class="latin-below">{latin}</span>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <span lang={langOf(name)}>{name}</span>
      {latin && (
        <>
          {" "}
          <span aria-hidden="true">{t("item.artistSeparator")}</span> <span>{latin}</span>
        </>
      )}
    </>
  );
}

/** O nome do artista, com o latino ao lado quando há. */
export function ArtistName({ entry }: { readonly entry: ArtistListEntry }) {
  return <LatinName name={entry.name} latin={entry.nameLatin} />;
}
