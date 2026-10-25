// As Misturadas (M17) no núcleo: o descritor, o reducer (o acerto que não abre trecho, o erro e o
// pulo que abrem, o fim no último trecho), os pontos e o save. Sobre a agenda fictícia de 08/10.
import { describe, expect, it } from "vitest";
import { animeCatalog, mixedSchedule } from "../../test/fixtures.ts";
import { indexAnime } from "./catalog.ts";
import {
  createMixedGame,
  findPoints,
  isMixedFinished,
  MIXED_KEYS,
  type MixedEvent,
  type MixedGame,
  type MixedState,
  mixedDailies,
  mixedDaily,
  mixedDone,
  mixedIds,
  mixedMax,
  mixedReducer,
  mixedRoundScore,
  mixedRoundTag,
  mixedScore,
  mixedShareText,
  mixedStatusOf,
  replaceMixedProgress,
  startMixedSession,
  toMixedGame,
  withMixedFinished,
  withMixedProgress,
} from "./mixed.ts";
import { emptySave, pruneProgress, type Save } from "./records.ts";
import type { MixedDay } from "./types.ts";

const index = indexAnime(animeCatalog);
const DATE = "2026-10-08";
const day = mixedSchedule.days[DATE] as MixedDay;
const tr = (n: string) => `fixture:tr:tr${n}`;
const fr = (name: string) => `anime:fr:${name}`;

/** A rodada 1 do "acertar a música" de 08/10: tr21 e tr33. A 4ª tem 3: tr24, tr26 e tr31. */
const musica = () => mixedDaily(day, DATE, "musica");
/** A rodada 1 do "acertar o anime": Hoshizora Kaizoku (tr41) e Nana-iro (tr19). */
const titulo = () => mixedDaily(day, DATE, "titulo");

function play(state: MixedState, ...events: MixedEvent[]): MixedState {
  return events.reduce(mixedReducer, state);
}

const guess = (guessId: string): MixedEvent => ({ type: "GUESS", guessId });
const NEXT: MixedEvent = { type: "NEXT_ROUND" };
const GIVE_UP: MixedEvent = { type: "GIVE_UP" };

describe("o diário das Misturadas", () => {
  it("o id, o número, o que se acerta e as rodadas da agenda", () => {
    const daily = musica();
    expect(daily.id).toBe("2026-10-08|misturadas-musica");
    expect(daily.number).toBe(day.number);
    expect(daily.answer).toBe("track");
    expect(titulo().answer).toBe("franchise");
    expect(daily.rounds.map((r) => r.length)).toEqual([2, 2, 2, 3]);
    expect(mixedDailies(day, DATE).map((d) => d.key)).toEqual(MIXED_KEYS);
    expect(mixedIds(DATE)).toEqual([
      "2026-10-08|misturadas-musica",
      "2026-10-08|misturadas-titulo",
    ]);
  });

  it("cada música aceita as versões dela ou, no acertar o anime, as franquias", () => {
    const [first] = createMixedGame(musica(), index).rounds;
    expect(first?.songs.map((s) => s.accepted.includes(s.trackId))).toEqual([true, true]);
    const [anime] = createMixedGame(titulo(), index).rounds;
    expect(anime?.songs.map((s) => s.accepted)).toEqual([
      [fr("hoshizora_kaizoku")],
      [fr("nana_iro")],
    ]);
  });

  it("uma faixa que sumiu do catálogo anula a rodada inteira", () => {
    const daily = {
      ...musica(),
      rounds: [[tr("21"), "fixture:tr:sumiu"], ...musica().rounds.slice(1)],
    };
    const [round] = createMixedGame(daily, index).rounds;
    expect(round?.status).toBe("void");
    expect(round?.voidReason).toBe("unavailable");
  });
});

