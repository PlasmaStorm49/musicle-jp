import { describe, expect, it } from "vitest";
import { catalog, schedule } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import { recordMax, recordScore } from "./records.ts";
import {
  createGame,
  createRounds,
  currentRound,
  type GameEvent,
  type GameState,
  isFinished,
  reduce,
  roundScore,
  unlockedSeconds,
} from "./reducer.ts";
import type { Catalog, Day } from "./types.ts";

const index = indexCatalog(catalog);
const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;

/** O Normal: o álbum, entre 4 opções. */
const normal = () => createGame(day, DATE, "album", index);
const play = (state: GameState, ...events: GameEvent[]) => events.reduce(reduce, state);
const round = (state: GameState) => currentRound(state);
const right = (state: GameState) => round(state).correctOptionId;
const wrongOption = (state: GameState) =>
  round(state).options.find((o) => !round(state).accepted.includes(o)) as string;

/** Dia sintético cuja rodada 1 do Desafio é a tr01, que tem outras versões (tr02 e tr03). */
function dayWithVersions(): Day {
  const tr01 = index.tracks.get("fixture:tr:tr01");
  if (!tr01) throw new Error("tr01 ausente");
  return { ...day, song: [{ ...day.song[0], answer: tr01.id }, day.song[1], day.song[2]] };
}

describe("createGame", () => {
  it("monta 3 rodadas em andamento, na primeira etapa", () => {
    const game = normal();
    expect(game.puzzleId).toBe("2026-10-08|album");
    expect(game.rounds).toHaveLength(3);
    expect(game.current).toBe(0);
    for (const r of game.rounds) {
      expect(r.status).toBe("playing");
      expect(r.stage).toBe(0);
      expect(r.attempts).toEqual([]);
    }
  });

  it("Normal: toca a faixa, e a resposta é o álbum dela, entre as 4 opções", () => {
    const r = round(normal());
    const track = index.tracks.get(day.album[0].answer);
    expect(r.trackId).toBe(day.album[0].answer);
    expect(r.correctOptionId).toBe(track?.albumId);
    expect(r.options).toEqual(day.album[0].options);
  });

  it("Desafio: a resposta é a própria faixa, sem opções (é digitado)", () => {
    // Os dias antigos da agenda ainda trazem opções de música (a agenda só cresce): o Desafio
    // as ignora.
    const r = round(createGame(day, DATE, "song", index));
    expect(r.trackId).toBe(day.song[0].answer);
    expect(r.correctOptionId).toBe(day.song[0].answer);
    expect(r.options).toEqual([]);
    expect(r.accepted).toContain(r.trackId);
  });

  it("Desafio: rodada de música sem opções, como nos dias novos da agenda", () => {
    const [r] = createRounds([{ answer: day.song[0].answer }], "song", index);
    expect(r?.status).toBe("playing");
    expect(r?.options).toEqual([]);
  });

  it("createRounds monta as mesmas rodadas que o createGame (o Treino usa só ele)", () => {
    expect(createRounds(day.song, "song", index)).toEqual(
      createGame(day, DATE, "song", index).rounds,
    );
    expect(createRounds(day.album, "album", index)).toEqual(normal().rounds);
  });

  it("jogo de uma rodada só (Treino) termina no palpite, e avançar não faz nada", () => {
    const one: GameState = { ...normal(), rounds: createRounds([day.album[0]], "album", index) };
    const done = play(one, { type: "GUESS", guessId: right(one) });
    expect(isFinished(done)).toBe(true);
    expect(roundScore(round(done))).toBe(6);
    expect(reduce(done, { type: "NEXT_ROUND" })).toBe(done);
  });

  it("rodada já nasce anulada se a resposta deixou de ser elegível (P27)", () => {
    const answer = day.album[1].answer;
    const changed: Catalog = {
      ...catalog,
      tracks: catalog.tracks.map((t) =>
        t.id === answer ? { ...t, eligible: { daily: false, reason: "blocked" } } : t,
      ) as Catalog["tracks"],
    };
    const game = createGame(day, DATE, "album", indexCatalog(changed));
    expect(game.rounds[1]?.status).toBe("void");
    expect(game.rounds[1]?.voidReason).toBe("unavailable");
  });

  it("rodada já nasce anulada se a resposta não existe no catálogo", () => {
    const ghost: Day = {
      ...day,
      song: [{ ...day.song[0], answer: "fixture:tr:fantasma" }, day.song[1], day.song[2]],
    };
    expect(createGame(ghost, DATE, "song", index).rounds[0]?.status).toBe("void");
  });
});

