"""Artistas fictícios (M13): as faixas publicadas são as da parada fictícia, com as mesmas URLs,
então o fake-assets da parada já gera o áudio e as capas que o modo por artista usa."""

from __future__ import annotations

from musicle_pipeline.io_json import read_json
from musicle_pipeline.paths import artist_paths, repo_root

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
