"""Artistas fictícios (M13): as faixas publicadas são as da parada fictícia, com as mesmas URLs,
então o fake-assets da parada já gera o áudio e as capas que o modo por artista usa."""

from __future__ import annotations

import pytest

from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import InputError
from musicle_pipeline.paths import artist_paths, repo_root
from musicle_pipeline.providers.fixture_artists import FixtureArtistProvider

PUBLIC = artist_paths("fixture").public_dir
CATALOG = read_json(repo_root() / "web" / "public" / "fixtures" / "catalog.json")


def published() -> list[dict]:
    index = read_json(PUBLIC / "index.json")
    return [read_json(PUBLIC / e["file"]) for e in index["artists"]]


def test_every_published_track_is_a_chart_track_with_the_same_urls():
    tracks = {t["id"]: t for t in CATALOG["tracks"]}
    albums = {a["id"]: a for a in CATALOG["albums"]}
    for data in published():
        for t in data["tracks"]:
            chart = tracks[t["id"]]  # nenhuma faixa sintética chega ao arquivo publicado
            assert t["title"] == chart["title"]
            assert t["preview"] == chart["preview"]
        for a in data["albums"]:
            assert a["artworkUrl"] == albums[a["id"]]["artworkUrl"]


def test_every_ref_is_in_the_chart_fixture():
    source = read_json(artist_paths("fixture").source)
    ids = {t["id"].removeprefix("fixture:tr:") for t in CATALOG["tracks"]}
    for spec in source["artists"].values():
        for item in spec["entries"]:
            assert "ref" not in item or item["ref"] in ids


def _provider(tmp_path, artists: dict) -> FixtureArtistProvider:
    path = tmp_path / "artists_fixture.json"
    data = {"provider": "fixture", "storefront": "jp", "fetchedAt": "2026-11-02T12:00:00Z"}
    path.write_bytes(dumps({**data, "artists": artists}).encode("utf-8"))
    return FixtureArtistProvider(path)


def test_the_declared_anime_artist_joins_every_track(tmp_path):
    # O anime fictício (o usuário, 02/11/2026): nenhuma faixa o credita, e ele entra nos artistas
    # de todas, depois do intérprete, que continua na exibição.
    anime = {"artist": {"name": "夜空物語シリーズ", "nameLatin": "YOZORA Series"}}
    entries = [{"rank": 1, "ref": "tr09"}, {"rank": None, "ref": "tr05"}]
    snap = _provider(tmp_path, {"ar90": {**anime, "entries": entries}}).snapshot("ar90")
    assert (snap.artist.name, snap.artist.name_latin) == ("夜空物語シリーズ", "YOZORA Series")
    by_id = {e.track.provider_id: e.track for e in snap.entries}
    assert [a.provider_id for a in by_id["tr09"].artists] == ["ar08", "ar90"]
    assert by_id["tr09"].artist_display == "KOTONOHA"
    assert [a.provider_id for a in by_id["tr05"].artists] == ["ar02", "ar07", "ar90"]
    assert by_id["tr05"].artist_display == "夜風シアター & 青井ユウ"


def test_a_common_artist_keeps_the_guard_against_a_wrong_ref(tmp_path):
    # Sem o "artist" declarado, a faixa de outro artista não vira dele: o validate a recusa, e um
    # artista sem nenhuma faixa dele é erro aqui.
    provider = _provider(
        tmp_path,
        {
            "ar02": {"entries": [{"rank": 1, "ref": "tr23"}, {"rank": 2, "ref": "tr09"}]},
            "ar99": {"entries": [{"rank": 1, "ref": "tr09"}]},
        },
    )
    by_id = {e.track.provider_id: e.track for e in provider.snapshot("ar02").entries}
    assert [a.provider_id for a in by_id["tr09"].artists] == ["ar08"]
    with pytest.raises(InputError, match="nenhuma faixa credita"):
        provider.snapshot("ar99")


@pytest.mark.parametrize(
    "declared", ["夜空", {"nome": "x"}, {"name": 1}, {"name": "x", "nameLatin": 2}]
)
def test_a_malformed_declared_artist_is_an_error(tmp_path, declared):
    provider = _provider(tmp_path, {"ar90": {"artist": declared, "entries": [{"ref": "tr09"}]}})
    with pytest.raises(InputError, match='"artist" deveria ser'):
        provider.snapshot("ar90")
