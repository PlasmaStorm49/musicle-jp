# Backlog do AteMusic

O que falta fazer, numa linha por item, para ler rápido. O código (ME = melhoria, S = sugestão, P = decisão) leva ao detalhe no [`PLANO.md`](PLANO.md), seção 7. Item novo entra aqui e lá; o que fica pronto sai daqui e vai para as "Feitas" do PLANO.

Atualizado em 21/10/2026.

## Próximos, na ordem combinada (21/10)

1. **ME36**: as 3 actions novas (o merge só depois das 23:52 de 21/10).
2. **ME94**: o Desistir como botão.
3. **ME95**: a barra que leva ao ponto da música.
4. **ME99**: a revisão adiada do switch e do volume.
5. **ME96**: o plano das categorias no menu (os Hits).
6. **ME97**: a categoria de anime, depois de trabalhar a curadoria.

## Itens para corrigir

**Com data**
- **ME36.** Atualizar as 3 actions com versão nova. Libera em 22/10.

**Na tela**
- **ME94 (novo).** "Desistir", "Não sei" e "Desistir da música" como botão de verdade, com o texto vermelho (P220): hoje são texto sublinhado e parecem link.
- **ME98 (novo).** "Ouvir mais (+1 s)" quebra em duas linhas no celular: a quebra não pode partir o "(+1 s)" ao meio.
- **ME99 (novo).** A revisão adiada do switch de tema e do volume (#45 e #46): o `revisor`, o `/code-review` e os 15 pontos já anotados do #45.
- **ME33.** Textos: o "- Single" na revelação, o dia anulado com "0/0" e o "Áudio indisponível" quando o motivo é outro. Conferir o que o PR D já resolveu.
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
- **ME62.** No Treino da parada, um cover de outro artista escapa da exclusão por título.
- **S24.** Conferir a duração real das prévias: no Superfan, uma prévia curta deixaria menos de 9 s.

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
- **ME95 (novo).** Clicar na barra da música leva àquele ponto, na rodada (só no trecho já liberado) e na revelação (P224).
- **S18.** "Cada trecho a mais vale 1 ponto a menos" também no cartão do Normal, no Treino.
- **S22.** O selo da rodada no modo por artista leva à página do artista na loja.
- **S29.** As 3 faíscas do 当 animadas no acerto.
- **S30.** O carregamento com as faíscas acendendo em sequência.
- **ME8.** Aceitar erro de digitação no autocompletar.
- **ME66.** No modo por artista, o sorteio tira mais álbuns do que precisa (o lado seguro).
- **ME38.** Ligar no pipeline os álbuns do mesmo lançamento (pede mudança de esquema).

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

- **ME96 (novo).** O Normal, o Desafio e o Treino numa categoria só no menu, os "Hits" (P221, P222), para abrir espaço a outras categorias.
- **ME97 (novo).** Uma categoria de músicas de anime populares, por uma lista curada (P223), aproveitando o que o modo por artista já faz. A curadoria ainda vai ser trabalhada.
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
- **ME100 (novo).** No iPhone, ver se o `<audio>` de reserva obedece ao volume (abrir com `?htmlAudio=1`).
- **ME82.** Permitir baixar o selo branco da Apple, para o tema escuro.
- **P16.** Decidir se a URL e o repositório mudam de nome.
- Segunda, 26/10: o PR do robô, com o merge no mesmo dia.
