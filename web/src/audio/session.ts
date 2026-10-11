// Sessão de áudio do navegador (Safari 17 e iOS): "playback" toca mesmo com o iPhone no
// silencioso, como um app de música, e pausa a música de fundo de quem estiver ouvindo (P75).
// Nos outros navegadores a API não existe e nada muda.

type WithAudioSession = Navigator & { audioSession?: { type: string } };

/** Chame no destravamento do motor, dentro do clique. */
export function enablePlaybackSession(): void {
  const session = (navigator as WithAudioSession).audioSession;
  if (session) session.type = "playback";
}
