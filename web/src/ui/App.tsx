import { t } from "../i18n/t.ts";

export function App() {
  return (
    <main>
      <h1>{t("app.title")}</h1>
      <p>{t("app.tagline")}</p>
      <p>{t("app.underConstruction", { milestone: "M5" })}</p>
    </main>
  );
}
