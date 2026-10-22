# musicle-jp

Jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do Musicle. Projeto pessoal para aprender o Claude Code. Nome público na tela: **AteMusic** (P96 a P98); a URL, o repositório, a chave do save e a semente do PRNG continuam `musicle-jp`. No ar em https://plasmastorm49.github.io/musicle-jp/ (M10) com a parada real do Japão (M11): o site publicado lê `web/public/data/`; o desenvolvimento e os testes usam a parada fictícia de `web/public/fixtures/`.

**Projeto pessoal:** sem relação com trabalho; não usa modelos nem padrões de documentação externos.

O plano completo, as decisões e os marcos (M0 a M11) estão em `docs/PLANO.md`. Leia a seção do marco antes de começar a trabalhar nele.

## Sobre o usuário

- Estudante de computação, aprendendo na prática.
- Explique cada decisão técnica em 2 ou 3 linhas. Quando algo for complexo, explique o porquê.
- Ao usar um recurso do Claude Code (subagente, hook, skill, worktree, modo de planejamento), diga qual é e para que serve.

## Ambiente

- Windows 11 com PowerShell 5.1: não existe `&&`; use `;` ou `if ($?) { ... }`.
- **Commit com aspas duplas na mensagem:** o PowerShell 5.1 quebra o argumento do `git`. Grave a mensagem num arquivo do scratchpad e use `git commit -F <arquivo>`.
- Python 3.12, Node.js 24, Git e GitHub CLI (`gh`).
- Fuso do jogo: `America/Sao_Paulo`.
- **Hook ativo:** depois de cada `Edit`/`Write`, o `.claude/hooks/format_file.py` ordena os imports e formata o arquivo: `.py` do `pipeline/` com Ruff; `.ts`, `.tsx`, `.js`, `.mjs`, `.json`, `.jsonc` e `.css` do `web/` com Biome. Releia antes de editar de novo a mesma região. Ele não formata o próprio `.claude/hooks/`: depois de editar o hook, rode o `ruff format` (a CI confere).
- O Node 24 roda `.ts` direto (type stripping); o núcleo do `web/` usa isso no teste cruzado.
- **Worktrees** (frentes em paralelo, M7 e M8): ficam em `.claude/worktrees/`. Os cuidados (o `npm ci` em cada uma, memória, sem servidor de desenvolvimento nem e2e, o merge) estão no `docs/PLANO.md`, Apêndice J.

## Mapa

| Pasta | Conteúdo |
|---|---|
| `pipeline/` | Python: busca a parada, gera `catalog.json` e `schedule.json`; os arquivos do modo por artista (M13, em `artists/`) e o catálogo do Anime (M14, em `anime/`) |
| `web/` | TypeScript + Vite + Preact; `src/core/` é a lógica pura do jogo |
| `shared/` | Schemas JSON e vetores de teste usados pelos dois lados |
| `docs/` | `PLANO.md` (decisões na seção 2; o detalhe do que falta, na seção 7) e `BACKLOG.md` (o que falta, numa linha por item, para ler) |
| `.github/` | `workflows/ci.yml`: as tarefas `pipeline`, `web` e `e2e`, checagens obrigatórias da `main`. `deploy.yml` (`pages-build`, `pages-deploy`): publica no Pages a cada merge, com a parada real (`data/`) e sem as fixtures. `update-catalog.yml` (`catalog-generate`, `catalog-pr`, `catalog-runway`): toda segunda busca a parada da Apple e abre o PR com ela e os dias novos das agendas; as conferências da tarefa que escreve ficam em `scripts/check-catalog-pr.sh`, e a reserva e a lista fechada da que gera, em `scripts/catalog-reserve.sh` e `catalog-collect.sh`, todos com teste em `pipeline/tests/`; a `catalog-runway` fica vermelha com menos de 10 dias de agenda. Nenhuma tarefa nova pode se chamar `pipeline`, `web` ou `e2e` |
| `.claude/` | Configuração do Claude Code deste projeto |

## Comandos

Tudo roda **da raiz do repositório**, com o Python do `.venv` (o Python global não tem as dependências).

