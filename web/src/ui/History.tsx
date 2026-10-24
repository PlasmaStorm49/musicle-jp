// O Histórico (M15, ME104): o calendário dos 14 dias antes de hoje (P260) e a tela de cada dia,
// com os diários dele (P261): os dos Hits, os do Anime e os das Misturadas (o usuário, 24/10/2026).
// Só o diário não jogado se joga daqui, e o jogado depois não conta nas estatísticas nem nas
// medalhas (P262, P263). Lê só o save e as agendas (as do Anime e das Misturadas, sem o catálogo,
// P270): nada aqui consulta a Apple.
import { useEffect, useMemo, useRef } from "preact/hooks";
import { ANIME_KEYS, hitsDailies, hitsDaily } from "../core/daily.ts";
import {
  type CategoryMark,
  HISTORY_DAYS,
  type HistoryDay,
  hasDaily,
  historyDays,
} from "../core/history.ts";
import { firstToPlay, progress, statusOf } from "../core/home.ts";
import { mixedIds } from "../core/mixed.ts";
import { puzzleId, type Save } from "../core/records.ts";
import { ROUTES, routeHref } from "../core/routes.ts";
import { MODES } from "../core/rules.ts";
import type { AnimeDay, AnimeSchedule, Day, MixedDay, MixedSchedule } from "../core/types.ts";
import { pickAnimeDay, pickMixedDay } from "../data/source.ts";
import { t } from "../i18n/t.ts";
import type { AnimeScheduleLoad } from "./Anime.tsx";
import { type Card, CardList, dailyCard, dailyText, progressText } from "./cards.tsx";
import { dayTitle, longDate, weekdayName, weekdayShort } from "./dayLabel.ts";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { useHeadingFocus } from "./hooks.ts";
import type { MixedLoad } from "./Mixed.tsx";
import { singleClickLink } from "./singleClick.ts";

type HistoryProps = {
  /** O dia passado da rota; null é o calendário. */
  readonly date: string | null;
  /** O "hoje" do jogo. */
  readonly today: string;
  readonly save: Save;
  /** Os dias da agenda dos Hits. */
  readonly hitsDates: ReadonlySet<string>;
  /** O dia da rota na agenda dos Hits (null fora dela). */
  readonly hitsDay: Day | null;
  /** A agenda do Anime (só ela, P270), da carga guardada no App. */
  readonly anime: AnimeScheduleLoad;
  readonly requestAnime: () => void;
  /** A agenda das Misturadas, da carga guardada no App. */
  readonly mixed: MixedLoad;
  readonly requestMixed: () => void;
};

/**
 * Pede uma agenda (a do Anime ou a das Misturadas) uma vez por abertura do Histórico, e diz se a
 * tela ainda espera por ela. A que falhou, ainda não pedida nesta abertura, também espera: senão o
 * calendário aparece por um quadro, e o foco pula do título ao aviso e de volta ao título.
 */
function useScheduleRequest(status: string, request: () => void): boolean {
  const asked = useRef(false);
  const waiting =
    status === "idle" || status === "loading" || (status === "retry" && !asked.current);
  useEffect(() => {
    if (asked.current) return;
    if (status === "idle" || status === "retry") {
      asked.current = true;
      request();
    }
  }, [status, request]);
  return waiting;
}

/**
 * O Histórico: espera as agendas do Anime e das Misturadas (com o aviso e o foco, regra 16) e
 * mostra o calendário ou a tela de um dia. A agenda que falhar ou vier de uma versão nova fica de
 * fora, e o resto aparece. A que falhou é pedida de novo uma vez a cada abertura do Histórico (uma
 * vez só: senão, sem rede, o pedido se repetiria sem parar).
 */
export function History({
  date,
  today,
  save,
  hitsDates,
  hitsDay,
  anime,
  requestAnime,
  mixed,
  requestMixed,
}: HistoryProps) {
  const waitingAnime = useScheduleRequest(anime.status, requestAnime);
  const waitingMixed = useScheduleRequest(mixed.status, requestMixed);
  if (waitingAnime || waitingMixed) {
    return (
      <div class="loading screen" key="history-loading">
        <FocusedNotice text={t("load.loading")} />
      </div>
    );
  }
  const schedule = anime.status === "ready" ? anime.schedule : null;
  const mixedSchedule = mixed.status === "ready" ? mixed.schedule : null;
  // A key remonta a tela ao trocar de dia (o Voltar do navegador): o foco volta ao título.
  return date === null ? (
    <HistoryCalendar
      save={save}
      today={today}
      hitsDates={hitsDates}
      animeSchedule={schedule}
      mixedSchedule={mixedSchedule}
    />
  ) : (
    <HistoryDayScreen
      key={date}
      date={date}
      day={hitsDay}
      save={save}
      animeSchedule={schedule}
      mixedSchedule={mixedSchedule}
    />
  );
}

