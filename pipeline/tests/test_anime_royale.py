"""A agenda do Anime Royale (o usuário, 01/11/2026): as 3 dificuldades de 5 músicas e 9 opções, a
capa, as regras que nunca afrouxam, as respostas dos outros diários do dia, a mistura de tipos das
erradas, a franquia com chance menor, o afrouxamento do acervo curto e os comandos."""

from __future__ import annotations

import copy
from collections import Counter
from dataclasses import replace
from datetime import date, timedelta

import pytest

from musicle_pipeline.anime import TIERS
from musicle_pipeline.anime_mixed import generate_mixed, mixed_rounds
from musicle_pipeline.anime_royale import (
    FRANCHISE_NEW,
    NEW_PER_ROUND,
    OPTIONS,
    PLAYED,
    WINDOW,
    _Index,
    _levels,
    _weighted,
    anime_of,
    generate_royale,
    royale_rounds,
    royale_rule_problems,
    royale_short_pools,
    validate_royale_schedule,
)
from musicle_pipeline.anime_schedule import _rounds, generate_anime, theme_type
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import MIXED_FILE, ROYALE_FILE, anime_paths
from musicle_pipeline.prng import seeded
from musicle_pipeline.schedule import ScheduleError

EPOCH = date(2026, 10, 8)
VERSION = "2026-10-08.0000abcd"
KINDS = ("OP", "ED", "IN")


def track(n: int, tier: str, *, franchise: str | None = None, cover: bool = True) -> JSON:
    """Uma faixa sintética, só com o que as agendas leem: um anime por faixa, com a capa, e o tipo
    do tema alternando entre abertura, encerramento e inserção."""
    covers = {"small": f"anime/small-cover/a{n}.avif", "large": f"anime/large-cover/a{n}.avif"}
    theme = {"anime": f"Anime {n}", "cover": covers if cover else None, "type": KINDS[n % 3]}
    return {
        "id": f"x:tr:t{n:04d}",
        "songKey": f"song {n}|x:ar:a{n:04d}",
        "eligible": {"daily": True, "reason": None},
        "anime": {
            "franchiseIds": [f"anime:fr:{franchise or f'f{n:04d}'}"],
            "themes": [{**theme, "sequence": 1}],
            "tiers": {"musica": tier, "titulo": tier},
        },
    }


def catalog_of(facil: int, medio: int, dificil: int, **options: object) -> JSON:
    tracks: list[JSON] = []
    for tier, count in (("facil", facil), ("medio", medio), ("dificil", dificil)):
        for _ in range(count):  # um laço, e não uma lista: o len muda a cada faixa
            tracks.append(track(len(tracks), tier, **options))  # type: ignore[arg-type]
    return {
        "catalogVersion": VERSION,
        "franchises": [],
        "tracks": sorted(tracks, key=lambda t: t["id"]),
    }


def sides(catalog: JSON, days: int) -> tuple[JSON, JSON]:
    """A agenda do Anime e a das Misturadas dos mesmos dias, a partir do epoch."""
    anime = generate_anime(catalog, None, EPOCH, EPOCH, horizon=days - 1).schedule
    mixed = generate_mixed(catalog, anime, None, EPOCH, EPOCH, horizon=days - 1).schedule
    return anime, mixed


def royale(catalog: JSON, days: int, quiz: JSON | None = None):
    anime, mixed = sides(catalog, days)
    return generate_royale(catalog, anime, mixed, quiz, None, EPOCH, EPOCH, horizon=days - 1)


@pytest.fixture(scope="module")
def big() -> JSON:
    return catalog_of(facil=400, medio=300, dificil=300)


