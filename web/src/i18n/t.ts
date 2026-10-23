import { type MessageKey, ptBR } from "./pt-BR.ts";

function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Texto da tela pela chave, com {parâmetros} substituídos. Chave inexistente não compila. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return fill(ptBR[key], params);
}

/** As chaves cujo texto tem o {slot}: só elas servem ao `tAround`. */
export type KeyWith<Slot extends string> = {
  [K in MessageKey]: (typeof ptBR)[K] extends `${string}{${Slot}}${string}` ? K : never;
}[MessageKey];

/**
 * O texto de antes e o de depois do {slot}, com os outros parâmetros já substituídos: a tela põe
 * no meio um elemento, como o nome do artista com a língua dele (ME68). Uma chave sem o {slot} não
 * compila (`KeyWith`).
 */
export function tAround<Slot extends string>(
  key: KeyWith<Slot>,
  slot: Slot,
  params: Record<string, string | number> = {},
): readonly [string, string] {
  const marker = `{${slot}}`;
  const text: string = ptBR[key];
  const at = text.indexOf(marker);
  return [fill(text.slice(0, at), params), fill(text.slice(at + marker.length), params)];
}

/** Chaves com variante de plural: "x.one" e "x.other" existem → "x" é uma PluralKey. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.one`
    ? `${Base}.other` extends MessageKey
      ? Base
      : never
    : never;
}[MessageKey];

const plural = new Intl.PluralRules("pt-BR");

/**
 * Texto com plural: tn("count.points", 1) → "1 ponto"; tn("count.points", 5) → "5 pontos".
 * Atenção: pelo CLDR, em pt-BR o ZERO é singular (select(0) === "one", "0 ponto"). No uso
 * brasileiro corrente se diz "0 pontos", então o zero vai para o plural de propósito.
 */
export function tn(
  key: PluralKey,
  count: number,
  params: Record<string, string | number> = {},
): string {
  const variant = count !== 0 && plural.select(count) === "one" ? "one" : "other";
  return fill(ptBR[`${key}.${variant}` as MessageKey], { count, ...params });
}
