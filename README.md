# musicle-jp

Jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do [Musicle](https://musicle.app/). Projeto pessoal de aprendizado do Claude Code.

**[Jogar](https://plasmastorm49.github.io/musicle-jp/)** (por enquanto com dados fictícios: uma parada inventada e áudio sintético).

> Nome provisório. O nome público do jogo ainda vai ser definido.

## Como funciona

- Você ouve um trecho de uma música popular no Japão e tenta adivinhar.
- **O que adivinhar:** a música (título) ou o álbum.
- **Como responder:** escolhendo entre 4 opções ou digitando com autocompletar. O trecho começa com 1 s e cresce a cada erro.
- **Diário:** dois desafios por dia (Música e Álbum), iguais para todos, com virada à meia-noite de Brasília.
- **Treino:** rodadas ilimitadas.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `pipeline/` | Script Python que busca a parada do Japão e gera o catálogo e a agenda em JSON |
| `web/` | Jogo em TypeScript + Vite + Preact, roda só no navegador |
| `shared/` | Contrato entre os dois lados: schemas JSON e vetores de teste |
| `docs/` | Plano do projeto e decisões |

## Estado

No ar no GitHub Pages, ainda com dados fictícios: uma parada inventada e áudio sintético (cada segundo toca uma nota). Os diários Música e Álbum e o Treino já são jogáveis. Falta ligar a parada real do Japão (M11). Andamento por marco em [docs/PLANO.md](docs/PLANO.md).

## Como rodar

Precisa de Python 3.12, Node.js 24 e Git. Comandos a partir da raiz do repositório:

```bash
python -m venv .venv
.venv/bin/python -m pip install -c pipeline/constraints.txt -e "pipeline[dev]"   # no Windows: .venv\Scripts\python
.venv/bin/python -m musicle_pipeline fake-assets --catalog web/public/fixtures/catalog.json
npm ci --prefix web
npm run dev --prefix web
```

Depois, abra http://localhost:5173. O `fake-assets` gera o áudio e as capas falsos, que ficam fora do Git.

Testes:

- pipeline: `.venv/bin/python -m pytest pipeline`
- web (lint, tipos, testes com cobertura): `npm run check --prefix web`
- ponta a ponta (Playwright, precisa do `fake-assets`): `npx --prefix web playwright install chromium` uma vez, depois `npm run e2e --prefix web`

A CI do GitHub roda tudo isso em cada PR, e a `main` só aceita merge com as três checagens verdes (`pipeline`, `web` e `e2e`).

Para ver o build como ele fica publicado: `npm run build --prefix web` e depois `npm run preview --prefix web`, em http://localhost:4173/musicle-jp/.

## Publicação e atualização da agenda

- **Deploy:** todo merge na `main` publica o site no GitHub Pages (`.github/workflows/deploy.yml`).
- **Agenda:** toda segunda às 06:17 de Brasília, a Action `update-catalog.yml` acrescenta os dias até hoje + 21 e abre um PR (`catalogo/<data>`) só com eles. Para publicar:
  1. confira que só o `web/public/fixtures/schedule.json` mudou;
  2. clique em "Approve workflows to run" (PR aberto por Action precisa dessa aprovação para rodar as checagens);
  3. com `pipeline`, `web` e `e2e` verdes, faça o merge no mesmo dia. Dia que passa sem agenda fica sem desafio para sempre: a agenda nunca gera dia passado.
- **Rodar fora de hora:** `gh workflow run update-catalog.yml`.
- **Se a Action agendada parar:** o GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório. Para religar: `gh workflow enable update-catalog.yml`.

## Licença

[MIT](LICENSE).

## Créditos

Quando a fonte de dados real for ligada (M11), dados e trechos de áudio virão da Apple (iTunes), com atribuição e link para a loja junto ao player. Projeto sem fins comerciais.