def test_ten_days_keep_every_rule_without_relaxing(big):
    anime, mixed = sides(big, 10)
    result = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=9)
    assert result.relaxations == []
    schedule = result.schedule
    assert validate_royale_schedule(schedule, big) == []
    assert royale_rule_problems(schedule, big) == ([], [])
    tracks = {t["id"]: t for t in big["tracks"]}
    played_before: dict[str, date] = {}
    for day_str, day in sorted(schedule["days"].items()):
        d = date.fromisoformat(day_str)
        others = {a for _m, _t, _n, a in _rounds(anime["days"][day_str])}
        others |= {a for _m, _n, found in mixed_rounds(mixed["days"][day_str]) for a in found}
        titles = {
            f
            for mode, _t, _n, a in _rounds(anime["days"][day_str])
            if mode == "titulo"
            for f in tracks[a]["anime"]["franchiseIds"]
        }
        for tier, rnd in royale_rounds(day):
            assert len(rnd["played"]) == PLAYED and len(rnd["options"]) == OPTIONS
            assert set(rnd["played"]) <= set(rnd["options"])
            options = [tracks[o] for o in rnd["options"]]
            assert {t["anime"]["tiers"]["titulo"] for t in options} == {tier}
            assert len({anime_of(t) for t in options}) == OPTIONS
            assert not set(rnd["options"]) & others
            assert not {f for t in options for f in t["anime"]["franchiseIds"]} & titles
            for answer in rnd["played"]:
                # A janela: a música que tocou não toca de novo em WINDOW dias.
                last = played_before.get(answer)
                assert last is None or (d - last).days >= WINDOW
                played_before[answer] = d


def test_growing_day_by_day_gives_the_same_days(big):
    anime, mixed = sides(big, 6)
    whole = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=5).schedule
    grown = None
    for k in range(6):
        today = EPOCH + timedelta(days=k)
        grown = generate_royale(big, anime, mixed, None, grown, today, EPOCH, horizon=0).schedule
    assert grown == whole


def test_the_royale_stops_at_the_last_day_of_the_other_schedules(big):
    anime, mixed = sides(big, 4)
    result = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=20)
    assert sorted(result.schedule["days"])[-1] == "2026-10-11"
    quiz = {"days": {"2026-10-08": {"rounds": []}, "2026-10-09": {"rounds": []}}}
    result = generate_royale(big, anime, mixed, quiz, None, EPOCH, EPOCH, horizon=20)
    assert sorted(result.schedule["days"])[-1] == "2026-10-09"


def test_the_songs_of_the_quiz_of_the_day_stay_out(big):
    anime, mixed = sides(big, 1)
    free = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=0).schedule
    day = free["days"]["2026-10-08"]
    # O quiz do dia revela o nome das músicas dele: as opções do Royale sem ele as evitam.
    taken = [o for _tier, rnd in royale_rounds(day) for o in rnd["options"]][:6]
    quiz = {
        "days": {"2026-10-08": {"rounds": [{"a": taken[i], "b": taken[i + 1]} for i in (0, 2, 4)]}}
    }
    day = generate_royale(big, anime, mixed, quiz, None, EPOCH, EPOCH, horizon=0).schedule["days"]
    options = {o for _tier, rnd in royale_rounds(day["2026-10-08"]) for o in rnd["options"]}
    assert not options & set(taken)
    # O quiz sem o dia: o Royale não tem como evitá-lo.
    with pytest.raises(ScheduleError, match="o quiz não tem o dia"):
        quiz = {"days": {"2026-10-09": {"rounds": []}}}
        generate_royale(big, anime, mixed, quiz, None, EPOCH, EPOCH)


def test_the_wrong_options_follow_the_kinds_of_the_played_ones(big):
    tracks = {t["id"]: t for t in big["tracks"]}
    schedule = royale(big, 10).schedule
    for day in schedule["days"].values():
        for _tier, rnd in royale_rounds(day):
            played = Counter(theme_type(tracks[p]) for p in rnd["played"])
            wrong = [o for o in rnd["options"] if o not in rnd["played"]]
            assert not Counter(theme_type(tracks[w]) for w in wrong) - played


def test_a_song_without_a_cover_never_enters():
    catalog = catalog_of(facil=200, medio=200, dificil=200)
    hidden = {t["id"] for t in catalog["tracks"][::4]}
    for t in catalog["tracks"]:
        if t["id"] in hidden:
            t["anime"]["themes"][0]["cover"] = None
    schedule = royale(catalog, 5).schedule
    options = {
        o for day in schedule["days"].values() for _t, r in royale_rounds(day) for o in r["options"]
    }
    assert options and not options & hidden


def test_a_franchise_already_in_the_round_is_less_likely():
    old = track(1, "facil", franchise="naruto")
    new = track(2, "facil", franchise="bleach")
    picks = Counter(
        _weighted(seeded(f"teste|{k}"), [old, new], "facil", {"anime:fr:naruto"}, False)["id"]
        for k in range(2000)
    )
    share = picks[new["id"]] / 2000
    assert abs(share - FRANCHISE_NEW / (FRANCHISE_NEW + 1)) < 0.03


