import { useEffect, useRef, useState } from "preact/hooks";
import type { AudioEngine, Playback } from "../audio/engine.ts";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import type { AnimeTheme, CatalogIndex } from "../core/catalog.ts";
import type { DailyAnswer } from "../core/daily.ts";
import { fillFraction } from "../core/player.ts";
import { type RoundState, roundScore } from "../core/reducer.ts";
import type { ModeRules } from "../core/rules.ts";
import type { Target } from "../core/types.ts";
import { langOf, optionView, revealView } from "../core/view.ts";
import type { PreviewResolver } from "../data/previews.ts";
import { t, tn } from "../i18n/t.ts";
import { Attempts } from "./Attempts.tsx";
import { Attribution } from "./Attribution.tsx";
import { useResolvedUrl } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { Cover, ItemLabel } from "./ItemLabel.tsx";
import { SegmentBar } from "./SegmentBar.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  readonly index: CatalogIndex;
  readonly round: RoundState;
  /** O Normal mostra as opções marcadas; o Desafio, a lista de tentativas. */
  readonly target: Target;
  /** O que se tentou: músicas, ou franquias no "acertar o anime" (as tentativas dizem o anime). */
  readonly answer?: DailyAnswer;
  /** As regras do jogo: os pontos do acerto, e os da ajuda (o Superfan tem os seus). */
  readonly rules: ModeRules;
  readonly engine: AudioEngine;
  readonly resolver: PreviewResolver;
  readonly resolveUrl: (url: string) => string;
  /** Texto do botão de seguir: "Próxima rodada" ou "Ver resultado" (diário). */
  readonly nextLabel: string;
  readonly onNext: () => void;
  /** Mensagem para a região aria-live (a prévia inteira que não tocou). */
  readonly announce: (message: string) => void;
  /** Uma linha a mais, depois do resultado (o Superfan: a partida acabou no 3º erro). */
  readonly note?: string;
};

/**
 * O tema na tela: "Kimetsu no Yaiba · OP1" (sem número, só o tipo; a insert song, por extenso). Com
 * `kindFirst`, "OP1 · Kimetsu no Yaiba": o corte da linha cai no nome do anime, e não no tema.
 */
function themeText(theme: AnimeTheme, kindFirst: boolean): string {
  const kind = t(`anime.theme.${theme.type}`, { number: theme.sequence ?? "" });
  return t(kindFirst ? "anime.themeLineKindFirst" : "anime.themeLine", {
    anime: theme.anime,
    theme: kind,
  });
}

/**
 * Os temas da faixa numa linha curta: o 1º e, se houver mais, "e mais N" (a faixa pode estar em 2
 * ou mais temas, e o nome do anime chega a uns 60 caracteres: a revelação não pode crescer). O
 * `kindFirst` põe o tipo do tema antes do anime: a revelação do quiz, em que o nome longo cortava
 * o "· OP" do fim (o usuário, 27/10/2026).
 */
export function themesText(themes: readonly AnimeTheme[], kindFirst = false): string {
  const [first, ...rest] = themes;
  if (!first) return "";
  return rest.length > 0
    ? t("anime.themesMore", { theme: themeText(first, kindFirst), count: rest.length })
    : themeText(first, kindFirst);
}

/**
 * Depois do palpite: certo e errado (cor e texto), cartão da faixa e a prévia inteira (P34). No
 * Anime, o cartão diz o anime e o tema no lugar do álbum: a revelação mostra a música e o anime, na
 * mesma altura.
 */
