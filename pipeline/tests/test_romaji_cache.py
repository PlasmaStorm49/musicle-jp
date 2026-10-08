from __future__ import annotations

import subprocess
import sys

import pytest

from helpers import track_by_id
from musicle_pipeline.catalog import Curation, build_catalog
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import InputError
from musicle_pipeline.normalize import needs_romaji
from musicle_pipeline.paths import default_romaji_path
from musicle_pipeline.romaji_cache import RomajiCache, collect_texts, load_cache, save_cache
from musicle_pipeline.validate import validate_catalog


def _cache(entries: dict[str, tuple[str, ...]]) -> RomajiCache:
    return RomajiCache(engine="cutlet", versions={"cutlet": "teste"}, entries=entries)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("夜明けのメロディ", True),
        ("狂騒Riot", True),
        ("Midnight Drive", False),
        ("ＬＯＶＥ　ＳＯＮＧ", False),  # largura total, mas é latim
        ("Re:Pulse", False),
        ("♡", False),  # só símbolo: não há o que romanizar
    ],
)
def test_needs_romaji(text, expected):
    assert needs_romaji(text) is expected


def test_collect_texts_from_the_fixture(fixture_snapshots):
    texts = collect_texts(fixture_snapshots)
    assert texts == sorted(set(texts))
    assert "夜明けのメロディ" in texts
    assert "夜明けのメロディ - Single" not in texts  # sufixo de álbum é removido antes
    assert "ガラスの靴" in texts  # recomposto em NFC, igual ao build
    assert "Midnight Drive" not in texts


def test_cache_round_trip_is_canonical(tmp_path):
    path = tmp_path / "romaji.json"
    cache = _cache({"猫": ("neko",), "ドライフラワー": ("dorai furawā", "Dry Flower")})
    assert save_cache(path, cache) is True
    assert save_cache(path, cache) is False
    assert load_cache(path) == cache
    assert path.read_bytes() == dumps(cache.to_json()).encode("utf-8")


def test_invalid_cache_is_rejected(tmp_path):
    path = tmp_path / "romaji.json"
    path.write_bytes(b'{"engine": "cutlet", "entries": {"\xe7\x8c\xab": []}}')
    with pytest.raises(InputError, match="entries"):
        load_cache(path)


def test_missing_cache_is_empty(tmp_path):
    assert load_cache(tmp_path / "nao-existe.json") == RomajiCache()


def test_romaji_fills_latin_when_provider_has_none(fixture_snapshots):
    cur = Curation(romaji=_cache({"ガラスの靴": ("garasu no kutsu",)}))
    cat = build_catalog(fixture_snapshots, "fixture", "jp", cur)
    t = track_by_id(cat, "tr16")
    assert (t["titleLatin"], t["latinSource"]) == ("garasu no kutsu", "cutlet")
    assert "garasunokutsu" in t["search"]["title"]
    assert validate_catalog(cat) == []


def test_provider_latin_beats_romaji_but_both_search(fixture_snapshots):
    cur = Curation(romaji=_cache({"東京ライツ": ("tōkyō raitsu", "Tokyo Lights")}))
    t = track_by_id(build_catalog(fixture_snapshots, "fixture", "jp", cur), "tr22")
    assert (t["titleLatin"], t["latinSource"]) == ("Tōkyō Lights", "provider")
    assert {"tokyolights", "tokyoraitsu"} <= set(t["search"]["title"])


def test_without_cache_there_is_no_latin(fixture_catalog):
    t = track_by_id(fixture_catalog, "tr16")
    assert (t["titleLatin"], t["latinSource"]) == (None, None)


def test_romanize_check_without_library(tmp_path, fixture_snapshots, capsys):
    path = tmp_path / "romaji.json"
    args = ["romanize", "--provider", "fixture", "--cache", str(path), "--check"]
    assert main(args) == 1
    assert "sem romaji" in capsys.readouterr().err
    save_cache(path, _cache({t: ("x",) for t in collect_texts(fixture_snapshots)}))
    assert main(args) == 0


def test_committed_cache_covers_the_fixture():
    if not default_romaji_path().exists():
        pytest.skip("cache de romaji ainda não gerado")
    assert main(["romanize", "--provider", "fixture", "--check"]) == 0


def test_build_never_imports_the_romaji_library(tmp_path):
    out = tmp_path / "catalog.json"
    code = (
        "import sys\n"
        "from musicle_pipeline.cli import main\n"
        f"assert main(['build', '--provider', 'fixture', '--out', {str(out)!r}]) == 0\n"
        "heavy = ('cutlet', 'fugashi', 'unidic_lite', 'pykakasi', 'musicle_pipeline.romaji')\n"
        "print(sorted(m for m in sys.modules if m in heavy or m.split('.')[0] in heavy))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8", check=True
    )
    assert result.stdout.strip().splitlines()[-1] == "[]"