| Tarefa | Comando |
|---|---|
| Preparar o ambiente (uma vez) | `python -m venv .venv` e depois `.venv\Scripts\python -m pip install -c pipeline/constraints.txt -e "pipeline[dev,romaji]"` (o extra `romaji` tem 250 MB e só serve ao `romanize`; o `constraints.txt` fixa todas as versões, P60) |
| Testes do pipeline | `.venv\Scripts\python -m pytest pipeline` |
| Lint e formato (o hook segue a configuração do pipeline) | `.venv\Scripts\python -m ruff check pipeline .claude/hooks` e `.venv\Scripts\python -m ruff format pipeline .claude/hooks` |
| Buscar a parada real do dia (único comando com rede) | `.venv\Scripts\python -m musicle_pipeline fetch --provider apple --today AAAA-MM-DD --fetched-at AAAA-MM-DDTHH:MM:SSZ` (hoje em Brasília e agora em UTC; no Windows, pegue os dois pelo `TimeZoneInfo` do PowerShell: o Git Bash ignora o fuso) |
| Completar o romaji | `.venv\Scripts\python -m musicle_pipeline romanize --provider apple` (ou `fixture`; conferir: `--check`) |
| Gerar o catálogo real | `.venv\Scripts\python -m musicle_pipeline build --provider apple --out web/public/data/catalog.json` |
| Gerar o catálogo falso | `.venv\Scripts\python -m musicle_pipeline build --provider fixture --out web/public/fixtures/catalog.json` |
| Gerar áudio e capas falsos | `.venv\Scripts\python -m musicle_pipeline fake-assets --catalog web/public/fixtures/catalog.json` (fora do Git; rode depois de clonar) |
| Acrescentar dias à agenda (nunca gera dia passado, P44: um `--today` no futuro deixaria buraco para sempre) | `.venv\Scripts\python -m musicle_pipeline schedule --catalog web/public/fixtures/catalog.json --out web/public/fixtures/schedule.json --today AAAA-MM-DD` (real: `--catalog web/public/data/catalog.json --out web/public/data/schedule.json`; a data de Brasília sai do PowerShell) |
| Validar catálogo e agenda | `.venv\Scripts\python -m musicle_pipeline validate web/public/fixtures/catalog.json --schedule web/public/fixtures/schedule.json` (real: `validate web/public/data/catalog.json --schedule web/public/data/schedule.json`) |
| Conferir que a agenda só cresceu | `.venv\Scripts\python -m musicle_pipeline schedule-check --base-ref HEAD` |
| Modo por artista (M13): buscar os artistas do `artists.toml` (rede; à mão, fora do robô) | `.venv\Scripts\python -m musicle_pipeline fetch --provider apple --artists --fetched-at AAAA-MM-DDTHH:MM:SSZ` (só alguns: `--artist ID`; snapshot que encolheu: `--force`) |
| Modo por artista: romaji, arquivos e conferência | `romanize --provider apple --artists`, depois `build-artists --provider apple` e `validate-artists --provider apple` (fictícios: `--provider fixture`) |
| Anime (M14): o catálogo e a conferência | `build-anime --provider fixture` e `validate-anime --provider fixture` (o real: `--provider apple`, depois da 1ª carga) |

Ordem quando a parada real muda: `fetch` → `romanize --provider apple` → revisar `pipeline/data/apple/romaji.json` no diff → corrigir erros em `pipeline/data/apple/aliases.toml` → `build --provider apple` → `schedule` → `validate` (confere também a agenda nova) → `schedule-check`. Nas fixtures, a curadoria fica em `pipeline/fixtures/` e entra o `fake-assets` depois do `build`.

**Web** (regras próprias em `web/CLAUDE.md`):