def test_two_songs_of_the_same_franchise_can_share_a_round():
    # Poucas franquias, todas grandes: a rodada as repete, mas nunca o mesmo anime (a capa).
    catalog = catalog_of(facil=120, medio=120, dificil=120)
    for t in catalog["tracks"]:
        t["anime"]["franchiseIds"] = [f"anime:fr:g{int(t['id'][-4:]) % 6}"]
    schedule = royale(catalog, 3).schedule
    tracks = {t["id"]: t for t in catalog["tracks"]}
    shared = 0
    for day in schedule["days"].values():
        for _tier, rnd in royale_rounds(day):
            franchises = [tracks[o]["anime"]["franchiseIds"][0] for o in rnd["options"]]
            shared += len(franchises) > len(set(franchises))
            assert len({anime_of(tracks[o]) for o in rnd["options"]}) == OPTIONS
    assert shared


def test_a_short_pool_relaxes_with_a_record_and_keeps_the_fixed_rules():
    small = catalog_of(facil=40, medio=40, dificil=40)
    assert _Index(small).window < WINDOW
    assert "a janela cai para" in royale_short_pools(small)[0]
    result = royale(small, 8)
    assert result.relaxations
    assert royale_rule_problems(result.schedule, small) == ([], [])


def test_the_levels_leave_the_other_dailies_of_the_day_for_last():
    # A janela encolhe primeiro; no acervo curto, a franquia do acertar o anime, depois qualquer
    # faixa e, por último, uma resposta de outro diário do dia (a que a pessoa mais notaria).
    whats = [level.what for level in _levels("facil", 3)]
    assert whats == [
        "",
        "janela de 2 dia(s)",
        "janela de 1 dia(s)",
        "a franquia de uma resposta do acertar o anime",
        "qualquer faixa do titulo",
        "repete uma resposta de outro diário do dia",
    ]
    last = _levels("facil", 3)[-1]
    assert (last.ruler, last.avoid_titles, last.avoid_others) == ("any", False, False)
    # As erradas não tocam: sem janela.
    assert {level.window for level in _levels("medio", 0)} == {0}


def test_the_easy_round_takes_at_most_one_song_that_never_came_out(big):
    # O Anime e as Misturadas já com 10 dias quando o Royale começa: as respostas deles já saíram,
    # e o Fácil leva no máximo 1 que nunca saiu, nem neles nem no Royale, antes do dia.
    start = EPOCH + timedelta(days=10)
    anime, mixed = sides(big, 16)
    result = generate_royale(big, anime, mixed, None, None, start, start, horizon=5)
    tracks = {t["id"]: t for t in big["tracks"]}
    seen: set[str] = set()
    for day_str in sorted(anime["days"]):
        if day_str < start.isoformat():
            seen |= {tracks[a]["songKey"] for _m, _t, _n, a in _rounds(anime["days"][day_str])}
            seen |= {
                tracks[a]["songKey"]
                for _m, _n, found in mixed_rounds(mixed["days"][day_str])
                for a in found
            }
    fresh_days = 0
    for day_str, day in sorted(result.schedule["days"].items()):
        fresh = [p for p in day["facil"]["played"] if tracks[p]["songKey"] not in seen]
        assert len(fresh) <= NEW_PER_ROUND["facil"], day_str
        fresh_days += bool(fresh)
        for source in (
            [p for _t, rnd in royale_rounds(day) for p in rnd["played"]],
            [a for _m, _t, _n, a in _rounds(anime["days"][day_str])],
            [a for _m, _n, found in mixed_rounds(mixed["days"][day_str]) for a in found],
        ):
            seen |= {tracks[a]["songKey"] for a in source}
    assert fresh_days > 0  # o limite tira o excesso, e não as novas


def test_the_validation_catches_counts_and_played_out_of_the_options(big):
    schedule = royale(big, 2).schedule
    broken = copy.deepcopy(schedule)
    rnd = broken["days"]["2026-10-08"]["facil"]
    rnd["options"][rnd["options"].index(rnd["played"][0])] = "x:tr:t9999"
    problems = validate_royale_schedule(broken, big)
    assert any("tocam fora das opções" in p for p in problems)
    assert any("opção inexistente x:tr:t9999" in p for p in problems)
    short = copy.deepcopy(schedule)
    short["days"]["2026-10-08"]["medio"]["played"].pop()
    assert validate_royale_schedule(short, big)[0].startswith("schema:")
    repeated = copy.deepcopy(schedule)
    day = repeated["days"]["2026-10-09"]
    day["dificil"]["options"][0] = day["facil"]["options"][0]
    assert any("faixa repetida no dia" in p for p in validate_royale_schedule(repeated, big))


