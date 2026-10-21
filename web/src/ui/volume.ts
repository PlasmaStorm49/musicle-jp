// O volume na tela (P216): o motor guarda o valor (é a fonte da verdade nesta aba, também com o
// armazenamento bloqueado), e o aparelho guarda a escolha para a próxima visita.
import { useEffect, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { clampVolume, DEFAULT_VOLUME } from "../core/volume.ts";
import { readVolume, writeVolume } from "../storage/volume.ts";
import { browserStore } from "./browserStore.ts";

/** O volume salvo no aparelho, para o motor nascer com ele. */
export function savedVolume(): number {
  const store = browserStore();
  return store ? readVolume(store) : DEFAULT_VOLUME;
}

export type VolumeState = {
  readonly level: number;
  /** Vale na hora, também com o som tocando (a cada passo do arraste). */
  readonly apply: (level: number) => void;
  /** Grava o volume do motor no aparelho: no fim do arraste, e não a cada passo. */
  readonly save: () => void;
};

/** O volume do motor, a troca e a gravação. */
export function useVolume(engine: AudioEngine): VolumeState {
  const [level, setLevel] = useState(() => engine.volume());
  // Um motor novo (outra carga) traz o seu volume: a tela acompanha.
  useEffect(() => setLevel(engine.volume()), [engine]);
  const apply = (next: number) => {
    const v = clampVolume(next);
    setLevel(v);
    engine.setVolume(v);
  };
  const save = () => {
    const store = browserStore();
    if (store) writeVolume(store, engine.volume());
  };
  return { level, apply, save };
}
