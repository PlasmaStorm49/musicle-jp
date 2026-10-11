"""Testes do script da tarefa catalog-pr (`.github/scripts/check-catalog-pr.sh`).

O script roda com o token de escrita por perto e só usa jq e coreutils: é ele que confere, de
forma independente do Python, cada arquivo que o robô quer pôr na main. Sem jq (o Windows de
desenvolvimento), os testes pulam; a CI (Ubuntu) tem jq e roda todos.
"""

from __future__ import annotations

import copy
import os
import shutil
import subprocess
from datetime import date, timedelta
from pathlib import Path

import pytest

from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import repo_root

SCRIPT = repo_root() / ".github" / "scripts" / "check-catalog-pr.sh"
BASH = shutil.which("bash")
JQ = shutil.which("jq")
pytestmark = pytest.mark.skipif(not (BASH and JQ), reason="precisa de bash e jq (a CI tem)")

TODAY = "2026-10-19"
PATHS = {
    "SNAPSHOTS": "pipeline/data/apple/snapshots",
    "ROMAJI": "pipeline/data/apple/romaji.json",
    "CATALOG": "web/public/data/catalog.json",
    "SCHEDULE": "web/public/data/schedule.json",
    "FIXTURE_SCHEDULE": "web/public/fixtures/schedule.json",
}
SNAPSHOT = f"{PATHS['SNAPSHOTS']}/{TODAY}.json"
FIRST_SNAPSHOT = repo_root() / PATHS["SNAPSHOTS"] / "2026-10-10.json"


def _base(key: str) -> JSON:
    return read_json(repo_root() / PATHS[key])


def _new_days(schedule: JSON, count: int) -> list[str]:
    """Os dias que a geração acrescentaria: do dia seguinte ao fim, ou de hoje (P44)."""
    after_last = date.fromisoformat(max(schedule["days"])) + timedelta(days=1)
    start = max(after_last, date.fromisoformat(TODAY))
    return [(start + timedelta(days=i)).isoformat() for i in range(count)]


def grown(schedule: JSON, days: list[str]) -> JSON:
    new = copy.deepcopy(schedule)
    template = new["days"][max(new["days"])]
    for d in days:
        new["days"][d] = copy.deepcopy(template)
    return new


def new_snapshot() -> JSON:
    snap = copy.deepcopy(read_json(FIRST_SNAPSHOT))
    snap["date"] = TODAY
    return snap


def new_catalog() -> JSON:
    """O catálogo da main com o snapshot de hoje no fim e uma faixa nova."""
    cat = copy.deepcopy(_base("CATALOG"))
    # A entrada do catálogo espelha o arquivo do dia (id, data, chart, fetchedAt, size).
    snap = new_snapshot()
    cat["snapshots"].append(
        {
            "id": TODAY,
            "date": TODAY,
            "chart": snap["chart"],
            "fetchedAt": snap["fetchedAt"],
            "size": len(snap["rss"]),
        }
    )
    cat["tracks"].append({**cat["tracks"][0], "id": "apple:tr:999999999"})
    return cat


def new_romaji(extra: dict[str, list[str]] | None = None) -> JSON:
    rom = copy.deepcopy(_base("ROMAJI"))
    rom["entries"].update(extra or {"テスト曲": ["tesuto kyoku"]})
    return rom


def full_change() -> dict[str, JSON]:
    return {
        SNAPSHOT: new_snapshot(),
        PATHS["ROMAJI"]: new_romaji(),
        PATHS["CATALOG"]: new_catalog(),
        PATHS["SCHEDULE"]: grown(_base("SCHEDULE"), _new_days(_base("SCHEDULE"), 8)),
        PATHS["FIXTURE_SCHEDULE"]: grown(
            _base("FIXTURE_SCHEDULE"), _new_days(_base("FIXTURE_SCHEDULE"), 8)
        ),
    }


