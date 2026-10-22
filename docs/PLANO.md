# Plano do projeto musicle-jp

> **Nota de validação:** documento gerado por IA (Claude Code) a partir da exploração do Musicle, de pesquisa de APIs e das decisões do usuário. O que ainda não foi conferido aparece como "hipótese" no texto. Revise antes de tomar como verdade.

## 1. Objetivo

Jogo web em que o jogador ouve um trecho de música popular japonesa e adivinha a música ou o álbum. Projeto pessoal para aprender a usar o Claude Code. Cada marco exercita um recurso diferente da ferramenta.

## 2. Decisões fechadas

| # | Decisão |
|---|---|
| P6/P7 | **Substituída pela P100.** Duas dimensões independentes: alvo (Música ou Álbum) × resposta (4 opções ou digitação com autocompletar) |
| P9 | Site estático + pipeline Python que gera catálogo e agenda em JSON; GitHub Pages; Action semanal atualiza |
| P10 | Frontend TypeScript + Vite, testes com Vitest |
| P11 | Diário (igual para todos, vira à 00:00 de Brasília) + modo Treino ilimitado |
| P12 | Interface só em PT-BR, textos centralizados em `web/src/i18n/pt-BR.ts` |
| P13 | Dois diários por dia, 3 rodadas cada (desde a P100, o Normal e o Desafio). **A escolha do tipo de resposta antes da rodada 1, travada no dia, saiu com a P100** |
| P14 | Preact com hooks, sem biblioteca de estado |
| P15 | Repositório público no GitHub |
| P17 | Faixas explícitas podem ser resposta; a tela mostra um aviso de conteúdo explícito (M5) |
| P18 | Desafio nº 1 da agenda falsa em 2026-10-08 (início do projeto) |
| P21 a P23 | Romaji com cutlet, em cache versionado; grafia estrangeira só na busca (Apêndice B) |
| P24 | O Normal (antes, o Diário Álbum) aceita singles, em definitivo |
| P25 | `epoch` da agenda real (M11, em `public/data/`, com IDs da Apple): 2026-10-10, decidido nesse dia. Se ela for publicada depois, o 1º desafio real sai com nº maior que 1, e os dias entre o `epoch` e a publicação ficam como buraco (P44) |
| P27 | Rodada anulada sai do total do dia (o máximo cai de 18 para 12 com uma anulada) |
| P28, P29 | Dependências com 14 dias ou mais de publicadas, inclusive as indiretas (`web/.npmrc`); exceção só para patch de segurança com aviso publicado: vite 8.3.3 e source-map-js 1.2.2. No `.npmrc` a exceção é **por nome** do pacote, então vale para qualquer versão nova deles: sai depois de 20/10/2026, quando o vite 8.3.3 completa 14 dias (ME29). Saiu em 21/10/2026: o aviso do dia (GHSA-8g5g-mxqh-grgj) é só do vite 6, e o lockfile segue no 8.3.3 |
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
| P42 | Compartilhar com formas, não só cores: ⬛ ouvir mais (no Desafio, pulou), ✅ acerto, ❌ erro, ⬜ anulada |
| P44 | A agenda nunca gera dia passado (M10): a geração começa em `max(epoch, último + 1, hoje)`. O dia que não foi gerado a tempo vira buraco ("indisponível"), que não quebra a sequência (P40) e nunca é preenchido (o `compare` recusa) |
| P45 | **Substituída pela P100.** O modo de resposta é escolhido todo dia antes da rodada 1, com o último usado marcado e com o foco |
| P46 | No Desafio (digitação) nada toca sozinho: pulo e erro só liberam a etapa; o jogador clica em Tocar |
| Dec. M7 | Na última tentativa do Desafio (digitação) o "Pular" some e fica só o "Desistir" (os dois dariam 0 ponto) |
| P49 | Abas no topo (Início, Normal, Desafio, Treino), com a aba no endereço (`#inicio`, `#normal`, `#desafio`, `#treino`; P101) e ✓ no diário terminado. Desde a home, o endereço vazio ou desconhecido abre a home (antes, a Música) |
| P50 | O Treino não salva nada: só o placar da sessão, e recarregar a página começa outra |
| P51 | No Normal (antes, no Álbum), as opções mostram capa, título e artista (também na lista da revelação) |
| Dec. M8 | A sessão do Treino dura enquanto a página está aberta: trocar de aba não zera placar nem saco |
| Dec. M11 | O robô semanal acrescenta dias também à agenda das fixtures (só desenvolvimento e testes), para o `npm run dev` continuar com o desafio de hoje: a lista fechada do PR do robô tem 5 arquivos, e não os 4 do plano (PR C) |
| P60 | A regra da P28 vale também para o Python (M9): versões exatas de tudo, diretas e indiretas, em `pipeline/constraints.txt`, e o `setuptools` do build fixo no `pyproject.toml`. Na adoção, três caíram para a versão anterior: ruff 0.16.9, rpds-py 2026.6.3 e iniconfig 2.3.0 |
| P64 | PR semanal da agenda aberto pela Action com o `GITHUB_TOKEN` (M10): as checagens rodam depois de "Approve workflows to run", e o merge é humano (o push dele dispara o deploy). Sem segredo; exige "Allow GitHub Actions to create and approve pull requests" ligado |
| P68 | Os saves fictícios (desde 08/10) são zerados na troca para a parada real (M11): migração do save v1 → v2 que mantém só as preferências |
| P69 | Previews da Apple com as exigências escritas: selo oficial "Listen on Apple Music" (sem alteração), "provided courtesy of iTunes" na tela do player (no fim da página desde a P112) e link direto à loja; na rodada, o selo leva à playlist "Top 100: Japão" (não entrega a resposta), na revelação, à música. Zona cinzenta aceita (o preview é "not for entertainment purposes"); se a Apple pedir, sai do ar |
| P70 | A reserva de áudio é um motor composto: Web Audio → `<audio>` na mesma URL; lookup que falha → `previewUrl` guardado no catálogo. O Deezer sai do plano (termos de "uso privado familiar" e casamento por texto que erra) |
| P71 | A Action semanal romaniza os textos novos e o `romaji.json` entra no PR do robô, para revisão junto com a agenda. O extra `romaji` (250 MB) só é instalado quando o `romanize --check` acusa texto novo |
| P72 | O snapshot real guarda a resposta da Apple aparada; o mapeamento para o contrato neutro fica na leitura (`providers/apple.py`) |
| P73 | Campo `storeUrl` na faixa (`url` ou `null`), mudança compatível: o `schemaVersion` continua 1 |
| P74 | O `fetch` busca também os artistas: o nome do lookup de artista (romanizado ou em inglês) vira o latino oficial (`latinSource` "provider"); a grafia de parceria da faixa ("A & B") vira o `artistDisplay` e entra na busca |
| P75 | No iPhone, `navigator.audioSession.type = "playback"`: o jogo toca com a chave de silêncio ligada (pausa a música de fundo) |
| P76 | `?htmlAudio=1` e `?failLookup=1` valem também no site publicado (testar a reserva no celular); `?fakeAudio`, `?date` e `?failAudio` seguem só em desenvolvimento |
| P77 | A 1ª agenda real nasce no PR da troca do site (PR B do M11), com o `--today` do dia do merge |
| P80 | O `fetch` (único comando com rede) pede confirmação no Claude Code, mesmo no modo automático (`ask` no `.claude/settings.json`) |
| P81 | O selo do Apple Music é a variante `badge` em pt-BR, baixada do Toolbox da Apple e guardada sem alteração em `web/src/ui/assets/`. O ZIP traz todas as variantes, e só essa entra no repositório; o Biome não analisa a pasta, para não pedir mudança no SVG |
| P87 | グッタイム exibido como "Guttaimu", corrigido no `aliases.toml` (PR #11): o primeiro romaji novo trazido pelo robô, revisado pelo passo 2 da rotina do README |
| P90 | Correções do checkup de 11/10/2026 (ME19 a ME29 e ME35) antes do M12; o M12 (visual) absorve de ME30 a ME34. A escolha do M12 (P89) fica para depois das correções |
| P91 | No Treino, a exclusão das respostas pendentes do diário vale também pelo álbum, nos dois modos (checkup, ME23): a revelação sempre mostra o álbum |
| P92 | Alertas do Dependabot ligados, sem PR automático de versão (furaria a P28). É configuração do repositório: o usuário liga em Settings > Code security > Dependabot alerts |
| P93 | O Normal (antes, o modo Álbum) fica como está, mesmo com a resposta quase sempre um single com o nome da música (46 de 66 rodadas da agenda real no checkup) |
| P94 | No Normal (4 opções) dá para responder sem tocar nada e levar 6 pontos: fica assim |
| P95 | Logo: o rascunho A, o 当 de 当てる (ateru: acertar, adivinhar) num círculo vermelho |
| P96 | Nome público: **AteMusic** |
| P97 | Por enquanto só o nome na tela: a URL (`/musicle-jp/`), o repositório e a chave do save continuam `musicle-jp` até o nome ser decidido em definitivo |
| P98 | "AteMusic" em toda a tela: a home, o texto do compartilhar, a tela de bloqueio e o `<title>`. A semente do PRNG (`"musicle-jp\|<data>\|<alvo>"`) não muda: ela gera a agenda |
| P99 | O rascunho A do logo já entra na home (`ui/Logo.tsx`, kanji em texto) e é trocado pelo design final, com o kanji em contorno. Cumprida no PR B do M12: o selo do designer (P193) |
| P100 | Dois modos fixos, pelo alvo: **Normal** (o álbum ou single, entre 4 opções com capa; lista `album` da agenda) e **Desafio** (o nome exato da música, digitado, em até 6 tentativas; lista `song`). Saem as outras duas combinações (Música com 4 opções, Álbum com digitação), o seletor do modo de resposta do dia (P13, P45) e a preferência dele no save. O Treino também fica só com os dois. Save v3: a migração 2 → 3 zera tudo, porque eram só jogos de teste |
| P101 | Rotas `#normal` e `#desafio`; os links antigos (`#musica`, `#album`) caem na home |
| P102 | O pipeline para de gerar, no mesmo PR, o que só servia às combinações removidas: o `similar` da faixa, o `search` do álbum e do artista (catálogo v2: o JS antigo em cache cai no "O jogo foi atualizado") e o `aliases` de álbum no `aliases.toml`. As rodadas `song` dos dias novos saem sem `options`, e o rng delas consome só a resposta. A agenda continua na v1: a mudança é compatível, e os dias gravados mantêm as opções de música, que o jogo ignora |
| P103 | "Diário" é o jogo de cada dia; "Desafio" é um dos modos. Os textos de tela trocam "desafio" por "diário" ("Próximo diário em", "Não há diário hoje"). Os avisos do pipeline e do robô mantêm o "sem desafio" por ora (ME41) |
| P105 | O Treino abre na escolha do modo (Normal ou Desafio), e a sessão roda só nele; trocar de modo é "Reiniciar o Treino", que zera o placar e volta à escolha. Com alguma rodada jogada (a mesma conta do placar: anulada não conta), o reinício pede confirmação antes |
| P106 | O cartão do Treino na home mostra o modo da sessão: "Nesta sessão (Normal): 11 pontos em 3 rodadas" |
| P112 | O selo do Apple Music e o "provided courtesy of iTunes" ficam no fim da página, em toda tela com prévia (a rodada e a revelação), e não junto ao player (ME58, revisa a P69). A proximidade serve para o selo tratar daquela música, e a página inteira é dela: só o que toca vem do iTunes. No celular, o selo fica fora da tela durante a rodada até a página perder a rolagem (ME60): limitação aceita, num projeto pessoal e sem fins comerciais (se a Apple pedir, sai do ar, P69). Telas sem prévia (home, resumo, escolha do modo) continuam sem selo |
| P114 | Modo por artista: o desenho aguenta dezenas de artistas (pedidos, peso no site e CI sobram); o gargalo é a curadoria (romaji e duplicatas, ~190 títulos por artista). Começar com 5 a 10 |
| P115 | Entram as participações (a faixa de outro artista principal com ele no crédito): o lookup do artista já as traz |
| P116 | O placar do modo por artista é só da sessão, como o do Treino (P50): nada é salvo |
| P117 | O modo por artista fica na nav (e na home, P126) enquanto o site não é divulgado; quando ficar público de fato, sai |
| P118 | Lista inicial, por id da loja JP (os nomes são ambíguos): YOASOBI 1490256993, LiSA 573943518 (não a LISA do BLACKPINK), Eve 1080967231, Ado 1492604670, Aimer 569972619 e 米津玄師 530814268 |
| P122 | Entram os covers ("se o artista cantou e publicou, tem que saber") |
| P123 | O Hachi (727267782, o nome do 米津玄師 no Vocaloid) é outro artista e não entra |
| P124 | Saem as versões em inglês (são as mesmas músicas traduzidas): os E-SIDE do YOASOBI e os singles "(English Version)" |
| P125 | As regras do modo por artista são as do Desafio (`MODE_RULES.song`): digitar o nome, 6 tentativas, a mesma barra e os mesmos pontos. A busca procura só pelo título, nos daquele artista |
| P126 | A home ganha um cartão "Artistas", como o do Treino |
| P127 | Trocar de artista volta à lista, com o pop-up de confirmação quando houver rodada jogada (como a P105) |
| P128 | O M13 vai em 3 PRs: A (pipeline, schemas e fixtures, sem rede), B (os dados reais dos 6 artistas, revisados como o PR do robô) e C (a web). Nessa ordem: a aba só aparece com os dados no ar |
| P129 | Publicado em `<public>/artists/`: `index.json` (os artistas na ordem do `artists.toml`, com o arquivo e o número de músicas) e um arquivo por artista, com uma faixa por música (a canônica) e os ids `apple:` da parada |
| P130 | Schemas próprios e autocontidos (`artist.schema.json`, `artist-list.schema.json`), com os `$defs` comuns copiados do catálogo (um teste exige que sejam iguais): a faixa sem `chart` nem `isrc`, com `titleKeys`; o álbum sem `similar`; `search.artist` sempre vazio |
| P131 | A música é o grupo da `artist_title_key` dentro do artista (não o `song_key` do principal, por causa das participações); o `songKey` termina com o artista do arquivo. `titleKeys` guarda o `title_key` (o da parada) de todas as versões, para a exclusão dos diários |
| P132 | A faixa canônica nunca é versão que não entra (karaokê, instrumental, ao vivo, inglês, THE FIRST TAKE...); depois: a original, de álbum que não é coletânea, a mais antiga, o menor id |
| P133 | Teto de 200 músicas, na ordem: a posição no lookup de músicas do artista, o número de álbuns com a música, a mais antiga. A `popularity` do arquivo é essa ordem (1 a 1/N), e a busca ordena por ela. Hipótese: a ordem do lookup é a de popularidade (conferir no PR B) |
| P134 | Título em romaji igual ao romaji de outra música não é juntado sozinho (o cutlet erra nome próprio): o build avisa e a junção é manual (`same_song`) |
| P135 | Ao vivo: pelo sufixo do título ("Live", "Live at …", "Live ver.") ou pelo nome do álbum com marcador de show ("Live at/in/is …", "(Live …)", ライブ, tour, ツアー, 武道館, budokan, THE FIRST TAKE). Só "live" no nome não basta: "Live to Survive - Single" (Aimer) é de estúdio. O que escapar vai para o `exclude_albums` |
| P136 | Curadoria própria dos artistas (`artists.toml` com a ordem, `exclude_albums`, `exclude_tracks` e `same_song`; `aliases.toml` e `romaji.json` próprios), sem ler os da parada: compartilhados, um quebraria o build do outro, e o `--refresh` apagaria textos |
| P137 | Comandos: `fetch --artists` (uma opção do `fetch`, para cair no `ask` do `settings.json`), `romanize --artists`, `build-artists` (sempre todos os artistas; apaga os órfãos) e `validate-artists` |
| P138 | `snapshots/<artistId>.json`, substituído a cada busca (nada depende do anterior, ao contrário da parada), com uma guarda de encolhimento: com menos de 80% das faixas do anterior, só com `--force` |
| P139 | Fixtures: três artistas da parada fictícia (ar02, ar07, ar01) que citam as faixas dela pelo id (sem WAV novo), mais versões sintéticas que caem nas regras e nunca são publicadas |
| P140 | Web: tipos do núcleo estreitados ao que ele usa, e um `indexArtist` com versão própria; versão desconhecida pede para atualizar, só na aba |
| P141 | Exclusão dos diários de hoje no modo por artista: sai a música com algum `titleKey` igual ao título de uma resposta pendente (pega covers, créditos e participações), ou cujo álbum entregaria a resposta |
| P142 | Um orçamento de lookup só (a cota de 12 por minuto e o disjuntor), dividido pelos resolvedores de prévia da parada e dos artistas |
| P143 | Rota `#artistas` (aba `artists`); o campo do Desafio diz "Nome da música" nesse modo |
| P144 | A lista carrega ao entrar na aba e o artista ao ser escolhido; os dois ficam no `App` enquanto a página está aberta. A falha mostra "Tentar de novo" só na aba |
| P145 | O selo da rodada no modo por artista continua levando à playlist da parada (`PLAYLIST_URL`): sem campo de URL novo |
| P146 | O botão e o pop-up do modo por artista dizem "Trocar de artista" |
| P147 | Cartão da lista: o nome, o latino ao lado (como na ME55) e o número de músicas |
| P149 | A ajuda do Desafio: um botão troca a digitação por 4 opções de nome de música, a certa entre elas. No Treino do Desafio e no modo por artista, depois da 1ª tentativa gasta; nos diários, só depois da 3ª (pedido de 12/10/2026) |
| P150 | Conta como tentativa gasta o palpite errado e o pulo |
| P151 | Com a ajuda, errar a opção encerra a rodada |
| P152 | Acertar com a ajuda vale 1 ponto, em qualquer etapa |
| P158 | No Superfan, o palpite errado passa para a etapa seguinte, como no Desafio: é preciso acertar a música; quem não sabe pede ajuda. Cada palpite errado é um erro (P119) |
| P159 | No Superfan, a ajuda pode ser pedida logo de cara (sem gastar tentativa antes) |
| P160 | Fora do modo por artista a faixa em que o artista só aparece creditado por um sample ("the NOISE", do LE SSERAFIM, com o 夜に駆ける do YOASOBI) |
| P161 | Escolher o artista leva a um passo com os dois submodos (o sem fim e o Superfan); a sessão começa no cartão escolhido |
| P162 | No Superfan, a música anulada (falha de áudio) não conta para a partida: os erros e a ajuda pedida nela voltam (recomendação do revisor, confirmada) |
| P163 | Com a ajuda na tela, o "Pular" continua: a pontuação já está no mínimo, e ouvir mais não custa nada. Ele gasta a tentativa e libera o trecho seguinte, como sem a ajuda, e some na última tentativa, que fica para a opção (pedido de 12/10/2026, depois do merge da ajuda; save v5) |
| P164 | Botão não leva número de pontos (pedido de 12/10/2026): "Pedir ajuda", sem as opções nem o que vale (o custo fica na dica, quando as opções aparecem); a descrição do cartão do Superfan, que é um botão, sem os números. O "Pedir ajuda" fica mais afastado do "Desistir" |
| P166 | Entram no modo por artista o Unlimits (311230779) e o 松田聖子 (Seiko Matsuda, 76115834), no fim da lista (pedido de 12/10/2026) |
| P167 | O teto de 200 músicas por artista fica, por enquanto (as consequências de quebrá-lo: sorteio uniforme, mais curadoria, arquivo maior; 12/10/2026) |
| P168 | Cada artista da lista tem uma imagem: a capa do álbum da música mais popular, de preferência um álbum só dele (a opção que os termos da Apple permitem: a foto da página do artista e a da Apple Music API ficaram fora) |
| P169 | O selo da tela da lista leva à playlist da parada, como o da rodada (P145) |
| P170 | A capa fora da rodada, na lista, entra na zona da P69, com o selo no fim da tela |
| P171 | Sem capa, ou se ela não carregar, um monograma: a 1ª letra do nome (米, 松), num disco de cor fixa pelo id |
| P172 | As 200 de cada artista são as mais populares (pedido de 12/10/2026): depois da ordem do lookup, os singles (lado A) de uma lista curada no `artists.toml` vêm antes da reserva, e a faixa tirada pela curadoria deixa a posição para a música dela (Apêndice K) |
| P174 | Entram no modo por artista o 新しい学校のリーダーズ (1231338664) e o 幾田りら (1489581870), no fim da lista (pedido de 12/10/2026) |
| P175 | A fonte da interface é a Noto Sans JP (a identificação do style guide), hospedada no próprio site pelo pacote `@fontsource/noto-sans-jp`, e não pelo Google Fonts (pedido de 13/10/2026) |
| P176 | Tema em três estados, Automático, Claro e Escuro; o Automático, o padrão, segue o aparelho (`prefers-color-scheme`). Revista pela P217: na tela, só o claro e o escuro; sem escolha, o aparelho continua valendo |
| P177 | O 当 do logo fica vermelho nos dois temas; a versão de uma cor só fica para fundo colorido |
| P178 | O M12 começa já, com o que o designer mandou: o que faltar entra provisório e é trocado quando chegar (13/10/2026) |
| P179 | O nome no logo fica sem espaço, "atemusic" (o designer aprovou, PD11); na tela, o nome continua AteMusic (P96 a P98). O PR B do M12 ajusta o SVG |
| P181 | No crédito de um título ("feat. …"), o nome da pessoa ou do grupo sai no latino que ela usa, e não em Hepburn: "Lilas Ikuta", "ATARASHII GAKKO!". Um nome próprio não é leitura; a regra 11 do `pipeline/CLAUDE.md` vale para o resto do título |
| P182 | O id 1704820090 ("Lilas", títulos em francês) não entra: sem evidência de que seja o 幾田りら |
| P183 | Parceria com nome próprio na loja: os latinos dos artistas ligados por "&" ("Sheena Ringo & ATARASHII GAKKO!"), como no DAOKO×米津玄師 |
| P184 | As leituras oficiais dos títulos do modo por artista vêm da Apple da loja US e da furigana do UtaTen: 狼の詩 "Ookami no uta", まさ毛カンナヴァーロ "Masage kannavaaro" e 赤春花 "Sekishunka"; 雨夜の接吻 fica "Amayo no seppun" |
| P185 | Os créditos errados que já estavam no ar nos artistas antigos são corrigidos, num PR à parte do #32 (pedido de 12/10/2026) |
| P186 | No Superfan, a ajuda passa a valer 0 (era −1, P153) e desistir da música custa 2 (era 0), pedido de 12/10/2026 (opção B): acertar sozinho vale mais que com a ajuda, que vale mais que desistir, que vale mais que errar. Antes, desistir sempre valia mais que a ajuda. Agora pedir a ajuda nunca sai pior que desistir (com ela na tela, ainda dá para desistir por −2), e escolher uma opção compensa a partir de 60% de certeza (−5 × (1 − p) contra −2, sem contar que o erro gasta 1 das 3 vidas). O fim que a partida força (o 3º erro, encerrar) não cobra os −2; pular a última tentativa, que a tela não oferece, cobra como desistir |
| P187 | A grafia de um nome em crédito é a da Apple: o nome do artista no lookup; se a loja JP só der kanji ou kana, o título da loja US (pedido de 12/10/2026). Vale para todo crédito, como na P181 ("Nile Rodgers", "Kenshi Yonezu") |
| P188 | まさ毛カンナヴァーロ: o latino exibido é o Hepburn, "Masage kannavaaro" (regra 11), e a grafia da Apple US, "Masage Cannavaro", entra só na busca (`aliases` da faixa) |
| P189 | Os achados fora do escopo da correção entram no mesmo PR: 東亰カニバリズム, os nomes partidos do PALETTE4 e o "&" colado dos dois MEKAKUCITY |
| P191 | A troca de tema fica no fim da Início, depois de "Como funciona": não gasta altura nas telas do jogo (ME60) nem largura na nav (ME70) |
| P192 | As cores são as do designer; dentro do esquema, a escolha é do Claude (Apêndice L): o claro branco, com os cartões de borda cinza, e o escuro com o preto da paleta e os cartões em tons derivados. Onde o contraste pede, a cor da paleta escurece um tom (o vermelho e o verde de texto) e os cinzas intermediários são derivados |
| P193 | No topo da Início, o selo redondo vermelho com o 当 vazado, ao lado de "AteMusic" e da frase, como antes; o logo empilhado fica para quando houver lugar para ele (S34) |
| P194 | Os monogramas dos artistas sem capa ficam com as 8 cores: são conteúdo, e não interface |
| P195 | O SVG do style guide entra no repositório, em `docs/identidade/`, como a fonte das peças |
| P196 | Os ícones do designer (X, ✓ e chevron) entram nas tentativas do Desafio, no lugar dos emojis; a revelação do Normal, os botões de avançar e o ✓ das abas ficam como estão |
| P197 | O pulo nas tentativas ganha o chevron em cinza (o texto secundário), na linha tracejada de "Pulou" |
| P198 | O chevron segue a cor do texto, e não o vermelho da prancha (o vermelho #EA3829 sobre o oliva dá 2,14:1, e ao lado do X podia ler como erro) |
| P199 | Dois artistas de fora do Japão no modo por artista, pedidos por amigos do usuário: Bolbbalgan4 (BOL4, coreano, 1188975595) e System of a Down (462715) |
| P200 | Eles ficam na mesma aba, numa seção embaixo da lista principal, "De fora do Japão" (sem aba nova) |
| P201 | Dentro da seção, ordem alfabética; a lista principal continua na ordem do `artists.toml` (P118) |
| P202 | Bolbbalgan4: a tela mostra o título em inglês da 1ª edição ("Galaxy"), e o da reedição em hangul ("우주를 줄게") entra na busca |
| P203 | O título que só existe em hangul ganha embaixo a leitura pela Romanização Revisada do coreano, como o Hepburn no japonês (regra 11 do pipeline), conferida numa fonte; o título oficial em inglês, quando existe, vai para a busca |
| P204 | A interface nova (o PR D do M12) muda os tamanhos e a hierarquia do beta, revisando a PD1 e a PD2, por decisão do usuário e sem consultar o designer. O peso Regular continua como base |
| P205 | A nav é uma barra de 44 px no topo, com o selo redondo como o link "Início" (o nome em texto, só para o leitor de tela); revisa a P193 |
| P206 | ✓ e X na revelação e no resumo, e o chevron nos botões de avançar; revisa a P196 |
| P207 | Antes do código, um protótipo (Artifact privado) com as telas novas, para a aprovação do usuário |
| P208 | O desenho do protótipo está aprovado (18/10/2026) |
| P209 | A reforma vai em 3 PRs: a fundação e as telas de escolha (D1), as rodadas (D2), a revelação e o resumo (D3) |
| P210 | Os textos que gastam linha encurtam na tela (as dicas dos cartões da Início e da lista de artistas, a dica do campo, o "copiado", o botão de sair da sessão); a versão inteira fica para o leitor de tela ou no "Como funciona" |
| P211 | A lista de artistas é uma grade de capas: 4 por linha no celular, 6 no computador. A lista pode rolar: no site, com os 12 artistas, são 37 px em 375 × 667 e 100 em 360 × 640, aceitos pelo usuário (20/10/2026) |
| P212 | O título do álbum nas opções do Normal nunca é cortado (é ele que distingue duas opções); só o romaji e o artista ganham reticências |
| P213 | Os alvos de toque continuam com 44 px em tudo |
| P214 | Os tamanhos de contrato: 375 × 667 (iPhone SE) e 360 × 640 (Android), conferidos pelo e2e; 390 × 844 e 1280 × 800 à parte |
| P215 | As sugestões do Desafio mantêm o romaji embaixo do título, que o protótipo escondia (revisa a P208): quem digita em romaji reconhece a música por ele (P32). Decisão do PR D2, aprovada pelo usuário (20/10/2026) |
| P216 | O volume fica num botão de alto-falante no player, ao lado do Tocar. Ele abre a barra, que flutua por cima da tela, como a lista de sugestões: a página não muda de altura, e as rodadas continuam cabendo (regra 25). Entra no PR do volume, depois do switch |
| P217 | O tema vira um switch claro e escuro, sem o "Automático" na tela. Sem escolha salva, o jogo segue o aparelho, e o switch mostra esse tema; depois do 1º toque, vale a escolha gravada. Revisa a P176. O switch continua no fim da Início (P191) |
| P218 | O sol e a lua do switch, o alto-falante e o alto-falante mudo do volume são desenhos provisórios do Claude, a pedido do usuário, na linha do X, do ✓ e do chevron do designer (P178), aprovados por ele numa página antes do PR (21/10/2026). Ficam fora do `icons.ts` gerado e saem quando o designer mandar os dele (PD6) |
| P219 | A barra de volume vai de 0% a 100%, com o mudo: 10% ainda pode ser alto (o usuário). O ganho segue uma curva, o quadrado da barra (10% na barra dá 1% do som). No mudo, o botão mostra o alto-falante mudo, para ninguém gastar um "Ouvir mais" sem som |
| P220 | O "Desistir" vira botão (ME94), com o texto vermelho, que avisa que a rodada acaba sem competir com o Tocar. O usuário escolheu a tinta dos outros botões com o texto vermelho, mas o teste de contraste recusou o par (4,0:1 no claro; 4,5 é o mínimo do texto): ficou o texto e um anel vermelhos sobre o fundo da página, que já passam nos dois temas. Vale também para o "Não sei" do Normal e o "Desistir da música" do Superfan, que são a mesma ação. O "Voltar à lista" continua só texto |
| P221 | A categoria do menu que junta o Normal e o Desafio se chama "Hits" (ME96) |
| P222 | O Treino também entra nos Hits: a categoria é de onde vêm as músicas (a parada), e dentro dela ficam os jeitos de jogar (ME96) |
| P223 | A categoria de anime sai de uma lista curada, como o `artists.toml` (ME97). A curadoria ainda vai ser trabalhada com o usuário antes do marco |
| P224 | A barra da música leva àquele ponto também na rodada, mesmo com o ganho pequeno (ME95): o toque toca dali até o fim do trecho já liberado, e a parte ainda fechada não responde. Na revelação, vale a prévia inteira |
| P225 | A troca entre os jogos dos Hits é por uma tela, e não por uma 2ª linha de abas (ME96): a aba Hits abre a `#hits`, com o Normal e o Desafio (o estado do diário) e o Treino (o placar da sessão). Trocar de jogo são 2 toques: a aba e o cartão. A 2ª linha gastaria 44 px, e as rodadas têm 6 px de folga em 360 × 640. A tela tem uma dica só, curta, porque ela já diz tudo (sem a inteira para o leitor de tela, P210) |
| P226 | A Início mostra um cartão por categoria, numa coluna: os Hits, com o estado dos dois diários numa linha cada (sem o "nº", que cresce na parada real), e os Artistas. O Anime entra depois (ME97). A P117 continua: os Artistas saem quando o site for público |
| P227 | O ✓ da nav fica na aba Hits, quando os dois diários do dia terminaram; o estado de cada um fica no seu cartão |
| P228 | O controle de volume inteiro também na revelação (ME101, a resposta do usuário), num PR à parte |
| P229 | O ícone do mudo continua só no 0% (ME102, a resposta do usuário) |
| P230 | O Anime (ME97, M14) tem diário desde o lançamento |
| P231 | Dois modos, os dois digitados: acertar a música e acertar o anime. As 4 opções só na ajuda (4 músicas ou 4 nomes de anime) |
| P232 | Três dificuldades por modo, 3 rodadas cada: 6 diários e 18 músicas por dia. Ninguém precisa jogar todos |
| P233 | As telas: a categoria Anime abre 2 cartões (música e anime), cada um abre a dificuldade, e daí o diário. A tela dos 2 cartões vai receber o Treino depois |
| P234 | No "acertar o anime", vale a franquia: qualquer temporada ou sequência |
| P235 | "Nova" é a música que não saiu nos últimos K dias: K = 21, 28 e 35 no Fácil, no Médio e no Difícil. O mínimo é 6 × K por modo e dificuldade; o lançamento mira umas 600 músicas |
| P236 | O acervo só cresce, e cada vez mais devagar: até 600, o que couber no prazo do robô; de 600 a 1.000, umas 12 por rodada, puxadas para a temporada atual; acima de 1.000, umas 6. A fundação começa pelos mais populares. A agenda prefere as que saíram há mais tempo |
| P237 | A tarefa do Anime fica no robô de segunda, no mesmo PR, e só roda quando a agenda do Anime tem menos de 21 dias à frente. A falha de uma tarefa não derruba a outra: o PR leva o que deu certo |
| P238 | Sem revisão humana (revisa a P223): só entra o que passa em todas as conferências automáticas. O `aliases.toml` do Anime marca uma resposta como inelegível (`block`, `reason "blocked"`), sem apagá-la; a web já anula a rodada |
| P239 | As fontes abertas dão os dados publicados: o AnimeThemes (títulos, sinônimos, franquia e temas), o AnisongDB (dificuldade e insert songs) e o Kitsu (reserva). O MyAnimeList entra já, no mínimo (P256) |
| P240 | A dificuldade cruza o AnisongDB (a taxa de acerto do Anime Music Quiz) e o AnimeThemes (as inclusões em playlists); sem nenhum, a regra da abertura e do encerramento. O arquivo publicado leva só a faixa |
| P241 | Os créditos de todas as fontes, nas telas de escolha do Anime e no "Sobre e privacidade" (não em toda rodada, para caber na tela) |
| P242 | A música é achada pela discografia do artista na Apple, e não pela busca de texto no catálogo inteiro |
| P243 | Uma página "Sobre e privacidade" no lançamento: os créditos, um contato e a frase de que o jogo não coleta dados |
| P244 | A TV size pode ser a resposta, mas só quando a completa não está na loja |
| P245 | A janela sem repetir vale por música, entre os dois modos |
| P246 | O título casa por semelhança dentro da discografia, só com folga grande para a 2ª mais parecida. Na dúvida, descarta |
| P247 | A aba Anime ganha o ✓ quando a pessoa termina qualquer um dos 6 diários do dia |
| P248 | Não se evita que a mesma música seja resposta dos Hits e do Anime no mesmo dia |
| P249 | Uma estatística por diário: 6 no Anime |
| P250 | O save sobe para a v6, numa migração identidade (uma aba com o código velho apagaria os diários do Anime). A ME104 passa para a v7 |
| P251 | O áudio é sempre a prévia da Apple. As fontes de anime só dão dados (regra 8) |
| P252 | O tipo do tema por dificuldade. No Fácil, quase só aberturas, e o encerramento só quando muito popular. No Médio, a maioria aberturas e alguns encerramentos. No Difícil, os três tipos, com a insert song de anime pouco conhecido evitada, mas não proibida |
| P253 | Só na 1ª carga, um peso leve para as listas do usuário: os animes "Completed", "Watching" e "On-Hold" da exportação do MyAnimeList (XML) e o top do Last.fm, com teto de ~15%. As listas ficam fora do repositório, e o robô nunca as usa |
| P254 | O snapshot (público no Git) guarda da popularidade só um nível de 0 a 9 de cada fonte, e nunca o número bruto do AnisongDB, do AnimeThemes ou do MyAnimeList. O nível é numa escala fixa da fonte (no AnisongDB, a taxa de acerto em décimos), e não o décimo do acervo, que mudaria a cada carga |
| P255 | Duas cargas. A de teste (PR C1): umas 50 a 60 músicas, com ao menos 18 por dificuldade, e a agenda de hoje e amanhã. A grande (PR C2): as outras ~550 e a agenda até uns 20 dias, antes do fim da agenda de teste. Entre o fim da agenda e o merge do C2, o Anime mostra "sem diário hoje" |
| P256 | O MyAnimeList entra já, no mínimo: só dentro do `fetch --anime`, para sortear pelos mais populares de todos os tempos e pela temporada, e como uma das notas da dificuldade. No repositório, dele só o id e o nível (P254). Só o Client ID, no cabeçalho `X-MAL-CLIENT-ID`, lido da variável `MAL_CLIENT_ID`: na carga, no terminal do usuário; no robô, num segredo, numa tarefa à parte, sem pip. O Client Secret não é usado. Sem a variável, a busca segue com as fontes abertas. O crédito é textual, sem logo. O usuário avisa o MAL pelo formulário de suporte (cláusula 4(b)) |

**Recomendações da ajuda, a confirmar** (implementadas assim; o usuário decide):

- P155. No compartilhar, a ajuda é um 💡 no ponto em que foi pedida: `⬛⬛⬛💡✅`.
- P156. As opções saem de uma semente da rodada (`helpSeed`, com a semente da sessão no Treino e no modo por artista, para a resposta não cair sempre na mesma posição): a mesma rodada, com as mesmas tentativas, dá as mesmas opções, e recarregar mostra as mesmas (estão no evento salvo). As outras músicas são sorteadas entre todas do catálogo (ou do artista), nunca outra versão da resposta, outra de mesmo título, uma já tentada, uma resposta dos diários de hoje ou uma homônima dela.
- P157. Com a ajuda na tela, fica o "Desistir" (o "Pular" também, desde a P163); as opções vêm sem capa, que entregaria o álbum.

## 3. Fonte de dados (ligada no M11)

Pesquisa de 10/10/2026 (subagente; JSON lido de verdade, nenhum áudio baixado):

| Uso | Fonte | Fatos |
|---|---|---|
| Parada do Japão | `https://rss.marketingtools.apple.com/api/v2/jp/music/most-played/100/songs.json` | 100 itens com `id` (= `trackId` do iTunes), `name`, `artistName`, `artistId`, `artworkUrl100`, `releaseDate`, `genres`, `url`; `contentAdvisoryRating` só nas explícitas, escrito "Explict". Sem álbum nem duração. Atualizada todo dia; `updated` e ETag mudam a cada pedido (mudança se detecta pela lista de ids). Limite 200 dá HTTP 500. **Sem CORS**: só o pipeline lê |
| Metadados e prévia | `https://itunes.apple.com/lookup?id=<até 200>&country=jp` | `country=jp` obrigatório (`us` omite faixas e romaniza). Faixa: `trackName`, `collectionName` (com " - Single"/" - EP"), `trackViewUrl` (com `?uo=4`), `previewUrl` (m4a AAC de 30 s, estável, sem token), `artworkUrl100` (tamanho trocável no nome), `releaseDate` com hora (UTC), `trackTimeMillis`, `trackExplicitness`; sem ISRC. O registro de **artista** (e às vezes o de álbum) vem romanizado. Cerca de 20 consultas/min; `max-age=86400`. CORS `*` |
| Áudio e capas | `audio-ssl.itunes.apple.com`, `isN-ssl.mzstatic.com` | CORS `*` nos dois; o áudio tem cerca de 1 MB por prévia |
| Decodificação | Web Audio (`decodeAudioData`) | AAC no Chrome, Edge e Safari; no Firefox depende do sistema; o Chromium do Playwright não tem AAC (o e2e usa o motor falso) |
| Descartados | Deezer (P70), Spotify, YouTube, Apple Music API | Spotify proíbe jogos e quiz e cortou previews para apps novos; YouTube proíbe isolar o áudio; Apple Music API custa US$ 99/ano |

**Consequências no desenho:**

- O `fetch` (único comando com rede) grava um snapshot por dia em `pipeline/data/apple/snapshots/`; o resto do pipeline lê arquivos.
- O pipeline guarda o `trackId` (no `id`), o `previewUrl` como reserva e o `storeUrl`; o navegador resolve a prévia na hora com o lookup, em lote (PR B do M11).
- **Termos da Apple** (Search API, seção Legal): uso "only to promote store content and not for entertainment purposes"; prévia "proximate to a store badge" com link direto à loja; atribuição "provided courtesy of iTunes"; só streaming, sem guardar. Um jogo usa a prévia como entretenimento: zona cinzenta aceita (P69), a mesma do Musicle.
- **Atribuição** (pesquisa do subagente, 11/10/2026, só leitura):
  - **Selo:** fica no Toolbox da Apple, em `toolbox.marketingtools.apple.com/api/v2/badges/listen-on-apple-music/<variante>/pt-br`. O `/download` entrega um ZIP com todas as variantes em SVG (P81). O texto do selo em pt-BR é "Ouça no Apple Music".
  - **Diretrizes da Apple Music** (`marketing.services.apple/apple-music-identity-guidelines`): o selo não pode ser alterado, tem no mínimo 30 px de altura no digital, leva espaço livre de 1/10 da altura em volta e é sempre link para o Apple Music.
  - **Lacuna nos termos:** o Search API pede a prévia "proximate to a store badge" e cita os selos "Download on iTunes" e "App Store". O "Listen on Apple Music" não aparece ali. Isso fica na zona cinzenta da P69.
  - **Lugar do selo** (P112, 12/10/2026): no fim da página, e não ao lado do player. O "proximate" foi lido pela intenção (o selo trata da música da página); a letra pede perto do player, e no celular o selo fica fora da tela durante a rodada até a ME60.
  - **Playlist "Top 100: Japan"** (`pl.043a2c9876114d95a4659988497567be`): em 11/10/2026 tinha as mesmas 100 faixas do RSS most-played, com pequenas trocas de ordem depois da 31ª. É o link do selo durante a rodada.

## 4. Arquitetura

```
musicle-jp/
  CLAUDE.md  README.md  .gitignore  .gitattributes  .editorconfig
  .claude/   settings.json, launch.json, hooks/{format_file.py, ruff.toml}, skills/verificar/SKILL.md, agents/revisor.md
  .github/   workflows/{ci.yml, deploy.yml, update-catalog.yml}, scripts/{check-catalog-pr.sh, catalog-reserve.sh, catalog-collect.sh}
  docs/      PLANO.md, HISTORICO.md
  shared/    schema/*.schema.json (contrato Python↔TS), vectors/{normalize.json, prng.json, prng_reference.mjs}
  pipeline/  pyproject.toml, constraints.txt, data/apple/{aliases.toml, romaji.json, snapshots/, artists/}, fixtures/{chart_fixture.json, aliases.toml, romaji.json, artists/}
             src/musicle_pipeline/  cli, models, paths, providers/{base,fixture,apple,fixture_artists,apple_artists},
                                    fetch, normalize, romaji, romaji_cache, aliases, catalog, similarity, prng,
                                    schedule, fake_assets, io_json, validate, artists, validate_artists
             tests/
  web/       Vite + TS + Preact + Biome + Vitest + Playwright
             src/core/     TS puro, sem DOM, Preact ou áudio
             src/data/     carrega catálogo e agenda (source) e resolve as prévias (previews)
             src/audio/    engine, webaudio, htmlaudio, fallback, session, fake
             src/storage/  save, migrations
             src/i18n/     pt-BR, t
             src/ui/       componentes Preact (uma pasta só) e assets/ (o selo da Apple)
             public/data/      parada real (gerada); artists/ do modo por artista (M13)
             public/fixtures/  parada falsa (WAV e SVG gerados, fora do git); artists/ fictícios
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
| M10 | Concluído em 10/10/2026 | Deploy no Pages (`base: '/musicle-jp/'`) + `update-catalog.yml` com fixtures | URL pública tocando áudio sintético; Action abre PR só com dias novos | GitHub Actions, navegador do Claude na URL pública |
| M11 | Concluído em 11/10/2026 | Provider Apple (RSS JP + iTunes lookup), atribuição, aliases reais, troca para `public/data/` | Diário com previews reais; reserva de áudio testada | Planejamento + subagente de pesquisa na documentação |
| M12 | Concluído (PRs A a D) | O visual novo, com a identidade do designer (Apêndice L): tokens, fonte e tema escuro (A); logo, selos e favicon (B); ícones e botões (C); a interface nova, cabendo na tela (D, em 3 PRs: D1 a fundação e as telas de escolha, D2 as rodadas, D3 a revelação e o resumo) | Os 4 PRs no ar, nos dois temas, com o contraste travado pelo `scripts/theme.test.ts`, e as telas cabendo nos tamanhos de contrato (P214), conferidas pelo `e2e/layout.spec.ts`. As peças que o designer ainda vai mandar (S34, PD6, PD12, PD13) ficam para depois | Modo de planejamento, subagentes Explore e um de pesquisa (a fonte do style guide), widget da paleta |
| M13 | Em andamento (PRs A, B e C) | Modo por artista: a lista de artistas e rodadas sem fim do Desafio com as músicas de um deles (Apêndice K). Feito antes do M12 (o visual) | 3 PRs: pipeline e fixtures (A), dados reais dos 6 artistas (B), web (C) | Planejamento com 3 subagentes Explore e um Plan |
| M14 | Em andamento (PRs A1, D1, A2 e A3) | O Anime (ME97, Apêndice M): a categoria com 6 diários por dia (2 modos × 3 dificuldades), o acervo de músicas de anime com a prévia da Apple e o robô | Em 21/10: A1 (o catálogo), D1 (o save v6), A2 (a agenda), A3 (a busca), C1 (a carga de teste), D2 e D3 (a web, a estreia). Depois: C2 (a carga grande) e B (o robô) | Planejamento com subagentes Explore, de pesquisa e Plan; um subagente numa worktree (o D1, em paralelo); outro testando as APIs reais |

**Checkup de 11/10/2026** (entre o M11 e o M12): seis subagentes em paralelo conferiram o site publicado, os dados reais, o pipeline, a operação, o jogo e a documentação. As correções entraram em três PRs: #12 (pipeline e robô), #13 (jogo) e #14 (documentação). Resumo e números em `docs/HISTORICO.md`.

**Dois modos** (11/10/2026, depois da home do PR #15): o Normal e o Desafio no lugar das 4 combinações, no jogo, no Treino, no save e no pipeline (P100 a P103).

Os critérios de pronto já conferidos (M9 a M11) estão em `docs/HISTORICO.md`.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Resposta do dia visível no JSON público | Aceito na v1; só 21 dias à frente; ofuscar depois (ME3) |
| Termos da Apple para preview em jogo | Selo oficial do Apple Music e "provided courtesy of iTunes" em toda tela com player (P69), no fim da página (P112: no celular, fora da tela até a ME60), link para a loja, sem guardar áudio, não comercial. Os termos citam os selos do iTunes e da App Store, não o do Apple Music (§3) |
| Preview que some ou URL que muda | Lookup no navegador, em lote, com cota e disjuntor; o `previewUrl` do catálogo como reserva; `<audio>` quando o Web Audio falha; rodada anulada sem penalidade (Apêndice E) |
| Catálogo pequeno repete música | Catálogo cumulativo; janela K ajustada ao tamanho |
| Romaji errado em nomes próprios | `aliases.toml` + `latinSource` para auditoria |
| CRLF e codificação no Windows | `.gitattributes` com eol=lf, `newline="\n"`, `PYTHONUTF8=1` |
| Cron desativado após 60 dias sem atividade no repositório (documentação do GitHub) | Aviso no README; `gh workflow enable update-catalog.yml` e execução manual |
| PR da agenda sem merge por mais de 21 dias | O dia que passa sem agenda vira buraco (P44); o corpo do PR avisa o buraco e pede o merge no mesmo dia. Desde o checkup, a tarefa `catalog-runway` fica vermelha (e o GitHub manda e-mail) quando a agenda da `main` tem menos de 10 dias à frente. Um PR do robô sem merge é fechado pelo da semana seguinte, e o snapshot daquela semana se perde |
| `--today` errado (data no futuro deixaria buraco para sempre) | A Action não aceita entradas; a data vem de `TZ=America/Sao_Paulo date +%F` |
| Cache do Pages: `max-age=600` (medido no M10), JSON velho por até 10 minutos depois do deploy | A agenda é gerada 21 dias à frente; desde o M11, o jogo busca catálogo e agenda com `cache: "no-cache"` (ME13) |

## 7. Em aberto

A lista para ler, por tipo (corrigir, analisar, novo e esperando alguém), fica em [`docs/BACKLOG.md`](BACKLOG.md). Aqui fica o detalhe de cada item.

**Perguntas**

- P16. Nome público do jogo (evitar "Musicle" no nome). No M10, o usuário decidiu publicar como `musicle-jp` por ora, e em 10/10/2026 decidiu escolher o nome junto com o visual e a identidade do jogo, num marco futuro. Em 11/10/2026 o nome na tela virou AteMusic (P96 a P98); falta decidir se a URL e o repositório mudam (P97). Trocar depois muda a URL (quebra links compartilhados), mas não o save (o `localStorage` é por origem). Não bloqueia mais. Ao trocar, a base `/musicle-jp/` muda em `web/vite.config.ts`, nas checagens do `ci.yml` e do `deploy.yml`, no passo 10 do `/verificar` e na documentação.

**Sugestões**

- S5. Ativar o estilo de saída "Learning" ou "Explanatory" nas sessões deste projeto.
- S6. Registrar cada decisão como ADR em `docs/decisoes/`.
- S8. Tirar o `fetchedAt` do cabeçalho `Date` da resposta do RSS, em vez de argumento (subagente Plan do M11).
- S9. Teste e2e da reserva com `<audio>` de verdade, usando os WAV das fixtures (subagente Plan do M11).
- S10. Hashes no `constraints.txt` (`--require-hashes`), ao menos na Action (subagente Plan do M11).
- S11. `build --check`: sai com código 1 se o arquivo mudaria (subagente Plan do M11).
- S16. O `--today AAAA-MM-DD` no comando "Conferir que a agenda só cresceu" do `CLAUDE.md` e no passo 6 do `/verificar`: sem ele, a conferência de dia passado (P44) só roda na CI (revisão de 12/10/2026).
- S18. "Cada trecho a mais vale 1 ponto a menos" também no cartão do Normal na escolha do modo do Treino: desde a ME59, quem entra direto no Treino não vê o custo.
- S20. Chamar de "Livre" o submodo sem fim do modo por artista quando o Superfan (ME61) chegar: "Normal" já é o modo do álbum (P100). Feita no branch do Superfan (o cartão "Livre" da P161).
- S22. O selo da rodada no modo por artista levando à página do artista na loja (pede um campo de URL novo, com a conferência no validate e no `core/apple.ts`, regra inviolável 5).
- S23. A capa da música mais conhecida no cartão de cada artista da lista. Feita (P168), no branch `m13-artistas-capas`.
- S24. Conferir a duração real das prévias da Apple: o pipeline grava sempre 30 s, e no Superfan um começo perto de 19 s numa prévia mais curta deixaria menos de 9 s (o Web Audio corta sem erro). Como: registrar o `buffer.duration` com `?data=real` (revisor do Superfan).
- S29. As 3 faíscas do 当 animadas no acerto, rápidas e desligadas com `prefers-reduced-motion`.
- S30. O indicador de carregamento com as faíscas acendendo em sequência.
- S32. O custo de desistir visível na rodada do Superfan, e não só na revelação (`/code-review` do P186).
- S33. A fonte mais leve: um `@font-face` próprio só com o woff2 (tira 7,5 MB do `dist`) e o CSS da fonte sem bloquear a pintura (os 124 `unicode-range` de cada peso pesam 210 kB no CSS principal).
- S34. A imagem de compartilhamento (`og:image`) com o logo empilhado vermelho, depois que o designer conferir o `docs/identidade/logo-empilhado-atemusic.svg` (o nome sem espaço ele já aprovou, PD11).

**Melhorias futuras**

- ME2. Modo royale (6 músicas, 9 opções, sem errar).
- ME3. Ofuscar a agenda e dividir por mês quando passar de 200 KB.
- ME4. Gerar o dia no navegador quando a agenda não cobrir a data.
- ME5. PWA offline.
- ME6. App do Claude no GitHub para revisar PR.
- ME8. Tolerância a erro de digitação (distância de edição) no autocompletar.
- ME10. `actionlint` ou `zizmor` na CI, para revisar o próprio workflow a cada PR (revisor do M9).
- ME11. Fixar também a versão do `pip` na CI (`/code-review` do M9). O checkup achou soltos também o patch do Python (3.12.x), o minor do Node 24 e as dependências de build do sdist do unidic-lite (hipótese).
- ME12. Levar a escolha da revisão base do `schedule-check` do YAML para o Python, com teste (`/code-review` do M9).
- ME15. Teste de fumaça contra o `vite preview` em `/musicle-jp/` (a página abre, os JSON de `data/` respondem 200, console limpo), para pegar caminho absoluto no código, que a checagem do `dist/index.html` não vê (revisor do M10).
- ME17. Dividir ou podar o catálogo real quando passar de cerca de 1 MB (pela conta do checkup, perto de 420 faixas).
- ME18. Medir a latência do 1º "Tocar" no site publicado (lookup + cerca de 1 MB + decodificação). Já medido: o download da prévia, cerca de 440 ms no site publicado; o lookup, 435 ms, e a prévia, 800 ms, no desenvolvimento. Falta o tempo total até o som, com a decodificação.

**Do checkup de 11/10/2026** (P90). As feitas estão em "Feitas", abaixo.

- ME33. Textos: "- Single" na revelação, dia todo anulado mostrando "0/0", a dica de "setas e Enter" no celular e a rodada anulada sempre como "Áudio indisponível" (também quando a resposta perdeu a elegibilidade). Vai com o M12.
- ME34. Celular: opções com títulos enormes ("Yes! 東京 (feat. …)" passa de 6 linhas) e a distribuição de pontos com 19 linhas. Vai com o M12. (O seletor de modo do Treino antes do player saiu com a P105.) **Resolvida no PR D (M12):** a distribuição em 19 colunas (D3); os títulos enormes quebram a linha sem corte (P212), e a rodada com um deles pode rolar.
- ME36. Atualizar as 3 actions que têm versão nova quando ela completar 14 dias, a partir de 22/10/2026 (P28; checkup).
- ME37. `aria-disabled` no lugar de `disabled` nos botões do Player durante o "Carregando…" (o navegador tira o foco do botão desabilitado) e um gancho comum de reprodução com ficha para o Player e a revelação (`/code-review` do PR #13).
- ME38. Ligar no pipeline os álbuns do mesmo lançamento (o EP "A / B", os dois "ROSE - Single"), em vez da regra de nome do `acceptedIds` no web; juntaria também as linhas iguais da busca. Pede mudança de esquema (`/code-review` do PR #13).
- ME39. Teste de componente do `Game` e do `App`: o lote de prévias só dos diários pendentes, a sessão `stale` regravada, o save da abertura guardado na montagem e, no `App`, a releitura do save no `hashchange` e no evento `storage` (checkup, `/code-review` do PR #13 e revisão de 12/10). Nos dois modos, trocar o retrato pelo save vivo do `App` fez a revelação da última rodada sumir, e só o e2e pegou. O resumo, a contagem e o compartilhar ganharam teste em 12/10 (ME47).
- ME40. `RoundState.correctOptionId` é gravado, mas só os testes o leem: a tela usa o `accepted`. Tirar, ou usar no lugar do `accepted[0]` (dois modos).
- ME41. Trocar "sem desafio" por "sem diário" nos avisos do pipeline (`schedule.py`) e do robô (`check-catalog-pr.sh`, com o teste dele) e no título do `schedule.schema.json`, como na tela (P103). O título vira o nome do tipo gerado: mudar pede o mapa de `web/scripts/gen-types.ts` e o `npm run types`.
- ME42. Na escolha do modo do Treino, gerar a semente ao montar e pré-carregar a 1ª rodada de cada modo, para o 1º "Tocar" responder mais rápido (liga à ME18; subagente Plan da P105).
- ME60. A rodada sem rolagem no celular, cabendo na tela: o selo do Apple Music, no fim da página (P112, ME58), fica sempre visível junto do player. Ideia do usuário em 12/10/2026, para antes de mostrar o jogo a outras pessoas. **Resolvida nos PRs D2 e D3:** as rodadas, a revelação e o resumo cabem na tela com o selo da Apple no pé, conferidos pelo `layout.spec.ts`.
- ME61. Superfan, o 2º submodo do modo por artista ("para quem for muito tryhard"; o sem fim é para quem só quer jogar), especificado em 12/10/2026 (P119 a P123, P153, P158, P159, P161), implementado no branch `m13-superfan` (Apêndice K):
  - Só o Desafio. A barra tem 3 etapas, de 1 s, 3 s e 5 s (1, 4 e 9 s acumulados); a prévia começa num ponto sorteado do clipe de 30 s (até ~19 s, com folga para o fade). Desde o branch, cada modo tem a sua barra (`ModeRules.stages`).
  - P119: cada palpite errado é um erro, que tira 5 pontos; com 3 erros na partida inteira, ela acaba.
  - P120: pular é permitido e aconselhado (as informações do modo dizem isso). Na última tentativa não há "Pular" (como no Desafio): "Desistir da música" a encerra com 0, sem erro (suposição, não contestada). Mudou na P186: desistir custa 2, ainda sem erro.
  - P121: o acerto vale 3, 2 ou 1 ponto, pela etapa.
  - P122 e P123: os covers entram; o Hachi é outro artista.
  - P153: a ajuda vale no máximo 3 vezes por partida, e a música com ajuda vale −1 ponto. A ajuda que erra conta como erro (−5) e encerra a música (suposição, não contestada). Mudou na P186: a ajuda vale 0, e desistir custa 2.
  - Partida: as músicas do artista em ordem sorteada, cada uma uma vez; acaba no 3º erro, em "Encerrar a partida" ou quando todas as músicas tocaram, acertadas ou não (suposição, não contestada). "Desistir da música" encerra só a música. O placar pode ficar negativo.
  - P158: o palpite errado passa para a etapa seguinte (é preciso acertar a música; quem não sabe pede ajuda). P159: a ajuda vale logo de cara. P161: o passo de escolha do submodo vem depois do artista; o sem fim se chama "Livre" (S20).
- ME62. A exclusão por título (`titleKeys`, P141) também no Treino da parada: hoje um cover de outro artista escapa dela.
- ME63 a ME65 (revisão do PR B do M13, feitas): o "-X-" grudado no nome ("Empty MERMAiD-Instrumental-"), a versão que não entra no fim do título sem delimitador ("六等星の夜 Tvsize") e o teste que recusa título publicado de artista com instrumental, karaokê, off vocal ou TV size.
- ME66. Modo por artista: o sorteio tira todo álbum do índice do artista com uma música excluída (Apêndice K, Exclusão), e não só os que entregariam o diário. Ficou assim por ser o lado seguro; se um dia pesar (canônicas de álbum de estúdio), a troca é o sorteio pular a música excluída pelo `songKey` e receber de fora só os álbuns de mesmo nome (`/code-review` e revisor do PR C).
- ME67. O `?failAudio=` (desenvolvimento) só conhece o resolvedor e o índice da parada: não faz falhar a faixa que só existe no arquivo de um artista, com `?data=real` (nas fixtures, os artistas citam faixas da parada, e funciona) (`/code-review` do PR C).
- ME68. O `lang="ja"` no nome do artista também no cartão da home ("Nesta sessão (米津玄師): …") e nos avisos de carga e de falha do artista: hoje o texto sai inteiro do `t()`, e o `FocusedNotice` só aceita texto (revisor do PR C).
- ME69. Teste de tela do "Pedir ajuda" sumindo depois da 3ª ajuda do Superfan: hoje só o núcleo cobre, porque os dados do teste não têm artista com 4 músicas ou mais (revisor do Superfan).
- ME70 a ME75 (check-up da interface em 12/10/2026, feitas no branch `m13-ui`):
  - ME70. As cinco abas numa linha a partir de 360 px (o Android comum), também com os dois ✓ (menos espaço lateral, a fonte das abas um pouco menor até 400 px e o ✓ menor); em 320 px ainda quebram. A 1ª versão tinha 10 px de folga com a Segoe UI e quebrava no Linux da CI, de fonte mais larga: a folga agora vale até para a Verdana (317 de 328 px).
  - ME71. "Pedir ajuda" sem pontos (P164), com a cor do destaque, à esquerda; o "Desistir" sempre à direita, longe dele.
  - ME72. Nas tentativas, o pulo tracejado e sem fundo (não pesa como um erro), e as linhas mais baixas.
  - ME73. "Voltar à lista" afastado dos cartões da escolha do submodo.
  - ME74. A descrição do Superfan curta e sem números (P164).
  - ME75. No título da partida, "Superfan" vira uma etiqueta ao lado do nome do artista (o título não quebra no meio).
- ME76. O aviso do aria-live (o `announce`) continua no DOM ao trocar de aba ("Pulou. Tentativa 4 de 6." aparece no texto da escolha do submodo). Não aparece na tela, mas um leitor de tela pode reler; limpar ao trocar de aba (check-up de 12/10/2026).
- ME77. Nas estatísticas do Desafio, a distribuição tem 19 linhas (0 a 18 pontos), longa no celular: agrupar em faixas ou desenhar em colunas (check-up de 12/10/2026). **Resolvida no PR D3:** a distribuição em colunas.
- ME79. O `validate` e o `validate-artists` recusam kanji ou kana no título latino (o 東亰カニバリズム passou como "Higashi 亰 kanibarizumu").
- ME80. Os créditos da parada com o nome da Apple, a mesma regra da P187 no `pipeline/data/apple/aliases.toml`: 点描の唄 (feat. 井上苑子) "Inoue Sonoko" e 佐野勇斗&吉田仁人 "Sano Hayato & Yoshida Jinto", que a loja US escreve "Hayato Sano & Jinto Yoshida".
- ME81. Uma revisão das leituras do cutlet nos artistas, fora dos créditos. Exemplos: 蜃気楼 do Eve "Shinki rou", 私は最強 "Watakushi wa saikyou", あなたに出会わなければ "deawanakerebaa".
- ME82. A variante branca do selo da Apple no tema escuro: o Toolbox tem as duas (P81), e só a preta entrou no repositório. Não achei regra oficial para fundo escuro (busca de 13/10/2026); baixar a branca pede a permissão do usuário.
- ME83. As conferências da base no `dist/index.html` (`deploy.yml` e `ci.yml`) recusam só `/assets/` sem a base: um `/favicon.svg` sem ela passaria. Generalizar para todo `src` e `href` que comece com `/` e conferir que o `favicon.svg` e o `apple-touch-icon.png` estão no `dist` (revisor do PR B do M12). Mexe em `.github/`: ler o diff do workflow antes do merge.
- ME84 e ME85 (a seção de fora do Japão, feitas no branch `m13-de-fora-do-japao`): o romaji com letra fora do latino não vira título latino, e o classificador do modo por artista pega o ao vivo com " - " no parêntese, o set de DJ e o "(Clean)" (Apêndice K). A ME79 continua: a mesma conferência nos validadores.
- ME86. Uma regra do `artists.toml` para separar músicas que a chave junta: "Someday" (2026, 165,8 s) e "Someday (feat. Ha Hyun Sang)" (2023, 181,7 s), do Bolbbalgan4, viram uma só, e a de 2023 some (Hipótese: são músicas diferentes). Hoje só existe o `same_song`, que junta.
- ME87. No teclado coreano, a sílaba que ainda está sendo montada ("우주ㄹ", "우주르") não é prefixo da chave do título ("우주를줄게"), e o `COMPOSING_TAIL` do `GuessInput.tsx` só trata kana. Hipótese, sem teste num teclado de verdade: a lista de sugestões some até a sílaba fechar.
- ME88. O `strip_version_suffix` da parada (`normalize.py`) tem o mesmo defeito do " - " dentro do parêntese: "Song (Remix - feat. X)" vira "Song (Remix". Muda com os vetores e o par em TS (regra 6), num PR à parte.
- ME89. O e2e "entrar num diário pela nav, com o teclado" falhou uma vez na CI do PR #38 (13/10/2026): o Enter no link da nav deixou a Início na tela. Passou na reexecução e em 30 de 30 rodadas locais. Hipótese: o Enter chega antes de o app ouvir a troca do fragmento, no executor mais lento. Conferir se o `open()` do `e2e/helpers.ts` espera o app pronto antes do teclado.
- ME90. O `artistDisplay` da loja JP escreve em katakana parceiros ocidentais que não estão no snapshot (System of a Down: "ウータン・クラン" em Shame, "サージ・タンキアン" em The Rough Dog, "リル・キム" em Will They Die 4 You), e o `artistLatinOf` não acha latino para eles. Não há curadoria do `artistDisplay`: uma chave no `aliases.toml` dos artistas que troque o nome exibido resolveria (revisão da seção de fora do Japão).
- ME91. Nada na CI acusa título publicado que precisa de romaji e ficou sem latino: o aviso do `romanize` sai só para o texto novo, e o `--check` e o `validate-artists` não olham isso (já há casos, como 杪夏 e 蝸旋). Uma nota no `build-artists` ou uma conferência no `validate-artists`, ao lado da ME79.
- ME92. No modo por artista, o latino do álbum nunca aparece: a revelação mostra só o título do álbum, e o `optionView` de álbum é só do Normal. O comentário do `aliases.toml` dos artistas que diz que a revelação o mostra não bate com o código.
- ME93. O contorno da sugestão ativa do Desafio (`.suggestion.active`, o `--accent-line` sobre o `--surface-2`) dá ~2,67:1 no claro, abaixo dos 3:1 de forma, e o par não está no `PAIRS` (conta do revisor do PR D1, de antes dele). Entra no D2, que refaz a lista de sugestões, com o par na lista. **Resolvida no PR D2:** a sugestão ativa ganhou a tinta e o anel do `--focus`, cujos pares sobre a tinta e sobre o `--surface` já estão no `PAIRS`.

**De 21/10/2026** (os pedidos do usuário e o que ficou da entrega do switch e do volume):

- ME97. Uma categoria de músicas de anime populares (o usuário). Virou o M14 (Apêndice M), com o acervo montado pelo robô sem revisão humana (P238, que revisa a P223).
- ME100. No iPhone, conferir se o `<audio>` de reserva obedece ao volume (`?htmlAudio=1`). Hipótese: o iOS ignora o `volume` do elemento (só leitura, sempre 1), e lá a reserva não segue o nível da barra. Desde a ME99, o 0% liga o `muted`, que o iOS respeita: a conferir também.
- ME101. A prévia inteira da revelação toca com o volume da rodada, mas sem o controle nem o ícone do mudo: quem deixou em 0% ouve silêncio e não vê por quê (revisor do #46). Mostrar o controle na revelação, ou só o ícone do mudo, é decisão do usuário.
- ME103. Guardar o progresso sem servidor, no lugar do login que o usuário pediu (21/10/2026): exportar e importar, por um código ou um arquivo. É o que salva a sequência, os dias jogados e as medalhas quando o navegador apaga os dados (no iPhone, o Safari apaga o armazenamento de um site que não é aberto há 7 dias de uso), e o que leva tudo para outro aparelho. O import passa pelas conferências e migrações do save (regra 12 do `web/CLAUDE.md`). Para depois do Anime; o usuário prefere não ter servidor enquanto o jogo é só dos amigos dele.
- ME104. Os dias jogados e jogar os últimos dias (o pedido do usuário, 21/10/2026): uma lista dos últimos X dias com o resultado de cada um (o `history` do save já tem os dias), e quem perdeu um dia joga depois, sem aumentar a sequência e sem entrar na média. A agenda já traz os dias passados; o que muda é o save, que hoje não diz quando o diário foi jogado (um diário jogado depois preencheria o buraco da sequência): pede uma marca nele (a v7, com migração: a v6 é a do Anime, P250). Em aberto, com a recomendação: só os dias não jogados; X = 7; o dia jogado depois não conta para as medalhas.
- ME105. Medalhas (o pedido do usuário, 21/10/2026): feitos calculados do `history`, como as estatísticas, e nunca gravados (regra 12), como o 1º diário, o dia perfeito, 7 e 30 dias seguidos, acertar com 1 s e os dois modos no mesmo dia. Só um "já vi" fica guardado, para avisar da medalha nova. A sequência, que já existe (P38), ganha lugar na Início.
- ME107. Repensar a pontuação de todos os modos depois de implementar o Anime (o usuário, 21/10/2026). Até lá, o Anime usa as regras do Desafio.
- ME109. A agenda fictícia do Anime para em 09/11/2026 (as datas da dos Hits, P255): o robô cresce toda semana só a dos Hits. Depois de 09/11, o `npm run dev` sem `?date=` fica sem diário do Anime. Entra no PR B (o robô), ou à mão com o `schedule-anime --provider fixture`.
- ME108. A regra 3 do `CLAUDE.md` diz que o `.claude/settings.json` nega a edição dos gerados, mas a lista de negação não cobre os do modo por artista (`web/public/*/artists/`, `pipeline/data/apple/artists/snapshots/`, os `romaji.json` de `artists/`) nem os do Anime (`web/public/*/anime/`, `pipeline/data/apple/anime/snapshots/`). Ampliar a lista é decisão do usuário (mexe nas permissões).
- ME106. O negrito da aba ativa da nav (`.tabs a[aria-current]`) alarga o link em 2 a 3 px e empurra a aba seguinte ao trocar de categoria: com as abas juntas à esquerda (ME96), não há mais o espaço do `space-between` para absorver a diferença (`/code-review` da ME96). Corrigir pede reservar a largura do negrito (um `::before` invisível, com o rótulo num `span`) ou marcar a aba sem mudar o peso.

**Feitas:**

- Em 21/10/2026: ME96 (a categoria Hits, P225 a P227: a nav com a Início, os Hits e os Artistas, a aba marcada pelo `categoryOf`, com o `aria-current` "page" na tela da categoria e "true" dentro de um jogo dela; a tela `#hits`, com os cartões do Normal, do Desafio e do Treino; a Início com um cartão por categoria; o ✓ nos Hits com os dois diários terminados; os cartões num módulo só, o `ui/cards.tsx`; os endereços `#normal`, `#desafio` e `#treino` continuam). A ME102 foi encerrada sem mudança (P229).
- Em 21/10/2026, a revisão adiada do switch e do volume (ME99, com o `revisor` e o `/code-review` do #45 e do #46): o `matchMedia` sem o `addEventListener` (Safari antes do 14) não quebra mais a Início; o hover e o pressionado não apagam a trilha do switch; a dica de seguir o aparelho só vale sem escolha; o ícone do guia vence o provisório de mesmo nome; o nome do botão de volume diz o valor e o mudo; o Esc fecha a barra também com o foco no botão, e fechar pelo botão deixa o foco nele; o volume grava no fim do arraste (o `change`), e não a cada passo; o `<audio>` liga o `muted` no 0%; a tela acompanha o volume de um motor novo; o `[hidden]` vale sempre (uma regra base, e não uma por componente); o alto contraste do Windows (`forced-colors`) no switch e na barra; o `browserStore` num módulo próprio; o `provisional-icons.ts` com nome em inglês e o gerador no `docs/identidade/`; os testes dos motores (o ganho mestre, a regra 9 e o `muted`), do fechamento da barra e da troca do tema do aparelho; e o par e os comentários do controle segmentado que saiu. Junto, a ME98: o "(+1 s)" do "Ouvir mais" e do "Pular" desce inteiro, sem se partir.
- Em 21/10/2026: ME95 (a barra leva ao ponto da música, P224: na rodada, um toque no liberado toca dali até o fim dele, e a parte fechada não responde; na revelação, a barra da prévia inteira fica ao lado do "Ouvir", no lugar do botão sozinho, porque embaixo dele a revelação do Normal rolava 12 px em 360 × 640. O alvo tem 44 px, e o teclado anda de 1 em 1 s), ME94 (o "Não sei", o "Desistir" e o "Desistir da música" como botão, com o texto e o anel vermelhos, P220) e ME29 (as exceções do vite e do source-map-js fora do `web/.npmrc`; o lockfile continua no vite 8.3.3 e no source-map-js 1.2.2, as duas com mais de 14 dias).

- No M12, PR A: ME7 (o tema escuro, com a troca na Início, e o contraste dos dois temas travado pelo `web/scripts/theme.test.ts`) e ME30 (a barra do trecho e a distribuição: o liberado contra o trilho dá 14,75 no claro e 10,04 no escuro). A S31 (o M12 em 4 PRs) virou o plano do marco.
- S7 (M9): um marco por branch e por PR.
- Nos dois modos (P100): S14 (os nomes Normal e Desafio) e ME1 (o Desafio é o modo difícil). A S15 foi descartada: o Treino ficou só com os dois modos.
- S13 (Treino por artista) virou o M13 (P128): o modo por artista.
- Nas melhorias de interface de 12/10/2026 (num PR só, aprovadas item a item):
  - ME55: o artista em latim ao lado do japonês ("あいみょん · aimyon"), com o nome latino do catálogo (P74). Na parceria, cada artista conhecido é trocado pelo seu; se sobrar japonês (parceiro fora do catálogo), nada;
  - ME56: a confirmação do "Reiniciar o Treino" num pop-up modal (`<dialog>`). Sem estado de aberto: o próprio `<dialog>` diz, porque o evento `close` não chegava no painel do Claude e o pop-up não reabria;
  - ME57: "Não sei", "Desistir" e "Reiniciar o Treino" como botões secundários, e não links (fazem uma ação);
  - ME58: o selo no fim da página (P112), e o link dele ignora o 2º clique de um toque duplo (ficaria onde estava o "Próxima rodada");
  - ME59: "Ouvir mais (+1 s)", sem o custo, que foi para a dica do Normal na home ("Cada trecho a mais vale 1 ponto a menos").
- Na revisão noturna de 12/10/2026 (num PR só, P107):
  - ME43: toque duplo. O 2º clique cai no botão da tela nova (o "Não sei" da rodada seguinte, em 320 px); `ui/singleClick.ts` em todo botão que troca a tela ou fica onde outro some;
  - ME44: o robô usa o "hoje" da tarefa com token, confere o da geração e limita o último dia novo a hoje + 21;
  - ME45: `schedule-check --today` (P44 na CI e no robô);
  - ME46: teste de cada regra dos distratores do Normal;
  - ME47: testes do resumo, da contagem, do compartilhar e do aviso com foco (o `App` ficou na ME39);
  - ME48: o texto do Apêndice F sobre o save da sessão com a versão futura;
  - ME49: foco ao entrar num diário pela nav e nas telas de erro e de dia sem diário (`ui/FocusedNotice.tsx`);
  - ME50: o lookup de artista com as regras das faixas;
  - ME51: o `schedule-check` regera os dias novos e exige que sejam os do gerador;
  - ME52: a reserva e a lista fechada do robô em scripts com teste;
  - ME53: romaji sem texto vazio, snapshot sempre depois do último da `main` e `[0-9]` no id do RSS;
  - ME54: o máximo de pontos do i18n vindo de `MAX_POINTS`, o código morto (`unlockedSeconds`, a reexportação de `isValidDate`), o relógio do resolvedor recebido do `App` e o `pykakasi` fora do schema (sem subir o `schemaVersion`: nenhum catálogo publicado usou esse valor, e o robô recusa versão diferente).
- No PR B do M11: ME9 (partículas `は` e `へ` na consulta em kana), ME13 (`cache: "no-cache"`) e ME14 (folga da agenda no resumo do deploy).
- No checkup de 11/10/2026:
  - ME16 e ME22: parceiros conhecidos nos `artistIds` da faixa (PR #12);
  - ME19, ME20 e ME32: o Player com uma ficha por reprodução, a volta ao Tocar e o foco (PR #13);
  - ME21: o álbum do mesmo lançamento conta como acerto no Álbum (PR #13);
  - ME23: o Treino exclui o álbum de uma resposta pendente (PR #13, P91);
  - ME24: romaji e busca da parada real, no `aliases.toml` (PR #12);
  - ME25: o robô cai no "PR só com a agenda" quando a parada nova quebra o pipeline (PR #12);
  - ME26: uma faixa com host estranho ou data impossível conta como sem lookup (PR #12);
  - ME27: a prévia conhecida vale por uma semana sem prévia (PR #12);
  - ME28: a tarefa `catalog-runway` avisa quando a agenda tem menos de 10 dias (PR #12);
  - ME31: o `lang` próprio do artista e do álbum (PR #13);
  - ME35: a documentação conferida contra o código (PR #14).

---

## Apêndice A. Modelo de dados

**Princípios (implementados no M1):**

- O catálogo é uma **redução pura de todos os snapshots**, refeita do zero em todo build. O catálogo anterior só serve para comparar bytes ("sem mudanças"). Mudar uma regra atualiza todas as faixas.
- Nunca se apaga nada: uma faixa que sai da parada fica com `inLatest: false`, porque a agenda pode apontar para ela.
- Escrita determinística: chaves ordenadas, `ensure_ascii=False`, 2 espaços, `\n` no fim, bytes UTF-8, escrita atômica. Sem relógio nem sorteio (o Ruff barra). Popularidade em `Decimal`.
- `schemaVersion` ficou 1 até o primeiro deploy (M10). Desde então, só sobe em mudança incompatível, com migração, e o frontend recusa versão desconhecida. O catálogo está na v2 (P102: sem o `similar` da faixa e o `search` do álbum e do artista); a agenda, na v1.
- Contrato completo: `shared/schema/catalog.schema.json`. A validação soma invariantes que o schema não expressa e confere a forma canônica do arquivo.

### catalog.json (trecho do M1, gerado da parada fictícia)

O arquivo de hoje tem também `albums` (com o `similar` preenchido), o `storeUrl` e o romaji (`titleLatin` e `latinSource`). Desde a v2 (P102), a faixa não tem `similar` e o artista e o álbum não têm `search`. O contrato completo está no schema.

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
- **`similar`:** vazio no M1. No M3, os 10 candidatos a distrator mais próximos, calculados no Python. Desde a P102, só no álbum: o Desafio é digitado.
- **`latinSource`:** `provider` quando o latino veio do provedor (na Apple, o nome do artista no lookup de artista, P74); no M2 entram `manual` e `cutlet`.
- **`storeUrl`** (M11, P73): página da faixa na loja, sem o parâmetro de rastreio `uo` (o `i=` fica: sem ele o link abre o álbum); `null` nas fixtures.

### Snapshot da parada real (M11)

`pipeline/data/apple/snapshots/AAAA-MM-DD.json`, gravado pelo `fetch` e só de acréscimo: `{provider, storefront, chart, date, fetchedAt, rss: [{id, name, artistName}], tracks: {<trackId>: campos aparados do lookup}, artists: {<artistId>: {artistName}}, missing: [...]}`. O `providers/apple.py` mapeia na leitura (P72):

- tipo do álbum pelo sufixo do `collectionName` (" - Single", " - EP"; com `collectionArtistName`, coletânea);
- `releaseDate` + 9 h antes de cortar. Na 1ª parada, as horas vistas foram 07:00Z, 08:00Z e 12:00Z (nenhuma em 15:00Z, a meia-noite do Japão): o +9 h não mudou nenhuma data e segue como hipótese;
- capa em `300x300bb`; explícita por `trackExplicitness`; prévia de 30 s;
- nome do artista: o japonês das faixas; o do lookup de artista vira o latino (P74); parceria vira o `artistDisplay`;
- **parceiros** (checkup, ME22): os nomes da grafia da loja ("A & B", "A, B", "A × B", "feat.") e do "(feat. …)" do título que são artistas de alguma faixa entram nos `artistIds`, depois do 1º (o `songKey` usa o 1º e não pode mudar):
  - a chave é estrita (largura, caixa e espaços), e não a de busca, que casaria "=LOVE" com "Love". Ela precisa de 2 caracteres ou mais, e nome de dois artistas fica sem ligação, com aviso;
  - duas passadas: os artistas de todos os dias primeiro, então a ordem dos dias não muda o resultado;
  - com parceiro, o `artistDisplay` é a grafia da loja;
  - num álbum completo, o convidado não vira artista do álbum: fica o principal;
- faixa sem lookup fica fora do dia, com as posições recompactadas; álbum fixo por faixa (o primeiro que apareceu), com aviso;
- faixa com URL fora dos hosts da Apple ou data de lançamento que não converte conta como sem lookup, dentro do limite de 20% (ME26): recusar a parada inteira por uma faixa a congelaria;
- **prévia que some** (ME27): a última conhecida vale por uma aparição sem prévia, com aviso. Na segunda seguida, a faixa fica sem prévia e inelegível, porque a guardada pode estar morta. Só o snapshot mais novo gera aviso.

### schedule.json

```json
{ "schemaVersion": 1, "timezone": "America/Sao_Paulo", "epoch": "2026-11-01",
  "days": { "2026-11-01": { "number": 1, "catalogVersion": "2026-10-26.1a2b3c4d",
    "song":  [{ "answer": "fixture:tr:tr01" }],
    "album": [{ "answer": "fixture:tr:tr30", "options": ["fixture:al:al03", "fixture:al:al11", "fixture:al:al05", "fixture:al:al08"] }] } } }
```

Cada lista tem 3 rodadas. No Normal (`album`), `answer` é a faixa que toca e `options` são 4 álbuns. No Desafio (`song`), só `answer`: os dias gravados antes da P102 têm também 4 `options` de faixa, que ficam (a agenda só cresce) e que o jogo ignora. Contrato completo em `shared/schema/schedule.schema.json`.

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

- **Uma linha por música** (`buildSearchIndex(index)`, só no Desafio; a busca de álbum do M8 saiu com a P100): uma linha por `songKey`; single, versão de álbum e "TV Size" viram uma só, porque qualquer uma é acerto. Mostra a faixa mais popular do grupo. O índice é montado uma vez por catálogo.
  - "Já tentou" compara pelo `songKey` (`hitKey`).
  - Busca no catálogo inteiro, inclusive faixas que não podem ser sorteadas (restringir daria pista).
- **Variantes da consulta:**
  - a `searchKey` dela;
  - **kana → romaji** Hepburn, só na consulta: `とうきょう` acha 東京ライツ e `かあてん` acha カーテンコール. Segue o romaji do catálogo (cutlet): `を` vira "wo";
  - **sem a última letra** quando a chave tem 2+ caracteres e termina em `t`, `z`, `d`, `m` ou em `h` fora de `sh`/`ch`: o Kunrei (`ti`→`chi`, `zi`, `di`, `du`, `hu`) e o `m` antes de `b`/`p` só se resolvem na letra seguinte, então `sakamit`, `merod` e `ichibam` continuam achando;
  - **sem `ー`**, comparada com as chaves sem `ー`: `かてん` acha `かーてんこーる`.
- **Ordem:** começo do título > começo do artista > meio do título > meio do artista ("meio" só com 2+ caracteres); dentro da mesma faixa, a consulta exata vence a truncada e a sem `ー`; depois popularidade e `id` (comparação por code unit). Até 8 linhas. Uma letra só busca por prefixo.
- **IME:** o campo escuta `compositionstart`/`compositionend` por `addEventListener` (o `onCompositionEnd` do Preact não dispara no Chrome). Durante a composição, a busca ignora o latim que ainda está virando kana no fim (`とうk`, `とうｋ`, `かーt`); romaji puro em composição (teclado do celular) busca como está. O Enter que confirma a conversão não escolhe opção.
- **Conferido no M11** (1ª parada real, 10/10/2026): o cutlet escreve a partícula `は` como "wa" ("Kimi wa rokku wo kikanai", "gen'in wa") e `を` como "wo". Desde o PR B do M11 (ME9), a consulta em kana ganha uma 2ª leitura com `は` e `へ` como partícula ("wa" e "e"), nunca no começo: `きみはろっく` acha 君はロックを聴かない. A leitura normal continua valendo (`ごはん` = "gohan").

### Romaji no pipeline (decidido no M2, 08/10/2026)

Experimento com dois subagentes em paralelo, cada um num ambiente isolado, sobre 38 títulos e 15 artistas reais de J-pop com romaji esperado escrito à mão. A comparação usou a chave de busca, que ignora espaço, maiúscula e vogal longa.

| Biblioteca | Acertos | Licença | Peso instalado | Observação |
|---|---|---|---|---|
| **cutlet 0.5.2** (fugashi 1.5.2 + unidic-lite 1.0.8) | **46/53** | MIT | cerca de 250 MB | Lê kanji pelo contexto (来い ≠ 恋); erra rendaku (千本桜 → "senbon sakura") e nomes próprios (米津玄師, 藤井風) |
| pykakasi 2.3.0 | 44/53 | GPL-3.0+ | cerca de 10 MB | Lê kanji um a um (紅蓮華 → "guren hana", 君 → "kun") |

**Decisão (P21 a P23):**

- **cutlet**, no extra opcional `[romaji]`, com versões exatas.
- **Romaji é cache versionado.** O comando `romanize` grava o `romaji.json` do provedor (`pipeline/fixtures/` ou `pipeline/data/apple/`), que vai para o Git e é revisado no diff. O `build` só lê o cache e nunca importa a biblioteca. Assim a CI não instala os 250 MB, e o catálogo não muda quando o dicionário muda.
- **Exibição em Hepburn.** A grafia estrangeira ("Curtain call") entra só na busca, porque às vezes erra ("Tokyo right" para 東京ライツ).
- **Antes de romanizar,** emoji e invisíveis saem e `・` vira espaço. Sem isso, o cutlet produziria `?` e `/`.
- **Precedência do latino exibido:** `aliases.toml` (`manual`) > provedor (`provider`) > cache (`cutlet`).
- **Erro de romaji não muda o resultado do palpite**, que é sempre por ID. Afeta só o autocompletar do Desafio para aquela música, e se corrige com uma linha no `aliases.toml`.

**Resolvido no M7:** a regra `di`→`ji` da chave frouxa também pega o "di" de ディ ("merodi" vira a chave `meroji`), e "merod" deixava de ser começo de chave no meio da digitação. A variante sem a última letra (`d`) resolve.

**Validação do palpite:** sempre por **ID** escolhido na lista, nunca por texto livre. No Desafio, acerta quem escolhe o mesmo `songKey`. No Normal, acerta quem escolhe qualquer álbum que contenha o `songKey` da resposta e, desde o checkup (ME21, `acceptedIds` em `core/catalog.ts`), o do mesmo lançamento que o catálogo não liga à música, porque o lookup traz um álbum só por faixa. Do mesmo artista de um álbum certo, vale:

- o álbum com a música numa parte do nome: o EP "爆裂愛してる / 好きすぎて滅! - EP" tem 好きすぎて滅!;
- o álbum com o nome inteiro de um álbum certo (sem " - Single" ou " - EP"): os dois "ROSE - Single" da HANA aparecem iguais na busca, e recusar um seria injusto, mesmo para o lado B (Tiger).

Uma parte só do nome de um álbum certo não basta (a resposta 爆裂愛してる, do EP, não está no "好きすぎて滅! - Single"), e um nome que a normalização esvazia ("♡") não casa. O cálculo é feito na tela, então vale também para os dias já gravados. O histórico guarda o resultado, e jogo terminado não muda.

## Apêndice C. Agenda diária

### Fuso

`America/Sao_Paulo` pelo nome IANA, nunca o deslocamento fixo de -03:00, para absorver uma eventual volta do horário de verão.

- **TS:** `Intl.DateTimeFormat` com `timeZone` e `formatToParts`.
- **Python:** não precisa de fuso. "Hoje" chega como argumento (`schedule --today`); a Action (`update-catalog.yml`) calcula a data de Brasília com `TZ=America/Sao_Paulo date +%F`.
- **Número do desafio:** dias corridos desde `epoch` + 1, calculados sobre as datas em texto.

### Algoritmo (implementado no M3, `schedule.py`)

1. Para cada dia de `max(epoch, último dia + 1, hoje)` até hoje + 21. **Dia que já passou nunca é gerado** (P44, M10): se a geração atrasou, o intervalo fica como buraco, com aviso no CLI e no PR do robô.
2. **Janela:** K = mín(180, piso(P / 12)), com P = músicas distintas (`songKey`) entre as elegíveis e 6 respostas por dia. Com a parada fictícia, P = 37 e K = 3. Ficam de fora as faixas, músicas e álbuns respondidos nos K dias anteriores.
3. **Por rodada:** candidatos = elegíveis fora da janela, sem repetir faixa, música, álbum ou artista do dia, ordenados por `(-popularity, id)`. A faixa de dificuldade é cortada **depois** do filtro: a rodada 1 sorteia entre os primeiros ceil(n/3), a 2 entre os primeiros ceil(2n/3) e a 3 entre todos.
4. **rng** = `mulberry32(fnv1a32("musicle-jp|<data>|<alvo>"))`, alvo `song` ou `album`. No Normal (`album`), **7 números por rodada:** 1 para a resposta, 3 para escolher os distratores (Fisher-Yates parcial sobre o `similar` do álbum, sem os álbuns e as músicas das outras respostas do diário) e 3 para embaralhar as 4 opções. No Desafio (`song`), desde a P102, só 1: o da resposta (antes, 7, com distratores de faixa). A mudança vale só para os dias novos; o `schedule-check` protege os gravados.
5. **Afrouxamento,** com log: primeiro o artista passa a valer só dentro do mesmo diário; depois a janela encolhe (K−1 … 0). Faixa, música e álbum nunca repetem no dia. Com a parada fictícia: zero afrouxamentos em 61 dias (teste).
6. **Só acréscimo, sem exceção.** Dia gravado nunca muda. Resposta futura que deixou de ser elegível gera **aviso** e o jogo anula a rodada sem penalidade. `schedule-check --base-ref <ref>` compara com uma revisão do git (no M9, com `fetch-depth: 0` e `github.event.before`). O `compare` também recusa dia novo antes do último dia da base (o buraco nunca é preenchido) e dias novos com buraco entre eles (um dia solto mais à frente congelaria a agenda) (M10). Desde a revisão de 12/10: com `--today` (a CI e o robô passam a data de Brasília), recusa dia novo que já passou e 1º dia novo depois de `max(epoch, último + 1, hoje)`, que deixaria buraco para sempre (ME45); e regera os dias novos a partir da base, com o catálogo ao lado da agenda, exigindo que saiam iguais (ME51). Cada dia só depende dos anteriores, da data e do catálogo, então regerar do 1º ao último dia novo dá o mesmo resultado, seja qual for o `--today` da geração. Consequência: o PR do robô precisa do merge no mesmo dia. A CI dele roda quando as checagens são aprovadas (P64): aprovada num dia seguinte, ela recusa o dia que passou. Aprovada no dia e mergeada depois, a CI não roda de novo (o `strict` não reroda), e o dia passado entra; só a CI do push na `main` fica vermelha, depois do fato (limitação aceita: travar o deploy seria pior, porque a agenda só cresce).
7. **Validação em dois níveis:** a estrutural (nenhum dia antes do `epoch`, `number`, opções, IDs; buraco é válido desde o M10) vale para todos os dias. Elegibilidade e restrições só valem na geração, para que uma regra nova não quebre o passado.

**Por que não calcular no navegador:** o resultado mudaria a cada atualização semanal do catálogo.

**1ª agenda real** (PR B do M11, P77): `web/public/data/schedule.json`, com `epoch` 2026-10-10 e `--today` 2026-10-11, tem 22 dias, do nº 2 (11/10) ao nº 23 (01/11). O 10/10 ficou como buraco (P44), com aviso no CLI. O site publicado lê esta agenda; a das fixtures continua no desenvolvimento e no e2e.

Se faltar o dia na agenda, o Normal e o Desafio mostram "Não há diário hoje." com um link para o Treino, que continua funcionando (implementado no M8; o texto antigo, "volte mais tarde", era falso pela P44).

## Apêndice D. Regras dos modos

Dois modos (P100): o **Normal** acerta o álbum ou single entre 4 opções; o **Desafio**, o nome exato da música, digitado.

| Regra | Normal (4 opções de álbum) | Desafio (digitação com autocompletar) |
|---|---|---|
| Etapas do trecho | 1, 2, 4, 7, 11, 16 s | 1, 2, 4, 7, 11, 16 s |
| Tentativas por rodada | 1 palpite | 6 |
| Liberar mais trecho | "Ouvir mais" (custa 1 ponto) e toca na hora (P33) | Erro ou "Pular" consomem tentativa e liberam a etapa seguinte; nada toca sozinho (P46); na 6ª tentativa o "Pular" some |
| Pontos da rodada | 6 menos etapas extras; erro = 0 | 7 menos o número da tentativa que acertou; falhar = 0 |
| Desistir | "Não sei" = 0 | "Desistir": revela a resposta, 0 pontos |
| Repetir o trecho | Livre na etapa atual | Livre na etapa atual |
| Fim da rodada | Revela capa, título, artista, preview inteiro e link para a loja; marca a certa e a escolhida | Igual, com a lista de tentativas (❌, ⬛, ✅) no lugar das opções |

- **Sem escolha no dia** (P100): cada diário já é um modo, e a rodada 1 começa direto. A escolha do modo de resposta do M7 (P13, P45) saiu.
- **Palpite do Desafio:** sempre por ID escolhido na lista (Apêndice B), uma linha por música; a música já tentada aparece marcada e não pode ser escolhida de novo.
- **Dia:** de 0 a 18 pontos por diário.
- **Treino** (M8, `core/practice.ts` e `ui/Practice.tsx`): rodadas sem fim, geradas no navegador.
  - **Saco do modo da sessão:** Desafio, uma faixa elegível por `songKey` (a mais popular); Normal, uma faixa elegível por álbum, sem repetir música no saco. Embaralhado por ciclo com `seeded("treino|<semente>|<alvo>|<ciclo>")`; a semente vem de `crypto.getRandomValues` na tela. O estado (`PracticeState`) guarda só semente, modo, ciclo, posição e a última tocada, nunca o gerador; desde a P105, um cursor só, porque o modo não muda na sessão. No ciclo novo, a última tocada vai para o fim do saco.
  - **Exclusão:** as músicas (`songKey`) das respostas dos diários de hoje que ainda não têm resultado, nos dois modos, porque a faixa toca nos dois. Desde o checkup (ME23, P91), também pelo álbum: fica de fora a faixa de todo álbum que a resposta do Normal aceitaria por uma música excluída (o próprio `acceptedIds`: os álbuns que a contêm e os do mesmo lançamento), porque a revelação mostra o álbum. A faixa excluída é pulada no sorteio, sem sair do saco, e pode voltar a partir de então, quando o diário terminar. Sem nada para sortear, a tela avisa e oferece "Sortear de novo".
  - **Opções do Normal:** o álbum certo e 3 distratores do `similar` dele, sem os álbuns que entregariam uma música excluída; com menos de 3, a lista inteira, como em `schedule.py`. Embaralhadas. O Desafio é digitado: sem opções e sem gastar o rng.
  - **Modo** (Normal ou Desafio, P100) escolhido antes de começar, em dois cartões; a sessão roda só nele (P105). Trocar é "Reiniciar o Treino", que volta à escolha e, com rodada jogada, pede confirmação num pop-up modal (ME56: o `<dialog>` com `showModal()` deixa o resto da tela inerte; o foco vai ao "Cancelar", e "Cancelar" e o Esc o devolvem ao botão). **Placar** só da sessão (P50); rodada anulada não conta. A sessão fica no `App` enquanto a página está aberta (`null` é a escolha do modo); o cartão da home mostra o modo e o placar (P106).
  - **Toque duplo:** o Preact redesenha antes do 2º clique, que cai no botão da tela seguinte. Por isso os cartões ignoram o 2º clique de um toque duplo no "Reiniciar" ou no "Sim" (`event.detail > 1`), e o "Reiniciar" e o "Tocar" ignoram o de um toque duplo num cartão. O "Tocar" ignora também o próprio 2º clique, que pararia o som.
  - **Limitação aceita:** a data do jogo é fixada ao abrir a página; quem a deixa aberta depois da meia-noite continua com a exclusão do dia anterior até recarregar (o mesmo vale para os diários, Apêndice F).
- **Modo por artista** (M13, `ui/Artists.tsx`, Apêndice K): o Treino do Desafio sobre o arquivo de um artista, com as mesmas regras (P125). A busca é só pelo título, e a exclusão dos diários de hoje passa pelo título e pelo álbum (P141).
- **Superfan** (ME61, `core/superfan.ts`, Apêndice K): a variante do Desafio no modo por artista, com regras próprias (`VARIANT_RULES`, sem `Target` novo). Uma partida com as músicas do artista, cada uma uma vez, em 3 trechos (1, 4 e 9 s). O acerto vale 3, 2 ou 1; cada palpite errado tira 5 e passa ao trecho seguinte; 3 erros acabam a partida; a ajuda (até 3) vale logo de cara e 0; desistir da música tira 2 (P186).
  - Desistir (`GIVE_UP`) marca `RoundState.gaveUp`, e o `roundScore` soma os `giveUpPoints` das regras: 0 nos diários, no Treino e no Livre; −2 no Superfan (P186). A revelação diz a conta à parte ("Desistiu: −2 pontos."), como a dos erros. Quando é a partida que encerra a música (o 3º erro, encerrar), o `core/superfan.ts` manda o evento com `forced`, que não cobra. Pular a última tentativa (a tela não oferece) também é desistir. O save não muda: a tela nunca manda `forced`, e o Superfan não grava nada (P116).
- **Ajuda do Desafio** (P149 a P152, P155 a P157; `core/help.ts`, o evento `HELP` do reducer):
  - O botão "Pedir ajuda" (sem pontos, P164) aparece depois de `HELP_AFTER` tentativas gastas: 1 no Treino e no Livre do modo por artista, 3 nos diários. No Superfan, logo de cara (`helpFrom` 0, P159), até 3 por partida e valendo 0 (P186). Ele troca o campo por até 4 músicas, a certa entre elas, com o foco na 1ª.
  - O evento traz as opções prontas: o reducer não sorteia nem lê o catálogo, e o evento salvo refaz a rodada igual. Ele confere a forma (de 2 a 4 ids distintos, nenhum já tentado, ao menos um aceito), uma vez por rodada e depois das tentativas que as regras pedem (`helpFrom`: 1 no Desafio, 0 no Superfan).
  - Com a ajuda, o palpite sai das opções, errar encerra (P151), e acertar vale os `helpPoints` das regras em qualquer etapa (P152): 1 no Desafio, 0 no Superfan (P186; era −1, P153). No Superfan, a dica diz também quanto custa errar (−5). Pular continua (P163): só aumenta o trecho, até a última tentativa, que fica para a opção. Por isso o reducer guarda o ponto da ajuda (`RoundState.helpAt`), que vira o `help` do histórico: os pulos depois dela não deixam deduzir das tentativas. Com a ajuda, o anúncio do pulo diz o trecho novo ("Pulou. O trecho agora tem 11 s."), porque o contador de tentativas não está na tela.
  - As opções: a resposta e até 3 outras músicas, cada uma pela faixa que a busca sugere (`songRepresentative`: a resposta não se destaca por um "(TV Size)"); nunca outra versão da resposta, outra música de mesmo título, uma já tentada ou uma resposta dos diários de hoje (no Treino e no modo por artista, a mesma exclusão do sorteio; no diário, as respostas dos dois modos do dia, `dayAnswerKeys`).

**Distratores** (`similarity.py`, implementado no M3):

- **Só de álbuns** (P102; os de faixa, do M3, saíram com a Música em 4 opções): com capa, sem compilação, sem artista em comum (união dos artistas das faixas; parcerias contam) e sem nenhuma música em comum (al01 e al02 nunca são opção um do outro). O Normal aceita singles (P24).
- **Proximidade:** janela de ano (±2, ±5, qualquer), diferença de popularidade e tipo de lançamento; desempate por `id`.
- **Lista de até 10, no máximo 1 por artista:** qualquer sorteio de 3 já sai com artistas distintos. O `validate` exige 3 ou mais no álbum de toda resposta possível.

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
  - cache da `Promise<AudioBuffer>` por URL, com no máximo a rodada atual e a próxima (`retain`, chamado pelo gancho `usePreviews` do diário e do Treino, que pré-sorteia a próxima rodada);
  - uma ficha por reprodução, para ignorar resultados velhos;
  - envelope de 10 ms (`core/envelope.ts`) que termina exatamente no corte;
  - para quando a aba fica oculta.
- **Medido no navegador:** cortes de 1, 2, 4 e 7 s a menos de 10 ms do pedido (a diferença é o atraso do evento `ended`, não do som).
- Falha de áudio anula a rodada sem penalidade (`VOID { round }`).
- Barra segmentada com pesos 1, 1, 2, 3, 4 e 5 (total de 16 s), em `core/player.ts`.
- Motor falso (`audio/fake.ts`, M9): só em desenvolvimento com `?fakeAudio=1`, para os testes de ponta a ponta; "toca" na hora, sem som, e falha na faixa de `?failAudio`. O `DEV` é conferido no ponto da escolha, então o Vite o tira do build (a CI confere).
- Nada é gravado em disco (termos da Apple): o navegador toca a prévia direto do servidor da Apple.

**Implementado no M11 (PR B): prévias reais e reserva (P70, P75, P76).**

- **Resolvedor de prévias** (`data/previews.ts`, sem DOM: recebe o `fetch`):
  - fixtures: o endereço do catálogo, na hora (o `peek` sempre responde);
  - parada real: o lookup do iTunes no navegador, em lote, com o `previewUrl` do catálogo como reserva;
  - quando a reserva vale: erro de rede, HTTP 403 ou 429 (que abrem o disjuntor na hora), 3 s sem resposta, resposta sem `results`, faixa ausente, prévia fora do host da Apple, cota (12 consultas por minuto, abaixo das cerca de 20 da Apple) e disjuntor (2 falhas seguidas);
  - os pedidos do mesmo ciclo saem numa consulta só. A fila sai numa microtarefa, porque os efeitos do filho (a rodada pede a sua faixa) rodam antes dos do pai (o diário pede o dia inteiro). O navegador mostrou o lote partido em dois antes dessa fila.
- **`useResolvedUrl`:** o Tocar fica em "Carregando…", desabilitado, até a URL chegar. As opções já aparecem.
  - O foco vai para o Tocar quando a URL chega, mas só se o jogador ainda não foi para outro lugar (o campo de digitação, uma opção).
  - Se a resposta chega entre a pintura e o efeito, o efeito assina mesmo assim e desenha de novo.
  - Faixa sem prévia nenhuma (nem o lookup nem a reserva) anula a rodada, como uma falha de áudio.
  - O diário pede as faixas do dia (Música e Álbum) numa consulta só, já na carga, antes da escolha do modo; o Treino pede de 2 em 2. Desde o checkup, só as dos diários sem resultado (`pendingDayTracks`): o diário terminado mostra o resumo e gastava a cota do lookup.
- **Player** (checkup, ME19, ME20 e ME32, PR #13):
  - uma ficha por reprodução: só a mais nova mexe na tela. No Web Audio, o fim de um trecho interrompido chega uns 10 ms depois do stop, quando o trecho do "Ouvir mais" já começou, e parava a barra e devolvia o "Tocar" com o som tocando. O motor falso do e2e nunca é interrompido, por isso o bug passou desde o M5; o teste de componente usa um motor como o Web Audio;
  - o motor parado antes de o som começar (um palpite na digitação, a aba oculta) devolve `null`, e a tela volta ao "Tocar";
  - quando o som começa, o foco volta ao botão principal só se tiver caído no `body` (o "Ouvir mais" que some na última etapa, o botão desabilitado no "Carregando…"). Num "Ouvir mais" do meio, o foco fica nele;
  - a revelação usa a mesma ficha: "Ouvir a prévia inteira" alterna com "Parar" (também no carregamento), ignora toque duplo e mostra a falha na tela e no `aria-live`.
- **Motor composto** (`audio/fallback.ts`), conforme o motivo da falha (`AudioUnavailableError.kind`):
  - `decode` (codec ausente): a sessão passa para o `<audio>`;
  - `network` e `http` (rede caiu, CORS barrado, 404, 403): a reserva vale só para aquela URL. Uma queda de sinal passageira não tira o corte exato do resto do dia (revisão do PR B);
  - `blocked` e `simulated`: não troca. `blocked` (som barrado fora do gesto) volta ao Tocar sem anular a rodada;
  - um Parar durante a espera não liga a reserva.
- **`<audio>` de reserva** (`audio/htmlaudio.ts`):
  - um elemento só, reaproveitado, sem `crossOrigin` (não exige CORS);
  - `play()` antes de qualquer `await`, por causa do gesto no Safari;
  - o corte é conferido no `currentTime` por um laço de `setTimeout`, que dorme até perto do fim. O `requestAnimationFrame` não serve: ele para quando a página não pinta (janela encoberta), mesmo com a aba visível, e o som passava do corte;
  - para quando a aba fica oculta ou quando há erro no meio;
  - a `mediaSession` mostra o nome do jogo, para a tela de bloqueio não mostrar a resposta;
  - as ações da `mediaSession` (tecla de mídia, botão do fone, tela de bloqueio) têm tratador próprio: tocar e avançar não fazem nada, e pausar é o Parar. Sem isso, o navegador tocaria o `<audio>` além do corte e entregaria a música (achado do `/code-review`);
  - refaz o seek depois do `play()` se o navegador ignorou o início pedido (há Safari que ignora antes dos metadados).
- **`navigator.audioSession.type = "playback"`** no destravamento (P75).
- **Chaves do site publicado** (P76): `?htmlAudio=1` faz o Web Audio falhar como `decode`, e a troca acontece de verdade; `?failLookup=1` nunca consulta.
- **Medido no navegador do Claude** (11/10/2026, desenvolvimento com `?data=real`):
  - lookup único com as 3 faixas do dia, em 435 ms;
  - prévia baixada em cerca de 800 ms;
  - Web Audio: 1 s pedido, 0,998 s tocado;
  - `?htmlAudio=1`: motor `html`, 1 s pedido, 1,010 s tocado;
  - `?failLookup=1`: nenhuma consulta, e a prévia do catálogo tocou;
  - console limpo.
- **Falta conferir de ouvido:** o som em Chrome, Firefox, Android e iPhone, este com o silencioso ligado (P75).

**Áudio sintético (comando `fake-assets`, M3):** só biblioteca padrão. Para cada `preview.url` do catálogo, gera um WAV de 11.025 Hz, 16 bits, mono, com a duração do preview. Toca **uma nota por segundo** da pentatônica de dó, sorteada pelo ID da faixa e sem repetir a anterior: o trecho de 1 s soa como 1 nota e o de 4 s como 4 notas, o que permite conferir o corte de ouvido. Para cada capa, gera um SVG 600×600 com cor pelo hash do ID, título e artista. Só roda com o provedor `fixture`, aceita só URLs `fixtures/(audio|art)/<nome>` e apaga arquivos órfãos. Tudo fora do Git (25,4 MiB de áudio).

## Apêndice F. Persistência e compartilhamento

Implementado no M6 (`web/src/storage/`, `core/records.ts`, `core/stats.ts`, `core/share.ts`).

- **Chave:** `musicle-jp:save`. O prefixo é obrigatório porque todos os sites de projeto em `<usuario>.github.io` compartilham o mesmo localStorage.
- **Conteúdo (`Save`, v5 desde a P163):** `{ schemaVersion: 5, history, inProgress }`, os dois mapas por `"2026-10-08|album"` (o Normal) ou `"2026-10-08|song"` (o Desafio).
  - `history`: o `FinishedGame` de cada dia, `{ number, rounds: [{ status, stage, attempts, help? }] }`. Pontos e máximo saem de `status`, `stage` e `help`; nada derivado é gravado. O `help` (P149) só existe na rodada com ajuda: quantas tentativas tinham sido gastas quando ela foi pedida (depois dela vêm pulos, desde a P163, e no fim no máximo a opção). O `isFinishedGame` confere as tentativas pelas regras do modo, que sai do id: no Normal, no máximo 1, nunca um pulo nem ajuda.
  - `inProgress`: `{ events }`, só os eventos que o reducer aceitou. O cartão da home mostra "em andamento" desde o 1º evento.
  - O `settings` (a preferência do modo de resposta, M7) saiu com a P100. Um campo que o save não usa mais é ignorado sem aviso.
- **Retomada por eventos:** `startSession` repete os eventos sobre o jogo novo do dia. Como o reducer é puro, recarregar retoma igual, inclusive rodada anulada. Se a repetição chegar ao fim, o jogo vira histórico. Se ela descartar eventos (catálogo novo no mesmo dia), a sessão sai com `stale` e a aba regrava a lista aceita com `replaceProgress`; sem isso, a regra da lista mais longa impediria gravar os próximos eventos.
- **Ajuda salva** (P149): o evento `HELP` guarda as opções. **Limitação aceita:** se o catálogo novo do mesmo dia mudar o `songKey` da resposta, a repetição recusa o `HELP` (a resposta não está mais entre os aceitos), e a escolha seguinte volta como palpite comum; é o mesmo risco que os palpites já têm (`stale`).
- **Virada do dia:** ao abrir, o `inProgress` de outros dias é descartado. Quem começou o dia D com a aba aberta termina o dia D, mas recarregar depois da meia-noite perde esse andamento.
- **Tolerância a falha:**
  - `openStore` testa o armazenamento só com uma **leitura**; se ela lançar ou o armazenamento não existir, o jogo segue em memória, com aviso. A sonda não grava: com a cota cheia, o save que já existe ainda é lido (dia terminado continua terminado).
  - JSON ilegível ou fora da forma: o texto original vai para `musicle-jp:corrupt` (só se a chave estiver vazia) e o jogo recomeça. Entrada inválida dentro de um save bom é descartada sozinha; mapa ausente vira vazio sem levar o histórico junto.
  - Versão maior que a suportada: não é sobrescrita; o jogo segue sem salvar, com aviso.
  - Falha ao gravar: `updateSave` devolve o motivo (`full`, `future` ou `unavailable`), e a tela mostra o aviso certo uma vez, visível e na região `aria-live`.
  - Migrações em `storage/migrations.ts`, uma função por versão, cada uma com o teste de um save real da versão anterior. **v1 → v2** (M11, P68): o jogo trocou a parada fictícia pela real, e as chaves são por data, então o dia fictício e o real do mesmo dia se misturariam. A migração zera o histórico e o andamento e mantém só a preferência do modo. Uma aba antiga, ainda com o código v1, lê o v2 como "future" e para de gravar. **v2 → v3** (P100): saiu o modo de resposta, e a migração zera tudo, a preferência junto (eram só jogos de teste). **v3 → v4** (P149): a ajuda, com o evento `HELP` no andamento e o `help` da rodada. Nada muda no que existe; a versão sobe para que uma aba com o código v3 (que recusaria o `HELP` e jogaria fora o andamento) leia o v4 como "future" e pare de gravar. **v4 → v5** (P163): o "Pular" depois da ajuda, com o `SKIP` depois do `HELP` no andamento e pulos depois do `help` da rodada. Também nada muda, e a versão sobe pelo mesmo motivo: o código v4 recusaria o pulo e jogaria fora o dia.
- **Duas abas:** `updateSave` relê, mescla e grava. No histórico, o primeiro término vence; no andamento do mesmo jogo, vence a lista de eventos mais longa. O resumo relê o save, então mostra o resultado que ficou gravado. **Limitação aceita:** com duas abas dá para refazer uma rodada (uma erra e vê a resposta, a outra acerta); o jogo é pessoal e não há ranking.
- **Abas do jogo** (M8, P49): o `App` guarda a última leitura do save (`latest`), que a home também lê para os cartões, e relê ao trocar de aba, quando um diário termina (`onSaved`) e quando outra aba do navegador grava (evento `storage`). Cada aba de diário monta do zero com essa leitura e a guarda na montagem (o `latest` muda a cada gravação, e recalcular a sessão com ele pularia a revelação da última rodada), então voltar ao Desafio terminado mostra o resultado (P39). O Treino não grava nada (P50).
- **Save da sessão** (`sessionStore`, M8): grava no navegador quando dá; o que não consegue gravar (cota cheia) fica em memória, e sem gravação nenhuma (versão futura ao abrir, sem acesso) tudo fica em memória. Assim trocar de aba não perde o andamento nem nesses casos. O que foi gravado não fica em memória, para a mescla das duas abas continuar vendo o que a outra gravou. **Limitação aceita** (revisão de 12/10, ME48): se outra aba, com uma versão mais nova do jogo, grava no meio da sessão, o `updateSave` para de gravar (nunca sobrescreve a versão maior) e o aviso pede para recarregar; trocar de aba antes disso relê o save mais novo, que este código não lê, e o andamento da sessão se perde.
- **Estatísticas:** função pura sobre o histórico, por modo: jogos, média, distribuição de 0 a 18, sequência atual e melhor (P38, P40, P41). "Hoje" é a data do jogo, não o relógio; hoje ainda não jogado não quebra a sequência. **Dia que faltou** (Action ou merge parados por mais de 21 dias): desde a P44, no M10, ele vira buraco e não quebra a sequência. Risco residual: dias gerados durante uma parada e publicados só no merge entram na agenda sem que ninguém os tenha podido jogar.
- **Compartilhar:** `core/share.ts` recebe só o `FinishedGame`, que não tem IDs nem títulos. Símbolos da P42; no Normal, um ⬛ por "ouvir mais" e depois ✅ ou ❌; no Desafio, uma marca por tentativa, e o 💡 da ajuda no ponto em que foi pedida (P155). Exemplo:
  ```
  AteMusic · Normal nº 1
  11/18
  ✅
  ❌
  ⬛✅
  https://<usuario>.github.io/musicle-jp/
  ```
  `navigator.clipboard.writeText` é chamado dentro do clique; sem ele (fora de HTTPS), aparece um campo só de leitura com o texto selecionado.
- **Contagem regressiva:** mira `startOfDayInZone(addDays(data do jogo, 1))` e recalcula pelo relógio a cada segundo e quando a aba volta a ficar visível. Ao zerar, oferece "Jogar o novo diário".

## Apêndice G. Organização do código TS

Implementado no M4 (`web/src/core/`):

- **Estado:** `GameState { puzzleId, target, rounds, current, variant? }`; o `target` é o modo (P100), e o `variant`, a variante com regras próprias (só o Superfan, ME61, que não é salvo). Não há campo `status`: `isFinished` é derivado (nenhuma rodada em andamento), então fechar a aba depois da 3ª rodada não deixa o jogo "em andamento".
- **Rodada:** `RoundState { trackId, correctOptionId, accepted, options, stage, attempts, status, voidReason }`. `trackId` é o que toca; `correctOptionId` é a opção a destacar (a faixa, ou o álbum dela); `accepted` são os IDs que contam como acerto, calculados ao criar a rodada (versões da mesma música; no Normal, também os álbuns do mesmo lançamento, ME21), para o reducer não consultar o catálogo. As `options` só existem no Normal; no Desafio ficam vazias, mesmo nos dias antigos que as trazem.
- **Eventos:** `GUESS`, `LISTEN_MORE`, `SKIP`, `GIVE_UP`, `VOID` (falha de áudio) e `NEXT_ROUND`. Evento inválido devolve **o mesmo objeto**.
- **Regras por modo** em `MODE_RULES` (`rules.ts`), chaveado pelo `Target` desde a P100: palpites, o que um erro faz, se pode ouvir mais ou pular, se o palpite sai das opções (`guessFromOptions`). Pontos = 6 − etapa nos dois modos. `MODES` dá a ordem (Normal, Desafio) da nav, da home e do Treino, e `ui/modes.ts`, o nome na tela.
- **Rodada anulada** (`void`): nasce assim se a resposta sumiu ou perdeu a elegibilidade; sai do total (P27).
- **Tipos** do contrato gerados de `shared/schema` (`npm run types`).
- **UI:** `useReducer` do Preact recebe o reducer do `core` (M5), embrulhado no M6 pelo `playReducer` do `Game.tsx`, que guarda também a lista de eventos aceitos para o save.
- **Rodadas soltas** (M8): `createRounds(planejadas, alvo, índice)` monta as rodadas da agenda (via `createGame`) e as do Treino (`practiceGame`: um `GameState` de 1 rodada, `puzzleId` `treino|...`), com o mesmo reducer.
- **Rodada na tela** (M8): `RoundView.tsx` (Player, as opções do Normal ou a digitação do Desafio, rodada anulada, revelação; só a digitação monta o índice de busca) serve ao diário e ao Treino; quem chama cuida do cabeçalho, do save e do que vem depois (`nextLabel`, `onNext`). Ganchos comuns em `ui/hooks.ts`: `useResolvedUrl`, `usePreviews` e `useSuggest`.
- **Rotas** (M8): `core/routes.ts` (`Tab`, `ROUTES`, `tabFromHash`, `todayHref`), puro e testado.
- **Variantes** (ME61): `GameState.variant` e `rulesOf(jogo)` dão as regras da variante (`VARIANT_RULES`) ou as do modo. Cada `ModeRules` diz a barra (`stages`), os pontos do acerto por etapa, os da ajuda, os de cada palpite errado e quantas tentativas vêm antes da ajuda; o `roundScore` conta por elas. Os dois modos de hoje continuam com 6 a 1 pontos e a barra de 1 a 16 s.
- **Rodadas sem fim** (M13): a sessão em jogo saiu do `Practice.tsx` para o `ui/PracticeRun.tsx` (cabeçalho, placar, pop-up do reinício e o aviso sem rodada, com os textos por prop), que serve ao Treino e ao modo por artista. O arquivo de um artista vira um `CatalogIndex` (`indexArtist`) pelos tipos `Playable*` de `core/types.ts`, sem o `chart` da faixa nem o `similar` do álbum, que o núcleo não lê.
- **Home** (`ui/Home.tsx`, depois do checkup): o nome, o selo do logo (`ui/Logo.tsx`, P193), um cartão-link por modo e "Como funciona". O estado de cada diário (novo, em andamento, terminado com os pontos, ou sem diário) sai de `dailyStatus` (`core/home.ts`, puro). Os cartões saem de `MODES`, mais o Treino e, desde o M13, os artistas (P126).
- **i18n:** `pt-BR.ts` exporta um objeto de textos; `t(chave, parâmetros)` é tipado por `keyof`. Plural com `tn(chave, n)` sobre chaves `.one` e `.other` (M6): usa `Intl.PluralRules('pt-BR')`, mas força o zero no plural, porque o `Intl` diz "one" para 0 em português ("0 ponto").

## Apêndice H. Testes e qualidade

| Camada | Ferramenta | Cobertura |
|---|---|---|
| Pipeline | pytest | Vetores de normalização e PRNG; romaji; merge cumulativo; agenda (determinismo, só acréscimo, janela sem repetição, distratores válidos, buraco da P44: nunca gera passado nem preenche o buraco); schema; bytes idênticos em duas execuções; CLI. Desde o M11: `test_fetch` (transporte falso, limiares, hosts, datas), `test_apple_provider` (cada regra do mapeamento, parceiros), `test_romaji_cache` e `test_catalog_pr_script` (o script da tarefa com token, que precisa de `jq`: pula no Windows, e a CI roda) |
| Núcleo web | Vitest | Reducer nos dois modos (e as 4 combinações até a P100); pontuação; share; virada de dia às 23:59 e 00:00 de Brasília; busca com kana, kanji e romaji; storage (migração, JSON corrompido, cota cheia); sequência com dia pulado. Desde o M11: `core/apple` e `view` (hosts), `data/previews` (cada reserva, lote, disjuntor, cota), `source`, `audio/htmlaudio` e `fallback`. No M13: `core/artists` (a exclusão pela participação, pelo álbum e pelo título de uma versão; o Treino e a busca sobre um artista), `indexArtist`, os carregadores dos artistas e o orçamento do lookup dividido entre resolvedores (P142); a ajuda (P149: `core/help`, o evento `HELP`, o save v4 e os guards dele) e o Superfan (ME61: `core/superfan`, com os pontos, os erros, as ajudas, o fim da partida, a música anulada, as músicas de fora e o começo sorteado). Meta: 90% de linhas e de statements em `core`, `data` e `storage` (`vite.config.ts`) |
| Componentes | Vitest + Testing Library + happy-dom (por arquivo) | `GuessInput` (teclado, ARIA combobox, IME, rolagem, região de status), `Player` (regras do modo, foco, falha atrasada) e `ModePicker` (M7, removido com a P100); `RoundView`, `Practice` e `Options` (capas) (M8), com a escolha do modo e o reinício do Treino desde a P105 (num pop-up desde a ME56); `ItemLabel` (artista em latim, ME55); `Home` (cartões, estados, dia sem agenda, foco e nenhum `id` igual a uma rota); `Artists` (M13: a lista, a carga e as falhas, a sessão entre as abas, a troca com e sem pop-up, a busca só pelo título e o toque duplo; a escolha do submodo e a partida do Superfan, com os erros, as ajudas, encerrar e o fim); no checkup, o `Player` com um motor como o Web Audio (o fim do trecho chega depois do seguinte) e a prévia inteira da revelação. Sem teste: `App` e `Game` (ME39) |
| Ponta a ponta | Playwright (Chromium) na CI | Diário completo do Normal com relógio fixo e áudio fake; o Desafio digitado; recarregar no meio retoma; falha de áudio anula a rodada; virada à meia-noite de Brasília; Treino (escolha do modo, reinício com e sem confirmação, o pop-up modal e o Esc, recarregar volta à escolha); o modo por artista (a lista na ordem, um ciclo sem repetir, a busca só pelo título, a troca, o diário que tira as músicas, o toque duplo); a ajuda do diário (depois da 3ª tentativa, igual ao recarregar); o Superfan (o começo sorteado, o mesmo nos trechos seguintes, o erro de −5, encerrar, a partida sem música e o toque duplo no cartão); a home (sem fragmento, cartões, Voltar, dia sem agenda, links antigos `#musica` e `#album`) |
| Exploratório | Navegador do Claude | Visual, console e cliques durante o desenvolvimento |
| Lint e formato | Ruff (Python), Biome (TS), `tsc --noEmit` estrito | |
| Contrato Python × TS | pytest chamando o Node | Teste cruzado (M4): `normalize` e `looseKey` em TS comparados com o Python em todos os 62.034 caracteres do plano básico do Unicode 15.0 e 88.740 strings |

## Apêndice I. GitHub e CI

Implementado no M9 (repositório público `PlasmaStorm49/musicle-jp`, CI e proteção) e no M10 (deploy e agenda semanal).

- **CI** (`.github/workflows/ci.yml`), em todo PR e push na `main`, sem filtro de caminho (workflow pulado deixaria a checagem obrigatória pendente). Três tarefas, que são as checagens obrigatórias:
  - **`pipeline`:** Python 3.12 e Node 24 (o teste cruzado e o do PRNG pulam sem Node), `npm ci --prefix web` antes do pytest (o teste do hook usa o Biome), `pip install -c pipeline/constraints.txt -e "pipeline[dev]"` (versões exatas, P60; sem o extra `romaji`, cujo teste pula), Ruff, pytest, `romanize --check` e `validate` das duas paradas (fixtures e real, cada catálogo com a sua agenda) e `schedule-check` das duas agendas. O checkout tem `fetch-depth: 0`; a agenda é comparada, no PR, com o 1º pai do commit de merge de teste (`HEAD^1`, a base exata do que foi testado) e, no push, com o `before` (`HEAD^1` em branch novo). O Ruff cobre também o `.claude/hooks`, com a configuração do pipeline.
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
  - as checagens ficam presas ao GitHub Actions (`integration_id` 15368);
  - `require_extra_approval_for_unattributed_changes: true` (visto no checkup): hoje não bloqueia nada, porque o PR #10 do robô, sem revisão, entrou normalmente.
- **Repositório e Actions** (configurados no M9 por `gh api`):
  - histórico reescrito antes de publicar (P54, P58): e-mail noreply do GitHub em todos os commits e o perfil genérico no `CLAUDE.md` em todas as versões; backup em bundle, fora do repositório;
  - só actions do próprio GitHub, com pinagem por SHA obrigatória;
  - token padrão só de leitura e Actions sem poder de criar nem aprovar PR (no M10, a P64 ligou essa chave);
  - PR de colaborador externo só roda a CI depois de aprovado;
  - só merge commit, com o branch apagado depois do merge.
- **Deploy** (`.github/workflows/deploy.yml`, M10), a cada push na `main` (o merge de um PR) e sob demanda, em `https://plasmastorm49.github.io/musicle-jp/`:
  - `pages-build` (só leitura): `npm run build` com a base `/musicle-jp/`, que só vale no build e no preview (o desenvolvimento e o e2e ficam na raiz). Desde o M11, sem Python nem `fake-assets`: o site lê a parada real (`data/`), e o `dist/fixtures` é apagado depois do build. Confere o site (base, sem o motor falso, sem fixtures nem WAV, `data/catalog.json` com `provider` "apple"), avisa se a agenda não tem o dia de hoje ou tem menos de 7 dias à frente (ME14, aviso no resumo, sem travar o deploy) e sobe o artefato;
  - `pages-deploy`: `pages: write` e `id-token: write`, no ambiente `github-pages`, com regra de branch só para a `main`. Admins podem ignorar a regra (`can_admins_bypass: true`, visto no checkup); o `if: github.ref == 'refs/heads/main'` do `pages-build` compensa;
  - um deploy por vez, sem cancelar no meio. Roda junto com a CI do push, porque o `strict` do ruleset garante que a árvore do merge já foi testada no PR;
  - a tarefa `web` da CI confere a base no `dist/index.html`: sem ela, a página publicada ficaria em branco.
- **Atualização da parada e da agenda** (`.github/workflows/update-catalog.yml`, M10; com a Apple desde o PR C do M11):
  - segunda às 06:17 de Brasília (`cron: "17 9 * * 1"`: o cron é em UTC, e o minuto zero é horário de pico) e sob demanda, sem entradas;
  - `catalog-generate` (só leitura, 20 min):
    - instala o pipeline sem o extra `romaji`, que só entra quando há texto novo (abaixo, P71);
    - `fetch` da Apple, com `continue-on-error`: se a busca falhar, segue com aviso e o PR traz só a agenda;
    - o `fetch` recusa parada com mais de 100 itens, como o robô recusaria depois: o caminho é "PR só com a agenda", que não trava;
    - `romanize --provider apple` (só textos novos, sem `--refresh`) e `--check`. O extra `romaji` (250 MB) só é instalado quando o `--check` acusa texto novo;
    - o passo "Parada nova" (`romanize`, `build`, `schedule` e `validate` da parada real) tem `continue-on-error` (checkup, ME25). Se a parada nova quebrar o pipeline (um texto que o cutlet não lê, um dado estranho, distratores que não fecham), o passo "Reserva" (`.github/scripts/catalog-reserve.sh`, com teste desde a revisão de 12/10, ME52) a descarta: volta o romaji, o catálogo e a agenda da `main`, apaga o snapshot novo (nunca um que já está na `main`) e refaz só a agenda. O PR traz só os dias novos, com o aviso, e a agenda não trava toda semana enquanto a faixa estiver na parada. A saída `chart` só vira `failure` quando a reserva descartou um snapshot novo;
    - `build` e `schedule` das duas paradas: a real e a das fixtures, que só serve ao desenvolvimento e cresce junto para o `npm run dev` ter o dia de hoje;
    - `validate` das duas e `schedule-check --today` (só acréscimo, sem dia passado e os dias novos iguais aos do gerador);
    - **lista fechada** do que pode mudar (`.github/scripts/catalog-collect.sh`, com teste, ME52): o snapshot de hoje (novo), o `romaji.json` da Apple, o catálogo real e as duas agendas. Qualquer outra mudança falha. Sem mudança, termina sem PR;
    - os avisos do `build` e do `schedule` da parada real (`aviso: ...`) vão no artefato, fora da lista, para o corpo do PR;
  - `catalog-pr` (`contents: write`, `pull-requests: write`): não roda o pipeline nem instala pacotes, então um pacote comprometido do pip nunca chega perto do token que escreve.
    - Confere de novo, só com `jq`, cada arquivo do artefato (`.github/scripts/check-catalog-pr.sh`, que vem da main e tem teste: `pipeline/tests/test_catalog_pr_script.py`, que pula sem `jq` fora da CI):
      - o "hoje" calculado nesta tarefa, e o da geração (que saiu depois do `pip install`) tem de bater com ele (ME44);
      - só arquivos comuns da lista fechada, cada um com um JSON só;
      - snapshot do dia, da Apple, com até 100 faixas e depois do último da `main` (ME53);
      - romaji só de acréscimo, com o mesmo motor e sem texto vazio (ME53);
      - catálogo sem perder id, com URLs só nos hosts da Apple (regex com `\A` e `\z`) e os snapshots da main intactos, com o de hoje espelhando o arquivo do dia;
      - agendas só com dias novos em sequência (P44), até hoje + 21 (ME44);
      - `CHART=failure` com o snapshot no artefato é recusado (a reserva o apaga).
    - Monta o PR com a parada nova (faixas novas no catálogo), os dias novos, o aviso de buraco (e o de "merge hoje" quando a agenda acabou ontem: o 1º dia novo é hoje, e um merge no dia seguinte levaria um dia passado; revisão de 12/10), o aviso de parada velha (mais de 13 dias sem snapshot: a busca pode estar quebrada), o romaji novo e os avisos do pipeline para revisão, em blocos de código (título com `@` não vira menção);
    - se o PR do dia já está aberto: com o mesmo conteúdo, não faz nada; com outro (a busca falhou de manhã e voltou à tarde, ou o PR veio do robô antigo), falha em vermelho com a instrução de fechar o PR, apagar o branch e rodar de novo. Branch sem PR (aconteceu em 12/10: o GitHub deu 504 ao criar o PR) também falha, com a instrução de apagar o branch e rodar de novo;
    - envia o branch `catalogo/<data>` com o token num auxiliar de credencial (fora do `.git/config`), abre o PR e fecha o anterior que ficou sem merge;
  - o PR do `GITHUB_TOKEN` não roda a CI sozinho: as checagens esperam "Approve workflows to run" (P64). O merge humano dispara o deploy; um push feito com o `GITHUB_TOKEN` não dispararia;
  - "Allow GitHub Actions to create and approve pull requests" ligado (P64). Criar e aprovar são a mesma chave: qualquer workflow com `pull-requests: write` poderia aprovar um PR. Hoje o ruleset não exige aprovação, então a `main` não fica mais aberta; rever se um dia exigir;
  - o workflow agendado é desligado depois de 60 dias sem atividade no repositório: `gh workflow enable update-catalog.yml`;
  - o cron do GitHub pode atrasar ou ser descartado em horário de muita carga: em 12/10/2026, a 1ª segunda do robô com a Apple, ele não disparou, e o robô rodou à mão (`gh workflow run update-catalog.yml`, P108). O `catalog-runway` avisa se a agenda ficar curta;
  - `catalog-runway` (checkup, ME28; só leitura): depois das outras duas, mesmo quando elas falham (`!cancelled()`), confere a agenda da `main` com a data de Brasília calculada por ela mesma. Fica vermelha, e o GitHub manda e-mail, com menos de 10 dias à frente: numa semana normal são 14 antes do merge de segunda; com uma semana sem merge, 7. O aviso do deploy (ME14) só sai quando há deploy;
  - nenhuma tarefa nova se chama `pipeline`, `web` ou `e2e`: viraria checagem com o mesmo nome.
- **Critérios de pronto conferidos** (M9 a M11) e o checkup: `docs/HISTORICO.md`.
- **Configurações do M10** (por `gh api`, 10/10/2026):
  - Pages com origem "GitHub Actions": o `POST /pages` funcionou só com `build_type=workflow`;
  - ambiente `github-pages`: o GitHub o criou ao ligar o Pages, já com regra de branch só para a `main`;
  - a chave da P64 ligada, com o token padrão ainda só de leitura.

## Apêndice J. Worktrees (frentes em paralelo, M7 e M8)

- Ficam em `.claude/worktrees/` (ignorada no Git); sem remoto, partem do `HEAD` local.
- Cada uma precisa de `npm ci --prefix web`: o `node_modules` não é compartilhado.
- Duas frentes rodando testes ao mesmo tempo pedem memória livre: com pouca, o Git falha com "out of memory" ao criar a worktree.
- Na worktree, Vitest com `--maxWorkers=2` e nada de servidor de desenvolvimento nem de `npm run e2e`: a porta 5173 é fixa (o e2e reaproveitaria o servidor de outra pasta e testaria outro código), e o áudio sintético do `fake-assets` não está lá.
- Para o conflito no merge ser pequeno, combine antes quais trechos e chaves de texto são de cada frente (M8).
- Depois do merge: `git worktree remove` (com `git worktree unlock` antes, se estiver travada) e `git branch -d`.

## Apêndice K. Modo por artista (M13)

Uma lista curada de artistas e, para cada um, rodadas sem fim do Desafio com as músicas dele (P125), pela lógica do Treino (P116). Os dados saem do pipeline, como a parada: o romaji e a curadoria valem para a busca (S13).

- **Busca** (`fetch --artists`, só com rede, pede confirmação): um snapshot por artista em `pipeline/data/apple/artists/snapshots/<artistId>.json`, substituído a cada busca (P138):
  - o lookup de músicas do artista (até 200; traz as participações e dá a ordem das músicas);
  - os álbuns dele (só os com o artistId dele) e as músicas desses álbuns, em lotes de 50 (o limite de 200 vale por álbum);
  - o lookup dos artistas das faixas (o latino oficial);
  - pausa de 4 s entre os pedidos, também de um artista para o seguinte (a Apple documenta cerca de 20 por minuto); a falha de um artista não apaga o snapshot anterior dele.
  - Medido em 12/10/2026 na Utada: 110 músicas pelo lookup de músicas, cerca de 190 com os álbuns (sem o karaokê), contadas pelo `song_key` de hoje. A S13 registrou 92 em 11/10, com outra contagem; a diferença não foi conferida.
- **Seleção** (`artists.py`, puro): a chave da música (`artist_title_key`, o `title_key` da parada depois de tirar karaokê, inglês, THE FIRST TAKE e o crédito "(… from …)") junta as versões; a música que só existe em versão que não entra sai; a canônica segue a P132; a ordem e o teto, a P133. O `normalize.py` não muda (mexeria nos dias já jogados).
- **Curadoria** (`artists.toml`, P136): a ordem da tela, `exclude_albums` (ex.: os E-SIDE), `exclude_tracks` e `same_song`. Os avisos do `build-artists` (descartes, corte, possível música repetida) são a lista de revisão do PR.
- **Arquivos** (P129 e P130): `index.json` e um `<id>.json` por artista, cada um abaixo de 1 MB (o `validate-artists` confere, com o schema, as referências, os hosts e a forma canônica).
- **Robô semanal**: não toca em nada disso. A lista fechada dele continua a mesma, e a atualização dos artistas é à mão.
- **Imagem da lista** (P168 a P171, S23):
  - O `build-artists` grava no índice o `artworkUrl` de cada artista (`card_artwork` em `artists.py`): a capa do álbum da música de maior `popularity`, de preferência um álbum só dele. Assim o 米津玄師 fica com a de KICK BACK, e não com a de 打上花火 (DAOKO×米津玄師).
  - O `validate-artists` exige que ela seja exatamente essa, entre os álbuns do arquivo, cujos hosts ele já confere: nunca uma URL de fora. O campo novo é compatível (o código velho o ignora), sem `schemaVersion` nova.
  - Na tela (`ui/ArtistCover.tsx`), a capa só do host da Apple na lista real (`cardArtwork`, `core/artists.ts`). Sem capa, com o índice antigo do cache (sem o campo) ou se a imagem falhar, o monograma (`monogram`): a 1ª letra do nome e uma de 8 cores, todas com contraste de 4,85:1 ou mais com o branco, fixa pelo id.
  - O selo da Apple fecha a lista real, com o link da playlist da parada (P169, P170).
  - Pesquisa das opções (subagente, 12/10/2026): o lookup de artista não tem imagem; a foto da página do Apple Music (`og:image`) existe para os 8, mas os termos do site da Apple proíbem tirar conteúdo das páginas, e a licença da foto é só da Apple; a Apple Music API pede o Apple Developer Program (US$ 99 por ano) e só permite a arte junto da reprodução; o Commons tem foto livre de só 2 ou 3 dos 8.
- **Fixtures** (P139): `pipeline/fixtures/artists/`, com a tabela de casos no README de lá.
- **Dados reais** (PR B, busca de 12/10/2026, 16:15 UTC): 755 músicas.
  - YOASOBI 37, LiSA 200 (9 cortadas pelo teto), Eve 124, Ado 96, Aimer 178 e 米津玄師 120.
  - Os snapshots têm de 109 KB (YOASOBI) a 575 KB (LiSA, 671 faixas); os arquivos publicados, de 58 a 260 KB.
  - O lookup de músicas veio no limite de 200 para LiSA, Ado e Aimer: o resto vem pelos álbuns.
  - Curadoria:
    - YOASOBI: os E-SIDE 1 a 4 e 7 singles em inglês sem o sufixo (Idol, Adventure, Monotone, On the Stage, The Blessing, The Brave, The Swallow) no `exclude_albums`, e "the NOISE" (do LE SSERAFIM, com o YOASOBI creditado só pelo sample de 夜に駆ける, P160) no `exclude_tracks`;
    - LiSA: "ROCK-mode'18" (a regravação de 2018) no `same_song` de "ROCK-mode";
    - Aimer: "bL∞dy f8 -eUC-", "ninelie <cry-v>" e "i-mage <in/AR>" (o "<…>" do SawanoHiroyuki[nZk]) no `same_song`, e "After Dark -prologue-" (a abertura de 68 s, sem a música inteira na loja) no `exclude_tracks`;
    - `aliases.toml`: o latino de アドレナ ("Adorena"; o cutlet deu "Ado Rena").
  - A revisão do PR B achou versões que escaparam das regras; duas viraram regra no `artists.py`: o "-X-" grudado no nome, de uma palavra só ("Empty MERMAiD-Instrumental-"), e a versão que não entra no fim do título sem delimitador ("六等星の夜 Tvsize"). O teste `test_published_artist_titles_are_not_out_versions` recusa título publicado com instrumental, karaokê, off vocal ou TV size.
  - A pré-visualização com `?data=real` achou o crédito repetido nas participações ("DAOKO×米津玄師 & 米津玄師"): a exibição passou a ser a da loja.
- **Acréscimo de 12/10/2026** (P166, busca às 21:52 UTC): Unlimits e 松田聖子, no fim da lista. São 8 artistas e 1040 músicas.
  - Unlimits (311230779): 101 faixas em 13 álbuns, 85 músicas, sem curadoria.
  - 松田聖子 (Seiko Matsuda, 76115834; não a "Seiko" 286640008): 1545 faixas em 126 álbuns, 619 músicas pela chave do pipeline, 200 publicadas (419 cortadas pelo teto; o "414" do 1º texto era de uma volta anterior da curadoria; 416 desde a P172). É o maior snapshot (1,3 MB, fora do site); o arquivo publicado tem 255 KB.
  - Curadoria do Seiko Matsuda, em três voltas de `build-artists` até nenhuma das 200 se repetir:
    - 13 pares no `same_song` (o 1º texto dizia 11, trocado com o `exclude_tracks`; mais 3 na P172): as regravações dos 40 anos (2020 e 2021), com o ano ou um subtítulo em inglês ("青い珊瑚礁 (Blue Lagoon)", "チェリーブラッサム (2021)"), a grafia ウイ/ウィ de 天使のウィンク e faixas com o nome do álbum no título ("Romance(金色のリボン)", "(Seiko・Avenue)", "(LPテイク)");
    - 11 faixas da coletânea SEIKO STORY com o nome dela no título ("風立ちぬ(SEIKO STORY〜80's HITS COLLECTION〜)") no `exclude_tracks` (o 1º texto dizia 13), e não no `same_song`: a original tem a mesma data, e no empate da P132 o id menor (o da coletânea) seria a canônica, com o sufixo na tela.
  - **A popularidade das 200** (P172; subagentes de 12/10/2026: a contagem das músicas únicas e a ordem, comparada com a busca do iTunes e a discografia da Wikipédia japonesa):
    - LiSA: as 200 são as mais populares. Os 41 lados A estão dentro, e as 9 cortadas são faixas de álbum ou de EP.
    - Seiko Matsuda: 16 lados A ficavam de fora. O lookup de músicas só devolve 200 faixas, que cobrem 93 músicas dela (as outras posições se gastam com versões repetidas). A ordem dele concorda com a busca do iTunes (Spearman de 0,82 a 0,84) e com as vendas, mas o resto das 200 saía da reserva (álbuns e data), e a Apple põe 1980-01-01 em 264 faixas que não são de 1980.
    - A chave `singles` do `artists.toml`: uma faixa de cada lado A da discografia (85 do Seiko Matsuda, dos 100 da Wikipédia; os outros estão em outro id de artista na loja, como o 286640008, ou não estão). Entre as músicas sem posição no lookup, o single vem antes da reserva. Entraram os 16 (Shinin' Shinin', 涙のしずく, 惑星になりたい, Gone with the rain…) e saíram 13 faixas sem sinal de sucesso.
    - A faixa do `exclude_tracks` deixa a posição no lookup para a música dela (`_inherited_ranks`), pelo título sem o sufixo que a chave não tira, e só sem ele pela chave da própria faixa: outra edição da SEIKO STORY tem a mesma faixa com o mesmo sufixo, e a posição ia para essa cópia (uma música repetida entre as 200, achada na comparação antes e depois). ガラスの林檎 foi do 94º ao 30º lugar; ピンクのモーツァルト, do 97º ao 35º; 天使のウィンク, do 35º ao 14º.
    - 3 regravações com o ano sem parênteses juntaram com a original no `same_song`: 瑠璃色の地球 2003 e 2020 (single digital) e あなたに逢いたくて 2004.
    - Ficou de fora, por ora: ignorar a data 1980-01-01 no desempate (sozinha, tirava um lado A) e usar a busca do iTunes como 2º sinal (piorava: entravam covers de jazz).
  - `aliases.toml`: 28 latinos que o cutlet errou. Entre eles, a kana ウィ ignorada ("Tenshi no inku", "Intaa gaaden"), leituras erradas (風は秋色 como "shuushoku", 抱いて… como "Idaite", 七月 como "Nana gatsu", 小径 como "shoukei") e espaços partidos ("Furanji a", "Shinki rou"). As leituras sem certeza ficaram (時風の鼓動, 夢冬の彩月, 夜唄).
  - `providers/apple.py`: o latino do artista que só muda a caixa do nome ("Unlimits" no lookup, "UNLIMITS" nas faixas) não entra, e a tela deixa de mostrar "UNLIMITS · Unlimits". Valeu também para um parceiro da Aimer ("GROWN KIDS"). O catálogo da parada não mudou.
  - Hipóteses conferidas: o THE FIRST TAKE vem como " - From THE FIRST TAKE"; o filtro de álbuns deixou de 0 a 5 faixas de coletânea por artista, que nunca são a canônica; o lookup de músicas começa pelos sucessos (アイドル e 夜に駆ける; 唱 e 新時代; 打上花火 e KICK BACK), o que sustenta a P133 (indício, não prova).
- **Acréscimo de 12/10/2026, à noite** (P174, busca às 23:36 UTC): 新しい学校のリーダーズ e 幾田りら, no fim da lista. São 10 artistas e 1171 músicas.
  - Os ids, pela Search API e pelo lookup da loja JP:
    - 新しい学校のリーダーズ (ATARASHII GAKKO!, 1231338664): o único id do grupo na busca; as faixas vêm com o nome em japonês (オトナブルー, Tokyo Calling, マ人間).
    - 幾田りら (Lilas Ikuta, 1489581870): スパークル, 蒲公英, ロマンスの約束.
    - Ficaram de fora: o "Lilas" 1704820090 (o nome em japonês também é 幾田りら, mas são 9 faixas de 2021 a 2026, quase todas com título em francês, como Magnifique e Étrangère), o IKURA 1461727771 (covers de sucessos da era Shōwa, como 少女A e 異邦人) e o KANON 1825528925 (2 faixas de 2026, sem nada que o ligue ao grupo).
  - 新しい学校のリーダーズ: 103 faixas, todas no lookup de músicas, e 34 álbuns dele; 77 músicas, todas publicadas. Capa do cartão: a de オトナブルー - Single.
  - 幾田りら: 95 faixas, todas no lookup, e 30 álbuns; 54 músicas, todas publicadas. Capa do cartão: a de Answer - Single (a mais popular, おもかげ, é de milet, Aimer & 幾田りら: P168).
  - Os snapshots têm 88 KB e 82 KB; os arquivos publicados, 102 KB e 82 KB.
  - Curadoria, numa volta de `build-artists` (as outras versões, como o THE FIRST TAKE, o remix e o "Cafe Latte (English Version)", as regras já tiravam):
    - 新しい学校のリーダーズ: 恋の遮断機 no `same_song` (o single "feat. H ZETTRIO" e a faixa do álbum マエナラワナイ, "(feat.H ZETTRIO)", com o feat. colado, que a chave não tira);
    - 幾田りら: "Nameless Faces (feat. Lilas Ikuta) [英語版]", a versão em inglês do tema de 崩壊:スターレイル (o `_OUT` só conhece "English ver."), no `exclude_tracks`, e não no `same_song`: a [Japanese Ver.] tem o sufixo de versão, e a canônica seria a em inglês (P132).
  - `aliases.toml`: 18 latinos de faixa, 7 de álbum e o de uma parceria.
    - O crédito 幾田りら em 9 faixas e 4 álbuns: o cutlet leu "feat. ikuden ri ra"; ficou "feat. Lilas Ikuta" (P181).
    - O crédito 新しい学校のリーダーズ em 4 faixas e 3 álbuns: o cutlet leu "feat. atarashii gakkou no riidaazu"; ficou "feat. ATARASHII GAKKO!" (P181).
    - Leituras erradas (席替 como "Seki kae", 絶絶絶絶対聖域 como "Zezzezzezzettai"), espaços partidos ("Supaa kuru", "shadan ki") e o til fora do lugar (チラチラチラミー ~試験当日~, ロケット・トゥ・ザ・ムーン~信じた世界へ~).
    - "Sheena Ringo & ATARASHII GAKKO!" para 椎名林檎と新しい学校のリーダーズ (ドラ1独走, no id do 椎名林檎): a Apple deu só "Sheena Ringo", como no DAOKO×米津玄師.
    - As leituras sem certeza ficaram (狼の詩, 雨夜の接吻, まさ毛カンナヴァーロ, 赤春花); a leitura oficial veio num PR à parte (P184, abaixo).
  - Ficaram como estão as participações em outras línguas que estão no id dela (Plus rien, do Orelsan; Perfectos imperfectos, do Pablo Alborán; Here, Tomorrow, do League of Legends): a P115 põe as participações dentro.
- **Correção do romaji dos artistas (P184 a P189)**, 12/10/2026: só o `aliases.toml`. São 21 latinos de faixa e 21 de álbum publicados, nos 10 artistas (o índice saiu igual), e mais 12 faixas e 1 álbum dos snapshots que não estão publicados (a faixa de 若気ガイタル e os créditos abaixo).
  - Leituras oficiais (P184): 狼の詩 "Ookami no uta" (o single, a faixa de 若気ガイタル e o álbum gêmeo), まさ毛カンナヴァーロ "Masage kannavaaro", com "Masage Cannavaro" na busca (P188), e 赤春花 "Sekishunka". A loja US confirma as três ("okami no uta", "Masage Cannavaro", "Sekishunka").
  - Créditos com o nome da Apple (P185, P187): 11 faixas e 7 álbuns gêmeos (Yorushika, Aina The End, Masayuki Suzuki, Midories, Nile Rodgers, Kenshi Yonezu, Mao Abe, Wanuka, MARiA, Kenmochi Hidefumi). ミドリーズ só tem o nome em kana no lookup, nas duas lojas: ficou "Midories", como a Apple escreve em "The Swallow (feat. Midories)".
  - Os mesmos créditos nos ids não publicados (outra edição ou versão da mesma música), para o caso de a canônica mudar numa busca futura: 宇宙の季節 (ULTRAPANIC), 夢見る16歳, ツバメ (THE BOOK 2), UNFORGIVEN, NANIMONO (Digital Native e os 4 remixes), for ロンリー e o single de 小豆あらい (faixa e álbum).
  - Fora do escopo (P189): 東亰カニバリズム "Tokyo kanibarizumu" (faixa e álbum), o PALETTE4 com "Mahiru/Yukke" (まひる e ゆっけ não têm nome latino na Apple) e o "&" com espaço nos dois MEKAKUCITY.
  - A varredura dos latinos achou mais 7: os créditos com "+" do 米津玄師 (Yojiro Noda, Elaiza Ikeda, Masaki Suda e Aina The End, como no artista da faixa na loja US), o kanji que sobrou em 爱丽丝 ("Arisu", com "Alice" na busca) e em 空噪wired ("Kuusou wired") e o 」 no single do Angel Beats!.
  - Os álbuns gêmeos de faixas corrigidas antes, com o latino da faixa: スパークル, アドレナ, 絶絶絶絶対聖域, 月アカリサイレース, 私の愛 e ロケット・トゥ・ザ・ムーン. E まふまふ トリビュートアルバム 〜転生〜, que o cutlet leu "Ma fuma futoribyuuto arubamu tenshou": ficou "Mafumafu toribyuuto arubamu ~Tensei~" (まふまふ só tem kana no lookup; o nome vem do título da loja US, "Mafumafu Tribute Album -Tensei-").
  - INSPIRE -加藤ミリヤTRIBUTE- (era "Katou Miriya"): nenhum snapshot tem o id de artista de 加藤ミリヤ, e a loja US não tem o álbum. Vale o latino que a própria Apple dá ao álbum na loja JP, "INSPIRE -MILIYAH KATO TRIBUTE-" (P187).
  - Ficou para o catálogo da parada (outro arquivo, outro PR; ME80): nenhum latino exibido com os erros dos artistas; "yonetsugenshi" está só na busca do artista 米津玄師, ao lado de "kenshiyonezu". Dois créditos com o nome lido por máquina: 点描の唄 (feat. 井上苑子), "Inoue Sonoko", e 罪と罰と雨とキス (佐野勇斗&吉田仁人), "Sano Hayato & Yoshida Jinto" (a loja US escreve "Hayato Sano & Jinto Yoshida").
  - As outras leituras erradas do cutlet, fora dos créditos, ficaram para a ME81.
- **De fora do Japão (P199 a P203)**, 13/10/2026, branch `m13-de-fora-do-japao`: Bolbbalgan4 e System of a Down, pedidos por amigos do usuário, numa seção embaixo da lista. São 12 artistas e 1334 músicas.
  - **A seção** (P200, P201):
    - a chave opcional `section = "foreign"` no `artists.toml`, a única aceita (`SECTIONS`, em `artists.py`);
    - o `build-artists` grava a `section` só nesses e põe a seção depois da lista principal, em ordem alfabética (`section_order`: o nome normalizado, ou o latino quando o nome não é latino, e o id no empate); o `validate-artists` recusa o índice fora dessa ordem;
    - o schema ganhou o campo opcional, sem `schemaVersion` nova: o `loadArtistList` não recusa chave desconhecida, e o site antigo mostra todos numa lista só, com os de fora no fim;
    - na tela, o `artistSections` (`core/artists.ts`) divide a lista, e a seção vem num `<section>` com o `h2` "De fora do Japão", antes do selo da Apple. Os ids dos cartões seguem a posição no índice, e uma seção que o código não conhece fica na principal;
    - nas fixtures, Re:Pulse (ar11) e Hoshizora Drive (ar06), nessa ordem no `artists.toml`: o índice os inverte, e o e2e confere.
  - **A busca** (13/10/2026, 23:38 UTC, só os dois ids):
    - Bolbbalgan4 (1188975595; o lookup chama de "BOL4", as faixas de "Bolbbalgan4"): 183 faixas em 47 álbuns; 87 músicas publicadas;
    - System of a Down (462715): 236 faixas em 23 álbuns, com o lookup de músicas no limite de 200; 76 músicas. Nenhum dos dois passa do teto, e a lista `singles` (P172) não precisou.
  - **Curadoria do Bolbbalgan4:**
    - a loja JP tem duas edições dos mesmos EPs: a de 2016 a 2020, em inglês, e a reedição (ids 1695…), em hangul, com o mesmo álbum, a mesma posição e a mesma duração. As 10 reedições vão para o `exclude_albums` (P202);
    - 12 faixas no `exclude_tracks`: as do RED ICKLE em hangul que repetem o RED PLANET (com o id menor, a de 2016 seria a canônica), "가끔씩 (우지윤의 보컬 스틸)" e "RED PLANET (Hidden Track) - 좋다고 말해" (ficam as da reedição, de título limpo, e a posição no lookup passa para elas), "남이 될 수 있을까" (We Loved) e o "LOVE" do EP japonês, creditado a "赤頬思春期", que a chave junta com o "Love" coreano de 2023 (0,1 s de diferença; achado no `/code-review`: a mais antiga seria a canônica, ao contrário das outras versões japonesas);
    - 8 pares no `same_song`: as 7 versões japonesas (2019 e 2020) com a original coreana, que fica a canônica, e o tema da novela com o título em outra ordem;
    - `aliases.toml`: o hangul de 24 músicas em inglês na busca, e o título coreano de Farewell Restaurant (이별맛집, do Bugs);
    - a leitura pela Romanização Revisada do que só existe em hangul (P203), conferida na norma (a cópia do Wikisource; o site do 국립국어원 não abriu) e no Wiktionary: "Jotago malhae (Hidden Track)", "Gakkeumssik" e "Sangnamjaui gobaek (feat. BOL4)" (a faixa e o álbum). "Tell Me You Love Me" (Wikipédia, MAMA 2017 e a Apple US para 好きだと言って) entra na busca; as traduções sem fonte oficial ("Occasionally", "A Man's Confession") ficaram de fora;
    - o duo 소심한 오빠들 tem nome em latim na própria Apple, "Sosimboys" na loja US para o mesmo id: vale ele (P187), e não a leitura.
  - **Curadoria do System of a Down:** "Fuck the System" com a clean "F**k The System (**** The System)" e "Streamline" com "ストリームライン" (o título da trilha na loja JP) no `same_song`; "Soldier Side - Intro" (a abertura, como o "After Dark -prologue-" da Aimer) e uma faixa do DJ Starscream creditada a ele no `exclude_tracks`.
  - **O pipeline** (os 10 artistas de antes e as fixtures não mudaram, pelo `build-artists`):
    - ME85, no `artists.py`: o " - " dentro de um parêntese não conta como sufixo ("Sugar (Live at Irving Plaza, NYC, NY - January 1999)" sai como ao vivo); "(Mixed)" e o álbum "(DJ Mix)" saem; "(Clean)" é versão da mesma música. Antes, 22 faixas passavam como originais;
    - ME84: o cutlet não lê hangul (devolve igual, ou só sem os espaços), e o `Curation.latin` passou a recusar leitura com letra fora de a-z. O `romanize` avisa, e a leitura fica no cache, para a busca. O catálogo da parada não mudou: as 3 leituras parciais de antes já tinham o latino à mão.
  - **A tela:** o `langOf` dá `lang="ko"` ao texto com hangul, e o latino do artista (ME55) vale também para o nome em hangul: o "Sosimboys" ficava de fora, porque o `artistLatinOf` só olhava o japonês (achado no `revisor` e no `/code-review`). A Noto Sans JP não tem as sílabas hangul (nenhuma faixa do `unicode-range` cobre U+AC00 a U+D7A3), e o navegador usa a fonte do sistema nelas.
  - **Conferido com a parada real** (`?data=real`): uma rodada do Livre de cada um, com a prévia do servidor de áudio da Apple; "우주를" sugere "Galaxy".
- **Web** (PR C):
  - Aba `#artistas`, na nav e na home até o site ficar público (P117, P126): um `<li>` da nav e um cartão, fáceis de tirar.
  - A lista carrega ao entrar na aba e cada artista ao ser escolhido (`loadArtistList` e `loadArtist`, em `data/source.ts`, com `no-cache` e a versão de cada arquivo); o estado (`useArtistStore`) fica no `App`, então trocar de aba não perde a sessão, e recarregar volta à lista (P116). Uma falha mostra "Tentar de novo" só na aba (P144).
  - A sessão é a do Treino no Desafio (`PracticeRun`), com o título do artista (o latino ao lado, como na ME55), o campo "Nome da música" e "Trocar de artista", que volta à lista e, com rodada jogada, pergunta antes (P127, P146).
  - Exclusão (P141, `core/artists.ts`): sai do sorteio a música com algum `titleKey` igual ao título de uma resposta pendente dos diários de hoje (pega a participação, o crédito e a versão), ou de um álbum que entregaria a resposta. O sorteio ainda pula, no índice do artista, os álbuns dessas músicas (o `answerAlbums` do Treino): as outras músicas do mesmo álbum e as de um lançamento de mesmo nome só do arquivo do artista também saem, até o diário terminar. É o lado seguro, porque a revelação mostra o álbum (revisão do PR C; nos dados de 11 a 14/10 o efeito é zero, porque as canônicas são singles).
  - Prévias (P142): um resolvedor por artista, com a mesma reserva do catálogo, e um orçamento só (`LookupBudget`, em `data/previews.ts`) para todos: a cota de 12 por minuto e o disjuntor valem para a sessão inteira. Medido na pré-visualização: uma consulta por rodada, com a atual e a próxima.
  - O selo da rodada continua com a playlist da parada (P145).
- **Superfan** (ME61, branch `m13-superfan`):
  - Escolher o artista leva à escolha do submodo (P161): "Livre" (o sem fim de antes, S20) ou "Superfan", com as regras na descrição do cartão (P120: na dúvida, pule ou peça ajuda).
  - A partida (`core/superfan.ts`) usa o saco do Treino com a variante `superfan`: cada música uma vez (acaba quando o saco daria a volta), na ordem sorteada da sessão. Os erros e as ajudas são contados na partida; o 3º erro encerra a música na hora, e o botão leva ao resultado. "Encerrar a partida" pergunta antes, se há algo a perder; a música em jogo termina como desistida, e os erros dela contam, sem os −2 de desistir (P186). Com os 3 erros já cometidos (a revelação do último na tela), encerrar é o fim por erros. A música anulada por falha de áudio devolve os erros e a ajuda dela (P162).
  - O trecho começa num segundo sorteado da prévia (`superfanOffset`): até a duração menos 9 s e 2 s de folga do fade, 19 s numa de 30 s. Os dois motores de áudio já tocavam a partir de um `offset`.
  - A revelação mostra o acerto e os erros à parte ("Acertou! 2 de 3 pontos.", "1 erro: -5 pontos."); com a ajuda, "Acertou com ajuda: 0 pontos." (o texto vale para todo modo); ao desistir, "Desistiu: -2 pontos." (P186).
  - A revelação do 3º erro diz que a partida acabou ("3 erros: a partida acabou. Veja o resultado."), e o áudio da música seguinte sai do motor.
  - O fim da partida diz o motivo (3 erros, encerrada, todas tocaram ou nenhuma música para sortear, com as de hoje de fora), o placar e os acertos, com "Jogar de novo" e "Trocar de artista". O cartão da home mostra o placar da partida em jogo, em músicas ("-7 pontos em 2 músicas").

## Apêndice L. Identidade visual (M12)

**Origem:** um style guide feito por um designer conhecido do usuário, em SVG (os vetores) e PNG (como os vetores ficam na tela), entregue em 12/10/2026. O SVG entra no repositório, em `docs/identidade/` (P195); o PNG fica com o usuário. As respostas do designer às perguntas da análise (PD1 a PD13, 13/10/2026):

- **PD1:** os tamanhos seguem o site de hoje, não os números do SVG (o botão do SVG é grande, mas na tela fica proporcional).
- **PD2:** peso Regular, mantendo os tamanhos e a hierarquia do beta.
- **PD3 a PD5:** o "ate music" e o 当 foram desenhados à mão e servem só ao logo.
- **PD6:** o sol, a lua, o compartilhar e as estatísticas virão depois; o resto dos ícones fica como no beta.
- **PD7 e PD8:** os entalhes do X e do chevron são estilo, e não defeito (o usuário confirmou). A PD7 (os estados dos botões) ficou sem resposta: o Claude definiu, dentro dos tokens (PR C).
- **PD9:** o logo horizontal não entra agora.
- **PD10:** o verde é só para o acerto.
- **PD11:** o nome sem espaço está aprovado (P179).
- **PD12 e PD13:** a área de respiro, o tamanho mínimo, a versão opaca do selo e a intenção para o escuro ainda vão chegar.

**A paleta:** vermelho `#EA3829`, oliva `#BDBF7F`, branco, cinza `#D7D8DC` e preto. O verde `#54941C` do ✓ fica fora da paleta, só para o acerto.

**Os tokens** (`web/src/ui/styles.css`, PR A). O claro usa a paleta onde o contraste deixa (P192): o branco, o preto, o cinza `#D7D8DC` das bordas, o oliva e o vermelho da marca. Para texto, o vermelho e o verde escurecem um tom (`#DE3527`, 4,52, e `#4B8419`, 4,55; os da paleta dariam 4,12 e 3,73). Os cinzas intermediários (`--muted`, `--border-strong`, `--surface-2`), o oliva das linhas (`--accent-line`) e os fundos tingidos são derivados. No escuro, o fundo é o preto da paleta, e os cartões ganham tons derivados para ter elevação. O contraste de cada par (4,5 para texto, 3 para borda, foco, barra e ícone) é travado pelo `web/scripts/theme.test.ts`:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` / `--surface` / `--surface-2` | `#FFFFFF` / `#FFFFFF` / `#F1F1F3` | `#000000` / `#1F1F22` / `#2A2A2E` | página, cartões, blocos e sugestão ativa (o `--surface-2` saiu no PR D3, sem uso) |
| `--border` / `--border-strong` | `#D7D8DC` / `#939497` | `#2A2A2E` / `#6E6F74` | borda decorativa; borda de campo e de botão (3,03 e 3,28) |
| `--text` / `--muted` | `#000000` / `#6D6E70` | `#D7D8DC` / `#9A9BA0` | texto e texto secundário |
| `--primary` e `--on-primary` | `#BDBF7F` e `#000000` | iguais | botão principal (10,92) |
| `--primary-hover` | `#A9AB6E` | `#D0D29C` | o botão principal com o mouse em cima (o texto preto a 8,74 e 13,38; PR C) |
| `--accent-line` | `#969865` | `#BDBF7F` | aba ativa, hover, sugestão |
| `--focus` | `#000000` | `#D7D8DC` | foco do teclado |
| vermelho da marca | `#EA3829` | igual | o selo e o favicon, que são imagens (os tokens `--brand` e `--on-brand` saíram no PR B) |
| `--ok` / `--bad` | `#4B8419` / `#DE3527` | `#57961F` / `#EC4F42` | acerto e erro (texto e borda) |
| `--ok-soft` / `--bad-soft` | `#F0F6E9` / `#FEF2F0` | `#1B2A10` / `#3A1714` | fundo das linhas de acerto e erro (o `--muted` sobre eles dá 4,63 e 4,66) |
| `--warn` / `--warn-soft` | `#8A5A00` / `#FFF1D6` | `#E0A84A` / `#33270F` | avisos (5,31 e 6,86) |
| `--bar-track` / `--bar-open` / `--bar-play` | `#939497` / `#000000` / `#DE3527` | `#6E6F74` / `#D7D8DC` / `#DE3527` | a barra do trecho (ME30): o trilho tem 3:1 contra o cartão, para a parte travada aparecer |
| `--emoji-bg` / `--emoji-text` | transparente / `#000000` | `#D7D8DC` / `#000000` | o fundo claro do ⬛ no escuro |
| `--bucket` / `--bucket-today` | `#939497` / `#DE3527` | `#6E6F74` / `#EC4F42` | a distribuição de pontos |

**Regras que a conta impôs:**
- O oliva nunca é texto: no branco, dá 1,92.
- O vermelho fica com a marca, o erro e o que já tocou da barra; o oliva, com a ação.
- Texto colorido sobre fundo tingido só com o par na lista do teste, a 4,5: o aviso passa (`--warn` sobre `--warn-soft`), mas o erro sobre o rosado dá 3,95. Nas linhas de acerto e erro, o texto é o normal, e a cor vai na borda e no ícone. O texto secundário dessas linhas (o latino e o artista) pediu os fundos mais claros da tabela: com o `#FDECEA` de antes, dava 4,46 (revisor e `/code-review` do PR A).
- No escuro, o ⬛ da prévia e da cópia à mão do compartilhar ganha um fundo claro (`--emoji-bg`). Nas tentativas, desde o PR C, vão os ícones do designer, que não somem.
- O selo da Apple fica a versão preta nos dois temas, sem alteração (P81): no escuro, o filete cinza dele o separa do fundo. Não há regra oficial para fundo escuro (ME82).

**O CSS dos temas:** o claro no `:root`; o escuro em dois blocos iguais, o do `@media (prefers-color-scheme: dark)` com `:root:not([data-theme="light"])` (o Automático, só CSS) e o `:root[data-theme="dark"]` (a troca). O `color-scheme` acompanha, para os campos, o `<dialog>` e as barras de rolagem.

**A fonte (P175):** `@fontsource/noto-sans-jp` 5.3.0 (o mais novo com 14 dias), só os pesos 400 e 700 (os 600 de antes viraram 700). Cada peso tem 124 fatias por `unicode-range`, e o navegador baixa só as dos caracteres da tela (15 fatias woff2 na lista de artistas, medido no navegador do Claude). No build, as fontes somam 13 MB no `dist` (5,9 MB de woff2 e 7,5 MB de woff, que nenhum navegador atual baixa), e o CSS principal passa a 224 kB (74 kB comprimido), pelos `unicode-range` (S33). A licença é a OFL 1.1, que deixa redistribuir a fonte com o aviso de direitos e a licença nos campos de metadados do próprio arquivo, e os woff2 do pacote os trazem (hipótese conferida só pela regra da licença, não arquivo a arquivo).

**A troca de tema (P176, P191; o switch desde a P217):** três rádios no fim da Início, até o switch claro e escuro, que veio depois do M12. A escolha fica na chave `musicle-jp:theme` (`src/storage/theme.ts`), fora do save: sem `updateSave` nem `SAVE_SCHEMA_VERSION`. O `src/ui/theme.ts` aplica o `data-theme` no `<html>` e o `theme-color` da barra do navegador. Um script curto no `<head>` do `index.html` lê a mesma chave antes da pintura, para quem escolheu Escuro num aparelho claro não ver a página clara por um instante.

**Logo, selos e ícones de app (PR B):** as peças saem do `docs/identidade/style-guide.svg`, o arquivo do designer guardado sem alteração (P195). O `docs/identidade/README.md` tem a tabela dos índices de cada peça e o jeito de extrair: o caminho fica igual ao do guia, e só o `viewBox` recorta.
- **Topo da Início (P193):** o selo redondo vermelho com o 当 vazado (`web/src/ui/assets/logo-selo.svg`), ao lado do nome em texto, como o rascunho A da P95 (o círculo vermelho). O círculo é vermelho nos dois temas (P177; no selo, o 当 é o furo), e o furo mostra o fundo da página, então o selo serve aos dois temas sem regra nenhuma. Com 2,9 kB, o Vite o embute no código.
- **Favicon:** o selo quadrado, opaco (`web/public/favicon.svg`).
- **Ícone de app do iPhone:** o selo quadrado, opaco e sem cantos (`web/public/apple-touch-icon.png`, 180 × 180, RGB, sem canal de transparência).
- **O `docs/identidade/extrair-pecas.cjs`** tira as peças do guia (rode à mão quando ele mudar; não roda na CI).
- **O logo empilhado com o nome sem espaço (P179):** fica em `docs/identidade/logo-empilhado-atemusic.svg`, para o designer conferir. Ele ainda não está no site (S34).
- **O `web/scripts/identity.test.ts`** confere que o selo e o favicon trazem o caminho do guia, que o ícone de app tem 180 × 180 e que o `index.html` cita os dois ícones que existem em `public/`.
- **Os tokens `--brand` e `--on-brand` saíram:** o vermelho da marca vive nas imagens. Os monogramas ficam com as 8 cores (P194).

**Ícones e estados dos botões (PR C):**
- **Os ícones do designer entram nas tentativas do Desafio (P196):** o X errou, o chevron pulou (em cinza, P197) e o ✓ acertou, no lugar dos emojis ❌, ⬛ e ✅.
  - O `ui/Icon.tsx` desenha um `<svg>` decorativo (`aria-hidden`) com `fill="currentColor"`. A cor vem do CSS por tema: `--bad`, `--muted` e `--ok`.
  - Os caminhos ficam em `ui/assets/icons.ts`, gerado pelo `docs/identidade/extrair-pecas.cjs` a partir dos `path[33]`, `[35]` e `[42]` do guia. O `scripts/identity.test.ts` confere.
  - O texto de compartilhar, a prévia dele e o ✓ das abas continuam com os símbolos de texto.
- **Os estados dos botões (a PD7 ficou sem resposta, então o Claude definiu, dentro dos tokens):**
  - **Passar o mouse:** só em `@media (hover: hover)`, porque no celular o hover fica preso depois do toque. O botão principal vai para o `--primary-hover` (`#A9AB6E` no claro, com o texto preto a 8,74; `#D0D29C` no escuro, a 13,38). Os outros ganham o fundo `--surface-2` e a borda na cor do texto, porque o fundo sozinho muda pouco (1,13:1 no claro). Os cartões da Início e do Treino ganham a borda oliva.
  - **Pressionado:** o botão desce 1 px. Raro: se o clique cair no 1 px de cima, o botão sai de baixo do ponteiro e o clique se perde (revisor do PR C; aceito).
  - **Desativado:** opacidade de 0,6, sem hover.
  - **Foco:** o `--focus` do PR A.

**A interface nova (PR D, plano de 18/10/2026, P204 a P214).** O pedido: uma reforma grande, minimalista, na linha e na paleta do designer, com o mínimo de rolagem e os itens centralizados. Antes, nenhuma tela era centralizada na vertical, e em 375 × 667 rolavam o resumo (565 px), a Início (258), a revelação do Normal (133) e o Treino Normal (127 a 146); na parada real, o selo da Apple somava ~102 px a cada rodada (medição de três subagentes Explore).
- **O conceito, 間 (ma), o intervalo:** um palco por tela, no centro da altura; chapado e sem caixa (o controle se marca por uma tinta, e não por borda); uma cor por função (o vermelho é a marca e o que toca, o oliva a única ação principal, o cinza a estrutura, o verde só o acerto); escala curta (5 tamanhos de fonte, o Regular como base); as peças do designer como pontuação.
- **O protótipo (P207, P208):** um Artifact privado (https://claude.ai/artifact/Spk21RdnxwYhntWzx9dx4V) com o HTML real de 15 estados do jogo, capturados do servidor de desenvolvimento, e o CSS novo escrito contra as classes do app. Em 375 × 667, as 15 cabiam (eram 3 com o selo da Apple); em 360 × 640, 13 (a ajuda do Desafio rolava 22 px, e o Treino Normal, 18). A medição dele achou o que a conta não achava: a reserva das 6 tentativas valendo também com a ajuda aberta, o "Reiniciar o Treino" quebrando em duas linhas e o "Cancelar" do pop-up sumindo no escuro.
- **Os tokens novos:** espaço `--sp-1` a `--sp-7` (4 a 48), tipo `--t-xs` a `--t-xl` (12, 14, 16, 20 e 32 px), alturas (`--h-control` 44, `--h-field` 48, `--h-hero` 56, `--h-row` 64, `--h-compact` 28, que era 32 até o D2), as alturas de linha de cada tamanho (`--lh-xs` a `--lh-xl`: 16, 20, 24, 28 e 40; e `--lh-dense`, 18, para o romaji e o artista nas listas), raios do guia (o canto do botão é 25% da altura: 11, 12 e 14; o do selo quadrado, 21%: 20 nos cartões), movimento (120 e 200 ms) e as cores `--fill` e `--fill-press` (a tinta dos controles: `#F1F1F3` e `#E6E7EA` no claro, `#1F1F22` e `#2A2A2E` no escuro), `--primary-press` e `--hairline`. O `--muted` do claro escurece um tom (`#636467`): sobre a tinta pressionada, o de antes dava 4,05. Os pares novos estão no `PAIRS`.
- **O shell:** o `#app` em coluna com a altura da tela (`100svh`, e não `dvh`, para a tela não pular quando a barra do Safari recolhe); a raiz de cada tela leva a classe `.screen`, em que o 1º filho tem `margin-top: auto` e o último `margin-bottom: auto` (quando o conteúdo não cabe, a margem vira 0 e a página rola do topo, sem cortar nada); dentro dela, o espaço é o `gap`, e as margens zeram. O selo da Apple fica pregado no pé, ainda o último elemento (P112), a 24 px pelo menos do botão de cima (ME58). Padding com a `safe-area`.
- **Os botões:** chapados, sem borda, com a tinta; o principal com 56 px e o canto de 14; o "Não sei", o "Desistir" e o "Voltar à lista" só em texto sublinhado (ME57). Pressionado: um anel por dentro, sem o `translateY` do PR C (que podia perder o clique). A tinta contra o fundo tem ~1,13:1 no claro e ~1,2:1 no escuro (a borda de antes, 3:1): quem identifica o botão é o texto, e a forma é só reforço. É a troca do desenho aprovado (P208), aceita no `/code-review` do D1.
- **O selo da Apple:** 32 px (a regra pede 30 ou mais), numa linha, com a frase de cortesia ao lado.
- **PR D1 (a fundação e as telas de escolha):** os tokens, os botões, a nav, o palco, o selo da Apple, o pop-up e as telas de escolha: a Início (o selo, o nome e a frase no centro; os 4 jogos numa grade 2×2, com o diário por jogar em oliva; o "Como funciona" num `<details>`; o tema num controle segmentado, com os mesmos 3 rádios), o Treino, a lista de artistas (P211), o submodo, o fim do Superfan e os avisos. As rodadas, a revelação e o resumo seguem com o desenho de antes (a seção 4 do `styles.css`) até o D2 e o D3, só com os botões e a nav novos; dentro das caixas de antes, o botão ganha um tom acima, para não sumir no escuro. O e2e `layout.spec.ts` confere que as telas do D1 cabem nos dois tamanhos de contrato (P214), também a Início no caso mais alto (os dois diários terminados e as duas sessões com placar: sobram 19 px em 360 × 640, depois de o estado do cartão virar legenda e o espaço entre os blocos cair para 16 px), que nada rola para o lado em 320 px e que a nav, o tema e o "Como funciona" têm alvo de 44 px (o selo da nav, 44 × 44); o `appleArtistList` (do `helpers.ts`) serve a lista como se fosse a da Apple, com o selo, sem rede.
- **PR D2 (as rodadas):** o diário, o Treino, o Livre e o Superfan no palco (a classe `.screen` vem do `roundScreen`, só com a rodada em jogo ou anulada: a revelação só vira palco no D3, e só a classe muda, sem remontar nada, ME39). Pelas regras que divide com a rodada, a revelação já ganha o título das opções sem negrito, a capa de 48 e as tentativas compactas; o resto dela fica para o D3. O cabeçalho do diário numa linha; o da sessão numa faixa (o título; a rodada e o placar; o botão de sair curto, "Reiniciar", "Trocar" e "Encerrar", com o nome inteiro para o leitor de tela, P210: com o "Trocar de artista" inteiro, o placar do Livre saía cortado em 360 px). O player sem caixa, com a barra de 12 px e os dois botões de 56 lado a lado; a pílula da explícita vai para a linha da barra, ainda antes do Tocar (P31). As opções do Normal em linhas de 64 px com capa de 48, o título sem corte (P212). No Desafio: a pergunta e a contagem numa linha; a dica do campo numa linha (as setas e o Enter ficam para o leitor de tela); a altura das tentativas reservada pelas que cabem em jogo (`--slots`: o máximo do modo menos 1, porque a última tentativa encerra a rodada), para o Tocar e o Desistir não andarem; a lista de sugestões e o "Nada encontrado." flutuam (no celular, abrem para cima); a ajuda numa grade 2×2, que tira a reserva, com a dica curta na tela ("Errar encerra; acertar vale 1 ponto.") e a inteira para o leitor de tela (P210); o "Pedir ajuda" de novo destacado, pelo negrito e por um fio na cor do texto (o `--border-strong` não dá 3:1 sobre a tinta). Duas mudanças sobre o protótipo, medidas com o selo da Apple simulado: o selo da Apple não quebra mais a linha (no D1, em 360 px, a frase descia para baixo dele: ~40 px), e a linha das tentativas passou de 32 para 28 px. E uma decisão do D2 (P215): as sugestões mantêm o romaji, que o protótipo escondia. Com o selo da Apple, cabem nos dois tamanhos de contrato:
  - o Normal, também com a explícita e com um título de álbum em duas linhas (o espaço entre as opções caiu para 4 px por isso);
  - o Desafio, até a última tentativa;
  - as sessões do Desafio, também com a explícita e com o artista de nome mais longo (新しい学校のリーダーズ, cujo título quebra em duas linhas);
  - o Superfan;
  - a ajuda pedida com 3 tentativas.

  A menor folga é de 6 px em 360 × 640. Na parada real (`?data=real`, 8 dias, de 20/10 a 27/10), o Normal e o Desafio cabem nos dois. Rolam, como o plano previa:
  - a ajuda com mais pulos depois dela (5 tentativas: 25 px em 375 e 52 em 360);
  - o Treino depois da 10ª rodada, em 360 (16 px): o placar quebra a linha, em vez de sumir nas reticências.

  O e2e `layout.spec.ts` confere isso com o `appleCatalog` do `helpers.ts` (o catálogo e os artistas com o provedor da Apple, sem rede), o Desafio da sessão com a explícita, a ajuda do diário com 3 tentativas, o cabeçalho das sessões em 320 px (sem texto cortado nem por cima do botão), que o Tocar não anda da 1ª à última tentativa, que a lista aberta e o "Nada encontrado." não mudam a altura da página, que o Normal com um título em duas linhas cabe e que um título de 89 caracteres quebra a linha, sem corte nem rolagem para o lado.
- **PR D3 (a revelação e o resumo):** toda tela agora é palco: a raiz das rodadas é sempre a `.screen` (o `roundScreen` do D2 saiu) e o resumo do dia ganhou uma raiz. A revelação: o ✓ ou o X no resultado (P206); as opções marcadas em linhas compactas, com a miniatura de 32 e o ícone no lugar da etiqueta ("Resposta certa" e "Sua escolha" ficam para o leitor de tela; as linhas não são botões e têm a altura da miniatura); o cartão da resposta com a capa de 96; o chevron no botão de seguir (também no da rodada anulada); o selo da Apple fora da seção, o último filho do palco, pregado no pé. O resumo: o placar grande, as 3 rodadas em células (a rodada, o ✓ ou o X e os pontos, com "· ajuda" quando ela foi pedida; a frase inteira para o leitor de tela), o compartilhar sem a prévia do texto (as células já mostram o resultado; o "Copiado!" aparece no botão por 2 s, só na tela, e o nome dele não muda: quem usa leitor de tela ouve a frase inteira uma vez, pelo aria-live; com o `singleClick`, que faltava) e, quando sai o novo diário, o "Jogar o novo diário" como o único botão oliva, lado a lado com o compartilhar (a frase do aviso fica para o leitor de tela; sem isso, o resumo rolava 52 px em 360), e com o `singleClick`, porque ele recarrega a página. As estatísticas: os 4 números numa fileira e a distribuição em 19 colunas (ME77), com o eixo só no 0, 6, 12, 18 e no de hoje, e a contagem só em cima da coluna de hoje. No computador (a partir de 960 px), a revelação e o resumo em duas colunas. A seção "telas de antes" do `styles.css` saiu, com a regra provisória dos botões, as margens de base que o palco sempre zera e os tokens sem uso (`--radius` e `--surface-2`, com os pares dele no `PAIRS`); a coluna larga virou o token `--column-wide` (880 px). Com o selo da Apple simulado, cabem em 375 × 667 e 360 × 640 (e, na medição à parte, em 320 × 640) a revelação do Normal (também com a explícita e com títulos em duas linhas), a do Desafio com 5 e com 6 tentativas, a do Superfan e o resumo (também com o novo diário); a menor folga é de 6 px em 360. O `layout.spec.ts` confere, nos dois tamanhos de contrato, a revelação do Normal com a explícita, a do Desafio com 5 tentativas, o resumo e o resumo com o novo diário; e, em 1280 px, as duas colunas.
- **Depois do M12, o switch de tema e os ícones provisórios (P217, P218, 21/10/2026):** o pedido do usuário foi um switch com ícones, sem o Automático. A troca de tema é um botão com `role="switch"` (o nome é "Tema escuro"; ligado é o escuro), com o sol, a trilha e a lua; sem escolha salva, ele mostra o tema do aparelho (`deviceTheme`, pelo `matchMedia`), e o `useTheme` acompanha a troca do aparelho e a de outra aba. O clique passa pelo `singleClick`, porque um botão que alterna voltaria no 2º clique de um toque duplo (era por isso que eram rádios). O armazenamento, o script do `index.html` e os blocos de cor não mudam: sem a chave, o CSS segue o aparelho; a tela só grava o claro ou o escuro. Os 4 ícones provisórios saíram de um script (uma linha central com espessura variável, as pontas cortadas, um tremor de semente fixa e a fenda de brilho, um furo pelo sentido contrário do contorno), ficam em `web/src/ui/assets/provisional-icons.ts` (o nome em inglês veio na revisão, ME99; o gerador é o `docs/identidade/provisional-icons.mjs`) e passam pelo mesmo `Icon`.
- **Depois do M12, a barra de volume (P216, P219, 21/10/2026):** um botão de alto-falante no fim do `.player-actions` abre a barra, que flutua sobre a linha da barra de trechos (`position: absolute`) e não muda a altura da página (o `layout.spec.ts` confere). A barra vai de 0 a 100%, de 5 em 5; o ganho é o quadrado dela (`core/volume.ts`), e no 0% o botão mostra o alto-falante mudo. O Web Audio ganhou um ganho mestre, criado no `unlock` (regra 9), e o ganho de cada reprodução, o do fade, liga-se nele; o `setVolume` desliza o mestre em cerca de 15 ms, para não estalar com o som tocando. O `<audio>` de reserva usa o `volume` do elemento (hipótese: o iPhone o ignora; lá vale o Web Audio, o motor normal). O composto (`fallback.ts`) repassa aos dois motores. O valor fica na chave `musicle-jp:volume`, fora do save, e o motor nasce com ele (`EngineOptions.volume`). A revisão do switch e do volume ficou para um PR à parte, a pedido do usuário, para os dois saírem logo.

## Apêndice M. O Anime (M14)

A categoria Anime (ME97, P230 a P256): 6 diários por dia, de 3 rodadas digitadas, com as regras do Desafio (a pontuação vai ser repensada depois, ME107).

### O pipeline (PR A1)

- **A fonte:** os snapshots do `fetch --anime` (`pipeline/data/apple/anime/snapshots/<id>.json`, um por busca, só crescem; o id é o instante da busca sem os dois-pontos, `2026-10-21T231005Z`). Cada snapshot guarda:
  - os animes tentados: o id do MAL, o slug, o nome e os sinônimos (do AnimeThemes), o ano, as séries (as franquias, P234) e o nível do MAL (P254);
  - os temas de cada um: o tipo (OP, ED ou IN), o número, o título e os artistas do AnimeThemes, os níveis do tema e o resultado da busca (`matched`, `no-artist`, `no-match`, `ambiguous` ou `no-preview`), com a faixa só no `matched`;
  - as respostas aparadas da Apple só das faixas escolhidas (o mapeamento fica na leitura, `map_track`, P72), os nomes oficiais dos artistas e a resolução de cada artista do tema (o único cache que cabe).
- **As fixtures:** `pipeline/fixtures/anime/anime_fixture.json`, com 15 animes fictícios que citam as faixas da parada fictícia pelo id (o `fake-assets` já gera o áudio), e o `aliases.toml` dele. Há uma franquia com duas temporadas (Hoshizora Kaizoku) e temas sem faixa (`no-preview`, `no-match` e `no-artist`).
- **O casamento** (`anime.match_theme`, puro; o `fetch --anime` o chama com o cutlet): dentro da discografia do artista do tema (P242), agrupada pela chave do modo por artista (`artist_title_key`):
  1. o título igual, pela chave da busca (o japonês contra o japonês, o romaji contra o romaji);
  2. senão, o mais parecido (`SequenceMatcher` sobre as chaves, só entre chaves de comprimento parecido, até 15% de diferença), só com nota de 0,6 ou mais, folga de 0,25 para a 2ª música (P246) e um lançamento de um ano antes a dois depois da estreia (sem o ano, só o título igual). "Gurenge" (o AnimeThemes) contra "Gurenka" (o cutlet lê 紅蓮華 assim) dá 0,71, e a 2ª música da LiSA fica longe;
  3. dois títulos iguais (o mesmo nome em dois artistas homônimos) são `ambiguous`: na dúvida, descarta.
  - As versões que nunca entram (karaokê, ao vivo...) ficam de fora; a TV size é a reserva (P244). A versão escolhida é a canônica do modo por artista, entre as que tocam.
- **As faixas** (P240, P252): o nível do tema (o AnisongDB, senão as playlists do AnimeThemes) e o do anime (o MAL) dão um nível por modo; no "acertar o anime", o do tema pesa o dobro, porque é a taxa de acerto do próprio Anime Music Quiz. Nível 7 ou mais é Fácil, 4 ou mais é Médio, o resto é Difícil (provisórios no C1; calibrados no C2, e depois constantes). O encerramento só fica no Fácil com nível 9; a insert song, só no Difícil. Sem nível nenhum: a abertura no Médio, o resto no Difícil. O encerramento no Fácil olha o nível do próprio tema, e não o combinado. A faixa que está em dois temas fica com a mais fácil. A `popularity` publicada sai só da faixa (1, 0,6667 e 0,3333), para nenhum nível de fonte ir para o arquivo. O `songKey` usa a chave do modo por artista, que junta a TV size e a completa.
- **O catálogo publicado** (`web/public/data/anime/catalog.json`, schema `shared/schema/anime-catalog.schema.json`): um `PlayableCatalog` como o de um artista (sem a parada e sem os distratores), com as franquias (`anime:fr:<slug>`, o nome e as chaves de busca de todos os títulos e sinônimos dos animes dela) e, em cada faixa, o bloco `anime`: as franquias, os temas (o anime, o tipo e o número) e a faixa de cada modo. O título do AnimeThemes é o latino da faixa em japonês e uma chave da busca; os nomes dos artistas do AnimeThemes também acham a faixa. Nada do MAL vai para o arquivo publicado.
- **O tamanho:** 1.000 músicas dão uns 2,1 MB (a medida do teste `test_a_thousand_songs_fit_under_the_cap`); o teto é de 3 MB (`validate_anime.MAX_FILE_BYTES`).
- **Os comandos:** `build-anime --provider fixture|apple` e `validate-anime --provider fixture|apple`.

### A agenda (PR A2)

- **O arquivo:** `web/public/<fixtures|data>/anime/schedule.json`, schema `shared/schema/anime-schedule.schema.json` (tipos `AnimeSchedule` e `AnimeDay` na web). O cabeçalho é o da agenda dos Hits com um `kind: "anime"` constante; cada dia tem o `number`, o `catalogVersion` e os 6 diários, `musica` e `titulo`, cada um com `facil`, `medio` e `dificil`, de 3 rodadas `{"answer": <faixa>}`. Só cresce (regra inviolável 4).
- **O código:** `anime_schedule.py`. O laço da geração dos Hits virou o `grow` do `schedule.py` (o cabeçalho, a P44, o horizonte e a defesa do `compare`), comum às duas agendas, e o `regenerate_problems` recebe o gerador. O `_generate_day` e o `_candidates` dos Hits não mudaram, nem o consumo do rng deles: as agendas dos Hits regeradas pelo código novo saem com os mesmos bytes (conferido do zero e crescendo, nos dois provedores).
- **Os diários:** em ordem fixa (para cada modo, cada dificuldade), cada um com o rng de `musicle-jp|anime|<data>|<modo>|<dificuldade>` e 1 número por rodada. As candidatas são as faixas elegíveis com a faixa do modo igual à dificuldade.
- **A janela** (P235, P245): a música (o `songKey`) que saiu em qualquer diário, dos dois modos, nos últimos K dias fica de fora; K = 21, 28 e 35 (Fácil, Médio, Difícil), contando hoje: a música de K dias atrás volta. Por isso o mínimo de 6 × K músicas por dificuldade (3 por dia em cada modo) basta, sem folga: o teste dos 61 dias usa exatamente ele e não afrouxa nada. Com acervo curto, K = mín(K, músicas do diário // 6), no mínimo 1: as fixtures ficam com 1 e 2 dias, e a carga de teste (~18 por dificuldade), com 3.
- **Dentro do dia:** nenhuma música repete nos 18, e no `titulo` nenhuma franquia repete no diário. Essas duas nunca afrouxam.
- **O afrouxamento,** com registro (o `schedule-anime` imprime cada um, para o corpo do PR): o nível 0 também espaça a franquia entre dias (a que saiu nos últimos mín(7, K) dias fica de fora); o nível 1 tira esse espaçamento; do 2 em diante, a janela encolhe até 1 (só as regras do dia). A agenda fictícia (13 franquias para 34 músicas) afrouxa só o nível 1, quase todo dia, no Médio (a janela de 2 dias barra as franquias de ontem): ~100 rodadas em 33 dias, nenhuma na janela das músicas.
- **A preferência** (P236): o sorteio sai do terço mais antigo das candidatas, pelo último dia em que cada música saiu, montado com a agenda anterior inteira (o ME51 continua: regerar os dias novos dá o mesmo). A nunca usada conta como a mais antiga, e os empates no corte entram juntos (no começo, todas).
- **O tipo do tema** (P252), pesos provisórios, até a carga grande (C2): no Fácil e no Médio, abertura 3 e encerramento 1; no Difícil, abertura 3, encerramento 3 e insert 1. Vale o tipo mais fácil entre os temas da faixa. A preferência pelas mais antigas dilui o peso: a música que não sai envelhece e entra no terço. Num acervo sintético meio a meio, o Fácil fica em uns 60% de aberturas, e não 75%; o `tier_of` do A1 já põe quase só aberturas no Fácil, e o C2 calibra.
- **O horizonte:** `--days` (os dias à frente de hoje, como no `schedule`; o padrão é 21). A regra do robô (só gerar com menos de 21 dias à frente, P237) fica fora do gerador.
- **A validação** (`validate-anime`, com a agenda ao lado do catálogo ou a do `--schedule`): a estrutural vale para todos os dias (o schema, o epoch, o número, as respostas existem e nenhuma faixa repete no dia). As regras da geração (a resposta elegível e da faixa do diário, a música e a franquia sem repetir) são erro nos dias com o `catalogVersion` do catálogo de agora e só aviso nos de antes, porque o catálogo mudou depois (o jogo anula a rodada inelegível, e a faixa recalibrada só vale para os dias novos). Um dia de catálogo com data mais nova que a do publicado é erro. O aviso de acervo curto sai para cada modo e dificuldade com menos de 6 × K.
- **O `schedule-check`:** o `known_schedules()` devolve as quatro agendas com o tipo (as dos Hits e as do Anime, existam ou não), e o `_check_one` despacha pelo tipo (com `--path`, pelo `kind` do arquivo): o `compare` (que passou a conferir também o `kind`) e o `check_dates` são os mesmos, e os dias novos se regeram com o gerador e o catálogo do Anime ao lado da agenda.
- **A agenda fictícia:** o mesmo epoch (08/10) e os mesmos 33 dias da dos Hits (até 09/11), para o dev e o e2e terem os diários do Anime nas datas de sempre: `schedule-anime --provider fixture --today 2026-10-08 --epoch 2026-10-08 --days 32`. Esses dias já passaram, e o P44 da CI (`check_dates`) os recusaria: o `schedule-check` dispensa dele só a agenda fictícia nova (sem base), porque ninguém a joga. Depois de criada, o P44 vale para ela, e o robô não a cresce (a dos Hits cresce toda semana; a do Anime fica até 09/11, até alguém acrescentar dias).

### A busca (PR A3)

- **O comando:** `fetch --provider apple --anime --fetched-at <agora em UTC>` grava um snapshot novo em `pipeline/data/apple/anime/snapshots/`. O Client ID do MAL vem só da variável `MAL_CLIENT_ID` (nunca de um argumento, que iria para o histórico do terminal), e vai só no cabeçalho `X-MAL-CLIENT-ID`: um teste confere que ele não chega à URL nem ao snapshot.
- **O sorteio:** o ranking de popularidade do MAL (os 3.000 primeiros, em páginas de 500); sem a variável, os animes dos temas mais incluídos em playlists do AnimeThemes, e aí o anime fica sem nível do MAL. O peso é inteiro, pela posição (o 1º vale 3.000, o último 1), com o PRNG do projeto e a semente `musicle-jp|anime|<fetchedAt>`. Os animes já tentados (em qualquer snapshot) ficam de fora. Na 1ª carga, a lista do usuário (`--personal`, o XML do MAL: "Completed", "Watching" e "On-Hold", primeiro os de nota 8 ou mais) entra um a cada 7 (P253).
- **As fontes**, com o User-Agent do projeto (o do `urllib` leva 403 do Cloudflare no AnimeThemes e no AnisongDB):
  - o AnimeThemes (GraphQL, `findAnimeByExternalSite`, até 100 ids por pedido): o nome em romaji, o inglês e o japonês como sinônimos, as séries, os temas (sem os de um grupo, como "HD Remaster", que repetem a música) e as faixas de playlists de cada tema, no nível de 0 a 9;
  - o AnisongDB (`mal_ids_request`, até 500 ids): a taxa de acerto do quiz, os artistas que faltam no AnimeThemes (62% das músicas, na amostra de 21/10) e as insert songs. Casa com o AnimeThemes pelo tipo e pelo título, porque a numeração das duas fontes diverge. Sem o AnisongDB (ele pode sumir), a busca segue com o AnimeThemes;
  - a Apple: a busca do artista (`entity=musicArtist`; o nome igual, senão a chave estrita, senão a frouxa, que junta "Youko" e "Yoko"; entre homônimos, o de gênero anime; até 3) e o lookup das músicas dele (até 200), 4 s entre os pedidos. O cutlet, em cache, lê o título japonês.
- **Os níveis** (P254), em escalas fixas: a posição no ranking do MAL (até o 50º, 9; além do 6.000º, 0); as faixas de playlists do AnimeThemes (500 ou mais, 9; de 0 a 2, 0); a taxa de acerto do AnisongDB em décimos.
- **Quando para:** quando cada modo e faixa tem `--target-per-tier` músicas (as contas são as do build), ou ao chegar a `--max-songs`, ou depois de `--max-anime` animes tentados.
- **O teste de fumaça** (21/10, sem o MAL, 2 animes): 5 de 12 temas casaram, todos certos (紅蓮の弓矢 = "Guren no Yumiya", 自由の翼, ジョーカーに宜しく, "great escape", "Steppin' out"). As insert songs de Shingeki saem na Apple como trilha do compositor, e não casam: o esperado.
- **Ficam para o C2:** o checkpoint e o prazo (a busca longa, retomável), o Kitsu de reserva, o top do Last.fm e o lookup dos álbuns quando o artista tem mais de 200 músicas.

## Origem

- **Musicle**, observado no navegador em 08/10/2026: `musicle.app/hitparade/jp` (3 rodadas, 4 capas, previews em `audio-ssl.itunes.apple.com`, capas em `mzstatic.com`).
- **Pesquisa de APIs** (subagente, 08/10/2026): developer.apple.com/programs/enroll, performance-partners.apple.com/search-api, developer.spotify.com/policy, developer.spotify.com/blog/2024-11-27-changes-to-the-web-api, developers.deezer.com/termsofuse, developers.google.com/youtube/terms/developer-policies. Endpoints testados na seção 3.
- **Desenho técnico:** subagente Plan, revisado pelo Claude.
- **Pesquisa do GitHub para o M10** (subagente, 09/10/2026): docs.github.com (Pages com workflow próprio, `POST /repos/{owner}/{repo}/pages`, ambientes e regras de branch, eventos do `GITHUB_TOKEN`, cron e a desativação após 60 dias), github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved, e as releases e o `action.yml` de `actions/upload-pages-artifact`, `actions/deploy-pages` e `actions/download-artifact`.
- **Decisões P6 a P15:** respondidas pelo usuário na sessão de 08/10/2026.
- **Pesquisa do selo e da playlist da Apple** (subagente, 11/10/2026, só leitura; o selo foi baixado depois, com permissão do usuário, P81): toolbox.marketingtools.apple.com (página da faixa em pt-BR e o JavaScript do código de incorporação), marketing.services.apple/apple-music-identity-guidelines, artists.apple.com/support/1117-apple-music-marketing-tools, music.apple.com/jp/playlist/top-100-japan/pl.043a2c9876114d95a4659988497567be, rss.marketingtools.apple.com (comparação com a playlist), performance-partners.apple.com/search-api e o arquivo da documentação do iTunes Search API em developer.apple.com.
- **Medições do PR B do M11:** navegador do Claude em 11/10/2026, no servidor de desenvolvimento com `?data=real` (Apêndice E).
- **Checkup de 11/10/2026:** seis subagentes, só leitura (site publicado, dados reais, pipeline, operação por `gh api`, jogo e documentação), e as revisões dos PRs #12 e #13 (subagente revisor, `/code-review` e `/security-review`).
- **O Anime do M14** (21/10/2026): o acordo da API do MyAnimeList (08/08/2019), lido pelo Claude; duas pesquisas na web por subagentes (as fontes de anime e a popularidade de música); três subagentes Explore e um Plan sobre o código; um subagente que testou as APIs reais (AnimeThemes, AnisongDB e a Apple); a medida do tamanho no teste do PR A1.
- **Identidade visual do M12** (12 e 13/10/2026): o style guide do designer (SVG e PNG), analisado pelo Claude com recortes em alta resolução e a conta de contraste do WCAG; um subagente de pesquisa comparou as letras do SVG com 26 famílias para achar a Noto Sans JP; as respostas do designer (PD1 a PD13) vieram pelo usuário; o `npm view @fontsource/noto-sans-jp` e uma busca sobre o selo da Apple em fundo escuro (artists.apple.com/support/1117-apple-music-marketing-tools).
