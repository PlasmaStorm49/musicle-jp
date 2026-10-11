// Contrato do motor de áudio. A tela conversa só com isto; a implementação pode mudar: Web
// Audio (webaudio.ts), <audio> de reserva (htmlaudio.ts), os dois juntos (fallback.ts, P70) e um
// falso nos testes de ponta a ponta (fake.ts).

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

/**
 * Por que o áudio falhou. O motor composto (fallback.ts) decide a reserva por isto:
 * - network: rede ou CORS (o fetch do Web Audio exige CORS; o <audio> não);
 * - http: o servidor respondeu com erro (404, 403);
 * - decode: o navegador não decodifica o arquivo (AAC no Firefox de alguns sistemas);
 * - blocked: o navegador barrou o som fora do gesto (o próximo clique toca);
 * - simulated: ?failAudio=, só em desenvolvimento.
 */
export type AudioFailure = "network" | "http" | "decode" | "blocked" | "simulated";

/** O áudio não pôde ser baixado, decodificado ou tocado: a rodada é anulada sem penalidade. */
export class AudioUnavailableError extends Error {
  readonly kind: AudioFailure;

  constructor(kind: AudioFailure, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Qual motor tocou (vai para o __musicleAudioLog, em desenvolvimento). */
export type EngineName = "webaudio" | "html" | "fake";

export type PlayLog = PlaybackResult & {
  readonly url: string;
  readonly offset: number;
  readonly engine: EngineName;
};

export type EngineOptions = {
  /** Só em desenvolvimento (?failAudio=): força falha de áudio nas URLs desta faixa. */
  readonly fails?: (url: string) => boolean;
  /** Avisado ao fim de cada reprodução (em DEV vai para window.__musicleAudioLog). */
  readonly onPlayed?: (log: PlayLog) => void;
};
