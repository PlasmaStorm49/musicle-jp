# musicle-jp

Jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do [Musicle](https://musicle.app/). Projeto pessoal de aprendizado do Claude Code.

**[Jogar](https://plasmastorm49.github.io/musicle-jp/)**: a parada real do Japão (Apple Music, as 100 mais tocadas), com as prévias de 30 s da Apple.

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

No ar no GitHub Pages com a parada real do Japão desde 11/10/2026 (M11): os diários Música e Álbum e o Treino. A atualização semanal da parada real pela Action é o último passo do M11. No desenvolvimento, o jogo usa uma parada inventada com áudio sintético (cada segundo toca uma nota). Andamento por marco em [docs/PLANO.md](docs/PLANO.md).

## Como rodar

Precisa de Python 3.12, Node.js 24 e Git. Comandos a partir da raiz do repositório:

```bash
python -m venv .venv
.venv/bin/python -m pip install -c pipeline/constraints.txt -e "pipeline[dev]"   # no Windows: .venv\Scripts\python
.venv/bin/python -m musicle_pipeline fake-assets --catalog web/public/fixtures/catalog.json
npm ci --prefix web
npm run dev --prefix web
```

Depois, abra http://localhost:5173. O `fake-assets` gera o áudio e as capas falsos, que ficam fora do Git. Para jogar a parada real no desenvolvimento, abra http://localhost:5173/?data=real (as prévias vêm da Apple, pela rede).

Testes:

- pipeline: `.venv/bin/python -m pytest pipeline`
- web (lint, tipos, testes com cobertura): `npm run check --prefix web`
- ponta a ponta (Playwright, precisa do `fake-assets`): `npx --prefix web playwright install chromium` uma vez, depois `npm run e2e --prefix web`

A CI do GitHub roda tudo isso em cada PR, e a `main` só aceita merge com as três checagens verdes (`pipeline`, `web` e `e2e`).

Para ver o build como ele fica publicado: `npm run build --prefix web` e depois `npm run preview --prefix web`, em http://localhost:4173/musicle-jp/.

## Publicação e atualização da parada e da agenda

- **Deploy:** todo merge na `main` publica o site no GitHub Pages (`.github/workflows/deploy.yml`).
- **Parada e agenda:** toda segunda às 06:17 de Brasília, a Action `update-catalog.yml` busca a parada da Apple, refaz o catálogo, acrescenta os dias até hoje + 21 e abre um PR (`catalogo/<data>`). Para publicar:
  1. confira que mudou só o que a lista fechada permite: `pipeline/data/apple/snapshots/<data>.json` (novo), `pipeline/data/apple/romaji.json`, `web/public/data/catalog.json`, `web/public/data/schedule.json` e `web/public/fixtures/schedule.json` (a Action já recusa qualquer outra coisa);
  2. leia o romaji novo listado no PR. Se algum estiver errado, corrija no `pipeline/data/apple/aliases.toml` num PR à parte, que pode entrar depois;
  3. clique em "Approve workflows to run" (PR aberto por Action precisa dessa aprovação para rodar as checagens);
  4. com `pipeline`, `web` e `e2e` verdes, faça o merge no mesmo dia. Dia que passa sem agenda fica sem desafio para sempre: a agenda nunca gera dia passado.
- **Se a Apple falhar:** o PR traz só a agenda, com o aviso; a parada vem na semana seguinte.
- **Rodar fora de hora:** `gh workflow run update-catalog.yml`.
- **Se a Action agendada parar:** o GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório. Para religar: `gh workflow enable update-catalog.yml`.

## Licença

[MIT](LICENSE).

## Créditos

Parada, metadados, capas e prévias de áudio: Apple (RSS do Apple Music e iTunes Search API), provided courtesy of iTunes. Junto de cada player fica o selo oficial "Ouça no Apple Music", com link para a loja. Projeto sem fins comerciais. Nenhum áudio fica guardado no site: o navegador toca as prévias direto do servidor da Apple.

## Privacidade

O jogo não tem conta nem servidor próprio. O progresso fica só no seu navegador (`localStorage`). Para tocar uma rodada, o navegador busca na Apple o endereço da prévia (`itunes.apple.com`), o áudio (`audio-ssl.itunes.apple.com`) e as capas (`mzstatic.com`). Como em todo site que carrega conteúdo de outro servidor, a Apple recebe esses pedidos com o endereço IP do seu navegador.
