import { describe, expect, it } from "vitest";
import { hasKana, kanaToRomaji } from "./kana.ts";
import { normalize } from "./normalize.ts";

describe("hasKana", () => {
  it.each([
    ["かな", true],
    ["カナ", true],
    ["ｶﾅ", true],
    ["夜明け", true],
    ["abc", false],
    ["東京", false],
    ["", false],
    // ー é comum ao hiragana e ao katakana (Script=Common): sozinho não é kana.
    ["ー", false],
  ])("%s → %s", (text, expected) => {
    expect(hasKana(text)).toBe(expected);
  });
});

describe("kanaToRomaji", () => {
  it.each([
    ["きょう", "kyou"],
    ["しゃしん", "shashin"],
    ["ちゃ", "cha"],
    ["がっこう", "gakkou"],
    ["まっちゃ", "matcha"],
    ["ほんや", "honya"],
    ["ーあ", "a"],
    ["かーてんこーる", "kaatenkooru"],
    ["づ", "zu"],
    ["ぢ", "ji"],
    ["を", "o"],
    ["ふぁ", "fa"],
    ["てぃ", "ti"],
  ])("%s → %s", (kana, romaji) => {
    expect(kanaToRomaji(kana)).toBe(romaji);
  });

  it("tabela básica de Hepburn, com dakuten e handakuten", () => {
    expect(kanaToRomaji("あいうえおかきくけこさしすせそたちつてとなにぬねの")).toBe(
      "aiueokakikukekosashisusesotachitsutetonaninuneno",
    );
    expect(kanaToRomaji("はひふへほまみむめもやゆよらりるれろわゐゑをん")).toBe(
      "hahifuhehomamimumemoyayuyorarirurerowaieon",
    );
    expect(kanaToRomaji("がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ")).toBe(
      "gagigugegozajizuzezodajizudedobabibubebopapipupepovu",
    );
  });

  it("combinações com ゃ, ゅ e ょ", () => {
    const rows: [string, string][] = [
      ["き", "ky"],
      ["ぎ", "gy"],
      ["し", "sh"],
      ["じ", "j"],
      ["ち", "ch"],
      ["ぢ", "j"],
      ["に", "ny"],
      ["ひ", "hy"],
      ["び", "by"],
      ["ぴ", "py"],
      ["み", "my"],
      ["り", "ry"],
    ];
    for (const [kana, prefix] of rows) {
      expect(kanaToRomaji(`${kana}ゃ${kana}ゅ${kana}ょ`)).toBe(`${prefix}a${prefix}u${prefix}o`);
    }
  });

  it("combinações do katakana estendido, já em hiragana", () => {
    expect(
      [
        "ふぁ",
        "ふぃ",
        "ふぇ",
        "ふぉ",
        "てぃ",
        "でぃ",
        "とぅ",
        "どぅ",
        "うぃ",
        "うぇ",
        "うぉ",
        "ちぇ",
        "しぇ",
        "じぇ",
        "ゔぁ",
        "ゔぃ",
        "ゔぇ",
        "ゔぉ",
      ].map(kanaToRomaji),
    ).toEqual([
      "fa",
      "fi",
      "fe",
      "fo",
      "ti",
      "di",
      "tu",
      "du",
      "wi",
      "we",
      "wo",
      "che",
      "she",
      "je",
      "va",
      "vi",
      "ve",
      "vo",
    ]);
  });

  it("vogais e ゃゅょ pequenos sozinhos viram o som da letra", () => {
    expect(kanaToRomaji("ぁぃぅぇぉ")).toBe("aiueo");
    expect(kanaToRomaji("ゃゅょゎ")).toBe("yayuyowa");
  });

  it("っ dobra a consoante seguinte; antes de ch vira t; no fim ou antes de vogal some", () => {
    expect(kanaToRomaji("いっぱい")).toBe("ippai");
    expect(kanaToRomaji("きっさ")).toBe("kissa");
    expect(kanaToRomaji("ざっし")).toBe("zasshi");
    expect(kanaToRomaji("ばっちり")).toBe("batchiri");
    expect(kanaToRomaji("あっ")).toBe("a");
    expect(kanaToRomaji("あっあ")).toBe("aa");
    expect(kanaToRomaji("っ東")).toBe("東");
  });

  it("ー repete a vogal anterior e some quando não há vogal antes", () => {
    expect(kanaToRomaji("かー")).toBe("kaa");
    expect(kanaToRomaji("ー")).toBe("");
    expect(kanaToRomaji("んー")).toBe("n");
    expect(kanaToRomaji("東ー")).toBe("東");
  });

  it("o que não é kana passa igual", () => {
    expect(kanaToRomaji("abc12")).toBe("abc12");
    expect(kanaToRomaji("東京")).toBe("東京");
    expect(kanaToRomaji("夜明けのめろでぃ")).toBe("夜明kenomerodi");
  });

  it("recebe o texto normalizado: katakana e meia largura já viraram hiragana", () => {
    expect(kanaToRomaji(normalize("カーテンコール"))).toBe("kaatenkooru");
    expect(kanaToRomaji(normalize("ｱｲﾉｳﾀ"))).toBe("ainouta");
    expect(kanaToRomaji(normalize("ヴァイオリン"))).toBe("vaiorin");
  });
});
