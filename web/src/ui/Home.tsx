import type { ComponentChild } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { ANIME_KEYS } from "../core/daily.ts";
import { type ArtistSummary, animeDone, dailyStatus, nextDaily, progress } from "../core/home.ts";
import { mixedIds } from "../core/mixed.ts";
import { quizStatusOf } from "../core/quiz.ts";
import { puzzleId, type Save } from "../core/records.ts";
import { ROUTES } from "../core/routes.ts";
import { MAX_STAGE, MODES, secondsAt } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { t, tAround, tn } from "../i18n/t.ts";
import { WithName } from "./ArtistName.tsx";
import { type Card, CardList, dailyText } from "./cards.tsx";
import { Icon } from "./Icon.tsx";
import { Logo } from "./Logo.tsx";
import { modeName } from "./modes.ts";
import { practiceScoreText } from "./PracticeRun.tsx";
import { singleClick, singleClickLink } from "./singleClick.ts";
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
 * O cartão dos Hits (P226): o estado dos dois diários, uma linha cada. Sem diário no dia, continua
 * link (o Treino está lá dentro), com uma linha só. O oliva saiu dele para o bloco "Agora".
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
  };
}

/**
 * O cartão do Anime (P226): uma linha só, lida do save, porque o Anime carrega só na aba dele (a
 * Início não sabe se há diário hoje). Os diários terminados hoje, ou o em andamento; sem jogo
 * hoje, nenhuma linha. Conta os 6 diários do dia.
 */
function animeCard(save: Save, date: string): Card {
  const { done, playing, total } = progress(
    save,
    ANIME_KEYS.map((key) => puzzleId(date, key)),
  );
  const line =
    done > 0 ? t("home.animeLine", { done, total }) : playing > 0 ? t("home.animePlaying") : null;
  return {
    tab: "anime",
    name: t("anime.title"),
    short: t("home.animeShort"),
    hint: t("home.animeHint"),
    lines: line ? [line] : [],
  };
}

/** Os 2 diários das Misturadas de hoje: os terminados e se algum está em andamento. */
function mixedProgress(save: Save, date: string) {
  const ids = mixedIds(date);
  const done = ids.filter((id) => save.mixed.finished[id] !== undefined).length;
  const playing = ids.some(
    (id) =>
      save.mixed.finished[id] === undefined && (save.mixed.progress[id]?.events.length ?? 0) > 0,
  );
  return { done, playing, total: ids.length };
}

/**
 * O cartão das Misturadas (o usuário, 24/10/2026): ao lado dos Artistas, com uma linha só, lida do
 * save, como o do Anime (a Início não carrega a agenda delas). Os 2 diários de hoje terminados, ou
 * um em andamento; sem jogo hoje, nenhuma linha.
 */
function mixedCard(save: Save, date: string): Card {
  const { done, playing, total } = mixedProgress(save, date);
  const line =
    done > 0 ? t("home.mixedLine", { done, total }) : playing ? t("home.mixedPlaying") : null;
  return {
    tab: "misturadas",
    name: t("mixed.title"),
    short: t("home.mixedShort"),
    hint: t("home.mixedHint"),
    lines: line ? [line] : [],
  };
}

/** A linha da sessão, com o nome do artista na língua dele (ME68). */
function artistsText(summary: ArtistSummary | null): ComponentChild {
  if (!summary) return null;
  // O Superfan conta em músicas, como a partida: "16 pontos em 2 músicas".
  const around = summary.superfan
    ? tAround("home.artistsSuperfan", "artist", {
        points: tn("count.points", summary.score.points),
        songs: tn("superfan.songs", summary.score.rounds),
      })
    : tAround("home.artistsSession", "artist", { score: practiceScoreText(summary.score) });
  return <WithName around={around} name={summary.artist} />;
}

/**
 * O cartão do quiz do dia (M18), ao lado das Misturadas: uma linha só, lida do save, como o delas
 * (a Início não carrega a agenda do quiz). A run de hoje terminada, ou em andamento; sem jogo hoje,
 * nenhuma linha.
 */
function quizCard(save: Save, date: string): Card {
  const status = quizStatusOf(save, date, 0);
  const line =
    status.kind === "done"
      ? t("home.quizLine", { reached: status.reached, right: tn("quiz.right", status.right) })
      : status.kind === "playing"
        ? t("home.quizPlaying")
        : null;
  return {
    tab: "quiz",
    name: t("quiz.title"),
    short: t("home.quizShort"),
    hint: t("home.quizHint"),
    lines: line ? [line] : [],
  };
}

/** O cartão do modo por artista. Sai com o <li> da nav quando o site ficar público (P117). */
function artistsCard(summary: ArtistSummary | null): Card {
  const text = artistsText(summary);
  return {
    tab: "artists",
    wide: true,
    name: t("artists.title"),
    short: t("home.artistsShort"),
    hint: t("home.artistsHint"),
    lines: text ? [text] : [],
  };
}

/** O jogo do bloco "Agora": o nome, o endereço e se ele já está em andamento. */
type NextPlay = { readonly name: string; readonly href: string; readonly playing: boolean };