def run(
    tmp_path: Path,
    changes: dict[str, JSON],
    *,
    declared: list[str] | None = None,
    extra_files: dict[str, str] | None = None,
    fetch: str = "success",
    today: str = TODAY,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    """Monta a main (cópias dos arquivos de verdade) e o artefato, e roda o script."""
    repo = tmp_path / "repo"
    for key in ("ROMAJI", "CATALOG", "SCHEDULE", "FIXTURE_SCHEDULE"):
        dest = repo / PATHS[key]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((repo_root() / PATHS[key]).read_bytes())
    (repo / PATHS["SNAPSHOTS"]).mkdir(parents=True, exist_ok=True)

    temp = tmp_path / "runner"
    files = temp / "artifact" / "files"
    for path, data in changes.items():
        (files / path).parent.mkdir(parents=True, exist_ok=True)
        (files / path).write_bytes(dumps(data).encode("utf-8"))
    for path, text in (extra_files or {}).items():
        (files / path).parent.mkdir(parents=True, exist_ok=True)
        (files / path).write_bytes(text.encode("utf-8"))
    listed = declared if declared is not None else list(changes)
    (temp / "artifact" / "changed.txt").write_bytes("".join(f"{p}\n" for p in listed).encode())

    output = temp / "github-output"
    output.write_bytes(b"")
    env = {
        **os.environ,
        **PATHS,
        "TODAY": today,
        "FETCH": fetch,
        "RUN_URL": "https://github.com/x/y/actions/runs/1",
        "RUNNER_TEMP": str(temp),
        "GITHUB_OUTPUT": str(output),
    }
    done = subprocess.run(
        [BASH or "bash", str(SCRIPT)], cwd=repo, env=env, capture_output=True, text=True
    )
    return done, repo, temp


def outputs(temp: Path) -> str:
    return (temp / "github-output").read_text(encoding="utf-8")


def body(temp: Path) -> str:
    return (temp / "pr-body.md").read_text(encoding="utf-8")


def test_full_week_passes_and_lands_in_the_tree(tmp_path):
    changes = full_change()
    done, repo, temp = run(tmp_path, changes)
    assert done.returncode == 0, done.stdout + done.stderr
    real_last = _new_days(_base("SCHEDULE"), 8)[-1]
    assert f"branch=catalogo/{TODAY}" in outputs(temp)
    assert f"title=chore: parada de {TODAY} (agenda até {real_last})" in outputs(temp)
    text = body(temp)
    assert "100 faixas; **1 nova(s)**" in text
    assert "テスト曲 → tesuto kyoku" in text
    assert "Agenda das fixtures" in text
    for path, data in changes.items():
        assert read_json(repo / path) == data


def test_only_schedules_when_the_fetch_failed(tmp_path):
    changes = full_change()
    keep = {k: changes[k] for k in (PATHS["SCHEDULE"], PATHS["FIXTURE_SCHEDULE"])}
    done, _, temp = run(tmp_path, keep, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "não veio hoje" in body(temp)
    assert f"title=chore: agenda de {TODAY}" in outputs(temp)


def test_romaji_list_cannot_mention_or_close_the_block(tmp_path):
    changes = full_change()
    changes[PATHS["ROMAJI"]] = new_romaji({"@everyone ~~~": ["x"]})
    done, _, temp = run(tmp_path, changes)
    assert done.returncode == 0, done.stdout + done.stderr
    text = body(temp)
    assert "@everyone --- → x" in text  # dentro do bloco ~~~text, sem fechar o bloco
    assert text.count("~~~") == 2


def _rejects(tmp_path, changes, message, **kwargs):
    done, repo, _ = run(tmp_path, changes, **kwargs)
    assert done.returncode == 1, done.stdout + done.stderr
    assert message in done.stdout
    # Nada entrou na árvore: os arquivos só são copiados depois de todas as conferências.
    assert (repo / PATHS["CATALOG"]).read_bytes() == (repo_root() / PATHS["CATALOG"]).read_bytes()


def test_rejects_a_path_outside_the_closed_list(tmp_path):
    changes = full_change()
    changes["web/src/main.json"] = {"x": 1}
    _rejects(tmp_path, changes, "fora da lista fechada")


def test_rejects_a_file_that_was_not_declared(tmp_path):
    changes = full_change()
    declared = [p for p in changes if p != PATHS["ROMAJI"]]
    _rejects(tmp_path, changes, "não batem com a lista declarada", declared=declared)


def test_rejects_a_symlink_or_odd_file(tmp_path):
    if os.name == "nt":
        pytest.skip("link simbólico no Windows pede permissão")
    changes = full_change()
    _, _, temp = run(tmp_path, changes)  # monta tudo uma vez
    link = temp / "artifact" / "files" / "web" / "link"
    link.symlink_to("/etc/passwd")
    env = {
        **os.environ,
        **PATHS,
        "TODAY": TODAY,
        "FETCH": "success",
        "RUN_URL": "x",
        "RUNNER_TEMP": str(temp),
        "GITHUB_OUTPUT": str(temp / "github-output"),
    }
    again = subprocess.run(
        [BASH or "bash", str(SCRIPT)],
        cwd=tmp_path / "repo",
        env=env,
        capture_output=True,
        text=True,
    )
    assert again.returncode == 1
    assert "não é arquivo comum" in again.stdout


def test_rejects_a_catalog_that_loses_a_track(tmp_path):
    changes = full_change()
    changes[PATHS["CATALOG"]]["tracks"] = changes[PATHS["CATALOG"]]["tracks"][1:]
    _rejects(tmp_path, changes, "perde ids")


@pytest.mark.parametrize(
    ("where", "url"),
    [
        ("preview", "https://evil.test/a.m4a"),
        ("preview", "javascript:alert(1)"),
        ("store", "https://music.apple.com.evil.test/x"),
        ("store", "https://music.apple.com/x y"),
        ("artwork", "http://is1-ssl.mzstatic.com/a.jpg"),
    ],
)
def test_rejects_urls_outside_the_apple_hosts(tmp_path, where, url):
    changes = full_change()
    catalog = changes[PATHS["CATALOG"]]
    if where == "preview":
        catalog["tracks"][0]["preview"]["url"] = url
    elif where == "store":
        catalog["tracks"][0]["storeUrl"] = url
    else:
        catalog["albums"][0]["artworkUrl"] = url
    _rejects(tmp_path, changes, "hosts da Apple")


def test_rejects_a_catalog_that_rewrites_old_snapshots(tmp_path):
    changes = full_change()
    changes[PATHS["CATALOG"]]["snapshots"][0]["size"] = 1
    _rejects(tmp_path, changes, "não bate com os snapshots")


def test_rejects_a_catalog_change_without_a_new_chart(tmp_path):
    changes = full_change()
    del changes[SNAPSHOT]
    _rejects(tmp_path, changes, "catálogo mudou sem parada nova")


def test_rejects_a_snapshot_for_another_day(tmp_path):
    changes = full_change()
    changes[SNAPSHOT]["date"] = "2026-10-18"
    _rejects(tmp_path, changes, "forma esperada")


def test_rejects_romaji_that_rewrites_a_reviewed_entry(tmp_path):
    changes = full_change()
    text = next(iter(changes[PATHS["ROMAJI"]]["entries"]))
    changes[PATHS["ROMAJI"]]["entries"][text] = ["outra coisa"]
    _rejects(tmp_path, changes, "romaji novo altera")


def test_rejects_a_schedule_that_changes_a_past_day(tmp_path):
    changes = full_change()
    schedule = changes[PATHS["SCHEDULE"]]
    first = min(schedule["days"])
    schedule["days"][first]["number"] = 999
    _rejects(tmp_path, changes, "altera o que já existe")


def test_rejects_a_gap_between_new_days(tmp_path):
    changes = full_change()
    days = _new_days(_base("SCHEDULE"), 8)
    changes[PATHS["SCHEDULE"]] = grown(_base("SCHEDULE"), days[:3] + days[4:])
    _rejects(tmp_path, changes, "buraco entre os dias novos")


def test_rejects_a_backfill_before_the_end(tmp_path):
    # P44: o 1º dia novo é o seguinte ao fim (ou hoje); começar depois disso deixaria buraco.
    changes = full_change()
    days = _new_days(_base("SCHEDULE"), 9)[1:]
    changes[PATHS["SCHEDULE"]] = grown(_base("SCHEDULE"), days)
    _rejects(tmp_path, changes, "o 1º dia novo deveria ser")


def test_same_chart_brings_only_the_schedules(tmp_path):
    changes = full_change()
    keep = {k: changes[k] for k in (PATHS["SCHEDULE"], PATHS["FIXTURE_SCHEDULE"])}
    done, _, temp = run(tmp_path, keep)  # a busca deu certo, mas a parada é a mesma
    assert done.returncode == 0, done.stdout + done.stderr
    assert "igual à da última busca" in body(temp)
    assert "Atenção" not in body(temp)


def test_warns_when_the_chart_is_weeks_old(tmp_path):
    changes = full_change()
    keep = {k: changes[k] for k in (PATHS["SCHEDULE"], PATHS["FIXTURE_SCHEDULE"])}
    old = tmp_path / "repo" / PATHS["SNAPSHOTS"] / "2026-10-01.json"
    old.parent.mkdir(parents=True, exist_ok=True)
    old.write_bytes(b"{}")
    done, _, temp = run(tmp_path, keep, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "a última parada guardada é de 2026-10-01 (18 dias)" in body(temp)


def test_rejects_a_snapshot_that_already_exists_in_main(tmp_path):
    existing = tmp_path / "repo" / SNAPSHOT
    existing.parent.mkdir(parents=True, exist_ok=True)
    existing.write_bytes(b"{}")
    _rejects(tmp_path, full_change(), "já existe na main")


def test_rejects_a_catalog_snapshot_entry_that_does_not_match_the_file(tmp_path):
    changes = full_change()
    changes[PATHS["CATALOG"]]["snapshots"][-1]["size"] = 101  # a parada tem 100 itens
    _rejects(tmp_path, changes, "não bate com os snapshots")


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)\nhttps://music.apple.com/jp/song/1",
        "https://music.apple.com/jp/song/1\njavascript:alert(1)",
    ],
)
def test_rejects_a_url_with_a_line_break(tmp_path, url):
    # As âncoras \A e \z: com ^ e $ o jq poderia casar uma linha só do valor.
    changes = full_change()
    changes[PATHS["CATALOG"]]["tracks"][0]["storeUrl"] = url
    _rejects(tmp_path, changes, "hosts da Apple")


def test_rejects_an_odd_today(tmp_path):
    _rejects(tmp_path, full_change(), "data inválida", today="2026-10-19; rm -rf /")