describe("o reducer das Misturadas", () => {
  const start = () => createMixedGame(musica(), index);

  it("o acerto marca a música no trecho de agora e não abre o seguinte", () => {
    const state = play(start(), guess(tr("33")));
    const round = state.rounds[0];
    expect(round?.songs.map((s) => s.found)).toEqual([null, 0]);
    expect(round?.stage).toBe(0);
    expect(round?.status).toBe("playing");
  });

  it("achar todas encerra a rodada", () => {
    const state = play(start(), guess(tr("21")), guess(tr("33")));
    expect(state.rounds[0]?.status).toBe("done");
    expect(mixedRoundScore({ status: "done", found: [{ stage: 0 }, { stage: 0 }] })).toBe(10);
  });

  it("o erro e o pulo abrem o trecho seguinte; o erro no último encerra", () => {
    const wrong = guess(tr("36")); // uma música do dia, mas de outra rodada
    let state = play(start(), wrong, { type: "SKIP" });
    expect(state.rounds[0]?.stage).toBe(2);
    state = play(state, guess(tr("21")));
    expect(state.rounds[0]?.songs[0]?.found).toBe(2);
    state = play(state, { type: "SKIP" }, guess(tr("09")));
    expect(state.rounds[0]?.stage).toBe(3);
    expect(state.rounds[0]?.status).toBe("done");
    expect(state.rounds[0]?.songs.map((s) => s.found)).toEqual([2, null]);
  });

  it("no último trecho, o pulo não existe", () => {
    const last = play(start(), { type: "SKIP" }, { type: "SKIP" }, { type: "SKIP" });
    expect(last.rounds[0]?.stage).toBe(3);
    expect(mixedReducer(last, { type: "SKIP" })).toBe(last);
  });

  it("o palpite repetido, ou que acha uma música já achada, devolve o mesmo objeto", () => {
    const found = play(start(), guess(tr("21")));
    expect(mixedReducer(found, guess(tr("21")))).toBe(found);
    const wrong = play(start(), guess(tr("36")));
    expect(mixedReducer(wrong, guess(tr("36")))).toBe(wrong);
  });

  it("no acertar o anime, a franquia acha a música", () => {
    const state = play(createMixedGame(titulo(), index), guess(fr("nana_iro")));
    expect(state.rounds[0]?.songs.map((s) => s.found)).toEqual([null, 0]);
  });

  it("o Separar vale uma vez, e as achadas depois dele valem os pontos da ajuda", () => {
    const before = play(start(), guess(tr("21")));
    const separated = play(before, { type: "SEPARATE" });
    expect(mixedReducer(separated, { type: "SEPARATE" })).toBe(separated);
    const done = play(separated, guess(tr("33")));
    expect(done.rounds[0]?.songs.map((s) => s.helped)).toEqual([false, true]);
    // (10 + 5) / 2 = 7,5: o inteiro mais perto, 8.
    expect(
      toMixedGame(play(done, NEXT, GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP), 1, false).rounds[0],
    ).toEqual({
      status: "done",
      found: [{ stage: 0 }, { stage: 0, help: true }],
    });
  });

  it("desistir encerra com as que faltam; a rodada seguinte só depois do fim", () => {
    const state = start();
    expect(mixedReducer(state, NEXT)).toBe(state);
    const gaveUp = play(state, guess(tr("21")), GIVE_UP);
    expect(gaveUp.rounds[0]?.status).toBe("done");
    expect(play(gaveUp, NEXT).current).toBe(1);
  });

  it("a falha de áudio anula só a rodada atual", () => {
    const state = start();
    expect(mixedReducer(state, { type: "VOID", round: 1, reason: "audio" })).toBe(state);
    const voided = play(state, { type: "VOID", round: 0, reason: "audio" });
    expect(voided.rounds[0]?.status).toBe("void");
    expect(mixedReducer(voided, guess(tr("21")))).toBe(voided);
  });

  it("depois da última rodada, o jogo acabou e o NEXT_ROUND não anda", () => {
    const end = play(start(), GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP);
    expect(isMixedFinished(end)).toBe(true);
    expect(mixedReducer(end, NEXT)).toBe(end);
  });
});

