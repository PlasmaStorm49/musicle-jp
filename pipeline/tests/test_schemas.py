"""Os schemas do modo por artista (M13) copiam $defs do catálogo: as cópias não podem divergir."""

from __future__ import annotations

import pytest
from jsonschema import Draft202012Validator

from musicle_pipeline.io_json import read_json
from musicle_pipeline.paths import (
    artist_list_schema_path,
    artist_schema_path,
    catalog_schema_path,
)

CATALOG = read_json(catalog_schema_path())["$defs"]
# O álbum e a faixa do artista são outros (sem distratores, sem a parada); o resto é cópia.
DIFFERENT = {"album", "track"}


@pytest.mark.parametrize("path", [artist_schema_path, artist_list_schema_path])
def test_the_schema_is_valid_and_copies_the_catalog(path):
    schema = read_json(path())
    Draft202012Validator.check_schema(schema)
    for name, definition in schema["$defs"].items():
        if name in DIFFERENT or name == "entry":
            continue
        assert definition == CATALOG[name], name


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
