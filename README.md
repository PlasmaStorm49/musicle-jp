# musicle-jp

Jogo web de "adivinhe a música" com sucessos japoneses, inspirado no Hit Parade do [Musicle](https://musicle.app/). Projeto pessoal de aprendizado do Claude Code.

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

Em construção, ainda com dados fictícios: uma parada inventada e áudio sintético (cada segundo toca uma nota). Os diários Música e Álbum e o Treino já são jogáveis. Andamento por marco em [docs/PLANO.md](docs/PLANO.md).

## Como rodar

Precisa de Python 3.12, Node.js 24 e Git. Comandos a partir da raiz do repositório:

```bash
python -m venv .venv
.venv/bin/python -m pip install -e "pipeline[dev]"   # no Windows: .venv\Scripts\python
.venv/bin/python -m musicle_pipeline fake-assets --catalog web/public/fixtures/catalog.json
npm ci --prefix web
npm run dev --prefix web
```

Depois, abra http://localhost:5173. O `fake-assets` gera o áudio e as capas falsos, que ficam fora do Git.

Testes:

- pipeline: `.venv/bin/python -m pytest pipeline`
- web (lint, tipos, testes com cobertura): `npm run check --prefix web`

## Licença

[MIT](LICENSE).

## Créditos

Quando a fonte de dados real for ligada (M11), dados e trechos de áudio virão da Apple (iTunes), com atribuição e link para a loja junto ao player. Projeto sem fins comerciais.
