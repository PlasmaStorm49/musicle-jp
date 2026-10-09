import { useEffect, useRef } from "preact/hooks";
import { MODE_RULES } from "../core/rules.ts";
import type { AnswerMode } from "../core/types.ts";
import { t } from "../i18n/t.ts";

type Props = {
  /** O último modo usado (P45): vem marcado e com o foco. */
  readonly preferred: AnswerMode | undefined;
  readonly onChoose: (mode: AnswerMode) => void;
};

const MODES = [
  { mode: "choice", name: "mode.choiceName", hint: "mode.choiceHint" },
  { mode: "typing", name: "mode.typingName", hint: "mode.typingHint" },
] as const;

/** Antes da rodada 1: o tipo de resposta do dia, que fica travado depois de escolhido (P13). */
export function ModePicker({ preferred, onChoose }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  // O foco vai para o modo de sempre: quem joga igual todo dia começa com um Enter.
  useEffect(() => first.current?.focus(), []);
  const focused = preferred ?? "choice";

  return (
    <section class="mode-picker" aria-labelledby="mode-title">
      <h2 id="mode-title">{t("mode.title")}</h2>
      <p id="mode-locked" class="hint">
        {t("mode.locked")}
      </p>
      <div class="mode-options">
        {MODES.map(({ mode, name, hint }) => (
          // A dica vai em cada botão: o foco entra direto nele, e o leitor de tela lê a dica.
          <button
            key={mode}
            type="button"
            class={mode === preferred ? "mode preferred" : "mode"}
            ref={mode === focused ? first : undefined}
            aria-describedby="mode-locked"
            onClick={() => onChoose(mode)}
          >
            <span class="mode-name">{t(name)}</span>
            <span class="mode-hint">{t(hint, { total: MODE_RULES[mode].maxAttempts })}</span>
            {mode === preferred && <span class="tag">{t("mode.lastUsed")}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
