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
  historyDates,
  historyDays,
} from "../core/history.ts";
import { firstToPlay, progress, statusOf } from "../core/home.ts";
import { mixedIds } from "../core/mixed.ts";
import { quizId, quizStatusOf } from "../core/quiz.ts";
import { puzzleId, type Save } from "../core/records.ts";
import { ROUTES, routeHref } from "../core/routes.ts";
import { MODES } from "../core/rules.ts";
import type {
  AnimeDay,
  AnimeSchedule,
  Day,
  MixedDay,
  MixedSchedule,
  QuizDay,
  QuizMonth,
} from "../core/types.ts";
import { pickAnimeDay, pickMixedDay, pickQuizDay, quizMonthOf } from "../data/source.ts";
import { t, tn } from "../i18n/t.ts";
import type { AnimeScheduleLoad } from "./Anime.tsx";
import { type Card, CardList, dailyCard, dailyText, progressText } from "./cards.tsx";
import { dayTitle, longDate, weekdayName, weekdayShort } from "./dayLabel.ts";
import { FocusedNotice } from "./FocusedNotice.tsx";
import { useHeadingFocus } from "./hooks.ts";
import type { MixedLoad } from "./Mixed.tsx";
import { type QuizLoad, type QuizStore, quizLoadOf } from "./Quiz.tsx";
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
  /**
   * Os meses do quiz do dia, guardados no App: o calendário pede os da janela, para a marca do
   * quiz, e a tela de um dia, o mês dela, para o cartão (o usuário, 27/10/2026).
   */
  readonly quiz: QuizStore;
};

/** Um mês do quiz na tela: o mês, null sem quiz nele, ou "failed" (falhou ou é de versão nova). */
type QuizMonthView = QuizMonth | null | "failed";

/** O mês ainda espera: nunca pedido, carregando, ou falhou antes de ser pedido nesta abertura. */
function waits(load: QuizLoad, asked: boolean): boolean {
  return load.status === "idle" || load.status === "loading" || (load.status === "retry" && !asked);
}

/**
 * Pede os meses do quiz uma vez por abertura do Histórico, como as agendas, e diz se a tela ainda
 * espera por eles. O que falhou, ainda não pedido nesta abertura, também espera: senão a tela
 * aparece por um quadro sem ele, e o foco pula do título ao aviso e de volta. O mês de hoje vem
 * antes: a estreia dele (o `epoch`) diz desde quando há arquivo, e o mês de antes dela não se pede
 * (o 404 sujaria o console; o usuário, 27/10/2026). Sem o arquivo do mês de hoje, nenhum mês tem
 * quiz: só aconteceria com a agenda do quiz acabada, e a `catalog-runway` avisa antes.
 */
function useQuizMonths(
  quiz: QuizStore,
  today: string,
  months: readonly string[],
): ReadonlyMap<string, QuizMonthView> | "waiting" {
  const asked = useRef(new Set<string>());
  const base = quizMonthOf(today);
  const baseLoad = quizLoadOf(quiz, base);
  const first =
    baseLoad.status === "ready" && baseLoad.month ? quizMonthOf(baseLoad.month.epoch) : null;
  const wanted =
    baseLoad.status === "ready"
      ? months.filter((month) => first !== null && month >= first)
      : [base];
  const key = wanted.join(" ");
  useEffect(() => {
    for (const month of key ? key.split(" ") : []) {
      if (asked.current.has(month)) continue;
      asked.current.add(month);
      const status = quizLoadOf(quiz, month).status;
      if (status === "idle" || status === "retry") quiz.request(month);
    }
  }, [key, quiz]);
  if (waits(baseLoad, asked.current.has(base))) return "waiting";
  const views = new Map<string, QuizMonthView>();
  for (const month of months) {
    if (baseLoad.status !== "ready") {
      views.set(month, "failed");
      continue;
    }
    // Antes da estreia (ou sem o mês de hoje), não há quiz: nem se pede.
    if (!wanted.includes(month)) {
      views.set(month, null);
      continue;
    }
    const load = quizLoadOf(quiz, month);
    if (waits(load, asked.current.has(month))) return "waiting";
    views.set(month, load.status === "ready" ? load.month : "failed");
  }
  return views;
}

/** Os meses que a janela do calendário cruza (1 ou 2). */
function windowMonths(today: string): string[] {
  return [...new Set(historyDates(today).map(quizMonthOf))];
}

/**
 * Os dias com quiz nos meses da janela; null quando algum deles falhou: o calendário fica sem a
 * marca do quiz, como sem a agenda do Anime.
 */
