# Backlog do AteMusic

O que falta fazer, numa linha por item, para ler rápido. O código (ME = melhoria, S = sugestão, P = decisão) leva ao detalhe no [`PLANO.md`](PLANO.md), seção 7. Item novo entra aqui e lá; o que fica pronto sai daqui e vai para as "Feitas" do PLANO.

Atualizado em 25/10/2026.

## Próximos

- **O PR do robô de segunda, 26/10:** o 1º com as Misturadas crescendo junto (de 31/10 em diante, com a franquia espaçada, P364) e o Anime de 13/11 em diante com a carga C3 e o limite de novas (P360). Merge no mesmo dia: a agenda das Misturadas acaba em 30/10.
- **Depois dele, se trouxer o Anime:** o `anime-latin`, o `build` e o `build-artists` da Apple num PR à parte, para os Hits e os artistas lerem o latino das músicas novas (P372; o `build` avisa).

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
- **ME10.** `actionlint` ou `zizmor` na CI.
- **ME12.** A escolha da base do `schedule-check` em Python, com teste.
- **ME15.** Um teste rápido contra o `vite preview`, para pegar caminho absoluto no código.
- **ME39.** Testes de componente do `Game` e do `App`.
- **ME69.** Teste de tela do "Pedir ajuda" sumindo depois da 3ª ajuda do Superfan.
- **S8 a S11.** O `fetchedAt` pelo cabeçalho do RSS; o e2e da reserva com `<audio>` de verdade; hashes no `constraints.txt`; o `build --check`.
- **S6.** Cada decisão como um ADR em `docs/decisoes/`.
- **S5.** O estilo de saída "Explanatory" nas sessões: parece já estar ligado; conferir.

## Coisas novas que quero implementar

- **ME122 (novo).** O modo "Qual é a mais popular": tocam duas músicas, e a pessoa escolhe a mais popular. Para depois.
- **ME112 (novo).** O menu com submenus no celular: cada categoria da nav abre o seu (os Hits, o Anime), além do "Mais ▾" do M15.
- **ME2.** Modo royale: 6 músicas, 9 opções, sem errar.
- **ME5.** Jogar sem internet (PWA).
- **ME6.** O app do Claude no GitHub revisando cada PR.

## Esperando alguém

**O designer**
- O sol, a lua e o alto-falante definitivos (PD6; hoje são provisórios, P218).
- Os ícones de compartilhar e de estatísticas.
- O selo opaco (PD12) e a intenção para o tema escuro (PD13).
- Conferir o logo empilhado: libera a **S34**, a imagem de compartilhamento (`og:image`).

**Você**
- **ME100 (novo).** No iPhone, ver se o `<audio>` de reserva obedece ao volume e ao mudo (abrir com `?htmlAudio=1`).
- **ME82.** Permitir baixar o selo branco da Apple, para o tema escuro.
- **P16.** Decidir se a URL e o repositório mudam de nome.
- Segunda, 26/10: o PR do robô, com o merge no mesmo dia.
