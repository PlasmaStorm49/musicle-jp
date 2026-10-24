"""A agenda das Misturadas (M17): as 4 rodadas de 2, 2, 2 e 3 músicas, a régua, as regras que
nunca afrouxam, a P332 (nenhuma resposta do Anime do dia), o limite de novas por rodada, o
afrouxamento do acervo curto e o schedule-check do tipo novo."""

from __future__ import annotations

import copy
from dataclasses import replace
from datetime import date, timedelta

import pytest

from musicle_pipeline.anime import MODES
from musicle_pipeline.anime_mixed import (
    KIND,
    NEW_PER_ROUND,
    ROUNDS,
    WINDOW,
    _Index,
    _levels,
    generate_mixed,
    mixed_rounds,
    mixed_rule_problems,
    mixed_short_pools,
    validate_mixed_schedule,
)
from musicle_pipeline.anime_schedule import _rounds, generate_anime
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import MIXED_FILE, anime_paths
from musicle_pipeline.schedule import ScheduleError

EPOCH = date(2026, 10, 8)
VERSION = "2026-10-08.0000abcd"


def track(n: int, tier: str, *, franchise: str | None = None) -> JSON:
    """Uma faixa sintética, só com o que as agendas leem; a mesma faixa nos dois modos."""
    return {
        "id": f"x:tr:t{n:04d}",
        "songKey": f"song {n}|x:ar:a{n:04d}",
        "eligible": {"daily": True, "reason": None},
        "anime": {
            "franchiseIds": [f"anime:fr:{franchise or f'f{n:04d}'}"],
            "themes": [{"anime": f"Anime {n}", "type": "OP", "sequence": 1}],
            "tiers": {"musica": tier, "titulo": tier},
        },
    }


def catalog_of(facil: int, medio: int, dificil: int) -> JSON:
    tracks: list[JSON] = []
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
    return catalog_of(facil=300, medio=200, dificil=200)


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
                    if ruler == "facil":
                        assert t["anime"]["tiers"][mode] == "facil", (day_str, mode, n)
                    else:
                        assert t["anime"]["tiers"][mode] in ("medio", "dificil")
                round_franchises = [f for t in picked for f in t["anime"]["franchiseIds"]]
                assert len(round_franchises) == len(set(round_franchises))
                diary_franchises += round_franchises
                day_songs += [t["songKey"] for t in picked]
            if mode == "titulo":
                assert len(diary_franchises) == len(set(diary_franchises))
        assert len(day_songs) == len(set(day_songs)) == 18, day_str
        assert not set(day_songs) & anime_songs, day_str  # P332
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
    assert sorted(mixed["days"]) == sorted(anime["days"])  # cada dia lê o do Anime (P332)
    later = generate_anime(big, None, EPOCH + timedelta(days=5), EPOCH, horizon=0).schedule
    with pytest.raises(ScheduleError, match="não tem o dia"):
        generate_mixed(big, later, None, EPOCH, EPOCH, horizon=0)
    # A agenda do Anime quebrada (o schedule-check a lê do disco): erro de agenda, e não um
    # KeyError no meio da geração.
    with pytest.raises(ScheduleError, match="agenda do Anime ao lado inválida"):
        generate_mixed(big, {"days": {}}, None, EPOCH, EPOCH, horizon=0)


def test_the_levels_relax_the_ruler_before_the_anime_of_the_day():
    # A ordem dos afrouxamentos: a janela encolhe antes das três do acervo curto, e a P332 é a
    # última de todas, depois de a régua da P325 cair.
    assert [level.what for level in _levels("facil", 3)] == [
        "",
        "a franquia repete no dia",
        "janela de 2 dia(s)",
        "janela de 1 dia(s)",
        "a franquia repete no diário",
        "qualquer faixa do modo",
        "repete uma resposta do Anime do dia (P332)",
    ]
    assert [level.ruler for level in _levels("hard", 2)] == [
        "hard",
        "hard",
        "hard",
        "hard",
        "any",
        "any",
    ]


def test_the_window_is_the_smallest_of_each_mode_and_of_the_union():
    # 30 do Fácil nos dois modos: a união dá 30 // 14 = 2 dias. Só no musica: 30 // 7 = 4 no
    # musica, e 0 no titulo, que fica com a janela mínima.
    assert _Index(catalog_of(facil=30, medio=40, dificil=40)).window == 2
    only = catalog_of(facil=30, medio=40, dificil=40)
    for t in only["tracks"]:
        if t["anime"]["tiers"]["titulo"] == "facil":
            t["anime"]["tiers"]["titulo"] = "medio"
    assert _Index(only).window == 1
    assert mixed_short_pools(only) == [
        "Misturadas: o Fácil (musica 30, titulo 0) não dá 14 dias (7 por modo e 14 por dia); a"
        " janela cai para 1 dia(s)"
    ]
    assert mixed_short_pools(catalog_of(facil=14 * WINDOW, medio=10, dificil=10)) == []


