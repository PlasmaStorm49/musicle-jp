// O "acertar o anime" (M14, P231, P234), de ponta a ponta no núcleo: o índice das franquias, o
// acerto pela franquia (o answerOf do createRounds), a busca pelos nomes e sinônimos, a ajuda com
// 4 animes e o que a tela mostra. Sobre as fixtures do Anime.
import { describe, expect, it } from "vitest";
import { animeCatalog, animeSchedule, catalog } from "../../test/fixtures.ts";
import { franchisesOf, indexAnime, indexCatalog } from "./catalog.ts";
import { animeDaily } from "./daily.ts";
import { dayAnswerKeys, helpOptions, helpSeed } from "./help.ts";
import { seeded } from "./prng.ts";
import { emptySave, type Save, startSession } from "./records.ts";
import {
  createGame,
  createRounds,
  currentRound,
  type GameEvent,
  type GameState,
  reduce,
} from "./reducer.ts";
import { HELP_OPTIONS } from "./rules.ts";
import { buildFranchiseIndex, hitKey, search } from "./search.ts";
import type { AnimeCatalog, AnimeDay } from "./types.ts";
import { franchiseView, guessView, revealView } from "./view.ts";

const index = indexAnime(animeCatalog);
const DATE = "2026-10-08";
const day = animeSchedule.days[DATE] as AnimeDay;
const HOSHIZORA = "anime:fr:hoshizora_kaizoku";

/** O acertar o anime Fácil de 08/10: tr20 (Tsukimi Gakuen), tr01 (Minato) e tr42 (Hoshizora). */
const titulo = () => animeDaily(day, DATE, "titulo", "facil");
const game = (): GameState => createGame(titulo(), index);

describe("o índice das franquias (indexAnime)", () => {
  it("as franquias, as de cada faixa e os temas de cada faixa", () => {
    expect(index.anime?.franchises.size).toBe(animeCatalog.franchises.length);
    // A 2ª temporada é a mesma franquia (P234).
    expect(franchisesOf(index, "fixture:tr:tr42")).toEqual([HOSHIZORA]);
    expect(franchisesOf(index, "fixture:tr:tr21")).toEqual([HOSHIZORA]);
    expect(index.anime?.themesByTrack.get("fixture:tr:tr42")).toEqual([
      { anime: "Hoshizora Kaizoku 2nd Season", type: "OP", sequence: 1 },
    ]);
  });

  it("fora do Anime, nenhuma franquia; a franquia que o arquivo não descreve fica de fora", () => {
    expect(franchisesOf(indexCatalog(catalog), "fixture:tr:tr42")).toEqual([]);
    const [first, ...rest] = animeCatalog.tracks;
    const ghost: AnimeCatalog = {
      ...animeCatalog,
      tracks: [
        { ...first, anime: { ...first.anime, franchiseIds: ["anime:fr:nao_existe"] } },
        ...rest,
      ],
    };
    expect(franchisesOf(indexAnime(ghost), first.id)).toEqual([]);
  });
});

describe("o acerto pela franquia (createRounds com o answerOf, createGame)", () => {
  it("o jogo do acertar o anime: os aceitos são as franquias da faixa, e a resposta é a 1ª", () => {
    const state = game();
    expect(state.answer).toBe("franchise");
    expect(state.target).toBe("song");
    const third = state.rounds[2];
    expect(third?.trackId).toBe("fixture:tr:tr42");
    expect(third?.correctOptionId).toBe(HOSHIZORA);
    expect(third?.accepted).toEqual([HOSHIZORA]);
    expect(state.rounds.every((r) => r.status === "playing")).toBe(true);
  });

  it("o acertar a música continua pela música: sem o answer", () => {
    const musica = createGame(animeDaily(day, DATE, "musica", "facil"), index);
    expect(musica.answer).toBeUndefined();
    expect(currentRound(musica).accepted).toContain(currentRound(musica).trackId);
  });

  it("a franquia acerta; a música (o id da faixa) e outra franquia erram", () => {
    const state = { ...game(), current: 2 };
    expect(currentRound(reduce(state, { type: "GUESS", guessId: HOSHIZORA })).status).toBe("won");
    const song = reduce(state, { type: "GUESS", guessId: "fixture:tr:tr42" });
    expect(currentRound(song).attempts).toEqual([
      { kind: "guess", guessId: "fixture:tr:tr42", correct: false },
    ]);
    const other = reduce(state, { type: "GUESS", guessId: "anime:fr:neon_samurai" });
    expect(currentRound(other).attempts.at(-1)).toMatchObject({ correct: false });
  });

  it("as franquias aceitas sem repetir e em ordem; nenhuma anula a rodada", () => {
    const [round] = createRounds([{ answer: "fixture:tr:tr01" }], "song", index, () => [
      "anime:fr:b",
      "anime:fr:a",
      "anime:fr:b",
    ]);
    expect(round?.correctOptionId).toBe("anime:fr:b");
    expect(round?.accepted).toEqual(["anime:fr:a", "anime:fr:b"]);
    const [none] = createRounds([{ answer: "fixture:tr:tr01" }], "song", index, () => []);
    expect(none).toMatchObject({ status: "void", voidReason: "unavailable", accepted: [] });
  });
});

