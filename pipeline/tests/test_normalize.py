from __future__ import annotations

import itertools
import sys
import unicodedata as ud

import pytest

from musicle_pipeline.io_json import read_json
from musicle_pipeline.normalize import (
    UNICODE_VERSION,
    has_unassigned,
    loose_key,
    normalize,
    search_keys,
    strip_album_suffix,
    title_key,
)
from musicle_pipeline.paths import repo_root

VECTORS = read_json(repo_root() / "shared" / "vectors" / "normalize.json")


def test_unicode_version_matches_vectors():
    # Se falhar, o Python mudou de versão: os bytes do catálogo podem mudar.
    assert VECTORS["unicodeVersion"] == UNICODE_VERSION == "15.0.0"


@pytest.mark.parametrize("case", VECTORS["normalize"], ids=lambda c: c.get("note", c["in"]))
def test_normalize_vectors(case):
    assert normalize(case["in"]) == case["out"]


@pytest.mark.parametrize("case", VECTORS["looseKey"], ids=lambda c: c["in"])
def test_loose_key_vectors(case):
    assert loose_key(case["in"]) == case["out"]


@pytest.mark.parametrize("case", VECTORS["titleKey"], ids=lambda c: c["in"])
def test_title_key_vectors(case):
    assert title_key(case["in"]) == case["out"]


def test_normalize_is_idempotent_over_the_whole_bmp():
    # Varre todos os 65 mil code points do plano básico (menos os surrogates, que não são texto).
    failures = [
        hex(cp)
        for cp in itertools.chain(range(0xD800), range(0xE000, 0x10000))
        if normalize(normalize(chr(cp))) != normalize(chr(cp))
    ]
    assert failures == []


def test_loose_key_is_idempotent_over_short_strings():
    # Todas as combinações de até 4 letras das que as regras usam: cerca de 89 mil strings.
    alphabet = "aeiounmshtczjydbp"
    failures = []
    for size in range(1, 5):
        for letters in itertools.product(alphabet, repeat=size):
            s = "".join(letters)
            once = loose_key(s)
            if loose_key(once) != once:
                failures.append(s)
    assert failures == []


def test_dakuten_survives_normalization():
    for kana in "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ":
        assert normalize(kana) == kana
        assert normalize(chr(ord(kana) + 0x60)) == kana  # katakana → hiragana


def test_search_keys_dedupe_drop_empty_and_sort():
    assert search_keys(["Tokyo", "TŌKYŌ", "toukyou", None, "♡", ""]) == ["tokyo"]
    assert search_keys(["b", "a"]) == ["a", "b"]


def test_strip_album_suffix():
    assert strip_album_suffix("夜明けのメロディ - Single") == "夜明けのメロディ"
    assert strip_album_suffix("RIOT - EP") == "RIOT"
    assert strip_album_suffix("Single Life") == "Single Life"


def test_has_unassigned():
    unassigned = next(chr(cp) for cp in range(0x2FE0, 0x3000) if ud.category(chr(cp)) == "Cn")
    assert has_unassigned(f"abc{unassigned}")
    assert not has_unassigned("夜明けのメロディ")


def test_python_is_312():
    assert sys.version_info[:2] == (3, 12)
