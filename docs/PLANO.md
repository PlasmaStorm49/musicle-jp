# Plano do projeto musicle-jp

> **Nota de validação:** documento gerado por IA (Claude Code) a partir da exploração do Musicle, de pesquisa de APIs e das decisões do usuário. Itens marcados "confirmar" são conhecimento geral ainda não verificado. Revise antes de tomar como verdade.

## 1. Objetivo

Jogo web em que o jogador ouve um trecho de música popular japonesa e adivinha a música ou o álbum. Projeto pessoal para aprender a usar o Claude Code. Cada marco exercita um recurso diferente da ferramenta.

## 2. Decisões fechadas

| # | Decisão |
|---|---|
| P6/P7 | Duas dimensões independentes: alvo (Música ou Álbum) × resposta (4 opções ou digitação com autocompletar) |
| P9 | Site estático + pipeline Python que gera catálogo e agenda em JSON; GitHub Pages; Action semanal atualiza |
| P10 | Frontend TypeScript + Vite, testes com Vitest |
| P11 | Desafio diário (igual para todos, vira à 00:00 de Brasília) + modo Treino ilimitado |
| P12 | Interface só em PT-BR, textos centralizados em `web/src/i18n/pt-BR.ts` |
| P13 | Dois diários por dia (Música e Álbum), 3 rodadas cada; tipo de resposta escolhido antes da rodada 1 e travado no dia |
| P14 | Preact com hooks, sem biblioteca de estado |
| P15 | Repositório público no GitHub |

## 3. Fonte de dados (usada só no M11)

| Uso | Fonte | Fato verificado em 08/10/2026 |
|---|---|---|
| Parada do Japão | `https://rss.marketingtools.apple.com/api/v2/jp/music/most-played/100/songs.json` | Grátis, sem autenticação, 100 itens, `id` igual ao `trackId` do iTunes. **Sem CORS**: só o pipeline lê |
| Preview e metadados | `https://itunes.apple.com/lookup?id=<ids>&country=jp` | Grátis, sem autenticação, `previewUrl` m4a de 30 s, `Access-Control-Allow-Origin: *` na API e no servidor de áudio. Limite de cerca de 20 chamadas/min |
| Reserva de preview | Deezer API via JSONP | URL do preview expira em cerca de 15 min; termos só para uso não comercial |
| Descartados | Spotify, YouTube, Apple Music API | Spotify proíbe jogos e quiz (política de 15/05/2025) e cortou previews para apps novos (27/11/2024). YouTube proíbe isolar o áudio. Apple Music API custa US$ 99/ano |

**Consequências no desenho:**

- O pipeline guarda o `trackId` e um `previewUrl` de reserva.
- O navegador resolve o preview na hora com o `lookup`, uma chamada por rodada.
- Termos da Apple (Promo Content): atribuição, link "Ouvir no Apple Music" junto ao player, sem baixar nem guardar o áudio, projeto não comercial. Há zona cinzenta (o preview não deveria ter "valor de entretenimento independente"), o mesmo risco que o Musicle assume.

## 4. Arquitetura

```
musicle-jp/
  CLAUDE.md  README.md  .gitignore  .gitattributes  .editorconfig
  .claude/   settings.json, launch.json, hooks/format_file.py, skills/verificar/SKILL.md, agents/revisor.md
  .github/workflows/   ci.yml, deploy.yml, update-catalog.yml
  docs/      PLANO.md, decisoes/ADR-*.md
  shared/    schema/*.schema.json (contrato Python↔TS), vectors/normalize.json, vectors/prng.json
  pipeline/  pyproject.toml, data/aliases.toml, fixtures/chart_fixture.json, scripts/gen_fake_assets.py
             src/musicle_pipeline/  cli, models, providers/{base,fixture}, normalize, romaji, merge,
                                    similarity, prng, schedule, io_json, validate
             tests/
  web/       Vite + TS + Preact + Biome + Vitest + Playwright
             src/core/     TS puro, sem DOM, Preact ou áudio
             src/data/     carrega catálogo e agenda
             src/audio/    engine, webaudio, htmlaudio, fake
             src/storage/  storage, migrations
             src/i18n/     pt-BR, t
             src/ui/       App, screens, components
             public/data/      catálogo real (gerado)
             public/fixtures/  catálogo falso (WAV gerado, fora do git)
             e2e/
```

