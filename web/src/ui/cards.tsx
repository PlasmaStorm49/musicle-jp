// Os cartões que levam a outra aba, na Início (um por categoria, P226) e na tela dos Hits (os
// dois diários e o Treino, P225): o nome, o estado em linhas curtas e a dica curta na tela, com a
// inteira para o leitor de tela (P210).
import type { DailyStatus, PracticeSummary } from "../core/home.ts";
import { ROUTES, type Tab } from "../core/routes.ts";
import { MODE_RULES, ROUNDS_PER_DAY } from "../core/rules.ts";
import type { Target } from "../core/types.ts";
import { t } from "../i18n/t.ts";
import { modeName } from "./modes.ts";
import { practiceScoreText } from "./PracticeRun.tsx";

export type Card = {
  readonly tab: Exclude<Tab, "home">;
  readonly name: string;
  /** A dica curta, na tela (P210). */
  readonly short: string;
  /** A dica inteira, para o leitor de tela. */
  readonly hint: string;
  /** O estado e o placar, uma linha cada; nenhuma, sem nada a dizer. */
  readonly lines: readonly string[];
  /** O jogo por jogar: o cartão oliva, a ação da tela. */
  readonly next?: boolean;
  /** Sem para onde ir (o diário sem dia na agenda): o cartão não é link. */
  readonly off?: boolean;
  /** O cartão ocupa a linha toda da grade (o Treino, nos Hits). */
  readonly wide?: boolean;
};

/**
 * O estado do diário: no cartão dele, com o número ("nº 1 · novo", "nº 1 · terminado, 11 de 18
 * pontos"); `short`, na linha do cartão dos Hits na Início, sem ele (na parada real, o número
 * cresce, e a linha quebraria).
 */
export function dailyText(status: DailyStatus, short = false): string {
  switch (status.kind) {
    case "unavailable":
      return t("home.statusUnavailable");
    case "new":
      return short ? t("home.lineNew") : t("home.statusNew", { number: status.number });
    case "playing":
      return short ? t("home.linePlaying") : t("home.statusPlaying", { number: status.number });
    case "done":
      // Dia todo anulado (P27): "terminado", sem "0 de 0 pontos".
      if (status.max === 0) {
        return short ? t("home.lineDoneVoid") : t("home.statusDoneVoid", { number: status.number });
      }
      return short
        ? t("home.lineDone", { score: status.score, max: status.max })
        : t("home.statusDone", { number: status.number, score: status.score, max: status.max });
  }
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
      {cards.map(({ tab, name, short, hint, lines, next, off, wide }) => {
        const hintId = `${idPrefix}-${tab}-hint`;
        const content = (
          <>
            <span class="mode-name">{name}</span>
            {lines.map((line) => (
              <span key={line} class="tag">
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
                  href={ROUTES[tab]}
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
