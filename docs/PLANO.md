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
| P17 | Faixas explícitas podem ser resposta; a tela mostra um aviso de conteúdo explícito (M5) |
| P18 | Desafio nº 1 da agenda falsa em 2026-10-08 (início do projeto) |
| P21 a P23 | Romaji com cutlet, em cache versionado; grafia estrangeira só na busca (Apêndice B) |
| P24 | O Diário Álbum aceita singles, em definitivo |
| P27 | Rodada anulada sai do total do dia (o máximo cai de 18 para 12 com uma anulada) |
| P28, P29 | Dependências com 14 dias ou mais de publicadas, inclusive as indiretas (`web/.npmrc`); exceção só para patch de segurança com aviso publicado: vite 8.3.3 e source-map-js 1.2.2 |
| P60 | A regra da P28 vale também para o Python (M9): versões exatas de tudo, diretas e indiretas, em `pipeline/constraints.txt`, e o `setuptools` do build fixo no `pyproject.toml`. Na adoção, três caíram para a versão anterior: ruff 0.16.9, rpds-py 2026.6.3 e iniconfig 2.3.0 |
| P64 | PR semanal da agenda aberto pela Action com o `GITHUB_TOKEN` (M10): as checagens rodam depois de "Approve workflows to run", e o merge é humano (o push dele dispara o deploy). Sem segredo; exige "Allow GitHub Actions to create and approve pull requests" ligado |
| P31 | Aviso de faixa explícita no player antes de tocar e na revelação |
| P32 | Romaji menor embaixo do título japonês nas opções |
| P33 | "Ouvir mais" libera a etapa e toca o trecho maior na hora |
| P34 | A revelação toca o preview inteiro |
| P35 | Tema escuro fica para a ME7 |
| P36 | Distratores não repetem artista nem título entre si (`similarity.py`); os dias já gravados não mudam |
| P38 | Sequência = dias seguidos com o diário terminado |
| P39 | Dia terminado abre direto no resultado (estatísticas, compartilhar e contagem), sem jogar de novo |
| P40 | Dia sem agenda não quebra a sequência |
| P41 | Média e distribuição com pontos brutos; dia todo anulado fica fora delas, mas conta em jogos e na sequência |
| P42 | Compartilhar com formas, não só cores: ⬛ ouvir mais (na digitação, pulou), ✅ acerto, ❌ erro, ⬜ anulada |
| P44 | (a) A agenda nunca gera dia passado (M10): a geração começa em `max(epoch, último + 1, hoje)`. O dia que não foi gerado a tempo vira buraco ("indisponível"), que não quebra a sequência (P40) e nunca é preenchido (o `compare` recusa) |
| P45 | O modo de resposta é escolhido todo dia antes da rodada 1, com o último usado marcado e com o foco |
| P46 | Na digitação nada toca sozinho: pulo e erro só liberam a etapa; o jogador clica em Tocar |
| M7 | Na última tentativa da digitação o "Pular" some e fica só o "Desistir" (os dois dariam 0 ponto) |
| P49 | Abas no topo (Música, Álbum, Treino), com a aba no endereço (`#musica`, `#album`, `#treino`) e ✓ no diário terminado |
| P50 | O Treino não salva nada: só o placar da sessão, e recarregar a página começa outra |
| P51 | No Álbum, as opções mostram capa, título e artista (também na lista da revelação) |
| M8 | A sessão do Treino dura enquanto a página está aberta: trocar de aba não zera placar nem saco |

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
  docs/      PLANO.md
  shared/    schema/*.schema.json (contrato Python↔TS), vectors/normalize.json, vectors/prng.json
  pipeline/  pyproject.toml, data/aliases.toml, data/romaji.json, fixtures/chart_fixture.json
             src/musicle_pipeline/  cli, models, providers/{base,fixture}, normalize, romaji, merge,
                                    similarity, prng, schedule, io_json, validate
             tests/
  web/       Vite + TS + Preact + Biome + Vitest + Playwright
             src/core/     TS puro, sem DOM, Preact ou áudio
             src/data/     carrega catálogo e agenda
             src/audio/    engine, webaudio, htmlaudio, fake
             src/storage/  save, migrations
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

**Ritual de cada marco:** modo de planejamento → aprovação → branch do marco → implementação → `/verificar` → revisar diff → commits → PR → `pipeline`, `web` e `e2e` verdes → merge commit. Até o M8, o commit ia direto na `main`; desde o M9, o ruleset só aceita PR.

| Marco | Estado | Entrega | Pronto quando | Recurso do Claude Code |
|---|---|---|---|---|
| M0 | Concluído em 08/10/2026 | Ambiente, esqueleto, CLAUDE.md, este plano | `node -v`, `npm -v`, `git --version`, `gh --version` num terminal novo; 1º commit em `main` | CLAUDE.md, `/memory`, permissões, agente `claude-code-guide` |
| M1 | Concluído em 08/10/2026 | Schemas, models, FixtureProvider, normalização sem romaji, merge, CLI, Ruff, pytest | `build --provider fixture` gera catálogo válido; 2 execuções dão bytes idênticos | Modo de planejamento |
| M2 | Concluído em 08/10/2026 | Romaji (cutlet × pykakasi), `aliases.toml`, vetores compartilhados | Tabela título → romaji aprovada | Subagentes em paralelo |
| M3 | Concluído em 08/10/2026 | WAV e SVG falsos (`fake-assets`), PRNG, `similarity`, agenda, `schedule-check` | 61 dias gerados sem afrouxar regra; regerar não altera dia existente | Hooks (formatador), regras de negação |
| M4 | Concluído em 08/10/2026 | Vite + TS + Preact + Biome + Vitest; `core` com reducer de Música com 4 opções | Vetores passam em Python e TS; testes da virada de dia | Skill de projeto `/verificar`, TDD |
| M5 | Concluído em 08/10/2026 | 1ª tela jogável: Diário Música com 4 opções, Web Audio, barra segmentada | Dia completo jogado no navegador, console limpo | Pré-visualização no navegador (`launch.json`) |
| M6 | Concluído em 09/10/2026 | Persistência, estatísticas, retomada, compartilhar, contagem regressiva | Recarregar no meio retoma; storage corrompido não quebra | Subagente `revisor` + `/code-review` |
| M7 | Concluído em 09/10/2026 | Digitação com autocompletar (kana, kanji, romaji, alias, teclado, ARIA) | Busca acha por todas as grafias | Git worktree, sessão paralela |
| M8 | Concluído em 09/10/2026 | Alvo Álbum + modo Treino | As 4 combinações jogáveis | 2º worktree, merge e conflito |
| M9 | Concluído em 09/10/2026 | Repositório no GitHub, `ci.yml`, Playwright, proteção da `main` | PR com CI verde; teste quebrado bloqueia o merge | `gh`, PR pelo Claude, `/security-review`, ferramentas de PR do app (Auto-fix) |
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
| Cron desativado após 60 dias sem atividade no repositório (documentação do GitHub) | Aviso no README; `gh workflow enable update-catalog.yml` e execução manual |
| PR da agenda sem merge por mais de 21 dias | O dia que passa sem agenda vira buraco (P44); o corpo do PR avisa o buraco e pede o merge no mesmo dia |
| `--today` errado (data no futuro deixaria buraco para sempre) | A Action não aceita entradas; a data vem de `TZ=America/Sao_Paulo date +%F` |
| Cache do Pages: JSON velho por alguns minutos depois do deploy (a conferir) | A agenda é gerada 21 dias à frente; no M11, `fetch` sem cache (ME13) |

## 7. Em aberto

**Perguntas**

- P16. Nome público do jogo (evitar "Musicle" no nome). No M10, o usuário decidiu publicar como `musicle-jp` por ora. Trocar depois muda a URL (quebra links compartilhados), mas não o save (o `localStorage` é por origem). Não bloqueia mais.
- P25. A agenda real (M11, em `public/data/`, com IDs da Apple) precisa do próprio `epoch`: a data de estreia pública. Bloqueia o M11.

**Sugestões**

- S5. Ativar o estilo de saída "Learning" ou "Explanatory" nas sessões deste projeto.
- S6. Registrar cada decisão como ADR em `docs/decisoes/`.
- S7. A partir do M9, um marco por branch e por PR. (Adotada no M9: a proteção da `main` exige PR.)

**Melhorias futuras**

- ME1. Modo difícil.
- ME2. Modo royale (6 músicas, 9 opções, sem errar).
- ME3. Ofuscar a agenda e dividir por mês quando passar de 200 KB.
- ME4. Gerar o dia no navegador quando a agenda não cobrir a data.
- ME5. PWA offline.
- ME6. App do Claude no GitHub para revisar PR.
- ME7. Tema escuro e revisão de acessibilidade.
- ME8. Tolerância a erro de digitação (distância de edição) no autocompletar.
- ME9. Partículas `は` e `へ` lidas como "wa" e "e" na consulta em kana, se o cutlet as escrever assim nos títulos reais (Apêndice B, M11).
- ME10. `actionlint` ou `zizmor` na CI, para revisar o próprio workflow a cada PR (revisor do M9).
- ME11. Fixar também a versão do `pip` na CI (`/code-review` do M9).
- ME12. Levar a escolha da revisão base do `schedule-check` do YAML para o Python, com teste (`/code-review` do M9).
- ME13. No M11, buscar `catalog.json` e `schedule.json` com `fetch(..., { cache: "no-cache" })`: com a parada real, catálogo novo e agenda velha em cache não podem se misturar (subagente Plan do M10).
- ME14. Aviso de folga da agenda (menos de 7 dias à frente) no resumo do deploy (subagente Plan do M10).

---

## Apêndice A. Modelo de dados

**Princípios (implementados no M1):**

- O catálogo é uma **redução pura de todos os snapshots**, refeita do zero em todo build. O catálogo anterior só serve para comparar bytes ("sem mudanças"). Mudar uma regra atualiza todas as faixas.
- Nunca se apaga nada: uma faixa que sai da parada fica com `inLatest: false`, porque a agenda pode apontar para ela.
- Escrita determinística: chaves ordenadas, `ensure_ascii=False`, 2 espaços, `\n` no fim, bytes UTF-8, escrita atômica. Sem relógio nem sorteio (o Ruff barra). Popularidade em `Decimal`.
- `schemaVersion` ficou 1 até o primeiro deploy (M10). Desde então, só sobe em mudança incompatível, com migração, e o frontend recusa versão desconhecida.
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
- **`eligible`:** `{ daily, reason }`, com um motivo só, na ordem `no-preview` > `short-preview` (trecho útil < 16 s; duração desconhecida não reprova) > `no-artwork`. `blocked` (aliases, M2) vence todos. O motivo `explicit` existe no schema mas não é usado: pela P17, explícitas podem ser resposta, com aviso na tela.
- **`similar`:** vazio no M1. No M3, os 10 candidatos a distrator mais próximos, calculados no Python.
- **`latinSource`:** `provider` quando o título latino veio do provedor; no M2 entram `official`, `manual`, `cutlet` e `pykakasi`.

### schedule.json

```json
{ "schemaVersion": 1, "timezone": "America/Sao_Paulo", "epoch": "2026-11-01",
  "days": { "2026-11-01": { "number": 1, "catalogVersion": "2026-10-26.1a2b3c4d",
    "song":  [{ "answer": "fixture:tr:tr01", "options": ["fixture:tr:tr09", "fixture:tr:tr01", "fixture:tr:tr14", "fixture:tr:tr22"] }],
    "album": [{ "answer": "fixture:tr:tr30", "options": ["fixture:al:al03", "fixture:al:al11", "fixture:al:al05", "fixture:al:al08"] }] } } }
```

Cada lista tem 3 rodadas. No modo Álbum, `answer` é a faixa que toca e `options` são álbuns. Contrato completo em `shared/schema/schedule.schema.json`.

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

### Busca do autocompletar (implementada no M7, `web/src/core/search.ts` e `kana.ts`)

Compara a consulta com as chaves que o catálogo já traz; nada muda no pipeline nem nos vetores.

- **Uma linha por música ou por álbum** (`buildSearchIndex(index, alvo)`):
  - **Música:** uma linha por `songKey`; single, versão de álbum e "TV Size" viram uma só, porque qualquer uma é acerto. Mostra a faixa mais popular do grupo.
  - **Álbum** (M8): uma linha por álbum; título de `album.search` (já sem " - Single"), artista das chaves de cada `artistIds`, popularidade = a da faixa mais popular do álbum (o critério de `similarity.py`).
  - "Já tentou" compara pela chave da linha (`hitKey`): o `songKey` na Música, o id do álbum no Álbum.
  - Busca no catálogo inteiro, inclusive faixas que não podem ser sorteadas (restringir daria pista).
- **Variantes da consulta:**
  - a `searchKey` dela;
  - **kana → romaji** Hepburn, só na consulta: `とうきょう` acha 東京ライツ e `かあてん` acha カーテンコール. Segue o romaji do catálogo (cutlet): `を` vira "wo";
  - **sem a última letra** quando a chave tem 2+ caracteres e termina em `t`, `z`, `d`, `m` ou em `h` fora de `sh`/`ch`: o Kunrei (`ti`→`chi`, `zi`, `di`, `du`, `hu`) e o `m` antes de `b`/`p` só se resolvem na letra seguinte, então `sakamit`, `merod` e `ichibam` continuam achando;
  - **sem `ー`**, comparada com as chaves sem `ー`: `かてん` acha `かーてんこーる`.
- **Ordem:** começo do título > começo do artista > meio do título > meio do artista ("meio" só com 2+ caracteres); dentro da mesma faixa, a consulta exata vence a truncada e a sem `ー`; depois popularidade e `id` (comparação por code unit). Até 8 linhas. Uma letra só busca por prefixo.
- **IME:** o campo escuta `compositionstart`/`compositionend` por `addEventListener` (o `onCompositionEnd` do Preact não dispara no Chrome). Durante a composição, a busca ignora o latim que ainda está virando kana no fim (`とうk`, `とうｋ`, `かーt`); romaji puro em composição (teclado do celular) busca como está. O Enter que confirma a conversão não escolhe opção.
- **Pendente para o M11:** conferir com títulos reais se o cutlet escreve as partículas `は` e `へ` como "wa" e "e". Se sim, a consulta em kana precisa de uma variante com essa leitura (hoje `は` vira "ha").

### Romaji no pipeline (decidido no M2, 08/10/2026)

Experimento com dois subagentes em paralelo, cada um num ambiente isolado, sobre 38 títulos e 15 artistas reais de J-pop com romaji esperado escrito à mão. A comparação usou a chave de busca, que ignora espaço, maiúscula e vogal longa.

| Biblioteca | Acertos | Licença | Peso instalado | Observação |
|---|---|---|---|---|
| **cutlet 0.5.2** (fugashi 1.5.2 + unidic-lite 1.0.8) | **46/53** | MIT | cerca de 250 MB | Lê kanji pelo contexto (来い ≠ 恋); erra rendaku (千本桜 → "senbon sakura") e nomes próprios (米津玄師, 藤井風) |
| pykakasi 2.3.0 | 44/53 | GPL-3.0+ | cerca de 10 MB | Lê kanji um a um (紅蓮華 → "guren hana", 君 → "kun") |

**Decisão (P21 a P23):**

- **cutlet**, no extra opcional `[romaji]`, com versões exatas.
- **Romaji é cache versionado.** O comando `romanize` grava `pipeline/data/romaji.json`, que vai para o Git e é revisado no diff. O `build` só lê o cache e nunca importa a biblioteca. Assim a CI não instala os 250 MB, e o catálogo não muda quando o dicionário muda.
- **Exibição em Hepburn.** A grafia estrangeira ("Curtain call") entra só na busca, porque às vezes erra ("Tokyo right" para 東京ライツ).
- **Antes de romanizar,** emoji e invisíveis saem e `・` vira espaço. Sem isso, o cutlet produziria `?` e `/`.
- **Precedência do latino exibido:** `aliases.toml` (`manual`) > provedor (`provider`) > cache (`cutlet`).
- **Erro de romaji não muda o resultado do palpite**, que é sempre por ID. Afeta só o autocompletar do modo digitação para aquela música, e se corrige com uma linha no `aliases.toml`.

**Resolvido no M7:** a regra `di`→`ji` da chave frouxa também pega o "di" de ディ ("merodi" vira a chave `meroji`), e "merod" deixava de ser começo de chave no meio da digitação. A variante sem a última letra (`d`) resolve.

**Validação do palpite:** sempre por **ID** escolhido na lista, nunca por texto livre. Na Música, acerta quem escolhe o mesmo `songKey`. No Álbum, acerta quem escolhe qualquer álbum que contenha o `songKey` da resposta.

## Apêndice C. Agenda diária

### Fuso

`America/Sao_Paulo` pelo nome IANA, nunca o deslocamento fixo de -03:00, para absorver uma eventual volta do horário de verão.

- **TS:** `Intl.DateTimeFormat` com `timeZone` e `formatToParts`.
- **Python:** não precisa de fuso. "Hoje" chega como argumento (`schedule --today`); a Action (`update-catalog.yml`) calcula a data de Brasília com `TZ=America/Sao_Paulo date +%F`.
- **Número do desafio:** dias corridos desde `epoch` + 1, calculados sobre as datas em texto.

### Algoritmo (implementado no M3, `schedule.py`)

1. Para cada dia de `max(epoch, último dia + 1, hoje)` até hoje + 21. **Dia que já passou nunca é gerado** (P44 (a), M10): se a geração atrasou, o intervalo fica como buraco, com aviso no CLI e no PR do robô.
2. **Janela:** K = mín(180, piso(P / 12)), com P = músicas distintas (`songKey`) entre as elegíveis e 6 respostas por dia. Com a parada fictícia, P = 37 e K = 3. Ficam de fora as faixas, músicas e álbuns respondidos nos K dias anteriores.
3. **Por rodada:** candidatos = elegíveis fora da janela, sem repetir faixa, música, álbum ou artista do dia, ordenados por `(-popularity, id)`. A faixa de dificuldade é cortada **depois** do filtro: a rodada 1 sorteia entre os primeiros ceil(n/3), a 2 entre os primeiros ceil(2n/3) e a 3 entre todos.
4. **rng** = `mulberry32(fnv1a32("musicle-jp|<data>|<alvo>"))`, alvo `song` ou `album`. **7 números por rodada:** 1 para a resposta, 3 para escolher os distratores (Fisher-Yates parcial sobre `similar`, sem as músicas das outras respostas do diário) e 3 para embaralhar as 4 opções.
5. **Afrouxamento,** com log: primeiro o artista passa a valer só dentro do mesmo diário; depois a janela encolhe (K−1 … 0). Faixa, música e álbum nunca repetem no dia. Com a parada fictícia: zero afrouxamentos em 61 dias (teste).
6. **Só acréscimo, sem exceção.** Dia gravado nunca muda. Resposta futura que deixou de ser elegível gera **aviso** e o jogo anula a rodada sem penalidade. `schedule-check --base-ref <ref>` compara com uma revisão do git (no M9, com `fetch-depth: 0` e `github.event.before`). O `compare` também recusa dia novo antes do último dia da base: o buraco nunca é preenchido (M10).
7. **Validação em dois níveis:** a estrutural (nenhum dia antes do `epoch`, `number`, opções, IDs; buraco é válido desde o M10) vale para todos os dias. Elegibilidade e restrições só valem na geração, para que uma regra nova não quebre o passado.

**Por que não calcular no navegador:** o resultado mudaria a cada atualização semanal do catálogo.

Se faltar o dia na agenda, Música e Álbum mostram "desafio de hoje indisponível" com um link para o Treino, que continua funcionando (implementado no M8).

## Apêndice D. Regras dos modos

| Regra | 4 opções | Digitação com autocompletar |
|---|---|---|
| Etapas do trecho | 1, 2, 4, 7, 11, 16 s | 1, 2, 4, 7, 11, 16 s |
| Tentativas por rodada | 1 palpite | 6 |
| Liberar mais trecho | "Ouvir mais" (custa 1 ponto) e toca na hora (P33) | Erro ou "Pular" consomem tentativa e liberam a etapa seguinte; nada toca sozinho (P46); na 6ª tentativa o "Pular" some |
| Pontos da rodada | 6 menos etapas extras; erro = 0 | 7 menos o número da tentativa que acertou; falhar = 0 |
| Desistir | "Não sei" = 0 | "Desistir": revela a resposta, 0 pontos |
| Repetir o trecho | Livre na etapa atual | Livre na etapa atual |
| Fim da rodada | Revela capa, título, artista, preview inteiro e link para a loja; marca a certa e a escolhida | Igual, com a lista de tentativas (❌, ⬛, ✅) no lugar das opções |

- **Escolha do modo** (M7, P13, P45): antes da rodada 1, todo dia, com o último usado marcado. Escolher grava `inProgress` com `events: []`, então o modo fica travado mesmo recarregando antes do 1º palpite. Se outra aba já começou ou terminou o dia, vale o modo e o andamento dela.
- **Palpite da digitação:** sempre por ID escolhido na lista (Apêndice B), uma linha por música; a música já tentada aparece marcada e não pode ser escolhida de novo.
- **Dia:** de 0 a 18 pontos por diário.
- **Treino** (M8, `core/practice.ts` e `ui/Practice.tsx`): rodadas sem fim, geradas no navegador.
  - **Saco por alvo:** Música, uma faixa elegível por `songKey` (a mais popular); Álbum, uma faixa elegível por álbum, sem repetir música no saco. Embaralhado por ciclo com `seeded("treino|<semente>|<alvo>|<ciclo>")`; a semente vem de `crypto.getRandomValues` na tela. O estado guarda só semente, ciclo, posição e a última tocada, nunca o gerador. No ciclo novo, a última tocada vai para o fim do saco.
  - **Exclusão:** as músicas (`songKey`) das respostas dos diários de hoje que ainda não têm resultado, nos dois alvos, porque a faixa toca nos dois. A faixa excluída é pulada no sorteio, sem sair do saco, e pode voltar a partir de então, quando o diário terminar. Sem nada para sortear, a tela avisa e oferece "Sortear de novo".
  - **Opções:** a certa e 3 distratores do `similar` (faixa na Música, álbum no Álbum), sem as músicas excluídas; com menos de 3, a lista inteira, como em `schedule.py`. Embaralhadas.
  - **Filtros** de alvo e de resposta valem a partir da próxima rodada. **Placar** só da sessão (P50); rodada anulada não conta. A sessão fica no `App` enquanto a página está aberta.
  - **Limitação aceita:** a data do jogo é fixada ao abrir a página; quem a deixa aberta depois da meia-noite continua com a exclusão do dia anterior até recarregar (o mesmo vale para os diários, Apêndice F).

**Distratores** (`similarity.py`, implementado no M3):

- **Faixas:** elegíveis, sem **nenhum** artista em comum (parcerias contam), com outra música e outro título.
- **Álbuns:** com capa, sem compilação, sem artista em comum (união dos artistas das faixas) e sem nenhuma música em comum (al01 e al02 nunca são opção um do outro). O Diário Álbum aceita singles (P24).
- **Proximidade:** janela de ano (±2, ±5, qualquer), diferença de popularidade e tipo de lançamento; desempate por `id`.
- **Lista de até 10, no máximo 1 por artista:** qualquer sorteio de 3 já sai com artistas distintos. O `validate` exige 3 ou mais para toda resposta possível.

## Apêndice E. Player de áudio

| Critério | HTMLAudioElement | Web Audio API |
|---|---|---|
| Corte preciso de 1 s | Aproximado (erro de dezenas a centenas de ms) | Exato: `source.start(t, offset, duração)` |
| CORS | Não exige | Exige; o servidor de previews da Apple libera (`*`) |
| Repetir trecho | Precisa de seek; pode travar | Instantâneo |
| Memória | Baixa | Cerca de 11 MB por preview decodificado |

**Implementado no M5** (`web/src/audio/`):

- Contrato `AudioEngine { unlock, preload, play(url, offset, segundos) → Playback | null, stop, retain }`. `Playback` expõe `elapsed()` (a barra lê a cada quadro) e `done` (pedido, tocado, interrompido).
- `WebAudioEngine`:
  - `unlock()` síncrono dentro do clique (bloqueio de autoplay);
  - cache da `Promise<AudioBuffer>` por URL, com no máximo a rodada atual e a próxima (`retain`, chamado pelo gancho `usePreload` do diário e do Treino, que pré-sorteia a próxima rodada);
  - uma ficha por reprodução, para ignorar resultados velhos;
  - envelope de 10 ms (`core/envelope.ts`) que termina exatamente no corte;
  - para quando a aba fica oculta.
- **Medido no navegador:** cortes de 1, 2, 4 e 7 s a menos de 10 ms do pedido (a diferença é o atraso do evento `ended`, não do som).
- Falha de áudio anula a rodada sem penalidade (`VOID { round }`).
- Barra segmentada com pesos 1, 1, 2, 3, 4 e 5 (total de 16 s), em `core/player.ts`.
- Motor falso (`audio/fake.ts`, M9): só em desenvolvimento com `?fakeAudio=1`, para os testes de ponta a ponta; "toca" na hora, sem som, e falha na faixa de `?failAudio`. O `DEV` é conferido no ponto da escolha, então o Vite o tira do build (a CI confere).
- Pendente: reserva com `<audio>` (M11, se o CORS da Apple falhar). Nada é gravado em disco (termos da Apple).

**Áudio sintético (comando `fake-assets`, M3):** só biblioteca padrão. Para cada `preview.url` do catálogo, gera um WAV de 11.025 Hz, 16 bits, mono, com a duração do preview. Toca **uma nota por segundo** da pentatônica de dó, sorteada pelo ID da faixa e sem repetir a anterior: o trecho de 1 s soa como 1 nota e o de 4 s como 4 notas, o que permite conferir o corte de ouvido. Para cada capa, gera um SVG 600×600 com cor pelo hash do ID, título e artista. Só roda com o provedor `fixture`, aceita só URLs `fixtures/(audio|art)/<nome>` e apaga arquivos órfãos. Tudo fora do Git (25,4 MiB de áudio).

## Apêndice F. Persistência e compartilhamento

Implementado no M6 (`web/src/storage/`, `core/records.ts`, `core/stats.ts`, `core/share.ts`).

- **Chave:** `musicle-jp:save`. O prefixo é obrigatório porque todos os sites de projeto em `<usuario>.github.io` compartilham o mesmo localStorage.
- **Conteúdo (`SaveV1`):** `{ schemaVersion: 1, settings, history, inProgress }`, os dois mapas por `"2026-10-08|song"`.
  - `history`: o `FinishedGame` de cada dia, `{ answerMode, number, rounds: [{ status, stage, attempts }] }`. Pontos e máximo saem de `status` e `stage`; nada derivado é gravado.
  - `inProgress`: `{ answerMode, events }`, só os eventos que o reducer aceitou.
  - `settings`: `{ answerMode? }`, o último modo usado (M7, P45). O `sanitize` guarda um modo válido sem aviso; modo inválido, chave desconhecida ou `settings` que não é objeto contam como reparo. A preferência só muda quando o modo escolhido é o que fica travado no dia (`withModeChoice`).
- **Retomada por eventos:** `startSession` repete os eventos sobre o jogo novo do dia. Como o reducer é puro, recarregar retoma igual, inclusive rodada anulada. Se a repetição chegar ao fim, o jogo vira histórico. Se ela descartar eventos (catálogo novo no mesmo dia), a sessão sai com `stale` e a aba regrava a lista aceita com `replaceProgress`; sem isso, a regra da lista mais longa impediria gravar os próximos eventos.
- **Virada do dia:** ao abrir, o `inProgress` de outros dias é descartado. Quem começou o dia D com a aba aberta termina o dia D, mas recarregar depois da meia-noite perde esse andamento.
- **Tolerância a falha:**
  - `openStore` testa o armazenamento só com uma **leitura**; se ela lançar ou o armazenamento não existir, o jogo segue em memória, com aviso. A sonda não grava: com a cota cheia, o save que já existe ainda é lido (dia terminado continua terminado).
  - JSON ilegível ou fora da forma: o texto original vai para `musicle-jp:corrupt` (só se a chave estiver vazia) e o jogo recomeça. Entrada inválida dentro de um save bom é descartada sozinha; mapa ausente vira vazio sem levar o histórico junto.
  - Versão maior que a suportada: não é sobrescrita; o jogo segue sem salvar, com aviso.
  - Falha ao gravar: `updateSave` devolve o motivo (`full`, `future` ou `unavailable`), e a tela mostra o aviso certo uma vez, visível e na região `aria-live`.
  - Migrações em `storage/migrations.ts`, uma função por versão (vazio na v1).
- **Duas abas:** `updateSave` relê, mescla e grava. No histórico, o primeiro término vence; no andamento do mesmo jogo, vence a lista de eventos mais longa. O resumo relê o save, então mostra o resultado que ficou gravado. **Limitação aceita:** com duas abas dá para refazer uma rodada (uma erra e vê a resposta, a outra acerta); o jogo é pessoal e não há ranking.
- **Abas do jogo** (M8, P49): o `App` guarda a última leitura do save (`latest`) e relê ao trocar de aba, quando um diário termina (`onSaved`) e quando outra aba do navegador grava (evento `storage`). Cada aba de diário monta do zero com essa leitura, então voltar à Música terminada mostra o resultado (P39). O Treino não grava nada (P50).
- **Save da sessão** (`sessionStore`, M8): grava no navegador quando dá; o que não consegue gravar (cota cheia) fica em memória, e sem gravação nenhuma (versão futura, sem acesso) tudo fica em memória. Assim trocar de aba não perde o andamento nem nesses casos. O que foi gravado não fica em memória, para a mescla das duas abas continuar vendo o que a outra gravou.
- **Estatísticas:** função pura sobre o histórico, por alvo: jogos, média, distribuição de 0 a 18, sequência atual e melhor (P38, P40, P41). "Hoje" é a data do jogo, não o relógio; hoje ainda não jogado não quebra a sequência. **Dia que faltou** (Action ou merge parados por mais de 21 dias): desde a P44 (a), no M10, ele vira buraco e não quebra a sequência. Risco residual: dias gerados durante uma parada e publicados só no merge entram na agenda sem que ninguém os tenha podido jogar.
- **Compartilhar:** `core/share.ts` recebe só o `FinishedGame`, que não tem IDs nem títulos. Símbolos da P42; no modo 4 opções, um ⬛ por "ouvir mais" e depois ✅ ou ❌. Exemplo:
  ```
  musicle-jp · Diário Música nº 1 · 4 opções
  11/18
  ✅
  ❌
  ⬛✅
  https://<usuario>.github.io/musicle-jp/
  ```
  `navigator.clipboard.writeText` é chamado dentro do clique; sem ele (fora de HTTPS), aparece um campo só de leitura com o texto selecionado.
- **Contagem regressiva:** mira `startOfDayInZone(addDays(data do jogo, 1))` e recalcula pelo relógio a cada segundo e quando a aba volta a ficar visível. Ao zerar, oferece "Jogar o novo desafio".

## Apêndice G. Organização do código TS

Implementado no M4 (`web/src/core/`):

- **Estado:** `GameState { puzzleId, target, answerMode, rounds, current }`. Não há campo `status`: `isFinished` é derivado (nenhuma rodada em andamento), então fechar a aba depois da 3ª rodada não deixa o jogo "em andamento".
- **Rodada:** `RoundState { trackId, correctOptionId, accepted, options, stage, attempts, status, voidReason }`. `trackId` é o que toca; `correctOptionId` é a opção a destacar (a faixa, ou o álbum dela); `accepted` são os IDs que contam como acerto, calculados ao criar a rodada (versões da mesma música), para o reducer não consultar o catálogo.
- **Eventos:** `GUESS`, `LISTEN_MORE`, `SKIP`, `GIVE_UP`, `VOID` (falha de áudio) e `NEXT_ROUND`. Evento inválido devolve **o mesmo objeto**.
- **Regras por modo** em `MODE_RULES` (`rules.ts`): palpites, o que um erro faz, se pode ouvir mais ou pular. Pontos = 6 − etapa nos dois modos.
- **Rodada anulada** (`void`): nasce assim se a resposta sumiu ou perdeu a elegibilidade; sai do total (P27).
- **Tipos** do contrato gerados de `shared/schema` (`npm run types`).
- **UI:** `useReducer` do Preact recebe o reducer do `core` (M5), embrulhado no M6 pelo `playReducer` do `Game.tsx`, que guarda também a lista de eventos aceitos para o save.
- **Rodadas soltas** (M8): `createRounds(planejadas, alvo, índice)` monta as rodadas da agenda (via `createGame`) e as do Treino (`practiceGame`: um `GameState` de 1 rodada, `puzzleId` `treino|...`), com o mesmo reducer.
- **Rodada na tela** (M8): `RoundView.tsx` (Player, opções ou digitação, rodada anulada, revelação) serve ao diário e ao Treino; quem chama cuida do cabeçalho, do save e do que vem depois (`nextLabel`, `onNext`). Ganchos comuns em `ui/hooks.ts`: `useSuggest`, `usePreload`, `previewUrl`.
- **Rotas** (M8): `core/routes.ts` (`Tab`, `ROUTES`, `tabFromHash`, `todayHref`), puro e testado.
- **i18n:** `pt-BR.ts` exporta um objeto de textos; `t(chave, parâmetros)` é tipado por `keyof`. Plural com `tn(chave, n)` sobre chaves `.one` e `.other` (M6): usa `Intl.PluralRules('pt-BR')`, mas força o zero no plural, porque o `Intl` diz "one" para 0 em português ("0 ponto").

## Apêndice H. Testes e qualidade

| Camada | Ferramenta | Cobertura |
|---|---|---|
| Pipeline | pytest | Vetores de normalização e PRNG; romaji; merge cumulativo; agenda (determinismo, só acréscimo, janela sem repetição, distratores válidos, buraco da P44: nunca gera passado nem preenche o buraco); schema; bytes idênticos em duas execuções; CLI |
| Núcleo web | Vitest | Reducer nas 4 combinações; pontuação; share; virada de dia às 23:59 e 00:00 de Brasília; busca com kana, kanji e romaji; storage (migração, JSON corrompido, cota cheia); sequência com dia pulado. Meta: 90% de linhas no `core` |
| Componentes | Vitest + Testing Library + happy-dom (por arquivo) | `GuessInput` (teclado, ARIA combobox, IME, rolagem, região de status), `Player` (regras do modo, foco, falha atrasada) e `ModePicker` (M7); `RoundView`, `Practice` e `Options` (capas) (M8) |
| Ponta a ponta | Playwright (Chromium) na CI | Diário completo com relógio fixo e áudio fake; recarregar no meio retoma; falha de áudio anula a rodada; virada à meia-noite de Brasília; Treino |
| Exploratório | Navegador do Claude | Visual, console e cliques durante o desenvolvimento |
| Lint e formato | Ruff (Python), Biome (TS), `tsc --noEmit` estrito | |
| Contrato Python × TS | pytest chamando o Node | Teste cruzado (M4): `normalize` e `looseKey` em TS comparados com o Python em todos os 62.034 caracteres do plano básico do Unicode 15.0 e 88.740 strings |

## Apêndice I. GitHub e CI

Implementado no M9 (repositório público `PlasmaStorm49/musicle-jp`, CI e proteção) e no M10 (deploy e agenda semanal).

- **CI** (`.github/workflows/ci.yml`), em todo PR e push na `main`, sem filtro de caminho (workflow pulado deixaria a checagem obrigatória pendente). Três tarefas, que são as checagens obrigatórias:
  - **`pipeline`:** Python 3.12 e Node 24 (o teste cruzado e o do PRNG pulam sem Node), `npm ci --prefix web` antes do pytest (o teste do hook usa o Biome), `pip install -c pipeline/constraints.txt -e "pipeline[dev]"` (versões exatas, P60; sem o extra `romaji`, cujo teste pula), Ruff, pytest, `romanize --check`, `validate` e `schedule-check`. O checkout tem `fetch-depth: 0`; a agenda é comparada, no PR, com o 1º pai do commit de merge de teste (`HEAD^1`, a base exata do que foi testado) e, no push, com o `before` (`HEAD^1` em branch novo). O Ruff cobre também o `.claude/hooks`, com a configuração do pipeline.
  - **`web`:** `npm ci`, `npm run check`, `npm run build` e a conferência de que o motor de áudio falso não está no `dist`.
  - **`e2e`:** `fake-assets`, Chromium do Playwright e `npm run e2e`; o relatório sobe como artefato quando falha.
- **Segurança da CI:**
  - token só de leitura (`permissions: contents: read`);
  - actions pinadas por SHA, com a versão no comentário, e só versões com 14 dias ou mais (a regra da P28 vale também para as actions);
  - `persist-credentials: false`;
  - valores do evento passados por `env:`, nunca direto no script;
  - `ubuntu-24.04` fixo;
  - o `pull_request` roda o `ci.yml` do próprio PR: um PR que mexe em `.github/` pode afrouxar as checagens e ainda assim ficar verde. Leia o diff do workflow antes do merge. O ruleset prende as checagens à origem GitHub Actions (`integration_id`): um status com o mesmo nome vindo de outra origem não vale.
- **Ponta a ponta** (Playwright, `web/e2e/`): contra o servidor de desenvolvimento, com o motor de áudio falso (`?fakeAudio=1`, só em DEV) e o relógio fixo (`page.clock.setFixedTime`, antes do `goto`), no fuso de Tóquio, para pegar uso da hora local.
- **Proteção da `main`** por ruleset, sem bypass:
  - PR obrigatório, sem exigir aprovação (dono único);
  - checagens `pipeline`, `web` e `e2e` obrigatórias e atualizadas com a base;
  - só merge commit;
  - não se apaga nem se reescreve a `main`;
  - as checagens ficam presas ao GitHub Actions (`integration_id` 15368).
- **Repositório e Actions** (configurados no M9 por `gh api`):
  - histórico reescrito antes de publicar (P54, P58): e-mail noreply do GitHub em todos os commits e o perfil genérico no `CLAUDE.md` em todas as versões; backup em bundle, fora do repositório;
  - só actions do próprio GitHub, com pinagem por SHA obrigatória;
  - token padrão só de leitura e Actions sem poder de criar nem aprovar PR (no M10, a P64 ligou essa chave);
  - PR de colaborador externo só roda a CI depois de aprovado;
  - só merge commit, com o branch apagado depois do merge.
- **Critério de pronto conferido** (09/10/2026):
  - PR #1 (o M9): `pipeline`, `web` e `e2e` verdes; enquanto rodavam, o PR ficou `BLOCKED`; merge commit pela proteção;
  - PR #2 (demonstração, teste quebrado de propósito no `web`): `web` vermelha e PR `BLOCKED`. O `gh pr merge` foi recusado (`the base branch policy prohibits the merge`), e o `gh pr merge --admin` também (`Repository rule violations found: Required status check "web" is failing`). Fechado sem merge.
- **Deploy** (`.github/workflows/deploy.yml`, M10), a cada push na `main` (o merge de um PR) e sob demanda, em `https://plasmastorm49.github.io/musicle-jp/`:
  - `pages-build` (só leitura): `fake-assets` e `npm run build` com a base `/musicle-jp/`, que só vale no build e no preview (o desenvolvimento e o e2e ficam na raiz); confere o site (base, sem o motor falso, todo áudio e capa do catálogo no `dist`) e sobe o artefato;
  - `pages-deploy`: `pages: write` e `id-token: write`, no ambiente `github-pages`, que só aceita a `main`;
  - um deploy por vez, sem cancelar no meio. Roda junto com a CI do push, porque o `strict` do ruleset garante que a árvore do merge já foi testada no PR;
  - a tarefa `web` da CI confere a base no `dist/index.html`: sem ela, a página publicada ficaria em branco.
- **Atualização da agenda** (`.github/workflows/update-catalog.yml`, M10):
  - segunda às 06:17 de Brasília (`cron: "17 9 * * 1"`: o cron é em UTC, e o minuto zero é horário de pico) e sob demanda, sem entradas;
  - `catalog-generate` (só leitura): `build`, `schedule --today` com a data de Brasília, `validate` e `schedule-check`. Sem dia novo, termina sem PR; se mudar algo além da agenda, falha;
  - `catalog-pr` (`contents: write`, `pull-requests: write`): não roda código do projeto nem instala pacotes, então um pacote comprometido do pip nunca chega perto do token que escreve. Confere de novo com `jq` que só entram dias depois do fim da agenda, envia o branch `catalogo/<data>` com o token num auxiliar de credencial (fora do `.git/config`), abre o PR e fecha o anterior que ficou sem merge;
  - o PR do `GITHUB_TOKEN` não roda a CI sozinho: as checagens esperam "Approve workflows to run" (P64). O merge humano dispara o deploy; um push feito com o `GITHUB_TOKEN` não dispararia;
  - "Allow GitHub Actions to create and approve pull requests" ligado (P64). Criar e aprovar são a mesma chave: qualquer workflow com `pull-requests: write` poderia aprovar um PR. Hoje o ruleset não exige aprovação, então a `main` não fica mais aberta; rever se um dia exigir;
  - o workflow agendado é desligado depois de 60 dias sem atividade no repositório: `gh workflow enable update-catalog.yml`;
  - nenhuma tarefa nova se chama `pipeline`, `web` ou `e2e`: viraria checagem com o mesmo nome.
- **Configurações do M10** (por `gh api`): Pages com origem "GitHub Actions"; ambiente `github-pages` com regra de branch só para a `main`; a chave da P64.

## Origem

- **Musicle**, observado no navegador em 08/10/2026: `musicle.app/hitparade/jp` (3 rodadas, 4 capas, previews em `audio-ssl.itunes.apple.com`, capas em `mzstatic.com`).
- **Pesquisa de APIs** (subagente, 08/10/2026): developer.apple.com/programs/enroll, performance-partners.apple.com/search-api, developer.spotify.com/policy, developer.spotify.com/blog/2024-11-27-changes-to-the-web-api, developers.deezer.com/termsofuse, developers.google.com/youtube/terms/developer-policies. Endpoints testados na seção 3.
- **Desenho técnico:** subagente Plan, revisado pelo Claude.
- **Pesquisa do GitHub para o M10** (subagente, 09/10/2026): docs.github.com (Pages com workflow próprio, `POST /repos/{owner}/{repo}/pages`, ambientes e regras de branch, eventos do `GITHUB_TOKEN`, cron e a desativação após 60 dias), github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved, e as releases e o `action.yml` de `actions/upload-pages-artifact`, `actions/deploy-pages` e `actions/download-artifact`.
- **Decisões P6 a P15:** respondidas pelo usuário na sessão de 08/10/2026.
