from __future__ import annotations

import copy
import os
import shutil
import subprocess
import sys
from datetime import date, timedelta

import pytest

from musicle_pipeline.aliases import parse_aliases
from musicle_pipeline.catalog import Curation, build_catalog
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps
from musicle_pipeline.schedule import (
    ScheduleError,
    compare,
    generate,
    read_base_ref,
    validate_schedule,
    window_size,
)

EPOCH = date(2026, 10, 8)


@pytest.fixture(scope="module")
def sixty_one_days(fixture_catalog):
    return generate(fixture_catalog, None, EPOCH + timedelta(days=39), EPOCH)


def _answers(day):
    return [r["answer"] for target in ("song", "album") for r in day[target]]


def test_window_for_the_fixture(fixture_catalog):
    assert window_size(fixture_catalog) == 3  # 37 músicas elegíveis distintas // 12


def test_generates_61_days_without_relaxing_any_rule(sixty_one_days):
    days = sixty_one_days.schedule["days"]
    assert len(days) == 61
    assert min(days) == "2026-10-08" and max(days) == "2026-12-07"
    assert sixty_one_days.relaxations == []
    assert days["2026-10-08"]["number"] == 1


def test_structure_is_valid(sixty_one_days, fixture_catalog):
    assert validate_schedule(sixty_one_days.schedule, fixture_catalog) == []


def test_generation_rules_hold_every_day(sixty_one_days, fixture_catalog):
    tracks = {t["id"]: t for t in fixture_catalog["tracks"]}
    albums = {a["id"]: a for a in fixture_catalog["albums"]}
    for day_str, day in sixty_one_days.schedule["days"].items():
        answers = [tracks[a] for a in _answers(day)]
        assert all(t["eligible"]["daily"] for t in answers), day_str
        assert len({t["id"] for t in answers}) == 6
        assert len({t["songKey"] for t in answers}) == 6
        assert len({t["albumId"] for t in answers}) == 6
        artists = [a for t in answers for a in t["artistIds"]]
        assert len(artists) == len(set(artists)), f"{day_str}: artista repetido no dia"
        for rnd in day["song"]:
            allowed = {rnd["answer"], *tracks[rnd["answer"]]["similar"]}
            assert set(rnd["options"]) <= allowed
        for rnd in day["album"]:
            album_id = tracks[rnd["answer"]]["albumId"]
            assert set(rnd["options"]) <= {album_id, *albums[album_id]["similar"]}


def test_no_repeat_inside_the_window(sixty_one_days, fixture_catalog):
    tracks = {t["id"]: t for t in fixture_catalog["tracks"]}
    days = sixty_one_days.schedule["days"]
    k = window_size(fixture_catalog)
    for day_str, day in days.items():
        d = date.fromisoformat(day_str)
        today = {tracks[a]["songKey"] for a in _answers(day)}
        for back in range(1, k + 1):
            previous = days.get((d - timedelta(days=back)).isoformat())
            if previous:
                earlier = {tracks[a]["songKey"] for a in _answers(previous)}
                assert not today & earlier, f"{day_str} repete música de {back} dia(s) antes"


def test_first_round_leans_popular(sixty_one_days, fixture_catalog):
    pop = {t["id"]: t["popularity"] for t in fixture_catalog["tracks"]}
    days = sixty_one_days.schedule["days"].values()
    first = [pop[d["song"][0]["answer"]] for d in days]
    last = [pop[d["song"][2]["answer"]] for d in days]
    assert sum(first) / len(first) > sum(last) / len(last)


def test_same_input_same_schedule(fixture_catalog, sixty_one_days):
    again = generate(fixture_catalog, None, EPOCH + timedelta(days=39), EPOCH)
    assert dumps(again.schedule) == dumps(sixty_one_days.schedule)


@pytest.mark.parametrize("seed", ["1", "2"])
def test_bytes_do_not_depend_on_hash_seed(tmp_path, seed):
    out = tmp_path / "schedule.json"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", "schedule"]
    cmd += ["--catalog", "web/public/fixtures/catalog.json", "--out", str(out)]
    cmd += ["--today", "2026-10-08", "--epoch", "2026-10-08"]
    subprocess.run(cmd, check=True, env=env, capture_output=True)
    reference = tmp_path / "reference.json"
    args = ["schedule", "--catalog", "web/public/fixtures/catalog.json", "--out", str(reference)]
    assert main([*args, "--today", "2026-10-08", "--epoch", "2026-10-08"]) == 0
    assert out.read_bytes() == reference.read_bytes()


def _blocked_catalog(fixture_snapshots, track_id: str):
    toml = f'[tracks."{track_id}"]\nblock = true\n'
    return build_catalog(fixture_snapshots, "fixture", "jp", Curation(aliases=parse_aliases(toml)))


