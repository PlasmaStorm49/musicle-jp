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
