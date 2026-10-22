import { describe, expect, it } from "vitest";
import { catalog, schedule } from "../../test/fixtures.ts";
import { indexCatalog } from "./catalog.ts";
import { type Daily, hitsDailies, hitsDaily } from "./daily.ts";
import {
  emptySave,
  type FinishedGame,
  isLate,
  pendingDayTracks,
  pruneProgress,
  puzzleId,
  recordMax,
  recordScore,
  replaceProgress,
  type Save,
  startSession,
  toFinishedGame,
  withFinished,
  withProgress,
} from "./records.ts";
import { type GameEvent, reduce } from "./reducer.ts";
import { MODE_RULES } from "./rules.ts";
import { shareGrid } from "./share.ts";
import type { Day } from "./types.ts";

const index = indexCatalog(catalog);
const DATE = "2026-10-08";
const day = schedule.days[DATE] as Day;
// O Normal (álbum, 4 opções): os eventos usam o "ouvir mais" e o palpite único.
const ID = puzzleId(DATE, "album");
/** O álbum certo da rodada `n` (0 a 2): a opção que acerta no Normal. */
const albumOf = (n: 0 | 1 | 2) => index.tracks.get(day.album[n].answer)?.albumId ?? "";

const session = (save: Save) => startSession(save, hitsDaily(day, DATE, "album"), index, DATE);
const saveWith = (events: GameEvent[]): Save => ({
  ...emptySave(),
  inProgress: { [ID]: { events } },
});

describe("startSession", () => {
  it("sem nada salvo: jogo novo", () => {
    const s = session(emptySave());
    expect(s.kind).toBe("playing");
    if (s.kind === "playing") expect(s.events).toEqual([]);
  });

  it("retoma pelos eventos e volta exatamente onde estava", () => {
    const events: GameEvent[] = [
      { type: "LISTEN_MORE" },
      { type: "LISTEN_MORE" },
      { type: "GUESS", guessId: albumOf(0) },
      { type: "NEXT_ROUND" },
      { type: "LISTEN_MORE" },
    ];
    const s = session(saveWith(events));
    expect(s.kind).toBe("playing");
    if (s.kind !== "playing") return;
    expect(s.state.current).toBe(1);
    expect(s.state.rounds[0]?.status).toBe("won");
    expect(s.state.rounds[0]?.stage).toBe(2);
    expect(s.state.rounds[1]?.stage).toBe(1);
    expect(s.events).toEqual(events);
  });

  it("evento que não muda o estado é descartado ao repetir, e a sessão pede regravação", () => {
    const s = session(saveWith([{ type: "NEXT_ROUND" }, { type: "LISTEN_MORE" }]));
    expect(s).toMatchObject({ kind: "playing", events: [{ type: "LISTEN_MORE" }], stale: true });
  });

  it("repetição sem descarte não pede regravação", () => {
    expect(session(saveWith([{ type: "LISTEN_MORE" }]))).toMatchObject({ stale: false });
    expect(session(emptySave())).toMatchObject({ stale: false });
  });

  it("rodada anulada por falha de áudio continua anulada ao recarregar", () => {
    const s = session(saveWith([{ type: "VOID", round: 0, reason: "audio" }]));
    if (s.kind === "playing") expect(s.state.rounds[0]?.status).toBe("void");
  });

  it("andamento de outro dia não é retomado", () => {
    const other: Save = {
      ...emptySave(),
      inProgress: { "2026-10-07|album": { events: [{ type: "GIVE_UP" }] } },
    };
    const s = session(other);
    if (s.kind === "playing") expect(s.events).toEqual([]);
  });

  it("dia terminado vai direto ao resultado (P39)", () => {
    const done = toFinishedGame(
      [
        { type: "GIVE_UP" },
        { type: "NEXT_ROUND" },
        { type: "GIVE_UP" },
        { type: "NEXT_ROUND" },
        { type: "GIVE_UP" },
      ].reduce(
        (st, e) => reduce(st, e as GameEvent),
        (session(emptySave()) as { state: Parameters<typeof reduce>[0] }).state,
      ),
      day.number,
      false,
    );
    expect(session({ ...emptySave(), history: { [ID]: done } })).toEqual({
      kind: "finished",
      game: done,
    });
  });

  it("andamento que já terminou (histórico não chegou a ser gravado) vira resultado", () => {
    const events: GameEvent[] = [
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
    ];
    expect(session(saveWith(events)).kind).toBe("finished");
  });

  it("o jogo é o do id do descritor: um diário do Anime não pega o resultado do Desafio (P250)", () => {
    // Um diário do Anime de mentira, com as rodadas do Desafio de hoje: só o id muda.
    const key = "anime-musica-facil";
    const anime: Daily = { ...hitsDaily(day, DATE, "song"), key, id: puzzleId(DATE, key) };
    const save: Save = {
      ...emptySave(),
      history: { [puzzleId(DATE, "song")]: { number: day.number, rounds: [] } },
      inProgress: { [anime.id]: { events: [{ type: "SKIP" }] } },
    };
    const s = startSession(save, anime, index, DATE);
    expect(s).toMatchObject({ kind: "playing", events: [{ type: "SKIP" }], stale: false });
    if (s.kind === "playing") {
      expect(s.state.puzzleId).toBe("2026-10-08|anime-musica-facil");
      expect(s.state.target).toBe("song");
    }
  });
});

