import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// O GitHub Pages publica o site em /musicle-jp/. Só o build e o preview (que serve o dist) usam
// esse caminho: desenvolvimento, e2e e Vitest ficam na raiz (o e2e espera localhost:5173/).
const PAGES_BASE = "/musicle-jp/";

export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? PAGES_BASE : "/",
  plugins: [preact()],
  server: { port: 5173, strictPort: true },
  test: {
    // Componentes (.test.tsx) pedem DOM no próprio arquivo: // @vitest-environment happy-dom
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    // Fuso propositalmente diferente do Brasil: código que use a hora local por engano
    // falha aqui na máquina, e não só na CI.
    env: { TZ: "Asia/Tokyo" },
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts", "src/data/**/*.ts", "src/storage/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/core/generated/**"],
      thresholds: { lines: 90, statements: 90 },
    },
  },
}));
