// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
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
type MixGain = ReturnType<typeof node> & { readonly gain: ReturnType<typeof param> };
type MixPanner = ReturnType<typeof node> & { readonly pan: ReturnType<typeof param> };
type MixSource = ReturnType<typeof node> & {
  buffer: unknown;
  onended: (() => void) | null;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
};

/**
 * Um AudioContext de mentira para a mistura (M17): guarda as fontes, os ganhos e os lados; o
 * fetch devolve a URL, e a "decodificação" acha a prévia dela, de 30 s, com as amostras dadas.
 */
function mixContexts(samples: Record<string, number> = {}) {
  const ctxs: MixContext[] = [];
  class MixContext {
    readonly state = "running";
    readonly currentTime = 5;
    readonly destination = {};
    readonly gains: MixGain[] = [];
    readonly panners: MixPanner[] = [];
    readonly sources: MixSource[] = [];
    constructor() {
      ctxs.push(this);
    }
    createGain(): MixGain {
      const gain = { ...node(), gain: param() };
      this.gains.push(gain);
      return gain;
    }
    createStereoPanner(): MixPanner {
      const panner = { ...node(), pan: param(0) };
      this.panners.push(panner);
      return panner;
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
      return Promise.resolve({
        duration: 30,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(100).fill(level),
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

describe("WebAudioEngine: a mistura das Misturadas (M17)", () => {
  const tracks = [
    { url: "a.m4a", offset: 0 },
    { url: "b.m4a", offset: 6, pan: -0.8 },
  ];

  it("liga cada prévia em fonte → envelope → ganho → lado → mestre, todas no mesmo t0", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    const mix = await engine.playMix(tracks, 8);
    const ctx = ctxs[0];
    if (!ctx || !mix) throw new Error("a mistura não tocou");
    const master = ctx.gains[0];
    expect(ctx.sources).toHaveLength(2);
    for (const [i, source] of ctx.sources.entries()) {
      const panner = ctx.panners[i];
      const gain = panner && ctx.gains.find((g) => g.connect.mock.calls[0]?.[0] === panner);
      const envelope = gain && ctx.gains.find((g) => g.connect.mock.calls[0]?.[0] === gain);
      expect(source.connect).toHaveBeenCalledWith(envelope);
      expect(panner?.connect).toHaveBeenCalledWith(master);
      // A folga da soma: duas prévias, 1/√2 cada.
      expect(gain?.gain.value).toBeCloseTo(1 / Math.SQRT2);
    }
    expect(ctx.sources[0]?.start).toHaveBeenCalledWith(mix.t0, 0, 8);
    expect(ctx.sources[1]?.start).toHaveBeenCalledWith(mix.t0, 6, 8);
    expect(ctx.panners[1]?.pan.value).toBe(-0.8);
    expect(mix.seconds).toBe(8);
  });

  it("igualar o volume dá mais ganho à prévia mais baixa", async () => {
    const ctxs = mixContexts({ "a.m4a": 0.4, "b.m4a": 0.1 });
    const engine = new WebAudioEngine();
    await engine.playMix(tracks, 8, { normalize: true });
    const ctx = ctxs[0];
    const levels = ctx?.panners.map(
      (p) => ctx.gains.find((g) => g.connect.mock.calls[0]?.[0] === p)?.gain.value ?? 0,
    );
    // As duas chegam à média geométrica (0,2), com a folga de 1/√2.
    expect((levels?.[0] ?? 0) * 0.4).toBeCloseTo((levels?.[1] ?? 0) * 0.1);
    expect((levels?.[0] ?? 0) * 0.4).toBeCloseTo(0.2 / Math.SQRT2);
  });

  it("o setGain leva só a prévia pedida ao ganho novo, relativo ao da mistura", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    const mix = await engine.playMix(tracks, 8);
    mix?.setGain(1, 0.25, 0.3);
    const ctx = ctxs[0];
    const second = ctx?.gains.find((g) => g.connect.mock.calls[0]?.[0] === ctx.panners[1]);
    const first = ctx?.gains.find((g) => g.connect.mock.calls[0]?.[0] === ctx.panners[0]);
    expect(second?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(0.25 / Math.SQRT2, 9),
      expect.closeTo(5.3, 9),
    );
    expect(first?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    mix?.setPan(0, 0.8);
    expect(ctx?.panners[0]?.pan.setTargetAtTime).toHaveBeenCalledWith(0.8, 5, expect.any(Number));
  });

  it("o stop corta todas as prévias, e o fim da mistura diz que foi interrompida", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    const mix = await engine.playMix(tracks, 8);
    engine.stop();
    const sources = ctxs[0]?.sources ?? [];
    for (const source of sources) {
      expect(source.stop).toHaveBeenCalled();
      source.onended?.();
    }
    await expect(mix?.done).resolves.toMatchObject({ interrupted: true });
    // Parada, a mistura não muda mais: o setGain não mexe no ganho da prévia.
    mix?.setGain(0, 0);
    const ctx = ctxs[0];
    const first = ctx?.gains.find((g) => g.connect.mock.calls[0]?.[0] === ctx.panners[0]);
    expect(first?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("tocar uma prévia sozinha interrompe a mistura; um stop no meio da carga devolve null", async () => {
    const ctxs = mixContexts();
    const engine = new WebAudioEngine();
    await engine.playMix(tracks, 8);
    await engine.play("c.m4a", 0, 4);
    const ctx = ctxs[0];
    expect(ctx?.sources[0]?.stop).toHaveBeenCalled();
    expect(ctx?.sources[1]?.stop).toHaveBeenCalled();
    const pending = engine.playMix(tracks, 8);
    engine.stop();
    await expect(pending).resolves.toBeNull();
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