/** O que a marca dos Hits diz, para o leitor de tela. */
const HITS_MARK_TEXT = {
  all: "history.hitsAll",
  some: "history.hitsSome",
  none: "history.hitsNone",
  off: "history.hitsOff",
} as const satisfies Record<CategoryMark, string>;

/** O que a marca do Anime diz: ele não tem meia marca (ao menos 1 dos 6 já é o ✓, P247). */
const ANIME_MARK_TEXT = {
  all: "history.animeAll",
  some: "history.animeAll",
  none: "history.animeNone",
  off: "history.animeOff",
} as const satisfies Record<CategoryMark, string>;

/** O que a marca das Misturadas diz: os 2 diários, como nos Hits. */
const MIXED_MARK_TEXT = {
  all: "history.mixedAll",
  some: "history.mixedSome",
  none: "history.mixedNone",
  off: "history.mixedOff",
} as const satisfies Record<CategoryMark, string>;

/** O nome do dia no calendário: o dia da semana, a data e o que foi jogado, categoria a categoria. */
function cellName(day: HistoryDay): string {
  const params = { weekday: weekdayName(day.weekday), date: longDate(day.date) };
  if (!hasDaily(day)) return t("history.cellOff", params);
  const marks = [
    t(HITS_MARK_TEXT[day.hits]),
    ...(day.anime === null ? [] : [t(ANIME_MARK_TEXT[day.anime])]),
    ...(day.mixed === null ? [] : [t(MIXED_MARK_TEXT[day.mixed])]),
  ].join(t("history.marksJoin"));
  return t("history.cellName", { ...params, marks });
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

/**
 * As marcas de um dia (P277): os Hits à esquerda, o Anime no meio e as Misturadas à direita, cada
 * um no seu lugar (o vazio guarda a posição). Sem uma agenda, sem a marca dela.
 */
function DayMarks({ day }: { readonly day: HistoryDay }) {
  return (
    <span class="calendar-marks" aria-hidden="true">
      <span class="mark-slot">{day.hits !== "off" && <Mark mark={day.hits} />}</span>
      {day.anime !== null && (
        <span class="mark-slot">{day.anime !== "off" && <Mark mark={day.anime} />}</span>
      )}
      {day.mixed !== null && (
        <span class="mark-slot">{day.mixed !== "off" && <Mark mark={day.mixed} />}</span>
      )}
    </span>
  );
}

/**
 * A legenda: com o Anime ou as Misturadas, uma linha por categoria, com o lugar de cada uma
 * (P277). As Misturadas têm 2 diários, como os Hits: a mesma meia marca.
 */
function Legend({ anime, mixed }: { readonly anime: boolean; readonly mixed: boolean }) {
  const pair = (
    <>
      <span class="calendar-legend-item">
        <Mark mark="all" /> {t("history.legendAll")}
      </span>
      <span class="calendar-legend-item">
        <Mark mark="some" /> {t("history.legendSome")}
      </span>
    </>
  );
  if (!anime && !mixed) {
    return (
      <p class="calendar-legend" aria-hidden="true">
        {pair}
      </p>
    );
  }
  return (
    <div class="calendar-legends" aria-hidden="true">
      <p class="calendar-legend">
        <span>{t("history.legendHits")}</span>
        {pair}
      </p>
      {anime && (
        <p class="calendar-legend">
          <span>{t(mixed ? "history.legendAnimeMiddle" : "history.legendAnime")}</span>
          <span class="calendar-legend-item">
            <Mark mark="all" /> {t("history.legendAnimeAll")}
          </span>
        </p>
      )}
      {mixed && (
        <p class="calendar-legend">
          <span>{t("history.legendMixed")}</span>
          {pair}
        </p>
      )}
    </div>
  );
}

type CalendarProps = {
  readonly save: Save;
  /** O "hoje" do jogo: o calendário vai de hoje − 14 a ontem. */
  readonly today: string;
  /** Os dias da agenda dos Hits: fora dela, o dia não tem diário. */
  readonly hitsDates: ReadonlySet<string>;
  /** A agenda do Anime; null quando ela falhou (o calendário fica sem a marca dele). */
  readonly animeSchedule: AnimeSchedule | null;
  /** A agenda das Misturadas; null quando ela falhou (o calendário fica sem a marca delas). */
  readonly mixedSchedule: MixedSchedule | null;
};

/** Os dias de uma agenda, ou null sem ela. */
function datesOf(schedule: { readonly days: object } | null): ReadonlySet<string> | null {
  return schedule ? new Set(Object.keys(schedule.days)) : null;
}

/**
 * O calendário (P260): 2 linhas de 7. Como os dias são seguidos, cada coluna tem o mesmo dia da
 * semana, que vai no cabeçalho. O dia com diário (dos Hits, do Anime ou das Misturadas) é link
 * para a tela dele; o sem diário, apagado.
 */
export function HistoryCalendar({
  save,
  today,
  hitsDates,
  animeSchedule,
  mixedSchedule,
}: CalendarProps) {
  const heading = useHeadingFocus();
  const animeDates = useMemo(() => datesOf(animeSchedule), [animeSchedule]);
  const mixedDates = useMemo(() => datesOf(mixedSchedule), [mixedSchedule]);
  const days = historyDays(save, today, hitsDates, animeDates, HISTORY_DAYS, mixedDates);
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
                <DayMarks day={day} />
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
      <Legend anime={animeDates !== null} mixed={mixedDates !== null} />
    </div>
  );
}