**Princípios:**

- A lógica do jogo fica pura e testável em `core/`.
- Áudio, storage e dados são adaptadores em volta do `core`.
- A UI só despacha eventos e desenha.
- Normalização e PRNG existem em Python e em TS, travados pelos mesmos vetores de teste em `shared/vectors/`.
- A fonte de dados fica atrás da interface `ChartProvider` no pipeline. O frontend só conhece o esquema neutro.

## 5. Marcos

**Ritual de cada marco:** modo de planejamento → aprovação → implementação → `/verificar` → revisar diff → commit.

| Marco | Estado | Entrega | Pronto quando | Recurso do Claude Code |
|---|---|---|---|---|
| M0 | Concluído em 08/10/2026 | Ambiente, esqueleto, CLAUDE.md, este plano | `node -v`, `npm -v`, `git --version`, `gh --version` num terminal novo; 1º commit em `main` | CLAUDE.md, `/memory`, permissões, agente `claude-code-guide` |
| M1 | Concluído em 08/10/2026 | Schemas, models, FixtureProvider, normalização sem romaji, merge, CLI, Ruff, pytest | `build --provider fixture` gera catálogo válido; 2 execuções dão bytes idênticos | Modo de planejamento |
| M2 | | Romaji (cutlet × pykakasi), `aliases.toml`, vetores compartilhados | Tabela título → romaji aprovada | Subagentes em paralelo |
| M3 | | WAV e SVG falsos, PRNG, `similarity`, agenda, `check-append-only` | 60 dias gerados; regerar não altera dia existente | Hooks (formatador), regras de negação |
| M4 | | Vite + TS + Preact + Biome + Vitest; `core` com reducer de Música com 4 opções | Vetores passam em Python e TS; testes da virada de dia | Skill de projeto `/verificar`, TDD |
| M5 | | 1ª tela jogável: Diário Música com 4 opções, Web Audio, barra segmentada | Dia completo jogado no navegador, console limpo | Pré-visualização no navegador (`launch.json`) |
| M6 | | Persistência, estatísticas, retomada, compartilhar, contagem regressiva | Recarregar no meio retoma; storage corrompido não quebra | Subagente `revisor` + `/code-review` |
| M7 | | Digitação com autocompletar (kana, kanji, romaji, alias, teclado, ARIA) | Busca acha por todas as grafias | Git worktree, sessão paralela |
| M8 | | Alvo Álbum + modo Treino | As 4 combinações jogáveis | 2º worktree, merge e conflito |
| M9 | | Repositório no GitHub, `ci.yml`, Playwright, proteção da `main` | PR com CI verde; teste quebrado bloqueia o merge | `gh`, PR pelo Claude, `/security-review` |
| M10 | | Deploy no Pages (`base: '/musicle-jp/'`) + `update-catalog.yml` com fixtures | URL pública tocando áudio sintético; Action abre PR só com dias novos | GitHub Actions |
| M11 | | Provider Apple (RSS JP + iTunes lookup), atribuição, aliases reais, troca para `public/data/` | Diário com previews reais; reserva de áudio testada | Planejamento + subagente de pesquisa na documentação |

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Resposta do dia visível no JSON público | Aceito na v1; só 21 dias à frente; ofuscar depois (ME3) |
| Termos da Apple para preview em jogo | Atribuição, link para a loja, sem guardar áudio, não comercial |
| Preview que some ou URL que muda | Resolver na hora via `lookup`; rodada anulada sem penalidade |
| Catálogo pequeno repete música | Catálogo cumulativo; janela K ajustada ao tamanho |
| Romaji errado em nomes próprios | `aliases.toml` + `latinSource` para auditoria |
| CRLF e codificação no Windows | `.gitattributes` com eol=lf, `newline="\n"`, `PYTHONUTF8=1` |
| Cron desativado após 60 dias sem atividade no repositório (confirmar) | Aviso no README; execução manual |