describe("os pontos das Misturadas", () => {
  it("cada música vale pelo trecho em que foi achada, e a da ajuda, a metade", () => {
    expect([0, 1, 2, 3].map((stage) => findPoints({ stage }))).toEqual([10, 7, 5, 3]);
    expect([0, 1, 2, 3].map((stage) => findPoints({ stage, help: true }))).toEqual([5, 4, 3, 2]);
    expect(findPoints(null)).toBe(0);
  });

  it("a rodada é a média, arredondada; a anulada vale 0 e sai do máximo", () => {
    expect(mixedRoundScore({ status: "done", found: [{ stage: 0 }, null] })).toBe(5);
    expect(
      mixedRoundScore({ status: "done", found: [{ stage: 0 }, { stage: 0 }, { stage: 1 }] }),
    ).toBe(9);
    const game: MixedGame = {
      number: 1,
      rounds: [
        { status: "done", found: [{ stage: 0 }, { stage: 0 }] },
        { status: "void", found: [null, null] },
        { status: "done", found: [{ stage: 3 }, null] },
        { status: "done", found: [null, null, null] },
      ],
    };
    expect(mixedScore(game)).toBe(10 + 0 + 2 + 0);
    expect(mixedMax(game)).toBe(30);
  });
});

describe("as Misturadas no save", () => {
  const daily = musica();
  const events: MixedEvent[] = [guess(tr("21")), guess(tr("33")), NEXT];

  it("retoma pelos eventos salvos, e o evento que não vale mais marca a lista para trocar", () => {
    const save: Save = {
      ...emptySave(),
      mixed: { finished: {}, progress: { [daily.id]: { events: [...events, NEXT] } } },
    };
    const session = startMixedSession(save, daily, index, DATE);
    expect(session.kind).toBe("playing");
    if (session.kind !== "playing") return;
    expect(session.state.current).toBe(1);
    expect(session.events).toEqual(events);
    expect(session.stale).toBe(true);
  });

  it("a repetição que termina o jogo volta como terminado (o término que não chegou a gravar)", () => {
    const end: MixedEvent[] = [GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP];
    const save: Save = {
      ...emptySave(),
      mixed: { finished: {}, progress: { [daily.id]: { events: end } } },
    };
    const session = startMixedSession(save, daily, index, DATE);
    expect(session.kind).toBe("finished");
    if (session.kind !== "finished") return;
    expect(session.game.number).toBe(daily.number);
    expect(session.game.rounds.map((r) => r.status)).toEqual(["done", "done", "done", "done"]);
  });

  it("terminado depois do dia dele (pelo Histórico), o jogo leva a marca do jogado depois", () => {
    const end: MixedEvent[] = [GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP, NEXT, GIVE_UP];
    const save: Save = {
      ...emptySave(),
      mixed: { finished: {}, progress: { [daily.id]: { events: end } } },
    };
    const later = startMixedSession(save, daily, index, "2026-10-09");
    expect(later.kind === "finished" && later.game.late).toBe(true);
    // No dia, sem a marca.
    const sameDay = startMixedSession(save, daily, index, DATE);
    expect(sameDay.kind === "finished" && "late" in sameDay.game).toBe(false);
    // O cartão diz que foi jogado depois.
    if (later.kind !== "finished") return;
    const done: Save = {
      ...emptySave(),
      mixed: { finished: { [daily.id]: later.game }, progress: {} },
    };
    expect(mixedStatusOf(done, daily)).toMatchObject({ kind: "done", late: true });
  });

  it("o terminado volta como está", () => {
    const game: MixedGame = { number: 1, rounds: [] };
    const save: Save = { ...emptySave(), mixed: { finished: { [daily.id]: game }, progress: {} } };
    expect(startMixedSession(save, daily, index, DATE)).toEqual({ kind: "finished", game });
  });

  it("o andamento mais longo vence, e o término limpa o andamento", () => {
    const longer = withMixedProgress(emptySave(), daily.id, { events });
    expect(withMixedProgress(longer, daily.id, { events: events.slice(0, 1) })).toBe(longer);
    expect(replaceMixedProgress(longer, daily.id, { events: [] }).mixed.progress[daily.id]).toEqual(
      {
        events: [],
      },
    );
    const game: MixedGame = { number: 1, rounds: [] };
    const done = withMixedFinished(longer, daily.id, game);
    expect(done.mixed).toEqual({ finished: { [daily.id]: game }, progress: {} });
    expect(withMixedFinished(done, daily.id, { number: 2, rounds: [] })).toBe(done);
    expect(withMixedProgress(done, daily.id, { events })).toBe(done);
  });

  it("o ✓ da aba com os 2 diários de hoje terminados", () => {
    const game: MixedGame = { number: 1, rounds: [] };
    const one = withMixedFinished(emptySave(), daily.id, game);
    expect(mixedDone(one, DATE)).toBe(false);
    expect(mixedDone(withMixedFinished(one, titulo().id, game), DATE)).toBe(true);
  });

  it("a abertura limpa o andamento das Misturadas que não é de hoje", () => {
    const old = withMixedProgress(emptySave(), "2026-10-07|misturadas-musica", { events });
    const today = withMixedProgress(old, daily.id, { events });
    const pruned = pruneProgress(today, mixedIds(DATE));
    expect(Object.keys(pruned.mixed.progress)).toEqual([daily.id]);
    expect(pruneProgress(pruned, mixedIds(DATE))).toBe(pruned);
  });
});

