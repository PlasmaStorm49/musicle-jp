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

/**
 * Um texto da tela com o nome no meio, na língua dele (ME68): "Nesta sessão (米津玄師): …" leva o
 * `lang="ja"` só no nome, para o leitor de tela não o ler com a voz do português. As duas pontas
 * saem do `tAround`. O nome latino ("Banda") não precisa de outra língua e fica no texto.
 */
export function WithName({
  around: [before, after],
  name,
}: {
  readonly around: readonly [string, string];
  readonly name: string;
}) {
  const lang = langOf(name);
  if (lang === undefined) return <>{`${before}${name}${after}`}</>;
  return (
    <>
      {before}
      <span lang={lang}>{name}</span>
      {after}
    </>
  );
}

/** O nome do artista, com o latino ao lado quando há. */
export function ArtistName({ entry }: { readonly entry: ArtistListEntry }) {
  return <LatinName name={entry.name} latin={entry.nameLatin} />;
}
