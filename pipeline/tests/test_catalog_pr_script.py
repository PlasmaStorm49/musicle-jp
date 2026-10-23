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
# Na CI (CI=true) não pula: se a imagem do runner perder o jq, a falha aparece, em vez de a
# proteção da tarefa com token sumir em silêncio.
pytestmark = pytest.mark.skipif(
    not (BASH and JQ) and not os.environ.get("CI"), reason="precisa de bash e jq (a CI tem)"
)

PATHS = {
    "SNAPSHOTS": "pipeline/data/apple/snapshots",
    "ROMAJI": "pipeline/data/apple/romaji.json",
    "CATALOG": "web/public/data/catalog.json",
    "SCHEDULE": "web/public/data/schedule.json",
    "FIXTURE_SCHEDULE": "web/public/fixtures/schedule.json",
}
# Hoje como o robô da semana que vem veria: a agenda da main vai até a geração anterior + 21,
# então hoje é o fim dela − 14, e os 7 dias novos vão até hoje + 21 (o horizonte). Datas fixas
# quebravam no PR do robô que faz a agenda crescer (o PR #16 foi isso).
# O fim mais tardio das duas: a mais curta só ganha os seus 7 dias antes do limite.
_LAST = max(
    date.fromisoformat(max(read_json(repo_root() / PATHS[key])["days"]))
    for key in ("SCHEDULE", "FIXTURE_SCHEDULE")
)
TODAY = (_LAST - timedelta(days=14)).isoformat()
NEW_DAYS = 7
SNAPSHOT = f"{PATHS['SNAPSHOTS']}/{TODAY}.json"
FIRST_SNAPSHOT = repo_root() / PATHS["SNAPSHOTS"] / "2026-10-10.json"


def _base(key: str) -> JSON:
    return read_json(repo_root() / PATHS[key])


def _new_days(schedule: JSON, count: int, today: str = TODAY) -> list[str]:
    """Os dias que a geração acrescentaria: do dia seguinte ao fim, ou de hoje (P44)."""
    after_last = date.fromisoformat(max(schedule["days"])) + timedelta(days=1)
    start = max(after_last, date.fromisoformat(today))
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
        PATHS["SCHEDULE"]: grown(_base("SCHEDULE"), _new_days(_base("SCHEDULE"), NEW_DAYS)),
        PATHS["FIXTURE_SCHEDULE"]: grown(
            _base("FIXTURE_SCHEDULE"), _new_days(_base("FIXTURE_SCHEDULE"), NEW_DAYS)
        ),
    }


