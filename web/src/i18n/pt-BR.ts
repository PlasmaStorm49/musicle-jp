// Todos os textos da tela ficam aqui (regra inviolável 2). Parâmetros entre chaves: {nome}.
export const ptBR = {
  "app.title": "AteMusic",
  "app.tagline": "Adivinhe a música japonesa do dia",

  "load.loading": "Carregando…",
  "load.retry": "Não foi possível carregar o jogo. Confira a conexão.",
  "load.retryButton": "Tentar de novo",
  "load.update": "O jogo foi atualizado desde que esta página abriu.",
  "load.updateButton": "Recarregar a página",
  // "Diário" é o jogo de cada dia; "Desafio" é um dos modos (P103).
  "day.unavailable": "Não há diário hoje.",
  "day.practiceLink": "O Treino continua disponível: jogar agora",

  // Os dois modos (P100), pelo alvo: o Normal (álbum, 4 opções) e o Desafio (música, digitada).
  "mode.album": "Normal",
  "mode.song": "Desafio",

  "nav.label": "Jogos",
  "nav.home": "Início",
  "nav.practice": "Treino",
  "nav.artists": "Artistas",
  "nav.done": "(terminado)",
  "nav.doneMark": "✓",

  "home.modesTitle": "Escolha o jogo",
  "home.albumHint":
    "Ouça o trecho e escolha o álbum ou single entre 4 opções. Cada trecho a mais vale 1 ponto a menos. {rounds} rodadas por dia.",
  "home.songHint":
    "Ouça o trecho e digite o nome exato da música, em até {total} tentativas. {rounds} rodadas por dia.",
  "home.practiceHint": "Rodadas sem fim do Normal ou do Desafio, um modo por vez.",
  // As dicas curtas dos cartões da Início, na tela (P210); as inteiras, acima, ficam para o leitor
  // de tela.
  "home.albumShort": "4 opções de álbum",
  "home.songShort": "Digite o nome da música",
  "home.practiceShort": "Rodadas sem fim",
  "home.artistsShort": "Por artista e Superfan",
  "home.statusNew": "nº {number} · novo",
  "home.statusPlaying": "nº {number} · em andamento",
  "home.statusDone": "nº {number} · terminado, {score} de {max} pontos",
  "home.statusDoneVoid": "nº {number} · terminado",
  "home.statusUnavailable": "Não há diário hoje",
  "home.practiceSession": "Nesta sessão ({mode}): {score}",
  "home.artistsHint":
    "O Desafio com as músicas de um artista: rodadas sem fim no Livre, ou a partida do Superfan.",
  "home.artistsSession": "Nesta sessão ({artist}): {score}",
  "home.artistsSuperfan": "Superfan ({artist}): {points} em {songs}",
  "home.howTitle": "Como funciona",
  // Espaço que não quebra (U+00A0) entre o número e o "s".
  "home.howClip":
    "Você ouve um trecho de um sucesso no Japão. Ele começa com {first} s e cresce até {last} s.",
  "home.howDaily": "Os diários são iguais para todos e mudam à meia-noite, horário de Brasília.",
  "home.howPractice": "O Treino não fica salvo: jogue quantas rodadas quiser.",
  // A troca de tema, no fim da Início (P176, P191).
  "home.themeTitle": "Tema",
  // O switch (P217): o nome é o do estado ligado; a dica fica para o leitor de tela.
  "home.themeDark": "Tema escuro",
  "home.themeHint": "Sem escolha, o jogo segue o tema do aparelho.",

  "game.header": "{mode} · nº {number}",
  "game.round": "Rodada {current} de {total}",
  "question.song": "Qual é a música?",
  "question.album": "Qual é o álbum?",

  "player.play": "Tocar {seconds} s",
  "player.stop": "Parar",
  "player.loading": "Carregando…",
  "player.listenMore": "Ouvir mais (+{seconds} s)",
  "player.explicit": "Conteúdo explícito",
  "player.bar": "{unlocked} de {total} segundos liberados",

  "options.giveUp": "Não sei",

  "item.artistSeparator": "·",

  "reveal.won": "Acertou! {points} de {max} pontos.",
  "reveal.wonHelp": "Acertou com ajuda: {points}.",
  "reveal.errors.one": "{count} erro: {points}.",
  "reveal.errors.other": "{count} erros: {points}.",
  "reveal.gaveUp": "Desistiu: {points}.",
  "reveal.lost": "Não foi dessa vez.",
  "reveal.correct": "Resposta certa",
  "reveal.yourPick": "Sua escolha",
  "reveal.albumLabel": "Álbum:",
  "reveal.listenFull": "Ouvir a prévia inteira",
  "reveal.listenFailed": "Não deu para tocar a prévia agora.",
  "reveal.next": "Próxima rodada",
  "reveal.finish": "Ver resultado",

  "void.message": "Áudio indisponível: esta rodada foi anulada e não conta.",

  // Atribuição da Apple (P69): o texto alternativo é o do selo oficial em pt-BR, e a frase em
  // inglês é a exigida pelos termos do iTunes Search API.
  "attribution.badge": "Ouça no Apple Music",
  "attribution.newTab": "(abre em outra aba)",
  "attribution.courtesy": "Prévias cedidas pelo iTunes",
  // Em inglês, como os termos pedem: a tela o marca com lang="en" (pronúncia do leitor de tela).
  "attribution.courtesyEn": "(provided courtesy of iTunes).",

  "summary.title": "Resultado do dia",
  "summary.score": "{score} de {max} pontos",
  "summary.round": "Rodada {number}: {result}",
  // A célula da rodada no resumo (a frase de cima fica para o leitor de tela).
  "summary.roundShort": "Rodada {number}",
  "summary.pointsHelp": "{points} · ajuda",
  "summary.won": "acertou, {points}",
  "summary.wonHelp": "acertou com ajuda, {points}",
  "summary.lost": "não acertou",
  "summary.void": "anulada",

  "count.points.one": "{count} ponto",
  "count.points.other": "{count} pontos",
  "count.days.one": "{count} dia",
  "count.days.other": "{count} dias",
  "count.games.one": "{count} jogo",
  "count.games.other": "{count} jogos",

  // A dica do campo: a 1ª frase na tela; a do teclado, só para o leitor de tela (P210).
  "typing.hint": "Título, artista, romaji ou kana.",
  "typing.keysHint": "Escolha na lista com as setas e Enter.",
  "typing.placeholder": "Nome da música ou do artista",
  // Modo por artista (M13): a busca é só pelo título, entre as músicas dele.
  "typing.titleHint": "Título, romaji ou kana.",
  "typing.titlePlaceholder": "Nome da música",
  "typing.listLabel": "Sugestões",
  "typing.noResults": "Nada encontrado.",
  "typing.results.one": "{count} sugestão",
  "typing.results.other": "{count} sugestões",
  "typing.tried": "já tentou",
  "typing.attempt": "Tentativa {current} de {total}",
  "typing.skip": "Pular (+{seconds} s)",
  "typing.giveUp": "Desistir",
  "typing.wrong": "Errou: {title}. Tentativa {current} de {total}.",
  "typing.skipped": "Pulou. Tentativa {current} de {total}.",
  // Com a ajuda na tela (P163), o contador de tentativas some: o pulo diz o trecho novo.
  "typing.skippedHelp": "Pulou. O trecho agora tem {seconds} s.",
  // A ajuda do Desafio (P149 a P152): opções no lugar do campo.
  // Sem número de pontos no botão: o custo está na dica, quando as opções aparecem.
  "help.button": "Pedir ajuda",
  "help.hint": "Escolha entre as opções: errar encerra a rodada, e acertar vale {points}.",
  "help.hintWrong":
    "Escolha entre as opções: errar encerra a rodada e vale {wrong}, e acertar vale {points}.",
  // Na tela, a dica curta; a inteira (acima) fica para o leitor de tela (P210).
  "help.hintShort": "Errar encerra; acertar vale {points}.",
  "help.hintWrongShort": "Errar encerra e vale {wrong}; acertar, {points}.",
  "help.listLabel": "Opções da ajuda",
  "help.available": "A ajuda já pode ser pedida.",

  "attempts.title": "Suas tentativas",
  "attempts.wrong": "Errou:",
  "attempts.right": "Acertou:",
  "attempts.skip": "Pulou",
  "attempts.unknown": "fora do catálogo",

  "stats.title": "Estatísticas",
  "stats.played": "Jogos",
  "stats.average": "Média",
  "stats.currentStreak": "Sequência atual",
  "stats.bestStreak": "Melhor sequência",
  "stats.distribution": "Pontos por dia",
  "stats.bucket": "{points}: {games}",
  "stats.bucketToday": "{points}: {games}, incluindo hoje",
  "stats.none": "sem dados",

  "share.header": "{title} · {mode} nº {number}",
  "share.button": "Compartilhar resultado",
  "share.copied": "Resultado copiado. É só colar onde quiser.",
  // Na tela, o botão diz isto por 2 s depois de copiar; a frase de cima vai para o aria-live.
  "share.copiedShort": "Copiado!",
  "share.manual": "Não foi possível copiar sozinho. Copie o texto abaixo:",

  "countdown.label": "Próximo diário em",
  "countdown.ready": "O novo diário já está disponível.",
  "countdown.play": "Jogar o novo diário",

  "storage.unavailable": "Seu progresso não será salvo neste navegador.",
  "storage.future":
    "Há uma versão mais nova do jogo aberta. Recarregue a página para salvar seu progresso.",
  "storage.full": "Não foi possível salvar o progresso: o armazenamento do navegador está cheio.",

  "practice.title": "Treino",
  "practice.round": "Rodada {number}",
  "practice.score": "{points} em {rounds}",
  "practice.rounds.one": "{count} rodada",
  "practice.rounds.other": "{count} rodadas",
  "practice.header": "Treino · {mode}",
  "practice.chooseHint": "Escolha o modo. Para trocar depois, reinicie o Treino.",
  "practice.albumHint": "Ouça o trecho e escolha o álbum ou single entre 4 opções.",
  "practice.songHint": "Ouça o trecho e digite o nome exato da música, em até {total} tentativas.",
  "practice.restart": "Reiniciar o Treino",
  // Na tela, o botão de sair da sessão fica curto; o nome inteiro é o do leitor de tela (P210).
  "practice.restartShort": "Reiniciar",
  "practice.restartWarning": "Reiniciar o Treino? O placar desta sessão ({score}) será perdido.",
  "practice.restartConfirm": "Sim, reiniciar",
  "practice.restartCancel": "Cancelar",
  "practice.empty":
    "Não há rodada para sortear agora. As respostas dos diários de hoje voltam ao Treino quando eles terminarem.",
  "practice.retry": "Sortear de novo",

  // Modo por artista (M13): o Desafio, em rodadas sem fim, com as músicas de um artista.
  "artists.title": "Artistas",
  // O título da seção dos artistas de fora do Japão, embaixo da lista principal (P200).
  "artists.foreign": "De fora do Japão",
  "artists.chooseHint":
    "Escolha o artista e depois o modo: ouça o trecho e digite o nome exato da música.",
  "artists.chooseShort": "Escolha o artista e depois o modo.",
  "artists.songs.one": "{count} música",
  "artists.songs.other": "{count} músicas",
  "artists.loadingArtist": "Carregando as músicas de {artist}…",
  "artists.retry": "Não foi possível carregar os artistas. Confira a conexão.",
  "artists.retryArtist": "Não foi possível carregar as músicas de {artist}. Confira a conexão.",
  "artists.back": "Voltar à lista",
  "artists.restart": "Trocar de artista",
  "artists.restartShort": "Trocar",
  "artists.restartWarning": "Trocar de artista? O placar desta sessão ({score}) será perdido.",
  "artists.restartConfirm": "Sim, trocar",
  // A escolha do submodo, depois do artista (P161), e o Superfan (ME61).
  "artists.modeHint": "Escolha o modo.",
  "artists.free": "Livre",
  "artists.freeHint": "Rodadas sem fim do Desafio, com o placar da sessão.",
  "artists.superfanHint":
    "Para quem conhece tudo: trechos curtos, de um ponto sorteado da música. Errar custa caro, desistir também, e 3 erros acabam a partida. Na dúvida, pule ou peça ajuda.",
  "superfan.name": "Superfan",
  "superfan.song": "Música {number}",
  "superfan.score": "Placar: {points}",
  "superfan.errors": "Erros: {count} de {total}",
  "superfan.helps": "Ajudas: {count} de {total}",
  "superfan.quit": "Encerrar a partida",
  "superfan.quitShort": "Encerrar",
  "superfan.quitWarning": "Encerrar a partida? O placar fica em {points}.",
  "superfan.quitConfirm": "Sim, encerrar",
  "superfan.next": "Próxima música",
  "superfan.result": "Ver resultado",
  "superfan.endTitle": "Fim da partida",
  "superfan.endErrors": "{total} erros: a partida acabou.",
  "superfan.endQuit": "Você encerrou a partida.",
  "superfan.endDone": "Todas as músicas da partida tocaram.",
  "superfan.endEmpty":
    "Não há música para sortear agora. As músicas dos diários de hoje voltam quando eles terminarem.",
  "superfan.right": "Acertou {right} de {played}.",
  "superfan.songs.one": "{count} música",
  "superfan.songs.other": "{count} músicas",
  "superfan.again": "Jogar de novo",
  "superfan.errorNote": "Erro {count} de {total}: {points}.",
  "superfan.over": "{total} erros: a partida acabou. Veja o resultado.",
  "superfan.giveUp": "Desistir da música",
  "artists.empty":
    "Não há rodada para sortear agora. As músicas dos diários de hoje voltam quando eles terminarem.",
} as const;

export type MessageKey = keyof typeof ptBR;
