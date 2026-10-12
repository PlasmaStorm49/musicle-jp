"""Validação dos arquivos do modo por artista (M13): cada invariante quebrada numa cópia."""

from __future__ import annotations

import copy
import shutil

import pytest

from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.paths import artist_paths
from musicle_pipeline.validate_artists import (
    MAX_FILE_BYTES,
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
