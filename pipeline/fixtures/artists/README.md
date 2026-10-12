# Artistas fictícios (modo por artista, M13)

Três artistas da parada fictícia, para o `npm run dev`, o e2e e os testes. As faixas que ficam são as da parada, citadas pelo id (`"ref"` em `artists_fixture.json`): os mesmos títulos e URLs, então o `fake-assets` da parada já gera o áudio e as capas. As versões sintéticas (`trx*`, `alx*`) existem só para cair nas regras e **nunca** chegam ao arquivo publicado (um teste confere).

Saída: `web/public/fixtures/artists/` (o `index.json` e um arquivo por artista), gerada pelo `build-artists --provider fixture`. Romaji em `romaji.json` (gerado pelo `romanize --provider fixture --artists`), curadoria em `artists.toml` e `aliases.toml`. **Não renomeie os IDs.**

| Artista | Caso | Músicas publicadas |
|---|---|---|
| ar02 夜風シアター | `tr05` (parceria com ar07, ele como principal); `trx01` "開幕ベル (Karaoke)" e `trx02` num álbum "LIVE TOUR" entram como versões que não vão ao sorteio; `trx03` "夜風ワルツ (Karaoke)" só existe em karaokê e sai da lista; a mais popular (`tr05`) é de um álbum em parceria, e a capa do cartão (P168) vem do álbum só dele, o `al21` | tr05, tr23, tr38, tr24 |
| ar07 青井ユウ | `tr05` é participação (outro artista principal): o `songKey` termina com ar07; `alx03` "BLUE SIDE" sai pelo `exclude_albums` (o álbum em inglês sem sufixo); `trx05` "Kimi to ❤️" é a mesma música de `tr15` pelo `same_song` | tr27, tr05, tr15, tr41 |
| ar01 ミナト | `tr01` a `tr03` são a mesma música (a canônica é a mais antiga, `tr01`; o TV Size não entra); `trx06` com o crédito "(… from …)" é o mesmo 灯台; `trx07` sai pelo `exclude_tracks` | tr01, tr37 |
