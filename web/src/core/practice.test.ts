import { describe, expect, it } from "vitest";
import { catalog, schedule } from "../../test/fixtures.ts";
import { acceptedIds, type CatalogIndex, indexCatalog } from "./catalog.ts";
import {
  drawPractice,
  newPractice,
  nextPracticeRound,
  type PracticeDraw,
  type PracticeState,
  pendingDailySongKeys,
  planRound,
  practiceGame,
  practicePool,
  practiceScore,
  startPracticeSession,
} from "./practice.ts";
import { seeded } from "./prng.ts";
import { emptySave, type FinishedGame, puzzleId, type Save } from "./records.ts";
import { reduce } from "./reducer.ts";
import type { Album, Catalog, Day, Target, Track } from "./types.ts";

const index = indexCatalog(catalog);
const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;
const NONE: ReadonlySet<string> = new Set();

const track = (id: string) => {
  const found = index.tracks.get(id);
  if (!found) throw new Error(`faixa ${id} não existe`);
  return found;
};
const songOf = (id: string) => track(id).songKey;
const albumOf = (id: string) => track(id).albumId;

/** Sorteia `count` rodadas seguidas, como o jogador apertando "Próxima rodada". */
function drawMany(
  state: PracticeState,
  target: Target,
  count: number,
  excluded: ReadonlySet<string> = NONE,
  from: CatalogIndex = index,
): { draws: PracticeDraw[]; state: PracticeState } {
  const draws: PracticeDraw[] = [];
  let current = state;
  for (let i = 0; i < count; i++) {
    const draw = drawPractice(current, from, target, excluded);
    if (!draw) throw new Error(`sem rodada no sorteio ${i + 1}`);
    draws.push(draw);
    current = draw.state;
  }
  return { draws, state: current };
}
const answers = (draws: readonly PracticeDraw[]) => draws.map((d) => d.round.planned.answer);

/** Troca faixas do catálogo falso, mantendo todas (o esquema pede uma ou mais). */
function withTracks(change: (t: Track) => Track): CatalogIndex {
  return indexCatalog({ ...catalog, tracks: catalog.tracks.map(change) as Catalog["tracks"] });
}

/** Catálogo em que só as faixas pedidas continuam elegíveis. */
function onlyEligible(ids: readonly string[]): CatalogIndex {
  const keep = new Set(ids);
  return withTracks((t) =>
    keep.has(t.id) ? t : { ...t, eligible: { daily: false, reason: "blocked" } },
  );
}

/** Jogo terminado do histórico (o conteúdo não importa à exclusão, só a existência). */
const finished: FinishedGame = { number: 1, rounds: [] };
function saveWith(...targets: Target[]): Save {
  const history = Object.fromEntries(targets.map((t) => [puzzleId(DATE, t), finished]));
  return { ...emptySave(), history };
}
const dailySongs = (target: Target) => new Set(day[target].map((r) => songOf(r.answer)));
/** A faixa é de um álbum que o Normal aceitaria por uma música excluída (a dela ou outra)? */
const albumBlocked = (id: string, excluded: ReadonlySet<string>) =>
  catalog.tracks.some(
    (t) => excluded.has(t.songKey) && acceptedIds(index, t, "album").includes(albumOf(id)),
  );

describe("saco do Treino (practicePool)", () => {
  it("Desafio: uma faixa elegível por música, a mais popular", () => {
    const pool = practicePool(index, "song");
    const eligible = catalog.tracks.filter((t) => t.eligible.daily);
    expect(pool).toHaveLength(new Set(eligible.map((t) => t.songKey)).size);
    expect(new Set(pool.map(songOf)).size).toBe(pool.length);
    // tr01, tr02 e tr03 são a mesma música: fica a mais popular (tr01, 0.9).
    expect(pool).toContain("fixture:tr:tr01");
    expect(pool).not.toContain("fixture:tr:tr02");
    expect(pool).not.toContain("fixture:tr:tr03");
    // Inelegíveis (sem preview, preview curto, sem capa) nunca entram.
    for (const id of ["fixture:tr:tr11", "fixture:tr:tr12", "fixture:tr:tr13"]) {
      expect(pool).not.toContain(id);
    }
    for (const id of pool) {
      const rivals = index.tracksBySong.get(songOf(id)) ?? [];
      for (const rival of rivals.filter((t) => t.eligible.daily)) {
        expect(track(id).popularity).toBeGreaterThanOrEqual(rival.popularity);
      }
    }
  });

  it("Normal: uma faixa por álbum, sem repetir música dentro do saco", () => {
    const pool = practicePool(index, "album");
    expect(new Set(pool.map(albumOf)).size).toBe(pool.length);
    expect(new Set(pool.map(songOf)).size).toBe(pool.length);
    // al01 leva tr01; al02 fica com a outra música (tr37); al03 só tem a mesma música e sai.
    expect(pool).toContain("fixture:tr:tr01");
    expect(pool).toContain("fixture:tr:tr37");
    expect(pool.map(albumOf)).not.toContain("fixture:al:al03");
    // al13: tr13 é inelegível, entra tr33.
    expect(pool).toContain("fixture:tr:tr33");
    // al14 tem três faixas: entra a mais popular (tr15).
    expect(pool).toContain("fixture:tr:tr15");
    expect(pool.every((id) => track(id).eligible.daily)).toBe(true);
  });

  it("catálogo sem faixa elegível: saco vazio e nenhuma rodada", () => {
    const empty = onlyEligible([]);
    expect(practicePool(empty, "song")).toEqual([]);
    expect(practicePool(empty, "album")).toEqual([]);
    expect(drawPractice(newPractice(1), empty, "song", NONE)).toBeNull();
  });
});