describe("FinishedGame", () => {
  const game: FinishedGame = {
    number: 1,
    rounds: [
      { status: "won", stage: 1, attempts: ["right"] },
      { status: "lost", stage: 0, attempts: ["wrong"] },
      { status: "void", stage: 0, attempts: [] },
    ],
  };

  it("pontos e máximo são derivados (12 com uma anulada)", () => {
    expect(recordScore(game)).toBe(5);
    expect(recordMax(game)).toBe(12);
  });

  it("o jogado depois (P268) leva `late: true`; o do dia, nenhum campo", () => {
    const events: GameEvent[] = [
      { type: "GUESS", guessId: albumOf(0) },
      { type: "NEXT_ROUND" },
      { type: "GUESS", guessId: albumOf(1) },
      { type: "NEXT_ROUND" },
      { type: "GUESS", guessId: albumOf(2) },
    ];
    const daily = hitsDaily(day, DATE, "album");
    const late = startSession(saveWith(events), daily, index, "2026-10-09");
    expect(late).toMatchObject({ kind: "finished", game: { number: 1, late: true } });
    const onTime = startSession(saveWith(events), daily, index, DATE);
    expect(onTime.kind === "finished" && "late" in onTime.game).toBe(false);
  });

  it("o registro já gravado volta como está, mesmo aberto depois do dia (o 1º término vence)", () => {
    const saved: FinishedGame = {
      number: 1,
      rounds: [
        { status: "won", stage: 0, attempts: ["right"] },
        { status: "won", stage: 0, attempts: ["right"] },
        { status: "won", stage: 0, attempts: ["right"] },
      ],
    };
    const save: Save = { ...emptySave(), history: { [ID]: saved } };
    const s = startSession(save, hitsDaily(day, DATE, "album"), index, "2026-10-09");
    expect(s).toEqual({ kind: "finished", game: saved });
  });

  it("isLate: só o dia antes do hoje do jogo (P268)", () => {
    expect(isLate("2026-10-07", DATE)).toBe(true);
    expect(isLate(DATE, DATE)).toBe(false);
    expect(isLate("2026-10-09", DATE)).toBe(false);
  });

  it("toFinishedGame recusa jogo em andamento", () => {
    const s = session(saveWith([{ type: "LISTEN_MORE" }, { type: "GUESS", guessId: albumOf(0) }]));
    if (s.kind !== "playing") throw new Error("esperava jogo em andamento");
    expect(() => toFinishedGame(s.state, 1, false)).toThrow();
  });

  it("toFinishedGame converte o jogo em status, etapa e marcas por tentativa", () => {
    const wrong = day.album[1].options.find((o) => o !== albumOf(1)) as string;
    const s = session(
      saveWith([
        { type: "LISTEN_MORE" },
        { type: "GUESS", guessId: albumOf(0) },
        { type: "NEXT_ROUND" },
        { type: "GUESS", guessId: wrong },
        { type: "NEXT_ROUND" },
        { type: "VOID", round: 2, reason: "audio" },
      ]),
    );
    expect(s).toEqual({
      kind: "finished",
      game: {
        number: 1,
        rounds: [
          { status: "won", stage: 1, attempts: ["right"] },
          { status: "lost", stage: 0, attempts: ["wrong"] },
          { status: "void", stage: 0, attempts: [] },
        ],
      },
    });
  });
});

