import { describe, expect, it } from "vitest";
import { catalog, schedule } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import {
  createGame,
  currentRound,
  type GameEvent,
  type GameState,
  isFinished,
  maxScore,
  reduce,
  roundScore,
  totalScore,
  unlockedSeconds,
} from "./reducer.ts";
import type { Catalog, Day } from "./types.ts";

const index = indexCatalog(catalog);
const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;

const song = () => createGame(day, DATE, "song", "choice", index);
const play = (state: GameState, ...events: GameEvent[]) => events.reduce(reduce, state);
const round = (state: GameState) => currentRound(state);
const wrongOption = (state: GameState) =>
  round(state).options.find((o) => !round(state).accepted.includes(o)) as string;

/** Dia sintético cuja rodada 1 tem a faixa tr01, que tem outras versões (tr02 e tr03). */
function dayWithVersions(): Day {
  const tr01 = index.tracks.get("fixture:tr:tr01");
  if (!tr01) throw new Error("tr01 ausente");
  const options = [tr01.id, ...tr01.similar.slice(0, 3)] as Day["song"][0]["options"];
  return { ...day, song: [{ answer: tr01.id, options }, day.song[1], day.song[2]] };
}

describe("createGame", () => {
  it("monta 3 rodadas em andamento, na primeira etapa", () => {
    const game = song();
    expect(game.puzzleId).toBe("2026-10-08|song");
    expect(game.rounds).toHaveLength(3);
    expect(game.current).toBe(0);
    for (const r of game.rounds) {
      expect(r.status).toBe("playing");
      expect(r.stage).toBe(0);
      expect(r.attempts).toEqual([]);
    }
  });

  it("Música: a opção certa é a própria faixa", () => {
    const r = round(song());
    expect(r.trackId).toBe(day.song[0].answer);
    expect(r.correctOptionId).toBe(day.song[0].answer);
    expect(r.options).toEqual(day.song[0].options);
    expect(r.accepted).toContain(r.trackId);
  });

  it("Álbum: toca a faixa, mas a opção certa é o álbum dela", () => {
    const r = round(createGame(day, DATE, "album", "choice", index));
    const track = index.tracks.get(day.album[0].answer);
    expect(r.trackId).toBe(day.album[0].answer);
    expect(r.correctOptionId).toBe(track?.albumId);
    expect(r.options).toContain(track?.albumId);
  });

  it("rodada já nasce anulada se a resposta deixou de ser elegível (P27)", () => {
    const answer = day.song[1].answer;
    const changed: Catalog = {
      ...catalog,
      tracks: catalog.tracks.map((t) =>
        t.id === answer ? { ...t, eligible: { daily: false, reason: "blocked" } } : t,
      ) as Catalog["tracks"],
    };
    const game = createGame(day, DATE, "song", "choice", indexCatalog(changed));
    expect(game.rounds[1]?.status).toBe("void");
    expect(game.rounds[1]?.voidReason).toBe("unavailable");
  });

  it("rodada já nasce anulada se a resposta não existe no catálogo", () => {
    const ghost: Day = {
      ...day,
      song: [{ ...day.song[0], answer: "fixture:tr:fantasma" }, day.song[1], day.song[2]],
    };
    expect(createGame(ghost, DATE, "song", "choice", index).rounds[0]?.status).toBe("void");
  });
});

describe("modo 4 opções", () => {
  it("ouvir mais libera a próxima etapa", () => {
    const game = play(song(), { type: "LISTEN_MORE" }, { type: "LISTEN_MORE" });
    expect(round(game).stage).toBe(2);
    expect(unlockedSeconds(round(game))).toBe(4);
  });

  it("acertar encerra com 6 menos a etapa", () => {
    const game = play(
      song(),
      { type: "LISTEN_MORE" },
      { type: "GUESS", guessId: day.song[0].answer },
    );
    expect(round(game).status).toBe("won");
    expect(roundScore(round(game))).toBe(5);
  });

  it("errar encerra a rodada com 0", () => {
    const start = song();
    const game = reduce(start, { type: "GUESS", guessId: wrongOption(start) });
    expect(round(game).status).toBe("lost");
    expect(roundScore(round(game))).toBe(0);
  });

  it("desistir encerra com 0", () => {
    const game = reduce(song(), { type: "GIVE_UP" });
    expect(round(game).status).toBe("lost");
    expect(roundScore(round(game))).toBe(0);
  });

  it("anular (falha de áudio) encerra como void", () => {
    const game = reduce(song(), { type: "VOID", reason: "audio" });
    expect(round(game).status).toBe("void");
    expect(round(game).voidReason).toBe("audio");
  });

  it("avança de rodada só depois de encerrar", () => {
    const start = song();
    expect(reduce(start, { type: "NEXT_ROUND" })).toBe(start);
    const next = play(start, { type: "GIVE_UP" }, { type: "NEXT_ROUND" });
    expect(next.current).toBe(1);
  });

  it("o jogo termina quando as 3 rodadas encerram, mesmo sem o último NEXT_ROUND", () => {
    const game = play(
      song(),
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
    );
    expect(isFinished(game)).toBe(true);
    expect(reduce(game, { type: "NEXT_ROUND" })).toBe(game);
  });
});