/**
 * O 1º jogo do dia por jogar, na ordem da nav: os diários dos Hits (o da vez, pela agenda), o Anime
 * (até um de cada modo, P357), as Misturadas (os 2) e o quiz. Null com tudo jogado. A Início não
 * carrega as agendas do Anime, das Misturadas e do quiz: ela os supõe no ar, como os cartões.
 */
function nextPlay(save: Save, day: Day | null, date: string): NextPlay | null {
  const mode = nextDaily(save, day, date);
  if (mode && day) {
    return {
      name: t("home.nextHits", { mode: modeName(mode), number: day.number }),
      href: ROUTES[mode],
      playing: dailyStatus(save, day, date, mode).kind === "playing",
    };
  }
  if (!animeDone(save, date)) {
    const { playing } = progress(
      save,
      ANIME_KEYS.map((key) => puzzleId(date, key)),
    );
    return { name: t("anime.title"), href: ROUTES.anime, playing: playing > 0 };
  }
  const mixed = mixedProgress(save, date);
  if (mixed.done < mixed.total) {
    return { name: t("mixed.title"), href: ROUTES.misturadas, playing: mixed.playing };
  }
  const quiz = quizStatusOf(save, date, 0);
  if (quiz.kind !== "done") {
    return { name: t("quiz.title"), href: ROUTES.quiz, playing: quiz.kind === "playing" };
  }
  return null;
}

/**
 * O bloco "Agora" (o usuário, 27/10/2026): o próximo jogo do dia, o único oliva da tela, um link
 * grande com o Jogar (ou o Continuar). Com tudo jogado, um bloco calmo, sem ação.
 */
function NextBlock({ next }: { readonly next: NextPlay | null }) {
  if (!next) {
    return (
      <section class="home-next done" aria-labelledby="home-next">
        <h2 id="home-next">{t("home.allDone")}</h2>
        <p class="home-next-hint">{t("home.allDoneHint")}</p>
      </section>
    );
  }
  return (
    // O 2º clique de um toque duplo cairia no Tocar do jogo que abriu (regra 23). O nome começa
    // pela ação ("Jogar: Hits · Normal nº 1"), com as mesmas palavras da tela: o leitor de tela
    // ouve o que o link faz, e ele não se confunde com a linha do jogo, que começa pelo nome.
    <a
      class="home-next"
      href={next.href}
      aria-label={t("home.nextLabel", {
        action: t(next.playing ? "home.continue" : "home.play"),
        name: next.name,
      })}
      onClick={singleClickLink}
    >
      <span class="home-next-name">{next.name}</span>
      <span class="home-next-action">
        {t(next.playing ? "home.continue" : "home.play")}
        <Icon name="next" />
      </span>
    </a>
  );
}

/**
 * A home (a revisão do M19, o usuário, 27/10/2026): o selo ao lado do nome, o bloco "Agora" com o
 * próximo jogo, e os jogos em linhas compactas, um por categoria da nav (P226), com o estado de
 * hoje; o "Como funciona" (recolhido), o Sobre e o tema numa linha só. O Histórico fica no Mais da
 * nav. A Início cabe com folga em 360 × 640.
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

      <NextBlock next={nextPlay(save, day, date)} />

      <section aria-labelledby="home-modes">
        <h2 id="home-modes" class="sr-only">
          {t("home.modesTitle")}
        </h2>
        <CardList
          cards={[
            hitsCard(save, day, date),
            animeCard(save, date),
            mixedCard(save, date),
            quizCard(save, date),
            artistsCard(artists),
          ]}
          idPrefix="home"
          single
        />
      </section>

      {/* O "Como funciona", o Sobre (P243) e o tema numa linha só: o Sobre e o tema ficam à direita
          do "Como funciona", que tem o lado livre. Aberto, o texto dele desce na largura toda. */}
      <div class="home-more">
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
        <div class="home-more-end">
          {/* "Sobre" na tela, para a linha caber em 320 px; o nome inteiro para o leitor de tela.
              O 2º clique de um toque duplo cairia no título do Sobre (regra 23). */}
          <a class="home-about" href={ROUTES.about} onClick={singleClickLink}>
            <span aria-hidden="true">{t("home.aboutShort")}</span>
            <span class="sr-only">{t("home.about")}</span>
          </a>
          <ThemeSwitch />
        </div>
      </div>
    </div>
  );
}

/**
 * A troca de tema (P176, P191, P217), no fim da Início: um switch claro e escuro, com o sol e a lua
 * (provisórios, P218). Sem escolha salva, ele mostra o tema do aparelho; a troca vale na hora e
 * fica gravada. É um botão que alterna no mesmo lugar: o 2º clique de um toque duplo não pode
 * voltar o tema (singleClick, regra 23). O h2, como nas outras seções, deixa o "Tema" na
 * navegação por títulos; desde a Início nova, só para o leitor de tela (o sol e a lua dizem o que
 * o switch faz), para a linha do rodapé caber em 320 px (o usuário, 27/10/2026; antes, P259).
 */
function ThemeSwitch() {
  const { theme, followsDevice, toggle } = useTheme();
  return (
    <section class="home-theme" aria-labelledby="home-theme">
      <h2 id="home-theme" class="sr-only">
        {t("home.themeTitle")}
      </h2>
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
