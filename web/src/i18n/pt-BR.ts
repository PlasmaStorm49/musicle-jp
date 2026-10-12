// Todos os textos da tela ficam aqui (regra inviolável 2). Parâmetros entre chaves: {nome}.
export const ptBR = {
  "app.title": "AteMusic",
  "app.tagline": "Adivinhe a música japonesa do dia",
  // O 当 de 当てる (ateru: acertar), no logo provisório (P95).
  "app.logoMark": "当",

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
  "home.statusNew": "nº {number} · novo",
  "home.statusPlaying": "nº {number} · em andamento",
  "home.statusDone": "nº {number} · terminado, {score} de {max} pontos",
  "home.statusDoneVoid": "nº {number} · terminado",
  "home.statusUnavailable": "Não há diário hoje",
  "home.practiceSession": "Nesta sessão ({mode}): {score}",
  "home.artistsHint": "O Desafio com as músicas de um artista, em rodadas sem fim.",
  "home.artistsSession": "Nesta sessão ({artist}): {score}",
  "home.howTitle": "Como funciona",
  // Espaço que não quebra (U+00A0) entre o número e o "s".
  "home.howClip":
    "Você ouve um trecho de um sucesso no Japão. Ele começa com {first} s e cresce até {last} s.",
  "home.howDaily": "Os diários são iguais para todos e mudam à meia-noite, horário de Brasília.",
  "home.howPractice": "O Treino não fica salvo: jogue quantas rodadas quiser.",

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

  "typing.hint": "Título, artista, romaji ou kana. Escolha na lista com as setas e Enter.",
  "typing.placeholder": "Nome da música ou do artista",
  // Modo por artista (M13): a busca é só pelo título, entre as músicas dele.
  "typing.titleHint": "Título, romaji ou kana. Escolha na lista com as setas e Enter.",
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
  "help.button": "Pedir ajuda ({count} opções, vale {points})",
  "help.hint": "Escolha entre as opções: errar encerra a rodada, e acertar vale {points}.",
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
  "practice.restartWarning": "Reiniciar o Treino? O placar desta sessão ({score}) será perdido.",
  "practice.restartConfirm": "Sim, reiniciar",
  "practice.restartCancel": "Cancelar",
  "practice.empty":
    "Não há rodada para sortear agora. As respostas dos diários de hoje voltam ao Treino quando eles terminarem.",
  "practice.retry": "Sortear de novo",

  // Modo por artista (M13): o Desafio, em rodadas sem fim, com as músicas de um artista.
  "artists.title": "Artistas",
  "artists.chooseHint":
    "Escolha o artista. Ouça o trecho e digite o nome exato da música, em até {total} tentativas.",
  "artists.songs.one": "{count} música",
  "artists.songs.other": "{count} músicas",
  "artists.loadingArtist": "Carregando as músicas de {artist}…",
  "artists.retry": "Não foi possível carregar os artistas. Confira a conexão.",
  "artists.retryArtist": "Não foi possível carregar as músicas de {artist}. Confira a conexão.",
  "artists.back": "Voltar à lista",
  "artists.restart": "Trocar de artista",
  "artists.restartWarning": "Trocar de artista? O placar desta sessão ({score}) será perdido.",
  "artists.restartConfirm": "Sim, trocar",
  "artists.empty":
    "Não há rodada para sortear agora. As músicas dos diários de hoje voltam quando eles terminarem.",
} as const;

export type MessageKey = keyof typeof ptBR;