def test_the_rules_catch_the_same_anime_and_a_missing_cover(big):
    schedule = royale(big, 2).schedule
    catalog = copy.deepcopy(big)
    tracks = {t["id"]: t for t in catalog["tracks"]}
    first, second = schedule["days"]["2026-10-08"]["facil"]["options"][:2]
    tracks[second]["anime"]["themes"][0]["cover"] = tracks[first]["anime"]["themes"][0]["cover"]
    errors, _old = royale_rule_problems(schedule, catalog)
    assert errors == ["2026-10-08 facil: duas opções do mesmo anime"]
    tracks[second]["anime"]["themes"][0]["cover"] = None
    errors, _old = royale_rule_problems(schedule, catalog)
    assert errors == [f"2026-10-08 facil: opção sem capa ({second})"]
    # Num catálogo mais antigo que o do dia, o mesmo problema é só aviso.
    older = {**catalog, "catalogVersion": "2026-10-07.0000abcd"}
    errors, old = royale_rule_problems(
        {
            **schedule,
            "days": {
                k: {**v, "catalogVersion": "2026-10-06.0000abcd"}
                for k, v in schedule["days"].items()
            },
        },
        older,
    )
    assert errors == [] and old


def test_the_schedule_check_regenerates_the_royale_days_with_the_schedules_beside(
    tmp_path, big, capsys
):
    anime, mixed = sides(big, 6)
    full = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=5).schedule
    base = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=2).schedule
    (tmp_path / "catalog.json").write_bytes(dumps(big).encode("utf-8"))
    (tmp_path / "schedule.json").write_bytes(dumps(anime).encode("utf-8"))
    (tmp_path / MIXED_FILE).write_bytes(dumps(mixed).encode("utf-8"))
    (tmp_path / "base.json").write_bytes(dumps(base).encode("utf-8"))
    path = tmp_path / ROYALE_FILE
    args = ["schedule-check", "--path", str(path), "--base", str(tmp_path / "base.json")]
    args += ["--catalog", str(tmp_path / "catalog.json")]
    path.write_bytes(dumps(full).encode("utf-8"))
    assert main(args) == 0
    assert "3 dia(s) da base preservados, 6 no total" in capsys.readouterr().out
    # Um dia novo editado à mão: só o gerador do Royale, com as agendas ao lado, percebe.
    edited = copy.deepcopy(full)
    options = edited["days"]["2026-10-12"]["medio"]["options"]
    options[0], options[1] = options[1], options[0]
    path.write_bytes(dumps(edited).encode("utf-8"))
    assert main(args) == 1
    assert "2026-10-12: dia novo diferente do que o gerador daria" in capsys.readouterr().out
    # Sem a agenda das Misturadas ao lado, não dá para regerar.
    (tmp_path / MIXED_FILE).unlink()
    path.write_bytes(dumps(full).encode("utf-8"))
    assert main(args) == 1
    assert "sem a agenda do Anime ou a das Misturadas ao lado" in capsys.readouterr().out


def test_the_redo_exception_opens_the_royale_days_too(tmp_path, big, capsys):
    """A exceção à regra 4 do quiz vale também para o Royale, que lê as músicas do quiz de cada
    dia (o usuário, 02/11/2026): os dias desde a data saem da base e são regerados."""
    anime, mixed = sides(big, 6)
    full = generate_royale(big, anime, mixed, None, None, EPOCH, EPOCH, horizon=5).schedule
    old = copy.deepcopy(full)  # a base com um dia futuro de outro gerador
    options = old["days"]["2026-10-12"]["medio"]["options"]
    options[0], options[1] = options[1], options[0]
    for name, data in (("catalog.json", big), ("schedule.json", anime), (MIXED_FILE, mixed)):
        (tmp_path / name).write_bytes(dumps(data).encode("utf-8"))
    (tmp_path / "base.json").write_bytes(dumps(old).encode("utf-8"))
    path = tmp_path / ROYALE_FILE
    path.write_bytes(dumps(full).encode("utf-8"))
    args = ["schedule-check", "--path", str(path), "--base", str(tmp_path / "base.json")]
    assert main([*args, "--today", "2026-10-10"]) == 1
    assert "2026-10-12: dia alterado" in capsys.readouterr().out
    redo = [*args, "--quiz-redo-from", "2026-10-11"]
    assert main([*redo, "--today", "2026-10-10"]) == 0
    out = capsys.readouterr().out
    assert "os dias desde 2026-10-11 conferidos como novos" in out
    assert "3 dia(s) da base preservados, 6 no total" in out
    # Na data, a exceção vence, e a conferência é a de sempre.
    assert main([*redo, "--today", "2026-10-11"]) == 1
    out = capsys.readouterr().out
    assert "a exceção do --quiz-redo-from venceu" in out
    assert "2026-10-12: dia alterado" in out


