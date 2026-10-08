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

Em construção. Veja o andamento por marco em [docs/PLANO.md](docs/PLANO.md).

## Como rodar

Será preenchido a partir do M1 (pipeline) e do M4 (web).

## Créditos

Quando a fonte de dados real for ligada (M11), dados e trechos de áudio virão da Apple (iTunes), com atribuição e link para a loja junto ao player. Projeto sem fins comerciais.
