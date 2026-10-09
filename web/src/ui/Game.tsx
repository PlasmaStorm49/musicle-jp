import { useEffect, useMemo, useReducer, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { createGame, currentRound, reduce } from "../core/reducer.ts";
import { ROUNDS_PER_DAY } from "../core/rules.ts";
import type { Day } from "../core/types.ts";
import { revealView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
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
};

/** O Diário Música no modo 4 opções (M5). Os outros modos entram no M7 e no M8. */
export function Game({ day, date, index, engine, resolveUrl, announce }: Props) {
  const [game, dispatch] = useReducer(reduce, undefined, () =>
    createGame(day, date, "song", "choice", index),
  );
  const [showSummary, setShowSummary] = useState(false);
  const round = currentRound(game);
  const isLast = game.current === game.rounds.length - 1;

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
    if (isLast) setShowSummary(true);
    else dispatch({ type: "NEXT_ROUND" });
  }

  if (showSummary) return <Summary game={game} />;

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
