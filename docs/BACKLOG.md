# Backlog do AteMusic

O que falta fazer, numa linha por item, para ler rápido. O código (ME = melhoria, S = sugestão, P = decisão) leva ao detalhe no [`PLANO.md`](PLANO.md), seção 7. Item novo entra aqui e lá; o que fica pronto sai daqui e vai para as "Feitas" do PLANO.

Atualizado em 22/10/2026.

## Próximos, na ordem combinada (22/10)

1. **ME107 (urgente)**: repensar a pontuação de todos os modos. O desistir do Superfan virou um erro de −5 (P290), e o esquema inteiro precisa ser revisto.
2. **ME105**: as medalhas (M16, Apêndice O). No ar, invisíveis: o núcleo e o save v8, a estrutura, os avisos e os dados e o desenho de cada artista (PRs 1, 2a, 2b e 3a). Falta o 3b: as medalhas gerais (a lista do usuário, em montagem) e o lançamento no site.

## Itens para corrigir

**Na tela**
- **ME33.** Textos: o "- Single" na revelação, o dia anulado com "0/0" e o "Áudio indisponível" quando o motivo é outro. Conferir o que o PR D já resolveu.
- **ME106 (novo).** O negrito da aba ativa da nav empurra a vizinha em 2 a 3 px ao trocar de categoria, desde que as abas ficam juntas à esquerda (ME96).
- **ME37.** O Player perde o foco no "Carregando…": trocar o `disabled` pelo `aria-disabled`.
- **ME76.** O aviso do leitor de tela continua na página depois de trocar de aba.
- **ME68.** O `lang="ja"` no nome do artista no cartão da Início e nos avisos.
- **S32.** No Superfan, o custo de desistir aparece só na revelação, e não na rodada.
- **ME92.** No modo por artista, o nome latino do álbum nunca aparece.

**Nos nomes e no romaji**
- **ME80.** Créditos com o nome que a Apple usa (Inoue Sonoko; Sano Hayato & Yoshida Jinto).
- **ME81.** Leituras erradas do cutlet nos artistas (蜃気楼 "Shinki rou", 私は最強 "Watakushi wa saikyou").
- **ME90.** Parceiros ocidentais em katakana, sem o nome latino (as faixas do System of a Down).
- **ME86.** Duas músicas diferentes viram uma só ("Someday", do Bolbbalgan4), e uma some.
- **ME88.** "Song (Remix - feat. X)" vira "Song (Remix" no pipeline.
- **ME79.** O `validate` deixa passar kanji ou kana no título latino.
- **ME91.** A CI não acusa título que ficou sem latino.

**No jogo**
- **ME110 (novo).** O Treino e os Artistas não excluem as respostas do Anime de hoje (raro: pede o mesmo `songKey` nos dois catálogos). Aceito por ora, como a P248.
- **ME62.** No Treino da parada, um cover de outro artista escapa da exclusão por título.
- **ME113 (novo).** Com o Histórico, o Treino, os Artistas e a ajuda do diário de hoje podem entregar a resposta de um dia passado ainda não jogado (excluem só as de hoje). Aceito, como a ME110.
- **S24.** Conferir a duração real das prévias: no Superfan, uma prévia curta deixaria menos de 9 s.

**No Anime**
- **ME115 (novo).** O "Kaikai Kitan", 1ª abertura de Jujutsu Kaisen, ficou fora do acervo (o tema não casou com a Apple): investigar.

**Pipeline, CI e testes**
- **ME83.** A conferência da base no `dist` deixa passar um `/favicon.svg` sem ela.
- **ME11.** Fixar o `pip`, o patch do Python e o minor do Node na CI.
- **ME89.** Um e2e falhou uma vez na CI (o Enter na nav): conferir a espera do `open()`.
- **ME41.** "sem desafio" vira "sem diário" nos avisos do pipeline e do robô.
- **ME40.** O `correctOptionId` é gravado e ninguém usa.
- **ME67.** O `?failAudio=` não faz falhar uma faixa que só existe num artista (desenvolvimento).
- **S16.** O `--today` no comando do `schedule-check` do `CLAUDE.md` e no `/verificar`.
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

**Desempenho e tamanho**
- **S33.** A fonte mais leve: 7,5 MB a menos no `dist` e 210 kB a menos de CSS.
- **ME18.** Medir o tempo até o 1º som no site.
- **ME42.** Pré-carregar a 1ª rodada na escolha do modo do Treino.
- **ME3.** Esconder a resposta do dia, que está no JSON público, e dividir a agenda por mês.
- **ME17.** Dividir o catálogo real quando passar de cerca de 1 MB.
- **ME4.** Gerar o dia no navegador quando a agenda acabar.

**Pipeline, CI e testes**
- **ME10.** `actionlint` ou `zizmor` na CI.
- **ME12.** A escolha da base do `schedule-check` em Python, com teste.
- **ME15.** Um teste rápido contra o `vite preview`, para pegar caminho absoluto no código.
- **ME39.** Testes de componente do `Game` e do `App`.
- **ME69.** Teste de tela do "Pedir ajuda" sumindo depois da 3ª ajuda do Superfan.
- **S8 a S11.** O `fetchedAt` pelo cabeçalho do RSS; o e2e da reserva com `<audio>` de verdade; hashes no `constraints.txt`; o `build --check`.
- **S6.** Cada decisão como um ADR em `docs/decisoes/`.
- **S5.** O estilo de saída "Explanatory" nas sessões: parece já estar ligado; conferir.

## Coisas novas que quero implementar

- **ME103 (novo).** Guardar o progresso sem servidor: exportar e importar por um código ou um arquivo, no lugar do login. Depois do Anime.
- **ME112 (novo).** O menu com submenus no celular: cada categoria da nav abre o seu (os Hits, o Anime), além do "Mais ▾" do M15.
- **ME118 (novo).** A estante: as medalhas favoritas à mostra o tempo todo, como troféus. Depois do M16; o save v8 já tem o campo.
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
- **ME108 (novo).** Decidir se a lista de negação do `.claude/settings.json` passa a cobrir os gerados dos artistas e do Anime, como diz a regra 3 do `CLAUDE.md`.
- **P16.** Decidir se a URL e o repositório mudam de nome.
- Segunda, 26/10: o PR do robô, com o merge no mesmo dia.
