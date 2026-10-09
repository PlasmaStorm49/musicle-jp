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
