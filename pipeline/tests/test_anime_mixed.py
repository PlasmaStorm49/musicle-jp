"""A agenda das Misturadas (M17): as 4 rodadas de 2, 2, 2 e 3 músicas, a régua, as regras que
nunca afrouxam, a P25 (nenhuma resposta do Anime do dia), o afrouxamento do acervo curto e o
schedule-check do tipo novo."""

from __future__ import annotations

import copy
from datetime import date, timedelta

import pytest

from musicle_pipeline.anime import MODES
from musicle_pipeline.anime_mixed import (
    KIND,
    ROUNDS,
    generate_mixed,
    mixed_rounds,
    mixed_rule_problems,
    validate_mixed_schedule,
)
from musicle_pipeline.anime_schedule import _rounds, generate_anime
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import JSON
from musicle_pipeline.schedule import ScheduleError

EPOCH = date(2026, 10, 8)
VERSION = "2026-10-08.0000abcd"


def track(n: int, tier: str, *, famous: bool = False, franchise: str | None = None) -> JSON:
    """Uma faixa sintética, só com o que as agendas leem; a mesma faixa nos dois modos."""
    return {
        "id": f"x:tr:t{n:04d}",
        "songKey": f"song {n}|x:ar:a{n:04d}",
        "eligible": {"daily": True, "reason": None},
        "anime": {
            "franchiseIds": [f"anime:fr:{franchise or f'f{n:04d}'}"],
            "themes": [{"anime": f"Anime {n}", "type": "OP", "sequence": 1}],
            "tiers": {"musica": tier, "titulo": tier},
            "famous": {"musica": famous, "titulo": famous},
        },
    }


def catalog_of(famous: int, medio: int, dificil: int, facil: int = 0) -> JSON:
    tracks = [track(n, "facil", famous=True) for n in range(famous)]
    for tier, count in (("facil", facil), ("medio", medio), ("dificil", dificil)):
        for _ in range(count):  # um laço, e não uma lista: o len muda a cada faixa
            tracks.append(track(len(tracks), tier))
    fids = sorted({f for t in tracks for f in t["anime"]["franchiseIds"]})
    return {
        "catalogVersion": VERSION,
        "franchises": [{"id": f, "name": f, "search": [f]} for f in fids],
        "tracks": sorted(tracks, key=lambda t: t["id"]),
    }


def both(catalog: JSON, days: int) -> tuple[JSON, JSON]:
    """A agenda do Anime e a das Misturadas dos mesmos dias, a partir do epoch."""
    anime = generate_anime(catalog, None, EPOCH, EPOCH, horizon=days - 1).schedule
    mixed = generate_mixed(catalog, anime, None, EPOCH, EPOCH, horizon=days - 1)
    return anime, mixed.schedule


@pytest.fixture(scope="module")
def big() -> JSON:
    return catalog_of(famous=300, medio=200, dificil=200)


def test_ten_days_keep_every_rule_without_relaxing(big):
    anime = generate_anime(big, None, EPOCH, EPOCH, horizon=9).schedule
    result = generate_mixed(big, anime, None, EPOCH, EPOCH, horizon=9)
    assert result.relaxations == []
    schedule = result.schedule
    assert (schedule["kind"], schedule["epoch"], len(schedule["days"])) == (KIND, "2026-10-08", 10)
    tracks = {t["id"]: t for t in big["tracks"]}
    seen: set[str] = set()
    for day_str, day in sorted(schedule["days"].items()):
        anime_songs = {tracks[a]["songKey"] for _m, _t, _n, a in _rounds(anime["days"][day_str])}
        day_songs = []
        for mode in MODES:
            diary_franchises: list[str] = []
            for n, rnd in enumerate(day[mode], start=1):
                ruler, count = ROUNDS[n - 1]
                picked = [tracks[a] for a in rnd["answers"]]
                assert len(picked) == count, (day_str, mode, n)
                for t in picked:
                    if ruler == "famous":
                        assert t["anime"]["famous"][mode], (day_str, mode, n)
                    else:
                        assert t["anime"]["tiers"][mode] in ("medio", "dificil")
                round_franchises = [f for t in picked for f in t["anime"]["franchiseIds"]]
                assert len(round_franchises) == len(set(round_franchises))
                diary_franchises += round_franchises
                day_songs += [t["songKey"] for t in picked]
            if mode == "titulo":
                assert len(diary_franchises) == len(set(diary_franchises))
        assert len(day_songs) == len(set(day_songs)) == 18, day_str
        assert not set(day_songs) & anime_songs, day_str  # P25
        # A janela de 14 dias: em 10 dias, nenhuma música volta.
        assert not set(day_songs) & seen, day_str
        seen |= set(day_songs)


def test_growing_day_by_day_gives_the_same_days(big):
    # Cada dia só depende dos anteriores (ME51): gerar aos poucos dá o mesmo que de uma vez.
    anime, all_at_once = both(big, 6)
    first = generate_mixed(big, anime, None, EPOCH, EPOCH, horizon=2).schedule
    grown = generate_mixed(big, anime, first, EPOCH + timedelta(days=3), horizon=2).schedule
    assert grown == all_at_once
    assert generate_mixed(big, anime, None, EPOCH, EPOCH, horizon=5).schedule == all_at_once


