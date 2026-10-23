// O aviso de medalha nova (M16, P279 a P281, P288): quem reivindica, o que fica guardado entre os
// renders e o texto de cada medalha. Reivindicar antes de mostrar: a mudança do `updateSave` relê o
// save, calcula as ganhas, tira as já avisadas e grava a união. A aba mostra só o que ela mesma
// marcou, e a outra aba, que relê o save, encontra tudo avisado.
import { useCallback, useState } from "preact/hooks";
import { cardArtwork, monogram } from "../core/artists.ts";
import {
  claimMedals,
  claimTier,
  type Medal,
  type MedalTier,
  medalsOf,
  SUPERFAN_LEVELS,
  type SuperfanLevel,
} from "../core/medals.ts";
import type { ArtistList } from "../core/types.ts";
import { t, tn } from "../i18n/t.ts";
import { type KeyValueStore, updateSave } from "../storage/save.ts";
import type { NoticeItem } from "./MedalNotice.tsx";
import { medalText } from "./Medals.tsx";

/**
 * O aviso na tela: as medalhas, o tamanho dele e se é o 1º de quem já jogava (P281). O tamanho sai
 * na reivindicação, e não da tela de agora: o pequeno não vira o grande no meio do caminho.
 */
export type MedalNoticeState = {
  readonly ids: readonly string[];
  readonly tier: MedalTier;
  readonly first: boolean;
};

type Options = {
  /** O save da sessão (o `sessionStore` do App). */
  readonly store: KeyValueStore;
  /** As gerais; sem lista (no site, até o PR 3), nunca avisa. */
  readonly general: readonly Medal[] | null;
  /** O `?medalhas=silencio` dos testes, ou o save que não grava: a tela fica, e os avisos não. */
  readonly silent: boolean;
  readonly today: string;
  /** Os dias da agenda dos Hits (a sequência, P282); sem eles (a carga), espera. */
  readonly hitsDates: readonly string[] | null;
};

export function useMedalNotices({ store, general, silent, today, hitsDates }: Options) {
  const [notice, setNotice] = useState<MedalNoticeState | null>(null);
  // `big`: a tela pede o grande (os Artistas e as Medalhas, com o selo da Apple no pé, P288).
  const claim = useCallback(
    (big = false) => {
      if (!general || silent || !hitsDates) return;
      const box: { found?: MedalNoticeState } = {};
      const status = updateSave(store, (save) => {
        const result = claimMedals(save, today, hitsDates, general);
        if (result.claimed.length > 0) {
          box.found = {
            ids: result.claimed,
            tier: big ? "major" : claimTier(result, medalsOf(save, general)),
            first: result.first,
          };
        }
        return result.save;
      });
      const { found } = box;
      // O save que recusa a gravação (versão futura, sem acesso): nada foi marcado, e nada aparece.
      // O App já cala o gancho nesse caso, porque o `sessionStore` dele é uma memória que grava. Com
      // a cota cheia, a marca fica na memória da sessão, e o aviso aparece.
      if (!found || (status !== "saved" && status !== "full")) return;
      setNotice((current) =>
        current
          ? {
              ids: [...current.ids, ...found.ids],
              tier: current.tier === "major" || found.tier === "major" ? "major" : "simple",
              first: current.first || found.first,
            }
          : found,
      );
    },
    [store, general, silent, today, hitsDates],
  );
  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, claim, dismiss };
}

const SUPERFAN_ID = /^superfan\|(.+)\|([a-z]+)$/;

/**
 * O nome e o desenho de cada medalha do aviso. As do Superfan levam o nome do artista e a capa,
 * da lista dos artistas; sem a lista (ainda carregando), só o nível.
 */
export function noticeItems(
  ids: readonly string[],
  list: ArtistList | null,
  resolveUrl: (url: string) => string,
): NoticeItem[] {
  return ids.map((id) => {
    const match = SUPERFAN_ID.exec(id);
    const level = SUPERFAN_LEVELS.find((l) => l === match?.[2]);
    if (!match || !level) {
      const mark = t("medals.generalMark");
      return {
        id,
        kind: "geral",
        name: medalText(id, "name"),
        image: null,
        letter: mark,
        color: 0,
        sash: "",
      };
    }
    const levelName = t(`medals.level.${level satisfies SuperfanLevel}`);
    const entry = list?.artists.find((a) => a.id === match[1]);
    if (!list || !entry) {
      return { id, kind: level, name: levelName, image: null, letter: "?", color: 0, sash: "" };
    }
    const url = cardArtwork(list, entry);
    const { letter, color } = monogram(entry);
    return {
      id,
      kind: level,
      name: t("medals.notice.superfan", { level: levelName, artist: entry.name }),
      image: url ? resolveUrl(url) : null,
      letter,
      color,
      sash: entry.name,
    };
  });
}

/** O título do pop-up grande: o 1º de quem já jogava, uma medalha nova ou várias. */
export function noticeTitle(notice: MedalNoticeState): string {
  const count = notice.ids.length;
  if (notice.first) return tn("medals.notice.first", count);
  return count === 1 ? t("medals.notice.one") : tn("medals.notice.many", count);
}

/** O texto do aviso pequeno, que também vai para o leitor de tela. */
export function toastText(items: readonly NoticeItem[]): string {
  const [only] = items;
  return items.length === 1 && only
    ? t("medals.notice.toast", { name: only.name })
    : tn("medals.notice.many", items.length);
}
