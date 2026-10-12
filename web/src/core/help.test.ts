import { describe, expect, it } from "vitest";
import { artists } from "../../test/artists.ts";
import { catalog, schedule } from "../../test/fixtures.ts";
import { indexArtist, indexCatalog } from "./catalog.ts";
import { dayAnswerKeys, helpOptions, helpSeed } from "./help.ts";
import { startPracticeSession } from "./practice.ts";
import { seeded } from "./prng.ts";
import { createGame, currentRound, type GameState, reduce } from "./reducer.ts";
import { songRepresentative } from "./search.ts";
import type { Catalog, Day } from "./types.ts";

const index = indexCatalog(catalog);
const DATE = "2026-10-08";
const NONE: ReadonlySet<string> = new Set();

/** O Desafio de 08/10 com a tr01 (que tem as versões tr02 e tr03) na 1ª rodada. */
function desafio(): GameState {
  const day = schedule.days[DATE] as Day;
  const song: Day["song"] = [{ answer: "fixture:tr:tr01" }, day.song[1], day.song[2]];
  return createGame({ ...day, song }, DATE, "song", index);
}

const songOf = (id: string) => index.tracks.get(id)?.songKey;
const rng = () => seeded(helpSeed("teste", 0));

describe("dayAnswerKeys", () => {
  it("as respostas dos dois diários do dia, de todas as rodadas", () => {
    const day = schedule.days[DATE] as Day;
    const keys = dayAnswerKeys(day, index);
    for (const r of [...day.song, ...day.album])
      expect(keys.has(songOf(r.answer) ?? "")).toBe(true);
    expect(keys.size).toBeLessThanOrEqual(6);
  });
});

describe("helpOptions (P149)", () => {
  it("4 músicas diferentes, uma delas a resposta, pela faixa que a busca sugere", () => {
    const round = currentRound(reduce(desafio(), { type: "SKIP" }));
    const options = helpOptions(index, round, NONE, rng());
    expect(options).toHaveLength(4);
    expect(new Set(options.map(songOf)).size).toBe(4);
    const answers = options.filter((id) => round.accepted.includes(id));
    expect(answers).toHaveLength(1);
    const group = index.tracksBySong.get(songOf(round.trackId) ?? "") ?? [];
    expect(answers[0]).toBe(songRepresentative(group)?.id);
  });

  it("a mesma rodada dá as mesmas opções, e o reducer as aceita", () => {
    const game = reduce(desafio(), { type: "SKIP" });
    const round = currentRound(game);
    const options = helpOptions(index, round, NONE, rng());
    expect(helpOptions(index, round, NONE, rng())).toEqual(options);
    const helped = reduce(game, { type: "HELP", options });
    expect(currentRound(helped).help).toEqual(options);
  });

  it("nunca mostra uma música já tentada nem uma de `avoid` (os diários de hoje)", () => {
    const tried = reduce(desafio(), { type: "GUESS", guessId: "fixture:tr:tr21" });
    const avoid = new Set(
      [...index.tracksBySong.keys()]
        .filter((key) => key !== songOf("fixture:tr:tr01"))
        .slice(0, 30),
    );
    for (let seed = 0; seed < 20; seed++) {
      const options = helpOptions(index, currentRound(tried), avoid, seeded(`x|${seed}`));
      for (const id of options) {
        expect(songOf(id)).not.toBe(songOf("fixture:tr:tr21"));
        expect(avoid.has(songOf(id) ?? "")).toBe(false);
      }
    }
  });

  it("no Treino, a semente da sessão muda a posição da resposta na mesma rodada (S1)", () => {
    const round = currentRound(reduce(desafio(), { type: "SKIP" }));
    const positions = new Set<number>();
    for (let session = 0; session < 12; session++) {
      const seed = seeded(helpSeed("treino|song|0|0", 0, session));
      const options = helpOptions(index, round, NONE, seed);
      positions.add(options.findIndex((id) => round.accepted.includes(id)));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("nunca mostra uma homônima de uma resposta de hoje: entregaria o título", () => {
    // A tr04 tem o título da tr01, de outro artista (pipeline/fixtures/README.md).
    const day = schedule.days[DATE] as Day;
    const song: Day["song"] = [{ answer: "fixture:tr:tr21" }, day.song[1], day.song[2]];
    const round = currentRound(
      reduce(createGame({ ...day, song }, DATE, "song", index), { type: "SKIP" }),
    );
    const avoid = new Set([songOf("fixture:tr:tr01") ?? ""]);
    for (let seed = 0; seed < 40; seed++) {
      const options = helpOptions(index, round, avoid, seeded(`z|${seed}`));
      expect(options).not.toContain("fixture:tr:tr04");
    }
  });

  it('nunca mostra outra música de mesmo título que a resposta (dois "Lemon")', () => {
    const answer = catalog.tracks.find((t) => t.id === "fixture:tr:tr01");
    if (!answer) throw new Error("tr01 ausente");
    const [title] = answer.songKey.split("|");
    const twin = { ...answer, id: "fixture:tr:twin", songKey: `${title}|fixture:ar:outro` };
    const grown = indexCatalog({
      ...catalog,
      tracks: [...catalog.tracks, twin] as Catalog["tracks"],
    });
    const round = currentRound(reduce(desafio(), { type: "SKIP" }));
    for (let seed = 0; seed < 30; seed++) {
      expect(helpOptions(grown, round, NONE, seeded(`y|${seed}`))).not.toContain(twin.id);
    }
  });

  it("um artista com poucas músicas dá menos opções", () => {
    const file = artists.files.find((a) => a.artistId === "fixture:ar:ar01");
    if (!file) throw new Error("ar01 ausente");
    const small = indexArtist(file);
    const game = startPracticeSession(1, "song", small, NONE).game;
    if (!game) throw new Error("o Treino não sorteou rodada");
    const options = helpOptions(small, currentRound(reduce(game, { type: "SKIP" })), NONE, rng());
    expect(options).toHaveLength(file.tracks.length); // 2: a resposta e a outra
  });

  it("sem a resposta no índice, nenhuma opção", () => {
    const round = { ...currentRound(desafio()), trackId: "fixture:tr:nao-existe" };
    expect(helpOptions(index, round, NONE, rng())).toEqual([]);
  });
});
