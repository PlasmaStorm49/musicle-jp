"""Validação dos arquivos do modo por artista (M13): cada invariante quebrada numa cópia."""

from __future__ import annotations

import copy
import re
import shutil

import pytest

from musicle_pipeline.artists import FLOWER_ROLES, LEVELS
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.paths import REPO_ROOT, artist_list_schema_path, artist_paths
from musicle_pipeline.validate_artists import (
    MAX_FILE_BYTES,
    SASH_ALONG,
    SASH_UPRIGHT,
    validate_artist_dir,
    validate_artist_file,
    validate_artist_list,
    validate_artist_set,
)

PUBLIC = artist_paths("fixture").public_dir


def committed() -> dict[str, dict]:
    return {p.name: read_json(p) for p in sorted(PUBLIC.glob("*.json"))}


def test_the_committed_fixture_is_valid():
    assert validate_artist_dir(PUBLIC) == []


def broken(change) -> list[str]:
    data = copy.deepcopy(read_json(PUBLIC / "ar07.json"))
    change(data)
    return validate_artist_file(data)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda d: d["tracks"].reverse(), "fora de ordem"),
        (lambda d: d["tracks"][0].update(albumId="fixture:al:nada"), "álbum inexistente"),
        (lambda d: d["tracks"][0].update(artistIds=["fixture:ar:ar02"]), "não está nos artistIds"),
        (lambda d: d["tracks"][0].update(songKey="x|fixture:ar:ar02"), "songKey deveria terminar"),
        (lambda d: d["tracks"][1].update(songKey=d["tracks"][0]["songKey"]), "songKey repetido"),
        (lambda d: d["albums"].append({**d["albums"][-1], "id": "fixture:al:zz"}), "sem nenhuma"),
        (lambda d: d.update(artistId="fixture:ar:zz"), "não está em artists"),
        (
            lambda d: d["tracks"][0]["preview"].update(url="https://evil.test/x.wav"),
            "prévia fora dos hosts",
        ),
        (lambda d: d["tracks"][0]["search"].update(artist=["x"]), "schema"),
        (lambda d: d["tracks"][0].update(chart={}), "schema"),
        (
            lambda d: d["tracks"][0].update(eligible={"daily": False, "reason": "blocked"}),
            "faixa inelegível",
        ),
        (lambda d: d["tracks"][0]["search"].update(title=[]), "sem chave de busca"),
        (lambda d: d["tracks"][0].update(titleKeys=["outra"]), "title_key do título"),
    ],
)
def test_each_invariant(change, message):
    assert any(message in p for p in broken(change))


def test_raw_form_and_size():
    data = read_json(PUBLIC / "ar07.json")
    assert any("canônica" in p for p in validate_artist_file(data, dumps(data).encode() + b" "))
    big = b"x" * (MAX_FILE_BYTES + 1)
    assert any("teto" in p for p in validate_artist_file(data, big))


def test_the_list():
    index = read_json(PUBLIC / "index.json")
    assert validate_artist_list(index) == []
    twice = copy.deepcopy(index)
    twice["artists"].append(twice["artists"][0])
    assert any("repetido" in p for p in validate_artist_list(twice))
    named = copy.deepcopy(index)
    named["artists"][0]["file"] = "index.json"
    assert any("não pode usar" in p for p in validate_artist_list(named))
    other = copy.deepcopy(index)
    other["artists"][0]["file"] = "zz.json"  # o web monta o caminho pelo id
    assert any("o arquivo deveria ser ar02.json" in p for p in validate_artist_list(other))


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda f: f.pop("ar01.json"), "não existe"),
        (lambda f: f.update({"zz.json": f["ar01.json"]}), "fora do index.json"),
        (lambda f: f["index.json"]["artists"][0].update(songs=99), "faixas e o index.json diz"),
        (lambda f: f["index.json"]["artists"][0].update(name="Outro"), "nome diferente"),
        (lambda f: f["ar02.json"].update(provider="apple"), "provider/storefront"),
        (lambda f: f["index.json"]["artists"][0].update(id="fixture:ar:zz"), "artistId"),
        (lambda f: f.pop("index.json"), "index.json ausente"),
        # A capa do cartão (P168) é sempre a que a regra escolhe entre os álbuns do arquivo.
        (
            lambda f: f["index.json"]["artists"][0].update(artworkUrl="https://evil.test/x.jpg"),
            "a capa do index.json",
        ),
        (lambda f: f["index.json"]["artists"][0].update(artworkUrl=None), "a capa do index.json"),
        # A capa das medalhas (P296) também é a de um álbum do arquivo.
        (
            lambda f: f["index.json"]["artists"][0]["medals"].update(
                artworkUrl="https://evil.test/x.jpg"
            ),
            "a capa das medalhas",
        ),
    ],
)
def test_the_set(change, message):
    files = copy.deepcopy(committed())
    change(files)
    assert any(message in p for p in validate_artist_set(files))


