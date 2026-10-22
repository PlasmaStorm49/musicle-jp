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
  // O Histórico (M15, P264) e o "Mais", que no celular junta os Artistas e o Histórico (P265).
  "nav.history": "Histórico",
  "nav.more": "Mais",
  "nav.medals": "Medalhas",

  // O Histórico (M15, P260 a P263): o calendário dos 14 dias antes de hoje e a tela de cada dia.
  "history.title": "Histórico",
  "history.hint": "Os últimos {days} dias. O que você jogar aqui não conta nas estatísticas.",
  "history.date": "{day}/{month}",
  // A data por extenso, só para o leitor de tela ("21/10" seria lido "21 barra 10").
  "history.dateLong": "{day} de {month}",
  "history.month.1": "janeiro",
  "history.month.2": "fevereiro",
  "history.month.3": "março",
  "history.month.4": "abril",
  "history.month.5": "maio",
  "history.month.6": "junho",
  "history.month.7": "julho",
  "history.month.8": "agosto",
  "history.month.9": "setembro",
  "history.month.10": "outubro",
  "history.month.11": "novembro",
  "history.month.12": "dezembro",
  "history.weekdayShort.0": "Dom",
  "history.weekdayShort.1": "Seg",
  "history.weekdayShort.2": "Ter",
  "history.weekdayShort.3": "Qua",
  "history.weekdayShort.4": "Qui",
  "history.weekdayShort.5": "Sex",
  "history.weekdayShort.6": "Sáb",
  "history.weekday.0": "Domingo",
  "history.weekday.1": "Segunda-feira",
  "history.weekday.2": "Terça-feira",
  "history.weekday.3": "Quarta-feira",
  "history.weekday.4": "Quinta-feira",
  "history.weekday.5": "Sexta-feira",
  "history.weekday.6": "Sábado",
  // O nome de cada dia do calendário, para o leitor de tela: o dia e o que foi jogado.
  "history.cellName": "{weekday}, {date}: {marks}",
  "history.cellOff": "{weekday}, {date}: sem diário",
  "history.hitsAll": "Hits, os 2 diários jogados",
  "history.hitsSome": "Hits, 1 de 2 diários jogados",
  "history.hitsNone": "Hits, nenhum diário jogado",
  "history.hitsOff": "sem diário dos Hits",
  "history.animeAll": "Anime, ao menos 1 diário jogado",
  "history.animeNone": "Anime, nenhum diário jogado",
  "history.animeOff": "sem diário do Anime",
  // Os textos de cada categoria, juntos no nome do dia.
  "history.marks": "{hits}; {anime}",
  // A legenda das marcas, embaixo do calendário. Com o Anime, duas linhas: os Hits à esquerda e
  // o Anime à direita, no mesmo lugar em todo dia (P277).
  "history.legendAll": "os 2 diários",
  "history.legendSome": "1 dos 2",
  "history.legendHits": "Hits, à esquerda:",
  "history.legendAnime": "Anime, à direita:",
  "history.legendAnimeAll": "ao menos 1 diário",
  // O cartão do Anime na tela de um dia: o dia fora da agenda do Anime.
  "history.animeUnavailable": "Sem diário do Anime",
  "history.dayTitle": "{weekday}, {date}",
  "history.dayHint": "Jogue o que faltou. Não conta nas estatísticas.",
  "history.late": "jogado depois",
  "history.back": "Voltar ao Histórico",
  "history.backToDay": "Voltar ao dia",
  "history.unavailable": "Não há diário nesse dia.",
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
  // O link do "Sobre e privacidade" (P243), no fim da Início, na linha do "Como funciona" (P259).
  "home.about": "Sobre e privacidade",
  // O link do Histórico na Início (P264), na linha do tema.
  "home.history": "Histórico",

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
  // O resumo de um dia passado (P263): sem a contagem e sem as estatísticas, que são as de hoje.
  "summary.lateNote": "Jogado depois: não conta nas estatísticas.",

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
  // O jogado depois (P263) diz que não foi no dia, para quem compara.
  "share.late": "{header} (jogado depois)",
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
    "Para quem conhece tudo: trechos curtos, de um ponto sorteado da música. Errar custa caro, desistir conta como erro, e 3 erros acabam a partida. Na dúvida, pule ou peça ajuda.",
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
  // As Medalhas (M16, P278 a P288): a tela, os 3 níveis do Superfan (P285) e as gerais de exemplo
  // (só em desenvolvimento, `?medalhas=demo`; a lista de verdade vem no PR 3).
  "medals.title": "Medalhas",
  "medals.streak": "Dias seguidos jogando: {current}. O melhor: {best}.",
  "medals.total": "{earned} de {total} medalhas",
  "medals.general": "Gerais",
  "medals.superfan": "Superfan",
  // O emblema provisório das gerais, no miolo da roseta (o designer manda os de cada uma, P283).
  "medals.generalMark": "★",
  "medals.superfanHint":
    "Três por artista: acertar no modo por artista, terminar o Superfan e terminar perfeito.",
  "medals.level.prata": "Prata",
  "medals.level.ouro": "Ouro",
  "medals.level.suprema": "Suprema",
  "medals.how.ouro": "Termine uma partida do Superfan",
  "medals.how.suprema": "Termine perfeito: sem erro, sem ajuda, tudo em 1 s",
  "medals.earned": "Ganha",
  "medals.progress": "{value} de {goal}",
  "medals.progress.prata": "{value} de {goal} acertos",
  // Os avisos de medalha nova (P279 a P281): o pequeno e o pop-up grande.
  "medals.notice.ok": "Ok",
  "medals.notice.one": "Medalha nova!",
  "medals.notice.many.one": "{count} medalha nova",
  "medals.notice.many.other": "{count} medalhas novas",
  "medals.notice.first.one": "Você já tem {count} medalha",
  "medals.notice.first.other": "Você já tem {count} medalhas",
  "medals.notice.superfan": "{level} de {artist}",
  "medals.notice.toast": "Medalha nova: {name}",
  "medal.demo-primeiro.name": "Primeiro diário",
  "medal.demo-primeiro.how": "Termine um diário no dia",
  "medal.demo-cinco.name": "Cinco diários",
  "medal.demo-cinco.how": "Termine 5 diários no dia",
  "medal.demo-sequencia.name": "Três dias seguidos",
  "medal.demo-sequencia.how": "Jogue 3 dias seguidos",
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
  // leitor de tela (P210). O tipo do tema por dificuldade é a P252; as dicas não prometem a
  // proporção, porque os pesos só se calibram na carga grande (C2).
  "anime.levelShort.facil": "Os temas mais conhecidos",
  "anime.levelShort.medio": "Aberturas e encerramentos",
  "anime.levelShort.dificil": "Também as insert songs e animes menos conhecidos",
  "anime.levelHint.facil": "Os temas mais conhecidos.",
  "anime.levelHint.medio": "Aberturas e encerramentos.",
  "anime.levelHint.dificil": "Também as insert songs e os animes menos conhecidos.",
  "anime.rule.musica":
    "Digite o nome exato da música, em até {total} tentativas. {rounds} rodadas por dia.",
  "anime.rule.titulo":
    "Digite o nome do anime, em até {total} tentativas: vale qualquer temporada. {rounds} rodadas por dia.",
  "anime.unavailable": "Não há diário do Anime hoje.",
  // Um dia passado do Histórico sem o diário do Anime (M15).
  "anime.unavailableDay": "Não há diário do Anime nesse dia.",
  "anime.retry": "Não foi possível carregar o Anime. Confira a conexão.",
  "anime.back": "Voltar ao Anime",
  // O tema na revelação: o anime, o tipo e o número ("Kimetsu no Yaiba · OP1"). Sem número, só o
  // tipo.
  "anime.themeLine": "{anime} · {theme}",
  "anime.theme.OP": "OP{number}",
  "anime.theme.ED": "ED{number}",
  "anime.theme.IN": "insert song",
  // A faixa em 2 ou mais temas: o 1º e quantos mais.
  "anime.themesMore": "{theme} e mais {count}",
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
  // Entre o nome da fonte (um link) e o que ela dá.
  "about.sourceSeparator": ": ",
  "about.privacyTitle": "Privacidade",
  "about.privacy":
    "O jogo não coleta dados pessoais e não tem servidor próprio: o progresso fica só neste navegador (no localStorage). O site é hospedado no GitHub Pages, que, como qualquer servidor, pode registrar os acessos. As prévias, as capas e as consultas das músicas vão direto do navegador à Apple.",
  "about.contactTitle": "Contato",
  "about.contact": "Dúvidas, erros ou um pedido para tirar algo do jogo:",
  "about.contactLink": "as Issues do GitHub",
  // Depois do link das Issues.
  "about.contactEnd": ".",
} as const;

export type MessageKey = keyof typeof ptBR;
