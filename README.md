# musicle-jp

**AteMusic** (当てる, ateru: acertar): jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do [Musicle](https://musicle.app/). Projeto pessoal de aprendizado do Claude Code. O repositório e a URL ainda se chamam `musicle-jp`.

**[Jogar](https://plasmastorm49.github.io/musicle-jp/)**: a parada real do Japão (Apple Music, as 100 mais tocadas), com as prévias de 30 s da Apple.

> O nome AteMusic já está na tela. Mudar a URL e o repositório ainda está em aberto.

## Como funciona

- A home mostra os modos e o estado do dia de cada um.
- Você ouve um trecho de uma música popular no Japão e tenta adivinhar. O trecho começa com 1 s.
- **Normal:** escolha o álbum ou single entre 4 opções, com capa. O trecho cresce com "Ouvir mais" (custa 1 ponto).
- **Desafio:** digite o nome exato da música, com autocompletar, em até 6 tentativas. O trecho cresce a cada erro ou pulo.
- **Diário:** um jogo por dia em cada modo, igual para todos, com virada à meia-noite de Brasília.
- **Treino:** rodadas ilimitadas de um modo, escolhido ao começar; para trocar, reinicie o Treino.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `pipeline/` | Script Python que busca a parada do Japão e gera o catálogo e a agenda em JSON |
| `web/` | Jogo em TypeScript + Vite + Preact, roda só no navegador |
| `shared/` | Contrato entre os dois lados: schemas JSON e vetores de teste |
| `docs/` | Plano do projeto e decisões |

## Estado

No ar no GitHub Pages com a parada real do Japão desde 11/10/2026 (M11): os diários do Normal e do Desafio e o Treino. Em andamento, o modo por artista (M13): o Desafio, em rodadas sem fim, com as músicas de um de 6 artistas. Toda segunda, a Action atualiza a parada e a agenda por PR (abaixo, em Publicação). Depois do M11, um checkup geral corrigiu o jogo, o pipeline e o robô (PRs #12 a #14). No desenvolvimento, o jogo usa uma parada inventada com áudio sintético (cada segundo toca uma nota). Andamento por marco em [docs/PLANO.md](docs/PLANO.md).

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

Para ver o build como ele fica publicado: `npm run build --prefix web` e depois `npm run preview --prefix web`, em http://localhost:4173/musicle-jp/. Ele usa a parada real e a rede da Apple; o `dist` local ainda tem a pasta `fixtures/`, que só o deploy apaga.

## Publicação e atualização da parada e da agenda

- **Deploy:** todo merge na `main` publica o site no GitHub Pages (`.github/workflows/deploy.yml`).
- **Parada e agenda:** toda segunda às 06:17 de Brasília, a Action `update-catalog.yml` busca a parada da Apple, refaz o catálogo, acrescenta os dias até hoje + 21 e abre um PR (`catalogo/<data>`). Para publicar:
  1. confira que mudou só o que a lista fechada permite: `pipeline/data/apple/snapshots/<data>.json` (novo), `pipeline/data/apple/romaji.json`, `web/public/data/catalog.json`, `web/public/data/schedule.json` e `web/public/fixtures/schedule.json` (a Action já recusa qualquer outra coisa). Um diff grande no `catalog.json` é esperado: popularidade, posições e distratores mudam em quase todas as faixas a cada parada;
  2. leia o romaji novo listado no PR. Se algum estiver errado, corrija no `pipeline/data/apple/aliases.toml` num PR à parte, que pode entrar depois;
  3. clique em "Approve workflows to run" (PR aberto por Action precisa dessa aprovação para rodar as checagens);
  4. com `pipeline`, `web` e `e2e` verdes, faça o merge no mesmo dia. Dia que passa sem agenda fica sem desafio para sempre: a agenda nunca gera dia passado. Se as checagens só forem aprovadas num dia seguinte, a CI recusa o dia que passou: feche o PR, apague o branch (`git push origin --delete catalogo/<data>`) e rode o robô de novo (`gh workflow run update-catalog.yml`).

  Enquanto o PR do robô estiver aberto, evite outro merge: o `strict` do ruleset o deixaria desatualizado.
- **Se a Apple falhar:** o PR traz só a agenda, com o aviso; a parada vem na semana seguinte.
- **Se a parada nova quebrar o pipeline** (um texto que o romaji não lê, um dado estranho): o PR também traz só a agenda, com o aviso. Corrija o código ou o `aliases.toml` para ela entrar na semana seguinte.
- **Se o merge atrasar:** a tarefa `catalog-runway` fica vermelha (e o GitHub manda e-mail) quando a agenda da `main` tem menos de 10 dias à frente. Um PR do robô sem merge é fechado pelo da semana seguinte, e a parada daquela semana se perde.
- **Rodar fora de hora:** `gh workflow run update-catalog.yml`.
- **Se a Action agendada parar:** o GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório. Para religar: `gh workflow enable update-catalog.yml`.
- **Modo por artista (M13), à mão e fora do robô:** a lista está em `pipeline/data/apple/artists/artists.toml`, por id da loja (os nomes são ambíguos). Para atualizar ou acrescentar um artista, num PR próprio e fora da segunda de manhã:
  1. `fetch --provider apple --artists --fetched-at <agora em UTC>` (pede confirmação; `--artist ID` busca só um). Confira o nome que a Apple devolveu para cada id;
  2. `romanize --provider apple --artists`, depois `build-artists --provider apple`. Os avisos são a lista de revisão: versões em inglês com outro título e coletâneas vão para o `exclude_albums`, a mesma música com títulos diferentes para o `same_song`, e o romaji errado para o `aliases.toml` dos artistas;
  3. `validate-artists --provider apple` e o `/verificar`. O `romanize --refresh` (troca de versão do romaji) vale também para o cache dos artistas.

## Licença

[MIT](LICENSE).

## Créditos

Parada, metadados, capas e prévias de áudio: Apple (RSS do Apple Music e iTunes Search API), provided courtesy of iTunes. No fim de cada tela com prévia (a rodada e a revelação) fica o selo oficial "Ouça no Apple Music", com link para a loja. Projeto sem fins comerciais. Nenhum áudio fica guardado no site: o navegador toca as prévias direto do servidor da Apple.

## Privacidade

O jogo não tem conta nem servidor próprio. O progresso fica só no seu navegador (`localStorage`). Para tocar uma rodada, o navegador busca na Apple o endereço da prévia (`itunes.apple.com`), o áudio (`audio-ssl.itunes.apple.com`) e as capas (`mzstatic.com`). Como em todo site que carrega conteúdo de outro servidor, a Apple recebe esses pedidos com o endereço IP do seu navegador.
