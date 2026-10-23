// A tela das Medalhas (M16, P278, P286): no topo, a sequência (P282) e o total; depois, as gerais;
// embaixo, as 3 do Superfan de cada artista da lista, com o desenho dele (P296) e o nome próprio de
// cada uma (P300). A tela rola, como a lista dos Artistas (P211). Com as capas da Apple, o selo
// fecha a página (P170).
import { useEffect } from "preact/hooks";
import { APPLE_PROVIDER, PLAYLIST_URL } from "../core/apple.ts";
import { medalName, superfanArt } from "../core/medalArt.ts";
import {
  type ArtistMedals,
  type Medal,
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
import { generalArt, MedalArt } from "./MedalArt.tsx";
import { singleClick } from "./singleClick.ts";

type Props = {
  /** A última leitura do save. */
  readonly save: Save;
  /** O "hoje" do jogo. */
  readonly date: string;
  /** Os dias da agenda dos Hits: a sequência é sobre eles (P282). */
  readonly hitsDates: readonly string[];
  /** As gerais (no PR 2 do M16, só as de exemplo, em desenvolvimento). */
  readonly general: readonly Medal[];
  /** O modo por artista: a lista dos artistas, que a tela carrega como a aba deles. */
  readonly artists: ArtistStore;
  readonly resolveUrl: (url: string) => string;
};

/**
 * O feito de uma medalha do Superfan ("Superfan completo"): para o leitor de tela, que não vê o
 * desenho, e no aviso, quando falta o nome próprio (P301).
 */
export function superfanFeat(level: SuperfanLevel): string {
  return t(`medals.feat.${level}`, { goal: SUPERFAN_RIGHT });
}

/** O nome e o como ganhar de uma geral, pelo id (`medal.<id>.name` e `.how`, no i18n). */
export function medalText(id: string, part: "name" | "how"): string {
  return t(`medal.${id}.${part}` as MessageKey);
}

export function Medals({ save, date, hitsDates, general, artists, resolveUrl }: Props) {
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
      {board.general.length > 0 && (
        <section aria-labelledby="medals-general">
          <h2 id="medals-general">{t("medals.general")}</h2>
          <ul class="medal-list">
            {board.general.map((state) => (
              <GeneralRow key={state.medal.id} state={state} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="medals-superfan">
        <h2 id="medals-superfan">{t("medals.superfan")}</h2>
        <p class="hint">{t("medals.superfanHint")}</p>
        {list.status === "ready" ? (
          <ul class="medal-artists">
            {board.superfan.map((row) => {
              const entry = byId.get(row.artistId);
              return entry ? (
                <ArtistRow
                  key={row.artistId}
                  list={list.list}
                  entry={entry}
                  row={row}
                  resolveUrl={resolveUrl}
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
 * O estado de uma medalha em texto: ganha, o progresso ("7 de 10", P283) ou como ganhar. A dos
 * acertos diz a unidade ("7 de 50 acertos").
 */
function stateText(state: MedalState, how: string, unit = false): string {
  if (state.earned) return t("medals.earned");
  if (state.progress)
    return t(unit ? "medals.progress.acertos" : "medals.progress", state.progress);
  return how;
}

function GeneralRow({ state }: { readonly state: MedalState }) {
  const { id } = state.medal;
  return (
    <li class={state.earned ? "medal-row" : "medal-row locked"}>
      <MedalArt
        kind="geral"
        art={generalArt(t("medals.generalMark"))}
        earned={state.earned}
        size={44}
      />
      <span class="medal-text">
        <span class="medal-name">{medalText(id, "name")}</span>
        <span class="medal-how">{stateText(state, medalText(id, "how"))}</span>
      </span>
    </li>
  );
}

/**
 * O tamanho de cada nível na linha: a perfeita é a maior (o buquê). A perfeita, com 66 px de largura,
 * tem 94 de altura: a 1ª linha do `.medal-cell` no `styles.css` usa essa altura. Mudou aqui, muda
 * lá.
 */
const LEVEL_SIZE = { acertos: 52, completo: 64, perfeito: 66 } as const;

function ArtistRow({
  list,
  entry,
  row,
  resolveUrl,
}: {
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
          // A dos acertos mostra o progresso ("7 de 50 acertos"); a completa e a perfeita, como ganhar.
          const how = level === "acertos" ? "" : t(`medals.how.${level}`);
          // O nome próprio (P300); sem ele (um índice corrompido), só o como ganhar (P301).
          const name = medalName(entry, level);
          return (
            <li key={state.medal.id} class={state.earned ? "medal-cell" : "medal-cell locked"}>
              <MedalArt kind={level} art={art} earned={state.earned} size={LEVEL_SIZE[level]} />
              {/* O desenho é decorativo: o leitor de tela ouve qual é a medalha pelo feito. */}
              <span class="sr-only">{superfanFeat(level)}</span>
              {name && (
                <span class="medal-name">
                  <LatinName name={name.name} latin={name.latin} />
                </span>
              )}
              <span class="medal-how">{stateText(state, how, level === "acertos")}</span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