function quizDatesOf(views: ReadonlyMap<string, QuizMonthView>): ReadonlySet<string> | null {
  const dates = new Set<string>();
  for (const view of views.values()) {
    if (view === "failed") return null;
    for (const date of Object.keys(view?.days ?? {})) dates.add(date);
  }
  return dates;
}

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
 * O Histórico: espera as agendas do Anime e das Misturadas e os meses do quiz (com o aviso e o
 * foco, regra 16) e
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
  quiz,
}: HistoryProps) {
  const waitingAnime = useScheduleRequest(anime.status, requestAnime);
  const waitingMixed = useScheduleRequest(mixed.status, requestMixed);
  const quizMonths = useQuizMonths(
    quiz,
    today,
    date === null ? windowMonths(today) : [quizMonthOf(date)],
  );
  if (waitingAnime || waitingMixed || quizMonths === "waiting") {
    return (
      <div class="loading screen" key="history-loading">
        <FocusedNotice text={t("load.loading")} />
      </div>
    );
  }
  const schedule = anime.status === "ready" ? anime.schedule : null;
  const mixedSchedule = mixed.status === "ready" ? mixed.schedule : null;
  // A key remonta a tela ao trocar de dia (o Voltar do navegador): o foco volta ao título.
  if (date === null) {
    return (
      <HistoryCalendar
        save={save}
        today={today}
        hitsDates={hitsDates}
        animeSchedule={schedule}
        mixedSchedule={mixedSchedule}
        quizDates={quizDatesOf(quizMonths)}
      />
    );
  }
  const quizMonth = quizMonths.get(quizMonthOf(date)) ?? null;
  return (
    <HistoryDayScreen
      key={date}
      date={date}
      day={hitsDay}
      save={save}
      animeSchedule={schedule}
      mixedSchedule={mixedSchedule}
      quizMonth={quizMonth === "failed" ? null : quizMonth}
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

/** O que a marca do quiz diz: uma run por dia, sem meia marca (a terminada é o ponto cheio). */
const QUIZ_MARK_TEXT = {
  all: "history.quizAll",
  some: "history.quizAll",
  none: "history.quizNone",
  off: "history.quizOff",
} as const satisfies Record<CategoryMark, string>;

/** O nome do dia no calendário: o dia da semana, a data e o que foi jogado, categoria a categoria. */
function cellName(day: HistoryDay): string {
  const params = { weekday: weekdayName(day.weekday), date: longDate(day.date) };
  if (!hasDaily(day)) return t("history.cellOff", params);
  const marks = [
    t(HITS_MARK_TEXT[day.hits]),
    ...(day.anime === null ? [] : [t(ANIME_MARK_TEXT[day.anime])]),
    ...(day.mixed === null ? [] : [t(MIXED_MARK_TEXT[day.mixed])]),
    ...(day.quiz === null ? [] : [t(QUIZ_MARK_TEXT[day.quiz])]),
  ].join(t("history.marksJoin"));
  return t("history.cellName", { ...params, marks });
}

/**
 * A marca de uma categoria (P260), um ponto: cheio com tudo, meio cheio com parte, nada sem nenhum,
 * fora da agenda ou sem ela (o ✓ de antes não cabia em 4, o usuário, 27/10/2026). Só na tela: o
 * nome do dia diz o mesmo ao leitor de tela.
 */
function Mark({ mark }: { readonly mark: CategoryMark | null }) {
  if (mark === "all") return <span class="mark mark-all" />;
  if (mark === "some") return <span class="mark mark-some" />;
  return null;
}

/** As 4 marcas de um dia, na ordem dos cantos: Hits, Anime, Misturadas e quiz. */
type CornerMarks = readonly [
  CategoryMark | null,
  CategoryMark | null,
  CategoryMark | null,
  CategoryMark | null,
];

/**
 * As marcas de um dia numa grade 2×2, cada categoria no seu canto, sempre o mesmo (P277): os Hits
 * em cima à esquerda, o Anime em cima à direita, as Misturadas embaixo à esquerda e o quiz embaixo
 * à direita (o usuário, 27/10/2026). O canto vazio guarda o lugar.
 */
function Corners({ marks }: { readonly marks: CornerMarks }) {
  return (
    <span class="calendar-marks" aria-hidden="true">
      {/* Os 4 cantos são fixos: o índice é a chave. */}
      {marks.map((mark, corner) => (
        <span key={corner} class="mark-slot">
          <Mark mark={mark} />
        </span>
      ))}
    </span>
  );
}

/** Os 4 cantos da legenda: em cada um, só o ponto da categoria daquele canto. */
const LEGEND_CORNERS: readonly CornerMarks[] = [
  ["all", null, null, null],
  [null, "all", null, null],
  [null, null, "all", null],
  [null, null, null, "all"],
];

/** A legenda: o canto de cada categoria, e o que o ponto cheio e o meio cheio dizem. */
function Legend() {
  const names = [
    t("history.legendHits"),
    t("history.legendAnime"),
    t("history.legendMixed"),
    t("history.legendQuiz"),
  ];
  return (
    <div class="calendar-legends" aria-hidden="true">
      <p class="calendar-legend">
        {names.map((name, index) => (
          <span key={name} class="calendar-legend-item">
            <Corners marks={LEGEND_CORNERS[index] ?? [null, null, null, null]} /> {name}
          </span>
        ))}
      </p>
      <p class="calendar-legend">
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
  /** Os dias com quiz nos meses da janela; null quando algum falhou (sem a marca do quiz). */
  readonly quizDates: ReadonlySet<string> | null;
};

/** Os dias de uma agenda, ou null sem ela. */
function datesOf(schedule: { readonly days: object } | null): ReadonlySet<string> | null {
  return schedule ? new Set(Object.keys(schedule.days)) : null;
}

/**
 * O calendário (P260): 2 linhas de 7. Como os dias são seguidos, cada coluna tem o mesmo dia da
 * semana, que vai no cabeçalho. O dia com diário (dos Hits, do Anime, das Misturadas ou do quiz) é link
 * para a tela dele; o sem diário, apagado.
 */
export function HistoryCalendar({
  save,
  today,
  hitsDates,
  animeSchedule,
  mixedSchedule,
  quizDates,
}: CalendarProps) {
  const heading = useHeadingFocus();
  const animeDates = useMemo(() => datesOf(animeSchedule), [animeSchedule]);
  const mixedDates = useMemo(() => datesOf(mixedSchedule), [mixedSchedule]);
  const days = historyDays(save, today, hitsDates, animeDates, HISTORY_DAYS, mixedDates, quizDates);
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
                <Corners marks={[day.hits, day.anime, day.mixed, day.quiz]} />
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
      <Legend />
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
  /** O mês do quiz do dia; null quando ele falhou ou não existe (a tela fica sem o cartão). */
  readonly quizMonth: QuizMonth | null;
};

/**
 * O cartão do quiz do dia na tela de um dia (o usuário, 26/10/2026), ao lado do das Misturadas,
 * como na Início (sem elas, na linha toda): a rodada alcançada e os acertos, o andamento ou o novo,
 * e o link para a run daquele dia. Sem o dia no mês do quiz, o cartão não aparece (o quiz começou
 * em 25/10/2026).
 */
function quizDayCard(save: Save, date: string, day: QuizDay, next: boolean, wide: boolean): Card {
  const status = quizStatusOf(save, date, day.number);
  const lines =
    status.kind === "done"
      ? [
          t("history.quizLine", { reached: status.reached, right: tn("quiz.right", status.right) }),
          ...(status.late ? [t("history.late")] : []),
        ]
      : [
          status.kind === "playing"
            ? t("home.statusPlaying", { number: day.number })
            : t("home.statusNew", { number: day.number }),
        ];
  return {
    tab: "quiz",
    href: routeHref({ tab: "quiz", date }),
    name: t("quiz.title"),
    short: t("home.quizShort"),
    hint: t("home.quizHint"),
    lines,
    next,
    wide,
  };
}

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
 * O cartão das Misturadas na tela de um dia, na linha toda, como o do Anime, ou, com o quiz do
 * dia, ao lado dele (como na Início, para a tela caber): quantos dos 2 diários terminaram, e o
 * link para a escolha do modo daquele dia. Fora da agenda, apagado.
 */
function mixedDayCard(
  save: Save,
  date: string,
  day: MixedDay | null,
  next: boolean,
  wide: boolean,
): Card {
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
    wide,
  };
}

/**
 * A tela de um dia (P261): os dois diários dos Hits, cada um com o resultado (que abre o resumo)
 * ou o jogar, e os cartões do Anime e das Misturadas. O jogado depois leva a marca numa linha a
 * mais (P263). O 1º por jogar é o oliva: um dos Hits, depois o Anime, depois as Misturadas.
 */
export function HistoryDayScreen({
  date,
  day,
  save,
  animeSchedule,
  mixedSchedule,
  quizMonth,
}: DayProps) {
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
  const quizDay = pickQuizDay(quizMonth, date);
  if (mixedSchedule) {
    const mixedDay = pickMixedDay(mixedSchedule, date);
    const left = mixedIds(date).some((id) => !save.mixed.finished[id]);
    const mixedNext = !taken && mixedDay !== null && left;
    taken ||= mixedNext;
    cards.push(mixedDayCard(save, date, mixedDay, mixedNext, quizDay === null));
  }
  if (quizDay) {
    const quizNext = !taken && !save.quiz.finished[quizId(date)];
    cards.push(quizDayCard(save, date, quizDay, quizNext, mixedSchedule === null));
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
