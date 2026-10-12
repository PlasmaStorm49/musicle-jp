import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { helpOptions, helpSeed } from "../core/help.ts";
import { seeded } from "../core/prng.ts";
import {
  currentRound,
  type GameEvent,
  type GameState,
  type RoundState,
  reduce,
} from "../core/reducer.ts";
import { canSkip, HELP_POINTS, MODE_RULES } from "../core/rules.ts";
import { optionView, revealView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { Attribution } from "./Attribution.tsx";
import { GuessInput, type SearchScope } from "./GuessInput.tsx";
import { useResolvedUrl, useSuggest } from "./hooks.ts";
import { ItemLabel } from "./ItemLabel.tsx";
import { Options } from "./Options.tsx";
import { Player } from "./Player.tsx";
import { Reveal } from "./Reveal.tsx";
import { singleClick } from "./singleClick.ts";

/**
 * A ajuda do Desafio (P149): depois de quantas tentativas gastas o botão aparece (HELP_AFTER) e
 * as músicas que ela nunca mostra (as respostas dos diários de hoje). Sem ela, não há botão.
 */
export type HelpSetup = { readonly after: number; readonly avoid: ReadonlySet<string> };

type Props = {
  readonly game: GameState;
  readonly dispatch: (event: GameEvent) => void;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  /** Endereço da prévia de cada faixa (catálogo ou lookup da Apple). */
  readonly resolver: PreviewResolver;
  /** Endereço das capas, resolvido contra a base do site. */
  readonly resolveUrl: (url: string) => string;
  /** Mensagem para a região aria-live (erro, pulo, falha de áudio). */
  readonly announce: (message: string) => void;
  /** Muda a cada rodada nova: remonta Player e Reveal (no Treino, game.current é sempre 0). */
  readonly roundKey: string | number;
  /** Texto do botão depois da rodada: "Próxima rodada" ou "Ver resultado". */
  readonly nextLabel: string;
  readonly onNext: () => void;
  readonly scope?: SearchScope;
  readonly help?: HelpSetup;
};

/**
 * Uma rodada, do trecho à revelação, nos dois modos (Normal em 4 opções, Desafio digitado). Não
 * sabe se é diário ou Treino: quem chama cuida de salvar, do cabeçalho e do que vem depois.
 */
export function RoundView({
  game,
  dispatch,
  index,
  engine,
  resolver,
  resolveUrl,
  announce,
  roundKey,
  nextLabel,
  onNext,
  scope = "song",
  help,
}: Props) {
  const round = currentRound(game);
  const rules = MODE_RULES[game.target];
  const track = revealView(index, round.trackId);
  const url = useResolvedUrl(resolver, round.trackId);
  // Próxima tentativa, contando a que acabou de ser gasta (para os anúncios de pulo e erro).
  const attemptLabel = (used: number) => ({ current: used + 1, total: rules.maxAttempts });

  const voidForAudio = useCallback(() => {
    dispatch({ type: "VOID", round: game.current, reason: "audio" });
    announce(t("void.message"));
  }, [dispatch, announce, game.current]);

  // Faixa sem prévia nenhuma (nem o lookup nem a reserva do catálogo): a rodada não tem som e é
  // anulada, como numa falha de áudio. Sem isso o Tocar ficaria em "Carregando…" para sempre.
  const playing = round.status === "playing";
  useEffect(() => {
    if (!playing) return;
    let live = true;
    void resolver.resolve(round.trackId).then((resolved) => {
      if (live && resolved === null) voidForAudio();
    });
    return () => {
      live = false;
    };
  }, [resolver, round.trackId, playing, voidForAudio]);

  // As opções da ajuda, já sorteadas (a mesma rodada dá as mesmas): o botão só aparece com 2 ou
  // mais, porque com uma só não há o que escolher.
  const canHelp =
    !!help && rules.help && round.help === null && round.attempts.length >= help.after;
  const helpChoices = useMemo(
    () =>
      canHelp && help
        ? helpOptions(index, round, help.avoid, seeded(helpSeed(game.puzzleId, game.current)))
        : [],
    [canHelp, help, index, round, game.puzzleId, game.current],
  );

  function askHelp() {
    if (helpChoices.length < 2) return;
    dispatch({ type: "HELP", options: helpChoices });
    announce(t("help.announce", { count: helpChoices.length }));
  }

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

  return (
    <>
      {round.status === "playing" && track?.preview && (
        <>
          <Player
            key={roundKey}
            engine={engine}
            url={url}
            offset={track.preview.startSec}
            stage={round.stage}
            explicit={track.explicit}
            rules={rules}
            skippable={canSkip(rules, round.attempts.length) && round.help === null}
            onListenMore={() => dispatch({ type: "LISTEN_MORE" })}
            onSkip={() => {
              dispatch({ type: "SKIP" });
              announce(t("typing.skipped", attemptLabel(round.attempts.length + 1)));
            }}
            onAudioError={voidForAudio}
          />
          {rules.guessFromOptions ? (
            <Options
              index={index}
              round={round}
              resolveUrl={resolveUrl}
              onPick={guess}
              onGiveUp={giveUp}
            />
          ) : (
            <Typing
              index={index}
              round={round}
              attempt={attemptLabel(round.attempts.length)}
              scope={scope}
              helpCount={helpChoices.length >= 2 ? helpChoices.length : 0}
              onHelp={askHelp}
              onPick={guess}
              onGiveUp={giveUp}
            />
          )}
          {/* No fim da página (P112, ME58): a página inteira é a da música que toca. O link é a
              playlist da parada, não a resposta. */}
          {index.catalog.provider === APPLE_PROVIDER && <Attribution href={PLAYLIST_URL} />}
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
          engine={engine}
          resolver={resolver}
          resolveUrl={resolveUrl}
          nextLabel={nextLabel}
          onNext={onNext}
          announce={announce}
        />
      )}
    </>
  );
}

/**
 * O Desafio: o campo com autocompletar e as tentativas. Componente próprio para só ele montar
 * o índice de busca (o Normal não precisa).
 */
function Typing({
  index,
  round,
  attempt,
  scope,
  helpCount,
  onHelp,
  onPick,
  onGiveUp,
}: {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  readonly attempt: { readonly current: number; readonly total: number };
  readonly scope: SearchScope;
  /** Quantas opções a ajuda daria agora; 0 = sem o botão. */
  readonly helpCount: number;
  readonly onHelp: () => void;
  readonly onPick: (id: string) => void;
  readonly onGiveUp: () => void;
}) {
  const suggest = useSuggest(index, round);
  return (
    <section class="typing" aria-labelledby="question">
      <h2 id="question">{t("question.song")}</h2>
      {round.help ? (
        <>
          <p class="hint">{t("help.hint", { points: tn("count.points", HELP_POINTS) })}</p>
          <HelpOptions index={index} options={round.help} onPick={onPick} />
        </>
      ) : (
        <>
          <p class="hint">{t("typing.attempt", attempt)}</p>
          <GuessInput suggest={suggest} onPick={onPick} labelledBy="question" scope={scope} />
        </>
      )}
      <Attempts index={index} round={round} />
      {helpCount > 0 && (
        <button type="button" class="help" onClick={singleClick(onHelp)}>
          {t("help.button", {
            count: helpCount,
            points: tn("count.points", HELP_POINTS),
          })}
        </button>
      )}
      <button type="button" class="give-up" onClick={singleClick(onGiveUp)}>
        {t("typing.giveUp")}
      </button>
    </section>
  );
}

/**
 * As opções da ajuda (P149), no lugar do campo: músicas, sem capa (a capa entregaria o álbum).
 * O botão da ajuda sumiu com o foco: ele vai para a 1ª opção (regra 16).
 */
function HelpOptions({
  index,
  options,
  onPick,
}: {
  readonly index: CatalogIndex;
  readonly options: readonly string[];
  readonly onPick: (id: string) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <ul class="options help-options" aria-label={t("help.listLabel")}>
      {options.map((id, i) => {
        const item = optionView(index, id, "song");
        return (
          item && (
            <li key={id}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                class="option"
                // O 2º clique do toque duplo no "Pedir ajuda" pode cair aqui (regra 23).
                onClick={singleClick(() => onPick(id))}
              >
                <ItemLabel item={item} />
              </button>
            </li>
          )
        );
      })}
    </ul>
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
      <button ref={button} type="button" class="primary" onClick={singleClick(onNext)}>
        {nextLabel}
      </button>
    </section>
  );
}
