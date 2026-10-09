import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assetUrl,
  DataLoadError,
  type FetchLike,
  failAudioTrack,
  gameDate,
  isValidDate,
  loadGameData,
  pickDay,
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
    const data = await loadGameData(fakeFetch(), BASE);
    expect(data.index.tracks.size).toBe(42);
    expect(data.schedule.epoch).toBe("2026-10-08");
  });

  it("versão de schema desconhecida pede para atualizar a página", async () => {
    const future = { "fixtures/schedule.json": { schemaVersion: 2, days: {} } };
    await expect(loadGameData(fakeFetch(future), BASE)).rejects.toBeInstanceOf(
      UnsupportedCatalogError,
    );
  });

  it("falha de rede e 404 pedem para tentar de novo", async () => {
    const offline = { "fixtures/catalog.json": new TypeError("Failed to fetch") };
    await expect(loadGameData(fakeFetch(offline), BASE)).rejects.toBeInstanceOf(DataLoadError);
    await expect(loadGameData(fakeFetch(), "http://localhost:5173/outra/")).rejects.toBeInstanceOf(
      DataLoadError,
    );
  });

  it("resposta que não é JSON pede para tentar de novo", async () => {
    const html: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(loadGameData(html, BASE)).rejects.toBeInstanceOf(DataLoadError);
  });

  it("cancelamento não vira erro de rede", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborting: FetchLike = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    await expect(loadGameData(aborting, BASE, controller.signal)).rejects.not.toBeInstanceOf(
      DataLoadError,
    );
  });
});

describe("datas e dias", () => {
  it("valida datas de calendário", () => {
    expect(isValidDate("2026-10-08")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("08/10/2026")).toBe(false);
  });

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

  it("pickDay devolve o dia ou null", async () => {
    const { schedule } = await loadGameData(fakeFetch(), BASE);
    expect(pickDay(schedule, "2026-10-08")?.number).toBe(1);
    expect(pickDay(schedule, "2027-01-01")).toBeNull();
  });

  it("assetUrl resolve contra a base e aceita URL absoluta", () => {
    expect(assetUrl("http://x.test/musicle-jp/", "fixtures/audio/tr01.wav")).toBe(
      "http://x.test/musicle-jp/fixtures/audio/tr01.wav",
    );
    expect(assetUrl(BASE, "https://audio.example/a.m4a")).toBe("https://audio.example/a.m4a");
  });
});
