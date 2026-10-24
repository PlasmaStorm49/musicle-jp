"""Os schemas do modo por artista (M13) e do Anime (M14) copiam $defs do catálogo: as cópias não
podem divergir."""

from __future__ import annotations

import pytest
from jsonschema import Draft202012Validator

from musicle_pipeline.io_json import read_json
from musicle_pipeline.paths import (
    anime_catalog_schema_path,
    anime_mixed_schema_path,
    anime_schedule_schema_path,
    artist_list_schema_path,
    artist_schema_path,
    catalog_schema_path,
    schedule_schema_path,
)

CATALOG = read_json(catalog_schema_path())["$defs"]
# O álbum e a faixa do artista são outros (sem distratores, sem a parada); o resto é cópia.
DIFFERENT = {"album", "track"}


# Os $defs só do Anime: não existem no catálogo.
ANIME_ONLY = {"franchiseId", "franchise", "tier", "source"}


@pytest.mark.parametrize(
    "path", [artist_schema_path, artist_list_schema_path, anime_catalog_schema_path]
)
def test_the_schema_is_valid_and_copies_the_catalog(path):
    schema = read_json(path())
    Draft202012Validator.check_schema(schema)
    for name, definition in schema["$defs"].items():
        if name in DIFFERENT or name == "entry" or name in ANIME_ONLY:
            continue
        assert definition == CATALOG[name], name


@pytest.mark.parametrize(
    ("path", "kind"),
    [(anime_schedule_schema_path, "anime"), (anime_mixed_schema_path, "anime-mixed")],
)
def test_the_anime_schedules_copy_the_schedule(path, kind):
    # As agendas do Anime (M14) e das Misturadas (M17): a data, o id da faixa, o número e a versão
    # do catálogo do dia são os da agenda dos Hits; o cabeçalho ganha o kind.
    schema = read_json(path())
    Draft202012Validator.check_schema(schema)
    hits = read_json(schedule_schema_path())
    for name in ("date", "trackId"):
        assert schema["$defs"][name] == hits["$defs"][name], name
    for key in ("number", "catalogVersion"):
        expected = hits["$defs"]["day"]["properties"][key]
        assert schema["$defs"]["day"]["properties"][key] == expected, key
    header = {k: v for k, v in schema["properties"].items() if k not in ("kind", "days")}
    assert header == {k: v for k, v in hits["properties"].items() if k != "days"}
    assert schema["properties"]["kind"]["const"] == kind


def test_the_anime_track_is_the_catalog_track_without_the_chart():
    anime = read_json(anime_catalog_schema_path())["$defs"]
    track = CATALOG["track"]
    assert set(anime["track"]["required"]) == (set(track["required"]) - {"chart", "isrc"}) | {
        "anime"
    }
    assert set(anime["album"]["required"]) == set(CATALOG["album"]["required"]) - {"similar"}
    for key in sorted(set(anime["album"]["properties"]) & set(CATALOG["album"]["properties"])):
        expected = _without_descriptions(CATALOG["album"]["properties"][key])
        assert _without_descriptions(anime["album"]["properties"][key]) == expected, key
    for key in sorted(set(anime["track"]["properties"]) & set(track["properties"])):
        expected = _without_descriptions(track["properties"][key])
        assert _without_descriptions(anime["track"]["properties"][key]) == expected, key


def test_the_artist_track_is_the_catalog_track_without_the_chart():
    artist = read_json(artist_schema_path())["$defs"]["track"]
    track = CATALOG["track"]
    assert set(artist["required"]) == (set(track["required"]) - {"chart", "isrc"}) | {"titleKeys"}
    album = read_json(artist_schema_path())["$defs"]["album"]
    assert set(album["required"]) == set(CATALOG["album"]["required"]) - {"similar"}


def _without_descriptions(value):
    if isinstance(value, dict):
        return {k: _without_descriptions(v) for k, v in value.items() if k != "description"}
    return value


@pytest.mark.parametrize("name", ["track", "album"])
def test_the_common_properties_are_the_catalogs(name):
    # O que a faixa e o álbum do artista têm em comum com os do catálogo é igual (fora as
    # descrições e a busca, cujo "artist" é sempre vazio aqui).
    artist = read_json(artist_schema_path())["$defs"][name]["properties"]
    for key in sorted(set(artist) & set(CATALOG[name]["properties"]) - {"search"}):
        expected = _without_descriptions(CATALOG[name]["properties"][key])
        assert _without_descriptions(artist[key]) == expected, key
