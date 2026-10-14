import { describe, expect, it } from "vitest";
import { artists, realArtists } from "../../test/artists.ts";
import { catalog, schedule } from "../../test/fixtures.ts";
import {
  type ArtistPlay,
  artistSections,
  cardArtwork,
  excludedForArtist,
  MONOGRAM_COLORS,
  monogram,
  songTitleKey,
} from "./artists.ts";
import { indexArtist, indexCatalog, UnsupportedCatalogError } from "./catalog.ts";
import { artistSummary } from "./home.ts";
import { nextPracticeRound, pendingDailySongKeys, startPracticeSession } from "./practice.ts";
import { emptySave } from "./records.ts";
import { currentRound, reduce } from "./reducer.ts";
import { buildSearchIndex, search } from "./search.ts";
import { startSuperfan, superfanStep } from "./superfan.ts";
import type { ArtistCatalog, Day } from "./types.ts";

const chart = indexCatalog(catalog);
const NONE: ReadonlySet<string> = new Set();

function file(id: string): ArtistCatalog {
  const found = artists.files.find((a) => a.artistId === `fixture:ar:${id}`);
  if (!found) throw new Error(`artista ${id} não está nas fixtures`);
  return found;
}

/** As respostas dos dois diários de uma data, ainda sem resultado (o save vazio). */
function pending(date: string): Set<string> {
  return pendingDailySongKeys(emptySave(), schedule.days[date] as Day, date, chart);
}

const keys = (set: ReadonlySet<string>) => [...set].sort();

describe("songTitleKey", () => {
  it.each([
    ["夜に駆ける|apple:ar:1490256993", "夜に駆ける"],
    ["a|b|fixture:ar:ar07", "a|b"], // corta só no último "|"
    ["sem artista", "sem artista"],
  ])("%j → %j", (songKey, title) => {
    expect(songTitleKey(songKey)).toBe(title);
  });
});

describe("a imagem do cartão (P168, P171)", () => {
  const [first] = artists.list.artists;
  if (!first) throw new Error("lista de fixtures vazia");

  it("nas fixtures, a capa relativa; na lista real, só a do host da Apple", () => {
    expect(cardArtwork(artists.list, first)).toBe(first.artworkUrl);
    const apple = { ...artists.list, provider: "apple" };
    const ok = "https://is1-ssl.mzstatic.com/image/thumb/x/300x300bb.jpg";
    expect(cardArtwork(apple, { ...first, artworkUrl: ok })).toBe(ok);
    expect(cardArtwork(apple, { ...first, artworkUrl: "https://evil.test/x.jpg" })).toBeNull();
    expect(cardArtwork(apple, { ...first, artworkUrl: "fixtures/art/al1.svg" })).toBeNull();
  });

  it("sem capa, ou no índice antigo sem o campo, nada: a tela mostra o monograma", () => {
    expect(cardArtwork(artists.list, { ...first, artworkUrl: null })).toBeNull();
    const { artworkUrl: _, ...old } = first;
    expect(cardArtwork(artists.list, old as typeof first)).toBeNull();
    // Um índice corrompido (o loadArtistList não confere as entradas) não quebra a lista.
    const broken = { ...first, artworkUrl: 42 } as unknown as typeof first;
    expect(cardArtwork({ ...artists.list, provider: "apple" }, broken)).toBeNull();
  });

  it("os artistas reais têm capa, e todas do host da Apple", () => {
    for (const entry of realArtists.list.artists) {
      expect(cardArtwork(realArtists.list, entry), entry.name).not.toBeNull();
    }
  });

  it("o monograma: a 1ª letra do nome e uma cor fixa pelo id", () => {
    expect(monogram({ ...first, name: "米津玄師" }).letter).toBe("米");
    expect(monogram({ ...first, name: " UNLIMITS" }).letter).toBe("U");
    expect(monogram({ ...first, name: "𠮷野家" }).letter).toBe("𠮷"); // fora do plano básico
    expect(monogram({ ...first, name: "  " }).letter).toBe("?"); // sem letra
    expect(monogram({ ...first, name: null } as unknown as typeof first).letter).toBe("?");
    const color = monogram(first).color;
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThan(MONOGRAM_COLORS);
    expect(monogram({ ...first, name: "Outro nome" }).color).toBe(color); // o id decide
  });
});

