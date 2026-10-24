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
  /**
   * O volume, de 0 a 1 (P216): vale na hora, também com o som tocando. Antes do unlock, só
   * guarda o valor (regra 9: nada cria o áudio fora do clique).
   */
  setVolume(level: number): void;
  /** O volume atual, de 0 a 1. */
  volume(): number;
}

/** Uma prévia da mistura das Misturadas (M17): de onde ela começa, o ganho e o lado. */
export type MixTrack = {
  readonly url: string;
  readonly offset: number;
  /** Multiplica o ganho da mistura (1 = o da folga ou o igualado). */
  readonly gain?: number;
  /** De −1 (esquerda) a 1 (direita); 0 = no centro. */
  readonly pan?: number;
};

export type MixOptions = {
  /** Iguala a energia das prévias no trecho tocado (core/mix.ts), em vez de só dar a folga. */
  readonly normalize?: boolean;
  /** Segura os picos da soma com um limitador antes do mestre (padrão: sim). */
  readonly limit?: boolean;
};

/** A mistura tocando: o Playback de sempre, e o ganho e o lado de cada prévia, ao vivo. */
export interface MixPlayback extends Playback {
  /** Leva a prévia `index` ao ganho `gain` (relativo ao da mistura) em `rampSeconds`. */
  setGain(index: number, gain: number, rampSeconds?: number): void;
  /** Leva a prévia `index` ao lado `pan`, sem estalo. */
  setPan(index: number, pan: number): void;
}

/**
 * O motor que toca várias prévias juntas (M17): o Web Audio, o composto (que repassa a ele) e o
 * falso dos e2e. É uma capacidade à parte do AudioEngine: o <audio> e os dublês de hoje seguem
 * iguais.
 */
export interface MixEngine {
  /** Toca as prévias juntas, todas no mesmo instante, por `seconds`. Null: outra ação tomou o lugar. */
  playMix(
    tracks: readonly MixTrack[],
    seconds: number,
    options?: MixOptions,
  ): Promise<MixPlayback | null>;
}

export function canMix(engine: AudioEngine): engine is AudioEngine & MixEngine {
  return typeof (engine as Partial<MixEngine>).playMix === "function";
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
  /** O volume da reprodução, de 0 a 1 (o motor falso registra, para o e2e conferir). */
  readonly volume?: number;
};

/** Uma mistura tocada (M17): o motor falso registra, para o e2e achar as respostas. */
export type MixLog = {
  readonly urls: readonly string[];
  readonly offsets: readonly number[];
  readonly pans: readonly number[];
  readonly seconds: number;
  readonly engine: EngineName;
};

export type EngineOptions = {
  /** Só em desenvolvimento (?failAudio=): força falha de áudio nas URLs desta faixa. */
  readonly fails?: (url: string) => boolean;
  /** Avisado ao fim de cada reprodução (em DEV vai para window.__musicleAudioLog). */
  readonly onPlayed?: (log: PlayLog) => void;
  /** Avisado a cada mistura que começa (só o motor falso, em DEV: window.__musicleMixLog). */
  readonly onMixed?: (log: MixLog) => void;
  /** O volume inicial, de 0 a 1 (o salvo no aparelho, storage/volume.ts). */
  readonly volume?: number;
};
