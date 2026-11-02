// A tela das Medalhas (M16, P278, P286): no topo, a sequência (P282) e o total; depois, os blocos
// (o usuário, 28/10/2026: as gerais e as de cada modo, cada um com a contagem dele e separados por
// um fio); no fim, o dos Artistas, com as 6 de cada artista da lista (as 3 do Superfan e as 3 do
// Setlist Royale), com o desenho dele (P296) e o nome próprio de cada uma (P300), num carrossel com
// as ganhas na frente (o usuário, 02/11/2026). A tela rola, como a lista dos Artistas (P211). Com as
// capas da Apple, o selo fecha a página (P170).
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import {
  type MedalName,
  medalName,
  type SuperfanArt,
  setlistArt,
  setlistBaseName,
  superfanArt,
} from "../core/medalArt.ts";
import {
  type ArtistMedalLevel,
  type ArtistMedals,
  type Medal,
  type MedalBlockView,
  type MedalState,
  medalBoard,
  SETLIST_REACH,
  SUPERFAN_RIGHT,
  type SuperfanLevel,
} from "../core/medals.ts";
import type { Save } from "../core/records.ts";
import { SETLIST_FINAL } from "../core/setlist.ts";
import type { ArtistList, ArtistListEntry } from "../core/types.ts";
import type { MessageKey } from "../i18n/pt-BR.ts";
import { t } from "../i18n/t.ts";
import { ArtistName, LatinName } from "./ArtistName.tsx";
import type { ArtistStore } from "./Artists.tsx";
import { Attribution } from "./Attribution.tsx";
import { useHeadingFocus } from "./hooks.ts";
import { Icon } from "./Icon.tsx";
import { artistMedalKind, generalArt, generalKind, MedalArt, type MedalKind } from "./MedalArt.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  /** A última leitura do save. */
  readonly save: Save;
  /** O "hoje" do jogo. */
  readonly date: string;
  /** Os dias da agenda dos Hits: a sequência é sobre eles (P282). */
  readonly hitsDates: readonly string[];
  /** As gerais: a lista do usuário (P310), ou a de exemplo com `?medalhas=demo`. */
  readonly general: readonly Medal[];
  /** O modo por artista: a lista dos artistas, que a tela carrega como a aba deles. */
  readonly artists: ArtistStore;
  readonly resolveUrl: (url: string) => string;
  /** A medalha em destaque (ME118, P317), o id dela, ou null. */
  readonly favorite: string | null;
  /** Escolher (`on`) ou tirar a medalha em destaque (P318). */
  readonly onFavorite: (id: string, on: boolean) => void;
};

/** A escolha da medalha em destaque, só nas ganhas. */
type Pin = Pick<Props, "favorite" | "onFavorite">;

/**
 * O botão do destaque (P318): "Destacar" na ganha, e "Tirar o destaque" na escolhida, que a
 * remove. O nome da medalha vai para o leitor de tela, que ouve vários botões iguais. Alterna no
 * mesmo lugar: o 2º clique de um toque duplo não desfaz o 1º (regra 23).
 */
function PinButton({ id, name, favorite, onFavorite }: Pin & { id: string; name: string }) {
  const pinned = favorite === id;
  return (
    <button type="button" class="medal-pin" onClick={singleClick(() => onFavorite(id, !pinned))}>
      {t(pinned ? "favorite.unpin" : "favorite.pin")}
      <span class="sr-only">{t("favorite.which", { name })}</span>
    </button>
  );
}

/**
 * O feito de uma medalha do Superfan ("Superfan completo"): para o leitor de tela, que não vê o
 * desenho, e no aviso, quando falta o nome próprio (P301).
 */
export function superfanFeat(level: SuperfanLevel): string {
  return t(`medals.feat.${level}`, { goal: SUPERFAN_RIGHT });
}

/**
 * Os números das do Setlist nos textos, do núcleo: a rodada a que a pequena chega (a seguinte à
 * `SETLIST_REACH`, a 8ª) e as da setlist completa (10).
 */
const SETLIST_TEXT = { round: SETLIST_REACH + 1, total: SETLIST_FINAL } as const;

/** O feito de uma medalha de artista, do Superfan ou do Setlist ("Setlist completa"). */
export function artistFeat(medal: ArtistMedalLevel): string {
  return medal.family === "superfan"
    ? superfanFeat(medal.level)
    : t(`medals.feat.${medal.level}`, SETLIST_TEXT);
}

