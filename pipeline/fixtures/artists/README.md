# Artistas fictícios (modo por artista, M13)

Cinco artistas da parada fictícia, para o `npm run dev`, o e2e e os testes: três na lista principal e dois na seção de fora do Japão (P200). As faixas que ficam são as da parada, citadas pelo id (`"ref"` em `artists_fixture.json`): os mesmos títulos e URLs, então o `fake-assets` da parada já gera o áudio e as capas. As versões sintéticas (`trx*`, `alx*`) existem só para cair nas regras e **nunca** chegam ao arquivo publicado (um teste confere).

Saída: `web/public/fixtures/artists/` (o `index.json` e um arquivo por artista), gerada pelo `build-artists --provider fixture`. Romaji em `romaji.json` (gerado pelo `romanize --provider fixture --artists`), curadoria em `artists.toml` e `aliases.toml`. **Não renomeie os IDs.**

| Artista | Caso | Músicas publicadas |
|---|---|---|
| ar02 夜風シアター | `tr05` (parceria com ar07, ele como principal); `trx01` "開幕ベル (Karaoke)" e `trx02` num álbum "LIVE TOUR" entram como versões que não vão ao sorteio; `trx03` "夜風ワルツ (Karaoke)" só existe em karaokê e sai da lista; a mais popular (`tr05`) é de um álbum em parceria, e a capa do cartão (P168) vem do álbum só dele, o `al21` | tr05, tr23, tr38, tr24 |
| ar07 青井ユウ | `tr05` é participação (outro artista principal): o `songKey` termina com ar07; `alx03` "BLUE SIDE" sai pelo `exclude_albums` (o álbum em inglês sem sufixo); `trx05` "Kimi to ❤️" é a mesma música de `tr15` pelo `same_song` | tr27, tr05, tr15, tr41 |
| ar01 ミナト | `tr01` a `tr03` são a mesma música (a canônica é a mais antiga, `tr01`; o TV Size não entra); `trx06` com o crédito "(… from …)" é o mesmo 灯台; `trx07` sai pelo `exclude_tracks` | tr01, tr37 |
| ar11 Re:Pulse | Seção de fora do Japão (`section = "foreign"`). No `artists.toml` vem antes do ar06, e o índice o põe depois: a seção sai em ordem alfabética (P201), pelo build | tr10, tr35, tr25 |
| ar06 Hoshizora Drive | Seção de fora do Japão, com nome só latino (`nameLatin` nulo) | tr21, tr42 |

## As medalhas (M16)

Os 3 nomes de cada artista são obrigatórios (P301), com o latino nos 3 quando o nome tem kana, kanji ou hangul (P295, P309), e o `build-artists` recusa o artista sem eles. Os nomes daqui são inventados.

| Artista | Os nomes (acertos, completo, perfeito) | O resto do `[artists.medals]` |
|---|---|---|
| ar02 夜風シアター | 開幕ベル · Kaimaku Bell; 真夜中のカーテンコール · Mayonaka no Curtain Call (o nome longo, que mede a tela em 320 px); 夜風劇場 · Yokaze Gekijo | Tudo: a capa do `al30` (outra que a do cartão, o `al21`: o teste da capa das medalhas não pode passar por acaso), o enquadramento, as flores e a faixa em pé (6 caracteres, o máximo) |
| ar07 青井ユウ | Blue Diary; 青い日記 · Aoi Nikki; ユウ · Yu | Só os nomes: a capa do cartão, as flores lilás e a faixa do nome |
| ar01 ミナト | 夜明け · Yoake; Dawn Collection; 港 · Minato | Só os nomes |
| ar11 Re:Pulse | RIOT; ゼロ距離 · Zero Kyori; Re:Pulse | A faixa deitada (`along = true`) |
| ar06 Hoshizora Drive | Midnight Drive; 流星 · Ryusei; 星空 · Hoshizora | Só os nomes; a faixa sem escolha: o nome latino longo vai deitado (P299) |
