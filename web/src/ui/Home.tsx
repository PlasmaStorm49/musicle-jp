import { useEffect, useRef } from "preact/hooks";
import { type DailyStatus, dailyStatus } from "../core/home.ts";
import type { PracticeScore } from "../core/practice.ts";
import type { Save } from "../core/records.ts";
import { ROUTES, type Tab } from "../core/routes.ts";
import { MAX_STAGE, ROUNDS_PER_DAY, secondsAt } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import type { MessageKey } from "../i18n/pt-BR.ts";
import { t, tn } from "../i18n/t.ts";
import { Logo } from "./Logo.tsx";

type Props = {
  /** O dia de hoje na agenda; null quando não há (P44). */
  readonly day: Day | null;
  /** Data do jogo (não o relógio). */
  readonly date: string;
  /** A última leitura do save. */
  readonly save: Save;
  /** Placar da sessão do Treino; null antes da 1ª rodada (`practiceSummary`). */
  readonly practice: PracticeScore | null;
};

type HomeMode = {
  readonly tab: Exclude<Tab, "home">;
  readonly name: MessageKey;
  readonly hint: MessageKey;
};

/**
 * Os cartões, na ordem das abas. Juntar ou trocar os modos (ex.: Normal e Desafio) mexe só nesta
 * lista e nos textos.
 */
const HOME_MODES: readonly HomeMode[] = [
  { tab: "song", name: "target.song", hint: "home.songHint" },
  { tab: "album", name: "target.album", hint: "home.albumHint" },
  { tab: "practice", name: "practice.title", hint: "home.practiceHint" },
];

function dailyText(status: DailyStatus): string {
  switch (status.kind) {
    case "unavailable":
      return t("home.statusUnavailable");
    case "new":
      return t("home.statusNew", { number: status.number });
    case "playing":
      return t("home.statusPlaying", {
        number: status.number,
        mode: t(status.answerMode === "choice" ? "mode.choice" : "mode.typing"),
      });
    case "done":
      // Dia todo anulado (P27): "terminado", sem "0 de 0 pontos".
      return status.max === 0
        ? t("home.statusDoneVoid", { number: status.number })
        : t("home.statusDone", { number: status.number, score: status.score, max: status.max });
  }
}

function practiceText(score: PracticeScore | null): string | null {
  if (!score) return null;
  return t("home.practiceSession", {
    score: t("practice.score", {
      points: tn("count.points", score.points),
      rounds: tn("practice.rounds", score.rounds),
    }),
  });
}

/** A home: o nome do jogo, um cartão por modo (com o estado de hoje) e como jogar. */
export function Home({ day, date, save, practice }: Props) {
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
          {HOME_MODES.map(({ tab, name, hint }) => {
            const status = tab === "practice" ? null : dailyStatus(save, day, date, tab);
            const text = status ? dailyText(status) : practiceText(practice);
            // Nome, estado e dica, nessa ordem: o leitor de tela ouve o estado logo.
            const content = (
              <>
                <span class="mode-name">{t(name)}</span>
                {text && <span class="tag">{text}</span>}
                <span class="mode-hint">{t(hint, { rounds: ROUNDS_PER_DAY })}</span>
              </>
            );
            return (
              <li key={tab}>
                {status?.kind === "unavailable" ? (
                  // Sem desafio hoje: não há para onde ir, então o cartão não é link.
                  <div class="mode home-card off">{content}</div>
                ) : (
                  // Link, e não botão: cada cartão leva a outra aba (#musica, #album, #treino).
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
    </div>
  );
}
