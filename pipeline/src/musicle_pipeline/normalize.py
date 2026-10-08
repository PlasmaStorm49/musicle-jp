"""Normalização de nomes para busca e agrupamento.

Este módulo tem um espelho em TypeScript (web/src/core/normalize.ts, no M4). Os dois lados
são travados pelos mesmos vetores em shared/vectors/normalize.json: qualquer mudança aqui
precisa ser feita lá também, com os vetores atualizados.
"""

from __future__ import annotations

import re
import unicodedata as ud
from collections.abc import Iterable

# Python 3.12 usa Unicode 15.0.0. Os vetores registram essa versão e um teste a confere.
UNICODE_VERSION = ud.unidata_version

_DAKUTEN = "゙゚"  # marcas combinantes de dakuten e handakuten
_LONG_MARK_AFTER_LATIN = re.compile(r"(?<=[a-z])ー+")


def _kata_to_hira(c: str) -> str:
    cp = ord(c)
    # Katakana ァ..ヶ e as marcas de repetição ヽヾ têm o hiragana correspondente 0x60 abaixo.
    if 0x30A1 <= cp <= 0x30F6 or cp in (0x30FD, 0x30FE):
        return chr(cp - 0x60)
    return c


def normalize(text: str) -> str:
    """Chave canônica de um texto para comparação.

    NFKC unifica larguras (ｱ→あ via ア, Ａ→a); lower() (e não casefold()) porque é o que o
    toLowerCase() do JS faz; NFD separa acentos e dakuten; a lista de permissão mantém só
    letras, números e dakuten, o que remove de uma vez espaço, pontuação, símbolo, emoji e
    caracteres invisíveis; NFC recompõe o dakuten (か + ゛ → が).
    """
    s = ud.normalize("NFD", ud.normalize("NFKC", text).lower())
    s = "".join(_kata_to_hira(c) for c in s if ud.category(c)[0] in "LN" or c in _DAKUTEN)
    s = ud.normalize("NFC", s)
    return _LONG_MARK_AFTER_LATIN.sub("", s)


_KUNREI = {
    "sy": "sh",
    "ty": "ch",
    "cy": "ch",
    "zy": "j",
    "jy": "j",
    "si": "shi",
    "ti": "chi",
    "tu": "tsu",
    "zi": "ji",
    "di": "ji",
    "du": "zu",
    "hu": "fu",
}
_KUNREI_RE = re.compile(r"sy|ty|cy|zy|jy|si|ti|tu|zi|di|du|(?<![sc])hu")
_M_BEFORE_LABIAL = re.compile(r"m(?=[bp])")
_DOUBLE_N = re.compile(r"n{2,}")
_LONG_VOWEL = re.compile(r"([aeiu])\1+")
_LONG_O = re.compile(r"o[ou]+")


def _loose_step(s: str) -> str:
    s = _M_BEFORE_LABIAL.sub("n", s)
    s = _KUNREI_RE.sub(lambda m: _KUNREI[m.group()], s)
    s = _DOUBLE_N.sub("n", s)
    s = _LONG_VOWEL.sub(r"\1", s)
    return _LONG_O.sub("o", s)


def loose_key(normalized: str) -> str:
    """Chave "frouxa" para romaji: toukyou, tookyoo e tokyo viram tokyo.

    Repete os passos até o texto parar de mudar (ponto fixo), o que garante que aplicar
    duas vezes dá o mesmo resultado. As regras só mexem em a-z; kana passa intacto.
    """
    s = normalized
    for _ in range(len(s) + 5):  # cada passo encurta ou estabiliza; o limite só evita laço infinito
        t = _loose_step(s)
        if t == s:
            return s
        s = t
    raise AssertionError(f"loose_key não convergiu para {normalized!r}")


def search_key(text: str) -> str:
    return loose_key(normalize(text))


def search_keys(texts: Iterable[str | None]) -> list[str]:
    """Chaves de busca de uma entidade: sem vazias, sem repetição, ordenadas."""
    return sorted({k for t in texts if t for k in [search_key(t)] if k})


_TAILS = tuple(
    re.compile(p)
    for p in (
        r"\s*\(([^()]*)\)\s*$",
        r"\s*\[([^\[\]]*)\]\s*$",
        r"\s*【([^【】]*)】\s*$",
        r"\s*[~〜]([^~〜]+)[~〜]\s*$",
        r"\s-\s((?:(?!\s-\s).)+)$",
    )
)
_VERSION_WORDS = re.compile(
    r"tv\s*-?\s*(?:size|サイズ|ver(?:sion)?\.?|edit)"
    r"|(?:.*(?<![a-z]))?ver(?:sion)?\.?"
    r"|(?:feat|ft)\.?\s.+"
    r"|(?:.*\s)?remix"
    r"|acoustic|instrumental|off\s*vocal"
    r"|live(?:\s.+)?"
    r"|radio\s+edit"
    r"|(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?",
    re.IGNORECASE,
)
_FEAT_NO_BRACKETS = re.compile(r"\s+(?:feat|ft)\.?\s.+$", re.IGNORECASE)
_ALBUM_SUFFIX = re.compile(r"\s+-\s+(?:single|ep)$", re.IGNORECASE)


def strip_version_suffix(title: str) -> str:
    """Tira sufixos de versão do fim do título: "Song - TV Size (Live)" → "Song".

    Só remove o sufixo mais à direita, em laço, e só se o conteúdo do delimitador casar
    INTEIRO com o vocabulário. Por isso "Stay (Forever)" e "Deep (EPIC)" ficam intactos.
    Nunca devolve vazio: "(Live)" sozinho continua "(Live)".
    """
    s = ud.normalize("NFKC", title).strip()
    while True:
        tails = [m for r in _TAILS if (m := r.search(s))]
        last = max(tails, key=lambda m: m.start(), default=None)
        if last is not None and _VERSION_WORDS.fullmatch(last.group(1).strip()):
            t = s[: last.start()].strip()
        else:
            t = _FEAT_NO_BRACKETS.sub("", s).strip()
        if t == s or not t:
            return s
        s = t


def strip_album_suffix(title: str) -> str:
    """ "X - Single" e "X - EP" são sufixos de álbum da loja, não fazem parte do nome."""
    return _ALBUM_SUFFIX.sub("", ud.normalize("NFKC", title).strip())


def title_key(title: str) -> str:
    """Chave do título para agrupar versões da mesma música.

    Título só de símbolos (ex.: "♡") normaliza para vazio; nesse caso usa o próprio texto
    em minúsculas e sem espaços, para não colidir com outras faixas do mesmo artista.
    """
    cleaned = strip_version_suffix(title)
    return normalize(cleaned) or "".join(ud.normalize("NFKC", cleaned).lower().split())


def song_key(title: str, primary_artist_id: str) -> str:
    return f"{title_key(title)}|{primary_artist_id}"


def has_unassigned(text: str) -> bool:
    """Caractere ainda não atribuído no Unicode do Python (Cn) some na normalização."""
    return any(ud.category(c) == "Cn" for c in text)
