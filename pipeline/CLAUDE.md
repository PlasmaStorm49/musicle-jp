# pipeline (Python)

Complementa o `CLAUDE.md` da raiz. Os comandos estão lá e rodam da raiz.

## Mapa

| Módulo | Papel |
|---|---|
| `models.py` | Contrato do provedor (`ChartSnapshot`, `RawTrack`...) e validação da entrada (`check_snapshots`) |
| `providers/` | Um arquivo por provedor; `fixture.py` lê `fixtures/chart_fixture.json` |
| `normalize.py` | Normalização, chave frouxa, sufixos de versão, `songKey`, `display`. Espelho em TS no M4 |
| `catalog.py` | Redução de todos os snapshots em catálogo; popularidade, elegibilidade, `Curation` |
| `romaji_cache.py` | Lê e grava `data/romaji.json`; diz quais textos precisam de romaji |
| `romaji.py` | Invólucro do cutlet. **Só o comando `romanize` importa** |
| `aliases.py` | Lê e valida `data/aliases.toml` (curadoria manual) |
| `validate.py` | Schema JSON + invariantes + forma canônica |
| `io_json.py` | JSON canônico e escrita atômica |
| `cli.py` | `build` e `validate` |

## Regras

1. **Determinismo.** Nada de relógio, `random` ou ordem de `set`/`dict` sem ordenar na saída. O Ruff (TID251) barra relógio e `random`; um teste roda o build com dois `PYTHONHASHSEED` diferentes.
2. **O catálogo é refeito do zero a cada build.** Não escreva lógica que dependa do catálogo anterior.
3. **Mudou `normalize.py`?** Atualize `shared/vectors/normalize.json` com valores calculados à mão a partir da regra, nunca copiados da saída do código.
4. **Mudou algo que afeta a saída?** Regere `web/public/fixtures/catalog.json` com o `build`. O teste `test_committed_catalog_is_up_to_date` falha até isso.
5. **JSON só via `io_json`.** Todo `open` com `encoding="utf-8"`.
6. **Texto de exibição em NFC; chave de comparação via `normalize`/`search_key`.**
7. **Não renomeie IDs da parada fictícia.** Os testes citam os casos de borda por ID (tabela em `fixtures/README.md`).
8. Números com casas decimais saem de `Decimal`, arredondados, para dar o mesmo resultado em Windows e Linux.
9. **O build nunca importa `romaji.py`.** Ele lê o cache. Um teste em subprocesso confere isso.
10. **Não edite `data/romaji.json` à mão.** Ele é saída do `romanize`. Correção vai em `data/aliases.toml`, que vence o provedor e o romaji (`manual` > `provider` > `cutlet`).
11. **Título latino exibido = Hepburn.** A grafia estrangeira do cutlet ("Curtain call") entra só na busca, porque às vezes erra ("Tokyo right").