/**
 * O nome próprio de uma medalha de artista: o do Superfan (P300) ou, no Setlist, o título do álbum
 * delas com o sufixo do nível, também no latino ("THE BOOK -Live-"). Null quando falta.
 */
export function artistMedalName(entry: ArtistListEntry, medal: ArtistMedalLevel): MedalName | null {
  if (medal.family === "superfan") return medalName(entry, medal.level);
  const base = setlistBaseName(entry);
  if (!base) return null;
  const key = `medals.setlistName.${medal.level}` as const;
  return {
    name: t(key, { name: base.name }),
    latin: base.latin ? t(key, { name: base.latin }) : null,
  };
}

/** O desenho do artista para a família da medalha: a capa das do Superfan ou a das do Setlist. */
export function artistArtOf(
  list: ArtistList,
  entry: ArtistListEntry,
  medal: ArtistMedalLevel,
): SuperfanArt {
  return medal.family === "superfan" ? superfanArt(list, entry) : setlistArt(list, entry);
}

/**
 * O nome, o como ganhar e o progresso de uma geral, pelo id (`medal.<id>.name`, `.how` e
 * `.progress`, no i18n). Os limites vão por parâmetro (o `goal` do progresso e o `right` dos acertos
 * do Superfan): o texto não repete os números do núcleo.
 */
export function medalText(
  id: string,
  part: "name" | "how" | "progress",
  params: Readonly<Record<string, number>> = {},
): string {
  return t(`medal.${id}.${part}` as MessageKey, { right: SUPERFAN_RIGHT, ...params });
}

/** O bloco dos Artistas vazio: a reserva do tipo, que o `medalBoard` nunca deixa faltar. */
const NO_ARTISTS: MedalBlockView = {
  block: "artistas",
  general: [],
  artists: [],
  earned: 0,
  total: 0,
};

/**
 * O título de um bloco (o usuário, 28/10/2026), com a contagem dele à direita. O espaço entre os
 * dois não aparece na linha (flex), mas separa o nome e a contagem para o leitor de tela.
 */
function BlockTitle({
  view,
  count = true,
}: {
  readonly view: MedalBlockView;
  readonly count?: boolean;
}) {
  return (
    <h2 id={`medals-${view.block}`}>
      {t(`medals.block.${view.block}`)}{" "}
      {count && (
        <span class="medals-count">
          {t("medals.blockCount", { earned: view.earned, total: view.total })}
        </span>
      )}
    </h2>
  );
}

/** As gerais de um bloco, uma por linha. */
function GeneralList({ states, ...pin }: Pin & { readonly states: readonly MedalState[] }) {
  return (
    <ul class="medal-list">
      {states.map((state) => (
        <GeneralRow key={state.medal.id} state={state} {...pin} />
      ))}
    </ul>
  );
}

export function Medals({
  save,
  date,
  hitsDates,
  general,
  artists,
  resolveUrl,
  favorite,
  onFavorite,
}: Props) {
  const heading = useHeadingFocus();
  const { list, loadList } = artists;
  useEffect(() => {
    if (list.status === "idle") loadList();
  }, [list.status, loadList]);
  const entries = list.status === "ready" ? list.list.artists : [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const board = medalBoard(
    save,
    date,
    hitsDates,
    general,
    entries.map((e) => e.id),
  );
  // O dos Artistas está sempre no quadro: ele mostra também a carga e a falha da lista.
  const artistsBlock = board.blocks.find((view) => view.block === "artistas") ?? NO_ARTISTS;
  return (
    <div class="medals screen">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t("medals.title")}
        </h1>
        <p class="medals-streak">
          {t("medals.streak", { current: board.streak.current, best: board.streak.best })}
        </p>
        {/* O total só com a lista dos artistas: antes dela, ele contaria só as gerais. */}
        {list.status === "ready" && (
          <p class="medals-total">
            {t("medals.total", { earned: board.earned, total: board.total })}
          </p>
        )}
      </header>
      {board.blocks.map((view) =>
        view.block === "artistas" ? null : (
          <section key={view.block} aria-labelledby={`medals-${view.block}`}>
            <BlockTitle view={view} />
            <GeneralList states={view.general} favorite={favorite} onFavorite={onFavorite} />
          </section>
        ),
      )}
      <section aria-labelledby="medals-artistas">
        {/* A contagem só com a lista dos artistas, como o total do topo. */}
        <BlockTitle view={artistsBlock} count={list.status === "ready"} />
        {artistsBlock.general.length > 0 && (
          <GeneralList states={artistsBlock.general} favorite={favorite} onFavorite={onFavorite} />
        )}
        <p class="hint">{t("medals.artistsHint")}</p>
        {list.status === "ready" ? (
          <ul class="medal-artists">
            {artistsBlock.artists.map((row) => {
              const entry = byId.get(row.artistId);
              return entry ? (
                <ArtistRow
                  key={row.artistId}
                  list={list.list}
                  entry={entry}
                  row={row}
                  resolveUrl={resolveUrl}
                  favorite={favorite}
                  onFavorite={onFavorite}
                />
              ) : null;
            })}
          </ul>
        ) : list.status === "retry" ? (
          // Sem o foco (regra 16 vale para a tela inteira de aviso): a falha chega depois, com a
          // pessoa já lendo a tela, e o foco não pode pular para o meio dela.
          <div class="medals-retry">
            <p>{t("artists.retry")}</p>
            {/* O botão some na carga: o foco vai antes ao título, e não fica no body (regra 16). */}
            <button
              type="button"
              onClick={singleClick(() => {
                heading.current?.focus();
                loadList();
              })}
            >
              {t("load.retryButton")}
            </button>
          </div>
        ) : list.status === "update" ? (
          <div class="medals-retry">
            <p>{t("load.update")}</p>
            <button type="button" onClick={() => window.location.reload()}>
              {t("load.updateButton")}
            </button>
          </div>
        ) : (
          <p>{t("load.loading")}</p>
        )}
      </section>
      {list.status === "ready" && list.list.provider === APPLE_PROVIDER && (
        <Attribution href={PLAYLIST_URL} />
      )}
    </div>
  );
}

