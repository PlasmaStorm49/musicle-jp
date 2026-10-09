# musicle-jp

Jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do Musicle. Projeto pessoal para aprender o Claude Code.

**Projeto pessoal:** sem relação com trabalho; não usa modelos nem padrões de documentação externos.

O plano completo, as decisões e os marcos (M0 a M11) estão em `docs/PLANO.md`. Leia a seção do marco antes de começar a trabalhar nele.

## Sobre o usuário

- Estudante de computação, aprendendo na prática.
- Explique cada decisão técnica em 2 ou 3 linhas. Quando algo for complexo, explique o porquê.
- Ao usar um recurso do Claude Code (subagente, hook, skill, worktree, modo de planejamento), diga qual é e para que serve.

## Ambiente

- Windows 11 com PowerShell 5.1: não existe `&&`; use `;` ou `if ($?) { ... }`.
- **Commit com aspas duplas na mensagem:** o PowerShell 5.1 quebra o argumento do `git`. Grave a mensagem num arquivo do scratchpad e use `git commit -F <arquivo>`.
- Python 3.12, Node.js LTS, Git e GitHub CLI (`gh`).
- Fuso do jogo: `America/Sao_Paulo`.
- **Hook ativo:** depois de cada `Edit`/`Write`, o `.claude/hooks/format_file.py` ordena os imports e formata o arquivo: `.py` do `pipeline/` com Ruff; `.ts`, `.tsx`, `.json` e `.css` do `web/` com Biome. Releia antes de editar de novo a mesma região.
- O Node 24 roda `.ts` direto (type stripping); o núcleo do `web/` usa isso no teste cruzado.
- **Worktrees** (frentes em paralelo, M7 e M8): ficam em `.claude/worktrees/` (ignorada no Git); sem remoto, partem do `HEAD` local. Cada uma precisa de `npm ci --prefix web` (o `node_modules` não é compartilhado). Duas frentes rodando testes ao mesmo tempo pedem memória livre: com pouca, o Git falha com "out of memory" ao criar a worktree. Na worktree, Vitest com `--maxWorkers=2` e nada de servidor de desenvolvimento (a porta 5173 é fixa e o áudio falso não está lá). Para o conflito no merge ser pequeno, combine antes quais trechos e chaves de texto são de cada frente (M8). Depois do merge: `git worktree remove` (com `git worktree unlock` antes, se estiver travada) e `git branch -d`.

## Mapa

| Pasta | Conteúdo |
|---|---|
| `pipeline/` | Python: busca a parada, gera `catalog.json` e `schedule.json` |
| `web/` | TypeScript + Vite + Preact; `src/core/` é a lógica pura do jogo |
| `shared/` | Schemas JSON e vetores de teste usados pelos dois lados |
| `docs/` | `PLANO.md` (decisões na seção 2) |
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

**Web** (regras próprias em `web/CLAUDE.md`):

| Tarefa | Comando |
|---|---|
| Instalar dependências (uma vez, ou após mudar o lockfile) | `npm ci --prefix web` |
| Lint, tipos e testes com cobertura | `npm run check --prefix web` |
| Só os testes | `npm test --prefix web` |
| Servidor de desenvolvimento | `npm run dev --prefix web` (porta 5173; precisa do `fake-assets` já rodado). No Claude: pré-visualização `web` do `.claude/launch.json` |
| Build de produção | `npm run build --prefix web` |
| Testes de ponta a ponta (Playwright; precisa do `fake-assets` e de `npx --prefix web playwright install chromium` uma vez) | `npm run e2e --prefix web` |
| Regerar tipos depois de mudar `shared/schema` | `npm run types --prefix web` |

**Verificação completa** (pipeline + web, só relata, não corrige): skill **`/verificar`**.

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
