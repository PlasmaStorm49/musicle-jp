import { useEffect, useRef } from "preact/hooks";
import { dailyStatus, nextDaily, type PracticeSummary } from "../core/home.ts";
import type { Save } from "../core/records.ts";
import { MODES } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { t } from "../i18n/t.ts";
import { CardList, dailyCard, practiceCard } from "./cards.tsx";

type Props = {
  /** O dia de hoje na agenda; null quando não há (P44). */
  readonly day: Day | null;
  /** Data do jogo (não o relógio). */
  readonly date: string;
  /** A última leitura do save. */
  readonly save: Save;
  /** O modo e o placar da sessão do Treino; null antes da 1ª rodada (`practiceSummary`). */
  readonly practice: PracticeSummary | null;
};

/**
 * A tela dos Hits (P225): os jogos da parada, numa categoria só da nav. Os dois diários lado a
 * lado, na ordem de MODES, com o estado de hoje, e o Treino embaixo, na linha toda, com o placar
 * da sessão. O 1º diário por jogar é o cartão oliva. Sem diário no dia, os dois ficam apagados, e
 * o Treino continua.
 */
export function Hits({ day, date, save, practice }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Tela nova: o foco vai para o título (regra 16). Só ao montar, como na Início.
  useEffect(() => heading.current?.focus(), []);
  const next = nextDaily(save, day, date);
  const cards = [
    ...MODES.map((mode) => dailyCard(mode, dailyStatus(save, day, date, mode), mode === next)),
    practiceCard(practice),
  ];
  return (
    // O cabeçalho no centro, como nas outras telas de escolha (.practice).
    <div class="game practice hits screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("hits.title")}
        </h1>
        <p class="hint">{t("hits.hint")}</p>
      </header>
      <CardList cards={cards} idPrefix="hits" />
    </div>
  );
}