## 7. Em aberto

**Perguntas**

- P16. Nome público do jogo (evitar "Musicle" no nome). Bloqueia o M10.
- P17. Filtrar faixas marcadas como explícitas? Bloqueia o M3.
- P18. Data de estreia (desafio nº 1). Bloqueia o M3.

**Sugestões**

- S5. Ativar o estilo de saída "Learning" ou "Explanatory" nas sessões deste projeto.
- S6. Registrar cada decisão como ADR em `docs/decisoes/`.
- S7. A partir do M9, um marco por branch e por PR.

**Melhorias futuras**

- ME1. Modo difícil.
- ME2. Modo royale (6 músicas, 9 opções, sem errar).
- ME3. Ofuscar a agenda e dividir por mês quando passar de 200 KB.
- ME4. Gerar o dia no navegador quando a agenda não cobrir a data.
- ME5. PWA offline.
- ME6. App do Claude no GitHub para revisar PR.
- ME7. Tema escuro e revisão de acessibilidade.
- ME8. Tolerância a erro de digitação (distância de edição) no autocompletar.

---

## Apêndice A. Modelo de dados

**Princípios (implementados no M1):**

- O catálogo é uma **redução pura de todos os snapshots**, refeita do zero em todo build. O catálogo anterior só serve para comparar bytes ("sem mudanças"). Mudar uma regra atualiza todas as faixas.
- Nunca se apaga nada: uma faixa que sai da parada fica com `inLatest: false`, porque a agenda pode apontar para ela.
- Escrita determinística: chaves ordenadas, `ensure_ascii=False`, 2 espaços, `\n` no fim, bytes UTF-8, escrita atômica. Sem relógio nem sorteio (o Ruff barra). Popularidade em `Decimal`.
- `schemaVersion` fica 1 até o primeiro deploy (M10). Depois, só sobe em mudança incompatível, e o frontend recusa versão desconhecida.
- Contrato completo: `shared/schema/catalog.schema.json`. A validação soma invariantes que o schema não expressa e confere a forma canônica do arquivo.

### catalog.json (trecho real, gerado da parada fictícia)

```json
{
  "schemaVersion": 1,
  "catalogVersion": "2026-10-05.c296681f",
  "generatedAt": "2026-10-05T00:00:00Z",
  "provider": "fixture",
  "storefront": "jp",
  "snapshots": [{ "id": "2026-10-05", "date": "2026-10-05", "fetchedAt": "2026-10-05T00:00:00Z",
                  "chart": "top-songs", "size": 30 }],
  "artists": [{ "id": "fixture:ar:ar01", "name": "ミナト", "nameLatin": "Minato",
                "search": ["minato", "みなと"] }],
  "tracks": [{ "id": "fixture:tr:tr01", "songKey": "夜明けのめろでぃ|fixture:ar:ar01",
               "title": "夜明けのメロディ", "titleLatin": null, "latinSource": null,
               "artistIds": ["fixture:ar:ar01"], "artistDisplay": "ミナト", "albumId": "fixture:al:al01",
               "releaseDate": "2024-03-01", "durationMs": 215000, "explicit": false, "isrc": null,
               "preview": { "url": "fixtures/audio/tr01.wav", "durationSec": 30, "startSec": 0 },
               "chart": { "firstSeen": "2026-09-21", "lastSeen": "2026-10-05", "bestRank": 1,
                          "lastRank": 4, "appearances": 3, "inLatest": true },
               "popularity": 0.9,
               "eligible": { "daily": true, "reason": null },
               "similar": [],
               "search": { "title": ["夜明けのめろでぃ"], "artist": ["minato", "みなと"] } }]
}
```

