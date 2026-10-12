// Texto para compartilhar o resultado. Recebe só o FinishedGame, que não tem IDs nem títulos:
// por construção, não tem como revelar a resposta.
import { type FinishedGame, type RoundRecord, recordMax, recordScore } from "./records.ts";
import { MODE_RULES } from "./rules.ts";
import type { Target } from "./types.ts";

// Formas diferentes, não só cores (P42): quem não distingue verde e vermelho entende.
export const SYMBOLS = { more: "⬛", right: "✅", wrong: "❌", void: "⬜" } as const;

function line(round: RoundRecord, target: Target): string {
  if (round.status === "void") return SYMBOLS.void;
  const rules = MODE_RULES[target];
  if (rules.listenMore) {
    // Normal: um ⬛ por "ouvir mais", depois o resultado do único palpite (ou do "não sei").
    return (
      SYMBOLS.more.repeat(round.stage) + (round.status === "won" ? SYMBOLS.right : SYMBOLS.wrong)
    );
  }
  // Desafio: uma marca por tentativa; desistir antes do fim fecha com ❌.
  const marks = round.attempts.map((a) =>
    a === "skip" ? SYMBOLS.more : a === "wrong" ? SYMBOLS.wrong : SYMBOLS.right,
  );
  const gaveUp = round.status === "lost" && round.attempts.length < rules.maxAttempts;
  return marks.join("") + (gaveUp ? SYMBOLS.wrong : "");
}

export function shareGrid(game: FinishedGame, target: Target): string[] {
  return game.rounds.map((r) => line(r, target));
}

/** Cabeçalho (montado pela tela com o i18n), pontos, uma linha por rodada e o endereço. */
export function shareText(header: string, game: FinishedGame, target: Target, url: string): string {
  const score = `${recordScore(game)}/${recordMax(game)}`;
  return [header, score, ...shareGrid(game, target), url].join("\n");
}