| Tarefa | Comando |
|---|---|
| Instalar dependências (uma vez, ou após mudar o lockfile) | `npm ci --prefix web` |
| Lint, tipos e testes com cobertura | `npm run check --prefix web` |
| Só os testes | `npm test --prefix web` |
| Servidor de desenvolvimento | `npm run dev --prefix web` (porta 5173; precisa do `fake-assets` já rodado). Lê as fixtures; `?data=real` troca pela parada real, com áudio da Apple. No Claude: pré-visualização `web` do `.claude/launch.json` |
| Build de produção | `npm run build --prefix web` |
| Ver o build como no Pages (depois do `build`; usa a parada real e a rede da Apple, e o `dist` local ainda tem `fixtures/`) | `npm run preview --prefix web`, em http://localhost:4173/musicle-jp/ |
| Testes de ponta a ponta (Playwright; precisa do `fake-assets` e de `npx --prefix web playwright install chromium` uma vez) | `npm run e2e --prefix web` |
| Regerar tipos depois de mudar `shared/schema` | `npm run types --prefix web` |

**Verificação completa** (pipeline + web, só relata, não corrige): skill **`/verificar`**.

## Regras invioláveis

1. `web/src/core/` é TypeScript puro: não importa DOM, Preact nem áudio.
2. Todo texto de tela fica em `web/src/i18n/pt-BR.ts`.
3. Arquivos gerados (`web/public/data/`, `web/public/fixtures/*.json`, `fixtures/artists/` e `fixtures/anime/`, os `romaji.json` (também os de `artists/`), os snapshots em `pipeline/data/apple/snapshots/`, `pipeline/data/apple/artists/snapshots/` e `pipeline/data/apple/anime/snapshots/`, áudio sintético) não se editam à mão: rode o pipeline. O mesmo vale para os que têm gerador próprio: `shared/vectors/prng.json` (`node shared/vectors/prng_reference.mjs`), `web/src/core/generated/` (`npm run types`) e `web/package-lock.json` (o `npm`). O `settings.json` nega a edição de todos, menos (ainda) os dos artistas e os do Anime: ampliar a lista é decisão do usuário (PLANO, seção 7).
4. A agenda (`schedule.json`) só cresce. Nunca altere um dia que já existe.
5. Mudança de esquema: atualize `shared/schema/` e os testes nos dois lados. Desde o primeiro deploy (M10), o jogo está no ar: mudança incompatível sobe o `schemaVersion` e leva migração. O `.github/scripts/check-catalog-pr.sh` recusa `schemaVersion` diferente no PR do robô (mudança de esquema nunca passa por ele), e um campo novo de URL precisa de conferência nele, no `validate.py` e no `core/apple.ts`.
6. Normalização e PRNG mudam em Python e TS juntos, com os vetores de `shared/vectors/`.
7. Nenhuma chave, token ou senha no repositório. Segredos só nos Secrets do GitHub.
8. Não baixe nem guarde áudio de preview real (termos da Apple). Em disco, só os WAV sintéticos. O pipeline nunca acessa o `previewUrl`: o áudio é só do navegador.
9. O pipeline grava os próprios arquivos em UTF-8 com `\n`. Não gere arquivo de dados com `>` ou `Out-File` no PowerShell.

## Convenções

- Código e nomes de arquivo em inglês. Documentação, commits e textos de tela em PT-BR.
- TypeScript estrito, sem `any`.
- Commits no formato `tipo: descrição` (feat, fix, chore, docs, test, refactor), em PT-BR, um assunto por commit.
- Rode a verificação antes de dizer que terminou.

## Fluxo de cada marco

Modo de planejamento → aprovação → branch do marco → implementação → verificação → revisão do diff → commits → PR → `pipeline`, `web` e `e2e` verdes → merge (merge commit). A `main` só aceita PR (ruleset sem exceção): nada de commit direto nela. Ao fechar um marco, atualize a coluna "Estado" em `docs/PLANO.md` e o "Estado" do README. Item novo do que falta entra no `docs/BACKLOG.md` e, com o detalhe, na seção 7 do PLANO; o que fica pronto sai do backlog. PR que mexe em `.github/` roda o `ci.yml` do próprio PR, que pode afrouxar as checagens e ficar verde: leia o diff do workflow antes do merge.

Todo merge na `main` publica no Pages (`deploy.yml`). **PR semanal do robô** (`catalogo/<data>`, segunda de manhã): a rotina está no README ("Publicação e atualização da parada e da agenda"). Faça o merge no mesmo dia e, enquanto ele estiver aberto, evite outro merge: o `strict` do ruleset o deixaria desatualizado.