**Campos:**

- **`id`:** `"<provedor>:<tipo>:<id do provedor>"`, estável entre execuções. Com a Apple, o id do provedor é o `trackId`.
- **`catalogVersion`:** data do último snapshot + 8 hex do SHA-256 do conteúdo sem o próprio campo. Edição à mão é detectada porque a versão deixa de bater.
- **`songKey`:** chave do título sem sufixos de versão ("(TV Size)", "feat.", " - Live"...) + `|` + artista principal. Agrupa a mesma música em single, álbum e versões. Título só de símbolos (`♡`) usa o próprio texto.
- **`chart.appearances`:** número de snapshots em que a faixa apareceu.
- **`popularity`:** maior nota entre as aparições: `((size − posição + 1) / size) × 0,5^(semanas atrás / 8)`, com o `size` de cada snapshot, 4 casas.
- **`eligible`:** `{ daily, reason }`, com um motivo só, na ordem `no-preview` > `short-preview` (trecho útil < 16 s; duração desconhecida não reprova) > `no-artwork`. Os motivos `explicit` (P17) e `blocked` (aliases, M2) já existem no schema.
- **`similar`:** vazio no M1. No M3, os 10 candidatos a distrator mais próximos, calculados no Python.
- **`latinSource`:** `provider` quando o título latino veio do provedor; no M2 entram `official`, `manual`, `cutlet` e `pykakasi`.

### schedule.json

```json
{ "schemaVersion": 1, "timezone": "America/Sao_Paulo", "epoch": "2026-11-01",
  "days": { "2026-11-01": { "number": 1, "catalogVersion": "2026-10-26.1a2b3c4d",
    "song":  [{ "answer": "fixture:tr:tr01", "options": ["fixture:tr:tr09", "fixture:tr:tr01", "fixture:tr:tr14", "fixture:tr:tr22"] }],
    "album": [{ "answer": "fixture:tr:tr30", "options": ["fixture:al:al03", "fixture:al:al11", "fixture:al:al05", "fixture:al:al08"] }] } } }
```

Cada lista tem 3 rodadas. No modo Álbum, `answer` é a faixa que toca e `options` são álbuns. A data de `epoch` depende da P18.

## Apêndice B. Nomes japoneses no autocompletar

### Normalização (implementada no M1; o TS repete no M4)

O contrato são os vetores de `shared/vectors/normalize.json`, escritos à mão. Revisão de 08/10/2026 testou por força bruta: 0 divergências entre Python 3.12 e Node 24 em todo o Unicode 15.0.

| Passo | Exemplo | Atenção |
|---|---|---|
| NFKC | `ｱｲﾄﾞﾙ` → `アイドル`; `ＬＯＶＥ` → `LOVE`; `①` → `1` | `unicodedata` no Python, `String.prototype.normalize` no TS |
| Minúsculas | `lower()` / `toLowerCase()` | **Não** usar `casefold()`: diverge do JS em 261 caracteres (ex.: `ß`) |
| NFD + lista de permissão | Fica só letra (L), número (N) e dakuten (U+3099, U+309A) | Some de uma vez com espaço, pontuação, símbolo, emoji, ZWSP, seletor de variação e acento latino. No TS: `/[^\p{L}\p{N}゙゚]/gu` |
| Katakana → hiragana | U+30A1 a U+30F6, U+30FD e U+30FE, menos 0x60 | Mantém `ー` |
| NFC | `か` + `゙` → `が` | Recompõe o dakuten |
| `ー` colado em latim some | `goー` → `go` | Regex `(?<=[a-z])ー+` |

**Chave "frouxa"** (`loose_key`), aplicada a toda chave (só mexe em `a-z`) e repetida até parar de mudar:

