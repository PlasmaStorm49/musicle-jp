import { useEffect, useRef } from "preact/hooks";
import { type ArtistSummary, dailyStatus, nextDaily } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { MAX_STAGE, MODES, secondsAt } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { t, tn } from "../i18n/t.ts";
import { type Card, CardList, dailyText } from "./cards.tsx";
import { Icon } from "./Icon.tsx";
import { Logo } from "./Logo.tsx";
import { modeName } from "./modes.ts";
import { practiceScoreText } from "./PracticeRun.tsx";
import { singleClick } from "./singleClick.ts";
import { useTheme } from "./theme.ts";

type Props = {
  /** O dia de hoje na agenda; null quando não há (P44). */
  readonly day: Day | null;
  /** Data do jogo (não o relógio). */
  readonly date: string;
  /** A última leitura do save. */
  readonly save: Save;
  /** O artista e o placar da sessão do modo por artista; null antes da 1ª rodada. */
  readonly artists: ArtistSummary | null;
};

/**
 * O cartão dos Hits (P226): o estado dos dois diários, uma linha cada, e o oliva quando há um por
 * jogar. Sem diário no dia, continua link (o Treino está lá dentro), com uma linha só.
 */
function hitsCard(save: Save, day: Day | null, date: string): Card {
  return {
    tab: "hits",
    name: t("hits.title"),
    short: t("home.hitsShort"),
    hint: t("home.hitsHint"),
    lines: day
      ? MODES.map((mode) =>
          t("home.hitsLine", {
            mode: modeName(mode),
            status: dailyText(dailyStatus(save, day, date, mode), true),
          }),
        )
      : [t("home.statusUnavailable")],
    next: nextDaily(save, day, date) !== null,
  };
}

function artistsText(summary: ArtistSummary | null): string | null {
  if (!summary) return null;
  // O Superfan conta em músicas, como a partida: "-7 pontos em 2 músicas".
  if (summary.superfan) {
    return t("home.artistsSuperfan", {
      artist: summary.artist,
      points: tn("count.points", summary.score.points),
      songs: tn("superfan.songs", summary.score.rounds),
    });
  }
  return t("home.artistsSession", {
    artist: summary.artist,
    score: practiceScoreText(summary.score),
  });
}

/** O cartão do modo por artista. Sai com o <li> da nav quando o site ficar público (P117). */
function artistsCard(summary: ArtistSummary | null): Card {
  const text = artistsText(summary);
  return {
    tab: "artists",
    name: t("artists.title"),
    short: t("home.artistsShort"),
    hint: t("home.artistsHint"),
    lines: text ? [text] : [],
  };
}

/**
 * A home: o nome do jogo, um cartão por categoria da nav (P226), numa coluna, como jogar
 * (recolhido) e o tema. Os Hits com o estado dos dois diários; o oliva, a ação da tela, vai neles
 * enquanto houver um diário por jogar.
 */
export function Home({ day, date, save, artists }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Tela nova: o foco vai para o título (regra 16), como no resumo do dia. Só ao montar: o save
  // relido (outra aba gravou) muda os cartões, mas não pode tirar o foco de onde ele está.
  useEffect(() => heading.current?.focus(), []);

  return (
    <div class="home screen">
      <header class="home-header">
        <Logo />
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {t("app.title")}
          </h1>
          <p>{t("app.tagline")}</p>
        </div>
      </header>

      <section aria-labelledby="home-modes">
        <h2 id="home-modes" class="sr-only">
          {t("home.modesTitle")}
        </h2>
        <CardList
          cards={[hitsCard(save, day, date), artistsCard(artists)]}
          idPrefix="home"
          single
        />
      </section>

      {/* Recolhido: a tela cabe sem rolar, e quem quer as regras abre (P210). */}
      <details class="home-how-box">
        {/* O chevron do designer diz que abre, e gira quando está aberto. */}
        <summary>
          {t("home.howTitle")}
          <Icon name="next" />
        </summary>
        <ul class="home-how">
          <li>{t("home.howClip", { first: secondsAt(0), last: secondsAt(MAX_STAGE) })}</li>
          <li>{t("home.howDaily")}</li>
          <li>{t("home.howPractice")}</li>
        </ul>
      </details>

      <ThemeSwitch />
    </div>
  );
}

/**
 * A troca de tema (P176, P191, P217), no fim da Início: um switch claro e escuro, com o sol e a lua
 * (provisórios, P218). Sem escolha salva, ele mostra o tema do aparelho; a troca vale na hora e
 * fica gravada. É um botão que alterna no mesmo lugar: o 2º clique de um toque duplo não pode
 * voltar o tema (singleClick, regra 23). O h2, como nas outras seções, deixa o "Tema" na
 * navegação por títulos.
 */
function ThemeSwitch() {
  const { theme, followsDevice, toggle } = useTheme();
  return (
    <section class="home-theme" aria-labelledby="home-theme">
      <h2 id="home-theme">{t("home.themeTitle")}</h2>
      <button
        type="button"
        role="switch"
        class="theme-switch"
        aria-checked={theme === "dark"}
        // A dica só vale sem escolha: depois do 1º toque, o tema é o escolhido.
        aria-describedby={followsDevice ? "theme-hint" : undefined}
        onClick={singleClick(toggle)}
      >
        <Icon name="sun" />
        <span class="theme-track" aria-hidden="true">
          <span class="theme-thumb" />
        </span>
        <Icon name="moon" />
        <span class="sr-only">{t("home.themeDark")}</span>
      </button>
      {followsDevice && (
        <p id="theme-hint" class="sr-only">
          {t("home.themeHint")}
        </p>
      )}
    </section>
  );
}