/**
 * O como ganhar, sempre, e embaixo o progresso enquanto falta (P283, com a unidade, P315). Na
 * ganha, o como ganhar lembra o que a pessoa fez (o usuário, 24/10/2026): o desenho colorido e o
 * "Destacar" já dizem que ela é ganha, e o "Ganha" fica só para o leitor de tela, que não vê a cor.
 */
function MedalStatus({
  state,
  how,
  progress,
}: {
  readonly state: MedalState;
  readonly how: string;
  /** O texto do progresso, das que se ganham aos poucos. */
  readonly progress: (value: { value: number; goal: number }) => string;
}) {
  return (
    <>
      {state.earned && <span class="sr-only">{t("medals.earned")}</span>}
      <span class="medal-how">{how}</span>
      {!state.earned && state.progress && (
        <span class="medal-progress">{progress(state.progress)}</span>
      )}
    </>
  );
}

/**
 * A largura das gerais na linha (P312): a grande, na moldura gelo com os raios, é maior. A coluna
 * da arte no `styles.css` (`.medal-row`) tem a largura da grande: mudou aqui, muda lá.
 */
const GENERAL_SIZE = { simple: 44, major: 56 } as const;

function GeneralRow({ state, ...pin }: Pin & { readonly state: MedalState }) {
  const { id, tier } = state.medal;
  return (
    <li class={state.earned ? "medal-row" : "medal-row locked"}>
      <MedalArt
        kind={generalKind(tier)}
        art={generalArt(t("medals.generalMark"))}
        earned={state.earned}
        size={GENERAL_SIZE[tier]}
        icon={id}
      />
      <span class="medal-text">
        <span class="medal-name">{medalText(id, "name")}</span>
        {/* O limite do como ganhar ("Jogue {goal} dias seguidos") sai do progresso, também na
            ganha. */}
        <MedalStatus
          state={state}
          how={medalText(id, "how", state.progress ?? {})}
          progress={(value) => medalText(id, "progress", value)}
        />
      </span>
      {state.earned && <PinButton id={id} name={medalText(id, "name")} {...pin} />}
    </li>
  );
}

/**
 * O tamanho de cada desenho na linha: a perfeita do Superfan é a maior (o buquê). A perfeita, com
 * 66 px de largura, tem 94 de altura: a 1ª linha do `.medal-cell` no `styles.css` usa essa altura.
 * O vinil, quadrado, cabe nela com 72. Mudou aqui, muda lá.
 */
const KIND_SIZE: Partial<Record<MedalKind, number>> = {
  acertos: 52,
  completo: 64,
  perfeito: 66,
  vinil: 72,
};

/**
 * O nome de uma medalha de artista para o leitor de tela, como no aviso (P306): o latino com a
 * vírgula, e o artista. Sem o nome próprio, o feito, que o artista distingue dos das outras linhas.
 */
function spokenName(name: MedalName | null, medal: ArtistMedalLevel, artist: string): string {
  const said = !name
    ? artistFeat(medal)
    : name.latin
      ? t("medals.notice.spokenLatin", { name: name.name, latin: name.latin })
      : name.name;
  return artist.trim() ? t("medals.notice.named", { name: said, artist: artist.trim() }) : said;
}

