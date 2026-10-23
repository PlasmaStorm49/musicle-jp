import { describe, expect, it } from "vitest";
import { artists } from "../../test/artists.ts";
import { indexArtist } from "./catalog.ts";
import { currentRound, type GameEvent } from "./reducer.ts";
import { rulesOf } from "./rules.ts";
import {
  LIFE_BONUS,
  quitSuperfan,
  SUPERFAN_LIVES,
  type SuperfanRun,
  startSuperfan,
  superfanBonus,
  superfanErrors,
  superfanHelps,
  superfanLives,
  superfanNext,
  superfanOffset,
  superfanOutcome,
  superfanOver,
  superfanScore,
  superfanStep,
  superfanTotal,
} from "./superfan.ts";
import type { ArtistCatalog } from "./types.ts";

const NONE: ReadonlySet<string> = new Set();

function file(id: string): ArtistCatalog {
  const found = artists.files.find((a) => a.artistId === `fixture:ar:${id}`);
  if (!found) throw new Error(`artista ${id} ausente`);
  return found;
}

const ar02 = indexArtist(file("ar02")); // 4 músicas
const ar01 = indexArtist(file("ar01")); // 2 músicas

const answer = (run: SuperfanRun) => {
  const game = run.session.game;
  if (!game) throw new Error("sem música em jogo");
  return currentRound(game).trackId;
};
/** As faixas do artista que não são a resposta da música em jogo. */
const wrongs = (run: SuperfanRun, index = ar02) =>
  [...index.tracks.keys()].filter((t) => t !== answer(run));
/** Uma faixa do artista que não é a resposta da música em jogo. */
const wrong = (run: SuperfanRun, index = ar02) => {
  const id = [...index.tracks.keys()].find((t) => t !== answer(run));
  if (!id) throw new Error("artista sem outra faixa");
  return id;
};
const step = (run: SuperfanRun, ...events: GameEvent[]) => events.reduce(superfanStep, run);
const guess = (guessId: string): GameEvent => ({ type: "GUESS", guessId });
const SKIP: GameEvent = { type: "SKIP" };
const GIVE_UP: GameEvent = { type: "GIVE_UP" };
const next = (run: SuperfanRun, index = ar02) => superfanNext(run, index, NONE);
/** As opções da ajuda: a resposta e uma outra (o reducer pede ao menos 2). */
const help = (run: SuperfanRun): GameEvent => ({
  type: "HELP",
  options: [answer(run), wrong(run)],
});

describe("startSuperfan", () => {
  it("a 1ª música, com as regras do Superfan (3 trechos de 1, 4 e 9 s)", () => {
    const run = startSuperfan(1, ar02, NONE);
    const game = run.session.game;
    expect(game?.variant).toBe("superfan");
    expect(game && rulesOf(game).stages).toEqual([1, 4, 9]);
    expect(run.session.number).toBe(1);
    expect(run).toMatchObject({ errors: 0, helps: 0, right: 0, end: null });
  });
});

