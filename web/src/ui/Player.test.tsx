// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, AudioUnavailableError, type PlaybackResult } from "../audio/engine.ts";
import { MAX_STAGE, MODE_RULES, type ModeRules } from "../core/rules.ts";
import { Player } from "./Player.tsx";

afterEach(cleanup);

function setup(rules: ModeRules, skippable: boolean) {
  const engine: AudioEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    play: vi.fn(() => Promise.resolve(null)),
    stop: vi.fn(),
    retain: vi.fn(),
  };
  const onSkip = vi.fn();
  const onListenMore = vi.fn();
  render(
    <Player
      engine={engine}
      url="fixtures/audio/x.wav"
      offset={0}
      stage={0}
      explicit={false}
      rules={rules}
      skippable={skippable}
      onListenMore={onListenMore}
      onSkip={onSkip}
      onAudioError={vi.fn()}
    />,
  );
  return { engine, onSkip, onListenMore };
}

describe("Player segue as regras do modo", () => {
  it("digitação: Pular libera a etapa sem tocar nada (P46); sem Ouvir mais", () => {
    const { engine, onSkip } = setup(MODE_RULES.typing, true);
    expect(screen.queryByRole("button", { name: /Ouvir mais/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pular (+1 s)" }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it("digitação na última tentativa: sem Pular", () => {
    setup(MODE_RULES.typing, false);
    expect(screen.queryByRole("button", { name: /Pular/ })).toBeNull();
  });

  it("4 opções: Ouvir mais libera e já toca o trecho maior (P33); sem Pular", () => {
    const { engine, onListenMore } = setup(MODE_RULES.choice, false);
    expect(screen.queryByRole("button", { name: /Pular/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ouvir mais/ }));
    expect(onListenMore).toHaveBeenCalledOnce();
    expect(engine.play).toHaveBeenCalledWith("fixtures/audio/x.wav", 0, 2);
  });

  it("o foco começa no Tocar (rodada nova) e volta para ele depois de um pulo", () => {
    const { onSkip } = setup(MODE_RULES.typing, true);
    const play = screen.getByRole("button", { name: "Tocar 1 s" });
    expect(document.activeElement).toBe(play);
    const skip = screen.getByRole("button", { name: "Pular (+1 s)" });
    skip.focus();
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(play);
  });

  it("falha de áudio que chega depois de o Player sair da tela é ignorada (não anula a próxima)", async () => {
    let fail: (reason: Error) => void = () => {};
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      play: vi.fn(() => new Promise<null>((_, reject) => (fail = reject))),
      stop: vi.fn(),
      retain: vi.fn(),
    };
    const onAudioError = vi.fn();
    const { unmount } = render(
      <Player
        engine={engine}
        url="fixtures/audio/x.wav"
        offset={0}
        stage={0}
        explicit={false}
        rules={MODE_RULES.choice}
        skippable={false}
        onListenMore={vi.fn()}
        onSkip={vi.fn()}
        onAudioError={onAudioError}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }));
    unmount(); // a rodada acabou (ou trocou) enquanto o áudio carregava
    fail(new Error("rede"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onAudioError).not.toHaveBeenCalled();
  });

  it("som barrado pelo navegador: volta ao Tocar sem anular a rodada", async () => {
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      play: vi.fn(() => Promise.reject(new AudioUnavailableError("blocked", "fora do gesto"))),
      stop: vi.fn(),
      retain: vi.fn(),
    };
    const onAudioError = vi.fn();
    render(
      <Player
        engine={engine}
        url="fixtures/audio/x.wav"
        offset={0}
        stage={0}
        explicit={false}
        rules={MODE_RULES.choice}
        skippable={false}
        onListenMore={vi.fn()}
        onSkip={vi.fn()}
        onAudioError={onAudioError}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }));
    const play = await screen.findByRole("button", { name: "Tocar 1 s" });
    await act(async () => {}); // o efeito do foco roda depois da pintura
    expect(onAudioError).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(play);
  });

  it("a prévia que chega depois não tira o foco de quem já foi para o campo", () => {
    const engine: AudioEngine = {
      unlock: vi.fn(),
      preload: vi.fn(),
      play: vi.fn(() => Promise.resolve(null)),
      stop: vi.fn(),
      retain: vi.fn(),
    };
    const player = (url: string | null) => (
      <>
        <Player
          engine={engine}
          url={url}
          offset={0}
          stage={0}
          explicit={false}
          rules={MODE_RULES.typing}
          skippable={true}
          onListenMore={vi.fn()}
          onSkip={vi.fn()}
          onAudioError={vi.fn()}
        />
        <input aria-label="palpite" />
      </>
    );
    const { rerender } = render(player(null));
    const field = screen.getByRole("textbox", { name: "palpite" });
    field.focus(); // o jogador começou a digitar enquanto o lookup respondia
    rerender(player("https://audio-ssl.itunes.apple.com/x.m4a"));
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
    expect(document.activeElement).toBe(field);
  });

  it("toque duplo não gasta duas tentativas", () => {
    const { onSkip } = setup(MODE_RULES.typing, true);
    fireEvent.click(screen.getByRole("button", { name: "Pular (+1 s)" }), { detail: 2 });
    expect(onSkip).not.toHaveBeenCalled();
  });
});

