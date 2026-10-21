// O volume na tela (P216): o motor guarda o valor (é a fonte da verdade nesta aba, também com o
// armazenamento bloqueado), e o aparelho guarda a escolha para a próxima visita.
import { useCallback, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { clampVolume, DEFAULT_VOLUME } from "../core/volume.ts";
import { readVolume, writeVolume } from "../storage/volume.ts";
import { browserStore } from "./theme.ts";

/** O volume salvo no aparelho, para o motor nascer com ele. */
export function savedVolume(): number {
  const store = browserStore();
  return store ? readVolume(store) : DEFAULT_VOLUME;
}

/** O volume do motor e a troca: vale na hora (também com o som tocando) e fica gravada. */
export function useVolume(engine: AudioEngine): readonly [number, (level: number) => void] {
  const [level, setLevel] = useState(() => engine.volume());
  const change = useCallback(
    (next: number) => {
      const v = clampVolume(next);
      setLevel(v);
      engine.setVolume(v);
      const store = browserStore();
      if (store) writeVolume(store, v);
    },
    [engine],
  );
  return [level, change];
}
