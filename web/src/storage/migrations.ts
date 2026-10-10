// Migrações do formato salvo: uma função por versão, de N para N+1. Hoje só existe a v1.
// Quando o formato mudar (desde o primeiro deploy, no M10; web/CLAUDE.md, regra 12), a v2 entra
// aqui com a função 1 → 2 e um teste que lê um save v1 real e chega no v2.

export const SAVE_SCHEMA_VERSION = 1;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Leva um save da versão `from` até a atual. Versão sem migração conhecida: erro. */
export function migrate(data: Record<string, unknown>, from: number): Record<string, unknown> {
  let current = data;
  for (let version = from; version < SAVE_SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`não há migração do save v${version}`);
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return current;
}