describe("a busca dos nomes de anime (buildFranchiseIndex)", () => {
  const idx = buildFranchiseIndex(index);
  const names = (query: string) =>
    search(idx, query).map((hit) => index.anime?.franchises.get(hit.id)?.name);

  it("uma entrada por franquia, com o id como chave (o já tentou)", () => {
    expect(idx.entries).toHaveLength(animeCatalog.franchises.length);
    expect(search(idx, "hoshizora")).toEqual([{ id: HOSHIZORA, key: HOSHIZORA }]);
    expect(hitKey(index, HOSHIZORA)).toBe(HOSHIZORA);
  });

  it("pelo nome, pelo sinônimo em inglês, pelo japonês e pela temporada (P234)", () => {
    expect(names("Starry Pirates")).toEqual(["Hoshizora Kaizoku"]);
    expect(names("星空")).toEqual(["Hoshizora Kaizoku"]);
    expect(names("Hoshizora Kaizoku 2nd")).toEqual(["Hoshizora Kaizoku"]);
    expect(names("The Witch")).toEqual(["Majo to Kissaten"]);
  });

  it("guardado por catálogo; fora do Anime, vazio", () => {
    expect(buildFranchiseIndex(index)).toBe(idx);
    expect(buildFranchiseIndex(indexCatalog(catalog)).entries).toEqual([]);
  });
});

describe("a ajuda do acertar o anime: 4 nomes de anime", () => {
  const avoid = dayAnswerKeys(titulo(), index);
  const options = (state: GameState) =>
    helpOptions(
      index,
      currentRound(state),
      avoid,
      seeded(helpSeed(state.puzzleId, state.current)),
      state.answer,
    );

  it("o que a ajuda evita no acertar o anime são as franquias das 18 respostas do dia", () => {
    const franchises = new Set(titulo().avoid.flatMap((id) => franchisesOf(index, id)));
    expect(avoid).toEqual(franchises);
    expect(avoid.has(HOSHIZORA)).toBe(true);
    // O acertar a música evita as músicas.
    const musica = dayAnswerKeys(animeDaily(day, DATE, "musica", "facil"), index);
    expect([...musica].every((key) => key.includes("|"))).toBe(true);
  });

  it("a certa e 3 franquias do catálogo, nunca a de uma resposta do dia", () => {
    const state = game();
    const shown = options(state);
    expect(shown).toHaveLength(HELP_OPTIONS);
    expect(shown).toContain(currentRound(state).correctOptionId);
    const others = shown.filter((id) => id !== currentRound(state).correctOptionId);
    for (const id of others) {
      expect(avoid.has(id), id).toBe(false);
      expect(index.anime?.franchises.has(id), id).toBe(true);
    }
    // A mesma rodada dá as mesmas opções (a semente), e o reducer as aceita (depois de uma
    // tentativa gasta, como no Desafio).
    expect(options(state)).toEqual(shown);
    const skipped = reduce(state, { type: "SKIP" });
    const helped = reduce(skipped, { type: "HELP", options: options(skipped) });
    expect(currentRound(helped).help).toEqual(options(skipped));
    expect(currentRound(helped).help).toHaveLength(HELP_OPTIONS);
  });

  it("nunca uma já tentada; com poucas franquias sobrando, menos opções", () => {
    const state = game();
    const shown = options(state);
    const tried = shown.find((id) => id !== currentRound(state).correctOptionId) ?? "";
    const after = reduce(state, { type: "GUESS", guessId: tried });
    expect(options(after)).not.toContain(tried);
    expect(options(after).length).toBeLessThan(HELP_OPTIONS);
    // A resposta fora do catálogo das franquias: nenhuma opção.
    const lost = { ...currentRound(state), correctOptionId: "anime:fr:nao_existe" };
    expect(helpOptions(index, lost, avoid, seeded("x"), "franchise")).toEqual([]);
  });
});

