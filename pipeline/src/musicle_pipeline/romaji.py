"""Romanização com cutlet (MeCab + dicionário unidic-lite). Só o comando `romanize` importa.

Escolhido no M2 contra o pykakasi: 46 × 44 acertos numa lista de 53 títulos e artistas reais,
leitura de kanji pelo contexto (来い ≠ 恋), grafia estrangeira e licença MIT.
"""

from __future__ import annotations

import re
import unicodedata as ud
from functools import cache
from importlib.metadata import version

import cutlet

ENGINE = "cutlet"
_PACKAGES = ("cutlet", "fugashi", "unidic-lite", "jaconv", "mojimoji")

# Ponto médio separa palavras (ヴィオラ・ノート); o cutlet o trocaria por "/".
_WORD_SEPARATORS = re.compile(r"[・･]")
# Invisíveis (ZWSP, seletor de variação) e símbolos (emoji, ♪) viram "?" ou lixo na saída.
_DROP_CATEGORIES = {"Cc", "Cf", "Co", "Cn", "So", "Sk", "Mn"}


def versions() -> dict[str, str]:
    return {pkg: version(pkg) for pkg in _PACKAGES}


def _clean(text: str) -> str:
    s = _WORD_SEPARATORS.sub(" ", ud.normalize("NFC", text))
    # Mn sai só depois do NFC: o dakuten já foi recomposto (か + ゛ → が) e não se perde aqui.
    s = "".join(c for c in s if ud.category(c) not in _DROP_CATEGORIES)
    return " ".join(s.split())


@cache
def _katsu(foreign: bool) -> cutlet.Cutlet:
    # ensure_ascii=False: com True, qualquer caractere desconhecido vira "?".
    return cutlet.Cutlet(use_foreign_spelling=foreign, ensure_ascii=False)


def _romaji(text: str, foreign: bool) -> str:
    return " ".join(_katsu(foreign).romaji(text).split())


def romanize(text: str) -> tuple[str, ...]:
    """Hepburn primeiro (é o que aparece na tela); grafia estrangeira depois, se diferente.

    A grafia estrangeira (Curtain call, Memory lane) só serve à busca: ela erra às vezes
    ("Tokyo right" para 東京ライツ), e na busca um erro não aparece para o jogador.
    """
    cleaned = _clean(text)
    hepburn = _romaji(cleaned, foreign=False)
    if not hepburn:
        raise ValueError(f"romanização vazia para {text!r}")
    foreign = _romaji(cleaned, foreign=True)
    return (hepburn,) if foreign in ("", hepburn) else (hepburn, foreign)
