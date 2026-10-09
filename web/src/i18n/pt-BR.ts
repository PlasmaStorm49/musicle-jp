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

  "game.header": "Diário Música · nº {number}",
  "game.round": "Rodada {current} de {total}",
  "game.question": "Qual é a música?",

  "player.play": "Tocar {seconds} s",
  "player.stop": "Parar",
  "player.loading": "Carregando…",
  "player.listenMore": "Ouvir mais (+{seconds} s, −1 ponto)",
  "player.explicit": "Conteúdo explícito",
  "player.bar": "{unlocked} de {total} segundos liberados",

  "options.giveUp": "Não sei",

  "reveal.won": "Acertou! {points} de 6 pontos.",
  "reveal.lost": "Não foi dessa vez.",
  "reveal.correct": "Certa",
  "reveal.yourPick": "Sua escolha",
  "reveal.album": "Álbum: {album}",
  "reveal.listenFull": "Ouvir a prévia inteira",
  "reveal.next": "Próxima rodada",
  "reveal.finish": "Ver resultado",

  "void.message": "Áudio indisponível: esta rodada foi anulada e não conta.",

  "summary.title": "Resultado do dia",
  "summary.score": "{score} de {max} pontos",
  "summary.round": "Rodada {number}: {result}",
  "summary.won": "acertou, {points} pontos",
  "summary.lost": "não acertou",
  "summary.void": "anulada",
  "summary.comeBack": "Volte amanhã para o próximo desafio.",
} as const;

export type MessageKey = keyof typeof ptBR;
