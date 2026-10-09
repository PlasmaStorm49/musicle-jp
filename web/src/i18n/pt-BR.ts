// Todos os textos da tela ficam aqui (regra inviolável 2). Parâmetros entre chaves: {nome}.
export const ptBR = {
  "app.title": "musicle-jp",
  "app.tagline": "Adivinhe a música japonesa do dia",
  "app.underConstruction": "Em construção: a primeira tela jogável chega no marco {milestone}.",
} as const;

export type MessageKey = keyof typeof ptBR;
