import { render } from "preact";
import { t } from "./i18n/t.ts";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";

// O título da aba vem do i18n (regra inviolável 2); o <title> do index.html só vale até o JS rodar.
document.title = t("app.title");

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
