// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, canMix } from "./engine.ts";
import { WebAudioEngine } from "./webaudio.ts";

type FakeGain = {
  readonly gain: { value: number; readonly setTargetAtTime: ReturnType<typeof vi.fn> };
  readonly connect: ReturnType<typeof vi.fn>;
};

/** Um AudioContext de mentira: conta quantos nasceram e guarda os ganhos criados. */
function fakeContexts() {
  const created: FakeContext[] = [];
  class FakeContext {
    readonly state = "running";
    readonly currentTime = 2;
    readonly destination = {};
    readonly gains: FakeGain[] = [];
    constructor() {
      created.push(this);
    }
    createGain(): FakeGain {
      const gain = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
      this.gains.push(gain);
      return gain;
    }
    resume() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  return created;
}

afterEach(() => vi.unstubAllGlobals());

/** Um parâmetro de áudio de mentira: guarda o valor e anota as chamadas. */
function param(value = 1) {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
type MixGain = ReturnType<typeof node> & {
  readonly gain: ReturnType<typeof param>;
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
};
type MixPanner = ReturnType<typeof node> & { readonly pan: ReturnType<typeof param> };
type MixLimiter = ReturnType<typeof node> & { readonly threshold: ReturnType<typeof param> };
type MixSource = ReturnType<typeof node> & {
  buffer: unknown;
  onended: (() => void) | null;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
};

/** O nível da amostra `i` de uma prévia (10 amostras por segundo, 30 s): um número ou uma conta. */
type Level = number | ((i: number) => number);

/**
 * Um AudioContext de mentira para a mistura (M17): guarda as fontes, os ganhos, os lados e os
 * limitadores; o fetch devolve a URL, e a "decodificação" acha a prévia dela, de 30 s, com 10
 * amostras por segundo no nível dado. Sem o `panner` (o Safari antigo), não há StereoPanner.
 */
function mixContexts(samples: Record<string, Level> = {}, panner = true) {
  const ctxs: MixContext[] = [];
  class MixContext {
    readonly state = "running";
    readonly currentTime = 5;
    readonly destination = {};
    readonly gains: MixGain[] = [];
    readonly panners: MixPanner[] = [];
    readonly limiters: MixLimiter[] = [];
    readonly sources: MixSource[] = [];
    readonly createStereoPanner = panner
      ? (): MixPanner => {
          const made = { ...node(), pan: param(0) };
          this.panners.push(made);
          return made;
        }
      : undefined;
    constructor() {
      ctxs.push(this);
    }
    createGain(): MixGain {
      const gain = {
        ...node(),
        gain: param(),
        channelCount: 2,
        channelCountMode: "max",
        channelInterpretation: "speakers",
      };
      this.gains.push(gain);
      return gain;
    }
    createDynamicsCompressor() {
      const made = {
        ...node(),
        threshold: param(0),
        knee: param(0),
        ratio: param(0),
        attack: param(0),
        release: param(0),
      };
      this.limiters.push(made);
      return made;
    }
    createBufferSource(): MixSource {
      const source = { ...node(), buffer: null, onended: null, start: vi.fn(), stop: vi.fn() };
      this.sources.push(source);
      return source;
    }
    resume() {
      return Promise.resolve();
    }
    decodeAudioData(bytes: { url: string }) {
      const level = samples[bytes.url] ?? 0.1;
      const data = Float32Array.from({ length: 300 }, (_, i) =>
        typeof level === "function" ? level(i) : level,
      );
      return Promise.resolve({
        duration: 30,
        sampleRate: 10,
        length: 300,
        numberOfChannels: 1,
        getChannelData: () => data,
      });
    }
  }
  vi.stubGlobal("AudioContext", MixContext);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => Promise.resolve({ ok: true, arrayBuffer: async () => ({ url }) })),
  );
  return ctxs;
}

type MixCtx = ReturnType<typeof mixContexts>[number];

/** As peças de cada voz, pelas ligações: o lado, o ganho que liga nele e o envelope do ganho. */
function voicesOf(ctx: MixCtx) {
  return ctx.panners.map((panner, i) => {
    const gain = ctx.gains.find((g) => g.connect.mock.calls[0]?.[0] === panner);
    const envelope = ctx.gains.find((g) => g.connect.mock.calls[0]?.[0] === gain);
    return { panner, gain, envelope, source: ctx.sources[i] };
  });
}

