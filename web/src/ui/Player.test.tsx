// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "../audio/engine.ts";
import { MODE_RULES, type ModeRules } from "../core/rules.ts";
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

  it("toque duplo não gasta duas tentativas", () => {
    const { onSkip } = setup(MODE_RULES.typing, true);
    fireEvent.click(screen.getByRole("button", { name: "Pular (+1 s)" }), { detail: 2 });
    expect(onSkip).not.toHaveBeenCalled();
  });
});