type DayProps = {
  /** O dia passado, de hoje − 14 a ontem (a rota já conferiu, P262). */
  readonly date: string;
  /** O dia na agenda dos Hits; null quando não há. */
  readonly day: Day | null;
  readonly save: Save;
  /** A agenda do Anime; null quando ela falhou (a tela fica sem o cartão dele). */
  readonly animeSchedule: AnimeSchedule | null;
  /** A agenda das Misturadas; null quando ela falhou (a tela fica sem o cartão delas). */
  readonly mixedSchedule: MixedSchedule | null;
};

/**
 * O cartão do Anime na tela de um dia (P261), na linha toda: quantos dos 6 diários terminaram,
 * e o link para as telas do Anime daquele dia. Fora da agenda do Anime, apagado.
 */
function animeDayCard(save: Save, date: string, day: AnimeDay | null, next: boolean): Card {
  const done = progress(
    save,
    ANIME_KEYS.map((key) => puzzleId(date, key)),
  );
  return {
    tab: "anime",
    href: routeHref({ tab: "anime", date }),
    name: t("anime.title"),
    short: t("home.animeShort"),
    hint: t("home.animeHint"),
    lines: [day ? progressText(done) : t("history.animeUnavailable")],
    next,
    off: day === null,
    wide: true,
  };
}

/**
 * O cartão das Misturadas na tela de um dia, na linha toda, como o do Anime: quantos dos 2
 * diários terminaram, e o link para a escolha do modo daquele dia. Fora da agenda, apagado.
 */
function mixedDayCard(save: Save, date: string, day: MixedDay | null, next: boolean): Card {
  const ids = mixedIds(date);
  const done = ids.filter((id) => save.mixed.finished[id] !== undefined).length;
  const playing = ids.filter(
    (id) =>
      save.mixed.finished[id] === undefined && (save.mixed.progress[id]?.events.length ?? 0) > 0,
  ).length;
  return {
    tab: "misturadas",
    href: routeHref({ tab: "misturadas", date }),
    name: t("mixed.title"),
    short: t("home.mixedShort"),
    hint: t("home.mixedHint"),
    lines: [
      day ? progressText({ done, playing, total: ids.length }) : t("history.mixedUnavailable"),
    ],
    next,
    off: day === null,
    wide: true,
  };
}

/**
 * A tela de um dia (P261): os dois diários dos Hits, cada um com o resultado (que abre o resumo)
 * ou o jogar, e os cartões do Anime e das Misturadas. O jogado depois leva a marca numa linha a
 * mais (P263). O 1º por jogar é o oliva: um dos Hits, depois o Anime, depois as Misturadas.
 */
export function HistoryDayScreen({ date, day, save, animeSchedule, mixedSchedule }: DayProps) {
  const heading = useHeadingFocus();
  const dailies = day ? hitsDailies(day, date) : [];
  const next = firstToPlay(save, dailies)?.key;
  const animeDay = animeSchedule ? pickAnimeDay(animeSchedule, date) : null;
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
  let taken = next !== undefined;
  if (animeSchedule) {
    const left = ANIME_KEYS.some((key) => !save.history[puzzleId(date, key)]);
    const animeNext = !taken && animeDay !== null && left;
    taken ||= animeNext;
    cards.push(animeDayCard(save, date, animeDay, animeNext));
  }
  if (mixedSchedule) {
    const mixedDay = pickMixedDay(mixedSchedule, date);
    const left = mixedIds(date).some((id) => !save.mixed.finished[id]);
    cards.push(mixedDayCard(save, date, mixedDay, !taken && mixedDay !== null && left));
  }
  return (
    <div class="game practice history-day screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {dayTitle(date)}
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
