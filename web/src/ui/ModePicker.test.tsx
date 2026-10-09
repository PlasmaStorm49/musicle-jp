// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModePicker } from "./ModePicker.tsx";

afterEach(cleanup);

const button = (name: RegExp) => screen.getByRole("button", { name });

describe("ModePicker (P13, P45)", () => {
  it("sem modo anterior: foco no 4 opções, nada marcado como último usado", () => {
    render(<ModePicker preferred={undefined} onChoose={vi.fn()} />);
    expect(document.activeElement).toBe(button(/^4 opções/));
    expect(screen.queryByText("último usado")).toBeNull();
  });

  it("o último modo usado vem marcado e com o foco; a dica do dia é lida no botão", () => {
    render(<ModePicker preferred="typing" onChoose={vi.fn()} />);
    const typing = button(/^Digitação/);
    expect(document.activeElement).toBe(typing);
    expect(typing.textContent).toContain("último usado");
    expect(typing.textContent).toContain("Até 6 tentativas");
    expect(typing.getAttribute("aria-describedby")).toBe("mode-locked");
  });

  it("clicar escolhe o modo", () => {
    const onChoose = vi.fn();
    render(<ModePicker preferred="typing" onChoose={onChoose} />);
    fireEvent.click(button(/^4 opções/));
    expect(onChoose).toHaveBeenCalledWith("choice");
  });
});
