// A tela das Medalhas (M16, P278, P286): no topo, a sequência (P282) e o total; depois, os blocos
// (o usuário, 28/10/2026: as gerais e as de cada modo, cada um com a contagem dele); no fim, o do
// Superfan, com as gerais dele e as 3 de cada artista da lista, com o desenho dele (P296) e o nome
// próprio de cada uma (P300). A tela rola, como a lista dos Artistas (P211). Com as capas da Apple,
// o selo fecha a página (P170).
import { useEffect } from "preact/hooks";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import { type MedalName, medalName, superfanArt } from "../core/medalArt.ts";
import {
  type ArtistMedals,
  type Medal,
  type MedalBlockView,
  type MedalState,
  medalBoard,
  SUPERFAN_RIGHT,
  type SuperfanLevel,
} from "../core/medals.ts";
import type { Save } from "../core/records.ts";
import type { ArtistList, ArtistListEntry } from "../core/types.ts";
import type { MessageKey } from "../i18n/pt-BR.ts";
import { t } from "../i18n/t.ts";
import { ArtistName, LatinName } from "./ArtistName.tsx";
import type { ArtistStore } from "./Artists.tsx";
import { Attribution } from "./Attribution.tsx";
import { useHeadingFocus } from "./hooks.ts";
import { generalArt, generalKind, MedalArt } from "./MedalArt.tsx";
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

/** O bloco do Superfan vazio: a reserva do tipo, que o `medalBoard` nunca deixa faltar. */
const NO_SUPERFAN: MedalBlockView = {
  block: "superfan",
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
  // O do Superfan está sempre no quadro: ele mostra também a carga e a falha da lista.
  const superfan = board.blocks.find((view) => view.block === "superfan") ?? NO_SUPERFAN;
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
        view.block === "superfan" ? null : (
          <section key={view.block} aria-labelledby={`medals-${view.block}`}>
            <BlockTitle view={view} />
            <GeneralList states={view.general} favorite={favorite} onFavorite={onFavorite} />
          </section>
        ),
      )}
      <section class="medals-superfan" aria-labelledby="medals-superfan">
        {/* A contagem só com a lista dos artistas, como o total do topo. */}
        <BlockTitle view={superfan} count={list.status === "ready"} />
        {superfan.general.length > 0 && (
          <GeneralList states={superfan.general} favorite={favorite} onFavorite={onFavorite} />
        )}
        <p class="hint">{t("medals.superfanHint")}</p>
        {list.status === "ready" ? (
          <ul class="medal-artists">
            {superfan.artists.map((row) => {
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
 * O tamanho de cada nível na linha: a perfeita é a maior (o buquê). A perfeita, com 66 px de largura,
 * tem 94 de altura: a 1ª linha do `.medal-cell` no `styles.css` usa essa altura. Mudou aqui, muda
 * lá.
 */
const LEVEL_SIZE = { acertos: 52, completo: 64, perfeito: 66 } as const;

/**
 * O nome de uma do Superfan para o leitor de tela, como no aviso (P306): o latino com a vírgula, e
 * o artista. Sem o nome próprio, o feito, que o artista distingue dos das outras linhas.
 */
function spokenName(name: MedalName | null, level: SuperfanLevel, artist: string): string {
  const said = !name
    ? superfanFeat(level)
    : name.latin
      ? t("medals.notice.spokenLatin", { name: name.name, latin: name.latin })
      : name.name;
  return artist.trim() ? t("medals.notice.named", { name: said, artist: artist.trim() }) : said;
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
  // O mesmo desenho nas 3 (P296), com a capa já no endereço do site.
  const base = superfanArt(list, entry);
  const art = { ...base, image: base.image ? resolveUrl(base.image) : null };
  return (
    <li class="medal-artist">
      <h3>
        <ArtistName entry={entry} />
      </h3>
      <ul class="medal-trio">
        {row.cells.map(({ level, state }) => {
          // O nome próprio (P300); sem ele (um índice corrompido), só o como ganhar (P301).
          const name = medalName(entry, level);
          return (
            <li key={state.medal.id} class={state.earned ? "medal-cell" : "medal-cell locked"}>
              <MedalArt kind={level} art={art} earned={state.earned} size={LEVEL_SIZE[level]} />
              {/* O desenho é decorativo: o leitor de tela ouve qual é a medalha pelo feito. */}
              <span class="sr-only">{superfanFeat(level)}</span>
              {name && (
                <span class="medal-name">
                  <LatinName name={name.name} latin={name.latin} stacked />
                </span>
              )}
              {/* Só a dos acertos tem progresso ("7 de 50 acertos"). */}
              <MedalStatus
                state={state}
                how={t(`medals.how.${level}`, { goal: SUPERFAN_RIGHT })}
                progress={(value) => t("medals.progress.acertos", value)}
              />

              {state.earned && (
                <PinButton id={state.medal.id} name={spokenName(name, level, base.name)} {...pin} />
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
