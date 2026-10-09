// Texto para compartilhar o resultado. Recebe só o FinishedGame, que não tem IDs nem títulos:
// por construção, não tem como revelar a resposta.
import { type FinishedGame, type RoundRecord, recordMax, recordScore } from "./records.ts";
import { MODE_RULES } from "./rules.ts";
import type { AnswerMode } from "./types.ts";

// Formas diferentes, não só cores (P42): quem não distingue verde e vermelho entende.
export const SYMBOLS = { more: "⬛", right: "✅", wrong: "❌", void: "⬜" } as const;

function line(round: RoundRecord, mode: AnswerMode): string {
  if (round.status === "void") return SYMBOLS.void;
  if (mode === "choice") {
    // Um ⬛ por "ouvir mais", depois o resultado do único palpite (ou do "não sei").
    return (
      SYMBOLS.more.repeat(round.stage) + (round.status === "won" ? SYMBOLS.right : SYMBOLS.wrong)
    );
  }
  // Digitação (M7): uma marca por tentativa; desistir antes do fim fecha com ❌.
  const marks = round.attempts.map((a) =>
    a === "skip" ? SYMBOLS.more : a === "wrong" ? SYMBOLS.wrong : SYMBOLS.right,
  );
  const gaveUp = round.status === "lost" && round.attempts.length < MODE_RULES[mode].maxAttempts;
  return marks.join("") + (gaveUp ? SYMBOLS.wrong : "");
}

export function shareGrid(game: FinishedGame): string[] {
  return game.rounds.map((r) => line(r, game.answerMode));
}

/** Cabeçalho (montado pela tela com o i18n), pontos, uma linha por rodada e o endereço. */
export function shareText(header: string, game: FinishedGame, url: string): string {
  return [header, `${recordScore(game)}/${recordMax(game)}`, ...shareGrid(game), url].join("\n");
}
