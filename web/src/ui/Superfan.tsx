import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { drawPractice } from "../core/practice.ts";
import { currentRound, type GameEvent, type GameState } from "../core/reducer.ts";
import { VARIANT_RULES } from "../core/rules.ts";
import {
  quitSuperfan,
  SUPERFAN_ERRORS,
  SUPERFAN_HELPS,
  type SuperfanRun,
  superfanErrors,
  superfanHelps,
  superfanNext,
  superfanOffset,
  superfanOver,
  superfanScore,
  superfanStep,
} from "../core/superfan.ts";
import type { ArtistListEntry } from "../core/types.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { ArtistName } from "./ArtistName.tsx";
import { usePreviews } from "./hooks.ts";
import { ConfirmButton } from "./PracticeRun.tsx";
import { type HelpSetup, RoundView } from "./RoundView.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly artist: ArtistListEntry;
  readonly run: SuperfanRun;
  readonly index: CatalogIndex;
  readonly resolver: PreviewResolver;
  /** As músicas fora do sorteio: as respostas dos diários de hoje (P141). */
  readonly excluded: ReadonlySet<string>;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly announce: (message: string) => void;
  /** Mudança sobre a partida de agora (quem a guarda a aplica, se ela ainda existir). */
  readonly onChange: (change: (run: SuperfanRun) => SuperfanRun) => void;
  /** Outra partida com o mesmo artista. */
  readonly onAgain: () => void;
  /** "Trocar de artista": volta à lista (P127). */
  readonly onSwitch: () => void;
};

const points = (value: number) => tn("count.points", value);

/**
 * A partida do Superfan (ME61): a rodada do Desafio com as regras do Superfan (core/superfan.ts),
 * o trecho começando num ponto sorteado, e no cabeçalho a música, o placar, os erros e as ajudas
 * da partida. Acabada, mostra o resultado. Como o Treino, só ela pré-sorteia e guarda o áudio.
 */
