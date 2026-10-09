// Kana → romaji (Hepburn) para a busca do autocompletar: quem digita "かあてん" ou "とうきょう"
// deve achar o que o catálogo guardou como "katenkoru" e "tokyo". Só cobre a leitura dos kana;
// kanji não tem leitura única e passa igual (essa parte o pipeline resolve no catálogo).

// Script=Hiragana/Katakana deixa de fora o ー e os dakuten soltos, que são Script=Common:
// "ー" sozinho não tem som e não deve gerar variante em romaji.
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

const VOWELS = new Set(["a", "i", "u", "e", "o"]);

type Row = readonly [kana: string, romaji: string];

/** Monta o mapa a partir de linhas "か き く" / "ka ki ku": cada coluna é um par. */
function table(rows: readonly Row[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const [kana, romaji] of rows) {
    const values = romaji.split(" ");
    kana.split(" ").forEach((key, j) => {
      map.set(key, values[j] ?? "");
    });
  }
  return map;
}

/** Um kana = uma sílaba. Entrada já normalizada: katakana chega convertido em hiragana. */
const SYLLABLES = table([
  ["あ い う え お", "a i u e o"],
  ["か き く け こ", "ka ki ku ke ko"],
  ["が ぎ ぐ げ ご", "ga gi gu ge go"],
  ["さ し す せ そ", "sa shi su se so"],
  ["ざ じ ず ぜ ぞ", "za ji zu ze zo"],
  ["た ち つ て と", "ta chi tsu te to"],
  ["だ ぢ づ で ど", "da ji zu de do"],
  ["な に ぬ ね の", "na ni nu ne no"],
  ["は ひ ふ へ ほ", "ha hi fu he ho"],
  ["ば び ぶ べ ぼ", "ba bi bu be bo"],
  ["ぱ ぴ ぷ ぺ ぽ", "pa pi pu pe po"],
  ["ま み む め も", "ma mi mu me mo"],
  ["や ゆ よ", "ya yu yo"],
  ["ら り る れ ろ", "ra ri ru re ro"],
  // を é "wo", e não o "o" do Hepburn revisado: a consulta é comparada com o romaji do catálogo
  // (cutlet), que escreve "wo" (星に願いを → "hoshininegaiwo").
  ["わ ゐ ゑ を ん ゔ", "wa i e wo n vu"],
  // Pequenos sozinhos (fora de uma combinação) valem o som da letra.
  ["ぁ ぃ ぅ ぇ ぉ ゃ ゅ ょ ゎ ゕ ゖ", "a i u e o ya yu yo wa ka ke"],
  // ヷヸヹヺ não têm hiragana, então o normalize os deixa em katakana.
  ["ヷ ヸ ヹ ヺ", "va vi ve vo"],
]);

/** Duas letras, uma sílaba: os sons que o katakana estendido escreve com vogal pequena. */
const EXTENDED = table([
  ["ふぁ ふぃ ふぇ ふぉ", "fa fi fe fo"],
  ["てぃ でぃ とぅ どぅ", "ti di tu du"],
  ["うぃ うぇ うぉ", "wi we wo"],
  ["ちぇ しぇ じぇ", "che she je"],
  ["ゔぁ ゔぃ ゔぇ ゔぉ", "va vi ve vo"],
]);

/** Kana + ゃゅょ: きゃ → kya, mas しゃ → sha, じゃ → ja e ちゃ → cha (Hepburn). */
const YOON_PREFIX = table([
  ["き ぎ し じ ち ぢ", "ky gy sh j ch j"],
  ["に ひ び ぴ み り", "ny hy by py my ry"],
]);
const YOON_VOWEL = table([["ゃ ゅ ょ", "a u o"]]);

const DIGRAPHS: ReadonlyMap<string, string> = new Map([
  ...EXTENDED,
  ...[...YOON_PREFIX].flatMap(([kana, prefix]) =>
    [...YOON_VOWEL].map(([small, vowel]): [string, string] => [kana + small, prefix + vowel]),
  ),
]);

const SOKUON = "っ";
const LONG_MARK = "ー";

/** Tem hiragana ou katakana (o ー sozinho não conta). */
export function hasKana(text: string): boolean {
  return KANA.test(text);
}

/** っ antes da sílaba: dobra a consoante (っか → kka), e antes de ch vira t (っち → tchi). */
function geminate(syllable: string): string {
  if (syllable.startsWith("ch")) return `t${syllable}`;
  const first = syllable[0] ?? "";
  // Antes de vogal não há consoante para dobrar: o っ some.
  return VOWELS.has(first) ? syllable : first + syllable;
}

/**
 * Romaji Hepburn, em minúsculas, de um texto JÁ normalizado (normalize() converteu katakana em
 * hiragana e tirou espaços e símbolos). Sem apóstrofo depois de ん (ほんや → honya), porque a
 * consulta é comparada com chaves que também não o têm. O que não é kana passa igual.
 */
export function kanaToRomaji(text: string): string {
  const chars = [...text]; // code points, não unidades UTF-16
  let out = "";
  let sokuon = false; // っ esperando a próxima sílaba
  let i = 0;
  while (i < chars.length) {
    const c = chars[i] ?? "";
    if (c === SOKUON) {
      sokuon = true;
      i += 1;
      continue;
    }
    if (c === LONG_MARK) {
      // ー alonga a vogal anterior (かー → kaa); sem vogal antes, não tem som.
      const last = out.at(-1);
      if (last !== undefined && VOWELS.has(last)) out += last;
      sokuon = false;
      i += 1;
      continue;
    }
    const pair = DIGRAPHS.get(c + (chars[i + 1] ?? ""));
    const syllable = pair ?? SYLLABLES.get(c);
    if (syllable === undefined) {
      // Latim, número ou kanji: passa igual, e um っ pendente some (não há o que dobrar).
      out += c;
      sokuon = false;
      i += 1;
      continue;
    }
    out += sokuon ? geminate(syllable) : syllable;
    sokuon = false;
    i += pair === undefined ? 1 : 2;
  }
  return out; // っ no fim nunca é escrito: some
}
