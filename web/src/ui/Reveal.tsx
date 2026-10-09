import { useEffect, useRef } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { type RoundState, roundScore } from "../core/reducer.ts";
import type { AnswerMode, Target } from "../core/types.ts";
import { optionView, revealView } from "../core/view.ts";
import { t } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { ItemLabel } from "./ItemLabel.tsx";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  readonly target: Target;
  /** 4 opções mostra as opções marcadas; digitação, a lista de tentativas. */
  readonly answerMode: AnswerMode;
  readonly engine: AudioEngine;
  readonly resolveUrl: (url: string) => string;
  readonly isLast: boolean;
  readonly onNext: () => void;
};

/** Depois do palpite: certo e errado (cor e texto), cartão da faixa e a prévia inteira (P34). */
export function Reveal({
  index,
  round,
  target,
  answerMode,
  engine,
  resolveUrl,
  isLast,
  onNext,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const won = round.status === "won";
  const picked = round.attempts.filter((a) => a.kind === "guess").at(-1);
  const pickedId = picked?.kind === "guess" ? picked.guessId : null;
  const track = revealView(index, round.trackId);

  // O foco vai para o resultado: quem usa teclado ou leitor de tela sabe o que aconteceu.
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => () => engine.stop(), [engine]);

  return (
    <section class="reveal" aria-labelledby="result">
      <h2 id="result" ref={heading} tabIndex={-1} class={won ? "won" : "lost"}>
        {won ? t("reveal.won", { points: roundScore(round) }) : t("reveal.lost")}
      </h2>

      {answerMode === "typing" ? (
        <Attempts index={index} round={round} target={target} />
      ) : (
        <ul class="options done">
          {round.options.map((id) => {
            const item = optionView(index, id, target);
            const isCorrect = round.accepted.includes(id);
            const isPicked = id === pickedId;
            const tag = isCorrect ? t("reveal.correct") : isPicked ? t("reveal.yourPick") : null;
            return (
              item && (
                <li key={id} class={isCorrect ? "correct" : isPicked ? "wrong" : ""}>
                  <ItemLabel item={item} />
                  {tag && <span class="tag">{tag}</span>}
                </li>
              )
            );
          })}
        </ul>
      )}

      {track && (
        <article class="card">
          {track.artworkUrl && (
            <img src={resolveUrl(track.artworkUrl)} alt="" width={96} height={96} />
          )}
          <div>
            <ItemLabel item={track} />
            <p class="album">{t("reveal.album", { album: track.albumTitle })}</p>
            {track.explicit && <p class="badge explicit">{t("player.explicit")}</p>}
            {track.preview && (
              <button
                type="button"
                onClick={() => {
                  const preview = track.preview;
                  if (preview) {
                    void engine
                      .play(resolveUrl(preview.url), preview.startSec, preview.durationSec)
                      .catch(() => {});
                  }
                }}
              >
                {t("reveal.listenFull")}
              </button>
            )}
          </div>
        </article>
      )}

      <button type="button" class="primary" onClick={onNext}>
        {isLast ? t("reveal.finish") : t("reveal.next")}
      </button>
    </section>
  );
}