export function SuperfanView({
  artist,
  run,
  index,
  resolver,
  excluded,
  engine,
  resolveUrl,
  announce,
  onChange,
  onAgain,
  onSwitch,
}: Props) {
  const dispatch = useCallback(
    (event: GameEvent) => onChange((r) => superfanStep(r, event)),
    [onChange],
  );
  const next = useCallback(
    () => onChange((r) => superfanNext(r, index, excluded)),
    [onChange, index, excluded],
  );
  const quit = useCallback(() => onChange(quitSuperfan), [onChange]);
  // O evento como a partida o aplica (o 3º erro encerra a música): a rodada anuncia por ele.
  const step = useCallback(
    (g: GameState, event: GameEvent) =>
      superfanStep({ ...run, session: { ...run.session, game: g } }, event).session.game ?? g,
    [run],
  );
  // O erro que o palpite errado acabou de somar: "Erro 2 de 3: -5 pontos."
  // (O 3º encerra a música: quem fala é a revelação, com o `revealNote`.)
  const wrongNote = useCallback(
    () =>
      t("superfan.errorNote", {
        count: superfanErrors(run) + 1,
        total: SUPERFAN_ERRORS,
        points: points(VARIANT_RULES.superfan.wrongPoints),
      }),
    [run],
  );

  // A próxima música, já sorteada, se ainda for desta partida (a 1ª volta do saco): o áudio dela
  // começa a baixar antes. Com a partida no fim (o 3º erro), não há próxima: o motor solta o
  // áudio dela, que não vai tocar.
  const over = superfanOver(run);
  const peek = useMemo(
    () => (over ? null : drawPractice(run.session.practice, index, excluded)),
    [over, run.session.practice, index, excluded],
  );
  const { game } = run.session;
  const currentId = game ? currentRound(game).trackId : null;
  // Sem próxima nesta volta do saco, esta é a última música: o botão leva ao resultado.
  const nextId = peek && peek.round.cycle === 0 ? peek.round.planned.answer : null;
  const batch = useMemo(
    () => [currentId, nextId].filter((id): id is string => id !== null),
    [currentId, nextId],
  );
  usePreviews(engine, resolver, batch, currentId, nextId);

  const errors = superfanErrors(run);
  const helps = superfanHelps(run);
  const seed = run.session.practice.seed;
  // A ajuda logo de cara (P159), até 3 na partida (P153), nunca com uma resposta de hoje.
  const help = useMemo<HelpSetup | undefined>(
    () =>
      helps < SUPERFAN_HELPS
        ? { after: VARIANT_RULES.superfan.helpFrom, avoid: excluded, session: seed }
        : undefined,
    [helps, excluded, seed],
  );
  const duration = currentId ? (index.tracks.get(currentId)?.preview?.durationSec ?? null) : null;
  const offset = game ? superfanOffset(seed, game.puzzleId, duration) : 0;

  if (run.end !== null || !game) {
    return <SuperfanEnd artist={artist} run={run} onAgain={onAgain} onSwitch={onSwitch} />;
  }
  const score = superfanScore(run);
  return (
    <div class="game practice superfan screen">
      <header class="session-head">
        {/* O submodo vira uma etiqueta ao lado do nome (o separador some na tela, e o leitor de
            tela ouve "… Superfan"): o título cabe melhor no celular. */}
        <h1>
          <ArtistName entry={artist} />{" "}
          <span class="title-sep" aria-hidden="true">
            {t("item.artistSeparator")}
          </span>{" "}
          <span class="variant-tag">{t("superfan.name")}</span>
        </h1>
        <p>{t("superfan.song", { number: run.session.number })}</p>
        <p class="practice-score">{t("superfan.score", { points: points(score.points) })}</p>
        <p class="superfan-limits">
          {t("superfan.errors", { count: errors, total: SUPERFAN_ERRORS })}{" "}
          <span aria-hidden="true">{t("item.artistSeparator")}</span>{" "}
          {t("superfan.helps", { count: helps, total: SUPERFAN_HELPS })}
        </p>
        <ConfirmButton
          label={t("superfan.quit")}
          short={t("superfan.quitShort")}
          warning={t("superfan.quitWarning", { points: points(score.points) })}
          confirm={t("superfan.quitConfirm")}
          ask={score.rounds > 0 || errors > 0}
          onConfirm={quit}
        />
      </header>
      <RoundView
        game={game}
        dispatch={dispatch}
        index={index}
        engine={engine}
        resolver={resolver}
        resolveUrl={resolveUrl}
        announce={announce}
        roundKey={game.puzzleId}
        nextLabel={over || nextId === null ? t("superfan.result") : t("superfan.next")}
        onNext={next}
        scope="title"
        help={help}
        offset={offset}
        step={step}
        wrongNote={wrongNote}
        giveUpLabel={t("superfan.giveUp")}
        revealNote={over ? t("superfan.over", { total: SUPERFAN_ERRORS }) : undefined}
      />
    </div>
  );
}

/** O fim da partida: o motivo, o placar e os acertos. Tela nova: o foco vai para o título. */
function SuperfanEnd({
  artist,
  run,
  onAgain,
  onSwitch,
}: {
  readonly artist: ArtistListEntry;
  readonly run: SuperfanRun;
  readonly onAgain: () => void;
  readonly onSwitch: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const score = superfanScore(run);
  // Sem nenhuma música sorteada (as de hoje ficaram de fora), não houve partida. Com as jogadas
  // todas anuladas (falha de áudio), houve: o placar zerado não diz isso, o número diz.
  const reason =
    run.end === "errors"
      ? t("superfan.endErrors", { total: SUPERFAN_ERRORS })
      : run.end === "quit"
        ? t("superfan.endQuit")
        : run.session.number === 0
          ? t("superfan.endEmpty")
          : t("superfan.endDone");
  return (
    <div class="game practice superfan screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("superfan.endTitle")}
        </h1>
        <p>
          <ArtistName entry={artist} /> <span aria-hidden="true">{t("item.artistSeparator")}</span>{" "}
          {t("superfan.name")}
        </p>
      </header>
      <section class="superfan-end">
        <p>{reason}</p>
        <p class="practice-score">{t("superfan.score", { points: points(score.points) })}</p>
        {score.rounds > 0 && (
          <p>
            {t("superfan.right", { right: run.right, played: tn("superfan.songs", score.rounds) })}
          </p>
        )}
        <div class="artists-actions">
          <button type="button" class="primary" onClick={singleClick(onAgain)}>
            {t("superfan.again")}
          </button>
          <button type="button" onClick={singleClick(onSwitch)}>
            {t("artists.restart")}
          </button>
        </div>
      </section>
    </div>
  );
}