- `m` antes de `b`/`p` → `n`;
- Kunrei → Hepburn: `sy ty cy zy jy si ti tu zi di du` → `sh ch ch j j shi chi tsu ji ji zu`; `hu` → `fu` se não vier depois de `s` ou `c`;
- `nn+` → `n`; vogal repetida (`aa ii uu ee`) → uma; `o` seguido de `o`/`u` → `o`.

Assim, `tōkyō`, `toukyou` e `tokyo` viram `tokyo`. Como a regra vale para catálogo e consulta, um efeito estranho em inglês (`size` → `shize`) não atrapalha a busca.

**Pendente para o M7:** a busca por prefixo perde 1 caractere quando o jogador digita Kunrei para um título em Hepburn (`t` de `tikara`); a correção prevista é comparar também `loose_key(consulta[:-1])` quando o último caractere for `t`, `h`, `z`, `d` ou `m`. E, durante a composição do IME (`とうk`), buscar só no `compositionend`.

### Romaji no pipeline (confirmar licença e tamanho no PyPI no M2)

| Biblioteca | Licença | Peso | Qualidade |
|---|---|---|---|
| cutlet (fugashi/MeCab + unidic-lite) | MIT; dicionário UniDic com licença tripla BSD/GPL/LGPL | Dezenas de MB | Lê kanji pelo contexto; opção de grafia estrangeira para palavras em katakana |
| pykakasi | GPL-3.0 ou posterior | Poucos MB, Python puro | Leitura por dicionário, sem contexto; erra leituras ambíguas e nomes próprios |
| jaconv | MIT | Leve | Só kana e largura, não lê kanji |
| kuromoji.js no navegador | n/a | Dicionário de vários MB | Descartado: pesaria para cada jogador |

**Recomendação:** cutlet como extra opcional `[romaji]`, com pykakasi como plano B se o fugashi der problema no Windows. `aliases.toml` sempre prevalece (título oficial em inglês, ordem do nome, apelidos). Nomes próprios são o caso mais frágil.

**Validação do palpite:** sempre por **ID** escolhido na lista, nunca por texto livre. Na Música, acerta quem escolhe o mesmo `songKey`. No Álbum, acerta quem escolhe qualquer álbum que contenha o `songKey` da resposta.

## Apêndice C. Agenda diária

### Fuso

`America/Sao_Paulo` pelo nome IANA, nunca o deslocamento fixo de -03:00, para absorver uma eventual volta do horário de verão.

- **TS:** `Intl.DateTimeFormat` com `timeZone` e `formatToParts`.
- **Python:** `zoneinfo`, que no Windows precisa do pacote `tzdata`.
- **Número do desafio:** dias corridos desde `epoch` + 1, calculados sobre as datas em texto.

### Algoritmo (pré-gerado pelo pipeline, só de acréscimo)

1. Para cada dia ausente, de hoje até hoje + 21: `rng = mulberry32(fnv1a32("musicle-jp|<data>|<alvo>"))`.
2. **Pool:** faixas elegíveis, menos as respostas dos últimos K dias (faixa, `songKey` e álbum).
   - K = mín(180, piso(0,5 × P / 6)), em que P é o tamanho do pool e 6 é o número de respostas por dia. Com P = 300, K = 25.
   - Um artista não repete no mesmo dia. As respostas de Álbum não repetem álbum nem `songKey` das respostas de Música do dia.
3. **Dificuldade (opcional):** rodada 1 no terço mais popular, rodada 2 no meio, rodada 3 em qualquer faixa.
4. **Opções:** resposta + 3 sorteadas de `similar`, embaralhadas com o mesmo `rng`.
5. **Imutabilidade:** o pipeline nunca reescreve um dia existente; `check-append-only` compara com `origin/main` na CI; o catálogo nunca perde faixa referenciada. Única exceção registrada em log: um dia **futuro** cuja faixa perdeu o preview pode ser refeito.

**Por que não calcular no navegador:** o resultado mudaria a cada atualização semanal do catálogo.

Se faltar o dia na agenda, a v1 mostra "desafio de hoje indisponível" e oferece o Treino.

