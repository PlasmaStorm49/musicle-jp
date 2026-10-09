import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ItemView } from "../core/view.ts";
import { t, tn } from "../i18n/t.ts";
import { ItemLabel } from "./ItemLabel.tsx";

/** Uma linha da lista: a música, como desenhar, e se já foi tentada nesta rodada. */
export type Suggestion = { readonly id: string; readonly item: ItemView; readonly tried: boolean };

type Props = {
  /** Sugestões para a consulta (a busca fica no core; aqui só se desenha). */
  readonly suggest: (query: string) => readonly Suggestion[];
  readonly onPick: (id: string) => void;
  /** id do título da pergunta, que serve de rótulo ao campo. */
  readonly labelledBy: string;
};

const LIST_ID = "guess-list";
const HINT_ID = "guess-hint";
const optionId = (i: number) => `guess-option-${i}`;
// Kana seguido de letras latinas no fim: o IME ainda está montando a sílaba (とうk), então a
// busca usa só o kana. Romaji puro em composição (teclado do celular) busca como está.
const COMPOSING_TAIL = /(?<=[\p{Script=Hiragana}\p{Script=Katakana}])[A-Za-z]+$/u;
// A contagem espera a digitação parar: o leitor de tela não lê a cada tecla.
const STATUS_DELAY_MS = 600;

/**
 * Campo com autocompletar no padrão combobox com listbox da WAI-ARIA 1.2. O foco fica sempre
 * no campo; a opção ativa é indicada por aria-activedescendant.
 */
export function GuessInput({ suggest, onPick, labelledBy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");

  const results = useMemo(() => (query.trim() ? suggest(query) : []), [query, suggest]);
  const expanded = open && results.length > 0;

  // IME por addEventListener: o Preact só liga onCompositionEnd se o elemento tiver a
  // propriedade "oncompositionend", que o Chrome não tem, e o evento nunca chegaria.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const start = () => {
      composing.current = true;
    };
    const end = () => {
      composing.current = false;
      setQuery(el.value);
    };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    return () => {
      el.removeEventListener("compositionstart", start);
      el.removeEventListener("compositionend", end);
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setStatus("");
      return;
    }
    const id = setTimeout(
      () =>
        setStatus(
          results.length > 0 ? tn("typing.results", results.length) : t("typing.noResults"),
        ),
      STATUS_DELAY_MS,
    );
    return () => clearTimeout(id);
  }, [query, results]);

  function update(text: string) {
    setValue(text);
    setQuery(composing.current ? text.replace(COMPOSING_TAIL, "") : text);
    setOpen(true);
    setActive(-1);
  }

  function clear() {
    setValue("");
    setQuery("");
    setOpen(false);
    setActive(-1);
    setStatus(""); // calado: quem anuncia o resultado do palpite é o jogo
  }

  function pick(suggestion: Suggestion | undefined) {
    if (!suggestion || suggestion.tried) return;
    onPick(suggestion.id);
    clear();
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    // O Enter (e as setas) que o IME usa para confirmar a conversão não são nossos.
    if (event.isComposing || event.keyCode === 229) return;
    const count = results.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        if (count > 0) setActive((a) => (a + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        setOpen(true);
        if (count > 0) setActive((a) => (a <= 0 ? count - 1 : a - 1));
        break;
      case "Enter":
        if (expanded && active >= 0) {
          event.preventDefault();
          pick(results[active]);
        }
        break;
      case "Escape":
        if (expanded) {
          setOpen(false);
          setActive(-1);
        } else {
          clear();
        }
        break;
    }
  }

  return (
    <div class="guess">
      <input
        ref={input}
        type="text"
        role="combobox"
        class="guess-input"
        aria-labelledby={labelledBy}
        aria-describedby={HINT_ID}
        aria-autocomplete="list"
        aria-controls={LIST_ID}
        aria-expanded={expanded}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        placeholder={t("typing.placeholder")}
        value={value}
        onInput={(event) => update(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <p id={HINT_ID} class="hint">
        {t("typing.hint")}
      </p>
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: padrão combobox da WAI-ARIA 1.2 (ul com role listbox) */}
      <ul id={LIST_ID} role="listbox" aria-label={t("typing.listLabel")} hidden={!expanded}>
        {results.map((suggestion, i) => (
          // No combobox, a opção não recebe foco: ele fica no campo, que cuida do teclado e aponta
          // a opção ativa por aria-activedescendant. Por isso as regras abaixo não se aplicam.
          // biome-ignore lint/a11y/useFocusableInteractive: o foco fica no campo (aria-activedescendant)
          // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado é tratado no campo (setas e Enter)
          <li
            key={suggestion.id}
            id={optionId(i)}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: li com role option (WAI-ARIA 1.2)
            role="option"
            class={i === active ? "suggestion active" : "suggestion"}
            aria-selected={i === active}
            aria-disabled={suggestion.tried || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(suggestion)}
          >
            <ItemLabel item={suggestion.item} />
            {suggestion.tried && <span class="tag">{t("typing.tried")}</span>}
          </li>
        ))}
      </ul>
      {open && query.trim() !== "" && results.length === 0 && (
        <p class="hint">{t("typing.noResults")}</p>
      )}
      <p role="status" class="sr-only">
        {status}
      </p>
    </div>
  );
}