def test_a_short_pool_shrinks_the_window_over_the_days():
    # 30 do Fácil (a janela de 2 dias) e o Anime do dia tirando as Fácil dele (P332): do 2º dia em
    # diante, a janela encolhe, com registro, e as regras fixas continuam.
    small = catalog_of(facil=30, medio=40, dificil=40)
    anime, _ = both(small, 4)
    result = generate_mixed(small, anime, None, EPOCH, EPOCH, horizon=3)
    assert len(result.schedule["days"]) == 4
    assert any("janela de 1 dia(s)" in r for r in result.relaxations)
    assert not any("P332" in r for r in result.relaxations)


def test_a_short_pool_relaxes_with_a_record_and_keeps_the_fixed_rules():
    small = catalog_of(facil=18, medio=12, dificil=12)
    anime, _ = both(small, 3)
    result = generate_mixed(small, anime, None, EPOCH, EPOCH, horizon=2)
    assert len(result.schedule["days"]) == 3
    assert result.relaxations
    tracks = {t["id"]: t for t in small["tracks"]}
    for day in result.schedule["days"].values():
        songs = [tracks[a]["songKey"] for _m, _n, answers in mixed_rounds(day) for a in answers]
        assert len(songs) == len(set(songs))  # nunca afrouxa: a música do dia
        for _m, _n, answers in mixed_rounds(day):
            franchises = [f for a in answers for f in tracks[a]["anime"]["franchiseIds"]]
            assert len(franchises) == len(set(franchises))  # nem a franquia da rodada


def test_each_round_takes_at_most_one_song_that_never_came_out(big):
    # O Anime já com 10 dias quando as Misturadas começam: as 180 respostas dele já saíram, e cada
    # rodada leva no máximo 1 música que nunca saiu, nem no Anime nem nas Misturadas, antes do dia.
    start = EPOCH + timedelta(days=10)
    anime = generate_anime(big, None, EPOCH, EPOCH, horizon=15).schedule
    result = generate_mixed(big, anime, None, start, start, horizon=5)
    assert result.relaxations == []
    tracks = {t["id"]: t for t in big["tracks"]}
    seen: set[str] = set()
    for day_str, day in sorted(anime["days"].items()):
        if day_str < start.isoformat():
            seen |= {tracks[a]["songKey"] for _m, _t, _n, a in _rounds(day)}
    fresh_rounds = 0
    for day_str, day in sorted(result.schedule["days"].items()):
        for mode, n, answers in mixed_rounds(day):
            fresh = [a for a in answers if tracks[a]["songKey"] not in seen]
            assert len(fresh) <= NEW_PER_ROUND, (day_str, mode, n)
            fresh_rounds += bool(fresh)
        # O dia seguinte já conta o de hoje das Misturadas e o do Anime como saídos.
        seen |= {tracks[a]["songKey"] for _m, _n, answers in mixed_rounds(day) for a in answers}
        seen |= {tracks[a]["songKey"] for _m, _t, _n, a in _rounds(anime["days"][day_str])}
    # As novas continuam entrando: o limite tira o excesso, e não as novas.
    assert fresh_rounds > 0


def test_without_any_song_that_came_out_the_round_takes_new_ones(big):
    # O 1º dia das duas agendas: nada saiu ainda, e o limite (uma preferência) não trava a rodada.
    _, mixed = both(big, 1)
    rounds = list(mixed_rounds(mixed["days"]["2026-10-08"]))
    assert [len(answers) for _m, _n, answers in rounds] == [count for _r, count in ROUNDS] * 2


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
    # Um dia gerado com um catálogo mais novo que este: o catálogo ficou para trás.
    big2["catalogVersion"] = "2026-10-07.2222abcd"
    errors, _ = mixed_rule_problems(same, big2)
    assert any("gerado com um catálogo mais novo" in e for e in errors)


def test_a_track_out_of_the_mode_is_an_error(big):
    _, mixed = both(big, 1)
    out = copy.deepcopy(big)
    answer = mixed["days"]["2026-10-08"]["titulo"][2]["answers"][0]
    for t in out["tracks"]:
        if t["id"] == answer:
            t["anime"]["tiers"]["titulo"] = None
    errors, _ = mixed_rule_problems(mixed, out)
    assert errors == ["2026-10-08 titulo rodada 3: faixa fora do modo"]