describe("sorteio (drawPractice)", () => {
  it.each<Target>(["song", "album"])("%s: uma volta inteira sem repetir", (target) => {
    const pool = practicePool(index, target);
    const { draws } = drawMany(newPractice(42), target, pool.length);
    const ids = answers(draws);
    expect(new Set(ids)).toEqual(new Set(pool));
    expect(new Set(ids.map(songOf)).size).toBe(pool.length);
    if (target === "album") expect(new Set(ids.map(albumOf)).size).toBe(pool.length);
    expect(draws.every((d) => d.round.cycle === 0)).toBe(true);
    expect(draws.map((d) => d.round.position)).toEqual(pool.map((_, i) => i));
  });

  it("saco vazio: novo ciclo, outro embaralhamento, e não repete a última tocada", () => {
    const pool = practicePool(index, "song");
    const { draws } = drawMany(newPractice(7), "song", pool.length * 3);
    const ids = answers(draws);
    for (let c = 0; c < 3; c++) {
      const cycle = draws.slice(c * pool.length, (c + 1) * pool.length);
      expect(cycle.every((d) => d.round.cycle === c)).toBe(true);
      expect(new Set(answers(cycle))).toEqual(new Set(pool));
    }
    expect(ids.slice(0, pool.length)).not.toEqual(ids.slice(pool.length, 2 * pool.length));
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it("saco de 2: a troca na virada do ciclo impede repetir a última", () => {
    // Sem a troca, metade das viradas repetiria a música (50% por ciclo, 30 ciclos).
    const tiny = onlyEligible(["fixture:tr:tr05", "fixture:tr:tr07"]);
    for (const seed of [1, 2, 3, 4, 5]) {
      const { draws } = drawMany(newPractice(seed), "song", 60, NONE, tiny);
      const ids = answers(draws);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });

  it("virada com uma excluída no começo do saco novo: a última tocada não repete de cara", () => {
    // A última vai para o FIM do saco novo; trocada só com a 2ª, ela tocaria de novo sempre que
    // a nova 1ª estivesse excluída e fosse pulada.
    const small = onlyEligible(["fixture:tr:tr05", "fixture:tr:tr07", "fixture:tr:tr08"]);
    const excluded = new Set([songOf("fixture:tr:tr08")]);
    for (let seed = 1; seed <= 30; seed++) {
      const ids = answers(drawMany(newPractice(seed), "song", 40, excluded, small).draws);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });

  it("no meio do ciclo, com o resto excluído: acha a única faixa liberada no ciclo seguinte", () => {
    const small = onlyEligible([
      "fixture:tr:tr05",
      "fixture:tr:tr07",
      "fixture:tr:tr08",
      "fixture:tr:tr09",
    ]);
    for (let seed = 1; seed <= 20; seed++) {
      const first = drawPractice(newPractice(seed), small, "song", NONE);
      if (!first) throw new Error("sem rodada");
      const played = first.round.planned.answer;
      const others = practicePool(small, "song").filter((id) => id !== played);
      const draw = drawPractice(first.state, small, "song", new Set(others.map(songOf)));
      expect(draw?.round.planned.answer).toBe(played);
    }
  });

  it("saco de 1: repete (não há outra), sem travar", () => {
    const one = onlyEligible(["fixture:tr:tr05"]);
    const ids = answers(drawMany(newPractice(3), "song", 4, NONE, one).draws);
    expect(ids).toEqual(Array(4).fill("fixture:tr:tr05"));
  });

  it("determinístico pela semente: mesma semente, mesma sequência; outra, outra", () => {
    const run = (seed: number, target: Target) =>
      answers(drawMany(newPractice(seed), target, 20).draws);
    expect(run(123, "song")).toEqual(run(123, "song"));
    expect(run(123, "album")).toEqual(run(123, "album"));
    expect(run(123, "song")).not.toEqual(run(124, "song"));
    const options = (seed: number) =>
      drawMany(newPractice(seed), "album", 5).draws.map((d) => d.round.planned.options);
    expect(options(9)).toEqual(options(9));
  });

  it("cada alvo tem o seu saco: trocar de alvo não mexe no outro", () => {
    const start = newPractice(5);
    const songsOnly = answers(drawMany(start, "song", 4).draws);
    let state = start;
    const mixed: string[] = [];
    for (const target of ["song", "album", "song", "album", "song", "song"] as const) {
      const draw = drawPractice(state, index, target, NONE);
      if (!draw) throw new Error("sem rodada");
      if (target === "song") mixed.push(draw.round.planned.answer);
      state = draw.state;
    }
    expect(mixed).toEqual(songsOnly);
  });
});

describe("exclusão das respostas do diário de hoje", () => {
  it("pendingDailySongKeys: músicas dos diários sem resultado gravado", () => {
    const all = new Set([...dailySongs("song"), ...dailySongs("album")]);
    expect(pendingDailySongKeys(emptySave(), day, DATE, index)).toEqual(all);
    expect(pendingDailySongKeys(saveWith("song"), day, DATE, index)).toEqual(dailySongs("album"));
    expect(pendingDailySongKeys(saveWith("album"), day, DATE, index)).toEqual(dailySongs("song"));
    expect(pendingDailySongKeys(saveWith("song", "album"), day, DATE, index)).toEqual(new Set());
    // Resultado de outro dia não conta.
    const yesterday = { ...emptySave(), history: { "2026-10-07|song": finished } };
    expect(pendingDailySongKeys(yesterday, day, DATE, index)).toEqual(all);
  });

  it("sem dia na agenda: nada a excluir; resposta fora do catálogo é ignorada", () => {
    expect(pendingDailySongKeys(emptySave(), null, DATE, index)).toEqual(new Set());
    const ghost: Day = {
      ...day,
      song: [{ ...day.song[0], answer: "fixture:tr:sumiu" }, day.song[1], day.song[2]],
    };
    const keys = pendingDailySongKeys(saveWith("album"), ghost, DATE, index);
    expect(keys).toEqual(new Set(day.song.slice(1).map((r) => songOf(r.answer))));
  });

  it.each<Target>(["song", "album"])(
    "%s: a música excluída é pulada, não sai do saco",
    (target) => {
      const excluded = pendingDailySongKeys(emptySave(), day, DATE, index);
      const pool = practicePool(index, target);
      const blocked = pool.filter((id) => albumBlocked(id, excluded));
      expect(blocked.length).toBeGreaterThan(0);

      const lap = drawMany(newPractice(11), target, pool.length - blocked.length, excluded);
      const ids = answers(lap.draws);
      expect(ids.some((id) => albumBlocked(id, excluded))).toBe(false);
      expect(new Set(ids).size).toBe(ids.length);
      // Pular não é tirar: a volta inteira ainda é o ciclo 0.
      expect(lap.draws.every((d) => d.round.cycle === 0)).toBe(true);

      // O diário terminou: as músicas puladas voltam ao sorteio.
      const done = pendingDailySongKeys(saveWith("song", "album"), day, DATE, index);
      const after = answers(drawMany(lap.state, target, 2 * pool.length, done).draws);
      for (const id of blocked) expect(after).toContain(id);
    },
  );

  it.each<Target>(["song", "album"])(
    "%s: a outra faixa do álbum de uma resposta pendente também é pulada",
    (target) => {
      // al14 tem tr15, tr27 e tr41, três músicas. Com a de tr27 pendente no diário, tr15 ou tr41
      // no Treino mostrariam o álbum na revelação, e no Normal ele seria a própria resposta.
      const excluded = new Set([songOf("fixture:tr:tr27")]);
      const pool = practicePool(index, target);
      const ids = answers(drawMany(newPractice(5), target, 3 * pool.length, excluded).draws);
      expect(ids.map(albumOf)).not.toContain("fixture:al:al14");
      expect(ids).not.toContain("fixture:tr:tr15");
    },
  );

  it.each<Target>(["song", "album"])(
    "%s: o álbum que só a regra do mesmo lançamento liga à resposta também é pulado",
    (target) => {
      // Como o EP "爆裂愛してる / 好きすぎて滅! - EP", ligado no catálogo só a 爆裂愛してる: com
      // 好きすぎて滅! pendente no diário, a revelação do EP entregaria a resposta.
      const pending = track("fixture:tr:tr05"); // ふたりの約束, de ar02 e ar07
      const ep: Album = {
        ...(index.albums.get(pending.albumId) as Album),
        id: "fixture:al:ep",
        title: `Outra / ${pending.title} - EP`,
        artistIds: ["fixture:ar:ar07"],
      };
      const grown = indexCatalog({
        ...catalog,
        albums: [...catalog.albums, ep],
        tracks: catalog.tracks.map((t) =>
          t.id === "fixture:tr:tr15" ? { ...t, albumId: ep.id } : t,
        ) as Catalog["tracks"],
      });
      const excluded = new Set([pending.songKey]);
      const pool = practicePool(grown, target);
      expect(pool).toContain("fixture:tr:tr15");
      const ids = answers(drawMany(newPractice(3), target, 3 * pool.length, excluded, grown).draws);
      expect(ids).not.toContain("fixture:tr:tr15");
    },
  );

  it("uma volta inteira sem nada liberado: sem rodada, e o estado não muda", () => {
    const tiny = onlyEligible(["fixture:tr:tr05", "fixture:tr:tr07"]);
    const all = new Set([songOf("fixture:tr:tr05"), songOf("fixture:tr:tr07")]);
    expect(drawPractice(newPractice(1), tiny, "song", all)).toBeNull();
    // Mesmo no meio de um ciclo.
    const first = drawPractice(newPractice(1), tiny, "song", NONE);
    if (!first) throw new Error("sem rodada");
    expect(drawPractice(first.state, tiny, "song", all)).toBeNull();
  });
});

describe("rodada do Treino (planRound)", () => {
  it("Normal: 4 opções distintas, o álbum certo e 3 do similar dele", () => {
    const pool = practicePool(index, "album");
    const { draws } = drawMany(newPractice(99), "album", pool.length);
    for (const { round } of draws) {
      const answer = track(round.planned.answer);
      const similar = index.albums.get(answer.albumId)?.similar ?? [];
      const options = round.planned.options ?? [];
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options).toContain(answer.albumId);
      for (const option of options.filter((o) => o !== answer.albumId)) {
        expect(similar).toContain(option);
      }
    }
  });

  it("Desafio: sem opções (é digitado) e sem gastar o rng", () => {
    const rng = seeded("x");
    const before = seeded("x").nextU32();
    expect(planRound(index, "song", "fixture:tr:tr05", NONE, rng)).toEqual({
      answer: "fixture:tr:tr05",
      options: [],
    });
    expect(rng.nextU32()).toBe(before);
  });

  it("as opções saem embaralhadas (a certa não fica sempre no mesmo lugar)", () => {
    const { draws } = drawMany(newPractice(8), "album", 20);
    const places = new Set(
      draws.map((d) => (d.round.planned.options ?? []).indexOf(albumOf(d.round.planned.answer))),
    );
    expect(places.size).toBeGreaterThan(1);
  });

  it("distratores sem álbuns com música excluída; com menos de 3, a lista inteira", () => {
    const answer = track("fixture:tr:tr05");
    const similar = index.albums.get(answer.albumId)?.similar ?? [];
    const songsOf = (albumId: string) =>
      catalog.tracks.filter((t) => t.albumId === albumId).map((t) => t.songKey);
    const blocking = (albums: readonly string[]) => new Set(albums.flatMap(songsOf));
    const allowed = (excluded: ReadonlySet<string>) =>
      similar.filter((a) => !songsOf(a).some((s) => excluded.has(s)));

    const leaves3 = blocking(similar.slice(0, 7));
    expect(allowed(leaves3).length).toBeGreaterThanOrEqual(3);
    for (const seed of ["a", "b", "c"]) {
      const options = planRound(index, "album", answer.id, leaves3, seeded(seed)).options ?? [];
      expect(options).toContain(answer.albumId);
      for (const o of options.filter((o) => o !== answer.albumId)) {
        expect(allowed(leaves3)).toContain(o);
      }
    }

    const leaves2 = blocking(similar.slice(0, 8));
    expect(allowed(leaves2).length).toBeLessThan(3);
    const picked = new Set<string>();
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const options = planRound(index, "album", answer.id, leaves2, seeded(seed)).options ?? [];
      expect(new Set(options).size).toBe(4);
      for (const o of options.filter((o) => o !== answer.albumId)) picked.add(o);
    }
    expect([...picked].some((o) => !allowed(leaves2).includes(o))).toBe(true);
  });

  it("similar com menos de 3 nem na lista inteira: usa o que houver", () => {
    const answer = track("fixture:tr:tr05");
    const album = index.albums.get(answer.albumId);
    if (!album) throw new Error("álbum da tr05 ausente");
    const short = indexCatalog({
      ...catalog,
      albums: catalog.albums.map((a) =>
        a.id === album.id ? { ...a, similar: a.similar.slice(0, 2) } : a,
      ) as Catalog["albums"],
    });
    const { options } = planRound(short, "album", answer.id, NONE, seeded("x"));
    expect(new Set(options)).toEqual(new Set([answer.albumId, ...album.similar.slice(0, 2)]));
  });
});

describe("jogo de uma rodada e sessão", () => {
  const firstDraw = (target: Target) => {
    const draw = drawPractice(newPractice(21), index, target, NONE);
    if (!draw) throw new Error("sem rodada");
    return draw;
  };

  it("practiceGame: uma rodada em jogo, no modo pedido", () => {
    const draw = firstDraw("album");
    const game = practiceGame(draw.round, index);
    expect(game.target).toBe("album");
    expect(game.current).toBe(0);
    expect(game.rounds).toHaveLength(1);
    expect(game.rounds[0]?.status).toBe("playing");
    expect(game.rounds[0]?.trackId).toBe(draw.round.planned.answer);
    expect(game.rounds[0]?.correctOptionId).toBe(albumOf(draw.round.planned.answer));
    expect(game.puzzleId).toBe(`treino|album|0|0`);
    const next = drawPractice(draw.state, index, "album", NONE);
    if (!next) throw new Error("sem rodada");
    expect(practiceGame(next.round, index).puzzleId).not.toBe(game.puzzleId);
  });

  it("practiceScore: soma a rodada terminada; anulada e em jogo não contam", () => {
    const game = practiceGame(firstDraw("album").round, index);
    const zero = { points: 0, rounds: 0 };
    expect(practiceScore(zero, null)).toEqual(zero);
    expect(practiceScore(zero, game)).toEqual(zero);
    const answer = game.rounds[0]?.correctOptionId ?? "";
    expect(practiceScore(zero, reduce(game, { type: "GUESS", guessId: answer }))).toEqual({
      points: 6,
      rounds: 1,
    });
    const listened = reduce(game, { type: "LISTEN_MORE" });
    const won = reduce(listened, { type: "GUESS", guessId: answer });
    expect(practiceScore({ points: 4, rounds: 2 }, won)).toEqual({ points: 9, rounds: 3 });
    expect(practiceScore(zero, reduce(game, { type: "GIVE_UP" }))).toEqual({
      points: 0,
      rounds: 1,
    });
    const voided = reduce(game, { type: "VOID", round: 0, reason: "audio" });
    expect(practiceScore(zero, voided)).toEqual(zero);
  });

  it("sessão: a 1ª rodada sai no começo; a próxima soma o placar e usa o modo atual", () => {
    const session = startPracticeSession(77, "album", index, NONE);
    expect(session.number).toBe(1);
    expect(session.score).toEqual({ points: 0, rounds: 0 });
    const game = session.game;
    if (!game) throw new Error("sem rodada");
    expect(game.target).toBe("album");

    // Acerta e troca para o Desafio no meio: a rodada atual não muda.
    const won = reduce(game, { type: "GUESS", guessId: game.rounds[0]?.correctOptionId ?? "" });
    const next = nextPracticeRound({ ...session, game: won, target: "song" }, index, NONE);
    expect(next.number).toBe(2);
    expect(next.score).toEqual({ points: 6, rounds: 1 });
    expect(next.game?.target).toBe("song");
    expect(next.game?.rounds[0]?.options).toEqual([]);
    // O saco do Normal andou uma casa; o do Desafio também, agora.
    expect(next.practice.cursors.album.position).toBe(1);
    expect(next.practice.cursors.song.position).toBe(1);
  });

  it("sessão sem rodada possível: game null, número e placar ficam", () => {
    const tiny = onlyEligible(["fixture:tr:tr05"]);
    const all = new Set([songOf("fixture:tr:tr05")]);
    const empty = startPracticeSession(1, "song", tiny, all);
    expect(empty.game).toBeNull();
    expect(empty.number).toBe(0);
    const again = nextPracticeRound(empty, tiny, all);
    expect(again.game).toBeNull();
    expect(again.number).toBe(0);
    // Liberou: a rodada sai.
    const freed = nextPracticeRound(empty, tiny, NONE);
    expect(freed.number).toBe(1);
    expect(freed.game?.rounds[0]?.trackId).toBe("fixture:tr:tr05");
  });
});
