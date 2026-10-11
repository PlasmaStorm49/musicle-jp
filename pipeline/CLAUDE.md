# pipeline (Python)

Complementa o `CLAUDE.md` da raiz. Os comandos estão lá e rodam da raiz.

## Mapa

| Módulo | Papel |
|---|---|
| `models.py` | Contrato do provedor (`ChartSnapshot`, `RawTrack`...) e validação da entrada (`check_snapshots`) |
| `providers/` | Um arquivo por provedor: `fixture.py` lê `fixtures/chart_fixture.json`; `apple.py` lê os snapshots reais de `data/apple/snapshots/` e mapeia a resposta da Apple para o contrato (sem rede) |
| `fetch.py` | **Único módulo com rede** (comando `fetch`): RSS JP + iTunes lookup, resposta aparada num snapshot por dia. Nunca toca o `previewUrl` |
| `paths.py` | Caminhos do repositório e a curadoria de cada provedor (`provider_paths`) |
| `normalize.py` | Normalização, chave frouxa, sufixos de versão, `songKey`, `display`. Espelho em TS no M4 |
| `catalog.py` | Redução de todos os snapshots em catálogo; popularidade, elegibilidade, `Curation` |
| `romaji_cache.py` | Lê e grava o `romaji.json` do provedor (`fixtures/` ou `data/apple/`); diz quais textos precisam de romaji |
| `romaji.py` | Invólucro do cutlet. **Só o comando `romanize` importa** |
| `aliases.py` | Lê e valida o `aliases.toml` do provedor (curadoria manual) |
| `similarity.py` | Distratores (`similar`) de faixas e álbuns, no fim do build |
| `prng.py` | `fnv1a32` + `mulberry32`. Espelho em TS no M4 e referência em `shared/vectors/prng_reference.mjs` |
| `schedule.py` | Agenda só de acréscimo: geração, validação estrutural, `compare`, leitura do git |
| `fake_assets.py` | WAV e SVG sintéticos a partir do catálogo (só provedor `fixture`) |
| `validate.py` | Schema JSON + invariantes (inclusive distratores) + hosts de URL por provedor + forma canônica |
| `io_json.py` | JSON canônico e escrita atômica |
| `cli.py` | `fetch`, `build`, `validate`, `romanize`, `fake-assets`, `schedule`, `schedule-check` |

## Regras

1. **Determinismo.** Nada de relógio, `random` ou ordem de `set`/`dict` sem ordenar na saída. O Ruff (TID251) barra relógio e `random`; um teste roda o build com dois `PYTHONHASHSEED` diferentes.
2. **O catálogo é refeito do zero a cada build.** Não escreva lógica que dependa do catálogo anterior.
3. **Mudou `normalize.py`?** Atualize `shared/vectors/normalize.json` com valores calculados à mão a partir da regra, nunca copiados da saída do código.
4. **Mudou algo que afeta a saída?** Regere os dois catálogos com o `build` (`--provider fixture` e `--provider apple`): o teste "catálogo versionado em dia" (`test_committed_catalog_is_up_to_date`) vale para os dois. Dentro de `web/public`, cada provedor só grava na sua pasta (fixture em `fixtures/`, apple em `data/`): o `build` recusa o resto.
5. **JSON só via `io_json`.** Todo `open` com `encoding="utf-8"`.
6. **Texto de exibição em NFC; chave de comparação via `normalize`/`search_key`.**
7. **Não renomeie IDs da parada fictícia.** Os testes citam os casos de borda por ID (tabela em `fixtures/README.md`).
8. Números com casas decimais saem de `Decimal`, arredondados, para dar o mesmo resultado em Windows e Linux.
9. **O build nunca importa `romaji.py`.** Ele lê o cache. Um teste em subprocesso confere isso.
10. **Não edite `romaji.json` à mão** (nem os snapshots). Ele é saída do `romanize`. Correção vai no `aliases.toml` do mesmo provedor, que vence o provedor e o romaji (`manual` > `provider` > `cutlet`). Curadoria e cache são por provedor: fixtures em `fixtures/`, Apple em `data/apple/`.
11. **Título latino exibido = Hepburn.** A grafia estrangeira do cutlet ("Curtain call") entra só na busca, porque às vezes erra ("Tokyo right").
12. **Vetores do PRNG são a exceção à regra 3:** `shared/vectors/prng.json` é gerado por `node shared/vectors/prng_reference.mjs`, uma segunda implementação independente. Nunca edite à mão nem gere com `>` no PowerShell.
13. **Agenda só cresce.** Nunca altere dia existente, nem para "corrigir". Mudou o consumo do rng (7 números por rodada) ou a ordem de escolha? Isso muda só os dias novos, e o `schedule-check` protege os antigos. **Dia que já passou nunca é gerado** (P44): a geração começa em `max(epoch, último + 1, hoje)`, o buraco é válido, e o `compare` recusa preenchê-lo.
14. **"Hoje" é argumento** (`--today`). O pacote nunca lê o relógio; a Action passa a data de Brasília (`TZ=America/Sao_Paulo date +%F`).
15. **Dependências** (P28 e P60): versão com 14 dias ou mais de publicada no PyPI, fixada em `constraints.txt`, inclusive as indiretas. Mudou o `pyproject.toml`? Atualize o `constraints.txt` e reinstale com `-c pipeline/constraints.txt` (comando em `CLAUDE.md` da raiz). Mudou a versão de uma biblioteca do romaji (cutlet, fugashi, unidic-lite, jaconv, mojimoji)? No mesmo PR, rode `romanize --refresh` nos dois provedores e revise o diff: o `romaji.json` grava as versões, e o robô semanal recusa um romaji que muda o que já existe.
16. **Rede só no `fetch`** (M11). `build`, `validate`, `schedule` e `romanize --check` leem arquivos e ficam determinísticos; um teste em subprocesso confere que eles não importam o `fetch`. Biblioteca padrão (`urllib`): nada de pacote HTTP novo (P60).
17. **Snapshots reais só crescem** (`data/apple/snapshots/AAAA-MM-DD.json`), como a agenda: o catálogo é cumulativo e os dias antigos da agenda citam faixas que já saíram da parada. O mapeamento da resposta da Apple fica na leitura (`providers/apple.py`, P72): erro de mapeamento se corrige no código, sem regravar snapshot.
18. **Faixa da Apple tem álbum fixo** (o primeiro que apareceu): se a Apple mudar o `collectionId`, o álbum antigo ficaria sem faixa e travaria a agenda. O build avisa.
19. **Guardas do `fetch`:** um snapshot por dia. Se o arquivo do dia existe, sai com 0 sem usar a rede; `--today` anterior ao último snapshot sai com 1; parada com os mesmos ids da anterior não grava nada (sai com 0). Faixa com URL fora dos hosts da Apple ou data impossível conta como sem lookup, dentro do limite de 20%. Evite `fetch` manual na segunda: o seu PR e o do robô gerariam o mesmo arquivo.
20. **Parceiros e prévias** (checkup, `providers/apple.py` e `catalog.py`): parceiro conhecido (artista de alguma faixa) entra nos `artistIds` depois do 1º, por uma chave estrita (largura, caixa e espaços; nunca a `search_key`), com 2 caracteres ou mais e sem nome de dois artistas; os artistas de todos os snapshots entram antes das faixas (duas passadas). A última prévia conhecida vale por uma aparição sem prévia; na segunda seguida, a faixa fica inelegível. Texto que o cutlet não lê fica no `romaji.json` como ele mesmo, com aviso: serve à busca, mas nunca vira latino.
