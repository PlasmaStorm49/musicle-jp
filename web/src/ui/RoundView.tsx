import { useEffect, useRef } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { currentRound, type GameEvent, type GameState, reduce } from "../core/reducer.ts";
import { canSkip, MODE_RULES } from "../core/rules.ts";
import { optionView, revealView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { GuessInput } from "./GuessInput.tsx";
import { previewUrl, useSuggest } from "./hooks.ts";
import { Options } from "./Options.tsx";
import { Player } from "./Player.tsx";
import { Reveal } from "./Reveal.tsx";

type Props = {
  readonly game: GameState;
  readonly dispatch: (event: GameEvent) => void;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  /** Mensagem para a região aria-live (erro, pulo, falha de áudio). */
  readonly announce: (message: string) => void;
  /** Muda a cada rodada nova: remonta Player e Reveal (no Treino, game.current é sempre 0). */
  readonly roundKey: string | number;
  /** Texto do botão depois da rodada: "Próxima rodada" ou "Ver resultado". */
  readonly nextLabel: string;
  readonly onNext: () => void;
};

/**
 * Uma rodada, do trecho à revelação, nos dois modos e nos dois alvos. Não sabe se é diário ou
 * Treino: quem chama cuida de salvar, do cabeçalho e do que vem depois.
 */
export function RoundView({
  game,
  dispatch,
  index,
  engine,
  resolveUrl,
  announce,
  roundKey,
  nextLabel,
  onNext,
}: Props) {
  const round = currentRound(game);
  const rules = MODE_RULES[game.answerMode];
  const suggest = useSuggest(index, game.target, round);
  const track = revealView(index, round.trackId);
  const url = previewUrl(index, round.trackId, resolveUrl);
  // Próxima tentativa, contando a que acabou de ser gasta (para os anúncios de pulo e erro).
  const attemptLabel = (used: number) => ({ current: used + 1, total: rules.maxAttempts });

  function giveUp() {
    engine.stop();
    dispatch({ type: "GIVE_UP" });
  }

  function guess(id: string) {
    engine.stop();
    const event = { type: "GUESS", guessId: id } as const;
    // O reducer é puro: dá para ver o resultado antes de despachar, sem repetir as regras aqui.
    const after = reduce(game, event).rounds[game.current];
    dispatch(event);
    // Erro que não encerra a rodada: o foco fica no campo, então o aviso vai para o aria-live.
    // Acerto e último erro abrem a revelação, que leva o foco e se anuncia sozinha.
    if (after?.status === "playing" && after.attempts.length > round.attempts.length) {
      const title = optionView(index, id, game.target)?.title ?? t("attempts.unknown");
      announce(t("typing.wrong", { title, ...attemptLabel(after.attempts.length) }));
    }
  }

  const question = t(game.target === "song" ? "question.song" : "question.album");

  return (
    <>
      {round.status === "playing" && url && track?.preview && (
        <>
          <Player
            key={roundKey}
            engine={engine}
            url={url}
            offset={track.preview.startSec}
            stage={round.stage}
            explicit={track.explicit}
            rules={rules}
            skippable={canSkip(rules, round.attempts.length)}
            onListenMore={() => dispatch({ type: "LISTEN_MORE" })}
            onSkip={() => {
              dispatch({ type: "SKIP" });
              announce(t("typing.skipped", attemptLabel(round.attempts.length + 1)));
            }}
            onAudioError={() => {
              dispatch({ type: "VOID", round: game.current, reason: "audio" });
              announce(t("void.message"));
            }}
          />
          {game.answerMode === "choice" ? (
            <Options
              index={index}
              round={round}
              target={game.target}
              resolveUrl={resolveUrl}
              onPick={guess}
              onGiveUp={giveUp}
            />
          ) : (
            <section class="typing" aria-labelledby="question">
              <h2 id="question">{question}</h2>
              <p class="hint">{t("typing.attempt", attemptLabel(round.attempts.length))}</p>
              <GuessInput
                suggest={suggest}
                onPick={guess}
                labelledBy="question"
                target={game.target}
              />
              <Attempts index={index} round={round} target={game.target} />
              <button type="button" class="link" onClick={giveUp}>
                {t("typing.giveUp")}
              </button>
            </section>
          )}
        </>
      )}

      {round.status === "void" && (
        <VoidRound key={roundKey} nextLabel={nextLabel} onNext={onNext} />
      )}

      {(round.status === "won" || round.status === "lost") && (
        <Reveal
          key={roundKey}
          index={index}
          round={round}
          target={game.target}
          answerMode={game.answerMode}
          engine={engine}
          resolveUrl={resolveUrl}
          nextLabel={nextLabel}
          onNext={onNext}
        />
      )}
    </>
  );
}

/** Rodada anulada: o Player some com o foco, então o foco vai para o botão de seguir. */
function VoidRound({
  nextLabel,
  onNext,
}: {
  readonly nextLabel: string;
  readonly onNext: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section class="void">
      <p>{t("void.message")}</p>
      <button ref={button} type="button" class="primary" onClick={onNext}>
        {nextLabel}
      </button>
    </section>
  );
}
