// Normalização de nomes para a busca. Espelho de pipeline/src/musicle_pipeline/normalize.py:
// os dois lados são travados pelos vetores de shared/vectors/normalize.json e por um teste
// cruzado (pipeline/tests/test_cross_language.py) que compara todo o plano básico do Unicode.
// titleKey e os sufixos de versão existem só no Python: o songKey chega pronto no catálogo.

const DAKUTEN = new Set(["゙", "゚"]); // marcas combinantes de dakuten e handakuten
const LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;
const LONG_MARK_AFTER_LATIN = /(?<=[a-z])ー+/g;

function kataToHira(c: string): string {
  const cp = c.codePointAt(0) ?? 0;
  // Katakana ァ..ヶ e as marcas de repetição ヽヾ têm o hiragana correspondente 0x60 abaixo.
  if ((cp >= 0x30a1 && cp <= 0x30f6) || cp === 0x30fd || cp === 0x30fe) {
    return String.fromCodePoint(cp - 0x60);
  }
  return c;
}

/**
 * Chave canônica de um texto: NFKC unifica larguras, toLowerCase() (igual ao lower() do
 * Python), NFD separa acentos e dakuten, a lista de permissão mantém só letras, números e
 * dakuten, e NFC recompõe o dakuten (か + ゛ → が).
 */
export function normalize(text: string): string {
  let kept = "";
  // for...of percorre code points, como o Python, e não unidades UTF-16.
  for (const c of text.normalize("NFKC").toLowerCase().normalize("NFD")) {
    if (LETTER_OR_NUMBER.test(c) || DAKUTEN.has(c)) {
      kept += kataToHira(c);
    }
  }
  return kept.normalize("NFC").replace(LONG_MARK_AFTER_LATIN, "");
}

const KUNREI: Readonly<Record<string, string>> = {
  sy: "sh",
  ty: "ch",
  cy: "ch",
  zy: "j",
  jy: "j",
  si: "shi",
  ti: "chi",
  tu: "tsu",
  zi: "ji",
  di: "ji",
  du: "zu",
  hu: "fu",
};
const KUNREI_RE = /sy|ty|cy|zy|jy|si|ti|tu|zi|di|du|(?<![sc])hu/g;

function looseStep(s: string): string {
  return s
    .replace(/m(?=[bp])/g, "n")
    .replace(KUNREI_RE, (m) => KUNREI[m] ?? m)
    .replace(/n{2,}/g, "n")
    .replace(/([aeiu])\1+/g, "$1")
    .replace(/o[ou]+/g, "o");
}

/** Chave "frouxa" para romaji (toukyou, tookyoo e tokyo viram tokyo), até o ponto fixo. */
export function looseKey(normalized: string): string {
  let s = normalized;
  const limit = normalized.length + 5; // cada passo encurta ou estabiliza
  for (let i = 0; i < limit; i++) {
    const next = looseStep(s);
    if (next === s) {
      return s;
    }
    s = next;
  }
  throw new Error(`looseKey não convergiu para ${JSON.stringify(normalized)}`);
}

/** Chave usada na busca: a mesma regra no catálogo (Python) e na consulta do jogador (TS). */
export function searchKey(text: string): string {
  return looseKey(normalize(text));
}
