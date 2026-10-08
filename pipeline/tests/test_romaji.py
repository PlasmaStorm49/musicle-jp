"""Testes da biblioteca de romaji. Pulados quando o extra [romaji] não está instalado (ex.: CI)."""

from __future__ import annotations

import pytest

pytest.importorskip(
    "cutlet", reason='extra [romaji] não instalado: pip install -e "pipeline[romaji]"'
)

from musicle_pipeline import romaji
from musicle_pipeline.normalize import search_key

# Casos da lista de referência do M2 em que o cutlet acertou, aprovados como regressão.
# Compara pela chave de busca: espaço, maiúscula e vogal longa não importam.
APPROVED = [
    ("夜に駆ける", "yoru ni kakeru"),
    ("春よ、来い", "haru yo koi"),  # 来い, não 恋: leitura pelo contexto
    ("君の知らない物語", "kimi no shiranai monogatari"),
    ("残響散歌", "zankyō sanka"),
    ("世界に一つだけの花", "sekai ni hitotsu dake no hana"),
    ("うっせぇわ", "usseewa"),
    ("ドライフラワー", "dorai furawā"),
    ("宇多田ヒカル", "utada hikaru"),
    ("緑黄色社会", "ryokuōshoku shakai"),
    ("King Gnu", "king gnu"),
]

# Erros conhecidos do cutlet: se um dia passarem a acertar, o teste avisa para tirar o alias.
KNOWN_WRONG = [("千本桜", "senbonzakura"), ("米津玄師", "yonezu kenshi"), ("①番星", "ichibanboshi")]


@pytest.mark.parametrize(("text", "expected"), APPROVED)
def test_approved_readings(text, expected):
    assert search_key(romaji.romanize(text)[0]) == search_key(expected)


@pytest.mark.parametrize(("text", "correct"), KNOWN_WRONG)
def test_known_wrong_readings_still_need_curation(text, correct):
    assert all(search_key(v) != search_key(correct) for v in romaji.romanize(text))


def test_foreign_spelling_comes_second():
    assert romaji.romanize("カーテンコール") == ("Kaaten kooru", "Curtain call")


def test_symbols_and_invisible_characters_are_dropped():
    out = romaji.romanize("君​と❤️")
    assert out == ("Kimi to",)


def test_middle_dot_becomes_space():
    assert romaji.romanize("ヴィオラ・ノート")[0] == "Viora nooto"


def test_versions_are_pinned():
    assert romaji.versions() == {
        "cutlet": "0.5.2",
        "fugashi": "1.5.2",
        "unidic-lite": "1.0.8",
        "jaconv": "0.5.0",
        "mojimoji": "0.0.13",
    }
