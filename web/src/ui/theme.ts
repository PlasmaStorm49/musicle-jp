// O tema na página (P176, P191, P217): o data-theme do <html>, que o styles.css lê, e o
// theme-color da barra do navegador no celular. Sem escolha, não há atributo nenhum: quem decide é
// o prefers-color-scheme do aparelho, só no CSS. O script do index.html aplica o tema salvo antes
// da pintura, com a mesma chave; daí em diante a página é a fonte da verdade desta aba (a gravação
// pode falhar), e a troca feita em outra aba chega pelo evento storage.
import { useEffect, useState } from "preact/hooks";
import { readTheme, THEME_KEY, type ThemeChoice, writeTheme } from "../storage/theme.ts";
import { browserStore } from "./browserStore.ts";

/** O tema que a página mostra agora. */
export function shownTheme(doc: Document = document): ThemeChoice {
  const theme = doc.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "auto";
}

/**
 * Aplica o tema. Cada <meta name="theme-color"> guarda a sua cor em data-color: sem escolha,
 * cada um volta à sua (o navegador escolhe pela media); com um tema escolhido, os dois ficam com a
 * cor dele.
 */
export function applyTheme(choice: ThemeChoice, doc: Document = document): void {
  const root = doc.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;
  const metas = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const chosen = choice === "auto" ? undefined : metas.find((m) => m.media.includes(choice));
  for (const meta of metas) {
    const color = chosen?.dataset.color ?? meta.dataset.color;
    if (color) meta.content = color;
  }
}

/** O tema claro ou escuro, sem o "auto". */
export type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** O tema do aparelho (o que vale sem escolha). Sem matchMedia, o claro. */
export function deviceTheme(win: Window = window): Theme {
  return typeof win.matchMedia === "function" && win.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

/** A troca de tema de outra aba (o evento storage só chega nas outras): aplica aqui também. */
function fromOtherTab(event: StorageEvent): ThemeChoice | null {
  // key null: a outra aba limpou o armazenamento inteiro.
  if (event.key !== THEME_KEY && event.key !== null) return null;
  const store = browserStore();
  const next = store ? readTheme(store) : "auto";
  applyTheme(next);
  return next;
}

/** Desde a carga (main.tsx): a página acompanha a troca de tema feita em outra aba. */
export function watchTheme(win: Window = window): void {
  win.addEventListener("storage", (event) => void fromOtherTab(event));
}

/** O tema da página, se ele é o do aparelho (sem escolha salva) e a troca para o outro. */
export type ThemeState = {
  readonly theme: Theme;
  readonly followsDevice: boolean;
  readonly toggle: () => void;
};

/**
 * O tema que a página mostra (o escolhido, ou o do aparelho sem escolha) e a troca para o outro:
 * aplica na hora e grava no aparelho (P217). Sem armazenamento, vale só nesta visita. Começa pelo
 * que a página mostra, segue a troca de outra aba e, sem escolha, a do aparelho.
 */
export function useTheme(): ThemeState {
  const [choice, setChoice] = useState<ThemeChoice>(() => shownTheme());
  const [device, setDevice] = useState<Theme>(() => deviceTheme());
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const next = fromOtherTab(event);
      if (next) setChoice(next);
    };
    window.addEventListener("storage", onStorage);
    const media = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
    const onDevice = () => setDevice(deviceTheme());
    // O Safari antes do 14 não tem o addEventListener no MediaQueryList: lá, o switch só não
    // acompanha a troca do aparelho com a página aberta.
    media?.addEventListener?.("change", onDevice);
    return () => {
      window.removeEventListener("storage", onStorage);
      media?.removeEventListener?.("change", onDevice);
    };
  }, []);
  const theme: Theme = choice === "auto" ? device : choice;
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChoice(next);
    applyTheme(next);
    const store = browserStore();
    if (store) writeTheme(store, next);
  };
  return { theme, followsDevice: choice === "auto", toggle };
}
