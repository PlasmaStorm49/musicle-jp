// O Histórico (M15, ME104): o calendário dos 14 dias antes de hoje (P260) e a tela de cada dia,
// com os diários dele (P261). Só o diário não jogado se joga daqui, e o jogado depois não conta
// nas estatísticas (P262, P263). Lê só o save e a agenda: nada aqui consulta a Apple.
import { hitsDailies, hitsDaily } from "../core/daily.ts";
import { dayParts, type Weekday, weekdayOf } from "../core/dates.ts";
import {
  type CategoryMark,
  HISTORY_DAYS,
  type HistoryDay,
  hasDaily,
  historyDays,
} from "../core/history.ts";
import { firstToPlay, statusOf } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { ROUTES, routeHref } from "../core/routes.ts";
import { MODES } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { t } from "../i18n/t.ts";
import { type Card, CardList, dailyCard, dailyText } from "./cards.tsx";
import { useHeadingFocus } from "./hooks.ts";
import { singleClickLink } from "./singleClick.ts";

/** "21/10", com os dois dígitos. */
function shortDate(date: string): string {
  const { day, month } = dayParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return t("history.date", { day: pad(day), month: pad(month) });
}

/** O mês por extenso: as chaves de 1 a 12 existem no pt-BR (o tipo confere). */
type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** "21 de outubro", para o leitor de tela. */
function longDate(date: string): string {
  const { day, month } = dayParts(date);
  return t("history.dateLong", { day, month: t(`history.month.${month as Month}`) });
}

function weekdayShort(weekday: Weekday): string {
  return t(`history.weekdayShort.${weekday}`);
}

function weekdayName(weekday: Weekday): string {
  return t(`history.weekday.${weekday}`);
}

/** O que a marca dos Hits diz, para o leitor de tela. */
const HITS_MARK_TEXT = {
  all: "history.hitsAll",
  some: "history.hitsSome",
  none: "history.hitsNone",
  off: "history.hitsOff",
} as const satisfies Record<CategoryMark, string>;

/** O nome do dia no calendário: o dia da semana, a data e o que foi jogado. */
function cellName(day: HistoryDay): string {
  const params = { weekday: weekdayName(day.weekday), date: longDate(day.date) };
  if (!hasDaily(day)) return t("history.cellOff", params);
  return t("history.cellName", { ...params, marks: t(HITS_MARK_TEXT[day.hits]) });
}

/**
 * A marca de uma categoria (P260): o ✓ com tudo, a meia-lua com parte, nada sem nenhum. Só na
 * tela: o nome do dia diz o mesmo ao leitor de tela.
 */
function Mark({ mark }: { readonly mark: CategoryMark }) {
  if (mark === "all") return <span class="mark mark-all">{t("nav.doneMark")}</span>;
  if (mark === "some") return <span class="mark mark-some" />;
  return <span class="mark mark-none" />;
}

type CalendarProps = {
  readonly save: Save;
  /** O "hoje" do jogo: o calendário vai de hoje − 14 a ontem. */
  readonly today: string;
  /** Os dias da agenda dos Hits: fora dela, o dia não tem diário. */
  readonly hitsDates: ReadonlySet<string>;
};

/**
 * O calendário (P260): 2 linhas de 7. Como os dias são seguidos, cada coluna tem o mesmo dia da
 * semana, que vai no cabeçalho. O dia com diário é link para a tela dele; o sem diário, apagado.
 * Até o Anime entrar no Histórico (o PR 3 do M15), só a marca dos Hits.
 */
export function HistoryCalendar({ save, today, hitsDates }: CalendarProps) {
  const heading = useHeadingFocus();
  const days = historyDays(save, today, hitsDates, null);
  return (
    <div class="game practice history screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("history.title")}
        </h1>
        <p class="hint">{t("history.hint", { days: HISTORY_DAYS })}</p>
      </header>
      <div class="calendar">
        {/* O cabeçalho só na tela: o nome de cada dia já diz o dia da semana. */}
        <div class="calendar-weekdays" aria-hidden="true">
          {days.slice(0, 7).map((day) => (
            <span key={day.weekday} class="calendar-weekday">
              {weekdayShort(day.weekday)}
            </span>
          ))}
        </div>
        <ol class="calendar-days">
          {days.map((day) => {
            const content = (
              <>
                <span class="calendar-num" aria-hidden="true">
                  {day.day}
                </span>
                <span class="calendar-marks" aria-hidden="true">
                  {day.hits !== "off" && <Mark mark={day.hits} />}
                </span>
              </>
            );
            return (
              <li key={day.date}>
                {hasDaily(day) ? (
                  <a
                    class="calendar-day"
                    href={routeHref({ tab: "history", date: day.date })}
                    aria-label={cellName(day)}
                    // O 2º clique de um toque duplo cairia num cartão da tela do dia (regra 23).
                    onClick={singleClickLink}
                  >
                    {content}
                  </a>
                ) : (
                  <span class="calendar-day off">
                    {content}
                    <span class="sr-only">{cellName(day)}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <p class="calendar-legend" aria-hidden="true">
        <span class="calendar-legend-item">
          <Mark mark="all" /> {t("history.legendAll")}
        </span>
        <span class="calendar-legend-item">
          <Mark mark="some" /> {t("history.legendSome")}
        </span>
      </p>
    </div>
  );
}

type DayProps = {
  /** O dia passado, de hoje − 14 a ontem (a rota já conferiu, P262). */
  readonly date: string;
  /** O dia na agenda dos Hits; null quando não há. */
  readonly day: Day | null;
  readonly save: Save;
};

/**
 * A tela de um dia (P261): os dois diários dos Hits, cada um com o resultado (que abre o resumo)
 * ou o jogar. O jogado depois leva a marca numa linha a mais (P263). O 1º por jogar é o oliva.
 */
export function HistoryDayScreen({ date, day, save }: DayProps) {
  const heading = useHeadingFocus();
  const dailies = day ? hitsDailies(day, date) : [];
  const next = firstToPlay(save, dailies)?.key;
  const cards: Card[] = MODES.map((mode) => {
    const status = statusOf(save, day ? hitsDaily(day, date, mode) : null);
    const card = dailyCard(mode, status, mode === next);
    const line = status.kind === "unavailable" ? t("history.unavailable") : dailyText(status);
    return {
      ...card,
      href: routeHref({ tab: mode, date }),
      lines: status.kind === "done" && status.late ? [line, t("history.late")] : [line],
    };
  });
  const weekday = weekdayOf(date);
  return (
    <div class="game practice history-day screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("history.dayTitle", { weekday: weekdayName(weekday), date: shortDate(date) })}
        </h1>
        <p class="hint">{t("history.dayHint")}</p>
      </header>
      <CardList cards={cards} idPrefix="history-day" />
      {/* O 2º clique de um toque duplo cairia num dia do calendário (regra 23). */}
      <a class="history-back" href={ROUTES.history} onClick={singleClickLink}>
        {t("history.back")}
      </a>
    </div>
  );
}
