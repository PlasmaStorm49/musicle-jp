// A nav (P225): uma aba por categoria, 6 com as Medalhas (M16). Abaixo de 720 px (P265, P287), os
// Artistas, o Histórico e as Medalhas ficam num "Mais ▾", porque as 6 abas não cabem numa linha (entre
// 480 e 719 px, a coluna tem 460 px úteis); a partir de 720 px, as 6 ficam na linha. Os links do
// "Mais" estão duas vezes no DOM, um na linha e outro no menu, e o CSS mostra um por vez (o
// `[hidden]` vale sempre, e o menu fechado usa ele: o mesmo elemento não serve às duas larguras).
// No canto direito, a medalha em destaque (ME118, P317), quando há uma.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { animeDone, dailiesDone } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { navCurrent, ROUTES, type Route, routeHref } from "../core/routes.ts";
import { t } from "../i18n/t.ts";
import { Icon } from "./Icon.tsx";
import { NavLogo } from "./Logo.tsx";
import { MedalArt, medalWidth } from "./MedalArt.tsx";
import type { NoticeItem } from "./MedalNotice.tsx";
import { singleClick, singleClickLink } from "./singleClick.ts";

type Props = {
  readonly route: Route;
  /** A última leitura do save: o ✓ dos Hits e do Anime, só de hoje. */
  readonly save: Save;
  /** O "hoje" do jogo. */
  readonly date: string;
  /** A medalha em destaque (P317), já com o nome e o desenho sem a capa (P319); null sem ela. */
  readonly favorite?: NoticeItem | null;
};

/** A altura da medalha em destaque na nav: o link tem o alvo de 44 px; o enfeite, abaixo de 360. */
const FAVORITE_HEIGHT = { link: 36, small: 28 } as const;

// O id do menu, para o aria-controls: nenhum id igual a uma rota (regra 17).
const MENU_ID = "nav-more-menu";

/** A largura em que a medalha em destaque vira link (P317): abaixo dela, não sobram os 44 px. */
const FAVORITE_LINK = "(min-width: 360px)";

export function Nav({ route, save, date, favorite = null }: Props) {
  const [open, setOpen] = useState(false);
  // Uma versão só da medalha em destaque, pela largura: abaixo de 360 px, o item inteiro sai do
  // leitor de tela (um item vazio na lista da nav, com só o enfeite).
  const [roomy, setRoomy] = useState(() => window.matchMedia?.(FAVORITE_LINK).matches ?? true);
  useEffect(() => {
    const query = window.matchMedia?.(FAVORITE_LINK);
    if (!query) return;
    const update = () => setRoomy(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const toggle = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLLIElement>(null);
  // A rota mudou (um link do menu, a nav, o Voltar do navegador): o menu fecha.
  const shownFor = useRef(route);
  useEffect(() => {
    if (shownFor.current === route) return;
    shownFor.current = route;
    setOpen(false);
  }, [route]);
  // A largura que passa do corte esconde o "Mais" (todas as abas na linha): o menu fecha, para não
  // reaparecer aberto quando a janela voltar a estreitar. O corte é o do CSS, 720 px.
  useEffect(() => {
    const wide = window.matchMedia?.("(min-width: 720px)");
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
    navCurrent(route, "artists") || navCurrent(route, "history") || navCurrent(route, "medals")
      ? "true"
      : undefined;

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

  const medalsLink = (inMenu: boolean) => (
    <a
      href={ROUTES.medals}
      aria-current={navCurrent(route, "medals")}
      onClick={inMenu ? follow(ROUTES.medals) : undefined}
    >
      {t("nav.medals")}
    </a>
  );

  return (
    <nav class="tabs" aria-label={t("nav.label")}>
      <ul>
        {/* Uma aba por categoria (P225): a Início, os Hits (a tela deles, os dois diários e o
            Treino), o Anime (a tela dele, as dificuldades e os 6 diários), os Artistas, o
            Histórico (o calendário, os dias e os diários de um dia passado) e as Medalhas. A da aba atual leva
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
        {/* Na linha, a partir de 720 px. O modo por artista fica na nav até o site ficar público
            (P117): é só tirar os dois links dele. */}
        <li class="nav-inline">{artists(false)}</li>
        <li class="nav-inline">{history(false)}</li>
        <li class="nav-inline">{medalsLink(false)}</li>
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
            <li>{medalsLink(true)}</li>
          </ul>
        </li>
        {/* A medalha em destaque (P317): a partir de 360 px, um link para as Medalhas; abaixo, não
            sobra o alvo de 44 px, e ela fica menor, só de enfeite (o link das Medalhas está no
            Mais). */}
        {favorite && (
          <li class="nav-favorite" aria-hidden={roomy ? undefined : "true"}>
            {roomy ? (
              <a
                class="nav-favorite-link"
                href={ROUTES.medals}
                aria-label={t("favorite.link", { name: favorite.spoken })}
              >
                <MedalArt
                  kind={favorite.kind}
                  art={favorite.art}
                  earned
                  size={medalWidth(favorite.kind, FAVORITE_HEIGHT.link)}
                  icon={favorite.id}
                />
              </a>
            ) : (
              <span class="nav-favorite-small">
                <MedalArt
                  kind={favorite.kind}
                  art={favorite.art}
                  earned
                  size={medalWidth(favorite.kind, FAVORITE_HEIGHT.small)}
                  icon={favorite.id}
                />
              </span>
            )}
          </li>
        )}
      </ul>
    </nav>
  );
}
