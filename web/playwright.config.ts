import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

// Testes de ponta a ponta contra o servidor de desenvolvimento: só nele existe o motor de áudio
// falso (?fakeAudio=1). A data vem do relógio fixo de cada teste (page.clock), não do ?date=.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: CI,
  retries: 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    locale: "pt-BR",
    // Fuso de propósito diferente do Brasil, como no Vitest: data calculada pela hora local
    // por engano aparece aqui.
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
