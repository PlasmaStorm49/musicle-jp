# Backlog do AteMusic

O que falta fazer, numa linha por item, para ler rápido. O código (ME = melhoria, S = sugestão, P = decisão) leva ao detalhe no [`PLANO.md`](PLANO.md), seção 7. Item novo entra aqui e lá; o que fica pronto sai daqui e vai para as "Feitas" do PLANO.

Atualizado em 03/11/2026.

## Próximos

- **O PR do robô de segunda, 09/11:** merge no mesmo dia (P276). A agenda da `main` vai até 23/11.
- **Depois dele, se trouxer o Anime:** o `anime-latin`, o `build` e o `build-artists` da Apple num PR à parte, para os Hits e os artistas lerem o latino das músicas novas (P372; o `build` avisa).
- **A exceção à regra 4 sai do `ci.yml`:** o `--quiz-redo-from 2026-11-04` (P439) já venceu e não faz nada, mas fica no workflow até o PR que o tira (o commit está pronto na branch `quiz-franquias-ci`).

## Itens para corrigir

**Na tela**
- **ME33.** Textos: o "- Single" na revelação, o dia anulado com "0/0" e o "Áudio indisponível" quando o motivo é outro. Conferir o que o PR D já resolveu.
- **ME37.** Um gancho comum de reprodução para o Player e a revelação (o foco no "Carregando…" já foi feito).
- **S32.** No Superfan, o custo de desistir aparece só na revelação, e não na rodada.
- **ME92.** No modo por artista, o nome latino do álbum nunca aparece.

**Nos nomes e no romaji**
- **ME80.** Créditos com o nome que a Apple usa (Inoue Sonoko; Sano Hayato & Yoshida Jinto).
- **ME121 (novo).** O romaji de 廻人 (Eve), "Megurunin": confirmar a leitura (talvez "Mawaribito") antes de corrigir.
- **ME90.** Parceiros ocidentais em katakana, sem o nome latino (as faixas do System of a Down).
- **ME86.** Duas músicas diferentes viram uma só ("Someday", do Bolbbalgan4), e uma some.
- **ME88.** "Song (Remix - feat. X)" vira "Song (Remix" no pipeline.
- **ME79.** O `validate` deixa passar kanji ou kana no título latino.
- **ME91.** A CI não acusa título que ficou sem latino.
- **ME167 (novo).** O romaji de 永遠語り～El Ragna～ (水樹奈々): as fontes divergem; confirmar a leitura antes de corrigir.
- **ME131 (novo).** O latino do AnimeThemes também erra ("Ikeru Hitobito", "Nemureru Honoo"): corrigir no `aliases.toml` do Anime, que leva a correção aos Hits e aos artistas.

**No Anime**
- **ME132 (novo).** "リフレインボーイ –TV size-" aparece como "Refrain Boy -English ver.-"; e o travessão curto não conta como sufixo na normalização.

**No jogo**
- **ME110 (novo).** O Treino e os Artistas não excluem as respostas do Anime de hoje (raro: pede o mesmo `songKey` nos dois catálogos). Aceito por ora, como a P248.
- **ME62.** No Treino da parada, um cover de outro artista escapa da exclusão por título.
- **ME113 (novo).** Com o Histórico, o Treino, os Artistas e a ajuda do diário de hoje podem entregar a resposta de um dia passado ainda não jogado (excluem só as de hoje). Aceito, como a ME110.
- **S24.** Conferir a duração real das prévias: no Superfan, uma prévia curta deixaria menos de 9 s.

- **ME115 (novo).** O "Kaikai Kitan", 1ª abertura de Jujutsu Kaisen, ficou fora do acervo (o tema não casou com a Apple): investigar.

**Pipeline, CI e testes**
- **ME11.** Fixar o `pip`, o patch do Python e o minor do Node na CI.
- **ME89.** Um e2e falhou uma vez na CI (o Enter na nav): conferir a espera do `open()`.
- **ME40.** O `correctOptionId` é gravado e ninguém usa.
- **ME67.** O `?failAudio=` não faz falhar uma faixa que só existe num artista (desenvolvimento).
- **ME87.** Teclado coreano: a lista de sugestões pode sumir até a sílaba fechar (hipótese, sem teste).

## Melhorias para analisar viabilidade

**Jogo e tela**
- **ME166 (novo).** As ajudas do Setlist sem tooltip no celular: rever com você se o nome do botão basta.
- **ME162 (novo).** A capa pequena do Anime Royale (100 px) fica um pouco borrada no celular: usar a grande na grade (até 540 KB cada) ou deixar como está.
- **ME157 (novo).** As setas do carrossel das Medalhas têm 28 px, abaixo dos 44 da P213: só com mouse, mas um notebook com toque as mostra. Crescer ou registrar a exceção.
- **ME158 (novo).** A Início não mostra a run do Setlist Royale em andamento.
- **ME155 (novo).** Uma cor por categoria nas medalhas (os blocos da P404), no lugar da prata e do gelo de todas as gerais.
- **ME145 (novo).** O bônus do quiz baixado uma vez só, e não com cada mês: se só ele falhar, o calendário do Histórico perde a marca do quiz.
- **ME146 (novo).** O quiz na linha da nav também em 390 px (o iPhone comum), apertando o espaço entre as abas abaixo de 720 (P394).
- **S18.** "Cada trecho a mais vale 1 ponto a menos" também no cartão do Normal, no Treino.
- **S22.** O selo da rodada no modo por artista leva à página do artista na loja.
- **S29.** As 3 faíscas do 当 animadas no acerto.
- **S30.** O carregamento com as faíscas acendendo em sequência.
- **ME8.** Aceitar erro de digitação no autocompletar.
- **ME66.** No modo por artista, o sorteio tira mais álbuns do que precisa (o lado seguro).
- **ME38.** Ligar no pipeline os álbuns do mesmo lançamento (pede mudança de esquema).