## Apêndice D. Regras dos modos

| Regra | 4 opções | Digitação com autocompletar |
|---|---|---|
| Etapas do trecho | 1, 2, 4, 7, 11, 16 s | 1, 2, 4, 7, 11, 16 s |
| Tentativas por rodada | 1 palpite | 6 |
| Liberar mais trecho | "Ouvir mais" (custa 1 ponto) | Erro ou "Pular" consomem tentativa e liberam a etapa seguinte |
| Pontos da rodada | 6 menos etapas extras; erro = 0 | 7 menos o número da tentativa que acertou; falhar = 0 |
| Desistir | "Não sei" = 0 | Revela a resposta, 0 pontos |
| Repetir o trecho | Livre na etapa atual | Livre na etapa atual |
| Fim da rodada | Revela capa, título, artista, preview inteiro e link para a loja | Igual |

- **Dia:** de 0 a 18 pontos por diário.
- **Treino:** rodadas ilimitadas com filtros de alvo e resposta, sorteio por "saco embaralhado" para não repetir na sessão. Exclui as respostas do Diário de hoje enquanto ele não for concluído.

**Distratores** (`similarity.py`):

- Candidatos: elegíveis, de **artista diferente**, com outro `songKey`. No Álbum, outra capa e nenhum álbum que contenha a música da resposta.
- Proximidade: diferença de ano (janela de ±2, depois ±5, depois qualquer ano), diferença de popularidade, mesmo tipo de álbum.
- Sorteio: 3 da lista dos 10 mais próximos, com 3 artistas distintos entre si. Se faltar candidato, as restrições são relaxadas em ordem documentada.

## Apêndice E. Player de áudio

| Critério | HTMLAudioElement | Web Audio API |
|---|---|---|
| Corte preciso de 1 s | Aproximado (erro de dezenas a centenas de ms) | Exato: `source.start(t, offset, duração)` |
| CORS | Não exige | Exige; o servidor de previews da Apple libera (`*`) |
| Repetir trecho | Precisa de seek; pode travar | Instantâneo |
| Memória | Baixa | Cerca de 11 MB por preview decodificado |

**Desenho:**

- Interface `AudioEngine` com `unlock()`, `load()`, `play(duração)`, `stop()` e `onProgress()`.
- Implementação principal em `webaudio.ts`, com rampa de ganho de 10 ms contra estalos. `htmlaudio.ts` é a reserva. `fake.ts` serve aos testes de ponta a ponta.
- Pré-carrega a rodada atual e depois a próxima; no máximo 2 buffers em memória. Nada é gravado em disco (termos da Apple).
- O `AudioContext` só é criado dentro do clique de "Tocar", por causa do bloqueio de autoplay.
- Falha de áudio anula a rodada sem penalidade.
- Barra segmentada com colunas proporcionais a 1, 1, 2, 3, 4 e 5 (total de 16 s). A matemática fica em `core/rules.ts`.

**Áudio sintético (fixtures):** `gen_fake_assets.py`, só com a biblioteca padrão (`wave`, `math`, `struct`), gera 30 s a 11.025 Hz, 16 bits, mono. Uma **nota por segundo** de uma escala pentatônica sorteada pelo ID da faixa: o trecho de 1 s soa como 1 nota e o de 4 s como 4 notas, o que permite conferir o corte de ouvido. O mesmo script gera capas SVG com cor e iniciais.

## Apêndice F. Persistência e compartilhamento