export function Reveal({
  index,
  round,
  target,
  answer = "track",
  rules,
  engine,
  resolver,
  resolveUrl,
  nextLabel,
  onNext,
  announce,
  note,
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
  const fillRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  useEffect(() => {
    alive.current = true; // um motor novo (outra carga) vale de novo
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      engine.stop();
    };
  }, [engine]);

  // A prévia inteira (P34) num botão só, que alterna Ouvir e Parar, como o Tocar do Player: a
  // ficha impede que o fim de uma reprodução parada mexa na seguinte.
  const [full, setFull] = useState<"idle" | "loading" | "playing" | "failed">("idle");
  const fullId = useRef(0);
  // A prévia tocando e onde ela começou: o teclado da barra anda a partir dali (P224).
  const playing = useRef<{ playback: Playback; from: number } | null>(null);
  // Com singleClick: o toque duplo tocaria e pararia em seguida.
  function toggleFull() {
    if (full === "loading" || full === "playing") {
      fullId.current++;
      playing.current = null;
      cancelAnimationFrame(frame.current);
      engine.stop();
      setFull("idle");
      return;
    }
    playFull(0);
  }

  /** Toca a prévia inteira a partir de `from` segundos (a barra, P224), até o fim dela. */
  function playFull(from: number) {
    const preview = track?.preview;
    if (!preview || !url) return;
    const id = ++fullId.current;
    const current = () => alive.current && fullId.current === id;
    playing.current = null;
    setFull("loading");
    engine
      .play(url, preview.startSec + from, preview.durationSec - from)
      .then((playback) => {
        if (!current()) return;
        if (!playback) {
          setFull("idle");
          return;
        }
        playing.current = { playback, from };
        setFull("playing");
        const stages = [preview.durationSec];
        const draw = () => {
          if (fillRef.current) {
            const played = from + playback.elapsed();
            fillRef.current.style.width = `${fillFraction(played, 0, stages) * 100}%`;
          }
          frame.current = requestAnimationFrame(draw);
        };
        cancelAnimationFrame(frame.current);
        draw();
        return playback.done.then(() => {
          if (!current()) return;
          playing.current = null;
          cancelAnimationFrame(frame.current);
          setFull("idle");
        });
      })
      .catch(() => {
        if (!current()) return;
        cancelAnimationFrame(frame.current);
        // A rodada já acabou: não há o que anular. Antes a falha era engolida e o clique não
        // fazia nada (no iPhone, um som barrado fora do gesto).
        setFull("failed");
        announce(t("reveal.listenFailed"));
      });
  }

  // O acerto: "Acertou! 8 de 10 pontos.", ou o da ajuda. Errar e desistir valem 0 (ME107); as
  // vidas do Superfan ficam na nota dele.
  const points = roundScore(round, rules);

  return (
    <>
      <section class="reveal" aria-labelledby="result">
        <h2 id="result" ref={heading} tabIndex={-1} class={won ? "won" : "lost"}>
          {/* O ✓ ou o X do designer (P206): só desenho, o texto diz o resultado. */}
          <Icon name={won ? "right" : "wrong"} />
          {won
            ? round.help
              ? t("reveal.wonHelp", { points: tn("count.points", points) })
              : t("reveal.won", { points, max: rules.points[0] ?? points })
            : t("reveal.lost")}
        </h2>
        {note && <p class="reveal-note">{note}</p>}

        {!rules.guessFromOptions ? (
          <Attempts index={index} round={round} answer={answer} hideTitle />
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
                    {/* O ícone na tela; "Resposta certa" e "Sua escolha" para o leitor de tela. */}
                    {tag && (
                      <>
                        <Icon name={isCorrect ? "right" : "wrong"} />
                        <span class="sr-only">{tag}</span>
                      </>
                    )}
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
              {track.themes.length > 0 ? (
                <p class="album">
                  {t("reveal.animeLabel")}{" "}
                  <span lang={langOf(track.themes[0]?.anime ?? "")}>
                    {themesText(track.themes)}
                  </span>
                </p>
              ) : (
                <p class="album">
                  {t("reveal.albumLabel")} <span lang={track.albumLang}>{track.albumTitle}</span>
                </p>
              )}
              {track.explicit && <p class="badge explicit">{t("player.explicit")}</p>}
              {track.preview && url && (
                // O Ouvir e a barra da prévia numa linha, no lugar do botão sozinho: a revelação
                // não cresce (regra 25). Na tela, "Ouvir"; o nome inteiro, para o leitor de tela.
                <div class="reveal-player">
                  <button type="button" onClick={singleClick(toggleFull)}>
                    {/* No "Carregando…" o clique também para: o nome diz o que ele faz. */}
                    {full === "playing" || full === "loading" ? (
                      t("player.stop")
                    ) : (
                      <>
                        <span aria-hidden="true">{t("reveal.listenShort")}</span>
                        <span class="sr-only">{t("reveal.listenFull")}</span>
                      </>
                    )}
                  </button>
                  <SegmentBar
                    stage={0}
                    stages={[track.preview.durationSec]}
                    fillRef={fillRef}
                    seek={{
                      label: t("reveal.seek"),
                      position: () => {
                        const now = playing.current;
                        return now ? now.from + now.playback.elapsed() : 0;
                      },
                      valueText: (at) =>
                        t("reveal.seekValue", { at, total: track.preview?.durationSec ?? at }),
                      onSeek: (seconds) => {
                        if (full !== "loading") playFull(seconds);
                      },
                    }}
                  />
                </div>
              )}
              {full === "failed" && <p class="hint">{t("reveal.listenFailed")}</p>}
            </div>
          </article>
        )}
        {/* O 2º clique de um toque duplo cairia na rodada seguinte (no "Não sei", ME43). */}
        <button type="button" class="primary" onClick={singleClick(onNext)}>
          {nextLabel}
          <Icon name="next" />
        </button>
      </section>
      {/* No fim da página, como na rodada (P112, ME58), fora do cartão (o estilo das imagens dele
          alteraria o selo) e fora da seção: o último filho do palco fica pregado no pé. */}
      {track && index.catalog.provider === APPLE_PROVIDER && (
        <Attribution href={track.storeUrl ?? PLAYLIST_URL} />
      )}
    </>
  );
}
