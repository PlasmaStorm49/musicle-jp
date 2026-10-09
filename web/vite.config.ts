import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Fuso propositalmente diferente do Brasil: código que use a hora local por engano
    // falha aqui na máquina, e não só na CI.
    env: { TZ: "Asia/Tokyo" },
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts", "src/data/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/core/generated/**"],
      thresholds: { lines: 90, statements: 90 },
    },
  },
});