def test_a_future_day_that_aged_badly_warns_and_stays(big):
    anime, _ = both(big, 4)
    base = generate_mixed(big, anime, None, EPOCH, EPOCH, horizon=1).schedule
    gone = copy.deepcopy(big)
    answer = base["days"]["2026-10-09"]["musica"][0]["answers"][0]
    for t in gone["tracks"]:
        if t["id"] == answer:
            t["eligible"] = {"daily": False, "reason": "sem prévia"}
    result = generate_mixed(gone, anime, base, EPOCH + timedelta(days=1), horizon=1)
    assert result.warnings == ["2026-10-09 musica rodada 1: resposta não é mais elegível"]
    assert result.schedule["days"]["2026-10-09"] == base["days"]["2026-10-09"]


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
    # Sem a agenda do Anime ao lado, não dá para regerar (P332).
    (tmp_path / "schedule.json").unlink()
    path.write_bytes(dumps(mixed).encode("utf-8"))
    assert main(args) == 1
    assert "sem a agenda do Anime ao lado" in capsys.readouterr().out


FIXTURE = anime_paths("fixture").public_dir


def _copy_fixture(tmp_path, *names: str) -> None:
    for name in names:
        (tmp_path / name).write_bytes((FIXTURE / name).read_bytes())


def test_the_schedule_mixed_command(tmp_path, monkeypatch, capsys):
    paths = replace(anime_paths("fixture"), public_dir=tmp_path)
    monkeypatch.setattr("musicle_pipeline.cli.anime_paths", lambda provider: paths)
    args = ["schedule-mixed", "--provider", "fixture", "--today", "2026-10-08"]
    # Sem o catálogo, e depois sem a agenda do Anime: o comando diz qual rodar.
    assert main(args) == 1
    assert "rode o build-anime" in capsys.readouterr().err
    _copy_fixture(tmp_path, "catalog.json")
    assert main(args) == 1
    assert "rode o schedule-anime" in capsys.readouterr().err
    # A agenda do Anime inválida é recusada antes de gerar.
    anime = read_json(FIXTURE / "schedule.json")
    (tmp_path / "schedule.json").write_bytes(dumps({**anime, "kind": "hits"}).encode("utf-8"))
    assert main(args) == 1
    assert not (tmp_path / MIXED_FILE).exists()
    # Com as duas, grava a agenda nova: a mesma das fixtures, nos dias que o horizonte dá.
    _copy_fixture(tmp_path, "schedule.json")
    assert main([*args, "--epoch", "2026-10-08", "--days", "2"]) == 0
    out = capsys.readouterr()
    assert "3 dia(s) novo(s) (2026-10-08 a 2026-10-10)" in out.out
    assert "a janela cai para 1 dia(s)" in out.err
    # O que o gerador dá. Não a agenda das fixtures: ela saiu de uma régua anterior, e uma regra
    # nova muda só os dias novos (nenhum teste a regera inteira, ME51).
    written = read_json(tmp_path / MIXED_FILE)
    catalog = read_json(FIXTURE / "catalog.json")
    assert written == generate_mixed(catalog, anime, None, EPOCH, EPOCH, horizon=2).schedule
    # De novo, no mesmo dia: nada muda.
    assert main([*args, "--days", "2"]) == 0
    assert "sem mudanças" in capsys.readouterr().out


def test_the_validate_anime_command_checks_the_mixed_schedule(tmp_path, capsys):
    _copy_fixture(tmp_path, "catalog.json", MIXED_FILE)
    args = ["validate-anime", "--provider", "fixture", "--path", str(tmp_path / "catalog.json")]
    # As Misturadas sem a agenda do Anime ao lado: não há como conferi-las (P332).
    assert main(args) == 1
    assert "sem a agenda do Anime ao lado" in capsys.readouterr().err
    _copy_fixture(tmp_path, "schedule.json")
    assert main(args) == 0
    mixed = read_json(FIXTURE / MIXED_FILE)
    # Fora da forma canônica.
    (tmp_path / MIXED_FILE).write_text(dumps(mixed).replace("\n", "\r\n"), encoding="utf-8")
    assert main(args) == 1
    assert "forma canônica" in capsys.readouterr().err
    # Uma rodada com uma música a menos.
    broken = copy.deepcopy(mixed)
    broken["days"]["2026-10-08"]["musica"][3]["answers"].pop()
    (tmp_path / MIXED_FILE).write_bytes(dumps(broken).encode("utf-8"))
    assert main(args) == 1
    assert "rodada 4: 3 músicas, e não 2" in capsys.readouterr().err


def test_the_schedule_check_refuses_an_unknown_kind(tmp_path, capsys):
    anime = read_json(FIXTURE / "schedule.json")
    path = tmp_path / "other.json"
    path.write_bytes(dumps({**anime, "kind": "outra"}).encode("utf-8"))
    assert main(["schedule-check", "--path", str(path), "--base", str(tmp_path / "none.json")]) == 1
    assert "tipo desconhecido ('outra')" in capsys.readouterr().out
