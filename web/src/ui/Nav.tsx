// A nav (P225): uma aba por categoria. Abaixo de 480 px (P265), os Artistas e o Histórico ficam
// num "Mais ▾", porque as 5 abas não cabem numa linha no celular; a partir de 480 px, as 5 ficam na
// linha. Os dois links estão duas vezes no DOM, um par na linha e outro no menu, e o CSS mostra um
// par por vez (o `[hidden]` vale sempre, e o menu fechado usa ele: o mesmo elemento não serve às
// duas larguras).
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { animeDone, dailiesDone } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { navCurrent, ROUTES, type Route, routeHref } from "../core/routes.ts";
import { t } from "../i18n/t.ts";
import { Icon } from "./Icon.tsx";
import { NavLogo } from "./Logo.tsx";
import { singleClick, singleClickLink } from "./singleClick.ts";

type Props = {
  readonly route: Route;
  /** A última leitura do save: o ✓ dos Hits e do Anime, só de hoje. */
  readonly save: Save;
  /** O "hoje" do jogo. */
  readonly date: string;
};

// O id do menu, para o aria-controls: nenhum id igual a uma rota (regra 17).
const MENU_ID = "nav-more-menu";

export function Nav({ route, save, date }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLLIElement>(null);
  // A rota mudou (um link do menu, a nav, o Voltar do navegador): o menu fecha.
  const shownFor = useRef(route);
  useEffect(() => {
    if (shownFor.current === route) return;
    shownFor.current = route;
    setOpen(false);
  }, [route]);
  // A largura que passa dos 480 px esconde o "Mais" (as 5 abas na linha): o menu fecha, para não
  // reaparecer aberto quando a janela voltar a estreitar.
  useEffect(() => {
    const wide = window.matchMedia?.("(min-width: 480px)");
    if (!wide) return;
    const close = () => setOpen(false);
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);
  // Aberto, o Esc fecha (com o foco de volta ao "Mais"), e o toque fora dele também. No
  // useLayoutEffect, e não no useEffect: os ouvintes entram antes da pintura do menu aberto, e um
  // Esc ou um toque logo depois de abrir não escapa (o useEffect roda depois da pintura).
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // O "Mais" leva o aria-current quando a categoria atual está nele: a pessoa vê onde está. Sempre
  // "true", e nunca "page": o botão não é a página (o link dentro dele, sim).
  const moreCurrent =
    navCurrent(route, "artists") || navCurrent(route, "history") ? "true" : undefined;

  /**
   * O link de dentro do menu: fica sobre o <main>, então ignora o 2º clique de um toque duplo
   * (regra 23), e fecha o menu. O da rota atual não muda o endereço, nem a tela: o foco volta ao
   * "Mais", para não ficar no link que some (regra 16).
   */
  const follow = (href: string) => (event: MouseEvent) => {
    singleClickLink(event);
    if (event.defaultPrevented) return;
    setOpen(false);
    // Pela rota, e não pelo endereço: um endereço que já caiu no calendário (#normal/<hoje>)
    // difere do #historico, mas a tela não troca.
    if (routeHref(route) === href) toggle.current?.focus();
  };

  const artists = (inMenu: boolean) => (
    <a
      href={ROUTES.artists}
      aria-current={navCurrent(route, "artists")}
      onClick={inMenu ? follow(ROUTES.artists) : undefined}
    >
      {t("nav.artists")}
    </a>
  );
  const history = (inMenu: boolean) => (
    <a
      href={ROUTES.history}
      aria-current={navCurrent(route, "history")}
      onClick={inMenu ? follow(ROUTES.history) : undefined}
    >
      {t("nav.history")}
    </a>
  );

  return (
    <nav class="tabs" aria-label={t("nav.label")}>
      <ul>
        {/* Uma aba por categoria (P225): a Início, os Hits (a tela deles, os dois diários e o
            Treino), o Anime (a tela dele, as dificuldades e os 6 diários), os Artistas e o
            Histórico (o calendário, os dias e os diários de um dia passado). A da aba atual leva
            aria-current: "page" na tela dela, e "true" dentro de um jogo dela (o link leva a
            outra página). */}
        {/* A Início é o selo do logo (P205): o nome do link fica em texto, para o leitor de tela. */}
        <li>
          <a class="nav-home" href={ROUTES.home} aria-current={navCurrent(route, "home")}>
            <NavLogo />
            <span class="sr-only">{t("nav.home")}</span>
          </a>
        </li>
        {/* O ✓ quando os dois diários do dia terminaram (P227). */}
        <li>
          <a href={ROUTES.hits} aria-current={navCurrent(route, "hits")}>
            {t("nav.hits")}
            {dailiesDone(save, date) && (
              <>
                <span class="done-mark" aria-hidden="true">
                  {" "}
                  {t("nav.doneMark")}
                </span>
                <span class="sr-only">{t("nav.hitsDone")}</span>
              </>
            )}
          </a>
        </li>
        {/* O ✓ quando qualquer um dos 6 diários do Anime de hoje terminou (P247). */}
        <li>
          <a href={ROUTES.anime} aria-current={navCurrent(route, "anime")}>
            {t("nav.anime")}
            {animeDone(save, date) && (
              <>
                <span class="done-mark" aria-hidden="true">
                  {" "}
                  {t("nav.doneMark")}
                </span>
                <span class="sr-only">{t("nav.animeDone")}</span>
              </>
            )}
          </a>
        </li>
        {/* Na linha, a partir de 480 px. O modo por artista fica na nav até o site ficar público
            (P117): é só tirar os dois links dele. */}
        <li class="nav-inline">{artists(false)}</li>
        <li class="nav-inline">{history(false)}</li>
        {/* No celular, o "Mais" (P265). Ao abrir, o foco fica no botão, e o Tab entra na lista. */}
        <li
          class="nav-more"
          ref={box}
          onFocusOut={(event) => {
            // Só quando o foco foi para outro lugar (o Tab saiu da lista). Sem destino (o toque
            // fora, ou o Safari, que não dá foco a um link tocado), quem fecha é o pointerdown:
            // fechar aqui sumiria com o link antes do clique.
            const next = event.relatedTarget as Node | null;
            if (next && !box.current?.contains(next)) setOpen(false);
          }}
        >
          <button
            ref={toggle}
            type="button"
            class="nav-more-toggle"
            aria-expanded={open}
            aria-controls={MENU_ID}
            aria-current={moreCurrent}
            // O botão alterna no mesmo lugar: o 2º clique de um toque duplo fecharia o menu
            // (regra 23).
            onClick={singleClick(() => setOpen((value) => !value))}
          >
            {t("nav.more")}
            <span class="nav-more-chevron" aria-hidden="true">
              <Icon name="next" />
            </span>
          </button>
          <ul id={MENU_ID} class="nav-menu" hidden={!open}>
            <li>{artists(true)}</li>
            <li>{history(true)}</li>
          </ul>
        </li>
      </ul>
    </nav>
  );
}
