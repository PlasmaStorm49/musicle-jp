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
  "nav.hits": "Hits",
  "nav.anime": "Anime",
  "nav.artists": "Artistas",
  "nav.hitsDone": "(diários terminados)",
  // O ✓ do Anime vale com qualquer um dos 6 diários de hoje terminado (P247).
  "nav.animeDone": "(já jogou hoje)",
  "nav.doneMark": "✓",
  // A tela dos Hits (P225): uma dica só, curta, porque ela já diz tudo.
  "hits.title": "Hits",
  "hits.hint": "A parada do Japão: os dois diários e o Treino.",

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
  // O cartão dos Hits na Início (P226): o estado de cada diário, sem o número.
  "home.hitsShort": "Os diários e o Treino",
  "home.hitsHint":
    "Os diários do Normal e do Desafio, iguais para todos, e o Treino, com rodadas sem fim. As músicas são as da parada do Japão.",
  "home.hitsLine": "{mode}: {status}",
  "home.lineNew": "novo",
  "home.linePlaying": "em andamento",
  "home.lineDone": "terminado, {score} de {max} pontos",
  "home.lineDoneVoid": "terminado",
  "home.practiceSession": "Nesta sessão ({mode}): {score}",
  "home.artistsHint":
    "O Desafio com as músicas de um artista: rodadas sem fim no Livre, ou a partida do Superfan.",
  "home.artistsSession": "Nesta sessão ({artist}): {score}",
  "home.artistsSuperfan": "Superfan ({artist}): {points} em {songs}",
  // O cartão do Anime na Início (P226): uma linha só, lida do save (o Anime carrega só na aba dele).
  "home.animeShort": "Os diários de anime",
  "home.animeHint": "Os diários dos temas de anime, iguais para todos, em três dificuldades.",
  "home.animeLine": "Hoje: {done} de {total} terminados",
  "home.animePlaying": "Hoje: em andamento",
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
  // O link do "Sobre e privacidade" (P243), no fim da Início, ao lado da troca de tema.
  "home.about": "Sobre e privacidade",

  "game.header": "{mode} · nº {number}",
  "game.round": "Rodada {current} de {total}",
  "question.song": "Qual é a música?",
  "question.album": "Qual é o álbum?",
  // O "acertar o anime" (P231): vale qualquer temporada ou sequência (P234).
  "question.anime": "Qual é o anime?",

  "player.play": "Tocar {seconds} s",
  "player.stop": "Parar",
  "player.loading": "Carregando…",
  "player.listenMore": "Ouvir mais",
  // Os segundos que o "Ouvir mais" e o "Pular" acrescentam, juntos numa linha (ME98).
  "player.extra": "(+{seconds} s)",
  // O volume (P216): o nome do botão e da barra, e o valor dela.
  "player.volume": "Volume",
  "player.volumeButton": "Volume: {percent}%",
  "player.volumeMuted": "Volume: mudo",
  "player.volumeValue": "{percent}%",
  "player.explicit": "Conteúdo explícito",
  "player.bar": "{unlocked} de {total} segundos liberados",
  "player.seek": "Ponto do trecho",
  "player.seekValue": "Segundo {at}; {unlocked} de {total} segundos liberados",

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
  // No Anime, no lugar do álbum: o anime e o tema ("Kimetsu no Yaiba · OP1").
  "reveal.animeLabel": "Anime:",
  "reveal.listenFull": "Ouvir a prévia inteira",
  "reveal.listenShort": "Ouvir",
  "reveal.listenFailed": "Não deu para tocar a prévia agora.",
  "reveal.seek": "Ponto da prévia",
  "reveal.seekValue": "Segundo {at} de {total}",
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
  // O "acertar o anime": a busca é pelos títulos e sinônimos dos animes (romaji, inglês, japonês).
  "typing.animeHint": "Título em romaji, em inglês ou em japonês.",
  "typing.animePlaceholder": "Nome do anime",
  "typing.listLabel": "Sugestões",
  "typing.noResults": "Nada encontrado.",
  "typing.results.one": "{count} sugestão",
  "typing.results.other": "{count} sugestões",
  "typing.tried": "já tentou",
  "typing.attempt": "Tentativa {current} de {total}",
  "typing.skip": "Pular",
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
  // O Anime diz a categoria e o diário: "AteMusic Anime · Música · Fácil nº 1".
  "share.headerAnime": "{title} Anime · {mode} nº {number}",
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

  // O Anime (M14): a escolha do modo (P233), a da dificuldade (P232) e os 6 diários, com as regras
  // do Desafio (ME107).
  "anime.title": "Anime",
  "anime.hint": "Temas de anime: acerte a música ou o anime.",
  "anime.mode.musica": "Acertar a música",
  "anime.mode.titulo": "Acertar o anime",
  "anime.modeShort.musica": "Digite o nome da música",
  "anime.modeShort.titulo": "Digite o nome do anime",
  "anime.modeHint.musica":
    "Ouça o trecho de um tema de anime e digite o nome exato da música, em até {total} tentativas. Três dificuldades, de {rounds} rodadas cada uma.",
  "anime.modeHint.titulo":
    "Ouça o trecho de um tema de anime e digite o nome do anime, em até {total} tentativas: vale qualquer temporada. Três dificuldades, de {rounds} rodadas cada uma.",
  // O estado dos 3 diários de um modo, numa linha do cartão dele.
  "anime.modeNew": "{total} diários novos",
  "anime.modePlaying": "em andamento",
  "anime.modeDone": "{done} de {total} terminados",

  "anime.levelsHint": "Escolha a dificuldade.",
  "anime.level.facil": "Fácil",
  "anime.level.medio": "Médio",
  "anime.level.dificil": "Difícil",
  // A dica curta de cada dificuldade, na tela; a inteira, abaixo, com a regra do modo, fica para o
  // leitor de tela (P210). O tipo do tema por dificuldade é a P252.
  "anime.levelShort.facil": "Os temas mais famosos",
  "anime.levelShort.medio": "Aberturas e encerramentos",
  "anime.levelShort.dificil": "Também as insert songs",
  "anime.levelHint.facil": "Quase só aberturas, as mais conhecidas.",
  "anime.levelHint.medio": "A maioria aberturas, e alguns encerramentos.",
  "anime.levelHint.dificil":
    "Aberturas, encerramentos e insert songs, também de animes pouco conhecidos.",
  "anime.rule.musica":
    "Digite o nome exato da música, em até {total} tentativas. {rounds} rodadas por dia.",
  "anime.rule.titulo":
    "Digite o nome do anime, em até {total} tentativas: vale qualquer temporada. {rounds} rodadas por dia.",
  "anime.unavailable": "Não há diário do Anime hoje.",
  "anime.retry": "Não foi possível carregar o Anime. Confira a conexão.",
  "anime.back": "Voltar ao Anime",
  // O tema na revelação: o anime, o tipo e o número ("Kimetsu no Yaiba · OP1"). Sem número, só o
  // tipo.
  "anime.themeLine": "{anime} · {theme}",
  "anime.theme.OP": "OP{number}",
  "anime.theme.ED": "ED{number}",
  "anime.theme.IN": "insert song",
  "anime.themeSeparator": "; ",
  // Os créditos das fontes (P241), nas telas de escolha do Anime: o MyAnimeList só em texto (P256).
  // O link leva ao "Sobre e privacidade", com tudo.
  "anime.credits": "Dados: AnimeThemes, AnisongDB e MyAnimeList · Prévias: Apple Music",
  "anime.creditsMore": "(sobre e privacidade)",
  // O nome de cada diário, no cabeçalho, no resumo e no compartilhar. Curto, para o cabeçalho da
  // rodada caber numa linha (a aba Anime da nav já diz a categoria).
  "daily.anime-musica-facil": "Música · Fácil",
  "daily.anime-musica-medio": "Música · Médio",
  "daily.anime-musica-dificil": "Música · Difícil",
  "daily.anime-titulo-facil": "Anime · Fácil",
  "daily.anime-titulo-medio": "Anime · Médio",
  "daily.anime-titulo-dificil": "Anime · Difícil",

  // O "Sobre e privacidade" (P243): o jogo, as fontes, a privacidade e o contato (P258).
  "about.title": "Sobre e privacidade",
  "about.intro":
    "O AteMusic é um jogo de adivinhar músicas japonesas: os sucessos da parada do Japão e os temas de anime. É um projeto pessoal.",
  "about.sourcesTitle": "Fontes",
  "about.apple": "Apple Music",
  "about.appleWhat": "a parada do Japão, as capas e as prévias, cedidas pelo iTunes.",
  "about.animethemes": "AnimeThemes",
  "about.animethemesWhat": "os animes, os temas e os sinônimos dos títulos.",
  "about.anisongdb": "AnisongDB",
  "about.anisongdbWhat": "a dificuldade, os artistas e as insert songs.",
  "about.mal": "MyAnimeList",
  "about.malWhat": "a popularidade dos animes.",
  "about.privacyTitle": "Privacidade",
  "about.privacy":
    "O jogo não coleta dados pessoais. O progresso fica só neste navegador (no localStorage), e nada é enviado a um servidor do jogo. As prévias e as capas vêm direto da Apple.",
  "about.contactTitle": "Contato",
  "about.contact": "Dúvidas, erros ou um pedido para tirar algo do jogo:",
  "about.contactLink": "as Issues do GitHub",
} as const;

export type MessageKey = keyof typeof ptBR;
