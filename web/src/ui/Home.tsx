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
import { THEME_CHOICES } from "../storage/theme.ts";
import { Logo } from "./Logo.tsx";
import { modeName } from "./modes.ts";
import { practiceScoreText } from "./PracticeRun.tsx";
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
  readonly hint: string;
};

/** Os cartões, na ordem das abas: os modos (MODES, o Normal primeiro), o Treino e os artistas. */
function homeCards(): HomeCard[] {
  return [
    ...MODES.map((mode) => ({
      tab: mode,
      name: modeName(mode),
      hint: t(`home.${mode}Hint`, {
        rounds: ROUNDS_PER_DAY,
        total: MODE_RULES[mode].maxAttempts,
      }),
    })),
    { tab: "practice", name: t("practice.title"), hint: t("home.practiceHint") },
    // O cartão sai junto com o <li> da nav quando o site ficar público (P117, P126).
    { tab: "artists", name: t("artists.title"), hint: t("home.artistsHint") },
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

/** A home: o nome do jogo, um cartão por modo (com o estado de hoje), como jogar e o tema. */
export function Home({ day, date, save, practice, artists }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Tela nova: o foco vai para o título (regra 16), como no resumo do dia. Só ao montar: o save
  // relido (outra aba gravou) muda os cartões, mas não pode tirar o foco de onde ele está.
  useEffect(() => heading.current?.focus(), []);

  return (
    <div class="home">
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
        <h2 id="home-modes">{t("home.modesTitle")}</h2>
        <ul class="home-modes">
          {homeCards().map(({ tab, name, hint }) => {
            const status =
              tab === "practice" || tab === "artists" ? null : dailyStatus(save, day, date, tab);
            const text = status
              ? dailyText(status)
              : tab === "artists"
                ? artistsText(artists)
                : practiceText(practice);
            // Nome, estado e dica, nessa ordem: o leitor de tela ouve o estado logo.
            const content = (
              <>
                <span class="mode-name">{name}</span>
                {text && <span class="tag">{text}</span>}
                <span class="mode-hint">{hint}</span>
              </>
            );
            return (
              <li key={tab}>
                {status?.kind === "unavailable" ? (
                  // Sem diário hoje: não há para onde ir, então o cartão não é link.
                  <div class="mode home-card off">{content}</div>
                ) : (
                  // Link, e não botão: cada cartão leva a outra aba (#normal, #desafio, #treino,
                  // #artistas).
                  <a class="mode home-card" href={ROUTES[tab]}>
                    {content}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="home-how">
        <h2 id="home-how">{t("home.howTitle")}</h2>
        <ul class="home-how">
          <li>{t("home.howClip", { first: secondsAt(0), last: secondsAt(MAX_STAGE) })}</li>
          <li>{t("home.howDaily")}</li>
          <li>{t("home.howPractice")}</li>
        </ul>
      </section>

      <ThemePicker />
    </div>
  );
}

/**
 * A troca de tema (P176, P191), no fim da Início: rádios, e não um botão que alterna, para o toque
 * duplo não pular um estado (regra 23). A escolha vale na hora e fica gravada no aparelho. O h2,
 * como nas outras seções, deixa o "Tema" na navegação por títulos; o fieldset leva o nome dele.
 */
function ThemePicker() {
  const [choice, setChoice] = useTheme();
  return (
    <section aria-labelledby="home-theme">
      <h2 id="home-theme">{t("home.themeTitle")}</h2>
      <fieldset class="theme-options" aria-labelledby="home-theme" aria-describedby="theme-hint">
        {THEME_CHOICES.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="theme"
              value={option}
              checked={choice === option}
              onChange={() => setChoice(option)}
            />{" "}
            {t(`theme.${option}`)}
          </label>
        ))}
      </fieldset>
      <p id="theme-hint" class="hint">
        {t("home.themeHint")}
      </p>
    </section>
  );
}