describe("a ajuda no diário (P149)", () => {
  const SONG = puzzleId(DATE, "song");
  const desafio = (events: GameEvent[]) =>
    startSession(
      { ...emptySave(), inProgress: { [SONG]: { events } } },
      hitsDaily(day, DATE, "song"),
      index,
      DATE,
    );
  // As opções: a resposta da rodada 1 e outras três faixas do catálogo.
  const answer = day.song[0].answer;
  const others = catalog.tracks
    .map((t) => t.id)
    .filter((id) => index.tracks.get(id)?.songKey !== index.tracks.get(answer)?.songKey)
    .slice(0, 3);
  const options = [others[0] ?? "", answer, others[1] ?? "", others[2] ?? ""];
  const helped: GameEvent[] = [
    { type: "SKIP" },
    { type: "SKIP" },
    { type: "SKIP" },
    { type: "HELP", options },
  ];

  it("o evento HELP salvo volta com as mesmas opções ao recarregar", () => {
    const s = desafio(helped);
    if (s.kind !== "playing") throw new Error("esperava jogo em andamento");
    expect(s.state.rounds[0]?.help).toEqual(options);
    expect(s.events).toEqual(helped);
  });

  it("a rodada anulada depois da ajuda guarda a ajuda e fica fora da conta", () => {
    const s = desafio([
      ...helped,
      { type: "VOID", round: 0, reason: "audio" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
    ]);
    if (s.kind !== "finished") throw new Error("esperava o dia terminado");
    expect(s.game.rounds[0]).toEqual({
      status: "void",
      stage: 3,
      attempts: ["skip", "skip", "skip"],
      help: 3,
    });
    expect(recordScore(s.game)).toBe(0);
    expect(recordMax(s.game)).toBe(12);
  });

  it("o resultado guarda quando a ajuda foi pedida, e a rodada vale 1 ponto", () => {
    const rest: GameEvent[] = [
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "SKIP" },
      { type: "SKIP" },
      { type: "SKIP" },
      { type: "HELP", options },
      { type: "GIVE_UP" },
    ];
    // Na 3ª rodada a resposta é outra: as opções servem, se uma delas for aceita.
    const third = day.song[2].answer;
    const s = desafio([
      ...helped,
      { type: "GUESS", guessId: answer },
      ...rest.map((e) =>
        e.type === "HELP" ? { ...e, options: [third, ...others.filter((id) => id !== third)] } : e,
      ),
    ]);
    if (s.kind !== "finished") throw new Error("esperava o dia terminado");
    expect(s.game.rounds[0]).toEqual({
      status: "won",
      stage: 3,
      attempts: ["skip", "skip", "skip", "right"],
      help: 3,
    });
    expect(s.game.rounds[1]).not.toHaveProperty("help");
    expect(s.game.rounds[2]).toEqual({
      status: "lost",
      stage: 3,
      attempts: ["skip", "skip", "skip"],
      help: 3,
    });
    expect(recordScore(s.game)).toBe(1);
  });

  it("com pulos depois da ajuda (P163), o help é onde ela foi pedida, e não antes da opção", () => {
    const third = day.song[2].answer;
    const s = desafio([
      ...helped,
      { type: "SKIP" },
      { type: "GUESS", guessId: answer },
      { type: "NEXT_ROUND" },
      { type: "GIVE_UP" },
      { type: "NEXT_ROUND" },
      { type: "SKIP" },
      { type: "SKIP" },
      { type: "SKIP" },
      { type: "HELP", options: [third, ...others.filter((id) => id !== third)] },
      { type: "SKIP" },
      { type: "GIVE_UP" },
    ]);
    if (s.kind !== "finished") throw new Error("esperava o dia terminado");
    expect(s.game.rounds[0]).toEqual({
      status: "won",
      stage: 4,
      attempts: ["skip", "skip", "skip", "skip", "right"],
      help: 3,
    });
    expect(s.game.rounds[2]).toEqual({
      status: "lost",
      stage: 4,
      attempts: ["skip", "skip", "skip", "skip"],
      help: 3,
    });
    expect(recordScore(s.game)).toBe(1);
    // E o compartilhar: o 💡 antes do pulo; desistir depois dele fecha com ❌.
    expect(shareGrid(s.game, MODE_RULES.song)).toEqual(["⬛⬛⬛💡⬛✅", "❌", "⬛⬛⬛💡⬛❌"]);
  });
});

