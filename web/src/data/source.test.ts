import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AnimeData,
  assetUrl,
  DataLoadError,
  dataDirFor,
  type FetchLike,
  FIXTURE_DATA_DIR,
  failAudioTrack,
  fakeAudioEnabled,
  gameDate,
  htmlAudioForced,
  loadAnimeCatalog,
  loadAnimeSchedule,
  loadArtist,
  loadArtistList,
  loadGameData,
  loadMixedSchedule,
  lookupFailForced,
  medalsMode,
  pickAnimeDay,
  pickDay,
  pickMixedDay,
  REAL_DATA_DIR,
  UnsupportedCatalogError,
} from "./source.ts";

const BASE = "http://localhost:5173/";
const PUBLIC = new URL("../../public/", import.meta.url);

/** fetch falso que serve web/public a partir do disco, com respostas trocáveis por URL. */
function fakeFetch(overrides: Record<string, unknown> = {}): FetchLike {
  return async (url) => {
    const path = url.replace(BASE, "");
    if (path in overrides) {
      const body = overrides[path];
      if (body instanceof Error) throw body;
      return { ok: true, status: 200, json: async () => body };
    }
    try {
      const text = readFileSync(new URL(path, PUBLIC), "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
}

describe("loadGameData", () => {
  it("carrega e indexa catálogo e agenda", async () => {
    const data = await loadGameData(fakeFetch(), BASE, FIXTURE_DATA_DIR);
    expect(data.index.tracks.size).toBe(42);
    expect(data.schedule.epoch).toBe("2026-10-08");
  });

  it("busca os dois JSON da pasta pedida, sempre revalidando o cache", async () => {
    const calls: { url: string; cache: string | undefined }[] = [];
    const serve = fakeFetch();
    const recording: FetchLike = (url, init) => {
      calls.push({ url, cache: init?.cache });
      return serve(url.replace("/data/", "/fixtures/"), init);
    };
    await loadGameData(recording, BASE, REAL_DATA_DIR);
    expect(calls.map((c) => c.url).sort()).toEqual([
      `${BASE}data/catalog.json`,
      `${BASE}data/schedule.json`,
    ]);
    expect(calls.every((c) => c.cache === "no-cache")).toBe(true);
  });

  it("versão de schema desconhecida pede para atualizar a página", async () => {
    const future = { "fixtures/schedule.json": { schemaVersion: 2, days: {} } };
    await expect(loadGameData(fakeFetch(future), BASE, FIXTURE_DATA_DIR)).rejects.toBeInstanceOf(
      UnsupportedCatalogError,
    );
  });

  it("falha de rede e 404 pedem para tentar de novo", async () => {
    const offline = { "fixtures/catalog.json": new TypeError("Failed to fetch") };
    await expect(loadGameData(fakeFetch(offline), BASE, FIXTURE_DATA_DIR)).rejects.toBeInstanceOf(
      DataLoadError,
    );
    await expect(
      loadGameData(fakeFetch(), "http://localhost:5173/outra/", FIXTURE_DATA_DIR),
    ).rejects.toBeInstanceOf(DataLoadError);
  });

  it("resposta que não é JSON pede para tentar de novo", async () => {
    const html: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(loadGameData(html, BASE, FIXTURE_DATA_DIR)).rejects.toBeInstanceOf(DataLoadError);
  });

  it("cancelamento não vira erro de rede", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborting: FetchLike = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    await expect(
      loadGameData(aborting, BASE, FIXTURE_DATA_DIR, controller.signal),
    ).rejects.not.toBeInstanceOf(DataLoadError);
  });
});

describe("loadArtistList e loadArtist (M13)", () => {
  const firstEntry = async () => {
    const list = await loadArtistList(fakeFetch(), BASE, FIXTURE_DATA_DIR);
    const entry = list.artists[0];
    if (!entry) throw new Error("lista sem artistas");
    return entry;
  };

  it("a lista e um artista, da subpasta artists/ dos dados, sempre revalidando o cache", async () => {
    const calls: { url: string; cache: string | undefined }[] = [];
    const serve = fakeFetch();
    const recording: FetchLike = (url, init) => {
      calls.push({ url, cache: init?.cache });
      return serve(url, init);
    };
    const list = await loadArtistList(recording, BASE, FIXTURE_DATA_DIR);
    const entry = list.artists[0];
    if (!entry) throw new Error("lista sem artistas");
    const { file, index } = await loadArtist(recording, BASE, FIXTURE_DATA_DIR, entry);
    expect(file.artistId).toBe(entry.id);
    expect(index.tracks.size).toBe(entry.songs);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}fixtures/artists/index.json`,
      `${BASE}fixtures/artists/${entry.file}`,
    ]);
    expect(calls.every((c) => c.cache === "no-cache")).toBe(true);
  });

  it("versão desconhecida da lista ou do artista pede para atualizar a página", async () => {
    const list = { "fixtures/artists/index.json": { schemaVersion: 2, artists: [] } };
    await expect(loadArtistList(fakeFetch(list), BASE, FIXTURE_DATA_DIR)).rejects.toBeInstanceOf(
      UnsupportedCatalogError,
    );
    const entry = await firstEntry();
    const artist = { [`fixtures/artists/${entry.file}`]: { schemaVersion: 2 } };
    await expect(
      loadArtist(fakeFetch(artist), BASE, FIXTURE_DATA_DIR, entry),
    ).rejects.toBeInstanceOf(UnsupportedCatalogError);
  });

  it("nome de arquivo fora do padrão nem chega a buscar", async () => {
    const entry = await firstEntry();
    const calls: string[] = [];
    const recording: FetchLike = (url, init) => {
      calls.push(url);
      return fakeFetch()(url, init);
    };
    for (const name of ["../catalog.json", "a/b.json", "x.js"]) {
      await expect(
        loadArtist(recording, BASE, FIXTURE_DATA_DIR, { ...entry, file: name }),
      ).rejects.toBeInstanceOf(DataLoadError);
    }
    expect(calls).toEqual([]);
  });

  it("arquivo de outro artista, falha de rede e 404 pedem para tentar de novo", async () => {
    const entry = await firstEntry();
    const other = { ...entry, id: "fixture:ar:outro" };
    await expect(loadArtist(fakeFetch(), BASE, FIXTURE_DATA_DIR, other)).rejects.toBeInstanceOf(
      DataLoadError,
    );
    const offline = { [`fixtures/artists/${entry.file}`]: new TypeError("Failed to fetch") };
    await expect(
      loadArtist(fakeFetch(offline), BASE, FIXTURE_DATA_DIR, entry),
    ).rejects.toBeInstanceOf(DataLoadError);
    const missing = { ...entry, file: "nao-existe.json" };
    await expect(loadArtist(fakeFetch(), BASE, FIXTURE_DATA_DIR, missing)).rejects.toBeInstanceOf(
      DataLoadError,
    );
  });

  it("a lista real tem um arquivo para cada artista", async () => {
    const list = await loadArtistList(fakeFetch(), BASE, REAL_DATA_DIR);
    expect(list.provider).toBe("apple");
    for (const entry of list.artists) {
      const { index } = await loadArtist(fakeFetch(), BASE, REAL_DATA_DIR, entry);
      expect(index.catalog.provider).toBe("apple");
    }
  });
});

/** Os dois carregadores do Anime juntos, como a carga da categoria (o useAnimeStore). */
async function loadAnime(fetchFn: FetchLike, baseUrl: string, dataDir: string): Promise<AnimeData> {
  const [index, schedule] = await Promise.all([
    loadAnimeCatalog(fetchFn, baseUrl, dataDir),
    loadAnimeSchedule(fetchFn, baseUrl, dataDir),
  ]);
  return { index, schedule };
}

describe("loadAnimeCatalog e loadAnimeSchedule (M14)", () => {
  it("o catálogo e a agenda, da subpasta anime/ dos dados, sempre revalidando o cache", async () => {
    const calls: { url: string; cache: string | undefined }[] = [];
    const serve = fakeFetch();
    const recording: FetchLike = (url, init) => {
      calls.push({ url, cache: init?.cache });
      return serve(url, init);
    };
    const { index, schedule } = await loadAnime(recording, BASE, FIXTURE_DATA_DIR);
    expect(index.catalog.provider).toBe("fixture");
    expect(index.tracks.size).toBeGreaterThan(0);
    expect(schedule.kind).toBe("anime");
    expect(schedule.epoch).toBe("2026-10-08");
    expect(calls.map((c) => c.url).sort()).toEqual([
      `${BASE}fixtures/anime/catalog.json`,
      `${BASE}fixtures/anime/schedule.json`,
    ]);
    expect(calls.every((c) => c.cache === "no-cache")).toBe(true);
  });

  it("na parada real, a pasta data/anime/", async () => {
    const calls: string[] = [];
    const serve = fakeFetch();
    const recording: FetchLike = (url, init) => {
      calls.push(url);
      return serve(url.replace("/data/", "/fixtures/"), init);
    };
    await loadAnime(recording, BASE, REAL_DATA_DIR);
    expect(calls.sort()).toEqual([
      `${BASE}data/anime/catalog.json`,
      `${BASE}data/anime/schedule.json`,
    ]);
  });

  it("versão desconhecida do catálogo ou da agenda, ou a agenda dos Hits no lugar, pede para atualizar", async () => {
    const hitsSchedule = JSON.parse(
      readFileSync(new URL("fixtures/schedule.json", PUBLIC), "utf8"),
    ) as unknown;
    for (const overrides of [
      { "fixtures/anime/catalog.json": { schemaVersion: 2 } },
      { "fixtures/anime/catalog.json": null },
      { "fixtures/anime/schedule.json": { schemaVersion: 2, kind: "anime", days: {} } },
      { "fixtures/anime/schedule.json": hitsSchedule },
    ]) {
      await expect(
        loadAnime(fakeFetch(overrides), BASE, FIXTURE_DATA_DIR),
        JSON.stringify(Object.keys(overrides)),
      ).rejects.toBeInstanceOf(UnsupportedCatalogError);
    }
  });

  it("a agenda do Anime sem os dias pede para tentar de novo (e não quebra a tela)", async () => {
    for (const days of [undefined, null, [], "x"]) {
      const broken = { "fixtures/anime/schedule.json": { schemaVersion: 1, kind: "anime", days } };
      await expect(
        loadAnime(fakeFetch(broken), BASE, FIXTURE_DATA_DIR),
        JSON.stringify(days),
      ).rejects.toBeInstanceOf(DataLoadError);
    }
  });

  it("falha de rede e 404 pedem para tentar de novo", async () => {
    const offline = { "fixtures/anime/schedule.json": new TypeError("Failed to fetch") };
    await expect(loadAnime(fakeFetch(offline), BASE, FIXTURE_DATA_DIR)).rejects.toBeInstanceOf(
      DataLoadError,
    );
    await expect(
      loadAnime(fakeFetch(), "http://localhost:5173/outra/", FIXTURE_DATA_DIR),
    ).rejects.toBeInstanceOf(DataLoadError);
  });

  it("a agenda e o catálogo, cada um sozinho: o Histórico baixa só a agenda (P270)", async () => {
    const calls: string[] = [];
    const serve = fakeFetch();
    const recording: FetchLike = (url, init) => {
      calls.push(url);
      return serve(url, init);
    };
    const schedule = await loadAnimeSchedule(recording, BASE, FIXTURE_DATA_DIR);
    expect(schedule.kind).toBe("anime");
    expect(calls).toEqual([`${BASE}fixtures/anime/schedule.json`]);
    const index = await loadAnimeCatalog(recording, BASE, FIXTURE_DATA_DIR);
    expect(index.catalog.provider).toBe("fixture");
    expect(calls).toEqual([
      `${BASE}fixtures/anime/schedule.json`,
      `${BASE}fixtures/anime/catalog.json`,
    ]);
    // As mesmas conferências da carga inteira.
    const hitsSchedule = JSON.parse(
      readFileSync(new URL("fixtures/schedule.json", PUBLIC), "utf8"),
    ) as unknown;
    await expect(
      loadAnimeSchedule(
        fakeFetch({ "fixtures/anime/schedule.json": hitsSchedule }),
        BASE,
        FIXTURE_DATA_DIR,
      ),
    ).rejects.toBeInstanceOf(UnsupportedCatalogError);
    await expect(
      loadAnimeCatalog(
        fakeFetch({ "fixtures/anime/catalog.json": { schemaVersion: 2 } }),
        BASE,
        FIXTURE_DATA_DIR,
      ),
    ).rejects.toBeInstanceOf(UnsupportedCatalogError);
  });

  it("pickAnimeDay devolve o dia da agenda do Anime ou null", async () => {
    const { schedule } = await loadAnime(fakeFetch(), BASE, FIXTURE_DATA_DIR);
    expect(pickAnimeDay(schedule, "2026-10-08")?.number).toBe(1);
    expect(pickAnimeDay(schedule, "2026-10-07")).toBeNull();
  });
});

describe("datas e dias", () => {
  it("?date= só vale em desenvolvimento e com data válida", () => {
    const now = new Date("2026-10-09T02:00:00Z"); // ainda dia 8 em Brasília
    expect(gameDate(now, "?date=2026-10-12", true)).toBe("2026-10-12");
    expect(gameDate(now, "?date=2026-10-12", false)).toBe("2026-10-08");
    expect(gameDate(now, "?date=2026-02-30", true)).toBe("2026-10-08");
    expect(gameDate(now, "", true)).toBe("2026-10-08");
  });

  it("?failAudio= só em desenvolvimento", () => {
    expect(failAudioTrack("?failAudio=fixture:tr:tr01", true)).toBe("fixture:tr:tr01");
    expect(failAudioTrack("?failAudio=fixture:tr:tr01", false)).toBeNull();
  });

  it("o build lê a parada real; o desenvolvimento, as fixtures (ou a real com ?data=real)", () => {
    expect(dataDirFor(false, "")).toBe(REAL_DATA_DIR);
    expect(dataDirFor(false, "?data=fixtures")).toBe(REAL_DATA_DIR);
    expect(dataDirFor(true, "")).toBe(FIXTURE_DATA_DIR);
    expect(dataDirFor(true, "?data=real")).toBe(REAL_DATA_DIR);
    expect(dataDirFor(true, "?data=outra")).toBe(FIXTURE_DATA_DIR);
  });

  it("?htmlAudio=1 e ?failLookup=1 valem também fora do desenvolvimento (P76)", () => {
    expect(htmlAudioForced("?htmlAudio=1")).toBe(true);
    expect(htmlAudioForced("?htmlAudio=0")).toBe(false);
    expect(lookupFailForced("?data=real&failLookup=1")).toBe(true);
    expect(lookupFailForced("")).toBe(false);
  });

  it("?medalhas=demo e ?medalhas=silencio (M16); qualquer outro valor, nada", () => {
    expect(medalsMode("?medalhas=demo")).toBe("demo");
    expect(medalsMode("?fakeAudio=1&medalhas=silencio")).toBe("silencio");
    expect(medalsMode("?medalhas=1")).toBeNull();
    expect(medalsMode("")).toBeNull();
    // O `avisos` dos e2e (o `openWithMedals`) depende disto: a lista real, com os avisos.
    expect(medalsMode("?fakeAudio=1&medalhas=avisos")).toBeNull();
  });

  it("?fakeAudio=1 liga o motor falso; qualquer outro valor não", () => {
    expect(fakeAudioEnabled("?fakeAudio=1")).toBe(true);
    expect(fakeAudioEnabled("?date=2026-10-08&fakeAudio=1")).toBe(true);
    expect(fakeAudioEnabled("?fakeAudio=0")).toBe(false);
    expect(fakeAudioEnabled("?fakeAudio")).toBe(false);
    expect(fakeAudioEnabled("")).toBe(false);
  });

  it("pickDay devolve o dia ou null", async () => {
    const { schedule } = await loadGameData(fakeFetch(), BASE, FIXTURE_DATA_DIR);
    expect(pickDay(schedule, "2026-10-08")?.number).toBe(1);
    // Um dia antes do epoch: a agenda real cresce toda semana, então uma data futura um dia
    // passaria a existir e o teste quebraria no PR do robô.
    expect(pickDay(schedule, "2026-10-07")).toBeNull();
  });

  it("assetUrl resolve contra a base e aceita URL absoluta", () => {
    expect(assetUrl("http://x.test/musicle-jp/", "fixtures/audio/tr01.wav")).toBe(
      "http://x.test/musicle-jp/fixtures/audio/tr01.wav",
    );
    expect(assetUrl(BASE, "https://audio.example/a.m4a")).toBe("https://audio.example/a.m4a");
  });
});

describe("loadMixedSchedule (M17)", () => {
  it("a agenda das Misturadas, ao lado da do Anime, revalidando o cache", async () => {
    const calls: { url: string; cache: string | undefined }[] = [];
    const serve = fakeFetch();
    const recording: FetchLike = (url, init) => {
      calls.push({ url, cache: init?.cache });
      return serve(url, init);
    };
    const schedule = await loadMixedSchedule(recording, BASE, FIXTURE_DATA_DIR);
    expect(schedule.kind).toBe("anime-mixed");
    expect(calls).toEqual([{ url: `${BASE}fixtures/anime/mixed.json`, cache: "no-cache" }]);
    expect(pickMixedDay(schedule, "2026-10-08")?.number).toBe(1);
    expect(pickMixedDay(schedule, "2026-10-07")).toBeNull();
  });

  it("versão desconhecida, ou a agenda do Anime no lugar, pede para atualizar; sem os dias, tentar de novo", async () => {
    const anime = JSON.parse(
      readFileSync(new URL("fixtures/anime/schedule.json", PUBLIC), "utf8"),
    ) as unknown;
    for (const wrong of [{ schemaVersion: 2, kind: "anime-mixed", days: {} }, anime, null]) {
      await expect(
        loadMixedSchedule(
          fakeFetch({ "fixtures/anime/mixed.json": wrong }),
          BASE,
          FIXTURE_DATA_DIR,
        ),
      ).rejects.toBeInstanceOf(UnsupportedCatalogError);
    }
    const empty = { "fixtures/anime/mixed.json": { schemaVersion: 1, kind: "anime-mixed" } };
    await expect(
      loadMixedSchedule(fakeFetch(empty), BASE, FIXTURE_DATA_DIR),
    ).rejects.toBeInstanceOf(DataLoadError);
  });
});
