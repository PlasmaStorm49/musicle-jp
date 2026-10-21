import { useEffect, useRef } from "preact/hooks";
import {
  type ArtistSummary,
  type DailyStatus,
  dailyStatus,
  type PracticeSummary,
} from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { ROUTES, type Tab } from "../core/routes.ts";
import { MAX_STAGE, MODE_RULES, MODES, ROUNDS_PER_DAY, secondsAt } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { t, tn } from "../i18n/t.ts";
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
  /** O modo e o placar da sessão do Treino; null antes da 1ª rodada (`practiceSummary`). */
  readonly practice: PracticeSummary | null;
  /** O artista e o placar da sessão do modo por artista; null antes da 1ª rodada. */
  readonly artists: ArtistSummary | null;
};

type HomeCard = {
  readonly tab: Exclude<Tab, "home">;
  readonly name: string;
  /** A dica curta, na tela (P210). */
  readonly short: string;
  /** A dica inteira, para o leitor de tela. */
  readonly hint: string;
};

/** Os cartões, na ordem das abas: os modos (MODES, o Normal primeiro), o Treino e os artistas. */
function homeCards(): HomeCard[] {
  return [
    ...MODES.map((mode) => ({
      tab: mode,
      name: modeName(mode),
      short: t(`home.${mode}Short`),
      hint: t(`home.${mode}Hint`, {
        rounds: ROUNDS_PER_DAY,
        total: MODE_RULES[mode].maxAttempts,
      }),
    })),
    {
      tab: "practice",
      name: t("practice.title"),
      short: t("home.practiceShort"),
      hint: t("home.practiceHint"),
    },
    // O cartão sai junto com o <li> da nav quando o site ficar público (P117, P126).
    {
      tab: "artists",
      name: t("artists.title"),
      short: t("home.artistsShort"),
      hint: t("home.artistsHint"),
    },
  ];
}

function dailyText(status: DailyStatus): string {
  switch (status.kind) {
    case "unavailable":
      return t("home.statusUnavailable");
    case "new":
      return t("home.statusNew", { number: status.number });
    case "playing":
      return t("home.statusPlaying", { number: status.number });
    case "done":
      // Dia todo anulado (P27): "terminado", sem "0 de 0 pontos".
      return status.max === 0
        ? t("home.statusDoneVoid", { number: status.number })
        : t("home.statusDone", { number: status.number, score: status.score, max: status.max });
  }
}

function practiceText(summary: PracticeSummary | null): string | null {
  if (!summary) return null;
  return t("home.practiceSession", {
    mode: modeName(summary.target),
    score: practiceScoreText(summary.score),
  });
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

/**
 * A home: o nome do jogo, um cartão por modo (com o estado de hoje) numa grade 2×2, como jogar
 * (recolhido) e o tema. O primeiro diário por jogar (novo ou em andamento) é o cartão oliva: a
 * ação da tela.
 */
export function Home({ day, date, save, practice, artists }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Tela nova: o foco vai para o título (regra 16), como no resumo do dia. Só ao montar: o save
  // relido (outra aba gravou) muda os cartões, mas não pode tirar o foco de onde ele está.
  useEffect(() => heading.current?.focus(), []);
  const statuses = new Map(MODES.map((mode) => [mode, dailyStatus(save, day, date, mode)]));
  const next = MODES.find((mode) => {
    const kind = statuses.get(mode)?.kind;
    return kind === "new" || kind === "playing";
  });

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
        <ul class="home-modes">
          {homeCards().map(({ tab, name, short, hint }) => {
            const status = tab === "practice" || tab === "artists" ? null : statuses.get(tab);
            const text = status
              ? dailyText(status)
              : tab === "artists"
                ? artistsText(artists)
                : practiceText(practice);
            // Nome, estado e dica curta, nessa ordem: o leitor de tela ouve o estado logo, e o nome
            // do link tem tudo o que aparece nele (quem usa a voz diz o que vê).
            const content = (
              <>
                <span class="mode-name">{name}</span>
                {text && <span class="tag">{text}</span>}
                <span class="mode-hint">{short}</span>
              </>
            );
            return (
              <li key={tab}>
                {status?.kind === "unavailable" ? (
                  // Sem diário hoje: não há para onde ir, então o cartão não é link.
                  <div class="mode home-card off">{content}</div>
                ) : (
                  <>
                    {/* Link, e não botão: cada cartão leva a outra aba (#normal, #desafio,
                        #treino, #artistas). A dica inteira vem como descrição (P210). */}
                    <a
                      class={tab === next ? "mode home-card next" : "mode home-card"}
                      href={ROUTES[tab]}
                      aria-describedby={`home-${tab}-hint`}
                    >
                      {content}
                    </a>
                    <span id={`home-${tab}-hint`} class="sr-only">
                      {hint}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
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
  const [theme, toggle] = useTheme();
  return (
    <section class="home-theme" aria-labelledby="home-theme">
      <h2 id="home-theme">{t("home.themeTitle")}</h2>
      <button
        type="button"
        role="switch"
        class="theme-switch"
        aria-checked={theme === "dark"}
        aria-describedby="theme-hint"
        onClick={singleClick(toggle)}
      >
        <Icon name="sun" />
        <span class="theme-track" aria-hidden="true">
          <span class="theme-thumb" />
        </span>
        <Icon name="moon" />
        <span class="sr-only">{t("home.themeDark")}</span>
      </button>
      <p id="theme-hint" class="sr-only">
        {t("home.themeHint")}
      </p>
    </section>
  );
}