describe("mescla de saves (duas abas)", () => {
  const done: FinishedGame = { number: 1, rounds: [] };

  it("andamento não sobrescreve um dia já terminado", () => {
    const save = { ...emptySave(), history: { [ID]: done } };
    expect(withProgress(save, ID, { events: [] })).toBe(save);
  });

  it("andamento mais curto não apaga um mais longo", () => {
    const longer = saveWith([{ type: "LISTEN_MORE" }, { type: "LISTEN_MORE" }]);
    expect(withProgress(longer, ID, { events: [{ type: "LISTEN_MORE" }] })).toBe(longer);
  });

  it("o primeiro término vence e o andamento é limpo", () => {
    const first = withFinished(saveWith([]), ID, done);
    const second = withFinished(first, ID, { ...done, number: 99 });
    expect(second.history[ID]).toBe(done);
    expect(second.inProgress).toEqual({});
  });

  it("término já gravado e sem andamento: devolve o mesmo save (não regrava)", () => {
    const first = withFinished(saveWith([]), ID, done);
    expect(withFinished(first, ID, done)).toBe(first);
  });

  it("replaceProgress troca até por uma lista mais curta, mas não mexe em dia terminado", () => {
    const longer = saveWith([{ type: "LISTEN_MORE" }, { type: "LISTEN_MORE" }]);
    const shorter = { events: [{ type: "LISTEN_MORE" as const }] };
    expect(replaceProgress(longer, ID, shorter).inProgress[ID]).toEqual(shorter);
    const finished = { ...emptySave(), history: { [ID]: done } };
    expect(replaceProgress(finished, ID, shorter)).toBe(finished);
  });

  it("pruneProgress tira andamentos de outros dias", () => {
    const save: Save = {
      ...emptySave(),
      inProgress: {
        [ID]: { events: [] },
        "2026-10-07|album": { events: [] },
      },
    };
    expect(Object.keys(pruneProgress(save, [ID]).inProgress)).toEqual([ID]);
    const clean = pruneProgress(save, [ID]);
    expect(pruneProgress(clean, [ID])).toBe(clean);
  });
});

describe("pendingDayTracks", () => {
  it("só as faixas dos diários sem resultado: o terminado não gasta a cota do lookup", () => {
    const answers = (target: "song" | "album") => day[target].map((r) => r.answer);
    const done: FinishedGame = { number: day.number, rounds: [] };
    const finished = (...ids: string[]): Save => ({
      ...emptySave(),
      history: Object.fromEntries(ids.map((id) => [id, done])),
    });
    const hits = hitsDailies(day, DATE);
    expect(pendingDayTracks(emptySave(), hits)).toEqual([...answers("album"), ...answers("song")]);
    expect(pendingDayTracks(finished(ID), hits)).toEqual(answers("song"));
    expect(pendingDayTracks(finished(ID, puzzleId(DATE, "song")), hits)).toEqual([]);
    // Resultado de outro dia não conta.
    expect(pendingDayTracks(finished("2026-10-07|album"), hits)).toHaveLength(6);
  });

  it("só os diários dados, pelo id de cada um", () => {
    const song = hitsDaily(day, DATE, "song");
    expect(pendingDayTracks(emptySave(), [song])).toEqual(day.song.map((r) => r.answer));
    expect(pendingDayTracks(emptySave(), [])).toEqual([]);
  });
});
