"""As capas dos animes (o Anime Royale, o usuário, 01/11/2026): o padrão dos caminhos, o arquivo, a
leitura da resposta do AnimeThemes, a capa em cada tema do catálogo, as capas falsas das fixtures e
o fetch --anime-covers."""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from dataclasses import replace

import pytest

from musicle_pipeline import fetch_anime as fa
from musicle_pipeline.anime_covers import (
    Cover,
    cover_problems,
    covers_file,
    load_covers,
    path_problem,
)
from musicle_pipeline.cli import main
from musicle_pipeline.fake_assets import generate_anime_covers
from musicle_pipeline.fetch import FetchError
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import InputError
from musicle_pipeline.paths import anime_paths
from musicle_pipeline.validate_anime import validate_anime_catalog

SMALL = "anime/small-cover/cUnunEwN4ktLVaEsSfRSgE7NREhfRMLGXKkkuDuS.avif"
LARGE = "anime/large-cover/mLoIEyGITkJPGCBxvjTpDyDYRM8rDb4ZuFGCKEaH.png"


@pytest.mark.parametrize(
    ("provider", "size", "path"),
    [
        ("apple", "small", SMALL),
        ("apple", "large", LARGE),
        ("apple", "large", "anime/large-cover/abc123.jpg"),
        ("fixture", "small", "anime/small-cover/neon_samurai.svg"),
    ],
)
def test_the_paths_of_each_provider_pass(provider, size, path):
    assert path_problem(provider, size, path) is None


@pytest.mark.parametrize(
    ("provider", "size", "path"),
    [
        ("apple", "small", LARGE),  # a grande no lugar da pequena
        ("apple", "large", "anime/large-cover/../../evil.png"),
        ("apple", "large", "https://example.com/anime/large-cover/a.png"),
        ("apple", "large", "anime/large-cover//a.png"),
        ("apple", "large", "/anime/large-cover/a.png"),
        ("apple", "large", "anime/large-cover/a.svg"),  # o SVG é só das capas falsas
        ("apple", "large", "anime/large-cover/a.png?x=1"),
        ("fixture", "small", SMALL),  # o caminho real nas fixtures
        ("apple", "large", None),
    ],
)
def test_a_path_out_of_the_pattern_is_refused(provider, size, path):
    assert path_problem(provider, size, path) is not None


def test_a_cover_needs_both_sizes():
    assert cover_problems("apple", {"small": SMALL}, "x") == [
        "x: a capa tem de ter só ['small', 'large']"
    ]
    assert cover_problems("apple", {"small": SMALL, "large": LARGE}, "x") == []


def test_the_file_round_trip_and_its_checks(tmp_path):
    path = tmp_path / "covers.json"
    assert load_covers(path, "apple") == {}  # sem o arquivo, nenhuma capa
    covers = {32: Cover(small=SMALL, large=LARGE)}
    path.write_text(dumps(covers_file("apple", covers)), encoding="utf-8")
    assert load_covers(path, "apple") == covers
    with pytest.raises(InputError, match="do provedor 'apple', não fixture"):
        load_covers(path, "fixture")
    data = read_json(path)
    for bad, message in (
        ({**data, "covers": {"032": data["covers"]["32"]}}, "não é um id do MAL"),
        ({**data, "covers": {"32": {"small": SMALL, "large": SMALL}}}, "fora do padrão"),
        ({**data, "extra": 1}, "esperado"),
    ):
        path.write_text(json.dumps(bad), encoding="utf-8")
        with pytest.raises(InputError, match=message):
            load_covers(path, "apple")


def _answer(*items: dict) -> dict:
    return {"data": {"findAnimeByExternalSite": list(items)}}


def _item(mal_ids: list[int], *facets: tuple[str, str]) -> dict:
    return {
        "resources": {"nodes": [{"site": "MAL", "externalId": m} for m in mal_ids]},
        "images": {"nodes": [{"facet": f, "path": p} for f, p in facets]},
    }


def test_parse_covers_takes_both_facets_or_none():
    found = fa.parse_covers(
        _answer(
            _item([1], ("SMALL_COVER", SMALL), ("LARGE_COVER", LARGE), ("GRILL", "x")),
            _item([2], ("LARGE_COVER", LARGE)),  # sem a pequena
            _item([3], ("SMALL_COVER", SMALL), ("LARGE_COVER", "anime/large-cover/../a.png")),
            _item([]),  # sem o id do MAL: fica de fora
        )
    )
    assert found == {1: Cover(small=SMALL, large=LARGE), 2: None, 3: None}
    with pytest.raises(FetchError, match="devolveu erro"):
        fa.parse_covers({"errors": [{"message": "x"}]})


def test_fetch_covers_goes_in_batches_with_the_pause():
    asked: list[list[int]] = []
    pauses: list[float] = []

    def post(url: str, body: bytes, headers: object) -> bytes:
        ids = json.loads(body)["variables"]["ids"]
        asked.append(ids)
        items = [_item([m], ("SMALL_COVER", SMALL), ("LARGE_COVER", LARGE)) for m in ids if m != 7]
        return json.dumps(_answer(*items)).encode()

    io = fa.AnimeFetch(post=post, sleep=pauses.append)
    found, missing = fa.fetch_covers(list(range(150, 0, -1)), io)
    assert [len(b) for b in asked] == [100, 50] and asked[0][0] == 1
    assert pauses == [fa.SOURCE_PACE_SEC]
    assert missing == [7] and len(found) == 149