describe("WebAudioEngine: a mistura das Misturadas (M17)", () => {
  const tracks = [
    { url: "a.m4a", offset: 0 },
    { url: "b.m4a", offset: 6, pan: -0.8 },
  ];

  it("cada prévia: fonte → envelope → ganho em mono → lado → soma → limitador → mestre, no mesmo t0", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    const mix = await engine.playMix(tracks, 8);
    const ctx = ctxs[0];
    if (!ctx || !mix) throw new Error("a mistura não tocou");
    const master = ctx.gains[0];
    const limiter = ctx.limiters[0];
    const bus = ctx.gains.find((g) => g.connect.mock.calls[0]?.[0] === limiter);
    expect(limiter?.connect).toHaveBeenCalledWith(master);
    expect(limiter?.threshold.value).toBe(-3);
    for (const voice of voicesOf(ctx)) {
      expect(voice.source?.connect).toHaveBeenCalledWith(voice.envelope);
      expect(voice.panner.connect).toHaveBeenCalledWith(bus);
      // Mono antes do lado: o "Separar" muda o lugar, e não o volume.
      expect(voice.gain).toMatchObject({ channelCount: 1, channelCountMode: "explicit" });
      expect(voice.gain?.gain.value).toBeCloseTo(1 / Math.SQRT2); // a folga da soma de duas
    }
    expect(ctx.sources[0]?.start).toHaveBeenCalledWith(mix.t0, 0, 8);
    expect(ctx.sources[1]?.start).toHaveBeenCalledWith(mix.t0, 6, 8);
    expect(ctx.panners[1]?.pan.value).toBe(-0.8);
    expect(mix.seconds).toBe(8);
  });

  it("sem o limitador, a soma vai direto ao mestre", async () => {
    const ctxs = mixContexts();
    await new WebAudioEngine().playMix(tracks, 8, { limit: false });
    const ctx = ctxs[0];
    expect(ctx?.limiters).toHaveLength(0);
    const bus = ctx?.gains.find((g) => g.connect.mock.calls[0]?.[0] === ctx.gains[0]);
    expect(bus).toBeDefined();
  });

  it("igualar o volume mede o trecho que toca, e não a prévia inteira", async () => {
    // A b é quieta nos 10 s do começo e 0,1 depois; o trecho dela começa em 12 s.
    const ctxs = mixContexts({ "a.m4a": 0.4, "b.m4a": (i) => (i < 100 ? 0.01 : 0.1) });
    const engine = new WebAudioEngine();
    const stretch = [
      { url: "a.m4a", offset: 0 },
      { url: "b.m4a", offset: 12 },
    ];
    await engine.playMix(stretch, 8, { normalize: true });
    const ctx = ctxs[0];
    const levels = ctx ? voicesOf(ctx).map((v) => v.gain?.gain.value ?? 0) : [];
    // As duas chegam à média geométrica do trecho (0,2), com a folga de 1/√2.
    expect((levels[0] ?? 0) * 0.4).toBeCloseTo((levels[1] ?? 0) * 0.1);
    expect((levels[0] ?? 0) * 0.4).toBeCloseTo(0.2 / Math.SQRT2);
  });

  it("o setGain leva só a prévia pedida ao ganho novo, relativo ao da mistura", async () => {
    const ctxs = mixContexts();
    const mix = await new WebAudioEngine().playMix(tracks, 8);
    mix?.setGain(1, 0.25, 0.3);
    const ctx = ctxs[0];
    const [first, second] = ctx ? voicesOf(ctx) : [];
    expect(second?.gain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(0.25 / Math.SQRT2, 9),
      expect.closeTo(5.3, 9),
    );
    expect(first?.gain?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    mix?.setPan(0, 0.8);
    expect(first?.panner.pan.setTargetAtTime).toHaveBeenCalledWith(0.8, 5, expect.any(Number));
  });

  it("o fim natural espera todas as prévias, solta os nós e não muda mais nada", async () => {
    const ctxs = mixContexts();
    const mix = await new WebAudioEngine().playMix(tracks, 8);
    const ctx = ctxs[0];
    if (!ctx || !mix) throw new Error("a mistura não tocou");
    let finished = false;
    void mix.done.then(() => {
      finished = true;
    });
    ctx.sources[0]?.onended?.();
    await Promise.resolve();
    expect(finished).toBe(false); // uma prévia acabou, a outra ainda toca
    ctx.sources[1]?.onended?.();
    await expect(mix.done).resolves.toMatchObject({ interrupted: false });
    for (const voice of voicesOf(ctx)) {
      for (const part of [voice.source, voice.envelope, voice.gain, voice.panner]) {
        expect(part?.disconnect).toHaveBeenCalled();
      }
    }
    expect(ctx.limiters[0]?.disconnect).toHaveBeenCalled();
    mix.setGain(0, 0);
    expect(voicesOf(ctx)[0]?.gain?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("o stop corta todas as prévias, e o fim da mistura diz que foi interrompida", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    const mix = await engine.playMix(tracks, 8);
    engine.stop();
    for (const source of ctxs[0]?.sources ?? []) {
      expect(source.stop).toHaveBeenCalled();
      source.onended?.();
    }
    await expect(mix?.done).resolves.toMatchObject({ interrupted: true });
    mix?.setGain(0, 0); // parada, a mistura não muda mais
    const ctx = ctxs[0];
    expect(ctx && voicesOf(ctx)[0]?.gain?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("um começo negativo ou que não é número vira 0, em vez de o start lançar erro no meio", async () => {
    const ctxs = mixContexts();
    const mix = await new WebAudioEngine().playMix(
      [
        { url: "a.m4a", offset: -3 },
        { url: "b.m4a", offset: Number.NaN },
      ],
      8,
    );
    for (const source of ctxs[0]?.sources ?? []) {
      expect(source.start).toHaveBeenCalledWith(mix?.t0, 0, 8);
    }
  });

  it("sem StereoPanner (o Safari antigo), a mistura falha como áudio indisponível, sem tocar nada", async () => {
    const ctxs = mixContexts({}, false);
    await expect(new WebAudioEngine().playMix(tracks, 8)).rejects.toMatchObject({
      kind: "decode",
    });
    expect(ctxs[0]?.sources).toHaveLength(0);
  });

  it("a mistura e a prévia sozinha se interrompem; um stop no meio da carga devolve null", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    await engine.play("c.m4a", 0, 4);
    await engine.playMix(tracks, 8);
    const ctx = ctxs[0];
    expect(ctx?.sources[0]?.stop).toHaveBeenCalled(); // a sozinha, cortada pela mistura
    await engine.play("c.m4a", 0, 4);
    expect(ctx?.sources[1]?.stop).toHaveBeenCalled(); // e a mistura, pela sozinha
    expect(ctx?.sources[2]?.stop).toHaveBeenCalled();
    const pending = engine.playMix(tracks, 8);
    engine.stop();
    await expect(pending).resolves.toBeNull();
  });

  it("o canMix diz quem sabe misturar", () => {
    const plain: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      retain: vi.fn(),
      setVolume: vi.fn(),
      volume: () => 1,
    };
    expect(canMix(new WebAudioEngine())).toBe(true);
    expect(canMix(plain)).toBe(false);
  });
});

describe("WebAudioEngine: o volume (P216, P219)", () => {
  it("antes do unlock só guarda o valor (regra 9: nenhum AudioContext); no unlock, o ganho mestre nasce com a curva", () => {
    const created = fakeContexts();
    const engine = new WebAudioEngine({ volume: 0.8 });
    engine.setVolume(0.2);
    expect(created).toHaveLength(0);
    expect(engine.volume()).toBe(0.2);
    engine.unlock();
    const ctx = created[0];
    const master = ctx?.gains[0];
    if (!ctx || !master) throw new Error("o unlock não criou o contexto e o ganho mestre");
    expect(created).toHaveLength(1);
    expect(master.gain.value).toBeCloseTo(0.04); // o quadrado do nível
    expect(master.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("depois do unlock, a troca desliza até o ganho novo, sem estalo", () => {
    const created = fakeContexts();
    const engine = new WebAudioEngine();
    engine.unlock();
    engine.setVolume(0.5);
    const master = created[0]?.gains[0];
    expect(master?.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, 2, expect.any(Number));
    expect(engine.volume()).toBe(0.5);
  });
});