describe("o que a tela mostra (franchiseView, guessView, revealView)", () => {
  it("a franquia: só o nome, sem artista nem capa", () => {
    expect(franchiseView(index, HOSHIZORA)).toEqual({
      id: HOSHIZORA,
      title: "Hoshizora Kaizoku",
      titleLatin: null,
      artist: "",
      artistLatin: null,
      artworkUrl: null,
      lang: undefined,
      artistLang: undefined,
    });
    expect(franchiseView(index, "anime:fr:nao_existe")).toBeNull();
    expect(franchiseView(indexCatalog(catalog), HOSHIZORA)).toBeNull();
  });

  it("o palpite pelo que se acerta: a franquia, ou a música", () => {
    expect(guessView(index, HOSHIZORA, "song", "franchise")?.title).toBe("Hoshizora Kaizoku");
    expect(guessView(index, "fixture:tr:tr42", "song")?.id).toBe("fixture:tr:tr42");
    expect(guessView(index, "fixture:tr:tr42", "song", "franchise")).toBeNull();
  });

  it("a revelação leva os temas da faixa; fora do Anime, nenhum", () => {
    expect(revealView(index, "fixture:tr:tr42")?.themes).toEqual([
      { anime: "Hoshizora Kaizoku 2nd Season", type: "OP", sequence: 1 },
    ]);
    expect(revealView(indexCatalog(catalog), "fixture:tr:tr42")?.themes).toEqual([]);
  });
});

describe("o save do acertar o anime (a retomada pelos eventos)", () => {
  const daily = titulo();
  const avoid = dayAnswerKeys(daily, index);
  const wrong = "anime:fr:kumo_no_ue_no_shiro";
  /** Os eventos de uma rodada com um pulo, um palpite errado (uma franquia) e a ajuda. */
  function events(): GameEvent[] {
    const played = [{ type: "SKIP" }, { type: "GUESS", guessId: wrong }] as const;
    const state = played.reduce<GameState>(reduce, createGame(daily, index));
    const options = helpOptions(
      index,
      currentRound(state),
      avoid,
      seeded(helpSeed(state.puzzleId, state.current)),
      state.answer,
    );
    return [...played, { type: "HELP", options }];
  }
  const saved = (list: readonly GameEvent[]): Save => ({
    ...emptySave(),
    inProgress: { [daily.id]: { events: list } },
  });

  it("recarregar refaz a rodada igual: em jogo, sem descartar evento, com a mesma ajuda e as mesmas tentativas", () => {
    const list = events();
    const session = startSession(saved(list), daily, index);
    if (session.kind !== "playing") throw new Error("a rodada devia continuar");
    expect(session.stale).toBe(false);
    expect(session.events).toEqual(list);
    const round = currentRound(session.state);
    const help = list[2]?.type === "HELP" ? list[2].options : [];
    expect(round.help).toEqual(help);
    expect(round.help).toContain(round.correctOptionId);
    expect(round.attempts).toEqual([
      { kind: "skip" },
      { kind: "guess", guessId: wrong, correct: false },
    ]);
  });

  it("com o palpite da franquia certa (uma das opções da ajuda), a rodada termina ganha", () => {
    const list = [...events(), { type: "GUESS", guessId: currentRound(game()).correctOptionId }];
    const session = startSession(saved(list as GameEvent[]), daily, index);
    if (session.kind !== "playing") throw new Error("o dia ainda tem 2 rodadas");
    expect(session.stale).toBe(false);
    expect(session.state.rounds[0]?.status).toBe("won");
  });
});
