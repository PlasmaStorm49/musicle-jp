from __future__ import annotations

import pytest

from helpers import track_by_id
from musicle_pipeline.aliases import Alias, load_aliases, parse_aliases
from musicle_pipeline.catalog import Curation, build_catalog
from musicle_pipeline.models import InputError
from musicle_pipeline.validate import validate_catalog

CURATED = """
[tracks."fixture:tr:tr22"]
latin = "Tokyo Lights"
aliases = ["luzes de toquio"]

[tracks."fixture:tr:tr13"]
block = true

[artists."fixture:ar:ar01"]
aliases = ["minatchi"]

[albums."fixture:al:al02"]
latin = "Dawn Collection (Deluxe)"
"""


def _build(snapshots, toml: str):
    return build_catalog(snapshots, "fixture", "jp", Curation(aliases=parse_aliases(toml)))


def test_parse_valid_file():
    a = parse_aliases(CURATED)
    assert a.get("tracks", "fixture:tr:tr22") == Alias(
        latin="Tokyo Lights", aliases=("luzes de toquio",)
    )
    assert a.get("tracks", "fixture:tr:tr13").block is True
    assert a.get("tracks", "nao-existe") == Alias()


@pytest.mark.parametrize(
    ("toml", "message"),
    [
        ("[musicas.x]\nlatin = 'a'", "seção desconhecida"),
        ("[albums.'fixture:al:al01']\nblock = true", "chave desconhecida"),
        ("[tracks.'fixture:tr:tr01']\nlatin = 3", "latin deveria"),
        ("[tracks.'fixture:tr:tr01']\nlatin = '  '", "latin deveria"),
        ("[tracks.'fixture:tr:tr01']\naliases = 'um só'", "aliases deveria"),
        ("[tracks.'fixture:tr:tr01']\nblock = 'sim'", "block deveria"),
        ("[tracks", "TOML inválido"),
    ],
)
def test_invalid_files_are_rejected(toml, message):
    with pytest.raises(InputError, match=message):
        parse_aliases(toml)


def test_missing_file_means_no_curation(tmp_path):
    assert load_aliases(tmp_path / "nao-existe.toml").ids("tracks") == set()


def test_manual_latin_beats_provider(fixture_snapshots):
    t = track_by_id(_build(fixture_snapshots, CURATED), "tr22")
    assert (t["titleLatin"], t["latinSource"]) == ("Tokyo Lights", "manual")
    # O título do provedor deixa de ser exibido, mas continua achando a faixa na busca.
    assert {"tokyolights", "luzesdetoquio"} <= set(t["search"]["title"])


def test_block_wins_over_other_reasons(fixture_snapshots):
    t = track_by_id(_build(fixture_snapshots, CURATED), "tr13")
    assert t["eligible"] == {"daily": False, "reason": "blocked"}


def test_artist_and_album_curation(fixture_snapshots):
    cat = _build(fixture_snapshots, CURATED)
    assert "minatchi" in track_by_id(cat, "tr01")["search"]["artist"]
    album = next(a for a in cat["albums"] if a["id"] == "fixture:al:al02")
    assert (album["titleLatin"], album["latinSource"]) == ("Dawn Collection (Deluxe)", "manual")
    assert validate_catalog(cat) == []


def test_alias_for_unknown_id_is_an_error(fixture_snapshots):
    with pytest.raises(InputError, match="fixture:tr:tr99"):
        _build(fixture_snapshots, "[tracks.'fixture:tr:tr99']\nblock = true")
