// Os cartões que levam a outra aba, na Início (um por categoria, P226) e na tela dos Hits (os
// dois diários e o Treino, P225): o nome, o estado em linhas curtas e a dica curta na tela, com a
// inteira para o leitor de tela (P210).
import type { ComponentChild } from "preact";
import type { DailyStatus, PracticeSummary, Progress } from "../core/home.ts";
import { ROUTES, type Tab } from "../core/routes.ts";
import { MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { Target } from "../core/types.ts";
import { t } from "../i18n/t.ts";
import { Icon } from "./Icon.tsx";
import { modeName } from "./modes.ts";
import { practiceScoreText } from "./PracticeRun.tsx";

export type Card = {
  readonly tab: Exclude<Tab, "home">;
  /** Outro endereço que o da aba: o diário de um dia passado (`#normal/AAAA-MM-DD`, P261). */
  readonly href?: string;
  readonly name: string;
  /** A dica curta, na tela (P210). */
  readonly short: string;
  /** A dica inteira, para o leitor de tela. */
  readonly hint: string;
  /**
   * O estado e o placar, uma linha cada; nenhuma, sem nada a dizer. Texto, ou um nó quando parte
   * dele leva outra língua (o nome do artista, ME68).
   */
  readonly lines: readonly ComponentChild[];
  /** O jogo por jogar: o cartão oliva, a ação da tela. */
  readonly next?: boolean;
  /** Sem para onde ir (o diário sem dia na agenda): o cartão não é link. */
  readonly off?: boolean;
  /** O cartão ocupa a linha toda da grade (o Treino, nos Hits). */
  readonly wide?: boolean;
};

/**
 * O estado do diário numa linha curta, na linha dos Hits na Início ("novo", "✓ 18 de 30
 * pontos").
 */
export function dailyShortText(status: DailyStatus): string {
  switch (status.kind) {
    case "unavailable":
      return t("home.statusUnavailable");
    case "new":
      return t("home.lineNew");
    case "playing":
      return t("home.linePlaying");
    case "done":
      // Dia todo anulado (P27): "terminado", sem "0 de 0 pontos".
      return status.max === 0
        ? t("home.lineDoneVoid")
        : t("home.lineDone", { score: status.score, max: status.max });
  }
}

/**
 * O estado do diário no cartão dele, com a ação (o usuário, 28/10/2026): "Novo · Jogar", "Em
 * andamento · Continuar" e, no terminado, o ✓ verde com os pontos e o "Ver o resultado". Sem o
 * número do diário, que não diz nada ao jogador.
 */
export function dailyText(status: DailyStatus): ComponentChild {
  switch (status.kind) {
    case "unavailable":
      return t("home.statusUnavailable");
    case "new":
      return t("home.statusNew");
    case "playing":
      return t("home.statusPlaying");
    case "done":
      return (
        <span class="tag-done">
          <Icon name="right" />
          {/* Dia todo anulado (P27): "Terminado", sem "0 de 0 pontos". */}
          {status.max === 0
            ? t("home.statusDoneVoid")
            : t("home.statusDone", { score: status.score, max: status.max })}
        </span>
      );
  }
}

/**
 * O estado de um grupo de diários do Anime, numa linha: novos, em andamento ou quantos
 * terminaram. Os 3 de um modo, e os 6 de um dia passado no Histórico.
 */
export function progressText({ done, playing, total }: Progress): string {
  if (done > 0) return t("anime.modeDone", { done, total });
  if (playing > 0) return t("anime.modePlaying");
  return t("anime.modeNew", { total });
}

/** O cartão de um diário, o Normal ou o Desafio, com o estado de hoje. */
export function dailyCard(mode: Target, status: DailyStatus, next: boolean): Card {
  return {
    tab: mode,
    name: modeName(mode),
    short: t(`home.${mode}Short`),
    hint: t(`home.${mode}Hint`, { rounds: ROUNDS_PER_DAY, total: MODE_RULES[mode].maxAttempts }),
    lines: [dailyText(status)],
    next,
    off: status.kind === "unavailable",
  };
}

/** O cartão do Treino, com o modo e o placar da sessão (P106), na linha toda. */
export function practiceCard(summary: PracticeSummary | null): Card {
  return {
    tab: "practice",
    name: t("practice.title"),
    short: t("home.practiceShort"),
    hint: t("home.practiceHint"),
    lines: summary
      ? [
          t("home.practiceSession", {
            mode: modeName(summary.target),
            score: practiceScoreText(summary.score),
          }),
        ]
      : [],
    wide: true,
  };
}

type ListProps = {
  readonly cards: readonly Card[];
  /** O começo dos ids de cada tela: nenhum id igual a uma rota (regra 17). */
  readonly idPrefix: string;
  /** Uma coluna só, com os cartões na largura toda (a Início). */
  readonly single?: boolean;
};

/**
 * A lista dos cartões. Cada um é um link para a sua aba, e não um botão; a dica inteira vem como
 * descrição. Nome, estado e dica curta, nessa ordem: o leitor de tela ouve o estado logo, e o nome
 * do link tem tudo o que aparece nele (quem usa a voz diz o que vê).
 */
export function CardList({ cards, idPrefix, single = false }: ListProps) {
  return (
    <ul class={single ? "home-modes single" : "home-modes"}>
      {cards.map(({ tab, href, name, short, hint, lines, next, off, wide }) => {
        const hintId = `${idPrefix}-${tab}-hint`;
        const content = (
          <>
            <span class="mode-name">{name}</span>
            {lines.map((line, at) => (
              // A posição é a chave: as linhas de um cartão (uma ou duas) não mudam de lugar.
              <span key={at} class="tag">
                {line}
              </span>
            ))}
            <span class="mode-hint">{short}</span>
          </>
        );
        return (
          <li key={tab} class={wide ? "wide" : undefined}>
            {off ? (
              // Sem diário hoje: não há para onde ir, então o cartão não é link.
              <div class="mode home-card off">{content}</div>
            ) : (
              <>
                <a
                  class={next ? "mode home-card next" : "mode home-card"}
                  href={href ?? ROUTES[tab]}
                  aria-describedby={hintId}
                  // O 2º clique de um toque duplo no cartão dos Hits da Início cai aqui, no Normal ou
                  // no Desafio, que ficam no mesmo lugar da tela nova: abriria um diário sem a pessoa
                  // escolher (regra 23).
                  onClick={(event) => {
                    if (event.detail > 1) event.preventDefault();
                  }}
                >
                  {content}
                </a>
                <span id={hintId} class="sr-only">
                  {hint}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