describe("os pontos de cada música (ME107)", () => {
  const start = () => startSuperfan(2, ar02, NONE);

  it.each([
    ["no trecho de 1 s", 0, 10],
    ["no de 4 s", 1, 6],
    ["no de 9 s", 2, 4],
  ])("acertar %s (%s pulos antes) vale %s", (_, skips, points) => {
    let run = start();
    run = step(run, ...Array.from({ length: skips }, () => SKIP));
    run = step(run, guess(answer(run)));
    expect(superfanScore(run).points).toBe(points);
  });

  it("o palpite errado custa uma vida, e não pontos, e passa para a etapa seguinte (P158)", () => {
    let run = step(start(), guess(wrong(start())));
    const game = run.session.game;
    expect(game && currentRound(game).status).toBe("playing");
    expect(game && currentRound(game).stage).toBe(1);
    expect(superfanErrors(run)).toBe(1);
    expect(superfanLives(run)).toBe(SUPERFAN_LIVES - 1);
    expect(superfanScore(run).points).toBe(0);
    run = step(run, guess(answer(run)));
    expect(superfanScore(run).points).toBe(6); // o acerto no trecho de 4 s
  });

  it("a ajuda vale logo de cara (P159); acertar com ela vale a metade do trecho: 5 no 1 s", () => {
    let run = start();
    run = step(run, help(run));
    expect(superfanHelps(run)).toBe(1);
    run = step(run, guess(answer(run)));
    expect(superfanScore(run).points).toBe(5);
  });

  it("desistir custa uma vida, como errar (P290), e vale 0", () => {
    const run = step(start(), GIVE_UP);
    const game = run.session.game;
    expect(game && currentRound(game)).toMatchObject({ status: "lost", gaveUp: true });
    expect(superfanErrors(run)).toBe(1);
    expect(superfanLives(run)).toBe(2);
    expect(superfanScore(run).points).toBe(0);
  });

  it("desistir depois de um erro: duas vidas (P290)", () => {
    let run = step(start(), guess(wrong(start())));
    run = step(run, GIVE_UP);
    expect(superfanErrors(run)).toBe(2);
    expect(superfanLives(run)).toBe(1);
    expect(superfanScore(run).points).toBe(0);
  });

  it("desistir com a ajuda na tela também custa a vida: a ajuda não vira saída de graça", () => {
    let run = start();
    run = step(run, help(run), GIVE_UP);
    expect(superfanHelps(run)).toBe(1);
    expect(superfanErrors(run)).toBe(1);
    expect(superfanScore(run).points).toBe(0);
  });

  it("desistir com 2 erros é o 3º: a partida acaba no fim da música (P290)", () => {
    let run = startSuperfan(3, ar02, NONE);
    const [w1, w2] = wrongs(run);
    run = step(run, guess(w1 ?? ""), guess(w2 ?? ""), guess(answer(run)));
    run = next(run);
    run = step(run, GIVE_UP);
    expect(superfanErrors(run)).toBe(3);
    expect(superfanLives(run)).toBe(0);
    expect(superfanOver(run)).toBe(true);
    expect(next(run).end).toBe("errors");
  });

  it("errar com a ajuda custa uma vida e encerra a música (P151)", () => {
    let run = start();
    run = step(run, help(run), guess(wrong(run)));
    const game = run.session.game;
    expect(game && currentRound(game).status).toBe("lost");
    expect(superfanErrors(run)).toBe(1);
    expect(superfanScore(run).points).toBe(0);
  });

  it("pular a última etapa (a tela não oferece) é desistir: uma vida (P290)", () => {
    const run = step(start(), SKIP, SKIP, SKIP);
    const game = run.session.game;
    expect(game && currentRound(game)).toMatchObject({ status: "lost", gaveUp: true });
    expect(superfanScore(run).points).toBe(0);
    expect(superfanErrors(run)).toBe(1);
  });

  it("o placar nunca fica negativo, com qualquer erro", () => {
    let run = start();
    run = step(run, guess(wrong(run)), GIVE_UP);
    expect(superfanScore(run).points).toBe(0);
    expect(superfanTotal(run)).toBe(0);
  });
});

describe("as vidas e o bônus (ME107)", () => {
  it("o bônus é só da partida completa: 5 por vida que sobrou", () => {
    expect(SUPERFAN_LIVES).toBe(3);
    expect(LIFE_BONUS).toBe(5);
    // As 2 músicas do ar01 acertadas no 1 s: 20, e as 3 vidas, +15.
    let run = startSuperfan(5, ar01, NONE);
    run = step(run, guess(answer(run)));
    run = next(run, ar01);
    run = step(run, guess(answer(run)));
    expect(superfanBonus(run)).toBe(0); // ainda em jogo
    run = next(run, ar01);
    expect(run.end).toBe("done");
    expect(superfanBonus(run)).toBe(15);
    expect(superfanTotal(run)).toBe(35);
  });

  it("uma vida perdida tira 5 do bônus", () => {
    let run = startSuperfan(5, ar01, NONE);
    run = step(run, guess(wrong(run, ar01)), guess(answer(run)));
    run = next(run, ar01);
    run = step(run, guess(answer(run)));
    run = next(run, ar01);
    expect(run.end).toBe("done");
    expect(superfanScore(run).points).toBe(16); // 6 + 10
    expect(superfanBonus(run)).toBe(10);
    expect(superfanTotal(run)).toBe(26);
  });

  it("encerrar a partida não dá bônus, mesmo com vidas", () => {
    let run = startSuperfan(5, ar01, NONE);
    run = step(run, guess(answer(run)));
    run = quitSuperfan(next(run, ar01));
    expect(run.end).toBe("quit");
    expect(superfanLives(run)).toBe(3);
    expect(superfanBonus(run)).toBe(0);
    expect(superfanTotal(run)).toBe(10);
  });
});

