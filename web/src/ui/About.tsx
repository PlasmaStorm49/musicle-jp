import { useEffect, useRef } from "preact/hooks";
import type { MessageKey } from "../i18n/pt-BR.ts";
import { t } from "../i18n/t.ts";

/** As fontes dos dados (P239, P241, P256) e o que cada uma dá, na ordem da tela. */
const SOURCES: readonly {
  readonly name: MessageKey;
  readonly what: MessageKey;
  readonly url: string;
}[] = [
  { name: "about.apple", what: "about.appleWhat", url: "https://music.apple.com" },
  { name: "about.animethemes", what: "about.animethemesWhat", url: "https://animethemes.moe" },
  { name: "about.anisongdb", what: "about.anisongdbWhat", url: "https://anisongdb.com" },
  // Só o texto e o link, sem logo (P256).
  { name: "about.mal", what: "about.malWhat", url: "https://myanimelist.net" },
];

/** O contato (P258): as Issues do repositório, públicas, sem e-mail no site. */
export const ISSUES_URL = "https://github.com/PlasmaStorm49/musicle-jp/issues";

/** Um link para fora do jogo: abre em outra aba, e o leitor de tela é avisado. */
function External({ href, children }: { readonly href: string; readonly children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span class="sr-only"> {t("attribution.newTab")}</span>
    </a>
  );
}

/**
 * O "Sobre e privacidade" (P243, rota #sobre): o que é o jogo, as fontes com o link de cada uma
 * (P241), a privacidade (o jogo não coleta dados: o progresso fica no navegador) e o contato
 * pelas Issues do GitHub (P258). Tela nova: o foco vai para o título (regra 16).
 */
export function About() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div class="about screen">
      <header>
        <h1 ref={heading} tabIndex={-1} class="about-title">
          {t("about.title")}
        </h1>
      </header>
      <p class="about-text">{t("about.intro")}</p>
      <section class="about-part" aria-labelledby="about-sources">
        <h2 id="about-sources" class="about-heading">
          {t("about.sourcesTitle")}
        </h2>
        <ul class="about-sources">
          {SOURCES.map((source) => (
            <li key={source.url}>
              <External href={source.url}>{t(source.name)}</External>: {t(source.what)}
            </li>
          ))}
        </ul>
      </section>
      <section class="about-part" aria-labelledby="about-privacy">
        <h2 id="about-privacy" class="about-heading">
          {t("about.privacyTitle")}
        </h2>
        <p class="about-text">{t("about.privacy")}</p>
      </section>
      <section class="about-part" aria-labelledby="about-contact">
        <h2 id="about-contact" class="about-heading">
          {t("about.contactTitle")}
        </h2>
        <p class="about-text">
          {t("about.contact")} <External href={ISSUES_URL}>{t("about.contactLink")}</External>.
        </p>
      </section>
    </div>
  );
}
