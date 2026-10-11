---
name: verificar
description: Roda toda a verificação do projeto musicle-jp (pipeline Python e web TypeScript) e resume o resultado numa tabela, sem corrigir nada. Use antes de dizer que uma tarefa terminou, antes de um commit, ou quando o usuário pedir para verificar, testar ou checar o projeto.
---

# Verificar o projeto

Rode da raiz do repositório, **um comando por vez** (PowerShell 5.1: não use `&&`). Para cada passo, anote se passou, os números (testes, cobertura) e a primeira mensagem de erro.

| # | Passo | Comando |
|---|---|---|
| 1 | Lint do pipeline e do hook | `.venv\Scripts\python -m ruff check pipeline .claude/hooks` |
| 2 | Formato do pipeline e do hook | `.venv\Scripts\python -m ruff format --check pipeline .claude/hooks` |
| 3 | Testes do pipeline (inclui o teste cruzado Python × TS e o do hook) | `.venv\Scripts\python -m pytest pipeline -q` |
| 4 | Cobertura do romaji (fixtures e parada real) | `.venv\Scripts\python -m musicle_pipeline romanize --provider fixture --check` e `... romanize --provider apple --check` |
| 5 | Catálogo e agenda (fixtures e parada real) | `.venv\Scripts\python -m musicle_pipeline validate web/public/fixtures/catalog.json --schedule web/public/fixtures/schedule.json` e `... validate web/public/data/catalog.json` (com `--schedule web/public/data/schedule.json` quando ela existir) |
| 6 | Agenda só cresceu | `.venv\Scripts\python -m musicle_pipeline schedule-check --base-ref HEAD` |
| 7 | Web: Biome, os três tsconfig, Vitest com cobertura ≥ 90% no núcleo | `npm run check --prefix web` |
| 8 | Web: build de produção | `npm run build --prefix web` |
| 9 | Motor de áudio falso fora do build (nenhuma linha = passou) | `Get-ChildItem web\dist -Recurse -File \| Select-String -Pattern musicle-fake-audio -List` |
| 10 | Base do GitHub Pages no build (precisa dar `True`) | `Select-String -Path web\dist\index.html -Pattern '/musicle-jp/assets/' -Quiet` |
| 11 | Ponta a ponta (opcional; a CI sempre roda) | `npm run e2e --prefix web` |

Antes de começar:

- Sem `.venv`: avise o usuário e pare (o ambiente está em `CLAUDE.md`, seção Comandos).
- Sem `web/node_modules`: rode `npm ci --prefix web` e diga que rodou.
- Passo 11: precisa do `fake-assets` já rodado e do Chromium do Playwright (`npx --prefix web playwright install chromium`). Sem eles, marque o passo como "não rodado" e diga por quê. Ele reaproveita o servidor da porta 5173, se houver (por isso, numa worktree, não rode).

## Relatório

1. Tabela: **Passo | Resultado | Detalhe** (ex.: "242 passaram", "cobertura 99,2%", a primeira linha do erro).
2. Se algo falhou: a causa provável e a correção sugerida, numeradas.

**Não corrija nada sem perguntar.** Esta skill só verifica: o usuário decide o que fazer com o resultado.