def test_the_dir_refuses_other_files(tmp_path):
    shutil.copytree(PUBLIC, tmp_path / "artists")
    (tmp_path / "artists" / "capa.svg").write_text("<svg/>", encoding="utf-8")
    assert any("só JSON" in p for p in validate_artist_dir(tmp_path / "artists"))
    assert validate_artist_dir(tmp_path / "nada") == [f"{tmp_path / 'nada'}: pasta ausente"]


def _medals_broken(change) -> list[str]:
    index = copy.deepcopy(read_json(PUBLIC / "index.json"))
    change(index["artists"][0]["medals"])  # o ar02, com as medalhas completas
    return validate_artist_list(index)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        # O latino só com kana, kanji ou hangul, e sempre com eles (P295).
        (lambda m: m["names"]["acertos"].update(latin=None), "leva o latin"),
        (lambda m: m["names"]["completo"].update(name="Curtain Call"), "leva o latin"),
        # A faixa deitada é latina; a em pé cabe até 6 (P299).
        (lambda m: m.update(sash={"text": "夜風", "along": True}), "deitada vai só"),
        (lambda m: m.update(sash={"text": "夜風シアター劇場", "along": False}), "até 6"),
        (lambda m: m.update(sash={"text": "A" * 29, "along": True}), "até 28"),
        (lambda m: m.update(sash={"text": "Re:\tPulse", "along": True}), "deitada vai só"),
        # O schema: sem mácron (P297), as 13 cores, os nomes obrigatórios (P301).
        (lambda m: m["names"]["acertos"].update(latin="Kyōgen"), "schema"),
        (lambda m: m["flowers"].pop("d"), "schema"),
        (lambda m: m["flowers"].update(d="#ABCDEF"), "schema"),
        (lambda m: m.pop("names"), "schema"),
        (lambda m: m["names"]["perfeito"].update(latin="x"), "schema"),
        (lambda m: m.update(crop={"z": 9, "x": 0.5, "y": 0.5}), "schema"),
    ],
)
def test_the_medals_in_the_list(change, message):
    assert any(message in p for p in _medals_broken(change))


def test_an_artist_without_medals_is_refused():
    index = copy.deepcopy(read_json(PUBLIC / "index.json"))
    del index["artists"][0]["medals"]
    assert any("schema" in p for p in validate_artist_list(index))


def test_the_medal_keys_match_the_schema():
    # Os níveis (P302) e os papéis das cores (P296) dos dois lados: o Python e o schema.
    schema = read_json(artist_list_schema_path())
    medals = schema["$defs"]["entry"]["properties"]["medals"]["properties"]
    assert tuple(medals["names"]["required"]) == LEVELS
    assert tuple(medals["flowers"]["required"]) == FLOWER_ROLES
    assert list(medals["flowers"]["properties"]) == list(FLOWER_ROLES)


def test_the_sash_limits_are_the_same_in_the_web():
    # A faixa em pé até SASH_UPRIGHT caracteres, e a deitada até SASH_ALONG (P299): o web troca a
    # mais longa pela letra.
    source = (REPO_ROOT / "web/src/core/medalArt.ts").read_text(encoding="utf-8")
    for name, value in (("SASH_UPRIGHT", SASH_UPRIGHT), ("SASH_ALONG", SASH_ALONG)):
        match = re.search(rf"export const {name} = (\d+);", source)
        assert match and int(match.group(1)) == value, name