describe("Normal (4 opções)", () => {
  it("ouvir mais libera a próxima etapa", () => {
    const game = play(normal(), { type: "LISTEN_MORE" }, { type: "LISTEN_MORE" });
    expect(round(game).stage).toBe(2);
    expect(unlockedSeconds(round(game))).toBe(4);
  });

  it("acertar encerra com 6 menos a etapa", () => {
    const start = normal();
    const game = play(start, { type: "LISTEN_MORE" }, { type: "GUESS", guessId: right(start) });
    expect(round(game).status).toBe("won");
    expect(roundScore(round(game))).toBe(5);
  });

  it("errar encerra a rodada com 0", () => {
    const start = normal();
    const game = reduce(start, { type: "GUESS", guessId: wrongOption(start) });
    expect(round(game).status).toBe("lost");
    expect(roundScore(round(game))).toBe(0);
  });

  it("desistir encerra com 0", () => {
    const game = reduce(normal(), { type: "GIVE_UP" });
    expect(round(game).status).toBe("lost");
    expect(roundScore(round(game))).toBe(0);
  });

  it("anular (falha de áudio) encerra como void", () => {
    const game = reduce(normal(), { type: "VOID", round: 0, reason: "audio" });
    expect(round(game).status).toBe("void");
    expect(round(game).voidReason).toBe("audio");
  });

  it("anular outra rodada que não a atual é ignorado (falha de pré-carregamento)", () => {
    const start = normal();
    expect(reduce(start, { type: "VOID", round: 1, reason: "audio" })).toBe(start);
  });

  it("avança de rodada só depois de encerrar", () => {
    const start = normal();
    expect(reduce(start, { type: "NEXT_ROUND" })).toBe(start);
    const next = play(start, { type: "GIVE_UP" }, { type: "NEXT_ROUND" });
    expect(next.current).toBe(1);
  });

  it("o jogo termina quando as 3 rodadas encerram, mesmo sem o último NEXT_ROUND", () => {
    const game = play(
      normal(),
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
  it.each<[string, GameEvent]>([
    ["palpite fora das opções no Normal", { type: "GUESS", guessId: "fixture:al:al99" }],
    ["pular no Normal", { type: "SKIP" }],
  ])("%s", (_, event) => {
    const start = normal();
    expect(reduce(start, event)).toBe(start);
  });

  it("ouvir mais na última etapa", () => {
    const last = play(
      normal(),
      ...Array.from({ length: 5 }, () => ({ type: "LISTEN_MORE" }) as const),
    );
    expect(round(last).stage).toBe(5);
    expect(reduce(last, { type: "LISTEN_MORE" })).toBe(last);
  });

  it("qualquer evento numa rodada encerrada (menos avançar)", () => {
    const start = normal();
    const ended = reduce(start, { type: "GIVE_UP" });
    for (const event of [
      { type: "GUESS", guessId: right(start) },
      { type: "LISTEN_MORE" },
      { type: "GIVE_UP" },
      { type: "VOID", round: 0, reason: "audio" },
    ] as const) {
      expect(reduce(ended, event)).toBe(ended);
    }
  });

  it("não altera o estado recebido (imutável)", () => {
    const start = normal();
    const snapshot = structuredClone(start);
    play(start, { type: "LISTEN_MORE" }, { type: "GUESS", guessId: right(start) });
    expect(start).toEqual(snapshot);
  });
});

describe("Desafio (digitação)", () => {
  const desafio = () => createGame(dayWithVersions(), DATE, "song", index);

  it("outra versão da mesma música conta como acerto", () => {
    const game = reduce(desafio(), { type: "GUESS", guessId: "fixture:tr:tr02" });
    expect(round(game).status).toBe("won");
    expect(roundScore(round(game))).toBe(6);
  });

  it("errar e pular avançam a etapa; acertar na 3ª tentativa vale 4", () => {
    const game = play(
      desafio(),
      { type: "GUESS", guessId: "fixture:tr:tr21" },
      { type: "SKIP" },
      { type: "GUESS", guessId: "fixture:tr:tr01" },
    );
    expect(round(game).attempts).toHaveLength(3);
    expect(round(game).status).toBe("won");
    expect(roundScore(round(game))).toBe(4);
  });

  it("a 6ª tentativa errada encerra com 0", () => {
    const game = play(desafio(), ...Array.from({ length: 6 }, () => ({ type: "SKIP" }) as const));
    expect(round(game).status).toBe("lost");
    expect(round(game).stage).toBe(5);
  });

  it("palpite repetido e ouvir mais são ignorados", () => {
    const once = reduce(desafio(), { type: "GUESS", guessId: "fixture:tr:tr21" });
    expect(reduce(once, { type: "GUESS", guessId: "fixture:tr:tr21" })).toBe(once);
    expect(reduce(once, { type: "LISTEN_MORE" })).toBe(once);
  });
});

describe("pontuação do dia (P27)", () => {
  it("rodada anulada sai do total: máximo cai de 18 para 12", () => {
    const start = normal();
    const game = play(
      start,
      { type: "GUESS", guessId: right(start) },
      { type: "NEXT_ROUND" },
      { type: "VOID", round: 1, reason: "audio" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
    );
    // A mesma conta do histórico (records.ts) vale para o jogo em andamento.
    expect(recordScore(game)).toBe(6);
    expect(recordMax(game)).toBe(12);
    expect(recordMax(normal())).toBe(18);
  });
});
