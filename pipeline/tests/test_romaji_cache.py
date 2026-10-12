from __future__ import annotations

import subprocess
import sys

import pytest

from helpers import track_by_id
from musicle_pipeline.catalog import Curation, build_catalog
from musicle_pipeline.cli import main, romanize_each
from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import InputError
from musicle_pipeline.normalize import needs_romaji
from musicle_pipeline.paths import artist_paths, provider_paths, repo_root
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
    if not provider_paths("fixture").romaji.exists():
        pytest.skip("cache de romaji ainda não gerado")
    assert main(["romanize", "--provider", "fixture", "--check"]) == 0


def test_build_never_imports_the_romaji_library(tmp_path):
    out = tmp_path / "catalog.json"
    artists = tmp_path / "artists"
    code = (
        "import sys\n"
        "from musicle_pipeline.cli import main\n"
        f"assert main(['build', '--provider', 'fixture', '--out', {str(out)!r}]) == 0\n"
        f"assert main(['build-artists', '--provider', 'fixture', '--out-dir', {str(artists)!r}]) == 0\n"
        "heavy =('cutlet', 'fugashi', 'unidic_lite', 'pykakasi', 'musicle_pipeline.romaji')\n"
        "print(sorted(m for m in sys.modules if m in heavy or m.split('.')[0] in heavy))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8", check=True
    )
    assert result.stdout.strip().splitlines()[-1] == "[]"


def test_committed_artist_cache_covers_the_fixture_artists():
    assert main(["romanize", "--provider", "fixture", "--artists", "--check"]) == 0


# Os quatro caches: a parada e o modo por artista (M13) de cada provedor (o de artistas da Apple
# entra com os dados reais).
CACHES = {
    "fixture": provider_paths("fixture").romaji,
    "apple": provider_paths("apple").romaji,
    "fixture-artists": artist_paths("fixture").romaji,
}


@pytest.mark.parametrize("cache_name", sorted(CACHES))
def test_cache_versions_match_the_pinned_libraries(cache_name):
    # O robô semanal recusa um romaji.json que muda o que já existe, inclusive as versões gravadas.
    # Trocar a versão de uma biblioteca do romaji no constraints.txt sem rodar romanize --refresh
    # travaria o robô na segunda seguinte: este teste roda na CI (sem o extra) e acusa antes.
    pins = {}
    for line in (
        (repo_root() / "pipeline" / "constraints.txt").read_text(encoding="utf-8").splitlines()
    ):
        name, sep, version = line.split("#")[0].strip().partition("==")
        if sep:
            pins[name.lower()] = version
    cache = load_cache(CACHES[cache_name])
    assert cache.versions, "o cache não gravou as versões"
    for name, version in cache.versions.items():
        assert pins.get(name.lower()) == version, (
            f"{name}: cache {version}, constraints {pins.get(name.lower())}"
        )


def test_a_text_the_library_cannot_read_does_not_stop_the_others():
    # O cutlet devolve vazio para um 々 sozinho, e o romaji.py lança ValueError: antes, nada era
    # gravado e o robô semanal parava toda semana enquanto a faixa estivesse na parada.
    def fake(text: str) -> tuple[str, ...]:
        if text == "々":
            raise ValueError("vazio")
        return (f"r-{text}",)

    done, failed = romanize_each(["曲", "々", "歌"], fake)
    assert done == {"曲": ("r-曲",), "々": ("々",), "歌": ("r-歌",)}
    assert failed == ["々"]


def test_an_unread_text_is_searchable_but_never_shown_as_latin():
    # O "latino" guardado é o próprio texto em japonês: não pode virar titleLatin (cutlet).
    cur = Curation(romaji=RomajiCache(engine="cutlet", entries={"々": ("々",), "歌": ("uta",)}))
    assert cur.latin("tracks", "x:tr:1", "々", None) == (None, None)
    assert cur.latin("tracks", "x:tr:2", "歌", None) == ("uta", "cutlet")
    assert "々" in cur.search_texts("tracks", "x:tr:1", "々", None)
