// Contrato do motor de áudio. A tela conversa só com isto; a implementação (Web Audio hoje,
// <audio> como reserva no M11, um falso nos testes de ponta a ponta no M9) pode mudar.

export type PlaybackResult = {
  /** Segundos pedidos (já limitados ao fim do preview). */
  readonly requested: number;
  /** Segundos medidos pelo relógio do áudio entre o início e o fim. */
  readonly played: number;
  /** Parou antes do fim (Parar, troca de rodada, aba oculta). */
  readonly interrupted: boolean;
};

export interface Playback {
  readonly t0: number;
  readonly seconds: number;
  /** Segundos já tocados, entre 0 e `seconds`: a barra lê isto a cada quadro. */
  elapsed(): number;
  readonly done: Promise<PlaybackResult>;
}

export interface AudioEngine {
  /** Cria ou retoma o áudio. Chame DENTRO do clique, antes de qualquer await. */
  unlock(): void;
  /** Baixa (e, se já destravado, decodifica) para tocar sem espera depois. */
  preload(url: string): void;
  /** Toca `seconds` a partir de `offset`. Devolve null se outra ação a substituiu no caminho. */
  play(url: string, offset: number, seconds: number): Promise<Playback | null>;
  /** Para a reprodução atual (com rampa) e cancela uma que ainda esteja carregando. */
  stop(): void;
  /** Mantém em memória só estes áudios; o resto é liberado. */
  retain(urls: readonly string[]): void;
}

/** O áudio não pôde ser baixado ou decodificado: a rodada é anulada sem penalidade. */
export class AudioUnavailableError extends Error {}
