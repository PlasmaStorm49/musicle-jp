import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import type { DailyAnswer } from "../core/daily.ts";
import { helpOptions, helpSeed } from "../core/help.ts";
import { seeded } from "../core/prng.ts";
import {
  currentRound,
  type GameEvent,
  type GameState,
  type RoundState,
  reduce,
} from "../core/reducer.ts";
import { canSkip, type ModeRules, rulesOf, scoreOf, secondsAt } from "../core/rules.ts";
import { guessView, revealView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { Attribution } from "./Attribution.tsx";
import { GuessInput, type SearchScope } from "./GuessInput.tsx";
import { useResolvedUrl, useSuggest } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { ItemLabel } from "./ItemLabel.tsx";
import { Options } from "./Options.tsx";
import { Player } from "./Player.tsx";
import { Reveal } from "./Reveal.tsx";
import { singleClick } from "./singleClick.ts";

/**
 * A ajuda do Desafio (P149): as músicas que ela nunca mostra (as respostas dos diários de hoje) e,
 * no Treino e no modo por artista, a semente da sessão (helpSeed). Depois de quantas tentativas o
 * botão aparece é das regras (`helpFrom`, ME107). Sem ela, não há botão.
 */
export type HelpSetup = {
  readonly avoid: ReadonlySet<string>;
  readonly session?: number;
};

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
  /** Onde o trecho começa na prévia; sem dizer, o do catálogo (o Superfan sorteia, ME61). */
  readonly offset?: number;
  /**
   * Como quem chama aplica um evento, se não for o reducer puro: o Superfan encerra a música na
   * última vida da partida. A rodada usa para saber o que anunciar depois de um palpite.
   */
  readonly step?: (game: GameState, event: GameEvent) => GameState;
  /** Uma nota a mais no anúncio do palpite errado (o Superfan: "Perdeu uma vida. Sobram 2."). */
  readonly wrongNote?: () => string;
  /** O texto do botão de desistir da rodada (o Superfan: "Desistir da música"). */
  readonly giveUpLabel?: string;
  /** Uma linha a mais na revelação (o Superfan: as vidas que a música custou). */
  readonly revealNote?: string;
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
  offset,
  step = reduce,
  wrongNote,
  giveUpLabel,
  revealNote,
}: Props) {
  const round = currentRound(game);
  const rules = rulesOf(game);
  // O que se acerta: a música, ou a franquia no "acertar o anime" (P234).
  const answer: DailyAnswer = game.answer ?? "track";
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
    !!help &&
    rules.help &&
    round.status === "playing" &&
    round.help === null &&
    round.attempts.length >= rules.helpFrom;
  const helpChoices = useMemo(
    () =>
      canHelp && help
        ? helpOptions(
            index,
            round,
            help.avoid,
            seeded(helpSeed(game.puzzleId, game.current, help.session)),
            answer,
          )
        : [],
    [canHelp, help, index, round, game.puzzleId, game.current, answer],
  );

  // A ajuda pedida nesta montagem: só aí as opções levam o foco (o botão sumiu com ele). Voltar à
  // rodada com a ajuda já pedida (outra aba, recarregar) deixa o Player levá-lo ao Tocar.
  const asked = useRef(false);
  function askHelp() {
    if (helpChoices.length < 2) return;
    asked.current = true;
    dispatch({ type: "HELP", options: helpChoices });
  }

  /** " A ajuda já pode ser pedida." quando a tentativa gasta agora é a que libera o botão. */
  const helpNote = (used: number) =>
    help && rules.help && round.help === null && used === rules.helpFrom
      ? ` ${t("help.available")}`
      : "";

  function giveUp() {
    engine.stop();
    dispatch({ type: "GIVE_UP" });
  }

  function guess(id: string) {
    engine.stop();
    const event = { type: "GUESS", guessId: id } as const;
    // O reducer é puro: dá para ver o resultado antes de despachar, sem repetir as regras aqui.
    const after = step(game, event).rounds[game.current];
    dispatch(event);
    // Erro que não encerra a rodada: o foco fica no campo, então o aviso vai para o aria-live.
    // Acerto e último erro abrem a revelação, que leva o foco e se anuncia sozinha.
    if (after?.status === "playing" && after.attempts.length > round.attempts.length) {
      const title = guessView(index, id, game.target, answer)?.title ?? t("attempts.unknown");
      announce(
        t("typing.wrong", { title, ...attemptLabel(after.attempts.length) }) +
          (wrongNote ? ` ${wrongNote()}` : "") +
          helpNote(after.attempts.length),
      );
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
            offset={offset ?? track.preview.startSec}
            stage={round.stage}
            explicit={track.explicit}
            rules={rules}
            // Com a ajuda também (P163): os pontos já são os dela, e pular só aumenta o trecho.
            skippable={canSkip(rules, round.attempts.length)}
            onListenMore={() => dispatch({ type: "LISTEN_MORE" })}
            onSkip={() => {
              dispatch({ type: "SKIP" });
              announce(
                round.help
                  ? t("typing.skippedHelp", {
                      seconds: secondsAt(round.stage + 1, rules.stages),
                      points: tn(
                        "count.points",
                        scoreOf({ status: "won", stage: round.stage + 1, help: 0 }, rules),
                      ),
                    })
                  : t("typing.skipped", attemptLabel(round.attempts.length + 1)) +
                      helpNote(round.attempts.length + 1),
              );
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
              scope={answer === "franchise" ? "anime" : scope}
              answer={answer}
              rules={rules}
              helpCount={helpChoices.length >= 2 ? helpChoices.length : 0}
              helpFocus={asked.current}
              giveUpLabel={giveUpLabel ?? t("typing.giveUp")}
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
          answer={answer}
          rules={rules}
          engine={engine}
          resolver={resolver}
          resolveUrl={resolveUrl}
          nextLabel={nextLabel}
          onNext={onNext}
          announce={announce}
          note={revealNote}
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
  answer,
  rules,
  helpCount,
  helpFocus,
  giveUpLabel,
  onHelp,
  onPick,
  onGiveUp,
}: {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  readonly attempt: { readonly current: number; readonly total: number };
  readonly scope: SearchScope;
  readonly answer: DailyAnswer;
  readonly rules: ModeRules;
  /** Quantas opções a ajuda daria agora; 0 = sem o botão. */
  readonly helpCount: number;
  /** As opções da ajuda levam o foco (a ajuda foi pedida agora). */
  readonly helpFocus: boolean;
  readonly giveUpLabel: string;
  readonly onHelp: () => void;
  readonly onPick: (id: string) => void;
  readonly onGiveUp: () => void;
}) {
  const suggest = useSuggest(index, round, answer);
  // A pergunta diz o que se acerta: a música, ou o anime (P231).
  const question = answer === "franchise" ? t("question.anime") : t("question.song");
  // A altura das tentativas fica reservada (--slots, regra 25): o Tocar e o Desistir não andam a
  // cada palpite. Em jogo, aparecem no máximo maxAttempts - 1: a última tentativa encerra a
  // rodada. Com a ajuda, as opções entram no lugar do campo e a reserva sai (.helping).
  const slots = { "--slots": rules.maxAttempts - 1 };
  // A ajuda vale a metade do trecho em que se acerta (ME107): a dica diz o de agora.
  const helpPoints = tn(
    "count.points",
    scoreOf({ status: "won", stage: round.stage, help: 0 }, rules),
  );
  return (
    <section
      class={
        round.help
          ? answer === "franchise"
            ? "typing helping franchise"
            : "typing helping"
          : "typing"
      }
      style={slots}
      aria-labelledby="question"
    >
      {round.help ? (
        <>
          {/* No "acertar o anime", as 4 opções numa coluna, com o nome inteiro, não cabem com o
              título: ele fica para o leitor de tela (a seção continua com o nome dele), e a dica e
              a lista ficam na tela. */}
          <h2 id="question" class={answer === "franchise" ? "sr-only" : undefined}>
            {question}
          </h2>
          {/* A dica curta na tela; a inteira, para o leitor de tela, que a ouve na lista (P210). */}
          <p id="help-hint" class="hint">
            <span aria-hidden="true">
              {rules.lives
                ? t("help.hintLifeShort", { points: helpPoints })
                : t("help.hintShort", { points: helpPoints })}
            </span>
            <span class="sr-only">
              {rules.lives
                ? t("help.hintLife", { points: helpPoints })
                : t("help.hint", { points: helpPoints })}
            </span>
          </p>
          <HelpOptions
            index={index}
            options={round.help}
            answer={answer}
            focus={helpFocus}
            onPick={onPick}
          />
        </>
      ) : (
        <>
          {/* A pergunta e a contagem numa linha só. */}
          <div class="question-row">
            <h2 id="question">{question}</h2>
            <p class="hint">{t("typing.attempt", attempt)}</p>
          </div>
          <GuessInput suggest={suggest} onPick={onPick} labelledBy="question" scope={scope} />
        </>
      )}
      <div class="attempts-slot">
        <Attempts index={index} round={round} answer={answer} hideTitle />
      </div>
      {/* A ajuda à esquerda e o desistir à direita, longe um do outro: um toque não cai no
          botão errado. */}
      <div class="typing-actions">
        {helpCount > 0 && (
          <button type="button" class="help" onClick={singleClick(onHelp)}>
            {t("help.button")}
          </button>
        )}
        <button type="button" class="give-up" onClick={singleClick(onGiveUp)}>
          {giveUpLabel}
        </button>
      </div>
    </section>
  );
}

/**
 * As opções da ajuda (P149), no lugar do campo: músicas, sem capa (a capa entregaria o álbum); no
 * "acertar o anime", nomes de anime (franquias).
 * Pedida agora, o botão sumiu com o foco: ele vai para a 1ª opção na tela (regra 16). Voltar à
 * rodada com a ajuda já pedida (outra aba, recarregar) deixa o Player levá-lo ao Tocar. A dica
 * (errar encerra, acertar vale a metade do trecho) descreve a lista, sem anúncio à parte: o foco
 * já a lê.
 */
function HelpOptions({
  index,
  options,
  answer,
  focus,
  onPick,
}: {
  readonly index: CatalogIndex;
  readonly options: readonly string[];
  readonly answer: DailyAnswer;
  readonly focus: boolean;
  readonly onPick: (id: string) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Só na montagem: o valor do 1º desenho diz se a ajuda acabou de ser pedida.
  const [focusOnMount] = useState(focus);
  useEffect(() => {
    if (focusOnMount) list.current?.querySelector("button")?.focus();
  }, [focusOnMount]);
  return (
    <ul
      ref={list}
      // No "acertar o anime", os nomes de anime na grade 2×2, em até 3 linhas (o usuário, 28/10/2026).
      class={answer === "franchise" ? "options help-options franchise" : "options help-options"}
      aria-label={t("help.listLabel")}
      aria-describedby="help-hint"
    >
      {options.map((id) => {
        const item = guessView(index, id, "song", answer);
        return (
          item && (
            <li key={id}>
              <button
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
        <Icon name="next" />
      </button>
    </section>
  );
}