def run(
    tmp_path: Path,
    changes: dict[str, JSON],
    *,
    declared: list[str] | None = None,
    extra_files: dict[str, str] | None = None,
    fetch: str = "success",
    chart: str = "success",
    today: str = TODAY,
    generated: str | None = None,
    avisos: str | None = None,
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
    if avisos is not None:
        (temp / "artifact" / "avisos.txt").write_bytes(avisos.encode("utf-8"))
    listed = declared if declared is not None else list(changes)
    (temp / "artifact" / "changed.txt").write_bytes("".join(f"{p}\n" for p in listed).encode())

    output = temp / "github-output"
    output.write_bytes(b"")
    env = {
        **os.environ,
        **PATHS,
        "TODAY": today,
        "GENERATED_TODAY": today if generated is None else generated,
        "FETCH": fetch,
        "CHART": chart,
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
    real_last = _new_days(_base("SCHEDULE"), NEW_DAYS)[-1]
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
        "GENERATED_TODAY": TODAY,
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
    changes[SNAPSHOT]["date"] = (date.fromisoformat(TODAY) - timedelta(days=1)).isoformat()
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
    days = _new_days(_base("SCHEDULE"), NEW_DAYS)
    changes[PATHS["SCHEDULE"]] = grown(_base("SCHEDULE"), days[:3] + days[4:])
    _rejects(tmp_path, changes, "buraco entre os dias novos")


def test_rejects_new_days_that_skip_the_expected_first(tmp_path):
    # P44: o 1º dia novo é o seguinte ao fim (ou hoje); começar depois disso deixaria buraco.
    changes = full_change()
    days = _new_days(_base("SCHEDULE"), NEW_DAYS)[1:]
    changes[PATHS["SCHEDULE"]] = grown(_base("SCHEDULE"), days)
    _rejects(tmp_path, changes, "o 1º dia novo deveria ser")


def test_same_chart_brings_only_the_schedules(tmp_path):
    changes = full_change()
    keep = {k: changes[k] for k in (PATHS["SCHEDULE"], PATHS["FIXTURE_SCHEDULE"])}
    done, _, temp = run(tmp_path, keep)  # a busca deu certo, mas a parada é a mesma
    assert done.returncode == 0, done.stdout + done.stderr
    assert "igual à da última busca" in body(temp)
    assert "Atenção" not in body(temp)


def test_a_chart_that_broke_the_pipeline_brings_only_the_schedules(tmp_path):
    done, _, temp = run(tmp_path, schedules_only(), chart="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "quebrou o pipeline" in body(temp)
    assert f"title=chore: agenda de {TODAY}" in outputs(temp)


def test_a_chart_left_out_cannot_bring_its_snapshot(tmp_path):
    # A reserva apaga o snapshot que quebrou o pipeline: se ele veio, o caminho falhou.
    done, _, _ = run(tmp_path, full_change(), chart="failure")
    assert done.returncode == 1, done.stdout + done.stderr
    assert "ficou de fora (CHART=failure)" in done.stdout


def test_warns_when_the_chart_is_weeks_old(tmp_path):
    changes = full_change()
    keep = {k: changes[k] for k in (PATHS["SCHEDULE"], PATHS["FIXTURE_SCHEDULE"])}
    day = (date.fromisoformat(TODAY) - timedelta(days=18)).isoformat()
    old = tmp_path / "repo" / PATHS["SNAPSHOTS"] / f"{day}.json"
    old.parent.mkdir(parents=True, exist_ok=True)
    old.write_bytes(b"{}")
    done, _, temp = run(tmp_path, keep, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert f"a última parada guardada é de {day} (18 dias)" in body(temp)


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


def schedules_only(today: str = TODAY) -> dict[str, JSON]:
    return {
        PATHS["SCHEDULE"]: grown(_base("SCHEDULE"), _new_days(_base("SCHEDULE"), 3, today)),
        PATHS["FIXTURE_SCHEDULE"]: grown(
            _base("FIXTURE_SCHEDULE"), _new_days(_base("FIXTURE_SCHEDULE"), 3, today)
        ),
    }


def test_warns_about_the_gap_when_the_schedule_ran_out(tmp_path):
    # A agenda acabou antes de hoje (o robô ficou parado): os dias que passaram ficam buraco.
    # As datas saem da agenda versionada, que o próprio robô faz crescer toda semana: fixas, o
    # teste quebraria no PR do robô que acrescenta o dia seguinte.
    last = date.fromisoformat(max(_base("SCHEDULE")["days"]))
    late = (last + timedelta(days=4)).isoformat()
    done, _, temp = run(tmp_path, schedules_only(late), today=late, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert (
        f"> **Atenção (Agenda do site):** 3 dia(s) ficaram sem diário depois de {last.isoformat()}"
        in body(temp)
    )


def test_warns_to_merge_today_when_the_schedule_ended_yesterday(tmp_path):
    # Sem buraco, mas o 1º dia novo é hoje: o merge amanhã levaria um dia passado.
    last = date.fromisoformat(max(_base("SCHEDULE")["days"]))
    next_day = (last + timedelta(days=1)).isoformat()
    done, _, temp = run(tmp_path, schedules_only(next_day), today=next_day, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "> **Atenção (Agenda do site):** a agenda acabou ontem e o 1º dia novo é hoje" in body(
        temp
    )
    assert f"sem diário depois de {last.isoformat()}" not in body(temp)


def test_new_chart_without_new_romaji_passes(tmp_path):
    changes = full_change()
    del changes[PATHS["ROMAJI"]]
    done, _, temp = run(tmp_path, changes)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "Romaji novo" not in body(temp)


def test_pipeline_warnings_go_to_the_body_in_a_code_block(tmp_path):
    avisos = "aviso: 2026-11-03|song: a resposta não é mais elegível\naviso: x ~~~ @alguém\n"
    done, _, temp = run(tmp_path, full_change(), avisos=avisos)
    assert done.returncode == 0, done.stdout + done.stderr
    text = body(temp)
    assert "a resposta não é mais elegível" in text
    assert "aviso: x --- @alguém" in text
    assert text.count("~~~") == 4  # dois blocos: romaji e avisos


def test_rejects_a_snapshot_without_a_new_catalog(tmp_path):
    changes = full_change()
    del changes[PATHS["CATALOG"]]
    _rejects(tmp_path, changes, "snapshot novo sem catálogo novo")


def test_rejects_romaji_without_a_new_chart(tmp_path):
    changes = {**schedules_only(), PATHS["ROMAJI"]: new_romaji()}
    _rejects(tmp_path, changes, "romaji mudou sem parada nova")


def test_rejects_a_schedule_listed_without_new_days(tmp_path):
    changes = full_change()
    changes[PATHS["SCHEDULE"]] = _base("SCHEDULE")
    _rejects(tmp_path, changes, "mudou sem dia novo")


def test_rejects_a_declared_file_that_did_not_come(tmp_path):
    changes = full_change()
    declared = list(changes)
    del changes[PATHS["ROMAJI"]]
    _rejects(tmp_path, changes, "não batem com a lista declarada", declared=declared)


def test_rejects_a_file_with_two_json_documents(tmp_path):
    changes = full_change()
    catalog = changes.pop(PATHS["CATALOG"])
    twice = dumps(catalog) + dumps(catalog)
    _rejects(
        tmp_path,
        changes,
        "precisa ser um JSON só",
        declared=[*changes, PATHS["CATALOG"]],
        extra_files={PATHS["CATALOG"]: twice},
    )


def test_rejects_an_odd_today(tmp_path):
    _rejects(tmp_path, full_change(), "data inválida", today=f"{TODAY}; rm -rf /")


# --- ME44 e ME53: o "hoje" desta tarefa, o horizonte e conferências mais estritas ---


def test_rejects_a_generation_day_that_is_not_today(tmp_path):
    # A tarefa do pipeline (com os pacotes do pip) mandou outra data.
    tomorrow = (date.fromisoformat(TODAY) + timedelta(days=1)).isoformat()
    _rejects(tmp_path, full_change(), "a tarefa do pipeline gerou para", generated=tomorrow)


def test_rejects_new_days_beyond_the_horizon(tmp_path):
    changes = full_change()
    changes[PATHS["SCHEDULE"]] = grown(_base("SCHEDULE"), _new_days(_base("SCHEDULE"), 30))
    _rejects(tmp_path, changes, "passa de hoje + 21")


def test_rejects_an_empty_romaji_text(tmp_path):
    changes = full_change()
    changes[PATHS["ROMAJI"]] = new_romaji({"テスト曲": [""]})
    _rejects(tmp_path, changes, "o romaji novo altera o que já existe")


def test_rejects_a_snapshot_not_after_the_last_in_main(tmp_path):
    later = (date.fromisoformat(TODAY) + timedelta(days=2)).isoformat()
    newer = tmp_path / "repo" / PATHS["SNAPSHOTS"] / f"{later}.json"
    newer.parent.mkdir(parents=True, exist_ok=True)
    newer.write_bytes(b"{}")
    _rejects(tmp_path, full_change(), "não vem depois do último da main")