describe("artistSections (P200, P201)", () => {
  const names = (part: readonly { readonly entry: { readonly name: string } }[]) =>
    part.map((a) => a.entry.name);

  it("nas fixtures: a principal na ordem do índice, e a de fora do Japão em ordem alfabética", () => {
    const { main, foreign } = artistSections(artists.list);
    expect(names(main)).toEqual(["夜風シアター", "青井ユウ", "ミナト"]);
    expect(names(foreign)).toEqual(["Hoshizora Drive", "Re:Pulse"]);
    // A posição é a do índice inteiro: os ids dos cartões não se repetem entre as duas.
    expect([...main, ...foreign].map((a) => a.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("na lista real: os dois artistas de fora do Japão (P199), em ordem alfabética", () => {
    expect(names(artistSections(realArtists.list).foreign)).toEqual([
      "Bolbbalgan4",
      "System Of A Down",
    ]);
  });

  it("uma seção que este código não conhece fica na principal", () => {
    const [first] = artists.list.artists;
    if (!first) throw new Error("lista de fixtures vazia");
    const odd = { ...first, section: "outra" } as unknown as typeof first;
    const { main, foreign } = artistSections({ ...artists.list, artists: [odd] });
    expect(main).toHaveLength(1);
    expect(foreign).toHaveLength(0);
  });
});

describe("indexArtist (P140)", () => {
  it("o arquivo de um artista vira um índice do jogo, com uma faixa por música", () => {
    const index = indexArtist(file("ar07"));
    expect(index.catalog.provider).toBe("fixture");
    expect(index.tracks.size).toBe(file("ar07").tracks.length);
    for (const group of index.tracksBySong.values()) expect(group).toHaveLength(1);
  });

  it("versão de arquivo desconhecida: pede para atualizar a página", () => {
    const newer = { ...file("ar07"), schemaVersion: 2 } as unknown as ArtistCatalog;
    expect(() => indexArtist(newer)).toThrow(UnsupportedCatalogError);
  });

  it("os arquivos reais também servem (todos os artistas da lista real)", () => {
    expect(realArtists.files.length).toBeGreaterThan(0);
    for (const real of realArtists.files) {
      const index = indexArtist(real);
      expect(index.catalog.provider).toBe("apple");
      expect(index.tracksBySong.size).toBe(real.tracks.length);
    }
  });
});

describe("excludedForArtist (P141)", () => {
  it("sem diário pendente, nada sai", () => {
    expect(excludedForArtist(file("ar07"), chart, NONE).size).toBe(0);
  });

  it("a participação sai pelo título: o songKey dela no artista é outro", () => {
    // 10/10: a tr05 é resposta, com o ar02 como principal; no ar07 ela é participação.
    const today = pending("2026-10-10");
    expect(today.has("ふたりの約束|fixture:ar:ar07")).toBe(false);
    expect(keys(excludedForArtist(file("ar07"), chart, today))).toEqual([
      "ふたりの約束|fixture:ar:ar07",
    ]);
    expect(keys(excludedForArtist(file("ar02"), chart, today))).toEqual([
      "ふたりの約束|fixture:ar:ar02",
    ]);
  });

  it("sai também a música de um álbum que entregaria a resposta, como no Treino", () => {
    // 09/10: a tr41 é resposta, e o álbum dela (al14) tem as outras duas do ar07.
    expect(keys(excludedForArtist(file("ar07"), chart, pending("2026-10-09")))).toEqual([
      "ひまわり畑でつかまえて|fixture:ar:ar07",
      "君と|fixture:ar:ar07",
      "風になる|fixture:ar:ar07",
    ]);
  });

  it("vale qualquer título de uma versão da música (o same_song em romaji)", () => {
    // "Kimi to ❤️" (trx05) é a tr15 pelo same_song: o titleKeys guarda os dois títulos.
    const cover = new Set(["kimito|fixture:ar:ar99"]);
    expect(keys(excludedForArtist(file("ar07"), chart, cover))).toEqual(["君と|fixture:ar:ar07"]);
  });
});

describe("as rodadas do Treino sobre um artista (P125)", () => {
  const index = indexArtist(file("ar02"));

  it("um ciclo inteiro sem repetir, só com as músicas do artista, no Desafio", () => {
    let session = startPracticeSession(7, "song", index, NONE);
    const played: string[] = [];
    for (let i = 0; i < file("ar02").tracks.length; i++) {
      const game = session.game;
      if (!game) throw new Error("o sorteio parou");
      expect(game.target).toBe("song");
      played.push(currentRound(game).trackId);
      session = nextPracticeRound(session, index, NONE);
    }
    expect([...played].sort()).toEqual(
      file("ar02")
        .tracks.map((t) => t.id)
        .sort(),
    );
  });

  it("a música de um diário pendente não sai", () => {
    const today = excludedForArtist(file("ar02"), chart, pending("2026-10-10"));
    let session = startPracticeSession(3, "song", index, today);
    for (let i = 0; i < 8; i++) {
      const id = session.game ? currentRound(session.game).trackId : null;
      expect(id).not.toBe("fixture:tr:tr05");
      session = nextPracticeRound(session, index, today);
    }
  });

  it("o sorteio pula também o álbum da música excluída no artista (o lado seguro)", () => {
    // Só 君と sai pelo título, mas as três do al14 (君と, 風になる, ひまわり畑) saem do sorteio:
    // sobra ふたりの約束, do al05.
    const ar07 = indexArtist(file("ar07"));
    const cover = excludedForArtist(file("ar07"), chart, new Set(["kimito|fixture:ar:ar99"]));
    expect(keys(cover)).toEqual(["君と|fixture:ar:ar07"]);
    let session = startPracticeSession(5, "song", ar07, cover);
    for (let i = 0; i < 6; i++) {
      expect(session.game ? currentRound(session.game).trackId : null).toBe("fixture:tr:tr05");
      session = nextPracticeRound(session, ar07, cover);
    }
  });

  it("a busca acha a música só pelo título, e o nome do artista não acha nada", () => {
    const idx = buildSearchIndex(index);
    const artist = chart.artists.get("fixture:ar:ar02");
    const first = file("ar02").tracks[0];
    if (!artist || !first) throw new Error("ar02 ausente ou sem faixas");
    expect(search(idx, artist.name)).toEqual([]);
    expect(search(idx, first.title).map((hit) => hit.id)).toContain(first.id);
  });
});

describe("artistSummary (cartão da home)", () => {
  const index = indexArtist(file("ar02"));
  const session = startPracticeSession(1, "song", index, NONE);
  const entry = artists.list.artists[0];
  if (!entry || !session.game) throw new Error("fixtures sem artista ou sem rodada");
  const play: ArtistPlay = { kind: "free", artist: entry, session };

  it("sem sessão ou antes da 1ª rodada terminada: nada a mostrar", () => {
    expect(artistSummary(null)).toBeNull();
    expect(artistSummary(play)).toBeNull();
  });

  it("depois da 1ª rodada: o nome do artista e o placar", () => {
    const game = session.game;
    if (!game) throw new Error("sem rodada");
    const won = reduce(game, { type: "GUESS", guessId: currentRound(game).trackId });
    expect(artistSummary({ ...play, session: { ...session, game: won } })).toEqual({
      artist: entry.name,
      superfan: false,
      score: { points: 6, rounds: 1 },
    });
  });

  it("no Superfan: o placar da partida, com o erro da música em jogo, que conta na hora", () => {
    const run = startSuperfan(1, index, NONE);
    const fresh: ArtistPlay = { kind: "superfan", artist: entry, run };
    expect(artistSummary(fresh)).toBeNull();
    const game = run.session.game;
    if (!game) throw new Error("sem música");
    const other = [...index.tracks.keys()].find((id) => id !== currentRound(game).trackId) ?? "";
    const erred = superfanStep(run, { type: "GUESS", guessId: other });
    expect(artistSummary({ ...fresh, run: erred })).toEqual({
      artist: entry.name,
      superfan: true,
      score: { points: -5, rounds: 0 },
    });
  });
});
