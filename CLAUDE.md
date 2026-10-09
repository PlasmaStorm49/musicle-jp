# musicle-jp

Jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do Musicle. Projeto pessoal para aprender o Claude Code.

**Projeto pessoal:** sem relação com trabalho; não usa modelos nem padrões de documentação externos.

O plano completo, as decisões e os marcos (M0 a M11) estão em `docs/PLANO.md`. Leia a seção do marco antes de começar a trabalhar nele.

## Sobre o usuário

- Formado em Ciência da Computação, com pouca experiência prática. Está aprendendo.
- Explique cada decisão técnica em 2 ou 3 linhas. Quando algo for complexo, explique o porquê.
- Ao usar um recurso do Claude Code (subagente, hook, skill, worktree, modo de planejamento), diga qual é e para que serve.

## Ambiente

- Windows 11 com PowerShell 5.1: não existe `&&`; use `;` ou `if ($?) { ... }`.
- **Commit com aspas duplas na mensagem:** o PowerShell 5.1 quebra o argumento do `git`. Grave a mensagem num arquivo do scratchpad e use `git commit -F <arquivo>`.
- Python 3.12, Node.js LTS, Git e GitHub CLI (`gh`).
- Fuso do jogo: `America/Sao_Paulo`.
- **Hook ativo:** depois de cada `Edit`/`Write` num `.py` do `pipeline/`, o `.claude/hooks/format_file.py` ordena os imports e formata o arquivo. Releia antes de editar de novo a mesma região.

## Mapa

| Pasta | Conteúdo |
|---|---|
| `pipeline/` | Python: busca a parada, gera `catalog.json` e `schedule.json` |
| `web/` | TypeScript + Vite + Preact; `src/core/` é a lógica pura do jogo |
| `shared/` | Schemas JSON e vetores de teste usados pelos dois lados |
| `docs/` | `PLANO.md` e decisões (`decisoes/ADR-*.md`) |
| `.claude/` | Configuração do Claude Code deste projeto |

## Comandos

Tudo roda **da raiz do repositório**, com o Python do `.venv` (o Python global não tem as dependências).

| Tarefa | Comando |
|---|---|
| Preparar o ambiente (uma vez) | `python -m venv .venv` e depois `.venv\Scripts\python -m pip install -e "pipeline[dev,romaji]"` (o extra `romaji` tem 250 MB e só serve ao `romanize`) |
| Testes do pipeline | `.venv\Scripts\python -m pytest pipeline` |
| Lint e formato | `.venv\Scripts\python -m ruff check pipeline` e `.venv\Scripts\python -m ruff format pipeline` |
| Completar o romaji | `.venv\Scripts\python -m musicle_pipeline romanize --provider fixture` (conferir: `--check`) |
| Gerar o catálogo falso | `.venv\Scripts\python -m musicle_pipeline build --provider fixture --out web/public/fixtures/catalog.json` |
| Gerar áudio e capas falsos | `.venv\Scripts\python -m musicle_pipeline fake-assets --catalog web/public/fixtures/catalog.json` (fora do Git; rode depois de clonar) |
| Acrescentar dias à agenda | `.venv\Scripts\python -m musicle_pipeline schedule --catalog web/public/fixtures/catalog.json --out web/public/fixtures/schedule.json --today AAAA-MM-DD` |
| Validar catálogo e agenda | `.venv\Scripts\python -m musicle_pipeline validate web/public/fixtures/catalog.json --schedule web/public/fixtures/schedule.json` |
| Conferir que a agenda só cresceu | `.venv\Scripts\python -m musicle_pipeline schedule-check --base-ref HEAD` |

Ordem quando a parada muda: `romanize` → revisar `pipeline/data/romaji.json` no diff → corrigir erros em `pipeline/data/aliases.toml` → `build` → `fake-assets` → `schedule` → `schedule-check`.

A partir do M4: `npm run dev --prefix web`, `npm test --prefix web` e a skill `/verificar`.

## Regras invioláveis

1. `web/src/core/` é TypeScript puro: não importa DOM, Preact nem áudio.
2. Todo texto de tela fica em `web/src/i18n/pt-BR.ts`.
3. Arquivos gerados (`web/public/data/`, `web/public/fixtures/*.json`, áudio sintético) não se editam à mão: rode o pipeline.
4. A agenda (`schedule.json`) só cresce. Nunca altere um dia que já existe.
5. Mudança de esquema: atualize `shared/schema/` e os testes nos dois lados. Até o primeiro deploy (M10), o `schemaVersion` fica 1 e não há migração; depois, suba o `schemaVersion` e escreva a migração.
6. Normalização e PRNG mudam em Python e TS juntos, com os vetores de `shared/vectors/`.
7. Nenhuma chave, token ou senha no repositório. Segredos só nos Secrets do GitHub.
8. Não baixe nem guarde áudio de preview real (termos da Apple). Em disco, só os WAV sintéticos.
9. O pipeline grava os próprios arquivos em UTF-8 com `\n`. Não gere arquivo de dados com `>` ou `Out-File` no PowerShell.

## Convenções

- Código e nomes de arquivo em inglês. Documentação, commits e textos de tela em PT-BR.
- TypeScript estrito, sem `any`.
- Commits no formato `tipo: descrição` (feat, fix, chore, docs, test, refactor), em PT-BR, um assunto por commit.
- Rode a verificação antes de dizer que terminou.

## Fluxo de cada marco

Modo de planejamento → aprovação → implementação → verificação → revisão do diff → commit. Ao fechar um marco, atualize a coluna "Estado" em `docs/PLANO.md`.