describe("a partida (P119, P153)", () => {
  it("o 3º erro, em qualquer música, encerra a música na hora e a partida no fim dela", () => {
    let run = startSuperfan(3, ar02, NONE);
    const [w1, w2] = wrongs(run);
    run = step(run, guess(w1 ?? ""), guess(w2 ?? "")); // dois palpites errados diferentes
    run = step(run, guess(answer(run)));
    run = next(run);
    expect(superfanErrors(run)).toBe(2);
    expect(superfanOver(run)).toBe(false);
    run = step(run, guess(wrong(run)));
    const game = run.session.game;
    expect(game && currentRound(game).status).toBe("lost"); // encerrada na hora
    expect(game && currentRound(game).gaveUp).toBe(false); // quem encerrou foi a partida
    expect(superfanOver(run)).toBe(true);
    run = next(run);
    expect(run.end).toBe("errors");
    expect(run.session.game).toBeNull();
    expect(run.right).toBe(1);
    // O acerto no trecho de 9 s: 4. Sem vidas, sem bônus.
    expect(superfanScore(run).points).toBe(4);
    expect(superfanTotal(run)).toBe(4);
  });

  it("no máximo 3 ajudas na partida: a 4ª não vale", () => {
    let run = startSuperfan(4, ar02, NONE);
    for (let i = 0; i < 3; i++) {
      run = step(run, help(run), guess(answer(run)));
      run = next(run);
    }
    expect(superfanHelps(run)).toBe(3);
    const before = run;
    expect(step(run, help(run))).toBe(before);
  });

  it("todas as músicas tocaram: a partida acaba, cada uma uma vez", () => {
    let run = startSuperfan(5, ar01, NONE);
    const seen = [answer(run)];
    run = step(run, guess(answer(run)));
    run = next(run, ar01);
    seen.push(answer(run));
    run = step(run, guess(answer(run)));
    run = next(run, ar01);
    expect(new Set(seen).size).toBe(2);
    expect(run.end).toBe("done");
    expect(run.right).toBe(2);
    expect(superfanScore(run)).toEqual({ points: 20, rounds: 2 });
  });

  it("encerrar no meio da música: ela termina como desistida, e os erros dela contam, mas não a vida do desistir", () => {
    let run = startSuperfan(6, ar02, NONE);
    run = step(run, guess(wrong(run)));
    run = quitSuperfan(run);
    expect(run.end).toBe("quit");
    expect(run.errors).toBe(1);
    expect(superfanScore(run)).toEqual({ points: 0, rounds: 1 });
    expect(superfanStep(run, SKIP)).toBe(run); // acabou: nada mais muda
  });

  it("desistir e, com a revelação na tela, encerrar a partida: o erro fica (P290)", () => {
    let run = startSuperfan(6, ar02, NONE);
    run = step(run, GIVE_UP);
    run = quitSuperfan(run);
    expect(run.end).toBe("quit");
    expect(run.errors).toBe(1);
    expect(superfanScore(run)).toEqual({ points: 0, rounds: 1 });
  });

  it("com a música em jogo, a próxima não sai", () => {
    const run = startSuperfan(7, ar02, NONE);
    expect(next(run)).toBe(run);
  });

  it("a música anulada (falha de áudio) não conta: nem os erros, nem a ajuda (P162)", () => {
    let run = startSuperfan(10, ar02, NONE);
    const [w1, w2] = wrongs(run);
    // As opções da ajuda não podem repetir o palpite já tentado.
    run = step(run, guess(w1 ?? ""), { type: "HELP", options: [answer(run), w2 ?? ""] });
    expect(superfanErrors(run)).toBe(1);
    expect(superfanHelps(run)).toBe(1);
    run = step(run, { type: "VOID", round: 0, reason: "audio" });
    expect(superfanErrors(run)).toBe(0);
    expect(superfanHelps(run)).toBe(0);
    expect(superfanScore(run)).toEqual({ points: 0, rounds: 0 });
    run = next(run);
    expect(run).toMatchObject({ errors: 0, helps: 0, right: 0, end: null });
    expect(superfanScore(run)).toEqual({ points: 0, rounds: 0 });
  });

  it("errar a opção da ajuda como 3º erro encerra a partida", () => {
    let run = startSuperfan(3, ar02, NONE);
    const [w1, w2] = wrongs(run);
    run = step(run, guess(w1 ?? ""), guess(w2 ?? ""), guess(answer(run)));
    run = next(run);
    run = step(run, help(run), guess(wrong(run)));
    expect(superfanErrors(run)).toBe(3);
    expect(superfanOver(run)).toBe(true);
    run = next(run);
    expect(run.end).toBe("errors");
    expect(superfanScore(run).points).toBe(4);
  });

  it("com uma música de fora (diário de hoje): ela e as do álbum dela não tocam, e a partida acaba nas outras", () => {
    // 開幕ベル e カーテンコール são do mesmo álbum (al21): a revelação de uma mostraria a capa da outra.
    const key = (title: string) => `${title}|fixture:ar:ar02`;
    const excluded = new Set([key("開幕べる")]);
    let run = startSuperfan(11, ar02, excluded);
    const seen: string[] = [];
    while (run.end === null) {
      seen.push(ar02.tracks.get(answer(run))?.songKey ?? "");
      run = step(run, guess(answer(run)));
      run = superfanNext(run, ar02, excluded);
    }
    expect(run.end).toBe("done");
    expect(seen.sort()).toEqual([key("ふたりの約束"), key("真夜中の観覧車")].sort());
    expect(superfanScore(run)).toEqual({ points: 20, rounds: 2 });
  });
});