**As faixas do Anime** (a calibração do C2, P272 a P275)
- **ME114 (novo).** O MAL da franquia no "acertar o anime": a 2ª temporada de um anime conhecido fica difícil demais.
- **ME116 (novo).** Um sinal do título ("sh0ut", "1st Love Story"): o nome estilizado ou genérico é mais difícil do que as fontes dizem.
- **ME117 (novo).** Os pesos do tipo do tema no sorteio e o espaçamento da franquia continuam os provisórios do A2.

**As Misturadas** (M17)
- **ME144 (novo).** Na revelação, o tipo do tema antes do nome do anime, como no quiz (P388): o nome longo corta o "· OP" do fim.
- **ME127 (novo).** Calibrar os pontos das Misturadas e o custo do "Separar" depois de mais escuta (a régua da muito conhecida saiu, P359).
- **ME130 (novo).** Um compressor por voz na mistura, se as pausas no meio do trecho ainda deixarem uma música sozinha (testar de ouvido, no laboratório).
- **ME125.** As Misturadas nas estatísticas (o Histórico delas entrou no PR #98).

**Desempenho e tamanho**
- **S33.** A fonte mais leve: 7,5 MB a menos no `dist` e 210 kB a menos de CSS.
- **ME18.** Medir o tempo até o 1º som no site.
- **ME42.** Pré-carregar a 1ª rodada na escolha do modo do Treino.
- **ME3.** Esconder a resposta do dia, que está no JSON público, e dividir a agenda por mês.
- **ME17.** Dividir o catálogo real quando passar de cerca de 1 MB.
- **ME4.** Gerar o dia no navegador quando a agenda acabar.
- **ME133 (novo).** O save cresce com cada jogo (uns 0,9 MB por ano para quem joga os 10 diários): compactar a forma antes de 1 MB, sem perder nada. Não é urgente.

**Pipeline, CI e testes**
- **ME134 (novo).** Um plano B sem o MAL para o Anime e o quiz, caso a API caia: a fonte de reserva de cada dado e o que o robô faz quando o MAL falha.
- **ME164 (novo).** Registrar os dados dos jogos num servidor (o Cloudflare Workers com o D1, de graça), num marco próprio e com o texto de privacidade revisto. Não decidido.
- **ME10.** `actionlint` ou `zizmor` na CI.
- **ME15.** Um teste rápido contra o `vite preview`, para pegar caminho absoluto no código.
- **ME39.** Testes de componente do `Game` e do `App`.
- **ME69.** Teste de tela do "Pedir ajuda" sumindo depois da 3ª ajuda do Superfan.
- **S8 a S11.** O `fetchedAt` pelo cabeçalho do RSS; o e2e da reserva com `<audio>` de verdade; hashes no `constraints.txt`; o `build --check`.
- **S6.** Cada decisão como um ADR em `docs/decisoes/`.
- **S5.** O estilo de saída "Explanatory" nas sessões: parece já estar ligado; conferir.

## Coisas novas que quero implementar

- **M18 (o que falta).** O quiz do dia (Apêndice Q do PLANO) está no ar; faltam os artistas parecidos (o PR D, com a run mais curta da P451 e a curadoria dos grupos) e as estatísticas do quiz (o B2).
- **M20 (o que falta).** As medalhas (Apêndice S do PLANO): os blocos, as do quiz e as do Anime Royale já estão no ar; falta o PR 3, com as novas dos Hits, do Anime e das Misturadas, em avaliação.
- **ME112 (novo).** O menu com submenus no celular: cada categoria da nav abre o seu (os Hits, o Anime), além do "Mais ▾" do M15.
- **ME160 (novo).** O Anime Royale no Histórico: a marca no calendário e as dificuldades de um dia passado, jogadas depois.
- **ME5.** Jogar sem internet (PWA).
- **ME6.** O app do Claude no GitHub revisando cada PR.

## Esperando alguém

**O designer**
- O sol, a lua e o alto-falante definitivos (PD6; hoje são provisórios, P218).
- Os ícones de compartilhar e de estatísticas.
- O selo opaco (PD12) e a intenção para o tema escuro (PD13).
- Conferir o logo empilhado: libera a **S34**, a imagem de compartilhamento (`og:image`).

**Você**
- **ME165 (novo).** No iPhone, jogar o quiz com `?htmlAudio=1` e ver se a prévia B toca depois da A.
- Avisar quando terminar com a taste-skill: o M19 fecha com a limpeza dela (Apêndice R.4).
- **ME163 (novo).** No iPhone, jogar uma dificuldade do Anime Royale e ouvir os 5 trechos em sequência e o clique na barra, também com `?htmlAudio=1`.
- **ME159 (novo).** No iPhone, jogar o Setlist Royale até a 10ª rodada e ver se a página aguenta a memória (até 8 prévias decodificadas, uns 85 MB).
- **ME100 (novo).** No iPhone, ver se o `<audio>` de reserva obedece ao volume e ao mudo (abrir com `?htmlAudio=1`).
- **ME82.** Permitir baixar o selo branco da Apple, para o tema escuro.
- **P16.** Decidir se a URL e o repositório mudam de nome.