describe("eventos inválidos devolvem o mesmo objeto", () => {
  it.each<[string, (s: GameState) => GameEvent]>([
    ["palpite fora das opções", () => ({ type: "GUESS", guessId: "fixture:tr:tr99" })],
    ["pular no modo 4 opções", () => ({ type: "SKIP" })],
  ])("%s", (_, event) => {
    const start = song();
    expect(reduce(start, event(start))).toBe(start);
  });

  it("ouvir mais na última etapa", () => {
    const last = play(
      song(),
      ...Array.from({ length: 5 }, () => ({ type: "LISTEN_MORE" }) as const),
    );
    expect(round(last).stage).toBe(5);
    expect(reduce(last, { type: "LISTEN_MORE" })).toBe(last);
  });

  it("qualquer evento numa rodada encerrada (menos avançar)", () => {
    const ended = reduce(song(), { type: "GIVE_UP" });
    for (const event of [
      { type: "GUESS", guessId: day.song[0].answer },
      { type: "LISTEN_MORE" },
      { type: "GIVE_UP" },
      { type: "VOID", reason: "audio" },
    ] as const) {
      expect(reduce(ended, event)).toBe(ended);
    }
  });

  it("não altera o estado recebido (imutável)", () => {
    const start = song();
    const snapshot = structuredClone(start);
    play(start, { type: "LISTEN_MORE" }, { type: "GUESS", guessId: day.song[0].answer });
    expect(start).toEqual(snapshot);
  });
});

describe("modo digitação (regras prontas para o M7)", () => {
  const typing = () => createGame(dayWithVersions(), DATE, "song", "typing", index);

  it("outra versão da mesma música conta como acerto", () => {
    const game = reduce(typing(), { type: "GUESS", guessId: "fixture:tr:tr02" });
    expect(round(game).status).toBe("won");
    expect(roundScore(round(game))).toBe(6);
  });

  it("errar e pular avançam a etapa; acertar na 3ª tentativa vale 4", () => {
    const game = play(
      typing(),
      { type: "GUESS", guessId: "fixture:tr:tr21" },
      { type: "SKIP" },
      { type: "GUESS", guessId: "fixture:tr:tr01" },
    );
    expect(round(game).attempts).toHaveLength(3);
    expect(round(game).status).toBe("won");
    expect(roundScore(round(game))).toBe(4);
  });

  it("a 6ª tentativa errada encerra com 0", () => {
    const game = play(typing(), ...Array.from({ length: 6 }, () => ({ type: "SKIP" }) as const));
    expect(round(game).status).toBe("lost");
    expect(round(game).stage).toBe(5);
  });

  it("palpite repetido e ouvir mais são ignorados", () => {
    const once = reduce(typing(), { type: "GUESS", guessId: "fixture:tr:tr21" });
    expect(reduce(once, { type: "GUESS", guessId: "fixture:tr:tr21" })).toBe(once);
    expect(reduce(once, { type: "LISTEN_MORE" })).toBe(once);
  });
});

describe("pontuação do dia (P27)", () => {
  it("rodada anulada sai do total: máximo cai de 18 para 12", () => {
    const game = play(
      song(),
      { type: "GUESS", guessId: day.song[0].answer },
      { type: "NEXT_ROUND" },
      { type: "VOID", reason: "audio" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
    );
    expect(totalScore(game)).toBe(6);
    expect(maxScore(game)).toBe(12);
    expect(maxScore(song())).toBe(18);
  });
});