describe("a etiqueta da rodada difícil", () => {
  it("a 3ª tem músicas mais difíceis; a de 3 músicas, mais músicas juntas; as outras, nada", () => {
    const sizes = musica().rounds.map((round) => round.length);
    expect(sizes.map((n, i) => mixedRoundTag(i, n))).toEqual([null, null, "hard", "more"]);
  });
});

describe("o cartão e o compartilhar das Misturadas", () => {
  const game: MixedGame = {
    number: 3,
    rounds: [
      { status: "done", found: [{ stage: 0 }, { stage: 0 }] },
      { status: "done", found: [{ stage: 1, help: true }, null] },
      { status: "void", found: [null, null] },
      { status: "done", found: [{ stage: 3 }, null, { stage: 2 }] },
    ],
  };

  it("o estado do diário: fora da agenda, novo, em andamento e terminado, com os pontos", () => {
    const daily = mixedDaily(day, DATE, "musica");
    expect(mixedStatusOf(emptySave(), null)).toEqual({ kind: "unavailable" });
    expect(mixedStatusOf(emptySave(), daily)).toEqual({ kind: "new", number: 1 });
    const playing = withMixedProgress(emptySave(), daily.id, { events: [{ type: "SKIP" }] });
    expect(mixedStatusOf(playing, daily)).toEqual({ kind: "playing", number: 1 });
    // O andamento vazio (a repetição descartou tudo) ainda é novo.
    const empty = withMixedProgress(emptySave(), daily.id, { events: [] });
    expect(mixedStatusOf(empty, daily).kind).toBe("new");
    const done = withMixedFinished(emptySave(), daily.id, game);
    // 10 + round((4 + 0) / 2) = 2 + 0 (anulada) + round((3 + 0 + 5) / 3) = 3: 15 de 30.
    expect(mixedStatusOf(done, daily)).toEqual({
      kind: "done",
      number: 1,
      score: 15,
      max: 30,
      late: false,
    });
  });

  it("o texto: o cabeçalho, os pontos, uma linha por rodada (o trecho de cada achada) e o endereço", () => {
    expect(mixedShareText("AteMusic Misturadas · Música nº 3", game, "https://x/")).toBe(
      [
        "AteMusic Misturadas · Música nº 3",
        "15/30",
        "1️⃣1️⃣",
        "2️⃣💡❌",
        "⬜",
        "4️⃣❌3️⃣",
        "https://x/",
      ].join("\n"),
    );
  });
});
