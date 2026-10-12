// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AudioEngine, AudioUnavailableError, type PlaybackResult } from "../audio/engine.ts";
import { MAX_STAGE, MODE_RULES, type ModeRules } from "../core/rules.ts";
import { Player } from "./Player.tsx";

afterEach(cleanup);

// Nós que um teste põe no body (a nav, o <main>): saem mesmo quando uma asserção falha antes.
const attached: HTMLElement[] = [];
const attach = <T extends HTMLElement>(el: T): T => {
  document.body.append(el);
  attached.push(el);
  return el;
};
afterEach(() => {
  for (const el of attached.splice(0)) el.remove();
});

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
  it("Desafio: Pular libera a etapa sem tocar nada (P46); sem Ouvir mais", () => {
    const { engine, onSkip } = setup(MODE_RULES.song, true);
    expect(screen.queryByRole("button", { name: /Ouvir mais/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pular (+1 s)" }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it("a barra e os botões seguem as etapas do modo (1, 4 e 9 s no Superfan, ME61)", () => {
    const superfan: ModeRules = { ...MODE_RULES.song, stages: [1, 4, 9], maxAttempts: 3 };
    setup(superfan, true);
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pular (+3 s)" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe("9");
    expect(document.querySelectorAll(".bar-segments .seg")).toHaveLength(3);
  });

  it("Desafio na última tentativa: sem Pular", () => {
    setup(MODE_RULES.song, false);
    expect(screen.queryByRole("button", { name: /Pular/ })).toBeNull();
  });

  it("Normal: o Ouvir mais diz só os segundos; o custo fica na dica da home (ME59)", () => {
    setup(MODE_RULES.album, false);
    expect(screen.getByRole("button", { name: "Ouvir mais (+1 s)" })).toBeTruthy();
  });

  it("Normal: Ouvir mais libera e já toca o trecho maior (P33); sem Pular", () => {
    const { engine, onListenMore } = setup(MODE_RULES.album, false);
    expect(screen.queryByRole("button", { name: /Pular/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ouvir mais/ }));
    expect(onListenMore).toHaveBeenCalledOnce();
    expect(engine.play).toHaveBeenCalledWith("fixtures/audio/x.wav", 0, 2);
  });

  it("entrando pela nav (o foco no link, fora do jogo), o foco vai ao Tocar (ME49)", () => {
    // O link da aba continua na tela depois do Enter nele: sem isto, o foco ficava na nav.
    const nav = attach(document.createElement("a"));
    nav.href = "#desafio";
    nav.textContent = "Desafio";
    nav.focus();
    expect(document.activeElement).toBe(nav);
    const main = attach(document.createElement("main"));
    render(
      <Player
        engine={{
          unlock: vi.fn(),
          preload: vi.fn(),
          play: vi.fn(),
          stop: vi.fn(),
          retain: vi.fn(),
        }}
        url="fixtures/audio/x.wav"
        offset={0}
        stage={0}
        explicit={false}
        rules={MODE_RULES.song}
        skippable={true}
        onListenMore={vi.fn()}
        onSkip={vi.fn()}
        onAudioError={vi.fn()}
      />,
      { container: main },
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tocar 1 s" }));
  });

  it("ao montar, o foco que já está no jogo (o campo, uma opção) fica onde está", () => {
    const main = attach(document.createElement("main"));
    const field = document.createElement("input");
    main.append(field);
    field.focus();
    const host = document.createElement("div");
    main.append(host);
    render(
      <Player
        engine={{
          unlock: vi.fn(),
          preload: vi.fn(),
          play: vi.fn(),
          stop: vi.fn(),
          retain: vi.fn(),
        }}
        url="fixtures/audio/x.wav"
        offset={0}
        stage={0}
        explicit={false}
        rules={MODE_RULES.song}
        skippable={true}
        onListenMore={vi.fn()}
        onSkip={vi.fn()}
        onAudioError={vi.fn()}
      />,
      { container: host },
    );
    expect(document.activeElement).toBe(field);
  });

  it("o foco começa no Tocar (rodada nova) e volta para ele depois de um pulo", () => {
    const { onSkip } = setup(MODE_RULES.song, true);
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
        rules={MODE_RULES.album}
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
        rules={MODE_RULES.album}
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
    // Dentro do <main>, como no App: o campo é do jogo, e o foco nele fica (ME49).
    const player = (url: string | null) => (
      <main>
        <Player
          engine={engine}
          url={url}
          offset={0}
          stage={0}
          explicit={false}
          rules={MODE_RULES.song}
          skippable={true}
          onListenMore={vi.fn()}
          onSkip={vi.fn()}
          onAudioError={vi.fn()}
        />
        <input aria-label="palpite" />
      </main>
    );
    const { rerender } = render(player(null));
    const field = screen.getByRole("textbox", { name: "palpite" });
    field.focus(); // o jogador começou a digitar enquanto o lookup respondia
    rerender(player("https://audio-ssl.itunes.apple.com/x.m4a"));
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
    expect(document.activeElement).toBe(field);
  });

  it("a prévia que chega depois não puxa de volta quem foi para outro link da nav", () => {
    const entry = attach(document.createElement("a"));
    entry.href = "#normal";
    entry.textContent = "Normal";
    entry.focus(); // entrou pelo link da aba
    const other = attach(document.createElement("a"));
    other.href = "#treino";
    other.textContent = "Treino";
    const main = attach(document.createElement("main"));
    const player = (url: string | null) => (
      <Player
        engine={{
          unlock: vi.fn(),
          preload: vi.fn(),
          play: vi.fn(),
          stop: vi.fn(),
          retain: vi.fn(),
        }}
        url={url}
        offset={0}
        stage={0}
        explicit={false}
        rules={MODE_RULES.song}
        skippable={true}
        onListenMore={vi.fn()}
        onSkip={vi.fn()}
        onAudioError={vi.fn()}
      />
    );
    const { rerender } = render(player(null), { container: main });
    other.focus(); // seguiu pela nav enquanto o lookup respondia
    rerender(player("https://audio-ssl.itunes.apple.com/x.m4a"));
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
    expect(document.activeElement).toBe(other);
  });

  it("toque duplo não gasta duas tentativas", () => {
    const { onSkip } = setup(MODE_RULES.song, true);
    fireEvent.click(screen.getByRole("button", { name: "Pular (+1 s)" }), { detail: 2 });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("o 2º clique de um toque duplo que cai no Tocar é ignorado (tocaria de novo)", () => {
    // É o que cai aqui num toque duplo no Parar ou no cartão de modo do Treino.
    const { engine } = setup(MODE_RULES.song, true);
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }), { detail: 2 });
    expect(engine.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }));
    expect(engine.play).toHaveBeenCalledOnce();
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
      rules={MODE_RULES.album}
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

  it("toque duplo no Tocar: o 2º clique cai no Parar e é ignorado (o som continua)", async () => {
    const { engine } = webAudioLike();
    render(<Controlled engine={engine} start={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar 1 s" }), { detail: 1 });
    await act(async () => {}); // o som começou antes do 2º clique
    fireEvent.click(screen.getByRole("button", { name: "Parar" }), { detail: 2 });
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Parar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Parar" })); // um clique de verdade para
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Tocar 1 s" })).toBeTruthy();
  });

  it("motor parado antes de o som começar: volta ao Tocar, e não fica em Carregando…", async () => {
    setup(MODE_RULES.song, true); // play devolve null, como depois de um palpite na digitação
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
