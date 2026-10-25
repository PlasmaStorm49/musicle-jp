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
| P50 | O Treino não salva nada: só o placar da sessão, e recarregar a página começa outra. **Revista pela P308** (M16): o save conta os acertos do Treino, só o total, para uma medalha; a sessão continua só na memória |
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
| P116 | O placar do modo por artista é só da sessão, como o do Treino (P50): nada é salvo. **Revista pela P289** (M16): o save passa a guardar os acertos e o fim do Superfan, pelas medalhas; o placar e a partida continuam só na memória |
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
| P186 | No Superfan, a ajuda passa a valer 0 (era −1, P153) e desistir da música custa 2 (era 0), pedido de 12/10/2026 (opção B): acertar sozinho vale mais que com a ajuda, que vale mais que desistir, que vale mais que errar. Antes, desistir sempre valia mais que a ajuda. Agora pedir a ajuda nunca sai pior que desistir (com ela na tela, ainda dá para desistir por −2), e escolher uma opção compensa a partir de 60% de certeza (−5 × (1 − p) contra −2, sem contar que o erro gasta 1 das 3 vidas). O fim que a partida força (o 3º erro, encerrar) não cobra os −2; pular a última tentativa, que a tela não oferece, cobra como desistir. **Revista pela P290** (M16): desistir passa a ser um erro, com os −5 dele |
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
| P228 | O controle de volume inteiro também na revelação (ME101, a resposta do usuário), num PR à parte. **Cancelada pelo usuário em 22/10/2026:** quem ajustou o volume ao ouvir a música já o tem certo na revelação, que toca com o mesmo volume |
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
| P257 | A agenda fictícia do Anime usa as datas da dos Hits (08/10 a 09/11/2026), com a dispensa da P44 só na criação (o `schedule-check` dispensa a agenda fictícia nova, sem base; depois, a P44 vale para ela). Implementado no PR A2 |
| P258 | O contato do "Sobre e privacidade" são as Issues do GitHub (https://github.com/PlasmaStorm49/musicle-jp/issues): público, sem e-mail no site. Serve também de canal de denúncia (a cláusula 4(c) do acordo do MyAnimeList) |
| P259 | O rótulo "Tema" continua na tela, ao lado do switch, e não só para o leitor de tela (o usuário, sobre o PR D3); o link do "Sobre e privacidade" fica na linha do "Como funciona", sem crescer a Início. A Início mais apertada do PR D2 (o espaço entre as partes de 12 px e o cartão de 8 px em cima e embaixo, com 88 px de altura mínima) fica aprovada |
| P260 | O Histórico (M15, ME104) mostra de hoje − 14 a ontem, em 2 linhas de 7: como os dias são seguidos, cada coluna tem o mesmo dia da semana, que vai no cabeçalho (o usuário, 22/10). Cada dia leva uma marca por categoria, com a regra do ✓ da nav: nos Hits, ✓ com os 2 diários, ◐ com 1 e vazio sem nenhum; no Anime, ✓ com ao menos 1 dos 6 (P247) e vazio sem nenhum. Sem diário naquele dia, a marca da categoria fica apagada, e o dia sem diário nenhum fica sem link. Andamento sem término não marca nada |
| P261 | A tela de um dia do Histórico tem o Normal e o Desafio, cada um com o resultado ou o jogar, e o Anime com "x de 6", que abre as telas do Anime (o modo e a dificuldade) daquele dia |
| P262 | Só o diário não jogado se joga depois: o jogado abre o resultado e o compartilhar, como hoje. A janela é de 14 dias (o usuário, 22/10) |
| P263 | O jogado depois não conta em estatística nenhuma: sequência, média, distribuição e número de jogos (o usuário, 22/10). A tela do dia mostra o resultado com "jogado depois". O resumo de qualquer dia passado (jogado no dia ou depois) não tem a contagem nem as estatísticas, que são as de hoje. O compartilhar do jogado depois leva "(jogado depois)" no cabeçalho |
| P264 | As entradas do Histórico são a nav e a Início. Na Início, o link fica na linha do tema, à esquerda, com o "Tema" e o switch juntos à direita, e a altura não muda. O nome é "Histórico" (o usuário, 22/10) |
| P265 | Abaixo de 480 px (o `--column`), a nav fica com a Início, os Hits, o Anime e um "Mais ▾", que abre os Artistas e o Histórico. A partir de 480 px, as 5 abas ficam na linha (o usuário, 22/10). Ao abrir o "Mais", o foco fica no botão (o padrão de menu de navegação da W3C), e o Tab entra na lista. O menu com submenus por categoria é a ME112. **Revista pela P287** (M16): o corte passa a 720 px, com as Medalhas no "Mais" |
| P266 | Só a ME104 no M15. A v7 do save já serve à ME105 (as medalhas não contam o jogado depois) e à ME103 (o exportar e importar) |
| P267 | O save v7: `FinishedGame.late?: true`, e a ausência quer dizer "jogado no dia". A migração de 6 para 7 não muda nada, porque até aqui jogar depois era impossível no site. A versão sobe porque uma aba com o código v6 contaria o jogado depois nas estatísticas e apagaria o andamento de um dia passado: com a v7, ela vê a versão como futura e não grava (como na P250) |
| P268 | O jogado depois é o diário cuja data vem antes do "hoje" do jogo (`gameDate`, fixado na carga) quando ele termina. Começar no dia D e terminar depois de recarregar em D + 1 conta como depois; a aba aberta antes da meia-noite continua valendo como no dia (Apêndice F, "Virada do dia"). A tela lê o `late` do registro gravado, e não a conta da aba: com duas abas, vale o 1º término |
| P269 | Ao abrir o jogo, ficam os andamentos de hoje e dos 14 dias do Histórico (15 × 8 = 120 ids, `keptProgressIds`): um diário passado em andamento se retoma depois de recarregar |
| P270 | Quem abre o Histórico baixa só a agenda do Anime (uns 56 KB com 35 dias, menos com gzip), para saber em que dias houve Anime (o usuário, 22/10). O catálogo do Anime só desce quando uma tela do Anime abre, como hoje (no PR 3, a escolha do modo de um dia passado já o baixa): o calendário e a tela do dia nunca o baixam |
| P271 | Em 320 px, os dias do calendário do Histórico ficam com uns 39 px de largura (e ao menos 44 de altura): uma exceção à P213 só nessa largura (o usuário, 22/10). Em 360 e 375, ao menos 44 × 44 (com o CSS de hoje, uns 46 × 52) |
| P272 | As faixas do Anime saem da chance de acertar, um produto de fatores entre 0 e 1, no lugar da soma de níveis do A1 (que punha no Fácil o encerramento e a insert song de anime famoso). No "acertar o anime": p_a × p_t × o fator do tipo. No "acertar a música": √(p_t × p_pl) × p_a^0,4 × o fator do tipo × a concorrência. O p_t vem do quiz do AnisongDB, o p_pl das playlists do AnimeThemes (os dois como (nível + 0,5) / 10) e o p_a do MAL (0,92 × 0,8^(9 − nível)). Sem o quiz, ele é estimado pelas playlists; sem nenhum dos dois, vale 2; sem o MAL, o nível 1. A concorrência, 1 / (1 + (1 − p_t) × ln n), pesa as n músicas distintas do mesmo tipo na franquia: a 21ª ED de BLEACH quase ninguém sabe o nome, e a música muito conhecida sofre menos. A música (o `songKey`) fica com a maior chance de cada modo entre os temas dela. A conta é em `Decimal` (regra 8 do pipeline) |
| P273 | Os parâmetros e os cortes são os calibrados na carga grande (C2), com as correções do usuário numa amostra de 49 músicas, e ficam fixos no código: nos quantis da chance, antes do teto (P274), o Fácil com 25% das músicas nos dois modos, e o Médio até 58% no "acertar o anime" e até 55% no "acertar a música". Depois do teto, o "acertar a música" fica com menos Fácil e Médio (17% e 30%). Sem correção à mão de faixa: algumas músicas caem numa faixa vizinha da certa ("não dá pra criar um cálculo perfeito", o usuário), e o quiz do Anime Music Quiz, anos de teste real, pesa mais que as outras fontes, principalmente no "acertar o anime" |
| P274 | O nome da música quase sempre é mais difícil que o anime: no "acertar a música", a faixa nunca é mais fácil que a do "acertar o anime", salvo o ícone (as playlists 8+ e o quiz 7+, ou o artista na parada dos Hits até a de 19/10/2026, a última antes da calibração: a data é fixa, para a parada semanal não mudar o catálogo do Anime, e é a de um snapshot que já existe, porque o `fetch` recusa um dia anterior ao último). A insert song só sai do Difícil em caso extremo (o fator do tipo é 0,15 no "acertar o anime" e 0,3 no "acertar a música") ou quando é a abertura de outra temporada (o quiz 7+, ou o estimado pelas playlists 9, a faz contar como abertura no "acertar o anime"; a mesma música em outro tema leva a chance dele) |
| P275 | O mesmo tema escrito de dois jeitos nas fontes ("LOST IN PARADISE feat. AKLO" e "LOST IN PARADISE", "sh0ut" e "shØut") junta os níveis pelo título frouxo: sem o enfeite do fim, com o ø e o 0 como "o", igual ou muito parecido, se for o único do mesmo tipo no anime. Na leitura, porque os snapshots não mudam (regra 17), e na busca, para as cargas seguintes |
| P276 | O PR semanal do robô entra no mesmo dia, com ou sem o Anime (o usuário, 22/10/2026, sobre o PR B). A folga da agenda, uns 14 dias numa semana normal, é só reserva: a execução da segunda seguinte fecha o PR que ficou aberto, e o aviso "faça o merge hoje" do corpo do PR quer dizer que a agenda acabou |
| P277 | No calendário do Histórico, as duas marcas ficam lado a lado: os Hits à esquerda e o Anime à direita, cada uma sempre no seu lugar (o vazio guarda a posição), e a legenda, em duas linhas, diz o lado de cada categoria (o usuário, 22/10/2026, sobre o PR 3 do M15). Sem a agenda do Anime (ela falhou), o calendário fica como no PR 2, só com os Hits |
| P278 | As medalhas ficam numa tela própria, `#medalhas` (o usuário, 22/10/2026, ME105) |
| P279 | Dois tamanhos de aviso: as medalhas simples dão um aviso pequeno no canto de baixo, à direita, que some sozinho; as maiores, um pop-up grande com um botão de confirmar. O pop-up grande guarda o lugar de um botão "Exportar o save", que a ME103 implementa, e o save leva tudo o que o exportar precisa (o usuário, 22/10) |
| P280 | As medalhas gerais: uma por feito, sem bronze, prata e ouro. No Superfan, cada artista tem 3: a prata, o ouro e a suprema (o usuário, 22/10) |
| P281 | Quem já joga recebe um aviso só ("Você já tem N medalhas"), no pop-up grande. Depois, cada medalha nova tem o seu (o usuário, 22/10) |
| P282 | A sequência fica no topo das Medalhas, e não na Início. Ela conta os dias seguidos com ao menos 1 dos 8 diários terminado no próprio dia, sem o jogado depois, sobre a agenda dos Hits, e tem um nome diferente da "Sequência atual" do resumo, que é por diário (o usuário, 22/10) |
| P283 | O desenho é do usuário ou do designer, e ainda não está decidido. Até lá, a medalha é provisória (como na P218). Cada medalha tem o seu emblema; a que falta ganhar aparece apagada, com a meta e o progresso ("7 de 10") (o usuário, 22/10) |
| P284 | A imagem da medalha do Superfan é escolhida artista por artista e fixada à mão: a capa de um álbum (qualquer um, não só o mais famoso) ou uma foto do Wikimedia Commons. A prata e o ouro usam a mesma imagem, e a suprema pode ter a sua (**revista pela P294:** uma imagem para cada medalha). Sem imagem, o monograma (P171). Os créditos das fotos ficam só no Sobre. Até a escolha, as três usam a capa de hoje (`cardArtwork`). A tela das Medalhas leva o selo da Apple no pé, por causa das capas (P170) (o usuário, 22/10) |
| P285 | Os 3 níveis do Superfan: a prata, com 50 acertos de músicas do artista no modo por artista (a Livre e o Superfan somam, com repetição e com a ajuda; o 50 é uma constante, `SUPERFAN_RIGHT`, fixa para uma prata ganha nunca sumir; o usuário subiu de 10, "muito pouco"); o ouro, por terminar uma partida (todas as músicas tocadas antes do 3º erro, sem exigir acerto: desde a P290, desistir é erro); a suprema, por terminar perfeita, sem erro, sem ajuda e tudo no trecho de 1 s (3 pontos por música), sem nenhuma música anulada (P291) (o usuário, 22/10) |
| P286 | A tela das Medalhas rola, como a lista dos Artistas (P211): no topo, a sequência e o total; depois, as gerais; embaixo, uma linha por artista com as 3 dele (o usuário, 22/10) |
| P287 | Abaixo de 720 px, os Artistas, o Histórico e as Medalhas ficam no "Mais" (revisão da P265, que cortava em 480); a partir de 720, as 6 abas ficam na linha. Entre 480 e 719 px, as 6 não cabem: a coluna tem 460 px úteis (o usuário, 22/10) |
| P288 | O aviso só aparece numa tela calma (a Início, os Hits, as escolhas do Anime, o Histórico, as Medalhas, o Sobre, a lista e o submodo dos Artistas e o fim do Superfan), nunca numa rodada nem numa revelação, e o pequeno nunca cobre o selo da Apple. Duas ou mais medalhas novas de uma vez dão um aviso só, com a lista, do tamanho da maior. O PR 2 do M16 entra no ar invisível, com a lista de exemplo só em desenvolvimento (as recomendações da revisão, aprovadas com o plano em 22/10) |
| P290 | No Superfan, desistir de uma música passa a ser um erro: conta no limite de 3 e custa os −5 do erro (revisão da P186, que cobrava −2 sem contar). O fim que a partida força (o 3º erro, encerrar) continua sem custo. Sem isso, desistir de todas as músicas daria o ouro com 0 acertos. A pontuação de todos os modos fica para ser repensada com urgência (a ME107) (o usuário, 22/10/2026) |
| P291 | A suprema recusa a partida com uma música anulada (falha de áudio): todas precisam ter tocado de verdade (`rounds` igual ao número de músicas que saíram). O ouro aceita a anulada (o usuário, 22/10/2026) |
| P294 | Cada medalha do Superfan tem a sua imagem: uma para a prata, uma para o ouro e uma para a suprema, escolhidas à mão para cada artista (revisão da P284, que dava a mesma à prata e ao ouro). Sem escolha, o ouro usa a da prata, e a suprema, a do ouro (o usuário, 22/10/2026; revista pela P296: uma imagem só) |
| P292 | O desenho provisório das medalhas (o usuário, 22/10/2026; ainda não fechado, P283): a prata na roseta com caudas (D2), o ouro na S1, na cor gelo (o azul dela, preferido ao dourado), sem o diamante e sem as bolinhas (os louros e o anel pontilhado), um pouco maior que a prata, e a suprema no buquê de flores (F2) equilibrado, com a capa maior e a faixa com o nome na vertical. As cores das flores da suprema vão ser escolhidas à mão para cada artista, junto com a imagem (P284), aqui no chat, sem automatizar |
| P293 | O PR 2 do M16 se divide em dois: o 2a (a rota, a nav, a tela e o desenho) e o 2b (os avisos). Os dois entram no ar invisíveis: no site, sem a lista, nem a aba nem a tela, e a nav continua com o corte de 480 px; o de 720 (P287) só vale com as Medalhas ligadas (a classe `six` da nav). Em desenvolvimento, a lista de exemplo com `?medalhas=demo` (o plano do M16, 22/10). **Desde o PR 3b** (P310), a lista real está ligada também no site: a nav tem sempre as 6 abas e o corte de 720 px, e a classe `six` saiu |
| P295 | O nome de cada medalha do Superfan é próprio do artista (o usuário, 22/10/2026, sobre as sugestões de um subagente de pesquisa; a lista, no Apêndice O, entra no PR 3). Na prata e no ouro, o nome em japonês leva um ponto e o romaji ao lado, como o nome do artista (`歌い手 · Utaite`); na suprema, só o original. **Revista pela P309**: a perfeita (a antiga suprema) também leva o romaji |
| P296 | As 3 medalhas do Superfan de um artista têm a mesma imagem (revisão da P294, que dava uma a cada). A capa vai até o aro, sem a faixa clara, e cada uma tem o seu enquadramento, à mão (o zoom e o centro), para não sobrar texto cortado nem moldura. As flores da suprema seguem o buquê de hoje (o F2, sem a versão 2) e ganham as cores da capa de cada artista; o tema do artista também vale, com aviso. A escolha da capa e das cores fica no Apêndice O (o usuário, 22/10/2026) |
| P297 | O romaji ao lado do nome japonês da prata e do ouro (P295) vai sem mácron: "Kyogen", e não "Kyōgen". É a grafia mais comum, e a Noto Sans JP do jogo desenha o ō com o mácron fora do lugar (o usuário, 22/10/2026) |
| P298 | No aviso pequeno, a medalha do Superfan aparece com o monograma, e não com a capa da Apple: as telas dele não têm o selo (P170). O pop-up grande leva o selo da Apple quando mostra uma capa dela. Entrou no PR 3a (o usuário, 22/10/2026) |
| P299 | A faixa da suprema leva um texto escolhido à mão para cada artista, em pé, um caractere por linha e centralizado na faixa; só YOASOBI e UNLIMITS vão deitados, ao longo dela. O texto é o nome do artista, menos 松田聖子 (sem o espaço), 新しい学校 (o apelido do grupo), 볼빨간사춘기 (o nome em hangul) e SOAD (a sigla dos fãs). Sem a escolha, o nome em pé, até 6 caracteres; o latino mais longo, deitado. Entrou no PR 3a, com a capa (P303) (o usuário, 22/10/2026) |
| P300 | A tela não usa mais os rótulos Prata, Ouro e Suprema: cada medalha do Superfan aparece pelo nome próprio (P295), na tela das Medalhas e no aviso ("Medalha nova: Nightwalker, de YOASOBI"). Entra no PR 3 (o usuário, 22/10/2026) |
| P301 | Os 3 nomes de cada artista são obrigatórios no `artists.toml`: o `validate-artists` recusa o artista sem eles (também nas fixtures, com nomes fictícios). Na tela, um nome que falte (um índice corrompido) deixa só o como ganhar (o usuário, 22/10/2026) |
| P302 | Os nomes internos dos 3 níveis mudam para o feito, antes de entrar no ar: `acertos`, `completo` e `perfeito`, nos ids (`superfan\|<artista>\|completo`), no código e nos docs (revisão da P280 e da P285). Nenhum save do site tem esses ids ainda: lá, a reivindicação nunca rodou, porque a lista das gerais só existe em desenvolvimento. Entra no PR 3 (o usuário, 22/10/2026) |
| P303 | O PR 3 e o PR 4 do M16 viram uma entrega só, em 2 PRs: o 3a (os dados e o desenho de cada artista, ainda invisível no site) e o 3b (as gerais e o lançamento). As 12 imagens escolhidas são capas de álbum da Apple: sem foto do Commons, sem a API dele e sem créditos no Sobre (revisão da P284) (o usuário, 22/10/2026) |
| P304 | Nas medalhas gerais, a rodada anulada (o áudio falhou) conta como diário terminado, mas não como perfeito: o perfeito pede as 3 rodadas acertadas, como a do Superfan (P291) (o usuário, 22/10/2026) |
| P305 | As caudas da medalha dos acertos e da completa usam a cor principal do buquê do artista (o papel `d` da paleta): as 3 ficam com a mesma família de cor da capa. Sem a paleta, a cor do monograma (o usuário, 22/10/2026) |
| P306 | O aviso de uma medalha do Superfan diz o nome próprio, com o latino, e o artista ("Medalha nova: 廻廻奇譚 · Kaikai Kitan, de Eve"). Sem o nome, o feito ("Superfan completo, de Eve"); sem a lista dos artistas (a carga falhou), só o feito (a IA, 22/10/2026, aceito na aprovação do plano) |
| P307 | A capa das 3 medalhas é a de um álbum do arquivo publicado do artista (o caminho do `card_artwork`), em 300 px no índice; a tela a pede em 600 px, e em 1000 com zoom de 1,5 ou mais (a mzstatic serve o tamanho pelo endereço). Ela vai até o aro, com o enquadramento escolhido (o zoom e o ponto do centro), sem canto vazio (a IA, 22/10/2026, aceito na aprovação do plano) |
| P308 | O Treino passa a contar os acertos no save, só o total (o `practiceRight`, no save v9), para a medalha Saco de Pancadas (100 acertos). Conta a rodada ganha, com ou sem ajuda, uma vez só; a perdida e a anulada não. A sessão continua só na memória (revisão da P50; o usuário, 22/10/2026, com a lista das gerais) |
| P309 | O nome da medalha perfeita do Superfan também leva o romaji ao lado, como os outros dois (`はらぺこ · Harapeko`), com a mesma regra: só com kana, kanji ou hangul, e sem mácron (revisão da P295; o usuário, 22/10/2026) |
| P310 | As 13 medalhas gerais (o usuário, 22/10/2026): os nomes e os feitos do Apêndice O, "O PR 3b". O tamanho do aviso (P279) vem da lista: 4 grandes (Hit Perfeito, Sensei, Superfan e Tá pegando fogo, bicho!!!) e 9 pequenas. Os limites são fixos (`GENERAL_GOALS`), e tudo sai do que só cresce, sem o jogado depois (P263). O perfeito é pela forma das rodadas (toda rodada ganha no trecho de 1 s, sem ajuda), e não pelos pontos, que a ME107 vai mudar. Na tela, as pequenas vêm antes e as grandes no fim (a ordem é da IA) |
| P311 | O "acerte todas" (o Dia de Hit e o Pare de falar em tocar grama...) conta o acerto com ajuda; a rodada anulada não é acerto (P304) (o usuário, 22/10/2026) |
| P312 | O desenho das gerais: a pequena na roseta prata da medalha dos acertos, a grande na moldura gelo da completa, as duas com as caudas no oliva do AteMusic (a `--accent-line`) e o ícone de cada uma no miolo (`ui/medalIcons.tsx`). O tamanho e as caudas são do usuário (22/10/2026); os ícones, da IA (um widget na conversa), entraram com a aprovação do plano, e o usuário pode pedir ajustes |
| P313 | O 1º aviso de quem já jogava, com muitas medalhas de uma vez: o pop-up desenha primeiro as grandes e as com capa de artista, e lista até 6 nomes, com "e mais N" (`LISTED`). A tela das Medalhas continua com todas (o usuário, 23/10/2026, sobre a revisão do PR 3b) |
| P314 | O "Você já tem N medalhas" (P281) fica para quem tem um jogo de um dia anterior: quem começa hoje e ganha duas de uma vez (o Primeiro Acorde e o Relâmpago no 1º diário) vê "2 medalhas novas" (o usuário, 23/10/2026) |
| P315 | O progresso das gerais que se ganham aos poucos diz a unidade, como o "7 de 50 acertos" do Superfan: "3 de 7 dias seguidos", "40 de 100 acertos no Treino", "14 de 50 diários", "1 de 5 artistas com 50 acertos". Os limites vão aos textos por parâmetro, e os textos não repetem os números do núcleo (o usuário, 23/10/2026) |
| P316 | Nas células do Superfan, o latino vai embaixo do nome, em letra menor e sem o ponto (o leitor de tela ouve uma pausa). No celular estreito (abaixo de 375 px), o nome fica um pouco menor, para "Nightwalker" caber sem quebrar no meio (o usuário, 23/10/2026) |
| P317 | A medalha em destaque (ME118) fica no canto direito da nav, em todas as telas: a favorita é a 1ª da estante (o `shelf[0]`, sem versão nova do save), e só ela aparece. A partir de 360 px, é um link para as Medalhas, com o alvo de 44 px; abaixo de 360 px (sobram 28 px em 320), fica menor e só enfeita. O usuário escolheu antes uma faixa acima de cada tela, mas ela fazia rolar 7 telas de jogo em 360 × 640, mesmo com 20 px (a medida, com os testes do `layout.spec`), e ele trocou pela nav (o usuário, 23/10/2026) |
| P318 | Para escolher: na tela das Medalhas, cada medalha ganha tem um botão "Destacar"; na escolhida, o botão vira "Tirar o destaque", que a remove, só se ela ainda é a favorita (a aba que não viu a troca da outra não apaga a escolha de lá) (o usuário, 23/10/2026) |
| P319 | A do Superfan, na nav, vai sem a capa: o monograma e as cores do artista, como no aviso pequeno (P298), porque a nav não tem o selo da Apple (o usuário, 23/10/2026) |
| P320 | Sem favorita, ou com uma que não está entre as ganhas (um id velho, um artista que saiu da lista), nada aparece (o usuário, 23/10/2026) |
| P321 | O Anime ganha a volta sem a nav (ME120): na escolha da dificuldade, para a tela do Anime, e no resumo de um diário. Na rodada, não, porque ela já está no limite da altura (o usuário, 23/10/2026) |
| P322 | Do resumo, a volta é um passo atrás: a escolha da dificuldade do mesmo modo; num dia passado, a do mesmo dia (o usuário, 23/10/2026) |
| P323 | Nenhuma das duas tira altura: o resumo do Anime só tem de 12 a 16 px de folga em 360 × 640 (a medida). Na dificuldade, uma seta à esquerda do título, fora do fluxo, com o nome "Voltar ao Anime". No resumo, um "Voltar" ao lado do Compartilhar, cujo nome inteiro começa pelo texto visível (P210), e que sai quando aparece o "Jogar o novo diário" (a IA, aceito na aprovação do plano, 23/10/2026) |
| P324 | A aba ativa da nav fica em negrito sem empurrar as vizinhas (ME106): o rótulo de cada aba reserva a largura do negrito, com o mesmo texto em negrito, invisível e sem altura, embaixo dele (o `::after` com o `attr(data-label)`, que o leitor de tela não lê). O ✓ fica sempre no peso normal. Abaixo de 360 px, o espaço entre as abas cai de 16 para 12 px, para a linha caber em 320 px com o "Mais" e a medalha em destaque. A outra saída, marcar a aba sem o negrito, ficou de fora (o usuário, 23/10/2026) |
| P289 | O save v8 guarda o modo por artista, só o mínimo: os acertos de cada artista e se ele já terminou e terminou perfeita uma partida do Superfan (revisão da P116). Guarda também as medalhas já avisadas e a estante (ME118), vazia até ela (o plano do M16, 22/10) |
| P325 | As Misturadas (M17, Apêndice P): cada diário tem 4 rodadas. Nas duas primeiras, duas músicas muito conhecidas tocando juntas, bem mais fáceis que o Fácil do Anime (P341); na 3ª, duas do Médio para cima; na 4ª, uma música a mais: três juntas, também muito conhecidas (o usuário, 23/10/2026; a P7 da conversa) |
| P326 | Nas Misturadas, os trechos são maiores: 4, 8, 16 e 30 s. Cada erro ou pulo abre o seguinte (o usuário, 23/10/2026; a P9 e a P24 da conversa) |
| P327 | A única ajuda das Misturadas é o "Separar L e R": cada música toca de um lado do fone. Ela custa pontos (o usuário, 23/10/2026; a P10 e a P14 da conversa). Os valores são os da P342 |
| P328 | O laboratório vem antes do diário: uma página só do servidor de desenvolvimento, para ouvir misturas reais do Anime e calibrar a régua, a soma e a ajuda (o usuário, 23/10/2026; a P11 da conversa). Entrou no PR #82 |
| P329 | Nas Misturadas, cada música vale pelo trecho em que foi achada (o usuário, 23/10/2026; a P12 da conversa). Os valores são os da P342 |
| P330 | O nome na tela é "Misturadas" (o usuário, 23/10/2026; a P13 da conversa) |
| P331 | A música achada para de tocar, com um fade, e as outras seguem (o usuário, 23/10/2026, decidido no laboratório; a P23 da conversa). No motor, uma rampa de 0,3 s no ganho dela |
| P332 | Nenhuma resposta das Misturadas repete uma das 18 respostas dos 6 diários do Anime do mesmo dia (o usuário, 23/10/2026; a P25 da conversa). Na geração, só o último nível de afrouxamento, o do acervo curto, deixa repetir: no real, ele não deve chegar |
| P333 | As Misturadas têm uma aba própria na nav, por enquanto só com o diário e com o ✓ (P344). As medalhas delas ficam para a ME123. Por enquanto, sem o Histórico, sem as estatísticas e sem cartão na Início (ME125, ME126) (o usuário, 23/10/2026; a P26 da conversa). O cartão e o Histórico vieram em 24/10 (P366, P368) |
| P334 | A carga C3 do Anime vem antes das Misturadas (o usuário, 23/10/2026) |
| P335 | A C3 escolhe os animes pelos acertos do Anime Music Quiz (a taxa de acerto do AnisongDB, pelo `get_n_random_songs`), e não pelo ranking do MAL. O MAL dá só o nível (P254, P256): sem ele, a busca recusa, porque a chance de todos cairia (o usuário, 23/10/2026; a P15 e a P17 da conversa) |
| P336 | A C3 não sorteia: cada anime vale o melhor acerto das músicas dele, com a dificuldade de 60 a 100, e a ordem é o acerto vezes a fama do anime no MAL (o p_a da P272, `anime_factor`), do maior para o menor. Entram os 250 primeiros que ainda não foram tentados (o usuário, 23/10/2026; a P19 e a P21 da conversa). O motivo da fama, no código: só o acerto puxaria o nicho, porque o AMQ toca a música do anime de nicho para quem o assistiu, e quase todos acertam |
| P337 | A agenda real das Misturadas começa curta, de 24/10 (nº 1) a 30/10, com o catálogo do Anime de antes da C3. O resto entra depois da C3 (o usuário, 24/10/2026; a P1 da conversa) |
| P338 | A partir de 720 px, a linha da nav usa a coluna larga (`--column-wide`, 880 px), e não a do conteúdo (560): as 7 abas, com os três ✓ e a medalha em destaque, somam uns 620 px (o usuário, 24/10/2026; a P2 da conversa). Revisa a P287, que tinha 6 abas na linha |
| P339 | No compartilhar das Misturadas, cada música achada leva o número do trecho em que foi achada (1️⃣ a 4️⃣), a que faltou leva ❌, e a achada com o "Separar" leva o 💡 ao lado (o usuário, 24/10/2026; a P3 da conversa). A rodada anulada é um ⬜, como na P42 |
| P340 | As músicas da C3 entram nos diários do Anime só a partir de 13/11, a próxima montagem da agenda, e nenhum dia gravado é refeito (o usuário, 24/10/2026; a P4 da conversa). Nas Misturadas, a partir de 31/10, o 1º dia depois da agenda curta (P337) |
| P341 | A muito conhecida (`anime.famous`, sim ou não por modo, no catálogo do Anime) é a música com a chance de acertar o modo (P272) a partir de 0,50 (`FAMOUS_CUTS`), sempre dentro do Fácil do modo. O corte é fixo, como os da P273: mudá-lo muda a marca do acervo inteiro, e só os dias novos das Misturadas sentem. No catálogo real de 22/10, são 43 músicas no "acertar a música" e 41 no "acertar o anime" (a IA, aceito na aprovação do plano, 23/10/2026) |
| P342 | Os pontos das Misturadas: a música achada vale 10, 7, 5 ou 3, pelo trecho (P329); com o "Separar" ligado, 5, 4, 3 ou 2, a metade arredondada para cima. A rodada vale a média das suas músicas, no inteiro mais perto: no máximo 10, e o dia, no máximo 40. A anulada vale 0 e sai do máximo, como nos diários (P27) (a IA, aceito na aprovação do plano, 23/10/2026) |
| P343 | Nas Misturadas, o acerto não abre trecho: a pessoa segue tentando as outras músicas no mesmo trecho. O erro no último trecho encerra a rodada (a IA, aceito na aprovação do plano, 23/10/2026) |
| P344 | A aba Misturadas ganha o ✓ com os dois diários de hoje terminados, como a dos Hits (a IA, aceito na aprovação do plano, 23/10/2026) |
| P345 | Importar o progresso substitui o daqui (ME103): o importado toma o lugar, e o andamento deste aparelho fica, menos o dos dias que o arquivo traz terminados (o usuário, 23/10/2026, no PR #80; a P24 daquela conversa) |
| P346 | No arquivo do progresso (ME103), só os jogos terminados viajam: ele não leva o andamento, e um arquivo feito à mão que o traga não o passa adiante. Nas Misturadas também (o usuário, 23/10/2026, no PR #80; a P26 daquela conversa) |
| P347 | O pop-up das medalhas grandes (o da P279: a Superfan completa e a perfeita, e as gerais grandes) oferece "Guardar uma cópia" do progresso (ME103) (o usuário, 23/10/2026, no PR #80; a P25 daquela conversa) |
| P348 | A nav menor no computador (revisa a P338): em todas as larguras, os Artistas, o Histórico e as Medalhas ficam no "Mais". A partir de 720 px, só as Misturadas entram na linha, que fica na coluna do conteúdo (560 px), com o mesmo respiro lateral dele (16 px); abaixo de 720 px, elas também vão ao "Mais". A medalha em destaque fica no canto direito, alinhada com o fim do conteúdo (o usuário, 24/10/2026, PRs #86 e #87) |
| P349 | O botão do "Separar" diz que é ajuda: "Ajuda: separar L e R" (o usuário, 24/10/2026, PR #86) |
| P350 | O cabeçalho da rodada das Misturadas avisa a dificuldade dela: a 3ª, "Músicas mais difíceis"; a de 3 músicas, "Mais músicas juntas" (o usuário, 24/10/2026, PR #86) |
| P351 | As 4 medalhas das Misturadas (ME123), da lista do usuário: "Tudo Junto e Misturado" (pequena: todas as músicas de uma rodada, em qualquer trecho e com ou sem o "Separar"), "DJ Residente" (pequena: 15 dias seguidos, P353; o nome é a P11 da conversa), "Pode juntar mais uma" (grande: gabaritar, P352) e "Harmonia no Caos" (grande: 7 dias seguidos com todas as músicas achadas, P353). As sequências contam sobre a agenda dos Hits, como a do topo da tela (P282) (o usuário, 24/10/2026, PR #87) |
| P352 | "Pode juntar mais uma" pede os 2 diários do mesmo dia perfeitos, o de música e o de anime: tudo no 1º trecho, sem o "Separar". O texto da medalha diz que são os dois (o usuário, 24/10/2026; a P9 da conversa) |
| P353 | As duas de dias seguidos contam 1 diário por dia: "DJ Residente", ao menos 1 terminado; "Harmonia no Caos", ao menos 1 com todas as músicas achadas. O texto do Harmonia diz que basta um dos dois (o usuário, 24/10/2026; a P10 da conversa) |
| P354 | Na tela das Medalhas, toda medalha mostra o como ganhar, também a ganha, para a pessoa lembrar o que fez; a que se ganha aos poucos leva o progresso embaixo, enquanto falta. O "Ganha" fica só para o leitor de tela: o desenho colorido e o "Destacar" já dizem (o usuário, 24/10/2026, PR #88) |
| P355 | A prévia começa no 1º som: o Web Audio pula o silêncio do começo (a janela 30 dB abaixo da energia da prévia inteira, ou abaixo de -60 dBFS), no máximo 10 s, e o fim da prévia encurta o mesmo tanto. O `<audio>` de reserva começa do 0 (o usuário, 24/10/2026, PR #89; nos exemplos dele, Kakumei Dochuu e Yoru ni Kakeru, eram 1,3 s e 1,2 s mudos) |
| P356 | A música achada continua na mistura, no volume normal, até o fim da rodada: só o "Separar" ajuda (revisa a P331; o usuário, 24/10/2026, PR #92; a P12 da conversa) |
| P357 | O ✓ da aba Anime pede ao menos um diário terminado em cada modo, o "acertar a música" e o "acertar o anime", em qualquer dificuldade (revisa a P247). A marca do dia no Histórico continua a de antes, com qualquer um dos 6 (o usuário, 24/10/2026, PR #92) |
| P358 | A mistura com as músicas audíveis: cada voz pula também a introdução baixa (começa a 15 dB da energia da prévia inteira, e não a 30), e o igualar sobe até 4 vezes (12 dB), e não 2. A pausa no meio do trecho continua; o próximo passo seria um compressor por voz, testado de ouvido (o usuário, 24/10/2026, PR #92; a P13 da conversa) |
| P359 | As rodadas 1, 2 e 4 das Misturadas tiram do Fácil inteiro do modo, e não só das muito conhecidas, que deixavam o jogo fácil demais (revisa a P325 e a P341). A rodada 3 continua no Médio ou no Difícil (o usuário, 24/10/2026, PR #90; a P14 da conversa) |
| P360 | As músicas que nunca saíram entram aos poucos: o diário Fácil do Anime leva no máximo 1 nas 3 rodadas, e cada rodada das Misturadas, no máximo 1 (a que nunca saiu, nem no Anime nem nas Misturadas). É preferência, como a do terço mais antigo (P236): sem candidata que já saiu, vale qualquer uma, sem afrouxamento. O Médio e o Difícil do Anime não têm limite, e a regra some sozinha quando todas tiverem saído (o usuário, 24/10/2026, PR #90; a P15 da conversa) |
| P361 | O teto do catálogo do Anime sobe de 3 para 5 MB, no `validate-anime` e no robô: com a C3, 1.395 faixas deram 2,82 MB. O teto continua um alarme de crescimento, por causa do histórico do Git; o Pages manda o arquivo comprimido, umas 7 vezes menor (o usuário, 24/10/2026, PR #93; a P16 da conversa) |
| P362 | A marca de muito conhecida (`anime.famous`, P341) sai do catálogo, do esquema e da validação, com o `FAMOUS_CUTS`: o gerador não a lia mais desde a P359. O site nunca a leu, então o `schemaVersion` não muda (o usuário, 24/10/2026, PR #93; a P17 da conversa) |
| P363 | Os comentários, os textos e os nomes dos testes citam a decisão pelo número do PLANO, e nunca pelo da conversa: os números da conversa recomeçam a cada rodada de perguntas e se repetem (o P9 das Misturadas e o das medalhas; o P25 delas e o do progresso). Sem número no PLANO, vão a data e quem decidiu (o usuário, 24/10/2026; a P7 da conversa) |
| P364 | A franquia espaçada uma semana nas Misturadas: a que saiu nelas nos últimos mín(7, K) dias fica de fora, como no Anime (`FRANCHISE_DAYS`). Contam só as Misturadas, e não o Anime. O espaçamento é o 1º a afrouxar ("sem espaçar a franquia"), antes da franquia repetida no dia. O consumo do rng não muda: só os dias novos sentem (o usuário, 24/10/2026, PR #96; a P19 da conversa) |
| P365 | O "Mais" da nav leva o ▼ da própria fonte (a Noto Sans JP o tem; o ▾ e o ⌄, não), menor que o texto e para cima com o menu aberto, no lugar do chevron do designer girado (o usuário, 24/10/2026, PR #97; a P20 da conversa) |
| P366 | A Início ganha o cartão das Misturadas, ao lado do dos Artistas; os Hits e o Anime continuam na linha toda, do mesmo tamanho. O cartão tem uma linha só, lida do save, como o do Anime: os 2 diários de hoje terminados, ou um em andamento. Resolve a ME126 e revisa a P333 nessa parte (o usuário, 24/10/2026, PR #97) |
| P367 | Nos dois cartões da Início que dividem a linha, a dica curta sai quando o cartão já tem a linha do estado; a inteira continua no leitor de tela. Sem isso, a Início no caso mais alto passava 29 px em 360 × 640 (a IA, 24/10/2026, PR #97) |
| P368 | As Misturadas no Histórico, no modelo do Anime: a 3ª marca do calendário, à direita (os 2 diários, com a meia marca para 1 dos 2, como nos Hits), uma linha na legenda, o cartão na tela do dia, na linha toda, e as rotas com a data (`#misturadas/AAAA-MM-DD` e os 2 diários). Com as 3 marcas, a folga entre elas cai para 1 px: em 320 px, o dia continua com 39 px (P271). Revisa a P333 nessa parte; as estatísticas continuam de fora (ME125) (o usuário, 24/10/2026, PR #98) |
| P369 | O diário das Misturadas terminado depois do dia leva o `late: true` e fica fora das medalhas, como o dos diários (P263, P268): sem isso, jogar os dias passados encheria a sequência do "DJ Residente" e a do "Harmonia no Caos". O save v11 não muda nada no que existe e só marca a chegada do campo, como a v7 nos diários (a IA, 24/10/2026, PR #98) |
| P370 | O latino da mesma música no Anime vale também nos Hits e nos artistas: o do Anime vem do AnimeThemes (ou do `aliases.toml` dele), feito por pessoas, e o dos dois, do cutlet. Entra como o latino do provedor, depois do da Apple (manual > Apple > Anime > cutlet), e sempre na busca. A versão com um sufixo já latino leva o da música com o sufixo ("Yoake no Melody (TV Size)"); com kana ou kanji no sufixo, fica sem. O single e o EP levam o da faixa. O `latinSource` continua "provider", como no Anime, e o esquema não muda (o usuário, 24/10/2026, PR #99; a P2 da conversa) |
| P371 | O latino exibido pode ser a grafia do AnimeThemes, e não só o Hepburn da regra 11 do `pipeline/CLAUDE.md`: "Cascade" e "Curtain Call" vêm de pessoas, e não do cutlet, que às vezes erra a grafia estrangeira (a IA, 24/10/2026, PR #99) |
| P372 | O latino do Anime chega aos Hits e aos artistas por um arquivo à parte (o `latin.json` da pasta do Anime do provedor, do comando `anime-latin`), e não pelo catálogo do Anime lido no build: o robô refaz o catálogo do Anime real sem refazer o dos Hits, e o build sairia diferente do catálogo gravado. O arquivo só muda à mão, num PR com o `build` e o `build-artists`, e o build avisa quando ele é de outra versão do catálogo do Anime. Só o das fixtures tem o teste "em dia" (a IA, 24/10/2026, PR #99) |
| P373 | A lista de negação do `.claude/settings.json` passa a cobrir os gerados dos artistas e do Anime e o `latin.json`, como diz a regra 3 do `CLAUDE.md` (ME108) (o usuário, 25/10/2026; a P4 e a P5 da conversa) |

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
| M14 | Em andamento (PRs A1, D1, A2, A3, C1, D2, D3 e C2) | O Anime (ME97, Apêndice M): a categoria com 6 diários por dia (2 modos × 3 dificuldades), o acervo de músicas de anime com a prévia da Apple e o robô | Em 21/10: A1 (o catálogo), D1 (o save v6), A2 (a agenda), A3 (a busca), C1 (a carga de teste), D2 e D3 (a web, a estreia). Em 22/10: C2 (a carga grande e a calibração das faixas). Depois: B (o robô) | Planejamento com subagentes Explore, de pesquisa e Plan; subagentes em worktrees (o D1, em paralelo, e o D2 e o D3, as telas); outro testando as APIs reais |
| M15 | Concluído (PRs 1, 2 e 3) | O Histórico (ME104, Apêndice N): o calendário dos 14 dias antes de hoje, a tela de cada dia e o jogar depois, fora das estatísticas; a nav do celular com o "Mais ▾" | Em 3 PRs: o núcleo e o save v7 (1), o Histórico dos Hits (2) e o Anime no Histórico (3). Jogar um dia passado não muda a sequência nem a média, e as telas novas cabem em 360 × 640 | Planejamento com subagentes Explore e Plan; o subagente do robô do M14 (o PR B) em paralelo, numa worktree |
| M16 | Concluído (PRs 1, 2a, 2b, 3a e 3b) | As medalhas (ME105, Apêndice O): a tela, os avisos, as 13 gerais e as 3 medalhas do Superfan de cada artista, com a imagem dele | O núcleo e o save v8 (1), a estrutura e os avisos, só em desenvolvimento (2a e 2b), os dados e o desenho de cada artista, ainda invisíveis (3a, P303), e as gerais, o save v9 e o lançamento (3b) | Planejamento com subagentes Explore e Plan; um subagente de pesquisa (as fotos públicas dos artistas); mockups no chat e uma página de rascunho com as capas reais |
| M17 | Concluído (PRs 1, A, B e C; a C3 e os ajustes, de #86 a #98) | As Misturadas (Apêndice P): 2 ou 3 prévias de temas de anime tocando juntas, em 2 diários por dia (acertar a música e acertar o anime), de 4 rodadas; antes, o laboratório (P328) e, à parte, a carga C3 do Anime (P334) | Em 4 PRs: o laboratório e a mistura no Web Audio (1, #82, 23/10), a agenda e a régua da muito conhecida (A, #83, 24/10), a tela e o save v10 (B, #84, 24/10) e o robô (C, #85, 24/10). Depois, no mesmo dia: a nav menor e a rodada difícil avisada (#86), as medalhas das Misturadas (#87, ME123), o como ganhar nas Medalhas (#88), o começo no 1º som (#89), o Fácil inteiro e as novas aos poucos (#90), a carga C3 (#91), a mistura inteira e o ✓ do Anime por modo (#92) e o teto de 5 MB (#93). Depois dos docs (#94): a limpeza do robô (#95, ME128 e ME129), a franquia espaçada (#96), o cartão na Início e o ▼ do Mais (#97) e as Misturadas no Histórico, com o save v11 (#98) | Planejamento; uma worktree por frente (o laboratório, a agenda, a tela, o robô e os docs); o `revisor` e o `/code-review` no PR 1, e uma revisão no PR A |
| M18 | Em desenho (desde 25/10/2026) | O quiz do dia (a ME122, repensada pelo usuário): uma run por dia, de uma tentativa, com duas prévias de temas de anime sem nome e uma pergunta de comparação ("qual é a mais antiga?", "qual é a isekai?"), que aperta a cada acerto, até 50 rodadas. As perguntas saem de um pool, com cooldown, e as do MAL usam o dado sem guardá-lo (o desenho B). O desenho vai para um apêndice próprio quando as perguntas abertas fecharem | O desenho no PLANO; depois, os PRs do gerador, do robô e da tela | Pesquisa com subagente (as fontes e os termos), testes das APIs (o AnimeThemes daqui; o MAL no terminal do usuário) |
| M19 | Planejado, depois do M18 | A revisão do design inteiro do jogo com as skills de design avaliadas em 25/10/2026: a taste-skill (`design-taste-frontend`, art direction e um inspetor num navegador real) e as Web Interface Guidelines da Vercel (o checklist de acessibilidade, foco, formulários e tipografia). Melhorar e, se for preciso, reconstruir (o usuário, 25/10/2026). A decidir no planejamento: o que fica da identidade do designer (os tokens, o logo e a Noto Sans JP do M12, Apêndice L), o que muda, e as regras da casa da taste-skill que batem com as do projeto (a numeração das rodadas, o emoji do compartilhar, as capas só da Apple, a dependência só pelo npm) | A revisão com as duas skills, as telas no `layout.spec` e o contraste no `theme.test.ts`, e a decisão do usuário sobre a identidade | A taste-skill instalada só no projeto, fora do Git, e apagada depois; o checklist da Vercel lido na hora, sem instalar |

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
- ME37. Um gancho comum de reprodução com ficha para o Player e a revelação (`/code-review` do PR #13). A 1ª parte, o `aria-disabled` no lugar do `disabled` no Tocar durante o "Carregando…", foi feita em 23/10/2026 ("Feitas").
- ME38. Ligar no pipeline os álbuns do mesmo lançamento (o EP "A / B", os dois "ROSE - Single"), em vez da regra de nome do `acceptedIds` no web; juntaria também as linhas iguais da busca. Pede mudança de esquema (`/code-review` do PR #13).
- ME39. Teste de componente do `Game` e do `App`: o lote de prévias só dos diários pendentes, a sessão `stale` regravada, o save da abertura guardado na montagem e, no `App`, a releitura do save no `hashchange` e no evento `storage` (checkup, `/code-review` do PR #13 e revisão de 12/10). Nos dois modos, trocar o retrato pelo save vivo do `App` fez a revelação da última rodada sumir, e só o e2e pegou. O resumo, a contagem e o compartilhar ganharam teste em 12/10 (ME47).
- ME40. `RoundState.correctOptionId` é gravado, mas só os testes o leem: a tela usa o `accepted`. Tirar, ou usar no lugar do `accepted[0]` (dois modos).
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
- ME69. Teste de tela do "Pedir ajuda" sumindo depois da 3ª ajuda do Superfan: hoje só o núcleo cobre, porque os dados do teste não têm artista com 4 músicas ou mais (revisor do Superfan).
- ME70 a ME75 (check-up da interface em 12/10/2026, feitas no branch `m13-ui`):
  - ME70. As cinco abas numa linha a partir de 360 px (o Android comum), também com os dois ✓ (menos espaço lateral, a fonte das abas um pouco menor até 400 px e o ✓ menor); em 320 px ainda quebram. A 1ª versão tinha 10 px de folga com a Segoe UI e quebrava no Linux da CI, de fonte mais larga: a folga agora vale até para a Verdana (317 de 328 px).
  - ME71. "Pedir ajuda" sem pontos (P164), com a cor do destaque, à esquerda; o "Desistir" sempre à direita, longe dele.
  - ME72. Nas tentativas, o pulo tracejado e sem fundo (não pesa como um erro), e as linhas mais baixas.
  - ME73. "Voltar à lista" afastado dos cartões da escolha do submodo.
  - ME74. A descrição do Superfan curta e sem números (P164).
  - ME75. No título da partida, "Superfan" vira uma etiqueta ao lado do nome do artista (o título não quebra no meio).
- ME77. Nas estatísticas do Desafio, a distribuição tem 19 linhas (0 a 18 pontos), longa no celular: agrupar em faixas ou desenhar em colunas (check-up de 12/10/2026). **Resolvida no PR D3:** a distribuição em colunas.
- ME79. O `validate` e o `validate-artists` recusam kanji ou kana no título latino (o 東亰カニバリズム passou como "Higashi 亰 kanibarizumu").
- ME80. Os créditos da parada com o nome da Apple, a mesma regra da P187 no `pipeline/data/apple/aliases.toml`: 点描の唄 (feat. 井上苑子) "Inoue Sonoko" e 佐野勇斗&吉田仁人 "Sano Hayato & Yoshida Jinto", que a loja US escreve "Hayato Sano & Jinto Yoshida".
- ME82. A variante branca do selo da Apple no tema escuro: o Toolbox tem as duas (P81), e só a preta entrou no repositório. Não achei regra oficial para fundo escuro (busca de 13/10/2026); baixar a branca pede a permissão do usuário.
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

- ME100. No iPhone, conferir se o `<audio>` de reserva obedece ao volume (`?htmlAudio=1`). Hipótese: o iOS ignora o `volume` do elemento (só leitura, sempre 1), e lá a reserva não segue o nível da barra. Desde a ME99, o 0% liga o `muted`, que o iOS respeita: a conferir também.
- ME101. A prévia inteira da revelação toca com o volume da rodada, mas sem o controle nem o ícone do mudo: quem deixou em 0% ouve silêncio e não vê por quê (revisor do #46). Mostrar o controle na revelação, ou só o ícone do mudo, é decisão do usuário. **Cancelada** (o usuário, 22/10/2026): o volume da rodada vale também na revelação (P228).
- ME108. A regra 3 do `CLAUDE.md` diz que o `.claude/settings.json` nega a edição dos gerados, mas a lista de negação não cobre os do modo por artista (`web/public/*/artists/`, `pipeline/data/apple/artists/snapshots/`, os `romaji.json` de `artists/`) nem os do Anime (`web/public/*/anime/`, `pipeline/data/apple/anime/snapshots/`). Ampliar a lista é decisão do usuário (mexe nas permissões). **Feita** em 25/10/2026 (P373).
- ME110. O Treino e o modo por artista excluem do sorteio as respostas dos diários de hoje dos Hits (P141), mas não as do Anime: uma música que é resposta de um diário do Anime de hoje pode sair no Treino ou num artista e entregar a resposta (revisão do PR D2 do M14). Na parada real é raro, porque pede o mesmo `songKey` nos dois catálogos (a mesma faixa na parada e no acervo do Anime); nas fixtures, que dividem as faixas, acontece. Aceito por ora, como a P248 (os Hits e o Anime não se evitam); corrigir pede o índice do Anime carregado no Treino e nos Artistas, que hoje não o baixam.
- ME114. O MAL da franquia no "acertar o anime": a 2ª temporada de um anime conhecido leva o nível do MAL dela, mais baixo, mas quem conhece a franquia reconhece a música. O "You", 2ª abertura de Mahoutsukai no Yome, ficou no Médio, e o usuário o põe no Fácil. Usar o maior nível da franquia, com um desconto, muda as faixas de todo o acervo e pede recalibrar (P273). Da calibração do C2, 22/10/2026.
- ME115. O "Kaikai Kitan" (Eve), 1ª abertura de Jujutsu Kaisen e uma das mais conhecidas (playlists 9 e quiz 8), ficou fora do acervo: o tema não casou com nenhuma faixa da discografia na Apple (`no-match`, no snapshot do C2). A causa está por investigar (o casamento do título ou a discografia achada). Da calibração do C2.
- ME116. Um sinal do título no "acertar a música": o nome estilizado ("sh0ut") ou genérico em inglês ("1st Love Story") é mais difícil de lembrar e de digitar do que as fontes dizem; os dois ficaram uma faixa mais fácil do que o usuário põe. Nenhuma fonte mede isso: pediria uma regra nova, com teste. Da calibração do C2.
- ME117. Os pesos do tipo do tema no sorteio (P252) e o espaçamento da franquia entre dias (7 dias) continuam os provisórios do A2: o C2 calibrou as faixas, que já levam o tipo do tema, e deixou os dois para depois. Na agenda do C2 (25/10 a 12/11), o espaçamento afrouxou em 15 das 57 rodadas do Fácil do "acertar o anime".

**De 22/10/2026** (o Histórico, M15):

- ME112. O menu com submenus no celular (o pedido do usuário, 22/10/2026): cada categoria da nav abre o seu (os Hits com o Normal, o Desafio e o Treino; o Anime com os 2 modos), além do "Mais ▾" da P265, que só junta os Artistas e o Histórico. Muda o caminho até os diários, que hoje passa pelas telas dos Hits e do Anime.
- ME113. O Treino e os Artistas excluem do sorteio só as respostas pendentes dos diários de hoje (P141, `pendingDailySongKeys`): com o Histórico, uma resposta de um dia passado ainda não jogado pode sair no Treino e entregar o dia. Aceito, como a ME110: excluir as dos 14 dias tiraria até ~84 das 122 faixas do Treino na parada real, e o jogado depois não conta nas estatísticas (P263). O mesmo vale para a ajuda do diário de hoje, que pode oferecer a resposta de um dia passado ainda não jogado (o `/code-review` do PR 2); o contrário, a ajuda de um dia passado com a resposta de hoje, foi corrigido (`answerKeysOf`), porque o de hoje conta nas estatísticas.

**De 23/10/2026** (o resto da ME81):

- ME121. O romaji de 廻人 (Eve): o cutlet lê "Megurunin", e a leitura oficial seria "Mawaribito" (hipótese, sem fonte: a busca de 23/10/2026 na web e na loja US da Apple não a confirmou). A faixa `apple:tr:1611017835` e o álbum `apple:al:1611017834` vão no `aliases.toml` dos artistas quando alguém confirmar.

**De 23 e 24/10/2026** (as Misturadas, M17, Apêndice P):

- ME122. O modo "Qual é a mais popular": tocam duas músicas, e a pessoa escolhe a mais popular. Para depois (o usuário, 23/10/2026). Virou o M18, o quiz do dia, em desenho desde 25/10/2026.
- ME125. As Misturadas nas estatísticas (P333). O Histórico delas entrou no PR #98 (P368, P369); falta a outra metade: hoje o resumo tem só os pontos de cada rodada, o compartilhar e a contagem.
- ME127. Calibrar os pontos das Misturadas (P342) e o custo do "Separar" (P327) depois de mais escuta. A régua da muito conhecida, que também esperava calibração, saiu (P359, P362).
- ME130. Um compressor por voz na mistura das Misturadas, se as pausas no meio do trecho ainda deixarem uma música sozinha (P358). Testar antes de ouvido, no laboratório: ele muda o som.

**De 24/10/2026** (o latino do Anime, P370 a P372; a revisão do PR #99):

- ME131. O latino do AnimeThemes também erra: no catálogo do Anime real, "いきるひとびと" (MOB CHOIR, `apple:tr:1451937930`) está como "Ikeru Hitobito" (seria "Ikiru"), e "眠れる本能" (YURiKA, `apple:tr:1486723575`), como "Nemureru Honoo" (seria "Honnou"). O Anime já mostra assim, e nenhum dos dois está nos Hits nem nos artistas hoje. A correção vai no `aliases.toml` do Anime, que vence o AnimeThemes; o `anime-latin` a leva depois aos Hits e aos artistas, junto com o `build` e o `build-artists` (Apêndice B, "O latino do Anime").
- ME132. "リフレインボーイ –TV size-" (`apple:tr:1168949581`) aparece no Anime real como "Refrain Boy -English ver.-": o nome de outro tema entrou como o latino da faixa (a causa, no casamento ou no AnimeThemes, por investigar). Junto, o travessão curto (U+2013): o NFKC não o troca pelo hífen, e o `strip_version_suffix` e o `artist_base_title` não o tomam por sufixo. O `anime-latin` já o troca antes de comparar; corrigir na normalização muda as chaves e pede os vetores (regra inviolável 6).

**De 25/10/2026** (o tamanho do save no navegador):

- ME133. O save cresce com cada jogo terminado, e é o único dado que cresce no navegador do jogador (o cache HTTP guarda uma cópia por arquivo, que a versão nova substitui). Um diário ocupa uns 250 bytes: quem joga os 10 do dia (Hits, Anime e Misturadas) soma uns 0,94 MB por ano, e o `localStorage` tem uns 5 MB por origem (a conta exata muda de navegador para navegador; a origem `plasmastorm49.github.io` é dividida com qualquer outro projeto do usuário no Pages). Cheio, o jogo segue em memória e avisa (`sessionStore`). A ordem: (1) compactar a forma de cada jogo (`{"status":"won","stage":2,"attempts":[...]}` numa forma curta, umas 4 vezes menor), por migração, sem perder nada; (2) mostrar o tamanho no "Seu progresso", com um aviso a 80% que sugere o "Exportar" (ME103); (3) só se um dia for preciso, um resumo dos anos antigos (os totais, a distribuição, a melhor sequência e as medalhas ganhas), que revisa a regra 12 do `web/CLAUDE.md`: hoje as estatísticas e as medalhas são recalculadas do histórico, e apagar jogos antigos as mudaria. Não é urgente (o usuário, 25/10/2026).
- ME134. Um caminho sem o MAL para o Anime e para o quiz do dia, caso a API dele caia por qualquer razão: fora do ar, mudança na API ou a chave revogada (o usuário, 25/10/2026: a queda por outra razão é bem mais provável que a revogação). Hoje o nível do MAL entra na chance das faixas (P272), a busca de animes novos recusa sem ele (P335), e o quiz usaria a nota, os membros, os gêneros, a fonte e os estúdios, sem guardar (o desenho em estudo, 25/10/2026). O plano: o que cada parte perde sem o MAL, a fonte de reserva de cada uma (o AniList, consultado sem guardar, para os gêneros e a popularidade; a Wikidata para os episódios) e o que o robô faz quando o MAL falha (o Anime cresce com o acervo de antes, e o quiz deixa de sortear as famílias que dependem dele).

**Feitas:**

- Em 25/10/2026, no PR de documentação: ME108 (a lista de negação do `.claude/settings.json` com os gerados dos artistas, do Anime e o `latin.json`, P373).
- Em 24/10/2026, no PR #98: a 1ª metade da ME125 (as Misturadas no Histórico, P368 e P369; as estatísticas continuam abertas).
- Em 24/10/2026, no PR #97: ME126 (o cartão das Misturadas na Início, ao lado do dos Artistas, P366 e P367).
- Em 24/10/2026, no PR #95: ME128 (saiu o `_REDONE_DAYS` do `cli.py`; o teste dele virou o de que nenhum dia gravado muda, nem antes de chegar) e ME129 (o `pipeline/tests/conftest.py` põe, só no Windows, um invólucro do `jq -b` na frente do PATH da sessão de testes; na CI, nada muda).

- Em 24/10/2026, no PR #87: ME123 (as 4 medalhas das Misturadas, P351 a P353; o Apêndice P, "Os ajustes de 24/10/2026").
- Em 24/10/2026, no PR #85: ME124 (o robô cresce as Misturadas junto com o Anime; o Apêndice P, "O robô").
- Em 23/10/2026, no PR #80: ME103 (o progresso num arquivo, sem servidor: o "Seu progresso" no Sobre, com o exportar e o importar de um `atemusic-progresso-<data>.json`, e o "Guardar uma cópia" no pop-up das medalhas grandes, o lugar da P279; a conta em `storage/transfer.ts` e a tela em `ui/Progress.tsx`). Só por arquivo, sem o código. O andamento não viaja, a importação passa pelas migrações e conferências do save, recria cada jogo só com os campos conhecidos e substitui o progresso daqui depois de uma confirmação com o que o arquivo traz e o que sai.
- Em 23/10/2026, no PR #79: ME107 (a pontuação nova, `core/rules.ts`): toda rodada vale até 10, em todos os modos, e o acerto vale menos quanto mais do trecho foi ouvido (`pointsAt`: na barra dos diários, 10, 8, 6, 5, 4 e 3; na do Superfan, 10, 6 e 4); com a ajuda, a metade para cima; errar, desistir e o "Não sei" valem 0, e o placar nunca fica negativo. No Superfan, as 3 vidas e o bônus de 5 por vida que sobra na partida completa (`core/superfan.ts`); nas estatísticas, a distribuição em faixas de 3 pontos. Os textos do Apêndice D e do README ainda não foram revistos.

- Em 23/10/2026, num PR só (os pequenos 2):
  - o resto da ME81: os álbuns dos mesmos lançamentos, que o cutlet leu à parte (廻廻奇譚, 踊 e o single de あなたに出会わなければ), e o 風と私の物語, na faixa e no single ("watashi", como o 私は最強), no `aliases.toml` dos artistas. O 廻人 virou a ME121;
  - ME76: a região `aria-live` fica vazia na troca de aba e quando a sessão do Treino ou a de um artista termina (o "Reiniciar o Treino" e o "Trocar de artista", que não trocam o fragmento);
  - ME68: o nome do artista com a língua dele na linha da sessão da Início e nos avisos de carga e de falha (o `tAround`, que só aceita uma chave com o `{slot}`, e o `WithName`);
  - ME41: "sem diário" no pipeline, no robô, no README e no título do `schedule.schema.json`;
  - S16: o `--today` no `schedule-check` do `/verificar` e do `CLAUDE.md`;
  - ME83: a base conferida em todo caminho absoluto do `index.html`, em qualquer atributo, e o favicon e o ícone de app no `dist`, na CI, no deploy e no `/verificar` (os passos 10b e 10c).
- Em 23/10/2026, num PR só (os pequenos):
  - ME106: a aba ativa em negrito não empurra mais as vizinhas (P324);
  - a 1ª parte da ME37: o Tocar continua com o foco no "Carregando…". O botão principal usa o `aria-disabled` e ignora o clique, e o navegador não joga mais o foco no `body`;
  - ME119 e ME81: cinco romaji errados nos artistas, no `aliases.toml` deles: 廻廻奇譚 "Kaikai kitan", 蜃気楼 "Shinkirou", 踊 "Odo", 私は最強 "Watashi wa saikyou" e あなたに出会わなければ〜夏雪冬花〜 "Anata ni deawanakereba kasetsu touka". As outras leituras dos artistas não foram relidas uma a uma;
  - a trava da lista de exemplo das medalhas no build: a tarefa `web` da CI e o passo 9b do `/verificar` recusam o `dist` com o objeto de uma medalha de exemplo (`id:"demo-`, com qualquer aspa).
- Em 23/10/2026: ME120 (o pedido do usuário: voltar à tela do Anime sem a nav; a seta na escolha da dificuldade e o "Voltar" no resumo de um diário, sem tirar altura, P321 a P323).
- Em 23/10/2026: ME118 (a estante, com uma medalha só: a medalha em destaque no canto da nav, escolhida nas Medalhas, P317 a P320; mostrar mais de uma fica para depois, se o usuário pedir).
- Em 23/10/2026, no M16 (PRs 1 a 3b, Apêndice O): ME105 (as medalhas, o pedido do usuário de 21/10: a tela, os dois avisos, as 13 gerais e as 3 do Superfan de cada artista, com a capa, o buquê nas cores dele e o nome próprio; o save v8 com o modo por artista e o v9 com os acertos do Treino).
- Em 22/10/2026, no M15 (PRs 1 a 3, Apêndice N): ME104 (o pedido do usuário de 21/10: os 14 dias antes de hoje num calendário, com a marca dos Hits e a do Anime, a tela de cada dia e o jogar depois o que faltou, das duas categorias, fora de todas as estatísticas; o save v7 com o `late`; a nav do celular com o "Mais ▾").
- Em 22/10/2026, no PR B do M14 (o robô do Anime): ME109 (a agenda fictícia do Anime parava em 09/11; o robô a cresce junto com a real, nas semanas em que o Anime gera, com `schedule-anime --provider fixture --days 28`, Apêndice M, "O robô").
- Em 22/10/2026: ME36 (as 3 actions com versão nova, pelo SHA do commit: `setup-node` v7.1.0, de 08/10, e `upload-artifact` v7.0.2 e `download-artifact` v8.0.2, de 07/10; as notas só trazem melhoria e correção, como as novas tentativas no HTTP 429 dos artefatos).
- Em 22/10/2026, no PR C2 do M14 (a carga grande do Anime): ME111 (a franquia de uma resposta não volta nos outros diários do dia, nos dois modos, porque a ajuda do acertar o anime mostraria a franquia "de hoje" a quem jogou o outro diário; é o nível 2 do afrouxamento, depois do espaçamento entre dias e antes da janela das músicas, e vale só para os dias novos).
- Em 21/10/2026, no PR D3 do M14 (a estreia do Anime, com a carga de teste do C1): ME97 (uma categoria de músicas de anime populares, o pedido do usuário; virou o M14, Apêndice M, com o acervo montado pelo robô sem revisão humana, P238, que revisa a P223). A categoria Anime na nav, os 2 modos (acertar a música e acertar o anime) em 3 dificuldades, 6 diários por dia, a ajuda, os créditos e o "Sobre e privacidade". Ficam para depois a carga grande (C2) e o robô (B).
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
- **Exibição em Hepburn.** A grafia estrangeira ("Curtain call") entra só na busca, porque às vezes erra ("Tokyo right" para 東京ライツ). Desde a P371, a do AnimeThemes, feita por pessoas, também é exibida.
- **Antes de romanizar,** emoji e invisíveis saem e `・` vira espaço. Sem isso, o cutlet produziria `?` e `/`.
- **Precedência do latino exibido:** `aliases.toml` (`manual`) > provedor (`provider`) > cache (`cutlet`). Nos Hits e nos artistas, desde a P370, o provedor é o da Apple e, sem ele, o da mesma música no Anime.
- **Erro de romaji não muda o resultado do palpite**, que é sempre por ID. Afeta só o autocompletar do Desafio para aquela música, e se corrige com uma linha no `aliases.toml`.

**Resolvido no M7:** a regra `di`→`ji` da chave frouxa também pega o "di" de ディ ("merodi" vira a chave `meroji`), e "merod" deixava de ser começo de chave no meio da digitação. A variante sem a última letra (`d`) resolve.

**Validação do palpite:** sempre por **ID** escolhido na lista, nunca por texto livre. No Desafio, acerta quem escolhe o mesmo `songKey`. No Normal, acerta quem escolhe qualquer álbum que contenha o `songKey` da resposta e, desde o checkup (ME21, `acceptedIds` em `core/catalog.ts`), o do mesmo lançamento que o catálogo não liga à música, porque o lookup traz um álbum só por faixa. Do mesmo artista de um álbum certo, vale:

- o álbum com a música numa parte do nome: o EP "爆裂愛してる / 好きすぎて滅! - EP" tem 好きすぎて滅!;
- o álbum com o nome inteiro de um álbum certo (sem " - Single" ou " - EP"): os dois "ROSE - Single" da HANA aparecem iguais na busca, e recusar um seria injusto, mesmo para o lado B (Tiger).

Uma parte só do nome de um álbum certo não basta (a resposta 爆裂愛してる, do EP, não está no "好きすぎて滅! - Single"), e um nome que a normalização esvazia ("♡") não casa. O cálculo é feito na tela, então vale também para os dias já gravados. O histórico guarda o resultado, e jogo terminado não muda.

### O latino do Anime nos Hits e nos artistas (#99, 24/10/2026)

A pergunta do usuário: a mesma música dos três acervos é guardada uma vez ou três? Três: cada modo tem a sua busca na Apple, os seus snapshots e os seus arquivos, e o áudio de nenhum é guardado. Nos arquivos publicados de 24/10, só 41 faixas estavam em mais de um modo (6 entre os Hits e o Anime, 6 entre os Hits e os artistas, 33 entre o Anime e os artistas; 2 nos três), e as repetidas pesam uns 33 KB no catálogo do Anime, de 1,9 MB sem o recuo: juntar os acervos não compensaria, porque cada um cresce no seu ritmo. O problema era o latino: em 11 das 41, o nome divergia, e em 7 o nome de um modo não achava a música na busca do outro (明け星: "Akeboshi" no Anime e "Ake hoshi" nos artistas; "akeboshi" não a achava, porque a busca pede que a chave comece com o texto digitado ou o contenha).

- **O arquivo** (P372): o `anime-latin --provider X` lê o catálogo do Anime publicado e grava o `pipeline/<fixtures|data/apple>/anime/latin.json`, com a versão do catálogo de onde saiu, o provedor e o latino de cada música, pela `anime_latin_key` (o título inteiro normalizado e o 1º artista; `catalog.py`). Entram só o `provider` e o `manual` do Anime. Ficam de fora o título com sufixo de versão ou de crédito (pelo `artist_title_key`, depois de trocar os travessões pelo hífen, ME132), porque o latino do tema não tem o sufixo, e a chave com dois latinos diferentes, com aviso.
- **A leitura** (P370): o `Curation.anime_latin` do `build` e do `build-artists` (o `_anime_latin_of` do `cli.py`, que recusa o arquivo de outro provedor). O `anime_latin_of` procura o título inteiro e, sem ele, a música sem o sufixo de versão, devolvendo o latino com o sufixo, se o sufixo já é latino. O `_track_record` dos Hits e o dos artistas o passam como o latino do provedor depois do da Apple e o somam à busca; o `album_record`, só no single e no EP. O `build-anime` não lê o arquivo.
- **O aviso:** o `build` e o `build-artists` dizem quando o `latin.json` é de outra versão do catálogo do Anime publicado, sem mudar a saída.
- **A rotina** (P372): depois de uma carga do Anime ou de um PR do robô que traga o Anime, rodar o `anime-latin --provider apple`, o `build --provider apple` e o `build-artists --provider apple` num PR à parte. O robô não toca o arquivo: ele não está na lista fechada.
- **Os números:** 614 títulos no real e 29 nas fixtures. Mudaram, no real, a "インフェルノ" nos Hits ("Inferuno" virou "Inferno") e 10 músicas nos artistas, com os singles delas, e a busca ganhou o "akeboshi" e o "zankyozanka"; nas fixtures, 23 faixas nos Hits e 7 nos artistas. Depois, nenhuma música dos três acervos, pelo título e o 1º artista, tem dois latinos.
- **A revisão** (o `revisor`): o single com o latino antigo, a versão "(TV Size)" divergindo das outras, o travessão curto, o aviso, o arquivo de outro provedor e os testes que faltavam entraram no PR. O erro do latino do próprio AnimeThemes virou a ME131, e o do "Refrain Boy", a ME132.

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
- **`useResolvedUrl`:** o Tocar fica em "Carregando…", desabilitado, até a URL chegar. Desde a ME37, pelo `aria-disabled`, que deixa o foco nele (o `disabled` o jogava no `body`). As opções já aparecem.
  - O foco vai para o Tocar quando a URL chega, mas só se o jogador ainda não foi para outro lugar (o campo de digitação, uma opção).
  - Se a resposta chega entre a pintura e o efeito, o efeito assina mesmo assim e desenha de novo.
  - Faixa sem prévia nenhuma (nem o lookup nem a reserva) anula a rodada, como uma falha de áudio.
  - O diário pede as faixas do dia (Música e Álbum) numa consulta só, já na carga, antes da escolha do modo; o Treino pede de 2 em 2. Desde o checkup, só as dos diários sem resultado (`pendingDayTracks`): o diário terminado mostra o resumo e gastava a cota do lookup.
- **Player** (checkup, ME19, ME20 e ME32, PR #13):
  - uma ficha por reprodução: só a mais nova mexe na tela. No Web Audio, o fim de um trecho interrompido chega uns 10 ms depois do stop, quando o trecho do "Ouvir mais" já começou, e parava a barra e devolvia o "Tocar" com o som tocando. O motor falso do e2e nunca é interrompido, por isso o bug passou desde o M5; o teste de componente usa um motor como o Web Audio;
  - o motor parado antes de o som começar (um palpite na digitação, a aba oculta) devolve `null`, e a tela volta ao "Tocar";
  - quando o som começa, o foco volta ao botão principal só se tiver caído no `body` (o "Ouvir mais" que some na última etapa, o "Ouvir mais" desabilitado enquanto o som começa). Num "Ouvir mais" do meio, o foco fica nele;
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
- **Conteúdo (`Save`, v10 desde o PR B do M17):** `{ schemaVersion: 10, history, inProgress, seenMedals, shelf, artists, practiceRight, mixed }`. Os dois mapas por `"2026-10-08|album"` (o Normal), `"2026-10-08|song"` (o Desafio) ou, desde a v6 (P250), `"2026-10-08|anime-musica-facil"` (os 6 diários do Anime, com as regras do Desafio).
  - `history`: o `FinishedGame` de cada dia, `{ number, rounds: [{ status, stage, attempts, help? }], late? }`. O `late: true` (v7, P267) marca o jogado depois, pelo Histórico, que fica fora das estatísticas; sem ele, foi jogado no dia. Pontos e máximo saem de `status`, `stage` e `help`; nada derivado é gravado. O `help` (P149) só existe na rodada com ajuda: quantas tentativas tinham sido gastas quando ela foi pedida (depois dela vêm pulos, desde a P163, e no fim no máximo a opção). O `isFinishedGame` confere as tentativas pelas regras do modo, que sai do id: no Normal, no máximo 1, nunca um pulo nem ajuda.
  - `inProgress`: `{ events }`, só os eventos que o reducer aceitou. O cartão da home mostra "em andamento" desde o 1º evento.
  - `seenMedals` (v8): os ids das medalhas já avisadas, em ordem (P281). `shelf` (v8): a estante (ME118), até 3 ids, na ordem da pessoa; o 1º é a medalha em destaque na nav (P317), e por enquanto só ele é usado. O guard aceita só textos no formato de id, sem repetidas; o id desconhecido fica, porque pode ser de uma lista mais nova.
  - `artists` (v8, P289): o modo por artista, pelo id do artista, `{ right, done?, perfect? }`: os acertos e o fim do Superfan (terminou, terminou perfeita), que só crescem. O resto da partida continua só na memória (P116).
  - `practiceRight` (v9, P308): as rodadas acertadas no Treino, com ou sem ajuda, que só crescem. A sessão continua só na memória (P50).
  - `mixed` (v10, M17): as Misturadas, `{ finished, progress }`, por `"2026-10-24|misturadas-musica"` ou `"...|misturadas-titulo"`, à parte do `history` e do `inProgress`: as estatísticas, a sequência e o Histórico não as veem (P333); as medalhas, sim, desde a ME123 (P351). O terminado é `{ number, rounds: [{ status, found }] }`, com um achado por música (`{ stage, help? }`, ou `null` para a que faltou) e sem ids de faixa; o andamento, os eventos aceitos pelo `mixedReducer` (Apêndice P).
  - O `settings` (a preferência do modo de resposta, M7) saiu com a P100. Um campo que o save não usa mais é ignorado sem aviso.
- **Retomada por eventos:** `startSession` repete os eventos sobre o jogo novo do dia. Como o reducer é puro, recarregar retoma igual, inclusive rodada anulada. Se a repetição chegar ao fim, o jogo vira histórico. Se ela descartar eventos (catálogo novo no mesmo dia), a sessão sai com `stale` e a aba regrava a lista aceita com `replaceProgress`; sem isso, a regra da lista mais longa impediria gravar os próximos eventos.
- **Ajuda salva** (P149): o evento `HELP` guarda as opções. **Limitação aceita:** se o catálogo novo do mesmo dia mudar o `songKey` da resposta, a repetição recusa o `HELP` (a resposta não está mais entre os aceitos), e a escolha seguinte volta como palpite comum; é o mesmo risco que os palpites já têm (`stale`).
- **Virada do dia:** ao abrir, fica o `inProgress` de hoje e dos 14 dias do Histórico (P269), e o resto é descartado. Quem começou o dia D com a aba aberta termina o dia D, e conta como no dia; recarregar depois da meia-noite retoma o andamento, mas o término passa a contar como jogado depois (P268).
- **Tolerância a falha:**
  - `openStore` testa o armazenamento só com uma **leitura**; se ela lançar ou o armazenamento não existir, o jogo segue em memória, com aviso. A sonda não grava: com a cota cheia, o save que já existe ainda é lido (dia terminado continua terminado).
  - JSON ilegível ou fora da forma: o texto original vai para `musicle-jp:corrupt` (só se a chave estiver vazia) e o jogo recomeça. Entrada inválida dentro de um save bom é descartada sozinha; mapa ausente vira vazio sem levar o histórico junto.
  - Versão maior que a suportada: não é sobrescrita; o jogo segue sem salvar, com aviso.
  - Falha ao gravar: `updateSave` devolve o motivo (`full`, `future` ou `unavailable`), e a tela mostra o aviso certo uma vez, visível e na região `aria-live`.
  - Migrações em `storage/migrations.ts`, uma função por versão, cada uma com o teste de um save real da versão anterior. **v1 → v2** (M11, P68): o jogo trocou a parada fictícia pela real, e as chaves são por data, então o dia fictício e o real do mesmo dia se misturariam. A migração zera o histórico e o andamento e mantém só a preferência do modo. Uma aba antiga, ainda com o código v1, lê o v2 como "future" e para de gravar. **v2 → v3** (P100): saiu o modo de resposta, e a migração zera tudo, a preferência junto (eram só jogos de teste). **v3 → v4** (P149): a ajuda, com o evento `HELP` no andamento e o `help` da rodada. Nada muda no que existe; a versão sobe para que uma aba com o código v3 (que recusaria o `HELP` e jogaria fora o andamento) leia o v4 como "future" e pare de gravar. **v4 → v5** (P163): o "Pular" depois da ajuda, com o `SKIP` depois do `HELP` no andamento e pulos depois do `help` da rodada. Também nada muda, e a versão sobe pelo mesmo motivo: o código v4 recusaria o pulo e jogaria fora o dia. **v5 → v6** (P250): os ids dos diários do Anime; nada muda, e o código v5, que não os conhece, os jogaria fora. **v6 → v7** (P267): o `late` do jogado depois; nada muda, e o código v6 contaria o jogado depois nas estatísticas e apagaria o andamento de um dia passado. **v7 → v8** (P289): acrescenta os três campos, vazios; o `sanitize` do código v7 os jogaria fora, e o aviso único da P281 se repetiria. **v8 → v9** (P308): acrescenta o `practiceRight`, zerado; o `sanitize` do código v8 o jogaria fora. **v9 → v10** (M17, PR B): acrescenta o `mixed`, vazio; o `sanitize` do código v9 o jogaria fora.
- **Duas abas:** `updateSave` relê, mescla e grava. No histórico, o primeiro término vence; no andamento do mesmo jogo, vence a lista de eventos mais longa. O resumo relê o save, então mostra o resultado que ficou gravado. **Limitação aceita:** com duas abas dá para refazer uma rodada (uma erra e vê a resposta, a outra acerta); o jogo é pessoal e não há ranking.
- **Abas do jogo** (M8, P49): o `App` guarda a última leitura do save (`latest`), que a home também lê para os cartões, e relê ao trocar de aba, quando um diário termina (`onSaved`) e quando outra aba do navegador grava (evento `storage`). Cada aba de diário monta do zero com essa leitura e a guarda na montagem (o `latest` muda a cada gravação, e recalcular a sessão com ele pularia a revelação da última rodada), então voltar ao Desafio terminado mostra o resultado (P39). O Treino grava só o total de acertos (P308), e o modo por artista, os acertos e o fim do Superfan (P289), os dois sem reler o save (a tela das Medalhas relê ao trocar de aba).
- **Save da sessão** (`sessionStore`, M8): grava no navegador quando dá; o que não consegue gravar (cota cheia) fica em memória, e sem gravação nenhuma (versão futura ao abrir, sem acesso) tudo fica em memória. Assim trocar de aba não perde o andamento nem nesses casos. O que foi gravado não fica em memória, para a mescla das duas abas continuar vendo o que a outra gravou. **Limitação aceita** (revisão de 12/10, ME48): se outra aba, com uma versão mais nova do jogo, grava no meio da sessão, o `updateSave` para de gravar (nunca sobrescreve a versão maior) e o aviso pede para recarregar; trocar de aba antes disso relê o save mais novo, que este código não lê, e o andamento da sessão se perde.
- **Estatísticas:** função pura sobre o histórico, por diário (P249): jogos, média, distribuição de 0 a 18, sequência atual e melhor (P38, P40, P41). O jogado depois fica fora de todas, e o dia dele continua buraco na sequência (P263). "Hoje" é a data do jogo, não o relógio; hoje ainda não jogado não quebra a sequência. **Dia que faltou** (Action ou merge parados por mais de 21 dias): desde a P44, no M10, ele vira buraco e não quebra a sequência. Risco residual: dias gerados durante uma parada e publicados só no merge entram na agenda sem que ninguém os tenha podido jogar.
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
  - **`web`:** `npm ci`, `npm run check`, `npm run build` e a conferência de que o motor de áudio falso não está no `dist`. Desde 23/10/2026, também a lista de exemplo das medalhas: o objeto de uma delas (`id:"demo-`, com qualquer aspa, como sai minificado) não pode estar lá. Os textos dela (`medal.demo-…`) ficam no pacote, com o resto do i18n, e não casam com o padrão.
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
  - a tarefa `web` da CI confere a base no `dist/index.html`: sem ela, a página publicada ficaria em branco. Desde a ME83 (23/10/2026), em todo caminho absoluto, em qualquer atributo (um `srcset`, o `content` de uma `og:image`), e com o favicon e o ícone de app no `dist`; o deploy confere o mesmo antes de publicar. Sem um `shell:` declarado, o passo roda no `bash -e`, sem o `pipefail`: o `if grep … | grep -v …` vale nos dois.
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
  - `catalog-runway` (checkup, ME28; só leitura): depois das outras, mesmo quando elas falham (`!cancelled()`), confere a agenda da `main` com a data de Brasília calculada por ela mesma. Fica vermelha, e o GitHub manda e-mail, com menos de 10 dias à frente: numa semana normal são 14 antes do merge de segunda; com uma semana sem merge, 7. O aviso do deploy (ME14) só sai quando há deploy. Desde o PR B do M14, ela confere também a agenda do Anime (a ausente vira uma linha no resumo);
  - **o Anime** (PR B do M14, Apêndice M, "O robô"): duas tarefas a mais, `anime-mal` (o ranking do MAL, com o segredo `MAL_CLIENT_ID`, numa máquina sem permissão nenhuma e sem pip) e `anime-generate` (`contents: read`, sem segredo), que rodam ao lado da `catalog-generate`. A `catalog-pr` passou a precisar das duas que geram e roda quando uma deu certo e mudou algo; o passo de conferência chama o `catalog-pr.sh`, que roda o `check-catalog-pr.sh` (sem mudança) e o `check-anime-pr.sh`;
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

A categoria Anime (ME97, P230 a P258): 6 diários por dia, de 3 rodadas digitadas, com as regras do Desafio (a pontuação de todos os modos mudou na ME107, em 23/10/2026).

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
- **As faixas** (P240, P252; desde o C2, P272 a P275): no A1 e no C1, uma soma dos níveis do tema e do anime, com cortes provisórios. O C2 a trocou pela chance de acertar cada modo, com cortes fixos (o detalhe na seção "A carga grande (PR C2)", no fim do arquivo). A música que está em dois temas fica com a maior chance. A `popularity` publicada sai só da faixa (1, 0,6667 e 0,3333), para nenhum nível de fonte ir para o arquivo. O `songKey` usa a chave do modo por artista, que junta a TV size e a completa.
- **O catálogo publicado** (`web/public/data/anime/catalog.json`, schema `shared/schema/anime-catalog.schema.json`): um `PlayableCatalog` como o de um artista (sem a parada e sem os distratores), com as franquias (`anime:fr:<slug>`, o nome e as chaves de busca de todos os títulos e sinônimos dos animes dela) e, em cada faixa, o bloco `anime`: as franquias, os temas (o anime, o tipo e o número) e a faixa de cada modo. O título do AnimeThemes é o latino da faixa em japonês e uma chave da busca; os nomes dos artistas do AnimeThemes também acham a faixa. Nada do MAL vai para o arquivo publicado.
- **O tamanho:** 1.000 músicas dão uns 2,1 MB (a medida do teste `test_a_thousand_songs_fit_under_the_cap`); o teto era de 3 MB (`validate_anime.MAX_FILE_BYTES`) e, desde a P361, é de 5 MB.
- **Os comandos:** `build-anime --provider fixture|apple` e `validate-anime --provider fixture|apple`.

### A agenda (PR A2)

- **O arquivo:** `web/public/<fixtures|data>/anime/schedule.json`, schema `shared/schema/anime-schedule.schema.json` (tipos `AnimeSchedule` e `AnimeDay` na web). O cabeçalho é o da agenda dos Hits com um `kind: "anime"` constante; cada dia tem o `number`, o `catalogVersion` e os 6 diários, `musica` e `titulo`, cada um com `facil`, `medio` e `dificil`, de 3 rodadas `{"answer": <faixa>}`. Só cresce (regra inviolável 4).
- **O código:** `anime_schedule.py`. O laço da geração dos Hits virou o `grow` do `schedule.py` (o cabeçalho, a P44, o horizonte e a defesa do `compare`), comum às duas agendas, e o `regenerate_problems` recebe o gerador. O `_generate_day` e o `_candidates` dos Hits não mudaram, nem o consumo do rng deles: as agendas dos Hits regeradas pelo código novo saem com os mesmos bytes (conferido do zero e crescendo, nos dois provedores).
- **Os diários:** em ordem fixa (para cada modo, cada dificuldade), cada um com o rng de `musicle-jp|anime|<data>|<modo>|<dificuldade>` e 1 número por rodada. As candidatas são as faixas elegíveis com a faixa do modo igual à dificuldade.
- **A janela** (P235, P245): a música (o `songKey`) que saiu em qualquer diário, dos dois modos, nos últimos K dias fica de fora; K = 21, 28 e 35 (Fácil, Médio, Difícil), contando hoje: a música de K dias atrás volta. Por isso o mínimo de 6 × K músicas por dificuldade (3 por dia em cada modo) basta, sem folga: o teste dos 61 dias usa exatamente ele e não afrouxa nada. Com acervo curto, K = mín(K, músicas do diário // 6), no mínimo 1: as fixtures ficam com 1 e 2 dias, e a carga de teste (~18 por dificuldade), com 3.
- **Dentro do dia:** nenhuma música repete nos 18, e no `titulo` nenhuma franquia repete no diário. Essas duas nunca afrouxam. Desde o C2 (ME111), a franquia de uma resposta também não volta nos outros diários do dia, dos dois modos, mas essa afrouxa (o nível 2, abaixo).
- **O afrouxamento,** com registro (o `schedule-anime` imprime cada um, para o corpo do PR): o nível 0 também espaça a franquia entre dias (a que saiu nos últimos mín(7, K) dias fica de fora); o nível 1 tira esse espaçamento; o nível 2 (desde o C2, ME111) deixa a franquia repetir no dia; do 3 em diante, a janela encolhe até 1 (só as regras do dia que nunca afrouxam). A agenda fictícia (13 franquias para 34 músicas) afrouxa só o nível 1, quase todo dia, no Médio (a janela de 2 dias barra as franquias de ontem): ~100 rodadas em 33 dias, nenhuma na janela das músicas.
- **A preferência** (P236): o sorteio sai do terço mais antigo das candidatas, pelo último dia em que cada música saiu, montado com a agenda anterior inteira (o ME51 continua: regerar os dias novos dá o mesmo). A nunca usada conta como a mais antiga, e os empates no corte entram juntos (no começo, todas).
- **O tipo do tema** (P252), pesos provisórios (o C2 os manteve, ME117): no Fácil e no Médio, abertura 3 e encerramento 1; no Difícil, abertura 3, encerramento 3 e insert 1. Vale o tipo mais fácil entre os temas da faixa. A preferência pelas mais antigas dilui o peso: a música que não sai envelhece e entra no terço. Num acervo sintético meio a meio, o Fácil fica em uns 60% de aberturas, e não 75%; as faixas do C2 já deixam quase só aberturas no Fácil (o fator do tipo, P272).
- **O horizonte:** `--days` (os dias à frente de hoje, como no `schedule`; o padrão é 21). A regra do robô (só gerar com menos de 21 dias à frente, P237) fica fora do gerador.
- **A validação** (`validate-anime`, com a agenda ao lado do catálogo ou a do `--schedule`): a estrutural vale para todos os dias (o schema, o epoch, o número, as respostas existem e nenhuma faixa repete no dia). As regras da geração (a resposta elegível e da faixa do diário, a música e a franquia sem repetir) são erro nos dias com o `catalogVersion` do catálogo de agora e só aviso nos de antes, porque o catálogo mudou depois (o jogo anula a rodada inelegível, e a faixa recalibrada só vale para os dias novos). Um dia de catálogo com data mais nova que a do publicado é erro. O aviso de acervo curto sai para cada modo e dificuldade com menos de 6 × K.
- **O `schedule-check`:** o `known_schedules()` devolve as quatro agendas com o tipo (as dos Hits e as do Anime, existam ou não), e o `_check_one` despacha pelo tipo (com `--path`, pelo `kind` do arquivo): o `compare` (que passou a conferir também o `kind`) e o `check_dates` são os mesmos, e os dias novos se regeram com o gerador e o catálogo do Anime ao lado da agenda.
- **A agenda fictícia:** o mesmo epoch (08/10) e os mesmos 33 dias da dos Hits (até 09/11), para o dev e o e2e terem os diários do Anime nas datas de sempre: `schedule-anime --provider fixture --today 2026-10-08 --epoch 2026-10-08 --days 32`. Esses dias já passaram, e o P44 da CI (`check_dates`) os recusaria: o `schedule-check` dispensa dele só a agenda fictícia nova (sem base), porque ninguém a joga. Depois de criada, o P44 vale para ela. Desde o PR B (ME109), o robô a cresce junto com a real, nas semanas em que o Anime gera (abaixo, "O robô").

### A busca (PR A3)

- **O comando:** `fetch --provider apple --anime --fetched-at <agora em UTC>` grava um snapshot novo em `pipeline/data/apple/anime/snapshots/`. O Client ID do MAL vem só da variável `MAL_CLIENT_ID` (nunca de um argumento, que iria para o histórico do terminal), e vai só no cabeçalho `X-MAL-CLIENT-ID`: um teste confere que ele não chega à URL nem ao snapshot.
- **O sorteio:** o ranking de popularidade do MAL (os 3.000 primeiros, em páginas de 500); sem a variável, os animes dos temas mais incluídos em playlists do AnimeThemes, e aí o anime fica sem nível do MAL. O peso é inteiro, pela posição (o 1º vale 3.000, o último 1), com o PRNG do projeto e a semente `musicle-jp|anime|<fetchedAt>`. Os animes já tentados (em qualquer snapshot) ficam de fora. Na 1ª carga, a lista do usuário (`--personal`, o XML do MAL: "Completed", "Watching" e "On-Hold", primeiro os de nota 8 ou mais) entra um a cada 7 (P253).
- **As fontes**, com o User-Agent do projeto (o do `urllib` leva 403 do Cloudflare no AnimeThemes e no AnisongDB):
  - o AnimeThemes (GraphQL, `findAnimeByExternalSite`, até 100 ids por pedido): o nome em romaji, o inglês e o japonês como sinônimos, as séries, os temas (sem os de um grupo, como "HD Remaster", que repetem a música) e as faixas de playlists de cada tema, no nível de 0 a 9;
  - o AnisongDB (`mal_ids_request`, até 500 ids): a taxa de acerto do quiz, os artistas que faltam no AnimeThemes (62% das músicas, na amostra de 21/10) e as insert songs. Casa com o AnimeThemes pelo tipo e pelo título, porque a numeração das duas fontes diverge. Sem o AnisongDB (ele pode sumir), a busca segue com o AnimeThemes;
  - a Apple: a busca do artista (`entity=musicArtist`; o nome igual, senão a chave estrita, senão a frouxa, que junta "Youko" e "Yoko"; entre homônimos, o de gênero anime; até 3) e o lookup das músicas dele (até 200), 4 s entre os pedidos. O cutlet, em cache, lê o título japonês.
- **Os níveis** (P254), em escalas fixas: a posição no ranking do MAL (até o 50º, 9; além do 6.000º, 0); as faixas de playlists do AnimeThemes (500 ou mais, 9; de 0 a 2, 0); a taxa de acerto do AnisongDB em décimos.
- **Quando para:** quando cada modo e faixa tem `--target-per-tier` músicas (as contas são as do build; desde o C2, aproximadas: a concorrência só do próprio anime e o ícone só pelos níveis), ou ao chegar a `--max-songs`, ou depois de `--max-anime` animes tentados.
- **O teste de fumaça** (21/10, sem o MAL, 2 animes): 5 de 12 temas casaram, todos certos (紅蓮の弓矢 = "Guren no Yumiya", 自由の翼, ジョーカーに宜しく, "great escape", "Steppin' out"). As insert songs de Shingeki saem na Apple como trilha do compositor, e não casam: o esperado.
- **Ficam para o C2:** o checkpoint e o prazo (a busca longa, retomável), o Kitsu de reserva, o top do Last.fm e o lookup dos álbuns quando o artista tem mais de 200 músicas.

### A web (PR D2)

O "acertar a música" jogável, com a carga sob demanda, a nav de 4 abas e as telas do Anime. O "acertar o anime" (a franquia), a ajuda com as franquias, os créditos (P241) e o "Sobre e privacidade" (P243) são do PR D3.

- **A carga sob demanda:** o `loadAnime` (`data/source.ts`) busca o `catalog.json` e o `schedule.json` da subpasta `anime/` da pasta de dados, em paralelo e revalidando o cache, como os Hits. O catálogo passa pelo `indexAnime` (`core/catalog.ts`, com a constante `SUPPORTED_ANIME_SCHEMA_VERSION`), que o transforma num `CatalogIndex` como o de um artista; a agenda precisa do `schemaVersion` 1 e do `kind: "anime"`. Versão desconhecida pede para recarregar a página; falha de rede, para tentar de novo. O estado fica no `App` (`useAnimeStore`, em `ui/Anime.tsx`, no molde do `useArtistStore`): carrega só quando uma tela do Anime abre, uma vez por sessão. Quem joga só os Hits não baixa nada (o e2e confere os pedidos). Nas fixtures, as prévias vêm do catálogo; na parada real, do `appleResolver` com o mesmo `LookupBudget` do App (regra 21). O diário pede na carga só as 3 faixas dele.
- **Os diários:** `animeDaily(day, date, mode, difficulty)` e `animeDailies(day, date)` (`core/daily.ts`). A chave e o id seguem o save v6 (`anime-<modo>-<dificuldade>`, `<data>|anime-...`); as regras são as do Desafio (`target: "song"`); o `answer` é `"track"` no `musica` e `"franchise"` no `titulo`; as rodadas e o nº são os do dia da agenda do Anime; o `avoid` tem as 18 respostas do dia do Anime, dos dois modos, e não as dos Hits (P248). A estatística é por diário (P249), com as datas da agenda do Anime. O nome do diário é uma chave do i18n (`daily.anime-musica-facil`: "Música · Fácil"), curto para o cabeçalho da rodada caber numa linha em 320 px ("Música · Difícil · nº 14", conferido no `layout.spec`); a aba marcada da nav já diz a categoria. O compartilhar diz a categoria: "AteMusic Anime · Música · Fácil nº 1".
- **O modo sem tela:** o `ANIME_OPEN_MODES` (`core/daily.ts`) lista os modos que já têm tela; no D2, só o `musica`. O cartão do "acertar o anime" diz "Em breve" e não é link, a escolha da dificuldade dele mostra as 3 em breve, e o diário dele avisa e volta ao `#anime`. O D3 só acrescenta o `titulo` à lista.
- **As rotas** (`core/routes.ts`): `#anime` (a escolha do modo), `#anime-musica` e `#anime-titulo` (a dificuldade) e os 6 diários, cuja aba é a chave do diário (`#anime-musica-facil`). Todas ficam na categoria `anime` do `categoryOf`; o `animeScreen` diz a tela de cada uma.
- **A nav:** Início · Hits · Anime · Artistas. A aba Anime ganha o ✓ com qualquer um dos 6 diários do dia terminado (P247, `animeDone`, só pelo save; desde a P357, com um de cada modo), com "(já jogou hoje)" para o leitor de tela. Em 320 px, as 4 abas cabem numa linha, com os dois ✓ (a última termina em 269 px, na medida), e cada uma tem 44 × 44 px.
- **As telas** (`ui/Anime.tsx`, no molde da dos Hits: o `CardList`, a raiz `.screen` e o foco no título): a do Anime, com os 2 modos numa coluna e o estado dos 3 diários de cada um numa linha ("3 diários novos", "em andamento", "1 de 3 terminados"); a da dificuldade, com Fácil, Médio e Difícil numa coluna, cada um com o estado do diário ("nº 1 · novo") e a dica curta (os temas mais famosos, aberturas e encerramentos, também as insert songs, P252); e o diário, que é o `Game` dos Hits com o descritor do Anime. O 1º por jogar é o oliva. Sem o dia na agenda do Anime, os cartões avisam sem link, e o diário mostra o aviso com o link de volta ao `#anime`; a carga que falhou mostra o "Tentar de novo" na tela do Anime e, nas outras, o aviso com o link de volta.
- **A Início** ganha o cartão do Anime, entre os Hits e os Artistas, com uma linha só, lida do save (P226): "Hoje: 1 de 3 terminados" ou "Hoje: em andamento"; sem jogo hoje, nenhuma. Ele não é o oliva: a Início não sabe se há diário do Anime hoje (o Anime só carrega na aba dele). Com o terceiro cartão, a Início passava 13 px em 360 × 640 no caso mais alto: o espaço entre as partes dela caiu de 16 para 12 px, e o cartão dela ficou mais baixo (`.home .home-card`: 8 px em cima e embaixo, e 88 px de altura mínima, no lugar de 12 e 96). Na medida, sobram 23 px em 360 × 640 e 50 px em 375 × 667.
- **O selo da Apple** nas rodadas do Anime (provedor `apple`): o mesmo `RoundView`, com o link da playlist (`PLAYLIST_URL`), nunca a música, e por último (regra 22). Na revelação, como nos Hits, o link da música.
- **O pacote:** o JS do build passou de 134,1 kB (48,7 kB com gzip) para 142,8 kB (50,9 kB): as telas e os textos. O catálogo e a agenda do Anime são buscados em tempo de execução.
- **Os testes:** os de núcleo (as rotas, o `animeDaily`, o ✓, o andamento, o `indexAnime` e o `loadAnime`), os de componente (`Anime.test.tsx`: a carga, as duas telas e o diário; a Início com o cartão novo; o compartilhar do Anime no `Summary`) e os e2e (`anime.spec.ts`: o Fácil do Tocar ao compartilhar, a carga só ao abrir a categoria, recarregar no meio, o teclado, o modo em breve, o dia fora da agenda e a carga que falhou; no `layout.spec.ts`, as telas novas em 375 × 667 e 360 × 640, com o selo da Apple, e em 320 px; no `home.spec.ts`, as 4 abas numa linha). Os e2e foram escritos numa worktree, sem rodar (Apêndice J); um ensaio deles, num build de desenvolvimento servido do disco por rotas do Playwright (sem servidor), passou, e no checkout principal eles rodaram e passaram (95 de 95).
- **A dependência dos Hits** (como o plano previa): o Anime só aparece com a parada dos Hits carregada, porque o motor de áudio e a tela do jogo (o `Ready` do `App`) nascem com ela. Uma falha na carga dos Hits mostra o "Tentar de novo" do jogo inteiro, e o Anime some junto.
- **A revisão** (o `revisor` e o `/code-review`): o `loadAnime` confere a forma mínima da agenda (o `days` é um objeto; senão, o "Tentar de novo" na aba, e não a tela quebrada); o toque duplo no cartão do Anime da Início se testa com o Anime já carregado; o teste da carga que falhou aceita uma só ocorrência do erro de rede; as dicas das dificuldades não prometem a proporção dos tipos de tema (os pesos só se calibram no C2); a regra repetida do espaço da Início saiu. A ME110 registra o que o Treino e os Artistas não excluem.

### A web (PR D3)

O "acertar o anime" jogável, a ajuda com 4 animes, os créditos e o "Sobre e privacidade". É a estreia do Anime, com a carga de teste (C1).

- **Os dois modos abertos:** o `ANIME_OPEN_MODES` do D2 saiu, com o "em breve": com o `titulo` aberto, ele e os textos dele virariam código morto. Os dois cartões levam às dificuldades, e os 6 diários abrem.
- **O acerto pela franquia** (P231, P234): o `indexAnime` guarda as franquias e, de cada faixa, as franquias e os temas (`core/catalog.ts`, o `anime` do `CatalogIndex`, com o `franchisesOf`). O `createRounds` ganha o `answerOf` (o id da faixa dá os ids aceitos): no `titulo`, os aceitos são as franquias da faixa (qualquer uma vale; a resposta mostrada é a 1ª), e a faixa sem franquia anula a rodada. O reducer só compara ids e não mudou; o `createGame` marca o jogo com `answer: "franchise"`, e a tela lê dele o que mostrar. O save não muda: os palpites salvos são os ids das franquias.
- **A busca:** o `buildFranchiseIndex` (`core/search.ts`, ao lado do de músicas) faz uma entrada por franquia, com as chaves `search` dela (todos os títulos e sinônimos dos animes, em romaji, inglês e japonês) e a popularidade da faixa mais popular dela; o `search` é o mesmo. "Starry Pirates" acha a "Hoshizora Kaizoku", e "Hoshizora Kaizoku 2nd" também (P234). O campo diz "Qual é o anime?", "Nome do anime" e "Título em romaji, em inglês ou em japonês." (o `scope` "anime" do `GuessInput`).
- **O que a tela mostra:** o `franchiseView` (o nome, sem artista nem capa) e o `guessView` (a franquia ou a música, pelo que se acerta) servem às sugestões, às tentativas, à ajuda e ao anúncio do erro; o `ItemLabel` não desenha a linha do artista vazia. A revelação mostra a música (o cartão de sempre) e, no lugar do álbum, o anime e o tema ("Anime: Hoshizora Kaizoku 2nd Season · OP1"; a insert song por extenso; com mais temas, o 1º e "e mais N"), também no "acertar a música": a revelação não cresce.
- **A ajuda** (4 opções): no `titulo`, a franquia certa e até 3 franquias do catálogo, sorteadas pela semente da rodada, como hoje, nunca a de uma das 18 respostas do dia (o `dayAnswerKeys` dá as franquias delas), nem as outras franquias da resposta, nem uma já tentada. No `musica`, as 4 músicas do Desafio, sem as 18 respostas. Nas fixtures de 08/10, as 18 respostas são de 10 das 13 franquias: sobram exatamente 3.
- **Os nomes:** o diário do `titulo` é "Anime · Fácil" no cabeçalho; o compartilhar, "AteMusic Anime · Anime · Fácil nº 1" (o que o usuário aprovou). Os cartões e as dificuldades ficam como no D2.
- **Os créditos** (P241): nas duas telas de escolha do Anime, no pé, uma linha ("Dados: AnimeThemes, AnisongDB e MyAnimeList · Prévias: Apple Music") que é o link para o `#sobre`; o MyAnimeList só em texto, sem logo (P256). Não em toda rodada, para caber.
- **O "Sobre e privacidade"** (P243, `ui/About.tsx`, rota `#sobre`, na categoria da Início): o que é o jogo; as fontes, cada uma com o link dela, em outra aba (Apple Music, AnimeThemes, AnisongDB e MyAnimeList, com o que cada uma dá); a privacidade (o jogo não coleta dados pessoais; o progresso fica no `localStorage`, e nada vai para um servidor do jogo; as prévias e as capas vêm direto da Apple); e o contato pelas Issues do GitHub (P258). O link fica no fim da Início, na linha do "Como funciona", à direita do resumo, que tem esse lado livre: a Início não cresce, e o "Tema" continua na tela, ao lado do switch (P259; no 1º desenho, o "Tema" ia só para o leitor de tela, para o link caber na linha do switch, e o usuário não aprovou). Aberto, o texto do "Como funciona" desce na largura toda. Os links do texto são em linha, sem os 44 px dos alvos (a exceção dos links dentro do texto).
- **Cabe na tela** (medido no build de desenvolvimento servido do disco): o Sobre sobra 131 px em 375 × 667, 104 em 360 × 640 e 64 em 320 × 640; a Início no caso mais alto continua com 50 px em 375 × 667, 23 em 360 × 640 e 7 em 320 × 640, com o "Tema" na tela e o link na linha do "Como funciona" (37 px longe do resumo em 320); a revelação do `titulo` com o tema mais longo, 5 tentativas e o selo da Apple, 28 px em 360; a ajuda com os 4 animes e o selo, 16 px em 360; o cabeçalho "Anime · Difícil · nº 14" numa linha em 320 px.
- **O pacote:** o JS do build passou de 142,8 kB (50,9 kB com gzip, no D2) para 148,3 kB (52,4 kB): o acertar o anime, o Sobre e os textos. O CSS, de 237,9 kB para 238,6 kB.
- **A revisão** (o `revisor`), medida com o catálogo real do C1 (24 franquias, a mais longa com 61 caracteres; a linha de tema mais longa, "JoJo no Kimyou na Bouken Part 3: Stardust Crusaders 2nd Season · ED1"):
  - a ajuda do `titulo` numa coluna, com o nome inteiro (quebra a linha, sem corte); para caber, só nela o título "Qual é o anime?" fica para o leitor de tela, e as partes da rodada ficam a 4 px uma da outra. Com 3 tentativas antes da ajuda, sobram 25,5, 12 e 10 px (375 × 667, 360 × 640 e 320 × 640) com os nomes das fixtures; 17,5, 4 e 2 px com 4 nomes de 62 caracteres; e 21,5, 8 e 6 px no Difícil do catálogo real, o dos nomes mais longos;
  - a linha "Anime:" da revelação mostra o 1º tema e "e mais N" (a faixa pode estar em 2 ou mais temas): com o tema mais longo e mais 2, sobram 31,5, 18 e 6 px; com o catálogo real, de 25 a 50 px;
  - os links do Sobre, o dele no fim da Início e os créditos do Anime ignoram o 2º clique de um toque duplo (o `singleClickLink`, regra 23);
  - o Sobre desenha antes de conferir a carga dos Hits (ele não usa dado nenhum): a política de privacidade não depende dela;
  - o texto de privacidade diz que o site é hospedado no GitHub Pages (que, como qualquer servidor, pode registrar os acessos) e que as prévias, as capas e as consultas das músicas vão direto do navegador à Apple; os ":" e "." do Sobre foram para o i18n;
  - um teste do save do `titulo` (pulo, palpite errado, ajuda e o acerto, refeitos pelos eventos);
  - a ME111 (a franquia repetida entre os 6 diários do dia), para o C2.
- **Os testes:** os de núcleo (`core/franchise.test.ts`: o índice das franquias, o acerto pela franquia, a busca pelos sinônimos, a ajuda sem as franquias do dia e o que a tela mostra), os de componente (`Anime.test.tsx`: o diário do `titulo`, a busca pelo sinônimo, as tentativas e a revelação com o anime, a ajuda com 4 animes e os créditos; `About.test.tsx`; a Início com o link do Sobre) e os e2e (`anime.spec.ts`: o `titulo` do Tocar ao compartilhar, com o nome e com o sinônimo, a ajuda com 4 animes e o Sobre pela Início e pelos créditos; no `layout.spec.ts`, o Sobre, a revelação com o tema mais longo e a ajuda do `titulo`, e as telas novas em 320 px). Os e2e foram escritos na worktree, sem rodar (Apêndice J); o ensaio deles no build de desenvolvimento passou.

### O robô (PR B)

O Anime entra no robô de segunda (`update-catalog.yml`), no mesmo PR dos Hits (P237), com o modelo de segurança de sempre: quem roda o pipeline e os pacotes do pip só lê o repositório, e quem tem o token de escrita só roda jq e coreutils, com os scripts da `main`.

- **Quando:** só com a agenda do Anime da `main` presente e com menos de 21 dias depois de hoje (`.github/scripts/anime-due.sh`). A geração vai até hoje + 28, então o Anime gera uma semana sim, outra não (14 dias à frente na semana em que gera, 21 na que pula).
- **`anime-mal`** (P256): outra máquina, `permissions: {}`, sem `pip install`. Roda só o checkout, o `setup-python` e o `mal_ranking.py`, um módulo só da biblioteca padrão, pelo caminho: `python -I -S pipeline/src/musicle_pipeline/mal_ranking.py --out ...`. Pelo `-m` não daria, porque o `-I` ignora o `PYTHONPATH`; pelo caminho, com o `-S`, a pasta do script, as variáveis `PYTHON*` e o `site-packages` ficam fora do `sys.path`, e só a biblioteca padrão é importável (um teste confere os imports pelo código, e outro roda o módulo assim). O segredo `MAL_CLIENT_ID` entra só no `env` do passo do ranking, que só roda quando o Anime vai gerar, e mora no Environment `mal` da tarefa (`environment: mal`, decisão do usuário de 22/10/2026), com "Deployment branches and tags" só na `main`: a regra compara o `GITHUB_REF` da execução, que no agendamento e no `gh workflow run update-catalog.yml` é a `main`, e um branch que mudasse o workflow para ler o segredo não passaria por ela (o segredo não fica em "Repository secrets"). Um Environment não pede permissão ao `GITHUB_TOKEN` (o `pages-deploy` já usa o `github-pages` sem `deployments: write`), então o `permissions: {}` continua. Sem o Environment criado, o GitHub o cria vazio na 1ª execução, e a busca segue sem o MAL; cada execução da `anime-mal` aparece como um deployment do `mal` na página do repositório. O ranking `bypopularity` vem em páginas de 500 (os 3.000 primeiros), com 1 s entre os pedidos e o Client ID só no cabeçalho `X-MAL-CLIENT-ID`, como cabeçalho "não redirecionado" (um 30x nunca o repassa). O ranking inteiro tem um prazo de 3 min, e cada pedido, 20 s: um MAL lento nunca faz a tarefa passar dos 5 min dela. O arquivo tem só o que o repositório já guarda do MAL (P254): a ordem de popularidade, uma lista de ids do mais popular ao menos, e o nível de 0 a 9 de cada anime (`mal_level`), como `{"levels": {"38000": 9}, "order": [38000, ...]}`; o número da posição não vai para ele (decisão do usuário, 22/10/2026, porque o artefato de um repositório público pode ser baixado por qualquer conta do GitHub). Como o ranking do MAL é contínuo, a ordem equivale à posição: aceito pelo usuário na revisão do PR B (22/10/2026), porque o artefato só vive 1 dia, nunca entra no repositório, e o ranking é o que o próprio site do MAL mostra. O sorteio só compara posições, então a ordem dá o mesmo sorteio (um teste confere), e o nível vem pronto do arquivo. O arquivo vai num artefato de 1 dia. Sem o segredo, o módulo sai com 0 e sem arquivo; com falha, aviso. Nos dois casos, o robô segue. As mensagens de erro trocam o Client ID por `***`, por garantia. O `fetch_anime.py` usa o mesmo módulo na carga do terminal: há uma cópia só da busca.
- **`anime-generate`** (`contents: read`, 20 min, sem segredo, `needs: anime-mal` com `!cancelled()`):
  1. mede a agenda (o 1º passo; sem ela, ou com 21 dias ou mais, pula o resto);
  2. instala o pipeline com o extra `[romaji]` (o cutlet do casamento) pelo `constraints.txt`, com um cache do pip próprio (o `romaji.py` entra na chave, para não disputar o da `catalog-generate`, que quase nunca instala o extra);
  3. baixa o ranking, se veio, e roda o `fetch --provider apple --anime --ranks-file <arquivo> --max-songs 12 --max-anime 60 --deadline-min 12` (com `continue-on-error`). Com o `--ranks-file`, o sorteio sai da ordem do arquivo e o nível do MAL, dos níveis dele, sem nenhum pedido ao MAL (a carga do terminal, sem o arquivo, continua com o nível pela posição); sem ele, o sorteio é pelas playlists do AnimeThemes, e o anime fica sem o nível do MAL. Se a busca com o arquivo sair com erro antes de gravar o snapshot (um ranking corrompido), ela tenta uma vez só com as fontes abertas;
  4. `build-anime`, `schedule-anime --days 28` e `validate-anime`, com os avisos e os afrouxamentos no log. Se a busca nova quebrar algum deles, a reserva (`anime-reserve.sh`) volta o catálogo e a agenda ao da `main`, apaga o snapshot de agora e cresce só a agenda, com o acervo de antes;
  5. a agenda fictícia do Anime cresce junto (`schedule-anime --provider fixture --days 28`, ME109). Se ela falhar, o Anime real segue;
  6. o `validate-anime` dos dois provedores e o `schedule-check --base-ref HEAD --today` (como o dos Hits);
  7. a lista fechada (`anime-collect.sh`): só o snapshot da busca de agora, o catálogo e a agenda reais do Anime e a agenda fictícia do Anime. Vão num artefato à parte (`anime-out/`, o `anime` do Actions), com os avisos e os afrouxamentos sem repetir, primeiro os avisos.
- **A conferência com o token** (`check-anime-pr.sh`, chamado pelo `catalog-pr.sh` no mesmo passo do dos Hits):
  - o "hoje" da tarefa com token, e o da `anime-generate` tem de bater (ME44);
  - a `main` tinha a agenda do Anime e menos de 21 dias à frente;
  - a lista fechada (no máximo um snapshot, com o nome `AAAA-MM-DDTHHMMSSZ.json`), a agenda real obrigatória, só arquivos comuns, um JSON por arquivo, o snapshot até 2 MB e o catálogo até 3 MB (5 MB desde a P361);
  - o snapshot: não existia na `main`, vem depois do último dela, é de hoje em Brasília, tem só as 8 chaves e bate com o id;
  - o catálogo, que só muda com snapshot novo: o mesmo `schemaVersion`, o provedor e a loja; nenhum id de faixa, álbum, artista ou franquia some; as URLs só nos hosts da Apple; os snapshots da `main` intactos, com o de agora no fim;
  - as duas agendas: o cabeçalho e os dias da `main` intactos, os dias novos em sequência a partir de `max(último + 1, hoje)` (P44), até hoje + 35, com o `catalogVersion` do catálogo que os gerou e respostas que existem nele.
- **A falha de um lado não derruba o outro** (P237): a `catalog-pr` precisa das duas tarefas que geram e roda quando uma delas deu certo e mudou algo. A busca que falha não tira o Anime do PR (ela tem `continue-on-error`, e a agenda cresce com o acervo de antes); a tarefa do Anime que falha ou passa dos 20 min não tem `result` `success`, e o PR sai só com os Hits, com uma linha no corpo ("a tarefa `anime-generate` não terminou bem nesta semana", pelo `ANIME_RESULT`). A recusa da conferência dos Hits para tudo, como antes; a do Anime deixa o Anime de fora, com o aviso no corpo do PR, e a tarefa fica vermelha depois de abrir o PR (o GitHub manda e-mail). O mesmo quando o artefato do Anime era esperado (`ANIME_EXPECTED`) e o download dele, que tem `continue-on-error`, falhou: uma falha passageira do serviço de artefatos não trava os Hits. Nada do Anime entra na árvore antes de a conferência dele passar: quem copia os arquivos é o `catalog-pr.sh`, depois.
- **O corpo do PR:** a parte do Anime ("**Anime**") vai antes do "**Para publicar:**": a busca (animes tentados, temas, achados na Apple, músicas novas e o total do acervo), os dias novos de cada agenda, os avisos de buraco e de "merge hoje" e até 50 avisos e afrouxamentos num bloco de código, cada um com até 300 caracteres (cortados pelo jq, por caractere) e sem caracteres de controle: o corpo nunca chega perto do limite do GitHub (65.536 caracteres), e o Anime nunca impede o PR dos Hits. Um caminho com caractere de controle no `changed.txt` é recusado antes de qualquer mensagem citar um caminho. O título ganha "e Anime (agenda até ...)". Um PR só com o Anime tem o corpo e o título próprios.
- **A folga:** a `catalog-runway` confere as duas agendas reais, aceitando a do Anime ausente. O deploy avisa com menos de 7 dias também na do Anime.
- **Os testes:** `test_mal_ranking.py` (os imports só da biblioteca padrão, a execução com `-I -S`, o Client ID só no cabeçalho e fora da URL, do arquivo, da saída e dos erros, o redirecionamento sem o cabeçalho, o prazo e o timeout curto, a forma do arquivo, o `--ranks-file` no sorteio, no nível e no CLI), os do `anime-due.sh`, do `anime-collect.sh` e do `anime-reserve.sh` em `test_catalog_generate_scripts.py`, e os do `check-anime-pr.sh` e do `catalog-pr.sh` em `test_anime_pr_script.py`, com a agenda do Anime montada em relação ao "hoje" dos testes (sem copiar a real). Os dos Hits não mudaram. Rodaram aqui, no Windows, com o jq 1.7.1 oficial (o mesmo do Ubuntu 24.04 da CI); só o do fuso pula no Windows (o `date` do Git Bash ignora o `TZ`).
- **Um ensaio sem rede** numa cópia do repositório, antes do C2: o `schedule-anime` de verdade (26 dias novos na agenda real, de 25/10 a 19/11, e 10 na fictícia), a coleta, a conferência e o corpo do PR; e o mesmo com um snapshot copiado, para o catálogo novo passar pela conferência. Os dois passaram, e o `validate-anime` e o `schedule-check` deram OK na árvore montada. Com o C2, a agenda real vai até 12/11: na 1ª execução, em 26/10, ela tem 17 dias à frente, e o robô gera de 13/11 a 23/11.
- **Para conferir na 1ª execução:** o checkout com `permissions: {}` (deve funcionar num repositório público; se não, `contents: read`), o tempo da busca com o prazo de 12 min e o número de afrouxamentos com o acervo curto da carga de teste.

### As voltas sem a nav (ME120, 23/10/2026)

O pedido do usuário: voltar à tela do Anime sem clicar pela nav (P321 a P323).

- **A escolha da dificuldade** (`AnimeLevels`): uma seta à esquerda do título, de volta à tela do Anime, no dia jogado (o `hrefOf`, que mantém o dia passado). Ela fica fora do fluxo (`position: absolute`, no cabeçalho `.has-back`), com um recuo do tamanho dela dos dois lados, e o título continua no centro. É o chevron dos ícones, virado, com o nome "Voltar ao Anime" para o leitor de tela.
- **O resumo de um diário:** o `Game` e o `Summary` ganham a prop opcional `back`, que só o Anime passa: um "Voltar" ao lado do Compartilhar, para a escolha da dificuldade do modo. O nome inteiro, "Voltar à escolha da dificuldade", começa pelo texto visível (P210). A linha dos dois é um grid que só existe com ele (`:has`); quando sai o "Jogar o novo diário", o "Voltar" some.
- **A medida:** uma margem injetada embaixo da nav, nos testes do `layout.spec`. A escolha da dificuldade passou com 16 px a mais em 360 × 640, e o resumo do Anime com 12 e não com 16. Por isso as duas voltas não tiram altura.
- **Os testes:** as duas voltas, hoje e num dia passado (o `Anime.test`); o resumo dos Hits sem a volta (o `Summary.test`); e o e2e do resumo à dificuldade e dela ao Anime, com o foco no título.

## Apêndice N. O Histórico (M15)

O pedido do usuário de 21/10/2026, a parte "histórico" do "login" (que virou as ME103 a ME105): registrar os dias jogados e deixar jogar os dias perdidos, só os últimos, sem contar na sequência nem na média. As decisões são as P260 a P271, de 22/10. Em 3 PRs: o núcleo e o save (1), o Histórico dos Hits (2) e o Anime no Histórico (3).

### O núcleo e o save (PR 1)

Sem mudança na tela: o jogo ainda não abre um dia passado.

- **O save v7** (P267): o `FinishedGame` ganha o `late?: true`. O `toFinishedGame` exige o `late`, sem valor padrão (uma chamada esquecida não compila), e o `startSession` recebe o hoje do jogo e decide pelo `isLate` (o diário de um dia antes dele, P268), em `records.ts`; o `Game` recebe o `today` do `App` e do `Anime`. O registro já gravado volta como está: vale o 1º término. O `isFinishedGame` aceita só o `true` ou a ausência. A migração de 6 para 7 não muda nada.
- **As estatísticas** (P263): o `computeStats` tira o jogado depois de tudo, e o dia dele continua buraco na sequência.
- **O modelo do Histórico** (`core/history.ts`, puro):
  - a janela: `historyDates` (de hoje − 14 a ontem) e `inHistory`;
  - os andamentos que a abertura do jogo guarda: `keptProgressIds` (hoje e os 14 dias, 8 diários por dia), no `openSaves` do `App`, no lugar dos de hoje (P269);
  - a marca de cada categoria num dia (P260): `historyDay` e `historyDays`, com as datas das duas agendas (a do Anime pode ser `null`, ainda não conhecida), e o `hasDaily`, o dia com algum diário.
- **As datas** (`core/dates.ts`): o dia da semana (`weekdayOf`, pela conta dos dias desde 01/01/1970, sem getter de data, para nenhum fuso entrar) e o dia e o mês (`dayParts`). O `inHistory` recusa o texto que não é data do calendário, porque no PR 2 a data vem do endereço.
- **Os testes:** a v6 de verdade chegando à v7 (nos dois lados, a migração e a carga), o `late` que não é `true` descartado, as estatísticas sem o jogado depois, o `late` no término pela repetição, o dia da semana na virada do mês e do ano, a janela e as marcas. Os e2e só trocam o número da versão nos saves semeados.

### O Histórico dos Hits (PR 2)

- **As rotas** (`core/routes.ts`): a aba `history` (`#historico`), na categoria `history` da nav. A rota é `{ tab, date }`: o `routeFromHash` lê `#aba/AAAA-MM-DD` (o dia passado), e aceitam data o Histórico, os dois diários dos Hits e, desde o PR 3, as abas do Anime. A aba sem data, com uma, abre a Início (regra 17); a data inválida, fora dos 14 dias ou igual a hoje abre o calendário. O `routeHref` monta o endereço, e o `navCurrent` (que saiu do `App`) dá o `aria-current`: num dia passado, a categoria marcada é o Histórico.
- **A nav** (`ui/Nav.tsx`, P265): abaixo de 480 px, a Início, os Hits, o Anime e o "Mais ▾", que abre os Artistas e o Histórico; a partir de 480 px, as 5 abas na linha. Os dois links ficam duas vezes no DOM (um par na linha, outro no menu), e o CSS mostra um par por vez. O botão leva o `aria-expanded`, o `aria-controls` e o `singleClick` (regra 23); o Esc fecha e devolve o foco a ele, o toque fora e o foco que sai pelo Tab também fecham, e a troca de rota fecha. O menu abre alinhado à direita do botão (aberto para a direita, passaria da borda em 320 px). O link da rota atual, no menu, devolve o foco ao "Mais", porque o endereço não muda. O "Mais" leva o `aria-current="true"` quando a categoria está nele (nunca "page": o botão não é a página).
- **O calendário** (`ui/History.tsx`, P260): os 14 dias em 2 linhas de 7, com o dia da semana no cabeçalho, o número e a marca dos Hits (o ✓ com os 2, a meia-lua em CSS com 1, nada com nenhum). O dia sem diário fica só com o fio, sem link. O nome de cada dia, para o leitor de tela, diz o dia e o que foi jogado. Desde o PR 3, também a marca do Anime, à direita (P277).
- **A tela do dia** (P261): os cartões do Normal e do Desafio com o estado (o `statusOf` ganhou o `late`, do registro gravado), o "jogado depois" numa linha a mais, o endereço do dia (`Card.href`) e o 1º por jogar em oliva; a volta ao calendário. A tela e o calendário levam o foco ao título (o `useHeadingFocus` foi para o `ui/hooks.ts`), e a tela do dia tem `key` pela data.
- **O jogar depois:** o `Ready` do `App` monta os diários do dia jogado (o da rota ou o de hoje), e a Início, os Hits, o Treino e os Artistas continuam com o de hoje (a exclusão do Treino, P141, também). O `Game` já tinha o `today` do PR 1. O resumo de qualquer dia passado (P263) não tem a contagem nem as estatísticas, e tem o "Voltar ao dia" (sem isso, o "Jogar o novo diário" recarregaria o mesmo endereço); o jogado depois tem a nota e o "(jogado depois)" no cabeçalho do compartilhar. O dia passado sem diário diz "Não há diário nesse dia." e volta ao dia, e não ao Treino.
- **A Início** (P264): o link do Histórico na linha do tema, à esquerda, e o "Tema" e o switch juntos à direita; a altura não muda.
- **O CSS:** sem par de cor novo (as marcas em `--text` sobre `--fill`; o menu com as cores do painel do volume). Os dias medem uns 46 × 52 px em 375 e 360 (ao menos 44 × 44, P213), e uns 39 de largura em 320 (P271).
- **A ajuda de um diário passado** (a revisão do PR 2): ela evita também as respostas dos diários de hoje (`answerKeysOf`, em `core/help.ts`, e o `todayDailies` do `Game`). Sem isso, a resposta de um diário de hoje ainda não jogado podia aparecer entre as 4 opções do de ontem e entregar o de hoje, que conta nas estatísticas. O nome de cada dia do calendário, para o leitor de tela, leva a data por extenso ("21 de outubro"), e não "21/10".
- **Os testes:** os das rotas (cada aba com data, as datas inválidas, a ida e volta e o `navCurrent`), os de componente (`History.test.tsx`, `Nav.test.tsx`, o resumo de um dia passado e o link da Início) e os e2e (`history.spec.ts`: o "Mais" em 375 px, o link da Início, jogar o Normal de 21/10 depois e o diário de hoje em seguida, com "Jogos 1" e a sequência de 1 dia, a retomada depois de recarregar e os andamentos de dentro e de fora da janela, e as datas fora da janela; no `home.spec.ts`, a nav em 320 e em 480 px; no `layout.spec.ts`, as telas do Histórico em 375 × 667, 360 × 640 e 320, e a nav com o menu aberto). O `navLink` do `helpers.ts` abre o "Mais" quando o link não está na linha.

### O Anime no Histórico (PR 3)

- **A carga** (`data/source.ts`, P270): o `loadAnime` se divide em `loadAnimeSchedule` e `loadAnimeCatalog`, com as mesmas conferências, e junta os dois. O `useAnimeStore` (`ui/Anime.tsx`) guarda um pedido só da agenda, que o Histórico pede (`requestSchedule`) e a carga inteira reaproveita; o pedido que falha some, e a próxima tela que precisar dele pede outro. Quem só passa pelo calendário e pela tela do dia baixa a agenda do Anime e nunca o catálogo, que desce quando uma tela do Anime abre.
- **A espera:** o Histórico mostra o "Carregando…" com o foco até a agenda do Anime chegar. Se ela falhar ou vier de uma versão nova, o calendário e a tela do dia ficam como no PR 2, só com os Hits; a que falhou é pedida de novo uma vez a cada abertura do Histórico (e não sem parar, sem rede).
- **O calendário** (P277): as duas marcas lado a lado, os Hits à esquerda e o Anime à direita, cada uma num lugar de 1 em (o vazio guarda a posição); o ✓ do Anime com ao menos 1 dos 6 (P247; a P357 mudou só o da nav, e o calendário usa o `animePlayed`). O dia só com o Anime também é link. O nome do dia, para o leitor de tela, junta as duas ("Hits, 1 de 2 diários jogados; Anime, ao menos 1 diário jogado"), e a legenda fica em duas linhas, com o lado de cada categoria.
- **A tela do dia** (P261): o cartão do Anime na linha toda, com quantos dos 6 terminaram ("1 de 6 terminados") e o link para o `#anime/<data>`; fora da agenda do Anime, apagado ("Sem diário do Anime"). O oliva é o 1º dos Hits por jogar ou, com os dois terminados, o Anime.
- **As telas do Anime com data:** as abas do Anime aceitam a data (`#anime/AAAA-MM-DD`, `#anime-musica/AAAA-MM-DD` e os 6 diários). A escolha do modo e a da dificuldade trocam a dica pela data ("Quarta-feira, 21/10", sem crescer a tela), os cartões levam a data no endereço, e o jogado depois ganha a linha a mais na escolha da dificuldade. Sem o diário, ou com a carga que falhou, a volta é ao dia no Histórico ("Não há diário do Anime nesse dia."). A `key` pela data devolve o foco ao título ao trocar de dia.
- **A ajuda de um diário passado do Anime** evita também as respostas dos 6 diários de hoje, como nos Hits (o `todayDailies` do `Game`).
- **Os rótulos de data** (`ui/dayLabel.ts`): saíram do `History.tsx`, para servir também ao Anime.
- **Os testes:** a carga de cada arquivo (`source.test.ts`), a agenda baixada uma vez e pedida de novo depois da falha (`useAnimeStore`), as telas do Anime num dia passado (`Anime.test.tsx`), as marcas, a legenda, o cartão do Anime e a espera (`History.test.tsx`), as rotas com data do Anime e os e2e (`history.spec.ts`: jogar o Anime de 21/10 depois, do cartão do dia ao ✓ no calendário; o Histórico que baixa só a agenda; o dia sem o Anime; a agenda que falha). No `layout.spec`, a escolha da dificuldade de um dia passado com os 3 jogados depois, a tela do dia com o cartão do Anime, e o `#anime/<data>` e um diário de um dia passado em 320 px.

## Apêndice O. As medalhas (M16)

O pedido do usuário de 21/10/2026, a parte "medalhas" do "login" (ME105). As decisões são as P278 a P289 e a ME118, de 22/10. O desenho ainda não está decidido: o código vem antes, com uma arte provisória num componente só (o `MedalArt`, no PR 2), e trocar o desenho depois não mexe na lógica. Em 5 PRs (P293, P303): o núcleo e o save v8 (1), a estrutura e os avisos, visíveis só em desenvolvimento (2a e 2b), os dados e o desenho de cada artista (3a) e as gerais e o lançamento (3b). Depois, a estante (ME118).

### As perguntas da conversa (22/10/2026)

| Na conversa | O que ficou |
|---|---|
| P1 (onde ficam) | P278 |
| P2 (quais medalhas) | P310, no PR 3b |
| P3 e P5 (os avisos e o exportar) | P279 |
| P4 e P13 (uma por feito; várias por artista) | P280 |
| P6 (quem já joga) | P281 |
| P7 e P23 (a sequência) | P282 |
| P8 a P11 (o desenho) | P283; a direção, em aberto |
| P12, P15, P16 e P19 (a imagem do artista) | P284 |
| P17 (copiar a foto ou ligar ao Commons) e P18 (o anonimato de Ado e Eve) | Saíram com a P303: as 12 imagens são capas de álbum |
| P20 (os 3 níveis) | P285 |
| P21 (a tela) | P286 |
| P22 (a nav) | P287 |
| As recomendações da revisão do subagente Plan | P288 |

### O desenho

- **O que ficou:** a P292, com as imagens e as flores da P296 e as gerais da P312. A prata na roseta com caudas (D2); o ouro na S1, na cor gelo; a suprema no buquê de flores (F2), com a faixa do nome. Antes disso, a suprema provisória foi a S10 (ônix).
- **Em teste (22/10):** a versão 2 do buquê, com o retorno de um desenhista: as flores num ramo em espiral que leva à capa, uma flor sobre a borda branca, a distribuição irregular e os panos que crescem a cada conquista, pelas caudas. Fica na página `web/medalhas-flores.html`, fora do Git. Das propostas da suprema, ficaram para escolher a S1 (gelo, sem o diamante de cima), a S2 (estrela de cristal), a S4 (cravejada) e as S5 a S10 (fone, brasão sólido com alça e base, disco de platina, art déco, gravura e ônix).
- **O que saiu:** o anel, o brasão com faixa e a capa inteira (A, B e E) e a suprema holográfica (S3), muito colorida.
- **A página de rascunho**, com as capas reais e a escolha da imagem de cada artista, fica fora do Git: ela não entra em commit, e o Biome a leria. Os rascunhos (`web/medalhas-*.html`) foram para a Lixeira em 23/10/2026, com o desenho já no código.

### As fontes de imagem (a pesquisa de 22/10/2026)

- **Entra:** o Wikimedia Commons, achado pela Wikidata (P18), só no pipeline e sem chave. A licença é de cada arquivo (CC0, CC BY, CC BY-SA), e o crédito fica no Sobre (P284). Dos 12 artistas, 7 têm foto na Wikidata; 米津玄師, 松田聖子, Ado, Eve e UNLIMITS não têm. Ado nunca mostrou o rosto.
- **Sai:**
  - a Apple Music API, pelos termos: a arte só junto da reprodução, e sem modificar;
  - o Spotify, que proíbe jogos e o "name that tune";
  - o Deezer, só para uso privado;
  - o Jikan, que é scraping do MAL;
  - o TheAudioDB, o Fanart.tv e o Discogs, com imagens enviadas por usuários;
  - o Last.fm, que não tem mais imagem;
  - o YouTube, pela chave e pela renovação em 30 dias.
- **O cuidado com a capa da Apple:** os termos da Search API falam em promover a loja. A lista dos Artistas já usa a capa com o selo (P170); a medalha fica mais longe disso. Aceito pelo usuário com a P284, com o selo no pé da tela.

### O núcleo e o save (PR 1)

Sem mudança na tela: nada lê as medalhas ainda.

- **O save v8** (P289), em `records.ts`: o `seenMedals`, a `shelf` e o `artists`, com o `ArtistRecord` (`right`, `done?`, `perfect?`). As funções só crescem: `withSeenMedals` (a união em ordem, e o mesmo objeto sem nada novo, para o `updateSave` não gravar), `withArtistRight` e `withSuperfanEnd` (o terminar e o perfeito nunca voltam atrás). O guard do `save.ts` aceita o id de artista do schema da lista (`artistId`) e descarta o resto como reparo.
- **As sequências:** o `dayGames` (os jogos de qualquer diário, terminados no dia) e o `streaks` (a atual e a melhor sobre os dias da agenda) saem do `computeStats`, que dá o mesmo resultado, e servem às medalhas.
- **O fim do Superfan** (`superfanOutcome`): terminou é o fim por "todas tocaram" com ao menos uma música (a partida sem nenhuma, com tudo fora pela P141, não termina nada); perfeita é terminar com os pontos iguais a 3 por música, o que já exclui o erro e o desistir (−5, P290), a ajuda (0) e o trecho de 4 ou 9 s, e sem nenhuma anulada (P291).
- **O desistir no Superfan** (P290): o `gaveUp` da pessoa conta como erro no `superfanErrors` e custa −5 (`VARIANT_RULES.superfan.giveUpPoints`); o forçado pela partida, não. Desistir com 2 erros é o 3º, e a partida acaba no fim da música.
- **O registro** (`core/medals.ts`):
  - a `Medal` (o id, o tamanho do aviso e a conferência, com o progresso nas que se ganham aos poucos);
  - o `medalContext`, com a sequência da P282 sobre a agenda dos Hits (a do Anime carrega só sob demanda e nunca entra);
  - as 3 do Superfan de cada artista (`superfanMedals`, ids `superfan|<artista>|prata`, `|ouro` e `|suprema`), tiradas dos artistas que já têm registro no save (`medalsOf`), sem precisar da lista;
  - as gerais, `MEDALS`, vazias até o PR 3.
- **O modo por artista grava** (`ui/Artists.tsx`): um efeito no `useArtistStore`, que mora no App, manda ao save cada música acertada e o fim da partida, uma vez só, pela semente da sessão e o número da rodada. Voltar à aba remonta a revelação, mas não conta de novo. O App grava pelo `updateSave` e não relê o save: nada na tela lê isso ainda, e reler recriaria no meio da rodada a exclusão das respostas de hoje (P141). Falhar ao gravar não avisa, porque não se perde um diário.
- **Os testes:**
  - o `medals.test`: os 3 níveis, o progresso que concorda com a conferência e a medalha que nunca some (400 passos sorteados de jogar, avançar o hoje, acertar e terminar);
  - o `save.test` e o `migrations.test`: a v7 de verdade vira v8, cada entrada inválida descartada e duas abas que somam;
  - o `superfan.test`: o fim com erro, com ajuda, com o trecho de 4 s, encerrado e sem música;
  - o `Artists.test`: o acerto uma vez só, a anulada, o Superfan perfeito e o encerrado.

  Nos e2e, o `seedHistory` (`e2e/helpers.ts`) grava o save da versão atual, e o teste da P269, com um save v7 literal, confere que a abertura o grava já na v8.

### A tela (PR 2a)

Visível só em desenvolvimento, com `?medalhas=demo` (P293): no site, nada muda.

- **A rota** `#medalhas` e a categoria `medals` (`core/routes.ts`). Ela não aceita data: `#medalhas/<data>` abre a Início. Sem a lista, o App trata o `#medalhas` como a Início.
- **A nav:** o link Medalhas na linha e no "Mais". Com ele, a nav ganha a classe `six`, e o corte passa a 720 px (P287); sem ele, tudo como antes. O "Mais" leva o `aria-current` também nas Medalhas.
- **O quadro** (`medalBoard`, em `core/medals.ts`, puro): a sequência da P282, o total, o estado de cada geral (ganha e o progresso) e as 3 do Superfan de cada artista da lista, na ordem dela. O artista fora da lista não aparece nem conta. A lista de exemplo é a `DEMO_MEDALS`: o 1º diário, 5 diários e 3 dias seguidos.
- **A tela** (`ui/Medals.tsx`): o título com o foco, a sequência e o total; as gerais numa lista; o Superfan, uma linha por artista com as 3 dele, alinhadas por baixo. A tela pede a lista dos artistas como a aba deles (o mesmo `ArtistStore`), com a espera e a falha, e fecha com o selo da Apple na lista real (P170). Ela rola, como a lista dos Artistas (P286).
- **O desenho** (`ui/MedalArt.tsx`, o único lugar dele): a prata, o ouro e a suprema da P292 e uma roseta oliva para as gerais, em SVG, com a capa recortada (ou o monograma, se ela faltar ou não carregar). A apagada usa o filtro do CSS (`.medal-art.locked`). A cor do artista vem da `--monogram`, que as classes `.monogram-N` passaram a definir; o disco do monograma a usa como fundo. A faixa da suprema leva o nome, um caractere por linha, até 6; o nome mais longo fica com a letra do monograma.
- **Os testes:**
  - o quadro, o nível pelo id e o i18n de toda geral (`medals.test`, `Medals.test`);
  - o desenho: a capa, o monograma, a falha da capa, a apagada, a faixa e os ids únicos dos recortes (`MedalArt.test`);
  - a nav com e sem as medalhas (`Nav.test`), a rota (`routes.test`) e o `medalsMode` (`source.test`);
  - os e2e (`medals.spec`): sem a lista, nada; com ela, a tela e um acerto na Livre que aparece no progresso da prata;
  - o `layout.spec`: as Medalhas em 320 px sem rolar para o lado, com os 3 links do "Mais", e as 6 abas numa linha a partir de 720 px.

### Os avisos (PR 2b)

Também só em desenvolvimento, com `?medalhas=demo`. O `?medalhas=silencio` liga a tela e cala os avisos (os e2e que não testam os avisos).

- **Reivindicar antes de mostrar** (o `claimMedals`, em `core/medals.ts`, e o gancho `useMedalNotices`, em `ui/medalNotices.ts`): a mudança do `updateSave` relê o save, calcula as ganhas, tira as já avisadas e grava a união no `seenMedals`. A aba mostra só o que ela mesma marcou, e a outra aba, que relê o save, encontra tudo avisado. Com o save de uma versão futura ou sem acesso, nada é marcado e nada aparece. Com a cota cheia, a marca fica na memória da sessão (o `sessionStore`), e o aviso aparece.
- **Quando** (P288):
  - numa tela calma (o `noticeTab`: a Início, os Hits, as escolhas do Anime, o Histórico, as Medalhas e o Sobre; nos Artistas, fora de uma partida e no fim do Superfan), ao abrir e a cada troca de tela;
  - no "Ver resultado" da última rodada de um diário (o `onResult` do `Game`, também nos do Anime). O fim do dia já foi gravado na revelação, então a reivindicação o encontra.

  Nunca numa rodada nem numa revelação: quem abre direto num diário vê o aviso no resultado. Reabrir um dia terminado não avisa. O efeito do App vem depois do `useArtistStore`, que grava o fim do Superfan antes da reivindicação do ouro. O `Game` chama o `onResult` num efeito, depois do resumo na tela, e não no clique: o efeito que grava o fim do dia roda antes.
- **Trocar de tela fecha o aviso**, que já foi visto: o pequeno não fica por cima do selo da Apple de uma rodada. A tela nova, se for calma, reivindica de novo.
- **O tamanho** (P279, P281), decidido na reivindicação, e não pela tela de agora (o pequeno não vira o grande no caminho): o grande quando uma das medalhas é grande (o ouro e a suprema); no 1º aviso de quem já jogava (nada avisado antes e duas ou mais de uma vez: "Você já tem N medalhas"); e nos Artistas e nas Medalhas, onde o pequeno cobriria o selo da Apple. Duas levas seguidas viram um aviso só, do tamanho da maior.
- **O save que não grava** (a versão futura, sem armazenamento) cala os avisos: a sessão grava numa memória, e a marca de avisada se perderia.
- **O pequeno** (`MedalToast`): fora do `<main>`, no canto de baixo à direita, com a safe-area, sem receber toque (`pointer-events: none`) e decorativo (`aria-hidden`). O texto vai para a região aria-live do App. Ele some em 5 s, por `setTimeout` (regra 9); a leva que chega com ele na tela recomeça o tempo (a `key` pelos ids). Entra com movimento só para quem não pediu menos movimento. O `line-break: strict` não deixa o "ー" começar uma linha.
- **O grande** (`MedalDialog`): o `<dialog>` do Treino generalizado. Ele mostra o título, as medalhas (menores com 4, para caberem numa linha em 320 px) e os nomes. O foco vai ao "Ok", que usa o `singleClick`: o toque duplo no "Ver resultado" não o fecha (regra 23). O Esc, o "Ok" e o fechamento do próprio navegador (o evento `cancel`, o voltar do Android) fecham pelo estado do App. Ao fechar, o foco volta ao elemento de antes, ou ao título da tela, se ele saiu da página. O lugar do "Exportar o save" (ME103) é a prop `actions`.
- **O nome no aviso:** a geral, pelo i18n; a do Superfan, "{nível} de {artista}", com a capa. O aviso do Superfan espera a lista dos artistas (ou a falha dela): sem ela, sairia só com o nível e mudaria na chegada, e o leitor de tela ouviria os dois textos.
- **Os testes:**
  - o `medals.test`: o `noticeTab`, o `claimMedals` (a 2ª reivindicação devolve o mesmo save, o 1º aviso e o já avisado que saiu da lista) e o `claimTier`;
  - o `MedalNotice.test`: o tempo do pequeno, o foco, o Esc e o `detail` 2 do grande, o lugar das ações, a volta do foco, os textos e o gancho (duas abas, calado, sem a agenda, o save futuro e a cota cheia);
  - os e2e (`medals.spec`): o 1º aviso, que não volta ao recarregar; o aviso que espera o "Ver resultado", nos Hits e no Anime; reabrir um dia terminado, que não avisa; o jogado depois, sem medalha; o toque duplo; as duas abas, abertas antes da reivindicação; e o ouro no fim do Superfan;
  - o `layout.spec`: o pequeno inteiro na tela em 320 e em 375 px, e o pop-up com 4 medalhas numa linha em 320 px. Os dois testes da nav com as Medalhas ficam calados.

  O `seedHistory` dos e2e passou a gravar uma vez por aba: o recarregar lê o que o jogo gravou.

### As imagens e as flores (P296)

A escolha do usuário em 22/10/2026, sobre a página de rascunho `web/medalhas-cores.html` (fora do Git). As cores saem da capa (lidas num canvas, sem gravar a imagem). Desde o PR 3a, ficam no `[artists.medals]` do `pipeline/data/apple/artists/artists.toml`, com o id do álbum, o enquadramento e a faixa.

| Artista | A capa | As flores |
|---|---|---|
| YOASOBI | THE BOOK 2 | o verde-menta e o preto |
| LiSA | LANDER | o vermelho, o coral e o pêssego; o azul-marinho no anel, na faixa e no laço |
| Eve | レーゾンデートル | o cinza-azulado e o vinho no laço |
| Ado | 狂言 | pretas, com o azul (pedido do usuário: as cores dela são o preto e o azul) |
| Aimer | 花の唄 / I beg you / 春はゆく | o lilás e o preto |
| 米津玄師 | YANKEE | o vermelho e o bege; o marrom no anel e no laço |
| UNLIMITS | アメジスト (escolha da IA: a capa é roxa, e a prata se chama Amethyst) | o violeta e o orquídea, longe do lilás da Lilas |
| 松田聖子 | Strawberry Time | o rosa e o malva |
| 新しい学校のリーダーズ | AG! Calling | o azul-celeste e o azul-marinho; o laço vermelho do uniforme (tema do grupo) |
| 幾田りら | Sketch | o violeta, o índigo e o malva; o lilás do nome (tema da artista) |
| 볼빨간사춘기 | Red Diary Page.1 (escolha da IA: o vermelho dos títulos Red; o círculo só com a foto) | os rosas das bochechas coradas e o dourado (tema do grupo) |
| System Of A Down | System Of A Down (1998) | o preto, o dourado e o bronze |

### Os nomes (P295)

O usuário escolheu sobre as sugestões de um subagente de pesquisa (as fontes ficam na conversa de 22/10/2026). Desde o PR 3a, ficam no `artists.toml` (P301). Os níveis da tabela são os de antes da P302: a dos acertos, a completa e a perfeita.

| Artista | Prata | Ouro | Suprema |
|---|---|---|---|
| YOASOBI | Nightwalker | YOA'S | 小説を音楽にする |
| LiSA | LiVE is Smile Always | LiSAッ子 · LiSAkko | 今日もいい日だっ |
| Eve | 廻廻奇譚 · Kaikai Kitan | Round Robin | はらぺこ |
| Ado | 狂言 · Kyogen | 歌い手 · Utaite | 青い薔薇 |
| Aimer | Sleepless Nights | Blanc et Noir | エメ |
| 米津玄師 | Stray Sheep | ハチ · Hachi | かいじゅうずかん |
| UNLIMITS | Amethyst | 七色の記憶 · Nanairo no Kioku | 夢幻の宴 |
| 松田聖子 | Pineapple | 24 | 永遠のアイドル |
| 新しい学校のリーダーズ | オトナブルー · Otona Blue | 青春部 · Seishun-bu | はみ出していく |
| 幾田りら | Lilac | ぷらそにか · Plusonica | 吉祥寺 |
| 볼빨간사춘기 | Blushing Youth | Red Planet | 사춘기 |
| System Of A Down | Chop Suey! | Victims of a Down | Soil |

- **Os três últimos** (o usuário, 22/10/2026, as favoritas de um 2º subagente de pesquisa):
  - はらぺこ, "faminto": o selo independente do Eve (harapeco records), a marca de roupas e o perfil eve_harapeco;
  - 狂言 · Kyogen: o 1º álbum da Ado e o teatro de onde vem o nome dela (os papéis シテ e アド);
  - はみ出していく, "vamos sair da linha": a saudação fixa do ATARASHII GAKKO!.
- **O romaji ao lado** vai sem mácron (P297): `LiSAkko` (a resposta do usuário) e `Plusonica`, o nome latino do grupo.
- **O risco:** os nomes de fã-clube oficial (YOA'S, Blanc et Noir, 青春部) podem parecer parceria com o artista e podem ser marca registrada. O registro não foi conferido.

### O PR 3a (os dados e o desenho)

Invisível no site, como os anteriores: a lista das gerais só existe em desenvolvimento.

- **Os nomes internos** (P302): `acertos`, `completo` e `perfeito` nos ids, no código, no i18n e nos testes. Os textos de tela "Prata", "Ouro" e "Suprema" saíram (P300).
- **O `[artists.medals]`** no fim de cada artista do `artists.toml`:
  - os 3 nomes, com o latino só quando o nome tem kana, kanji ou hangul;
  - o `album` (a capa);
  - o `crop` (o zoom e o centro);
  - a `sash` (a faixa, em pé ou `along`);
  - o `[artists.medals.flowers]` (as 13 cores).

  O parser confere o formato, mas não exige os nomes: o `fetch` e o `romanize` de um artista novo rodam antes da escolha. Quem exige é o `build-artists` (P301), que acha a capa do álbum no arquivo do artista e grava o `medals` no índice, pelo caminho do `section`.
- **O schema da lista** ganhou o `medals`, obrigatório e sem versão nova (como o `section`). As cores vão escritas por extenso, sem `$defs` aninhado, e um teste confere as chaves do Python contra as do schema.
- **A faixa** em pé cabe até 6 caracteres, e a deitada só em letra latina, até 28 (no corpo mínimo, o web troca a mais longa pela letra). O parser já recusa, e o `validate-artists` confere de novo; os dois números ficam no Python e no web, e um teste confere que são iguais. A capa das medalhas é sempre a de um álbum do arquivo (nas fixtures, o ar02 usa outra que a do cartão, para o teste não passar por acaso).
- **O núcleo, `core/medalArt.ts`:**
  - o `superfanArt`: a capa, o enquadramento, as flores e a faixa, cada um conferido, porque o `loadArtistList` não confere as entradas. O índice velho no cache cai no padrão;
  - o `medalName` (o nome próprio);
  - o `sizedArtwork` (600 ou 1000 px, P307);
  - o `coverFrame` (a capa sem canto vazio);
  - o `sashLayout` (a faixa da P299).
- **O `MedalArt`** recebe o desenho do artista (`art`):
  - a capa até o aro;
  - o buquê nas cores dele, e o lilás sem elas;
  - as caudas na cor `d` (P305);
  - a faixa.
- **A tela e os avisos:**
  - a célula mostra o nome próprio, pelo `LatinName` (extraído do `ArtistName`, com o `lang` e o ponto decorativo), e o como ganhar; sem o nome, só o como ganhar;
  - os nomes longos quebram em qualquer ponto, com as linhas equilibradas (`text-wrap: balance`);
  - o aviso diz "{nome}, de {artista}" (P306);
  - o pequeno vai sem a capa, e o pop-up leva o selo depois do "Ok" (P298);
  - o leitor de tela ouve qual é a medalha (o desenho é decorativo): o feito, num `sr-only`, na célula e no pop-up ("50 acertos", "Superfan completo"). O que vai para a região aria-live troca o ponto do latino pela vírgula e leva o feito no fim. O pop-up tem o `aria-describedby` na lista dos nomes, e o artista leva o `lang` dele, como na tela.
- **Os testes:**
  - pipeline: a leitura, as recusas, os nomes que faltam, o latino, a capa fora do arquivo, as conferências do índice e a paridade com o schema;
  - núcleo: o `superfanArt`, o `sizedArtwork`, o `coverFrame` e o `sashLayout`;
  - componentes: o aro, o enquadramento, as cores, as caudas e a faixa, e nenhum rótulo de nível na tela;
  - e2e: os nomes fictícios, e o pop-up de 4 com o selo da Apple em 320 × 640.

  As fixtures ganharam nomes inventados, e o ar02 leva um nome longo, que mede a tela em 320 px.
- **O rascunho `web/medalhas-cores.html`** parou de funcionar: ele usava o `MedalArt` de antes. As capturas da vitrine guardam a referência do desenho aprovado. Foi para a Lixeira em 23/10/2026.

### O PR 3b (as gerais e o lançamento)

As medalhas no ar: a aba, a tela e os avisos, com a lista real das gerais (P310). As 4 das Misturadas entraram depois, em 24/10/2026 (ME123, P351 a P353, PR #87): são 17 gerais, 6 delas grandes.

| id | Nome | Como ganhar | Tamanho | Ícone |
|---|---|---|---|---|
| `diario-1` | Primeiro Acorde | um diário terminado no dia | pequena | a colcheia |
| `um-segundo` | Relâmpago | uma rodada de um diário acertada no trecho de 1 s, sem ajuda | pequena | o raio |
| `hits-todos` | Dia de Hit | numa data, os 2 diários dos Hits com todas as rodadas acertadas (a ajuda vale, P311) | pequena | o calendário com o ✓ |
| `anime-todos` | Pare de falar em tocar grama... | o mesmo nos 6 diários do Anime | pequena | a grama |
| `misturadas-rodada` | Tudo Junto e Misturado | todas as músicas de uma rodada das Misturadas (ME123, P351) | pequena | as setas do embaralhar |
| `seguidos-7` | Em Chamas | 7 dias seguidos (a melhor sequência da P282) | pequena | a chama |
| `oito-diarios` | Maratonista | os 8 diários terminados numa data | pequena | o tênis |
| `treino-100` | Saco de Pancadas | 100 acertos no Treino (P308) | pequena | o saco de pancadas |
| `diarios-50` | Já É de Casa | 50 diários terminados no dia | pequena | a casa |
| `misturadas-seguidos-15` | DJ Residente | ao menos 1 diário das Misturadas terminado por dia, 15 dias seguidos (P353) | pequena | o fone |
| `colecionador` | Colecionador | 5 artistas com os 50 acertos do Superfan | pequena | os discos |
| `hits-perfeito` | Hit Perfeito | numa data, os 2 diários dos Hits perfeitos | grande | o alvo com a flecha |
| `anime-perfeito` | Sensei | numa data, os 6 diários do Anime perfeitos | grande | o torii |
| `misturadas-perfeito` | Pode juntar mais uma | numa data, os 2 diários das Misturadas perfeitos: tudo no 1º trecho, sem o "Separar" (P352) | grande | as três colcheias com o "+" |
| `misturadas-acertos-7` | Harmonia no Caos | ao menos 1 diário das Misturadas com todas as músicas achadas por dia, 7 dias seguidos (P353) | grande | o yin-yang |
| `superfan-completo` | Superfan | uma partida do Superfan terminada, de qualquer artista | grande | o coração com a nota |
| `seguidos-30` | Tá pegando fogo, bicho!!! | 30 dias seguidos | grande | a fogueira com as fagulhas |

- **O save v9** (P308): o `practiceRight`, zerado na migração da 8 para a 9, e o `withPracticeRight`. Quem grava é o `usePracticeRecord` (`ui/Practice.tsx`), chamado pelo App ao lado da sessão do Treino, com a chave da semente e do número da rodada: o Treino desmonta ao trocar de aba, e a volta remonta a mesma revelação, que não conta de novo. O App grava pelo `record`, o mesmo do modo por artista, sem reler o save (P141).
- **O latino da perfeita** (P309): o `[artists.medals]` aceita o `latin` nos 3 níveis, o `build-artists` e o `validate-artists` o exigem com a mesma regra, o schema da lista o leva, e o `medalName` o devolve. Os dados: as 11 perfeitas reais com nome japonês ou coreano (o Soil é latino) e as 3 fictícias.
- **O núcleo** (`core/medals.ts`): o `MEDALS`, na ordem da tela; o `perfectGame` e o `allWon`; o `MedalContext` com o total do Treino e os jogos de cada data (as do mesmo dia: o diário que falta numa data nunca passa); os limites no `GENERAL_GOALS`; as listas dos diários do mesmo dia, congeladas (`HITS_DAY`, `ANIME_DAY` e `WHOLE_DAY`): um diário novo no jogo não tira medalha de ninguém, e um teste confere que hoje são as do jogo.
- **O desenho** (P312): os tipos `geral` e `geral-grande` do `MedalArt`, pelo tamanho (`generalKind`); os 13 ícones no `ui/medalIcons.tsx`, em duas cores que o `MedalArt` passa; sem ícone (as de exemplo), a ★. Na tela, a coluna da arte tem a largura da grande, e os textos começam no mesmo ponto. O aviso desenha cada geral no tamanho dela, pela lista.
- **O lançamento:**
  - as gerais são o `MEDALS` também no site; em desenvolvimento, o `?medalhas=demo` troca pela lista de exemplo, e o `?medalhas=silencio` cala os avisos sobre a lista real. Saiu o desvio do `#medalhas` para a Início;
  - a nav tem sempre as 6 abas, com o corte de 720 px (P287): saíram a prop `medals` e a classe `six`;
  - nos e2e, o `open()` cala os avisos por padrão (o pop-up modal travaria os cliques de quem não os testa), e o `openWithMedals` os liga, com a lista de exemplo (`demo`) ou a real (`avisos`).
- **As escolhas do usuário sobre a revisão** (P313 a P316): o pop-up com as grandes e as com capa primeiro (`noticeOrder`) e até 6 nomes (`LISTED`); o 1º aviso só para quem tem um jogo de um dia anterior; o progresso com a unidade (as chaves `medal.<id>.progress`); o latino embaixo do nome nas células do Superfan (o `LatinName` com o `stacked`).
- **Os testes:**
  - o `medals.test`: cada uma no limite (6 e 7, 29 e 30 dias; 99 e 100; 49 e 50; 4 e 5 artistas), o perfeito com a ajuda, com o trecho 3 e com a anulada, o jogado depois e o Anime fora das dos Hits. O "nunca some" e o progresso rodam com as 13, com jogos perfeitos, com ajuda, os 8 diários e o Treino;
  - o `save.test` e o `migrations.test`: um v8 de verdade chega à v9, o guard do total e as duas abas que somam;
  - o `Practice.test`: o acerto uma vez só, também na volta à aba, a perdida, a anulada e o reinício;
  - o `MedalArt.test`: a roseta prata e o gelo com as caudas oliva, o ícone de cada tamanho, e toda geral com o seu ícone (nenhum sobra);
  - o `MedalNotice.test` e o `Medals.test`: a ordem do aviso, o "e mais N", o novato (P314), as chaves do progresso e nenhum texto com parâmetro sobrando;
  - os e2e: a tela com as 13 e o progresso, o 1º aviso com a lista real, o Saco de Pancadas, que avisa na tela calma seguinte ao 100º acerto, e o Treino que grava o total; as Medalhas em 320 px, com o nome mais longo dentro da tela.

### A medalha em destaque (ME118, 23/10/2026)

A estante da ME118, curta: uma medalha só, a 1ª do `shelf` (P317 a P320).

- **O save:** o `favoriteOf` e o `withFavorite` (`core/records.ts`), que escolhe, troca ou tira e devolve o mesmo objeto sem mudança. O guard do `shelf` (até 3, desde a v8) não mudou.
- **A nav** (`ui/Nav.tsx`): o último item, empurrado para a direita. Uma versão só, pela largura (o `matchMedia`): o link a partir de 360 px, e abaixo o enfeite menor, com o item inteiro fora do leitor de tela. O desenho tem a mesma altura nas 4 molduras (o `medalWidth` do `MedalArt`).
- **O App:** a favorita só aparece quando está entre as ganhas, e depois da agenda dos Hits (as da sequência dependem dela; assim todas aparecem juntas). O desenho e o nome saem do `noticeItems`, o mesmo do aviso pequeno, sem a capa; a do Superfan pede a lista dos artistas na abertura.
- **A escolha** (`ui/Medals.tsx`): o `PinButton`, com o nome da medalha para o leitor de tela e o `singleClick`. Na linha das gerais, a 3ª coluna só existe com o botão (`:has`). O App grava pelo `updateSave` e relê, e a outra aba recebe pelo evento `storage`.
- **Os riscos aceitos:** o clique que não grava (a versão futura de outra aba, a cota cheia) não avisa, como o registro do modo por artista; o VoiceOver pode não anunciar a troca do nome do botão em foco ("Destacar" para "Tirar o destaque"), a conferir à mão no iPhone.
- **A medida que mudou o lugar:** uma margem de 40, 28 e 20 px embaixo da nav, injetada em todos os testes do `layout.spec`, fez rolar 21, 12 e 7 telas. As 7 de 20 px eram todas de jogo, em 360 × 640.
- **Os testes:** o `withFavorite` (também o tirar de uma que não é mais a favorita); o link e o enfeite na nav, abaixo de 360 px fora do leitor de tela; o botão só nas ganhas, o escolher, o tirar, o toque duplo e o nome falado das do Superfan; e os e2e do caminho inteiro (destacar, outra tela, uma rodada, recarregar, tirar, com o foco no botão), da do Superfan sem a capa, do id que não é ganho, do artista fora da lista, das Medalhas em 320 px com os botões, e da nav numa linha em 320 px (com o Mais e com o Anime marcados), em 360 e em 720 px.

### Os riscos

- **Uma aba com o código v7 aberta** vê a v8 como futura e não grava até recarregar, como nas versões anteriores.
- **A exclusão da P141:** a partida do Superfan tira as respostas dos diários de hoje que ainda faltam, e "terminar" é tocar todas as que sobraram naquele dia.
- **O catálogo do artista cresce** (`fetch --artists`): a medalha ganha nunca some, mas a partida seguinte tem mais músicas.
- **Um artista que sai da lista:** o registro fica no save, e a tela só mostra os da lista; se ele voltar, as medalhas voltam.
- **O aviso pequeno cobre o pé da tela por 5 s** (na Início, o "Histórico" e o "Tema"). Ele não recebe toque, então o clique passa para o que está embaixo.
- **A v9:** a aba com o código v8 aberta vê o save como futuro e não grava até recarregar. O Treino conta a partir do lançamento: ninguém começa com acertos dele.
- **O lançamento:** todo jogador com histórico vê o "Você já tem N medalhas" (P281), com as grandes primeiro e até 6 nomes (P313).
- **O 1º aviso de quem começa agora:** duas medalhas de uma vez, sem nenhuma avisada antes (o Superfan perfeito na 1ª partida), também dão o "Você já tem 2 medalhas". O texto continua verdadeiro, mas é o do aviso retroativo. **Desde a P314**, o aviso retroativo pede um jogo de um dia anterior, e o novato vê "2 medalhas novas".

## Apêndice P. As Misturadas (M17)

Duas ou três prévias de temas de anime tocando juntas, e a pessoa acha todas: 2 diários por dia, um por modo do Anime (acertar a música e acertar o anime), de 4 rodadas. As decisões do usuário são as P325 a P340, de 23 e 24/10/2026, e as escolhas da IA aprovadas com o plano, as P341 a P344. Em 4 PRs: o laboratório (1, #82), a agenda e a régua (A, #83), a tela e o save v10 (B, #84) e o robô (C, #85). A carga C3 do Anime foi num PR à parte (P334, #91). No mesmo dia 24/10, os ajustes do #86 ao #93 (P348 a P362), que revisam algumas das primeiras: a nav (P338), a achada fora da mistura (P331), a régua da muito conhecida (P325, P341) e o ✓ do Anime (P247).

### As perguntas da conversa (23 e 24/10/2026)

Os números da conversa recomeçam a cada rodada de perguntas e se repetem (o P9 das Misturadas e o das medalhas). Até o PR dos docs, o código citava os da conversa; desde ele, cita os do PLANO (P363). A tabela fica para ler as conversas e os PRs daqueles dias.

| Na conversa | O que ficou |
|---|---|
| P7 (as 4 rodadas e a régua) | P325 |
| P9 e P24 (os trechos) | P326 |
| P10 e P14 (o "Separar L e R") | P327 |
| P11 (o laboratório antes) | P328 |
| P12 (cada música pelo trecho) | P329 |
| P13 (o nome) | P330 |
| P23 (a achada para de tocar) | P331 |
| P25 (sem as respostas do Anime do dia) | P332 |
| P26 (a aba própria) | P333 |
| A C3 antes das Misturadas | P334 |
| P15 e P17 (o AMQ; o MAL só para o nível) | P335 |
| P19 e P21 (sem sorteio; o acerto vezes a fama) | P336 |
| P1 de 24/10 (a agenda curta) | P337 |
| P2 de 24/10 (a nav na coluna larga) | P338 |
| P3 de 24/10 (o compartilhar) | P339 |
| P4 de 24/10 (a C3 nos diários a partir de 13/11) | P340 |
| As escolhas da IA, aprovadas com o plano | P341 a P344 |
| P7 de 24/10, à tarde (o código cita o PLANO) | P363 |
| P9, P10 e P11 de 24/10, à tarde (as medalhas) | P352, P353 e P351 |
| P12 de 24/10, à tarde (a achada fica na mistura) | P356 |
| P13 de 24/10, à tarde (a mistura audível) | P358 |
| P14 de 24/10, à tarde (o Fácil inteiro) | P359 |
| P15 de 24/10, à tarde (as novas aos poucos) | P360 |
| P16 e P17 de 24/10, à tarde (o teto e a marca) | P361 e P362 |
| P24, P25 e P26 do PR #80, 23/10 (o progresso em arquivo, ME103) | P345, P347 e P346 |

### O laboratório (PR 1, #82, 23/10/2026)

- **A página:** `web/lab.html`, com o `web/src/lab/` (`main.tsx`, `Lab.tsx`, `pick.ts` e `lab.css`), só no `npm run dev`, em `/lab.html` (P328). Toca misturas reais: lê o catálogo real do Anime (`data/anime/catalog.json`) e pede as prévias à Apple pelo `appleResolver`, com o selo da Apple. O sorteio é com o `Math.random`, para ouvir várias seguidas, e não é o da agenda. Os controles: o modo, as 3 rodadas de exemplo (2 bem conhecidas, 2 do Médio para cima, 3 bem conhecidas), a régua (a chance mínima dentro do Fácil), o trecho (4, 8, 16 ou 30 s), o começo de cada prévia (todas do começo, ou espalhadas até 12 s), o igualar, o limitador, o "Separar" e o que acontece com a achada: para, com fade (a escolha da P331), abaixa a 25% ou continua.
- **Fora do build:** o Vite monta só o `index.html`. A marca `musicle-lab` fica no `main.tsx`, que se recusa a rodar fora do DEV; a tarefa `web` da CI, o deploy e o `/verificar` (passo 9c) recusam o `dist` com o `lab.html` ou com a marca. O `scripts/lab.test.ts` confere que nenhum arquivo do `src`, fora do `src/lab`, importa dele: um import levaria o código sem a marca, e o 9c passaria.
- **Os textos** ficam no `Lab.tsx`, e não no `pt-BR.ts`: é ferramenta, e eles iriam ao pacote. É a exceção à regra inviolável 2.
- **A chance** (`anime-chances --provider apple|fixture`): a mesma da P272, por música e por modo, com 4 casas, em `web/lab-data/anime-chances.json`, fora do Git (o `.gitignore`) e fora do que se publica: o repositório não guarda número de fonte (P254). Dentro do repositório, o comando só grava nessa pasta; o `--out` aceita outro caminho, fora dele. Sem o arquivo, a régua do laboratório cai no Fácil. O comando não usa a rede (o teste do `test_fetch.py`).
- **A mistura** (`core/mix.ts`, puro, e o `playMix` do `audio/webaudio.ts`):
  - a energia de cada prévia no trecho que toca (o RMS, `rmsOf`), guardada por prévia e por trecho;
  - a folga da soma, 1/√n (`mixHeadroom`): n prévias juntas somam a energia de todas;
  - o igualar (`mixGains`): o alvo é a média geométrica das energias, e nenhuma prévia sobe ou desce mais que 2 vezes (6 dB, `MAX_BOOST`; 4 vezes desde a P358);
  - todas as vozes começam no mesmo t0, alinhadas, cada uma com o envelope de 10 ms, o ganho dela, a ida a mono (para o "Separar" mudar o lugar, e não o volume) e o lado (`StereoPannerNode`); a soma passa por um limitador (`DynamicsCompressor`, a −3 dB, razão 20) antes do ganho mestre, porque a folga segura a energia, mas não o pico;
  - ao vivo, o `setGain`, com rampa de 0,3 s (a achada saía, P331; desde a P356, a tela não o usa), e o `setPan`, sem estalo (uns 50 ms);
  - o `MixEngine` é uma capacidade à parte do `AudioEngine` (o `canMix`), e os outros motores não mudaram. O Safari antes do 14.1, sem o `StereoPannerNode`, não mistura (falha como áudio indisponível);
  - o lado de cada música ao separar (`spreadPans`, de −0,8 a 0,8, na ordem da rodada) nasceu no `lab/pick.ts`; no PR B, vai para o `core/mix.ts`.

### A agenda e a régua (PR A, #83, 24/10/2026)

- **A muito conhecida** (P341): o `anime.famous` de cada faixa do catálogo do Anime (`{ musica, titulo }`, sim ou não), obrigatório no schema (`shared/schema/anime-catalog.schema.json`, sem subir o `schemaVersion`). Sai do `famous_of` do `anime.py`: a chance da música (`song_chances`, a maior entre os temas dela) a partir do `FAMOUS_CUTS`, dentro do Fácil do modo. Só o sim ou não vai ao arquivo (P240, P254). O `validate-anime` recusava a muito conhecida fora do Fácil do modo. A marca saiu do catálogo, do esquema e da validação no #93 (P362), depois de a P359 deixar de usá-la.
- **O arquivo:** `web/public/<fixtures|data>/anime/mixed.json` (o `MIXED_FILE` do `paths.py`), ao lado do catálogo e da agenda do Anime, com o schema `shared/schema/anime-mixed.schema.json` (tipos `MixedSchedule`, `MixedDay`, `MixedRounds` e `MixedRound` na web). O cabeçalho é o das outras agendas, com o `kind: "anime-mixed"`; cada dia tem o `number`, o `catalogVersion` e os 2 diários (`musica` e `titulo`), cada um com 4 rodadas `{"answers": [...]}`, de 2, 2, 2 e 3 faixas. Só cresce (regra inviolável 4).
- **O gerador** (`anime_mixed.py`; o comando `schedule-mixed --provider fixture|apple --today`, com o `--epoch` na agenda nova e o `--days`, de 21 por padrão, sem passar do último dia da agenda do Anime, P332): o laço é o `grow` do `schedule.py`. Para cada modo e cada rodada, nessa ordem, o rng de `musicle-jp|anime-mixed|<data>|<modo>|<rodada>`, com 1 número por música (o sorteio ponderado pelo tipo do tema, P252: os pesos do Fácil nas rodadas da muito conhecida, os do Difícil na 3ª). As candidatas são as faixas elegíveis da régua da rodada (P325: a muito conhecida nas rodadas 1, 2 e 4, e o Fácil inteiro desde a P359; o Médio ou o Difícil na 3), uma por música (a de menor id). Sem o dia na agenda do Anime, o gerador para: a P332 não teria como valer.
- **O que nunca afrouxa:** a música não repete nas 18 do dia (os dois modos), e dentro da rodada as músicas e as franquias são diferentes (um palpite serviria a duas).
- **O afrouxamento,** do mais firme ao mais frouxo, com registro (o `schedule-mixed` imprime cada um):
  - o nível 0 tem tudo: a franquia nova no dia (entre os dois diários), no `titulo` a franquia nova no diário (a resposta seria a mesma em duas rodadas), a janela e a P332;
  - o 1 deixa a franquia repetir no dia;
  - o 2, nas rodadas da muito conhecida, abria para o Fácil inteiro do modo (saiu com a P359, que já tira dele);
  - depois, a janela encolhe (K − 1, ..., 1);
  - os três últimos são do acervo curto (as fixtures, de 34 faixas; no real, não devem chegar), nesta ordem: a franquia repete no diário do `titulo`; qualquer faixa do modo (a régua da P325 cai: a rodada da muito conhecida pode receber uma do Médio, e a 3ª, uma do Fácil); e, sem outra saída, uma resposta dos 6 diários do Anime do dia (P332). A régua cai antes da P332 porque uma música repetida no mesmo dia é o que a pessoa mais nota.
- **A janela:** a música que saiu nas Misturadas nos últimos K dias, contando hoje, fica de fora. K = 14 (`WINDOW`), ou menos com acervo curto: a menor entre as muito conhecidas de cada modo ÷ as 7 dele por dia e as da união dos dois ÷ as 14 do dia (`famous_days`; desde a P359, as do Fácil, o `easy_days`). Só pela união, um modo com poucas ficaria com a janela cheia e cairia no Fácil inteiro todo dia. O `schedule-mixed` e o `validate-anime` avisam o acervo curto (`mixed_short_pools`).
- **A preferência** (P236): o terço mais antigo das candidatas, pelo último dia em que cada música saiu nas Misturadas, como no Anime. Desde a P360, cada rodada leva no máximo 1 música que nunca saiu, nem no Anime nem nas Misturadas.
- **A validação** (`validate-anime`, quando o `mixed.json` existe ao lado): a estrutural, em todos os dias (o schema, o epoch, o número, as respostas que existem, a conta de 2, 2, 2 e 3 e nenhuma faixa repetida no dia); as regras que nunca afrouxam (`mixed_rule_problems`: a resposta elegível e do modo, a música sem repetir no dia, as franquias diferentes na rodada), erro nos dias com o `catalogVersion` de agora e aviso nos de antes, como no Anime; e a forma canônica. O `mixed.json` sem a agenda do Anime ao lado é erro.
- **O `schedule-check`:** as seis agendas (o `known_schedules`: as dos Hits, as do Anime e as das Misturadas). Com o `--path`, o tipo sai do `kind` do arquivo, e um `kind` desconhecido é erro: cairia em silêncio no gerador dos Hits. O gerador das Misturadas lê a agenda do Anime ao lado, a do mesmo commit, para regerar os dias novos; sem ela, é erro.
- **A agenda fictícia:** as datas da do Anime, de 08/10 (nº 1) a 09/11, com a dispensa da P44 só na criação, como a do Anime (P257). Com 34 faixas (3 muito conhecidas no "acertar a música" e 6 no "acertar o anime"), ela afrouxa quase tudo: regerada do zero, dá 475 afrouxamentos, 66 deles da P332.
- **A agenda real** (P337): de 24/10 (nº 1) a 30/10, com o catálogo de 22/10 (`2026-10-22.220a3a8c`, o de antes da C3). As 43 e 41 muito conhecidas (P341) dão uma janela de 4 dias: a união, 57 músicas, ÷ 14. Afrouxou em 10 músicas: 6 no nível 1 (a franquia repete no dia) e 4 no nível 2 (o Fácil inteiro, em 27/10, no `titulo`). Regerada do zero na memória, com `--today 2026-10-24 --epoch 2026-10-24 --days 6`, ela sai igual à gravada (conferido em 24/10/2026, ao escrever este apêndice).

### A carga C3 (#91, 24/10/2026)

- **A ordem** (P335, P336), com o `fetch --provider apple --anime --draw amq`: sem sorteio. A amostra das músicas do Anime Music Quiz com a taxa de acerto de 60 a 100 (`AMQ_MIN_RATE`), sem dublagem e sem reprise, pelo `get_n_random_songs` do AnisongDB, em pedidos de 500 (`AMQ_BATCH`), até um trazer menos de 10 músicas novas (`AMQ_FRESH`) ou chegar a 12 pedidos (`AMQ_CALLS`); em 23/10/2026, 8 pedidos já davam umas 1.400 músicas. Cada anime vale o melhor acerto das músicas dele (`amq_rates`), e a ordem é o acerto vezes a fama do anime no MAL (`amq_ranks`, com o `anime_factor`, o p_a da P272), do maior para o menor (`ranked_order`), sem os animes já tentados.
- **O MAL só dá o nível** (P335), pela escala inteira do ranking (os 6.000 primeiros, `MAL_LEVEL_SIZE`): o anime do AMQ pode estar além dos 3.000 do sorteio. Sem a variável `MAL_CLIENT_ID` nem o `--ranks-file`, a busca recusa; o `--personal` e o `--pool-size` são só do sorteio do MAL.
- **O snapshot** guarda os animes pelo id, e não na ordem da busca, que guardaria o ranking do acerto (P254). A taxa fica só na memória, e o log leva só as contagens.
- **A busca** (24/10/2026): `fetch --provider apple --anime --draw amq --max-anime 250 --max-songs 9999 --target-per-tier 9999 --fetched-at 2026-10-24T02:40:28Z`. O snapshot tem 242 animes, 1.687 temas e 778 músicas achadas na Apple (1,36 MB).
- **O catálogo,** com todos os snapshots: de 675 para 1.395 faixas, de 527 animes, com 2,82 MB, perto do teto de 3 MB da época (o teto subiu na P361, e a marca saiu na P362: 2,71 MB). Os temas: 1.478 casados, 559 sem o artista na Apple, 1.130 sem a música e 60 descartados por ambiguidade. As novas ficam sobretudo no Fácil:

  | Faixas novas | Fácil | Médio | Difícil |
  |---|---|---|---|
  | Acertar a música | 234 de 344 | 182 de 383 | 304 de 668 |
  | Acertar o anime | 354 de 538 | 205 de 420 | 161 de 437 |

- **Os dias já gravados:** de 06/11 a 12/11, 4 faixas mudaram de dificuldade com os dados novos. Os dias ficam como estão (regra inviolável 4), e o `validate-anime` só avisa.
- **A conferência:** uma amostra de 25 músicas novas, o tema e a faixa da Apple lado a lado, casou certo nas 25. As franquias com mais faixas: Naruto (65), BLEACH (39), Fairy Tail (37) e One Piece (30).
- **Quando as músicas dela entram** (P340): no Anime, só nos dias novos, a partir de 13/11 (a agenda real vai até 12/11, e nenhum dia gravado muda); nas Misturadas, a partir de 31/10, o 1º dia depois da agenda curta (P337). Os dois pelo robô de 26/10, já com o limite de novas (P360): na simulação daquela rodada, com este catálogo, o diário Fácil do Anime de 13/11 a 23/11 leva 28 respostas da C3 em 66 (sem o limite, seriam 65), e as Misturadas de 31/10 a 23/11, 197 em 432 (sem o limite, 291), sem nenhum afrouxamento.

### A tela (PR B, #84, 24/10/2026)

- **O núcleo** (`core/mixed.ts`, puro):
  - o diário (`mixedDaily` e `mixedDailies`): as chaves `misturadas-musica` e `misturadas-titulo` (`MIXED_KEYS`), o id no save `<data>|misturadas-<modo>`, o nº do dia e as faixas de cada rodada; o que se acerta é a faixa ou, no "acertar o anime", a franquia (P234);
  - a partida (`createMixedGame`): cada música com os ids que a acham (as versões dela, ou as franquias); a rodada com uma faixa que sumiu, ficou inelegível ou não tem franquia nasce anulada inteira, porque as outras sozinhas seriam outra rodada;
  - o reducer próprio (`mixedReducer`), fora do `reduce` dos diários, com os eventos `GUESS`, `SKIP`, `SEPARATE`, `GIVE_UP`, `VOID` e `NEXT_ROUND`: o palpite certo acha a 1ª música que falta e não abre trecho (P343); o errado e o pulo abrem o seguinte (P326), e o erro no último encerra; o palpite repetido, ou que acha uma música já achada, não conta; o "Separar", uma vez ligado, fica, e as achadas depois dele valem os pontos da ajuda (P327, P342). O evento inválido devolve o mesmo objeto, como no reducer dos diários;
  - os pontos (`MIXED_POINTS`, `MIXED_HELP_POINTS`, `findPoints`, `mixedRoundScore`, `mixedScore` e `mixedMax`, P342), o ✓ (`mixedDone`, P344), o estado do cartão (`mixedStatusOf`) e o compartilhar (`mixedShareText`, P339): "AteMusic Misturadas · Música nº 1", os pontos, uma linha por rodada e o endereço.
- **O save v10** (Apêndice F): o campo `mixed: { finished, progress }`, à parte do `history`: as estatísticas, a sequência e o Histórico não veem as Misturadas (P333); as medalhas as veem desde a ME123 (P351). A migração 9 → 10 acrescenta o campo vazio, e os guards (`isMixedId`, `isMixedGame`, `isMixedEvent`) descartam o que não vale. A abertura do jogo guarda só o andamento das Misturadas de hoje (`mixedIds`). O exportar leva só os terminados, e o importar recusa os de um dia depois de hoje (ME103).
- **A carga:** o `loadMixedSchedule` (`data/source.ts`) busca o `anime/mixed.json`, com o `schemaVersion` 1 e o `kind: "anime-mixed"` (versão desconhecida pede para recarregar). Desce só quando a aba abre (`useMixedStore`, no App), junto com o catálogo do Anime (`useAnimeStore`).
- **As rotas** (`core/routes.ts`): `#misturadas` (a escolha do modo), `#misturadas-musica` e `#misturadas-titulo` (os diários, cuja aba é a chave), na categoria `mixed` da nav. Não aceitam data (não há Histórico): `#misturadas/<data>` abre a Início.
- **A nav:** a aba Misturadas, depois do Anime, com o ✓ (P344). Abaixo de 720 px, ela fica no "Mais", com os Artistas, o Histórico e as Medalhas; a partir de 720 px, as 7 abas ficavam na linha, na coluna larga (P338). Desde o #86 (P348), o "Mais" existe em todas as larguras, e a partir de 720 px só as Misturadas entram na linha. A escolha do modo é uma tela calma para os avisos de medalha (`noticeTab`).
- **As telas** (`ui/Mixed.tsx`, `ui/MixedGame.tsx` e `ui/MixedRound.tsx`):
  - a escolha do modo: os 2 cartões, com o estado do diário de cada um e o 1º por jogar em oliva; sem o dia na agenda, o aviso, com a volta;
  - o diário (`MixedGame`), no molde do `Game`: retoma pelos eventos, grava a cada evento aceito, e o resumo tem os pontos de cada rodada, o compartilhar e a contagem, sem as estatísticas (ME125);
  - a rodada (`MixedRoundView`): o player da mistura (`MixPlayer`: a barra dos 4 trechos, o Tocar e o Parar, o Pular), o campo ("Quais são as músicas?" ou "Quais são os animes?"), o "2 de 3 achadas", o "Separar L e R" (desde a P349, "Ajuda: separar L e R"; o custo fica na dica, regra 8 do `web/CLAUDE.md`), o Desistir e a revelação de cada música (achada no trecho de tantos segundos, com ou sem o "Separar", ou não achada); o selo da Apple no fim, com o link da playlist. A achada saía da mistura com o fade (P331); desde o #92 (P356), ela continua tocando. Com o "Separar", cada música vai ao seu lado, já tocando. A mistura toca com o igualar e o limitador, e cada prévia começa no começo do catálogo (o `startSec`), ou antes, para o trecho de 30 s caber nela.
- **As prévias:** o `useMixPreviews` (`ui/hooks.ts`) pede o lote do diário numa consulta só, e o motor guarda e baixa só as da rodada atual e as da próxima; o `useResolvedUrls` dá o endereço de cada uma. Uma música sem prévia nenhuma anula a rodada.
- **O áudio:** só o Web Audio mistura. O `playMix` do motor composto (`FallbackAudioEngine`) repassa a ele e, sem ele (o `<audio>` de reserva, o `?htmlAudio=1`, o navegador que não decodifica), recusa: a rodada é anulada, com o aviso "Este navegador não toca as prévias juntas". O motor falso (`FakeAudioEngine.playMix`) registra cada mistura no `window.__musicleMixLog`, só em DEV, para o e2e achar as respostas.
- **Os testes:** o `core/mixed.test.ts`, o `ui/MixedRound.test.tsx` e o e2e `e2e/mixed.spec.ts` (o "acertar a música" das 4 rodadas ao compartilhar, com o "Separar" e, desde o #92, a achada ainda na mistura; o "acertar o anime" pela franquia e o ✓ com os dois diários; a falha de áudio que anula a rodada). No `layout.spec`, a escolha do modo e a rodada no caso mais alto (3 músicas no último trecho, com o selo da Apple e o artista longo), a revelação e o resumo. Os saves semeados dos e2e passam à v10.

### O robô (PR C, #85, 24/10/2026)

O `update-catalog.yml` cresce as Misturadas junto com o Anime, com o `schedule-mixed` depois do `schedule-anime` (a ME124):
- **A folga:** o `anime-due.sh` mede também a agenda das Misturadas (a saída `mixed=`), e o Anime gera quando qualquer uma das duas tem menos de 21 dias à frente. A `catalog-runway` e o `deploy.yml` também conferem a das Misturadas.
- **As listas fechadas:** a reserva e a coleta (`anime-reserve.sh`, `anime-collect.sh`) levam o `ANIME_MIXED` e o `ANIME_FIXTURE_MIXED`, e o artefato pode trazer só as Misturadas.
- **A conferência** (`check-anime-pr.sh`): a agenda pelo tipo dela (o `check_schedule` lê o `kind`), e o último dia novo das Misturadas nunca passa do último da do Anime (P332).
- **Os testes:** `pipeline/tests/test_anime_pr_script.py` e `test_catalog_generate_scripts.py`, que rodam com o `bash` e o `jq` (no Windows, o `jq` do winget precisa do `-b`, ME129).

### Os ajustes de 24/10/2026 (#86 a #93)

- **A nav menor** (#86 e #87, P348): o `Nav.tsx` guarda a largura (`WIDE`, pelo `matchMedia`); a partir de 720 px, só as Misturadas ficam na linha (`nav-inline`), e no "Mais" elas somem (`nav-narrow`). A linha fica na coluna do conteúdo (560 px), com o mesmo respiro lateral dele (16 px), e a medalha em destaque vai ao canto direito (`margin-left: auto`). O `layout.spec` confere, em 720 px, a linha até 560 px e a borda direita da medalha a até 2 px da do conteúdo.
- **O "Separar" e a etiqueta** (#86, P349, P350): o botão diz "Ajuda: separar L e R", com o ✓ quando ligado. O `mixedRoundTag` (`core/mixed.ts`) dá a etiqueta do cabeçalho: "more" na rodada com mais de 2 músicas, "hard" na 3ª (`MIXED_HARD_ROUND`); os textos são o `mixed.tag.more` e o `mixed.tag.hard`.
- **As medalhas das Misturadas** (#87, ME123, P351 a P353): no `core/medals.ts`, o contexto ganha os terminados das Misturadas até hoje (`mixed`) e as duas sequências delas (`mixedStreak`: as jogadas e as de todas achadas), sobre a agenda dos Hits (`streaks`). Os ids: `misturadas-rodada`, `misturadas-seguidos-15`, `misturadas-perfeito` e `misturadas-acertos-7`, com os 2 diários do dia congelados (`MIXED_DAY`) e as metas em `GENERAL_GOALS` (15 e 7). O perfeito pede todas as rodadas feitas e toda música no 1º trecho, sem a ajuda. Os ícones (`medalIcons.tsx`): o embaralhar, o fone, as três colcheias com o "+" e o yin-yang. O fim de um diário das Misturadas confere as medalhas novas (o `onResult`). São 17 gerais.
- **O como ganhar** (#88, P354): o `MedalStatus` do `Medals.tsx` mostra o como ganhar em todas; o progresso, embaixo, só enquanto falta; o "Ganha", num `.sr-only`. O limite do como ganhar ("Jogue {goal} dias seguidos") sai do progresso, também na ganha. A dos acertos do Superfan ganhou o texto dela: "Chegue a 50 acertos com o artista".
- **O 1º som** (#89, P355): o `leadIn` (`core/silence.ts`, puro) lê a prévia em janelas de 50 ms; conta como silêncio a janela 30 dB abaixo da energia da prévia inteira (`SILENCE_RATIO`) ou abaixo de -60 dBFS (`SILENCE_FLOOR`), começa uma janela antes do 1º som, para não cortar o ataque, e pula no máximo 10 s (`MAX_LEAD`: a barra de 16 s cabe numa prévia de 30 s). O Web Audio mede uma vez por prévia, ao decodificar, no pré-carregamento, e soma o resultado a todo começo pedido; o `__musicleAudioLog` leva o `lead`. Medido nas prévias reais dos exemplos do usuário, no site publicado: Kakumei Dochuu, 1,3 s; Yoru ni Kakeru, 1,2 s (a outra edição dela, 0). Nos dois, o corte cai no mesmo ponto com 20, 30 ou 40 dB.
- **O Fácil inteiro e as novas aos poucos** (#90, P359, P360): as rodadas do `anime_mixed.py` passam a `("facil", 2), ("facil", 2), ("hard", 2), ("facil", 3)`, a janela conta o Fácil (`easy_days`) e sai o nível que abria para ele. O limite: `NEW_PER_DIARY = {"facil": 1}` no `anime_schedule.py` e `NEW_PER_ROUND = 1` no `anime_mixed.py`. Nova é a música (o `songKey`) que nunca foi resposta antes do dia: no Anime, na agenda dele; nas Misturadas, em qualquer das duas. Passado o limite, o `_prefer_seen` deixa só as que já saíram, se houver. O consumo do rng não muda: só os dias novos sentem.
- **A mistura inteira e o ✓ do Anime** (#92, P356 a P358): o `MixPlayer` toca sempre todas as músicas da rodada, e o "Separar" leva cada uma ao seu lado (`panApart`). O ✓ da nav sai do `animeDone` (um diário de cada modo), e a marca do Histórico, do `animePlayed` (qualquer um dos 6). Na mistura, cada voz começa pela régua mais exigente (`MIX_ENTRY_RATIO`, -15 dB), medida junto com a de silêncio ao decodificar, e o `MAX_BOOST` do `core/mix.ts` passa a 4.
- **O teto e a marca** (#93, P361, P362): o `MAX_FILE_BYTES` do `validate_anime.py` e o `MAX_CATALOG_BYTES` do `check-anime-pr.sh` passam a 5 MB. A medida de 24/10, com 2,82 MB: o arquivo comprimido tem uns 400 KB; o recuo de 2 espaços do JSON, uns 0,9 MB; as URLs da prévia e da loja, 367 KB; a marca, 56 KB. Gravar sem o recuo deixaria o diff do PR do robô numa linha só, ilegível, e por isso o arquivo continua com ele.

### Depois dos docs de 24/10/2026 (#95 a #98)

- **A limpeza do robô** (#95, ME128 e ME129): saiu o `_REDONE_DAYS` do `cli.py`, e o `pipeline/tests/conftest.py` põe, só no Windows, um invólucro do `jq -b` na frente do PATH da sessão de testes (o `jq.exe` do winget escreve com CRLF).
- **A franquia espaçada** (#96, P364): o `_Level` do `anime_mixed.py` ganha o `spaced`. No nível 0, a franquia que saiu nas Misturadas nos últimos mín(`FRANCHISE_DAYS`, K) dias fica de fora; o nível 1 ("sem espaçar a franquia") a solta, com registro, antes do "a franquia repete no dia". Na simulação da rodada do robô de 26/10 (31/10 a 23/11, 24 dias), sem nenhum afrouxamento: Naruto em 4 dias (eram 9), BLEACH em 3 (eram 12), Fairy Tail em 3 (eram 13).
- **A Início e o Mais** (#97, P365 a P367): o `Home.tsx` monta os 4 cartões num `CardList` de 2 colunas, os Hits e o Anime com o `wide`, como o Treino nos Hits; o das Misturadas sai do `mixedCard`, que só lê o save (os textos `home.mixedShort`, `home.mixedHint`, `home.mixedLine` e `home.mixedPlaying`). A regra `.home .home-modes :where(li:not(.wide) .home-card:has(.tag)) .mode-hint` esconde a dica curta: os cartões estreitos com a linha do estado iam de 140 a 96 px. O `Nav.tsx` mostra o `nav.moreMark` ("▼") em `.nav-more-chevron`, a 0,6 em, girado 180° com o menu aberto. O `layout.spec` mede a Início no caso mais alto com um diário das Misturadas terminado.
- **O Histórico** (#98, P368, P369):
  - **O núcleo:** o `MixedGame` ganha o `late?: true` (o `startMixedSession` e o `mixedStatusOf` o leem pelo `isLate`), o `keptProgressIds` guarda também os andamentos das Misturadas dos 14 dias (150 ids), o `historyDay` dá a marca `mixed` (off, all, some ou none) e o `isDatedTab` aceita as abas delas. O `medals.ts` pula o jogo com o `late`.
  - **O save v11:** a migração 10 → 11 não muda nada, e o `isMixedGame` e o transferir aceitam só o `late` verdadeiro.
  - **A tela:** o `History.tsx` espera as duas agendas, a do Anime e a das Misturadas (`useScheduleRequest`), e mostra a que chegou; a 3ª vaga de marca, a legenda ("Anime, no meio:" e "Misturadas, à direita:") e o cartão do dia, na linha toda, depois dos Hits e do Anime. O `Mixed.tsx` e o `MixedGame.tsx` recebem o dia jogado e o de hoje: num dia passado, a escolha do modo mostra a data no lugar da dica, o resumo diz "Jogado depois: não conta nas medalhas.", o compartilhar leva o "(jogado depois)", e o "Voltar ao dia" fica no lugar da contagem. Com as 3 marcas, a `.calendar-marks` passa a 1 px de folga.

### Os riscos

- **Uma aba com o código de antes aberta** (o save v10) vê a v11 como futura e não grava até recarregar, como nas versões anteriores.
- **O navegador sem o Web Audio** (o `<audio>` de reserva) não joga as Misturadas: toda rodada é anulada, com o aviso.
- **A agenda:** desde o PR C, o robô a cresce com a do Anime, e a `catalog-runway` fica vermelha com menos de 10 dias. A real vai só até 30/10 (P337): o 1º robô com elas é o de 26/10, e sem o merge dele o dia 31 fica sem Misturadas.
- **A régua:** com o Fácil inteiro (P359) e a C3, as Misturadas têm 344 e 538 faixas no Fácil, e a simulação da rodada de 26/10 não afrouxou nada. Os pontos e o "Separar" ainda esperam a calibração (ME127).
- **A pausa no meio do trecho** (P358): uma quebra ou um breakdown ainda pode deixar uma música sozinha por um tempo. O próximo passo seria um compressor por voz, testado de ouvido no laboratório (ME130).
- **A concentração por franquia:** Naruto tem 65 faixas, BLEACH 39 e Fairy Tail 37. O espaçamento de 7 dias, no Anime e, desde a P364, nas Misturadas, segura a repetição, mas o acervo pesa para elas.
- **O teto de 5 MB** (P361): no ritmo do robô, umas 6 músicas por rodada do Anime (P236), ele dura anos; uma carga à mão como a C3 ocupa uns 1,5 MB.

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
- **As medalhas do M16** (22/10/2026): as respostas do usuário na conversa (abaixo das P278 a P289); mockups no chat e uma página de rascunho, fora do Git, com as capas reais da Apple e as fotos do Commons (só os metadados, lidos pela API da Wikidata e do Commons); um subagente Plan sobre a estrutura e um de pesquisa sobre as fotos públicas de artistas (os termos da Apple Music API, do Spotify, do Deezer, do MAL, da Wikimedia e de outras, lidos em 22/10).
- **O latino do Anime** (24/10/2026, P370 a P372): a contagem das faixas repetidas e dos latinos diferentes, por script, nos arquivos publicados da `main` de 24/10; o teste da busca no navegador do Claude, com `?data=real` ("akeboshi" no modo Livre da LiSA); a revisão do `revisor` sobre o diff do PR #99.
- **As Misturadas do M17** (23 e 24/10/2026): as respostas do usuário na conversa (P325 a P340 e P348 a P369, com a tabela do Apêndice P), a escuta no laboratório (P331), o código dos PRs #82 a #98 na `main`, lido pela IA em 24/10/2026; a simulação da rodada do robô de 26/10 com a franquia espaçada (P364); as duas agendas das Misturadas regeradas do zero na memória, para contar os afrouxamentos; a simulação da rodada do robô de 26/10, com o catálogo da C3; a medida do silêncio das duas prévias de exemplo, no navegador do Claude, no site publicado (o áudio só na memória da página); a medida do peso do catálogo do Anime (o `gzip` e o tamanho de cada campo).
- **O Histórico do M15** (22/10/2026): o pedido do usuário de 21/10 e as respostas de 22/10 (P260 a P271); dois subagentes Explore (o save e as datas; as rotas, as telas e os dados) e um subagente Plan, todos só de leitura, que conferiram o desenho contra o código.
- **Identidade visual do M12** (12 e 13/10/2026): o style guide do designer (SVG e PNG), analisado pelo Claude com recortes em alta resolução e a conta de contraste do WCAG; um subagente de pesquisa comparou as letras do SVG com 26 famílias para achar a Noto Sans JP; as respostas do designer (PD1 a PD13) vieram pelo usuário; o `npm view @fontsource/noto-sans-jp` e uma busca sobre o selo da Apple em fundo escuro (artists.apple.com/support/1117-apple-music-marketing-tools).

### A carga de teste (PR C1, 21 e 22/10/2026)

- **Duas buscas,** as duas com o MAL:
  - a 1ª com a lista do usuário (P253): 21 animes, 155 temas, 72 músicas;
  - a 2ª com `--pool-size 300` (os mais populares), porque o Fácil do "acertar o anime" ficou com 5 músicas e o 1º dia da agenda não fechou: 10 animes, 106 temas, 52 músicas.
- **O total:** 31 animes, 261 temas e 124 músicas casadas (48%). Os outros: 45 sem o artista na Apple, 85 sem a música na discografia (as insert songs que a Apple credita ao compositor da trilha, como as de Shingeki) e 7 descartadas por ambiguidade (P246).
- **Por faixa:** no "acertar a música", Fácil 23, Médio 71 e Difícil 30; no "acertar o anime", Fácil 11, Médio 79 e Difícil 34. O Médio está cheio de encerramentos puxados pelo nível do MAL (o Gintama). A calibração fica para o C2.
- **O tempo:** uns 30 min a 1ª (155 temas) e uns 25 min a 2ª. Um anime grande passa do limite (o BLEACH sozinho deu 37 de 66 temas), porque a parada é conferida a cada anime.
- **A agenda:** 22, 23 e 24/10 (`schedule-anime --provider apple --today 2026-10-22 --epoch 2026-10-22 --days 2`). A estreia passa da meia-noite, então ela começa no dia 22, e a CI não acusa a P44. Com o acervo curto, a janela cai para 1 a 13 dias. Só o dia 24 teve afrouxamento, e só de nível 1 (o espaçamento da franquia).
- **O tamanho:** o catálogo tem 236 KB, a agenda 8 KB e os dois snapshots 216 KB.
- **A CI e o deploy** passam a conferir o `data/anime/`: o `validate-anime` dos dois provedores, e no deploy o catálogo real e a folga da agenda, que é aviso.

### A carga grande (PR C2, 22/10/2026)

- **A busca,** a longa do C2 (o snapshot gravado a cada anime, o prazo e os álbuns do artista com mais de 200 músicas), com o MAL e sem a lista do usuário: 254 animes, 1.279 temas, 576 casados e 553 faixas. Os outros: 251 sem o artista na Apple, 431 sem a música na discografia e 21 descartados por ambiguidade. O snapshot tem 1,07 MB.
- **O total, com o C1:** 285 animes, 1.540 temas, 700 casados e 675 faixas; o catálogo tem 1,34 MB (o teto é 3 MB, P236) e a agenda, 34 KB.
- **A calibração** (P272 a P275), na conversa de 22/10/2026:
  - a soma de níveis do A1 deixava no Fácil encerramentos e insert songs de animes famosos, e o nome da música no mesmo nível do anime;
  - o usuário avaliou listas de exemplos, os casos extremos (música famosa de anime pouco visto, e o contrário) e uma amostra de 49 músicas de todos os níveis, e apontou 5 discordâncias graves;
  - uma busca em grade de 5 parâmetros (o expoente do anime no nome da música, o do quiz no "acertar o anime", o desconto sem as playlists, o passo do MAL e o corte do Médio do "acertar a música") escolheu os que mais acertam as correções (peso 3) e os casos combinados antes (peso 2), mexendo o mínimo no resto da amostra (peso 1): 129 de 142 pontos;
  - a busca achou o tema dividido entre dois registros com títulos diferentes (P275): 26 aberturas e encerramentos ficavam sem o quiz ou sem as playlists;
  - os cortes fixos ficam num número redondo logo abaixo do valor do quantil, porque o "acertar o anime" tem poucos valores possíveis e empata muito (20 músicas no valor do corte do Fácil): no "acertar a música", 0,271 (Fácil) e 0,145 (Médio); no "acertar o anime", 0,25 e 0,108. Os outros valores fixos (os fatores do tipo, a tabela do quiz pelas playlists e a semelhança de 0,8 na junção) ficam no `anime.py`, que é a fonte.
- **A revisão** (o `revisor` e o `/code-review`): a busca contava a concorrência num anime ainda sem temas (o `Progress`, que decide quando a busca para; o catálogo não muda); a junção ficou igual em qualquer ordem dos temas (a semelhança do `SequenceMatcher` muda com a ordem dos dois títulos), o ø e o 0 viram "o" antes do `search_key` ("Soul" e "S0ul") e a data do ícone passou de 22/10 a 19/10, a do último snapshot da parada. Nenhuma faixa do acervo mudou com isso. Ficam como estão: a junção por semelhança pode juntar dois títulos curtos diferentes (nos dados, os 11 pares são a mesma música); o "with" corta o título; as grafias diferentes contam como duas músicas na concorrência; o ícone vale também para o parceiro da faixa do Anime; e a franquia da concorrência é a 1ª série na ordem do AnimeThemes.
- **A conferência:** o `anime.py`, em `Decimal`, contra o script da calibração, em `float`: 1 diferença em 674 músicas, a "Ienai" (Kanojo, Okarishimasu, 2ª temporada), a 0,0001 do corte do Médio do "acertar a música". Dos 23 casos de referência, 19 ficam na faixa combinada.
- **As lacunas aceitas** (o usuário: "algumas músicas vão cair em tiers levemente incorretos como efeito colateral"):
  - "sh0ut" (Re:Creators, OP2): o nome no Fácil, e o usuário o põe no Médio (ME116);
  - "You" (Mahoutsukai no Yome, OP2): o anime no Médio, e o usuário o põe no Fácil (ME114);
  - "1st Love Story" (Netoge no Yome wa Onnanoko ja Nai to Omotta?, OP): o nome no Médio, e o usuário o põe no Difícil (ME116);
  - "Donna Toki mo Zutto" (Love Live! School Idol Project 2ª temporada, ED2): o nome no Médio, e o usuário o põe no Difícil.
- **Por faixa** (as faixas tocáveis): no "acertar a música", Fácil 117, Médio 200 e Difícil 358; no "acertar o anime", Fácil 179, Médio 216 e Difícil 280. Das 98 faixas que são só insert song, 97 ficam no Difícil do "acertar o anime". O Fácil do "acertar a música" tem 116 músicas, menos que as 126 da janela de 21 dias: ela cai para 19 dias (P235).
- **A agenda:** 19 dias novos, de 25/10 a 12/11 (`schedule-anime --provider apple --today 2026-10-22`), 22 no total. Os dias 22 a 24/10 são os do C1, com as faixas antigas: o `validate-anime` só avisa, porque a faixa recalibrada vale para os dias novos. O espaçamento da franquia afrouxou em 15 rodadas (o nível 1, ME117); nenhum afrouxamento de nível 2 ou mais.
- **Para depois:** as ME114 a ME117.
