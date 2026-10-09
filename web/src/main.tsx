import { render } from "preact";
import { App } from "./ui/App.tsx";

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