FIXTURE = anime_paths("fixture").public_dir


def _copy_fixture(tmp_path, *names: str) -> None:
    for name in names:
        (tmp_path / name).write_bytes((FIXTURE / name).read_bytes())


def test_the_schedule_royale_command(tmp_path, monkeypatch, capsys):
    paths = replace(anime_paths("fixture"), public_dir=tmp_path)
    monkeypatch.setattr("musicle_pipeline.cli.anime_paths", lambda provider: paths)
    args = ["schedule-royale", "--provider", "fixture", "--today", "2026-10-08"]
    # Sem o catálogo, sem a agenda do Anime e sem a das Misturadas: o comando diz qual rodar.
    assert main(args) == 1
    assert "rode o build-anime" in capsys.readouterr().err
    _copy_fixture(tmp_path, "catalog.json")
    assert main(args) == 1
    assert "rode o schedule-anime" in capsys.readouterr().err
    _copy_fixture(tmp_path, "schedule.json")
    assert main(args) == 1
    assert "rode o schedule-mixed" in capsys.readouterr().err
    # Com as três (sem o quiz, que é opcional), grava a agenda nova, com o aviso.
    _copy_fixture(tmp_path, MIXED_FILE)
    assert main([*args, "--epoch", "2026-10-08", "--days", "2"]) == 0
    out = capsys.readouterr()
    assert "3 dia(s) novo(s) (2026-10-08 a 2026-10-10)" in out.out
    assert "sem a agenda do quiz" in out.err
    written = read_json(tmp_path / ROYALE_FILE)
    catalog = read_json(FIXTURE / "catalog.json")
    anime, mixed = read_json(FIXTURE / "schedule.json"), read_json(FIXTURE / MIXED_FILE)
    expected = generate_royale(catalog, anime, mixed, None, None, EPOCH, EPOCH, horizon=2)
    assert written == expected.schedule
    # De novo, no mesmo dia: nada muda.
    assert main([*args, "--days", "2"]) == 0
    assert "sem mudanças" in capsys.readouterr().out


def test_the_committed_fixture_royale_is_valid():
    catalog = read_json(FIXTURE / "catalog.json")
    schedule = read_json(FIXTURE / ROYALE_FILE)
    assert validate_royale_schedule(schedule, catalog) == []
    assert royale_rule_problems(schedule, catalog)[0] == []
    # Cada dificuldade das fixtures cabe na grade: 9 animes diferentes, todos com capa.
    tracks = {t["id"]: t for t in catalog["tracks"]}
    for day in schedule["days"].values():
        for tier in TIERS:
            assert len({anime_of(tracks[o]) for o in day[tier]["options"]}) == OPTIONS


def test_the_validate_anime_command_checks_the_royale_schedule(tmp_path, capsys):
    _copy_fixture(tmp_path, "catalog.json", ROYALE_FILE)
    args = ["validate-anime", "--provider", "fixture", "--path", str(tmp_path / "catalog.json")]
    # O Royale sem a agenda do Anime, e depois sem a das Misturadas, ao lado.
    assert main(args) == 1
    assert "sem a agenda do Anime ao lado" in capsys.readouterr().err
    _copy_fixture(tmp_path, "schedule.json")
    assert main(args) == 1
    assert "sem a agenda das Misturadas ao lado" in capsys.readouterr().err
    _copy_fixture(tmp_path, MIXED_FILE)
    assert main(args) == 0
    royale_schedule = read_json(FIXTURE / ROYALE_FILE)
    (tmp_path / ROYALE_FILE).write_text(
        dumps(royale_schedule).replace("\n", "\r\n"), encoding="utf-8"
    )
    assert main(args) == 1
    assert "forma canônica" in capsys.readouterr().err
