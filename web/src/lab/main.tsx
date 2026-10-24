// A entrada do laboratório das Misturadas (M17), em /lab.html. Só existe no servidor de
// desenvolvimento: o Vite monta só o index.html, e o App nunca importa nada daqui. A marca abaixo
// é o que a CI e o /verificar procuram no dist (passo 9c), onde ela nunca pode aparecer.
import { render } from "preact";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "../ui/styles.css";
import "./lab.css";
import { Lab } from "./Lab.tsx";

const MARK = "musicle-lab";
if (!import.meta.env.DEV) throw new Error(`${MARK}: só no servidor de desenvolvimento`);

const root = document.getElementById("lab");
if (root) render(<Lab />, root);
