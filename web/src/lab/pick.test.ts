import { describe, expect, it } from "vitest";
import { type LabSong, pickMix, poolOf, spreadPans, startOffsets } from "./pick.ts";

function song(id: string, over: Partial<LabSong> = {}): LabSong {
  return {
    trackId: id,
    songKey: `k${id}`,
    franchises: [`f${id}`],
    chance: { musica: 0.6, titulo: 0.6 },
    tiers: { musica: "facil", titulo: "facil" },
    previewSeconds: 30,
    ...over,
  };
}

/** Um "aleatório" que devolve os valores dados, em ciclo. */
const sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

describe("poolOf: a régua", () => {
  const songs = [
    song("1"),
    song("2", { chance: { musica: 0.3, titulo: 0.7 } }),
    song("3", { tiers: { musica: "medio", titulo: "facil" } }),
    song("4", { chance: null }),
  ];

  it("a chance mínima vale dentro do Fácil do modo", () => {
    const ids = (mode: "musica" | "titulo") =>
      poolOf(songs, mode, { kind: "chance", min: 0.5 }).map((s) => s.trackId);
    expect(ids("musica")).toEqual(["1"]); // a 2 tem pouca chance; a 3 não é Fácil na música
    expect(ids("titulo")).toEqual(["1", "2", "3"]); // a 4 não tem chance (sem o arquivo)
  });

  it("as faixas publicadas, na rodada 3 e sem o arquivo da chance", () => {
    const pool = poolOf(songs, "musica", { kind: "tiers", tiers: ["medio", "dificil"] });
    expect(pool.map((s) => s.trackId)).toEqual(["3"]);
  });
});

describe("pickMix: músicas e franquias diferentes", () => {
  it("pula a música e a franquia já escolhidas", () => {
    const pool = [
      song("1"),
      song("2", { franchises: ["f1"] }), // a mesma franquia da 1
      song("3", { songKey: "k1" }), // a mesma música da 1
      song("4"),
    ];
    const picked = pickMix(pool, 2, sequence([0]));
    expect(picked?.map((s) => s.trackId)).toEqual(["1", "4"]);
  });

  it("devolve null quando o acervo não dá", () => {
    expect(pickMix([song("1"), song("2", { franchises: ["f1"] })], 2)).toBeNull();
    expect(pickMix([], 2)).toBeNull();
  });
});

describe("os lados e os começos", () => {
  it("separar espalha de −0,8 a 0,8; uma música fica no centro", () => {
    expect(spreadPans(1)).toEqual([0]);
    expect(spreadPans(2)).toEqual([-0.8, 0.8]);
    expect(spreadPans(3).map((p) => Math.round(p * 10) / 10)).toEqual([-0.8, 0, 0.8]);
  });

  it("do começo, todas no 0; espalhadas, até 12 s, sem cortar o trecho na prévia de cada uma", () => {
    const three = [song("1"), song("2"), song("3")];
    expect(startOffsets(three, 8, false)).toEqual([0, 0, 0]);
    expect(startOffsets(three.slice(0, 2), 8, true, sequence([1, 0.5]))).toEqual([12, 6]);
    expect(startOffsets(three.slice(0, 2), 30, true, sequence([1]))).toEqual([0, 0]);
    // Uma prévia de 20 s, com o trecho de 16: só sobram 4 s para o começo.
    expect(startOffsets([song("4", { previewSeconds: 20 })], 16, true, sequence([1]))).toEqual([4]);
  });
});
