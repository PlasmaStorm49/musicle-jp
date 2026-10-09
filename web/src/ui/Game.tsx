import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import {
  type FinishedGame,
  puzzleId,
  type SaveV1,
  startSession,
  toFinishedGame,
  withFinished,
  withProgress,
} from "../core/records.ts";
import {
  currentRound,
  type GameEvent,
  type GameState,
  isFinished,
  reduce,
} from "../core/reducer.ts";
import { ROUNDS_PER_DAY } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { revealView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { type KeyValueStore, updateSave } from "../storage/save.ts";
import { Options } from "./Options.tsx";
import { Player } from "./Player.tsx";
import { Reveal } from "./Reveal.tsx";
import { Summary } from "./Summary.tsx";

type Props = {
  readonly day: Day;
  readonly date: string;
  readonly index: CatalogIndex;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  /** Mensagem para a região aria-live (eventos assíncronos). */
  readonly announce: (message: string) => void;
  /** Onde o progresso é salvo; null = não salva nesta sessão. */
  readonly store: KeyValueStore | null;
  /** O save lido ao abrir a página. */
  readonly initialSave: SaveV1;
};

type Played = { readonly game: GameState; readonly events: readonly GameEvent[] };

/** Só guarda o evento se ele mudou o estado: é a lista que permite retomar ao recarregar. */
function playReducer(played: Played, event: GameEvent): Played {
  const game = reduce(played.game, event);
  return game === played.game ? played : { game, events: [...played.events, event] };
}

/** O Diário Música no modo 4 opções. Dia já terminado mostra direto o resultado (P39). */
export function Game(props: Props) {
  const { day, date, index, initialSave } = props;
  const session = useMemo(
    () => startSession(initialSave, day, date, "song", "choice", index),
    [initialSave, day, date, index],
  );
  if (session.kind === "finished") return <Summary game={session.game} />;
  return <Playing {...props} start={{ game: session.state, events: session.events }} />;
}

function Playing({
  day,
  date,
  index,
  engine,
  resolveUrl,
  announce,
  store,
  start,
}: Props & { readonly start: Played }) {
  const [played, dispatch] = useReducer(playReducer, start);
  const [summary, setSummary] = useState<FinishedGame | null>(null);
  const saveFailed = useRef(false);
  const { game } = played;
  const round = currentRound(game);
  const isLast = game.current === game.rounds.length - 1;

  // Salva a cada evento aceito: em andamento, a lista de eventos; terminado, o resumo.
  useEffect(() => {
    if (!store || played.events.length === 0) return;
    const id = puzzleId(date, game.target);
    const ok = isFinished(game)
      ? updateSave(store, (s) => withFinished(s, id, toFinishedGame(game, day.number)))
      : updateSave(store, (s) =>
          withProgress(s, id, { answerMode: game.answerMode, events: played.events }),
        );
    if (!ok && !saveFailed.current) {
      saveFailed.current = true; // avisa uma vez só
      announce(t("storage.full"));
    }
  }, [store, played, game, date, day.number, announce]);

  const urls = useMemo(
    () =>
      game.rounds.map((r) => {
        const preview = revealView(index, r.trackId)?.preview;
        return preview ? resolveUrl(preview.url) : null;
      }),
    [game.rounds, index, resolveUrl],
  );
  const url = urls[game.current] ?? null;
  const nextUrl = urls[game.current + 1] ?? null;
  const preview = revealView(index, round.trackId)?.preview ?? null;

  // A cada rodada: guarda só o áudio dela e o da próxima, e já começa a baixar os dois.
  useEffect(() => {
    const keep = [url, nextUrl].filter((u): u is string => u !== null);
    engine.retain(keep);
    for (const u of keep) engine.preload(u);
  }, [engine, url, nextUrl]);

  function next() {
    if (isLast && isFinished(game)) setSummary(toFinishedGame(game, day.number));
    else dispatch({ type: "NEXT_ROUND" });
  }

  if (summary) return <Summary game={summary} />;

  const track = revealView(index, round.trackId);
  return (
    <div class="game">
      <header>
        <h1>{t("game.header", { number: day.number })}</h1>
        <p>{t("game.round", { current: game.current + 1, total: ROUNDS_PER_DAY })}</p>
      </header>

      {round.status === "playing" && url && preview && (
        <>
          <Player
            key={game.current}
            engine={engine}
            url={url}
            offset={preview.startSec}
            stage={round.stage}
            explicit={track?.explicit ?? false}
            onListenMore={() => dispatch({ type: "LISTEN_MORE" })}
            onAudioError={() => {
              dispatch({ type: "VOID", round: game.current, reason: "audio" });
              announce(t("void.message"));
            }}
          />
          <Options
            index={index}
            round={round}
            target={game.target}
            onPick={(id) => {
              engine.stop();
              dispatch({ type: "GUESS", guessId: id });
            }}
            onGiveUp={() => {
              engine.stop();
              dispatch({ type: "GIVE_UP" });
            }}
          />
        </>
      )}

      {round.status === "void" && (
        <section class="void">
          <p>{t("void.message")}</p>
          <button type="button" class="primary" onClick={next}>
            {isLast ? t("reveal.finish") : t("reveal.next")}
          </button>
        </section>
      )}

      {(round.status === "won" || round.status === "lost") && (
        <Reveal
          key={game.current}
          index={index}
          round={round}
          target={game.target}
          engine={engine}
          resolveUrl={resolveUrl}
          isLast={isLast}
          onNext={next}
        />
      )}
    </div>
  );
}
