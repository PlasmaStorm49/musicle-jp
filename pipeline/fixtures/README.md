# Parada fictícia

`chart_fixture.json` é uma parada japonesa **inventada** (nenhum artista ou música real), usada até o M11 no lugar da API. Três snapshots semanais (21/09, 28/09 e 05/10/2026), 30 posições cada, 42 faixas, 14 artistas e 33 álbuns.

Os testes citam os casos de borda pelo ID. **Não renomeie os IDs.**

| ID | Caso |
|---|---|
| tr01, tr02, tr03 | Mesma música de ar01: single `- Single` (al01), álbum (al02), `(TV Size)` (al03) → mesmo `songKey` |
| tr04 | Mesmo título de tr01, outro artista (ar14) → `songKey` diferente |
| tr05 | Parceria de 2 artistas (ar02, ar07) |
| tr06 | Só no 1º snapshot (sai da parada) |
| tr07 | Só no 3º (entra) |
| tr08 | 1º e 3º (sai e volta) |
| tr09 | Muda `previewUrl` e capa do álbum entre snapshots; `isrc` some no 2º |
| tr10 | Explícita |
| tr11 | Preview de 10 s → `short-preview` |
| tr12 | Álbum sem capa → `no-artwork` |
| tr13 | Sem preview → `no-preview` |
| tr14 | Título `♡` (só símbolo) |
| tr15 | Título com ZWSP e `❤️` |
| tr16 | Título em NFD (`カ` + dakuten combinante) |
| tr17, tr18 | `ＬＯＶＥ　ＳＯＮＧ` (largura total) e `ｱｲﾉｳﾀ` (meia largura) |
| tr19, tr20 | `♪` e `①` no título |
| tr21, tr22 | Título em inglês; `titleLatin` oficial com mácron (`Tōkyō Lights`) |
| tr23, tr24 | Duas faixas do mesmo álbum |
| tr25, tr26 | Títulos `Live` e `Stay (Forever)` (não podem ser cortados) |
| tr27, tr28 | `(feat. ナナ)` e ` - TV Size (Live)` |
| tr29 a tr42 | Faixas comuns, com artistas de nome em `ヴ`, `・`, `ぱ`, número e latim |

Os caracteres invisíveis e decompostos estão gravados como escape (`​`, `゙`...) no JSON, para sobreviver a editores.
