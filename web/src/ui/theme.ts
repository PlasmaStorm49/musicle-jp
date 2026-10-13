// O tema na página (P176, P191): o data-theme do <html>, que o styles.css lê, e o theme-color da
// barra do navegador no celular. O Automático não põe atributo nenhum: quem decide é o
// prefers-color-scheme do aparelho, só no CSS. O script do index.html aplica o tema salvo antes
// da pintura, com a mesma chave; daí em diante a página é a fonte da verdade desta aba (a gravação
// pode falhar), e a troca feita em outra aba chega pelo evento storage.
import { useCallback, useEffect, useState } from "preact/hooks";
import type { KeyValueStore } from "../storage/save.ts";
import { readTheme, THEME_KEY, type ThemeChoice, writeTheme } from "../storage/theme.ts";

/** O localStorage, ou null quando o navegador não deixa nem ler (cookies bloqueados). */
function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** O tema que a página mostra agora. */
export function shownTheme(doc: Document = document): ThemeChoice {
  const theme = doc.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "auto";
}

/**
 * Aplica o tema. Cada <meta name="theme-color"> guarda a sua cor em data-color: no Automático,
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

/**
 * O tema escolhido e a troca: aplica na hora e grava no aparelho. Sem armazenamento, vale só
 * nesta visita. Começa pelo que a página mostra, e segue a troca de outra aba.
 */
export function useTheme(): readonly [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => shownTheme());
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const next = fromOtherTab(event);
      if (next) setChoice(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const change = useCallback((next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
    const store = browserStore();
    if (store) writeTheme(store, next);
  }, []);
  return [choice, change];
}