def test_the_fixture_catalog_carries_the_cover_of_each_theme():
    catalog = read_json(anime_paths("fixture").public_dir / "catalog.json")
    themes = [theme for t in catalog["tracks"] for theme in t["anime"]["themes"]]
    covers = load_covers(anime_paths("fixture").covers, "fixture")
    assert len(covers) == 13
    # O Minato Monogatari (90013) fica sem capa nas fixtures: fora do Royale.
    assert {th["anime"] for th in themes if th["cover"] is None} == {"Minato Monogatari"}
    neon = next(th for th in themes if th["anime"] == "Neon Samurai")
    assert neon["cover"] == {
        "large": "anime/large-cover/neon_samurai.svg",
        "small": "anime/small-cover/neon_samurai.svg",
    }


def test_the_validation_refuses_a_cover_of_another_provider():
    catalog = read_json(anime_paths("fixture").public_dir / "catalog.json")
    theme = next(th for t in catalog["tracks"] for th in t["anime"]["themes"] if th["cover"])
    theme["cover"] = {"small": SMALL, "large": LARGE}  # o caminho real no catálogo fictício
    problems = [p for p in validate_anime_catalog(catalog) if "catalogVersion" not in p]
    assert len(problems) == 2 and all("fora do padrão" in p for p in problems)


def test_the_fake_covers_follow_the_catalog_and_remove_the_orphans(tmp_path):
    catalog = read_json(anime_paths("fixture").public_dir / "catalog.json")
    report = generate_anime_covers(catalog, tmp_path)
    assert len(report.written) == 26  # 13 animes, 2 tamanhos
    svg = tmp_path / "fixtures" / "anime" / "small-cover" / "neon_samurai.svg"
    root = ET.fromstring(svg.read_text(encoding="utf-8"))
    assert root.get("width") == "100" and root.get("height") == "141"
    orphan = svg.with_name("velho.svg")
    orphan.write_text("<svg/>", encoding="utf-8")
    again = generate_anime_covers(catalog, tmp_path)
    assert again.written == [] and again.unchanged == 26 and again.removed == [orphan]
    with pytest.raises(InputError, match="só do provedor fixture"):
        generate_anime_covers({**catalog, "provider": "apple"}, tmp_path)


def test_the_fake_covers_refuse_a_path_out_of_the_folder(tmp_path):
    catalog = read_json(anime_paths("fixture").public_dir / "catalog.json")
    theme = next(th for t in catalog["tracks"] for th in t["anime"]["themes"] if th["cover"])
    theme["cover"]["small"] = "../audio/x.svg"
    with pytest.raises(InputError, match="fora do padrão"):
        generate_anime_covers(catalog, tmp_path)


AT = ["--fetched-at", "2026-11-02T03:00:00Z"]


@pytest.mark.parametrize(
    "extra", [["--anime"], ["--today", "2026-11-02"], ["--artists"], ["--max-anime", "3"]]
)
def test_the_covers_fetch_is_apart(extra, capsys):
    assert main(["fetch", "--provider", "apple", "--anime-covers", *extra, *AT]) == 1
    assert "só aceita o --refresh" in capsys.readouterr().err


def test_the_covers_fetch_asks_only_the_missing_ones(tmp_path, monkeypatch, capsys):
    paths = replace(anime_paths("apple"), covers=tmp_path / "covers.json")
    monkeypatch.setattr("musicle_pipeline.cli.anime_paths", lambda provider: paths)
    asked: list[list[int]] = []

    def fake(ids, io):
        asked.append(list(ids))
        return {m: Cover(small=SMALL, large=LARGE) for m in ids[1:]}, list(ids[:1])

    monkeypatch.setattr("musicle_pipeline.fetch_anime.fetch_covers", fake)
    assert main(["fetch", "--provider", "apple", "--anime-covers", *AT]) == 0
    first = capsys.readouterr().out
    assert "sem capa no AnimeThemes:" in first
    covers = load_covers(paths.covers, "apple")
    wanted = asked[0]
    assert sorted(covers) == wanted[1:]
    # De novo: só a que faltou.
    assert main(["fetch", "--provider", "apple", "--anime-covers", *AT]) == 0
    assert asked[1] == wanted[:1]
    capsys.readouterr()
    # O --refresh pede todas e troca as que vieram; a que não veio fica como estava (uma falha do
    # AnimeThemes não apaga a capa conhecida).
    other = "anime/large-cover/outra.png"
    known = {m: Cover(small=SMALL, large=LARGE if m != wanted[1] else other) for m in wanted}
    paths.covers.write_text(dumps(covers_file("apple", known)), encoding="utf-8")
    assert main(["fetch", "--provider", "apple", "--anime-covers", "--refresh", *AT]) == 0
    assert asked[2] == wanted
    after = load_covers(paths.covers, "apple")
    assert sorted(after) == wanted and after[wanted[1]].large == LARGE