describe("a partida sem música", () => {
  it("todas as músicas excluídas (os diários de hoje): acaba antes de começar, sem rodada", () => {
    const all = new Set(ar01.tracksBySong.keys());
    const run = startSuperfan(8, ar01, all);
    expect(run.end).toBe("done");
    expect(run.session.game).toBeNull();
    expect(superfanScore(run)).toEqual({ points: 0, rounds: 0 });
    // Termina "completa" e com as 3 vidas, mas sem música jogada não há bônus.
    expect(superfanBonus(run)).toBe(0);
    expect(superfanTotal(run)).toBe(0);
  });

  it("encerrar depois do 3º erro fecha a partida pelos erros, e não por encerrar", () => {
    let run = startSuperfan(3, ar02, NONE);
    const [w1, w2] = wrongs(run);
    run = step(run, guess(w1 ?? ""), guess(w2 ?? ""), guess(answer(run)));
    run = next(run);
    run = step(run, guess(wrong(run)));
    expect(superfanOver(run)).toBe(true);
    expect(quitSuperfan(run).end).toBe("errors");
  });
});

describe("superfanOutcome (o que o save guarda do fim, P285 e P289)", () => {
  /** A partida inteira do ar01 (2 músicas), com os eventos de cada uma antes do acerto. */
  const play = (...before: ((run: SuperfanRun) => GameEvent[])[]) => {
    let run = startSuperfan(5, ar01, NONE);
    for (const events of before) {
      run = step(run, ...events(run), guess(answer(run)));
      run = next(run, ar01);
    }
    return run;
  };
  const nothing = () => [];

  it("tudo de primeira, no trecho de 1 s: terminou e perfeita", () => {
    const run = play(nothing, nothing);
    expect(run.end).toBe("done");
    expect(superfanOutcome(run)).toEqual({ done: true, perfect: true });
  });

  it.each([
    ["um palpite errado", (run: SuperfanRun) => [guess(wrong(run, ar01))]],
    [
      "a ajuda (vale a metade)",
      (run: SuperfanRun) => [
        { type: "HELP", options: [answer(run), wrong(run, ar01)] } as GameEvent,
      ],
    ],
    ["o acerto no trecho de 4 s", () => [SKIP]],
  ])("com %s numa música: terminou, mas não perfeita", (_, before) => {
    expect(superfanOutcome(play(before, nothing))).toEqual({ done: true, perfect: false });
  });

  it("com uma música anulada (falha de áudio): terminou, mas não perfeita (P291)", () => {
    let run = startSuperfan(5, ar01, NONE);
    run = step(run, { type: "VOID", round: 0, reason: "falha" });
    run = next(run, ar01);
    run = step(run, guess(answer(run)));
    run = next(run, ar01);
    expect(run.end).toBe("done");
    expect(superfanScore(run)).toEqual({ points: 10, rounds: 1 });
    expect(superfanOutcome(run)).toEqual({ done: true, perfect: false });
  });

  it("encerrada ou acabada nos erros: nada", () => {
    expect(superfanOutcome(quitSuperfan(startSuperfan(5, ar01, NONE)))).toEqual({
      done: false,
      perfect: false,
    });
    let run = startSuperfan(3, ar02, NONE);
    const [w1, w2] = wrongs(run);
    run = step(run, guess(w1 ?? ""), guess(w2 ?? ""), guess(answer(run)));
    run = next(run);
    run = next(step(run, guess(wrong(run))));
    expect(run.end).toBe("errors");
    expect(superfanOutcome(run)).toEqual({ done: false, perfect: false });
  });

  it("sem nenhuma música (todas fora, P141): não termina nada", () => {
    const run = startSuperfan(8, ar01, new Set(ar01.tracksBySong.keys()));
    expect(run.end).toBe("done");
    expect(superfanOutcome(run)).toEqual({ done: false, perfect: false });
  });
});

describe("superfanOffset (o começo sorteado do trecho)", () => {
  it("entre 0 e 19 s numa prévia de 30 s, o mesmo para a mesma música da partida", () => {
    const starts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const at = superfanOffset(9, `treino|song|0|${i}`, 30);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThanOrEqual(19);
      starts.add(at);
    }
    expect(starts.size).toBeGreaterThan(5);
    expect(superfanOffset(9, "treino|song|0|3", 30)).toBe(superfanOffset(9, "treino|song|0|3", 30));
    expect(superfanOffset(9, "treino|song|0|3", null)).toBe(
      superfanOffset(9, "treino|song|0|3", 30),
    );
  });

  it("prévia curta demais para 9 s com folga: começa do início", () => {
    expect(superfanOffset(9, "x", 10)).toBe(0);
  });
});