def test_the_mixed_days_stop_at_the_last_anime_day(big):
    anime = generate_anime(big, None, EPOCH, EPOCH, horizon=2).schedule
    mixed = generate_mixed(big, anime, None, EPOCH, EPOCH, horizon=20).schedule
    assert sorted(mixed["days"]) == sorted(anime["days"])  # cada dia lê o do Anime (P25)
    with pytest.raises(ScheduleError, match="não tem o dia"):
        generate_mixed(big, {"days": {}}, None, EPOCH, EPOCH, horizon=0)


def test_a_short_pool_relaxes_with_a_record_and_keeps_the_fixed_rules():
    small = catalog_of(famous=10, medio=12, dificil=12, facil=8)
    anime, _ = both(small, 1)
    result = generate_mixed(small, anime, None, EPOCH, EPOCH, horizon=2)
    assert result.relaxations
    assert any("o Fácil inteiro" in r for r in result.relaxations)
    tracks = {t["id"]: t for t in small["tracks"]}
    for day in result.schedule["days"].values():
        songs = [tracks[a]["songKey"] for _m, _n, answers in mixed_rounds(day) for a in answers]
        assert len(songs) == len(set(songs))  # nunca afrouxa: a música do dia
        for _m, _n, answers in mixed_rounds(day):
            franchises = [f for a in answers for f in tracks[a]["anime"]["franchiseIds"]]
            assert len(franchises) == len(set(franchises))  # nem a franquia da rodada


def test_the_validation_catches_counts_repeats_and_unknown_answers(big):
    _, mixed = both(big, 1)
    assert validate_mixed_schedule(mixed, big) == []
    day = mixed["days"]["2026-10-08"]
    wrong = copy.deepcopy(mixed)
    wrong["days"]["2026-10-08"]["musica"][0]["answers"].append(day["musica"][1]["answers"][0])
    problems = validate_mixed_schedule(wrong, big)
    assert any("rodada 1: 2 músicas, e não 3" in p for p in problems)
    assert any("faixa repetida no dia" in p for p in problems)
    unknown = copy.deepcopy(mixed)
    unknown["days"]["2026-10-08"]["titulo"][3]["answers"][0] = "x:tr:nope"
    assert any("resposta inexistente" in p for p in validate_mixed_schedule(unknown, big))
    assert any("schema" in p for p in validate_mixed_schedule({**mixed, "kind": "anime"}, big))


def test_the_rules_error_on_this_catalog_and_warn_on_an_older_one(big):
    _, mixed = both(big, 1)
    assert mixed_rule_problems(mixed, big) == ([], [])
    same = copy.deepcopy(mixed)
    rnd = same["days"]["2026-10-08"]["musica"][0]["answers"]
    clash = next(t for t in big["tracks"] if t["id"] == rnd[0])
    big2 = copy.deepcopy(big)
    for t in big2["tracks"]:
        if t["id"] == rnd[1]:
            t["anime"]["franchiseIds"] = clash["anime"]["franchiseIds"]
    errors, _ = mixed_rule_problems(same, big2)
    assert any("mesma franquia na rodada" in e for e in errors)
    big2["catalogVersion"] = "2026-10-09.1111abcd"
    errors, warnings = mixed_rule_problems(same, big2)
    assert errors == [] and any("mesma franquia" in w for w in warnings)


def test_the_schedule_check_regenerates_the_mixed_days_with_the_anime_beside(tmp_path, big, capsys):
    anime, mixed = both(big, 6)
    base = generate_mixed(big, anime, None, EPOCH, EPOCH, horizon=2).schedule
    (tmp_path / "catalog.json").write_bytes(dumps(big).encode("utf-8"))
    (tmp_path / "schedule.json").write_bytes(dumps(anime).encode("utf-8"))
    (tmp_path / "base.json").write_bytes(dumps(base).encode("utf-8"))
    path = tmp_path / "mixed.json"
    args = ["schedule-check", "--path", str(path), "--base", str(tmp_path / "base.json")]
    args += ["--catalog", str(tmp_path / "catalog.json")]
    path.write_bytes(dumps(mixed).encode("utf-8"))
    assert main(args) == 0
    assert "3 dia(s) da base preservados, 6 no total" in capsys.readouterr().out
    # Um dia novo editado à mão: só o gerador das Misturadas, com o Anime ao lado, percebe.
    edited = copy.deepcopy(mixed)
    rnd = edited["days"]["2026-10-12"]["musica"][0]["answers"]
    rnd[0], rnd[1] = rnd[1], rnd[0]
    path.write_bytes(dumps(edited).encode("utf-8"))
    assert main(args) == 1
    assert "2026-10-12: dia novo diferente do que o gerador daria" in capsys.readouterr().out
    # Sem a agenda do Anime ao lado, não dá para regerar (P25).
    (tmp_path / "schedule.json").unlink()
    path.write_bytes(dumps(mixed).encode("utf-8"))
    assert main(args) == 1
    assert "sem a agenda do Anime ao lado" in capsys.readouterr().out
