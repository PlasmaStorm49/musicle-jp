// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioUnavailableError, type PlayLog } from "./engine.ts";
import { HtmlAudioEngine, type MediaElement } from "./htmlaudio.ts";

const URL_A = "https://audio-ssl.itunes.apple.com/a.m4a";

/** O <audio> de mentira tem tudo gravável: o teste muda error, duration e ended. */
type FakeElement = { -readonly [K in keyof MediaElement]: MediaElement[K] } & { paused: boolean };

/** Um <audio> de mentira: o teste avança o currentTime e decide como o play() termina. */
function fakeElement() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;
  const element: FakeElement = {
    src: "",
    currentTime: 0,
    duration: 30,
    ended: false,
    error: null,
    preload: "",
    volume: 1,
    paused: true,
    play: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    ),
    pause: vi.fn(() => {
      element.paused = true;
      settle?.reject(new DOMException("pausado", "AbortError"));
    }),
  };
  const started = () => {
    element.paused = false;
    settle?.resolve();
  };
  const refuse = (error: Error) => settle?.reject(error);
  return { element, started, refuse };
}

function setup(options: { fails?: (url: string) => boolean } = {}) {
  const fake = fakeElement();
  const logs: PlayLog[] = [];
  const engine = new HtmlAudioEngine({
    ...options,
    createElement: () => fake.element,
    onPlayed: (log) => logs.push(log),
  });
  return { ...fake, engine, logs };
}

describe("HtmlAudioEngine (a reserva com <audio>)", () => {
  // O corte é um laço de setTimeout (o rAF para quando a página não pinta): relógio falso.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chama o play() na hora, ainda dentro do clique, a partir do offset", () => {
    const { element, engine } = setup();
    void engine.play(URL_A, 12, 2);
    expect(element.play).toHaveBeenCalledOnce(); // nenhum await antes
    expect(element.src).toBe(URL_A);
    expect(element.currentTime).toBe(12);
  });

  it("corta quando o currentTime passa do trecho e registra o motor html", async () => {
    const { element, engine, started, logs } = setup();
    const playing = engine.play(URL_A, 10, 2);
    started();
    const playback = await playing;
    vi.mocked(element.pause).mockClear(); // o play() já para o que tocava antes de começar
    expect(playback?.seconds).toBe(2);
    element.currentTime = 11;
    expect(playback?.elapsed()).toBe(1);
    await vi.advanceTimersByTimeAsync(1900);
    expect(element.pause).not.toHaveBeenCalled(); // o laço acordou, mas o trecho não acabou
    element.currentTime = 12.004;
    await vi.advanceTimersByTimeAsync(100);
    await expect(playback?.done).resolves.toMatchObject({ requested: 2, interrupted: false });
    expect(element.pause).toHaveBeenCalled();
    expect(logs[0]).toMatchObject({ url: URL_A, offset: 10, engine: "html" });
  });

  it("teclas de mídia e tela de bloqueio não tocam além do corte; pausar é o Parar", async () => {
    const handlers = new Map<string, (() => void) | null>();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        setActionHandler: (action: string, handler: (() => void) | null) => {
          if (action === "previoustrack") throw new TypeError("ação desconhecida"); // segue
          handlers.set(action, handler);
        },
      },
    });
    try {
      const { element, engine, started } = setup();
      const playing = engine.play(URL_A, 0, 4);
      started();
      const playback = await playing;
      vi.mocked(element.play).mockClear();
      handlers.get("play")?.();
      handlers.get("seekto")?.();
      expect(element.play).not.toHaveBeenCalled(); // o tratador próprio troca a ação padrão
      handlers.get("pause")?.();
      await expect(playback?.done).resolves.toMatchObject({ interrupted: true });
      expect(handlers.has("nexttrack")).toBe(true);
    } finally {
      Reflect.deleteProperty(navigator, "mediaSession");
    }
  });

  it("refaz o seek quando o navegador ignorou o início pedido (Safari)", async () => {
    const { element, engine, started } = setup();
    const playing = engine.play(URL_A, 12, 2);
    element.currentTime = 0; // o pedido de 12 s foi ignorado antes dos metadados
    started();
    await playing;
    expect(element.currentTime).toBe(12);
  });

  it("aba oculta para o som", async () => {
    const { engine, started } = setup();
    const playing = engine.play(URL_A, 0, 7);
    started();
    const playback = await playing;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      await expect(playback?.done).resolves.toMatchObject({ interrupted: true });
    } finally {
      Reflect.deleteProperty(document, "hidden");
    }
  });

  it("o pedido para no fim da prévia", async () => {
    const { engine, started } = setup();
    const playing = engine.play(URL_A, 25, 16);
    started();
    expect((await playing)?.seconds).toBe(5);
  });

  it("Parar encerra como interrompido", async () => {
    const { element, engine, started } = setup();
    const playing = engine.play(URL_A, 0, 4);
    started();
    const playback = await playing;
    element.currentTime = 1.5;
    engine.stop();
    await expect(playback?.done).resolves.toMatchObject({ played: 1.5, interrupted: true });
  });

  it("Parar antes de o play() começar devolve null, sem erro", async () => {
    const { engine } = setup();
    const playing = engine.play(URL_A, 0, 1);
    engine.stop(); // o pause() faz o play() rejeitar com AbortError
    await expect(playing).resolves.toBeNull();
  });

  it.each([
    ["NotAllowedError", null, "blocked"],
    ["NotSupportedError", 4, "decode"],
    ["NotSupportedError", 3, "decode"],
    ["NotSupportedError", 2, "network"],
  ] as const)("play() recusado com %s (código %s) vira falha %s", async (name, code, kind) => {
    const { element, engine, refuse } = setup();
    const playing = engine.play(URL_A, 0, 1);
    if (code !== null) element.error = { code } as MediaError;
    refuse(new DOMException("recusado", name));
    await expect(playing).rejects.toMatchObject({ kind });
    await expect(playing).rejects.toBeInstanceOf(AudioUnavailableError);
  });

  it("?failAudio= simula a falha sem tocar", async () => {
    const { element, engine } = setup({ fails: (url) => url === URL_A });
    await expect(engine.play(URL_A, 0, 1)).rejects.toMatchObject({ kind: "simulated" });
    expect(element.play).not.toHaveBeenCalled();
  });

  it("erro no meio da reprodução encerra (a tela não fica tocando para sempre)", async () => {
    const { element, engine, started } = setup();
    const playing = engine.play(URL_A, 0, 7);
    started();
    const playback = await playing;
    element.error = { code: 2 } as MediaError;
    await vi.advanceTimersByTimeAsync(7000);
    await expect(playback?.done).resolves.toMatchObject({ interrupted: false });
  });
});