- **Chave:** `musicle-jp:save`. O prefixo é obrigatório porque todos os sites de projeto em `<usuario>.github.io` compartilham o mesmo localStorage.
- **Conteúdo:** `{ schemaVersion, settings, history, inProgress }`. Exemplo de chave do histórico: `history["2026-11-01|song"]`.
- **Estatísticas:** calculadas do histórico por função pura (jogos, média, distribuição de 0 a 18, sequência atual e melhor). Nada derivado é gravado.
- **Tolerância a falha:** leitura em `try/catch` com validação por type guards; JSON ilegível é copiado para `musicle-jp:corrupt:<data>` e o jogo recomeça; versão maior que a suportada não é sobrescrita; escrita protegida contra cota cheia e modo privado. Migrações em `migrations.ts`, uma função por versão.
- **Retomada:** `inProgress` de outro dia, ou que não bate com a agenda, é descartado.
- **Compartilhar:** texto montado em `core/share.ts` (função pura com teste de snapshot). Uma linha por rodada: ⬛ pulo ou "ouvir mais", 🟥 erro, 🟩 acerto. Inclui número do dia, alvo, tipo de resposta, pontos e URL, nunca o título. Usa `navigator.clipboard.writeText`, com textarea selecionada como reserva.

## Apêndice G. Organização do código TS

- **Estado:** `GameState { mode, puzzleId, rounds: RoundState[], current, status }`.
- **Rodada:** `RoundState { answerId, options?, attempts: ('skip' | { guessId, correct })[], stage, status }`.
- **Eventos:** `GUESS`, `SKIP`, `LISTEN_MORE`, `GIVE_UP`, `NEXT_ROUND`.
- **Transição:** `reduce(state, event, rules)`, função pura. Tempo e sorteio entram como parâmetro (`now`, `rng`).
- **UI:** `useReducer` do Preact recebe o reducer do `core` diretamente.
- **i18n:** `pt-BR.ts` exporta um objeto de textos; `t(chave, parâmetros)` é tipado por `keyof`; plural com `Intl.PluralRules('pt-BR')`.

## Apêndice H. Testes e qualidade

| Camada | Ferramenta | Cobertura |
|---|---|---|
| Pipeline | pytest | Vetores de normalização e PRNG; romaji; merge cumulativo; agenda (determinismo, só acréscimo, janela sem repetição, distratores válidos); schema; bytes idênticos em duas execuções; CLI |
| Núcleo web | Vitest | Reducer nas 4 combinações; pontuação; share; virada de dia às 23:59 e 00:00 de Brasília; busca com kana, kanji e romaji; storage (migração, JSON corrompido, cota cheia); sequência com dia pulado. Meta: 90% de linhas no `core` |
| Componentes | Vitest + Testing Library | Autocompletar (teclado, ARIA combobox) e barra segmentada |
| Ponta a ponta | Playwright (Chromium) na CI | Diário completo com relógio fixo e áudio fake; recarregar no meio retoma; Treino |
| Exploratório | Navegador do Claude | Visual, console e cliques durante o desenvolvimento |
| Lint e formato | Ruff (Python), Biome (TS), `tsc --noEmit` estrito | |

## Apêndice I. GitHub e CI (confirmar na documentação no M9 e no M10)

- O cron do GitHub Actions é em UTC: `0 9 * * 1` dispara segunda-feira às 06:00 de Brasília.
- Push feito com `GITHUB_TOKEN` não dispara outro workflow. Por isso a atualização do catálogo abre PR, e o merge humano dispara o deploy.
- Para a Action criar PR, é preciso ativar "Allow GitHub Actions to create and approve pull requests" no repositório.

## Origem

- **Musicle**, observado no navegador em 08/10/2026: `musicle.app/hitparade/jp` (3 rodadas, 4 capas, previews em `audio-ssl.itunes.apple.com`, capas em `mzstatic.com`).
- **Pesquisa de APIs** (subagente, 08/10/2026): developer.apple.com/programs/enroll, performance-partners.apple.com/search-api, developer.spotify.com/policy, developer.spotify.com/blog/2024-11-27-changes-to-the-web-api, developers.deezer.com/termsofuse, developers.google.com/youtube/terms/developer-policies. Endpoints testados na seção 3.
- **Desenho técnico:** subagente Plan, revisado pelo Claude.
- **Decisões P6 a P15:** respondidas pelo usuário na sessão de 08/10/2026.
