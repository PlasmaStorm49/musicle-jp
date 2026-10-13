import { render } from "preact";
import { t } from "./i18n/t.ts";
import { App } from "./ui/App.tsx";
// A fonte da identidade (P175), hospedada no próprio site: só o Regular e o Bold. Cada peso vem
// em fatias por unicode-range, e o navegador baixa só as dos caracteres da tela.
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "./ui/styles.css";
import { watchTheme } from "./ui/theme.ts";

// O título da aba vem do i18n (regra inviolável 2); o <title> do index.html só vale até o JS rodar.
document.title = t("app.title");
// O tema trocado em outra aba vale nesta também, em qualquer aba do jogo (não só na Início).
watchTheme();

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