type ProgressValue = { readonly value: number; readonly goal: number };

/** O como ganhar e o progresso de uma medalha de artista: só as pequenas têm progresso. */
function howOf(medal: ArtistMedalLevel): {
  readonly how: string;
  readonly progress: (value: ProgressValue) => string;
} {
  if (medal.family === "superfan") {
    return {
      how: t(`medals.how.${medal.level}`, { goal: SUPERFAN_RIGHT }),
      progress: (value) => t("medals.progress.acertos", value),
    };
  }
  return {
    how: t(`medals.how.${medal.level}`, SETLIST_TEXT),
    progress: (value) => t("medals.progress.oitava", value),
  };
}

/**
 * A faixa de um artista: as 6 medalhas lado a lado, 3 por vista, com a ponta da 4ª aparecendo e
 * sumindo num degradê (o usuário, 02/11/2026). No celular, a rolagem lateral; no computador, também
 * as setas, que andam uma vista e ficam travadas nas pontas. O degradê fica só no lado que tem mais.
 */
function useShelf() {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft >= max - 1;
    // O mesmo objeto enquanto nada muda: a rolagem não redesenha as 6 a cada passo.
    setEdges((old) => (old.start === start && old.end === end ? old : { start, end }));
  }, []);
  useEffect(() => {
    const el = track.current;
    update();
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);
  const go = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: still ? "auto" : "smooth" });
  };
  return { track, edges, go };
}

function ArtistRow({
  list,
  entry,
  row,
  resolveUrl,
  ...pin
}: Pin & {
  readonly list: ArtistList;
  readonly entry: ArtistListEntry;
  readonly row: ArtistMedals;
  readonly resolveUrl: (url: string) => string;
}) {
  const { track, edges, go } = useShelf();
  // Um desenho por família (P296): o das do Superfan e o das do Setlist, com a capa no site.
  const resolved = (art: SuperfanArt): SuperfanArt => ({
    ...art,
    image: art.image ? resolveUrl(art.image) : null,
  });
  const arts = {
    superfan: resolved(superfanArt(list, entry)),
    setlist: resolved(setlistArt(list, entry)),
  };
  const artist = arts.superfan.name;
  const shelf = ["medal-shelf", edges.start ? "at-start" : "", edges.end ? "at-end" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <li class="medal-artist">
      <div class="medal-artist-head">
        <h3>
          <ArtistName entry={entry} />
        </h3>
        {/* As setas, só com mouse (o CSS as esconde no toque): no celular, a rolagem lateral. */}
        <div class="shelf-arrows">
          <button
            type="button"
            class="shelf-arrow prev"
            aria-label={t("medals.shelf.prev", { artist })}
            aria-disabled={edges.start ? "true" : undefined}
            onClick={singleClick(() => !edges.start && go(-1))}
          >
            <Icon name="next" />
          </button>
          <button
            type="button"
            class="shelf-arrow"
            aria-label={t("medals.shelf.next", { artist })}
            aria-disabled={edges.end ? "true" : undefined}
            onClick={singleClick(() => !edges.end && go(1))}
          >
            <Icon name="next" />
          </button>
        </div>
      </div>
      <div class={shelf}>
        <ul ref={track} class="medal-track">
          {row.cells.map((cell) => {
            const { state } = cell;
            const kind = artistMedalKind(cell);
            // O nome próprio (P300); sem ele (um índice corrompido), só o como ganhar (P301).
            const name = artistMedalName(entry, cell);
            const { how, progress } = howOf(cell);
            return (
              <li key={state.medal.id} class={state.earned ? "medal-cell" : "medal-cell locked"}>
                <MedalArt
                  kind={kind}
                  art={arts[cell.family]}
                  earned={state.earned}
                  size={KIND_SIZE[kind] ?? 52}
                />
                {/* O desenho é decorativo: o leitor de tela ouve qual é a medalha pelo feito. */}
                <span class="sr-only">{artistFeat(cell)}</span>
                {name && (
                  <span class="medal-name">
                    <LatinName name={name.name} latin={name.latin} stacked />
                  </span>
                )}
                {/* Só as pequenas têm progresso ("7 de 50 acertos", "3 de 7 rodadas"). */}
                <MedalStatus state={state} how={how} progress={progress} />
                {state.earned && (
                  <PinButton id={state.medal.id} name={spokenName(name, cell, artist)} {...pin} />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}
