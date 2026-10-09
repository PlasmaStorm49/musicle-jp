// Todos os textos da tela ficam aqui (regra inviolável 2). Parâmetros entre chaves: {nome}.
export const ptBR = {
  "app.title": "musicle-jp",
  "app.tagline": "Adivinhe a música japonesa do dia",

  "load.loading": "Carregando o desafio…",
  "load.retry": "Não foi possível carregar o desafio. Confira a conexão.",
  "load.retryButton": "Tentar de novo",
  "load.update": "O jogo foi atualizado desde que esta página abriu.",
  "load.updateButton": "Recarregar a página",
  "day.unavailable": "O desafio de hoje ainda não está disponível. Volte mais tarde.",
  "day.practiceLink": "Enquanto isso, jogue o Treino",

  "nav.label": "Jogos",

  "game.header": "{daily} · nº {number}",
  "game.round": "Rodada {current} de {total}",
  "question.song": "Qual é a música?",
  "question.album": "Qual é o álbum?",

  "player.play": "Tocar {seconds} s",
  "player.stop": "Parar",
  "player.loading": "Carregando…",
  "player.listenMore": "Ouvir mais (+{seconds} s, −1 ponto)",
  "player.explicit": "Conteúdo explícito",
  "player.bar": "{unlocked} de {total} segundos liberados",

  "options.giveUp": "Não sei",

  "reveal.won": "Acertou! {points} de 6 pontos.",
  "reveal.lost": "Não foi dessa vez.",
  "reveal.correct": "Resposta certa",
  "reveal.yourPick": "Sua escolha",
  "reveal.album": "Álbum: {album}",
  "reveal.listenFull": "Ouvir a prévia inteira",
  "reveal.next": "Próxima rodada",
  "reveal.finish": "Ver resultado",

  "void.message": "Áudio indisponível: esta rodada foi anulada e não conta.",

  "summary.title": "Resultado do dia",
  "summary.score": "{score} de {max} pontos",
  "summary.round": "Rodada {number}: {result}",
  "summary.won": "acertou, {points}",
  "summary.lost": "não acertou",
  "summary.void": "anulada",

  "count.points.one": "{count} ponto",
  "count.points.other": "{count} pontos",
  "count.days.one": "{count} dia",
  "count.days.other": "{count} dias",
  "count.games.one": "{count} jogo",
  "count.games.other": "{count} jogos",

  "target.song": "Diário Música",
  "target.album": "Diário Álbum",
  "mode.choice": "4 opções",
  "mode.typing": "digitação",
  "mode.title": "Como você quer responder hoje?",
  "mode.locked": "O modo vale para o dia inteiro.",
  "mode.choiceName": "4 opções",
  "mode.choiceHint": "Escolha entre 4 opções. Um palpite só; ouvir mais custa 1 ponto.",
  "mode.typingName": "Digitação",
  "mode.typingHint": "Digite o nome ou o artista. Até {total} tentativas.",
  "mode.lastUsed": "último usado",

  "typing.hint": "Título, artista, romaji ou kana. Escolha na lista com as setas e Enter.",
  "typing.placeholder.song": "Nome da música ou do artista",
  "typing.placeholder.album": "Nome do álbum ou do artista",
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

  "share.header": "{title} · {daily} nº {number} · {mode}",
  "share.button": "Compartilhar resultado",
  "share.copied": "Resultado copiado. É só colar onde quiser.",
  "share.manual": "Não foi possível copiar sozinho. Copie o texto abaixo:",

  "countdown.label": "Próximo desafio em",
  "countdown.ready": "O novo desafio já está disponível.",
  "countdown.play": "Jogar o novo desafio",

  "storage.unavailable": "Seu progresso não será salvo neste navegador.",
  "storage.future":
    "Há uma versão mais nova do jogo aberta. Recarregue a página para salvar seu progresso.",
  "storage.full": "Não foi possível salvar o progresso: o armazenamento do navegador está cheio.",
} as const;

export type MessageKey = keyof typeof ptBR;