def test_new_catalog_only_appends_days(fixture_catalog, fixture_snapshots):
    first = generate(fixture_catalog, None, EPOCH, EPOCH).schedule
    assert len(first["days"]) == 22  # hoje + 21
    victim = first["days"]["2026-10-20"]["song"][0]["answer"]
    changed_catalog = _blocked_catalog(fixture_snapshots, victim)
    second = generate(changed_catalog, first, EPOCH + timedelta(days=7))
    assert len(second.schedule["days"]) == 29
    assert compare(first, second.schedule) == []
    for day_str, day in first["days"].items():
        assert second.schedule["days"][day_str] == day
    # O dia futuro que usa a faixa bloqueada fica igual, mas gera aviso.
    assert any(w.startswith("2026-10-20 song rodada 1") for w in second.warnings)


def test_old_day_with_ineligible_answer_is_still_structurally_valid(
    fixture_catalog, fixture_snapshots
):
    first = generate(fixture_catalog, None, EPOCH, EPOCH).schedule
    victim = first["days"]["2026-10-08"]["song"][0]["answer"]
    assert validate_schedule(first, _blocked_catalog(fixture_snapshots, victim)) == []


def test_compare_catches_changed_and_removed_days(sixty_one_days):
    base = sixty_one_days.schedule
    edited = copy.deepcopy(base)
    edited["days"]["2026-10-09"]["song"][0]["options"].reverse()
    del edited["days"]["2026-10-10"]
    edited["epoch"] = "2026-10-01"
    problems = compare(base, edited)
    assert "2026-10-09: dia alterado" in problems
    assert "2026-10-10: dia removido" in problems
    assert any(p.startswith("epoch mudou") for p in problems)
    assert compare(None, base) == []


def test_epoch_is_required_for_a_new_schedule_and_cannot_change(fixture_catalog):
    with pytest.raises(ScheduleError, match="--epoch"):
        generate(fixture_catalog, None, EPOCH)
    first = generate(fixture_catalog, None, EPOCH, EPOCH).schedule
    with pytest.raises(ScheduleError, match="diverge"):
        generate(fixture_catalog, first, EPOCH, date(2026, 10, 1))


def test_structural_validation_catches_broken_files(sixty_one_days, fixture_catalog):
    broken = copy.deepcopy(sixty_one_days.schedule)
    broken["days"]["2026-10-09"]["number"] = 7
    rnd = broken["days"]["2026-10-11"]["song"][0]
    rnd["options"] = [o for o in rnd["options"] if o != rnd["answer"]] + ["fixture:tr:tr06"]
    del broken["days"]["2026-10-15"]
    problems = validate_schedule(broken, fixture_catalog)
    assert "os dias precisam ser contíguos a partir do epoch" in problems
    assert "2026-10-09: number deveria ser 2" in problems
    assert "2026-10-11 song rodada 1: a resposta não está nas opções" in problems


def test_existing_invalid_schedule_is_refused(sixty_one_days, fixture_catalog):
    broken = copy.deepcopy(sixty_one_days.schedule)
    broken["days"]["2026-10-09"]["number"] = 7
    with pytest.raises(ScheduleError, match="inválida"):
        generate(fixture_catalog, broken, EPOCH + timedelta(days=40))


def test_cli_schedule_check_with_files(tmp_path, sixty_one_days, capsys):
    current = tmp_path / "schedule.json"
    current.write_bytes(dumps(sixty_one_days.schedule).encode("utf-8"))
    missing = tmp_path / "nao-existe.json"
    assert main(["schedule-check", "--path", str(current), "--base", str(missing)]) == 0
    edited = copy.deepcopy(sixty_one_days.schedule)
    del edited["days"]["2026-12-07"]
    base = tmp_path / "base.json"
    base.write_bytes(dumps(sixty_one_days.schedule).encode("utf-8"))
    current.write_bytes(dumps(edited).encode("utf-8"))
    assert main(["schedule-check", "--path", str(current), "--base", str(base)]) == 1
    assert "2026-12-07: dia removido" in capsys.readouterr().out


@pytest.mark.skipif(shutil.which("git") is None, reason="git não está no PATH")
def test_read_base_ref_handles_missing_ref_and_missing_file():
    with pytest.raises(ScheduleError, match="inexistente"):
        read_base_ref("revisao-que-nao-existe", "web/public/fixtures/schedule.json")
    # Arquivo que não existe na revisão (como a agenda antes do M3): base vazia. Não cita um
    # commit pelo hash: o histórico pode ser reescrito e a CI pode clonar sem ele.
    assert read_base_ref("HEAD", "web/public/fixtures/nao-existe.json") is None
