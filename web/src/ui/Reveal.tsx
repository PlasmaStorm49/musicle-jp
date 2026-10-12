import { useEffect, useRef, useState } from "preact/hooks";
import type { AudioEngine } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { CatalogIndex } from "../core/catalog.ts";
import { type RoundState, roundScore } from "../core/reducer.ts";
import { MODE_RULES } from "../core/rules.ts";
import type { Target } from "../core/types.ts";
import { optionView, revealView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { Attribution } from "./Attribution.tsx";
import { useResolvedUrl } from "./hooks.ts";
import { Cover, ItemLabel } from "./ItemLabel.tsx";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  /** O Normal mostra as opções marcadas; o Desafio, a lista de tentativas. */
  readonly target: Target;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  /** Texto do botão de seguir: "Próxima rodada" ou "Ver resultado" (diário). */
  readonly nextLabel: string;
  readonly onNext: () => void;
  /** Mensagem para a região aria-live (a prévia inteira que não tocou). */
  readonly announce: (message: string) => void;
};

/** Depois do palpite: certo e errado (cor e texto), cartão da faixa e a prévia inteira (P34). */
export function Reveal({
  index,
  round,
  target,
  engine,
  resolver,
  resolveUrl,
  nextLabel,
  onNext,
  announce,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const won = round.status === "won";
  const picked = round.attempts.filter((a) => a.kind === "guess").at(-1);
  const pickedId = picked?.kind === "guess" ? picked.guessId : null;
  const track = revealView(index, round.trackId);
  // A mesma prévia da rodada, já resolvida enquanto ela tocava.
  const url = useResolvedUrl(resolver, round.trackId);

  // O foco vai para o resultado: quem usa teclado ou leitor de tela sabe o que aconteceu.
  useEffect(() => heading.current?.focus(), []);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // um motor novo (outra carga) vale de novo
    return () => {
      alive.current = false;
      engine.stop();
    };
  }, [engine]);

  // A prévia inteira (P34) num botão só, que alterna Ouvir e Parar, como o Tocar do Player: a
  // ficha impede que o fim de uma reprodução parada mexa na seguinte.
  const [full, setFull] = useState<"idle" | "loading" | "playing" | "failed">("idle");
  const fullId = useRef(0);
  function toggleFull(event: MouseEvent) {
    if (event.detail > 1) return; // toque duplo tocaria e pararia em seguida
    const preview = track?.preview;
    if (!preview || !url) return;
    const id = ++fullId.current;
    if (full === "loading" || full === "playing") {
      engine.stop();
      setFull("idle");
      return;
    }
    const current = () => alive.current && fullId.current === id;
    setFull("loading");
    engine
      .play(url, preview.startSec, preview.durationSec)
      .then((playback) => {
        if (!current()) return;
        if (!playback) {
          setFull("idle");
          return;
        }
        setFull("playing");
        return playback.done.then(() => {
          if (current()) setFull("idle");
        });
      })
      .catch(() => {
        if (!current()) return;
        // A rodada já acabou: não há o que anular. Antes a falha era engolida e o clique não
        // fazia nada (no iPhone, um som barrado fora do gesto).
        setFull("failed");
        announce(t("reveal.listenFailed"));
      });
  }

  return (
    <section class="reveal" aria-labelledby="result">
      <h2 id="result" ref={heading} tabIndex={-1} class={won ? "won" : "lost"}>
        {won ? t("reveal.won", { points: roundScore(round) }) : t("reveal.lost")}
      </h2>

      {!MODE_RULES[target].guessFromOptions ? (
        <Attempts index={index} round={round} />
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
                  <Cover item={item} resolveUrl={resolveUrl} />
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
            <p class="album">
              {t("reveal.albumLabel")} <span lang={track.albumLang}>{track.albumTitle}</span>
            </p>
            {track.explicit && <p class="badge explicit">{t("player.explicit")}</p>}
            {track.preview && url && (
              <button type="button" onClick={toggleFull}>
                {/* No "Carregando…" o clique também para: o nome diz o que ele faz. */}
                {full === "playing" || full === "loading"
                  ? t("player.stop")
                  : t("reveal.listenFull")}
              </button>
            )}
            {full === "failed" && <p class="hint">{t("reveal.listenFailed")}</p>}
          </div>
        </article>
      )}
      {/* Fora do cartão: o estilo das imagens dele (cantos arredondados) alteraria o selo. */}
      {track && index.catalog.provider === APPLE_PROVIDER && (
        <Attribution href={track.storeUrl ?? PLAYLIST_URL} />
      )}

      <button type="button" class="primary" onClick={onNext}>
        {nextLabel}
      </button>
    </section>
  );
}
