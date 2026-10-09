import { type MessageKey, ptBR } from "./pt-BR.ts";

/** Texto da tela pela chave, com {parâmetros} substituídos. Chave inexistente não compila. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return ptBR[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
