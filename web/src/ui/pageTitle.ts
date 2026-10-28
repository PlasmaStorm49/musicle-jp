import { type Category, categoryOf, type Route } from "../core/routes.ts";
import { t } from "../i18n/t.ts";

/** O nome de cada categoria da nav no título da aba do navegador; a Início não tem. */
const PAGE = {
  hits: "hits.title",
  anime: "anime.title",
  mixed: "mixed.title",
  quiz: "quiz.title",
  artists: "artists.title",
  history: "history.title",
  medals: "medals.title",
} as const satisfies Record<Exclude<Category, "home">, string>;

/**
 * O título da aba do navegador para a rota (o usuário, 27/10/2026): "Quiz do dia · AteMusic", pela
 * categoria da nav, como a aba marcada; o Sobre pelo nome dele; a Início, só o nome do jogo. No
 * histórico do navegador e nas abas, cada tela tem o seu nome.
 */
export function pageTitle(route: Route): string {
  if (route.tab === "about") return t("app.pageTitle", { page: t("about.title") });
  const category = categoryOf(route.tab);
  if (category === "home") return t("app.title");
  return t("app.pageTitle", { page: t(PAGE[category]) });
}