/**
 * Motor como o Web Audio: cada trecho só termina quando o teste manda (`ends[i]()`), e o fim de
 * um trecho interrompido pode chegar depois que o seguinte começou (o onended vem uns 10 ms
 * depois do stop).
 */
function webAudioLike() {
  const ends: Array<() => void> = [];
  const engine: AudioEngine = {
    unlock: vi.fn(),
    preload: vi.fn(),
    stop: vi.fn(),
    retain: vi.fn(),
    play: vi.fn((_url: string, _offset: number, seconds: number) => {
      let end: (result: PlaybackResult) => void = () => {};
      const done = new Promise<PlaybackResult>((resolve) => (end = resolve));
      ends.push(() => end({ requested: seconds, played: seconds, interrupted: false }));
      return Promise.resolve({ t0: 0, seconds, elapsed: () => 0, done });
    }),
  };
  return { engine, ends };
}

/** O Player com a etapa no estado, como no jogo: o "Ouvir mais" a sobe. */
function Controlled({ engine, start }: { readonly engine: AudioEngine; readonly start: number }) {
  const [stage, setStage] = useState(start);
  return (
    <Player
      engine={engine}
      url="fixtures/audio/x.wav"
      offset={0}
      stage={stage}
      explicit={false}
      rules={MODE_RULES.choice}
      skippable={false}
      onListenMore={() => setStage((s) => s + 1)}
      onSkip={vi.fn()}
      onAudioError={vi.fn()}
    />
  );
}

describe("Player com o som tocando", () => {
  it("o fim do trecho antigo não devolve o Tocar com o trecho do Ouvir mais tocando", async () => {
    const { engine, ends } = webAudioLike();
    render(<Controlled engine={engine} start={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Ouvir mais/ }));
    await act(async () => {});
    expect(engine.play).toHaveBeenCalledTimes(2);
    await act(async () => ends[0]?.()); // o fim do 1º trecho chega com o 2º tocando
    expect(screen.getByRole("button", { name: "Parar" })).toBeTruthy();
    await act(async () => ends[1]?.());
    expect(screen.getByRole("button", { name: "Tocar 2 s" })).toBeTruthy();
  });

  it("motor parado antes de o som começar: volta ao Tocar, e não fica em Carregando…", async () => {
    setup(MODE_RULES.typing, true); // play devolve null, como depois de um palpite na digitação
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }));
    await act(async () => {});
    const play = screen.getByRole("button", { name: "Tocar 1 s" });
    expect(play.hasAttribute("disabled")).toBe(false);
  });

  it("Ouvir mais de uma etapa do meio: o foco fica nele, para o Enter seguinte ouvir mais", async () => {
    const { engine } = webAudioLike();
    render(<Controlled engine={engine} start={0} />);
    const more = screen.getByRole("button", { name: /Ouvir mais/ });
    more.focus();
    fireEvent.click(more);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Parar" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Ouvir mais/ }));
  });

  it("o último Ouvir mais some, e o foco vai para o Parar (não cai no body)", async () => {
    const { engine } = webAudioLike();
    render(<Controlled engine={engine} start={MAX_STAGE - 1} />);
    const more = screen.getByRole("button", { name: /Ouvir mais/ });
    more.focus();
    fireEvent.click(more);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Ouvir mais/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Parar" }));
  });
});
