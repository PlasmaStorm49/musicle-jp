"""Testes dos scripts da tarefa catalog-generate (`.github/scripts/catalog-reserve.sh` e
`catalog-collect.sh`), que antes viviam só no YAML do robô (ME52), e dos da anime-generate e da
anime-mal (`anime-collect.sh`, `anime-reserve.sh` e `anime-due.sh`, M14, PR B).

Rodam num repositório git temporário, com bash e git (o Git Bash serve no Windows). O Python do
pipeline é trocado por um registro dos argumentos: o que se testa é o script, não o schedule.
O `anime-due.sh` também pede o jq (pula sem ele, fora da CI).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import date, timedelta
from pathlib import Path

import pytest

from musicle_pipeline.paths import repo_root

SCRIPTS = repo_root() / ".github" / "scripts"
BASH = shutil.which("bash")
GIT = shutil.which("git")
# O bash do WSL (C:\Windows\System32) não entende os caminhos do Windows; o do Git entende.
_WSL = bool(BASH) and os.name == "nt" and "system32" in (BASH or "").lower()
pytestmark = pytest.mark.skipif(
    not (BASH and GIT) or _WSL, reason="precisa de bash (o do Git, no Windows) e git"
)

TODAY = "2026-10-19"
PATHS = {
    "SNAPSHOTS": "pipeline/data/apple/snapshots",
    "ROMAJI": "pipeline/data/apple/romaji.json",
    "CATALOG": "web/public/data/catalog.json",
    "SCHEDULE": "web/public/data/schedule.json",
    "FIXTURE_SCHEDULE": "web/public/fixtures/schedule.json",
}
SNAPSHOT = f"{PATHS['SNAPSHOTS']}/{TODAY}.json"


def _git(repo: Path, *args: str) -> None:
    subprocess.run([GIT or "git", *args], cwd=repo, check=True, capture_output=True)


def make_repo(tmp_path: Path) -> Path:
    """A main em miniatura: os arquivos da lista fechada com um conteúdo qualquer, commitados."""
    repo = tmp_path / "repo"
    for key in ("ROMAJI", "CATALOG", "SCHEDULE", "FIXTURE_SCHEDULE"):
        dest = repo / PATHS[key]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(f'{{"main": "{key}"}}\n'.encode())
    (repo / PATHS["SNAPSHOTS"]).mkdir(parents=True, exist_ok=True)
    (repo / PATHS["SNAPSHOTS"] / "2026-10-12.json").write_bytes(b'{"semana": "passada"}\n')
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "teste@example.com")
    _git(repo, "config", "user.name", "Teste")
    _git(repo, "config", "core.autocrlf", "false")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "main")
    return repo


def run(repo: Path, tmp_path: Path, script: str) -> tuple[subprocess.CompletedProcess[str], Path]:
    temp = tmp_path / "runner"
    temp.mkdir(exist_ok=True)
    (temp / "github-output").write_bytes(b"")
    (temp / "summary.md").write_bytes(b"")
    # O "Python" registra os argumentos e grava um aviso, como o schedule faria.
    fake = tmp_path / "fake-python.sh"
    fake.write_bytes(
        b'#!/usr/bin/env bash\necho "$@" >> "$RUNNER_TEMP/python-args"\necho "aviso: teste"\n'
    )
    fake.chmod(0o755)  # o script chama o "Python" direto (no Linux, precisa ser executável)
    env = {
        **os.environ,
        **PATHS,
        "TODAY": TODAY,
        "RUNNER_TEMP": str(temp),
        "GITHUB_OUTPUT": str(temp / "github-output"),
        "GITHUB_STEP_SUMMARY": str(temp / "summary.md"),
        "PYTHON": fake.as_posix(),
    }
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / script)], cwd=repo, env=env, capture_output=True, text=True
    )
    return done, temp


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# --- catalog-reserve.sh ---


def test_reserve_restores_main_drops_the_new_snapshot_and_regenerates_the_schedule(tmp_path):
    repo = make_repo(tmp_path)
    for key in ("ROMAJI", "CATALOG", "SCHEDULE"):
        (repo / PATHS[key]).write_bytes(b'{"quebrado": true}\n')
    (repo / SNAPSHOT).write_bytes(b'{"parada": "de hoje"}\n')
    (tmp_path / "runner").mkdir()
    (tmp_path / "runner" / "pipeline.log").write_bytes(b"aviso: da tentativa que quebrou\n")
    done, temp = run(repo, tmp_path, "catalog-reserve.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    for key in ("ROMAJI", "CATALOG", "SCHEDULE"):
        assert text(repo / PATHS[key]) == f'{{"main": "{key}"}}\n'
    assert not (repo / SNAPSHOT).exists()
    assert "dropped=true" in text(temp / "github-output")
    assert "a parada de hoje quebrou o pipeline" in done.stdout
    args = text(temp / "python-args")
    assert args.split() == [
        "-m",
        "musicle_pipeline",
        "schedule",
        "--catalog",
        PATHS["CATALOG"],
        "--out",
        PATHS["SCHEDULE"],
        "--today",
        TODAY,
    ]
    # Os avisos da tentativa que quebrou saem; ficam só os da agenda nova.
    assert text(temp / "pipeline.log") == "aviso: teste\n"


def test_reserve_keeps_a_snapshot_that_is_already_in_main(tmp_path):
    repo = make_repo(tmp_path)
    kept = repo / PATHS["SNAPSHOTS"] / "2026-10-12.json"
    env_today = "2026-10-12"  # o pipeline quebrou num dia cujo snapshot já está na main
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / "catalog-reserve.sh")],
        cwd=repo,
        env={
            **os.environ,
            **PATHS,
            "TODAY": env_today,
            "RUNNER_TEMP": str(tmp_path),
            "GITHUB_OUTPUT": str(tmp_path / "out"),
            "PYTHON": "true",
        },
        capture_output=True,
        text=True,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert kept.exists()
    assert not (tmp_path / "out").exists() or "dropped" not in text(tmp_path / "out")
    assert "sem parada nova" in done.stdout


# --- catalog-collect.sh ---


def test_collect_without_changes_says_so(tmp_path):
    repo = make_repo(tmp_path)
    done, temp = run(repo, tmp_path, "catalog-collect.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "changed=false" in text(temp / "github-output")
    assert "Nada novo" in text(temp / "summary.md")
    assert not (temp / "out").exists()


def test_collect_copies_the_closed_list_and_the_warnings(tmp_path):
    repo = make_repo(tmp_path)
    for key in ("ROMAJI", "CATALOG", "SCHEDULE", "FIXTURE_SCHEDULE"):
        (repo / PATHS[key]).write_bytes(f'{{"novo": "{key}"}}\n'.encode())
    (repo / SNAPSHOT).write_bytes(b'{"parada": "de hoje"}\n')
    (tmp_path / "runner").mkdir()
    (tmp_path / "runner" / "pipeline.log").write_bytes(
        b"catalogo gravado\naviso: resposta futura inelegivel\naviso: buraco\n"
    )
    done, temp = run(repo, tmp_path, "catalog-collect.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "changed=true" in text(temp / "github-output")
    changed = text(temp / "out" / "changed.txt").split()
    assert sorted(changed) == sorted([SNAPSHOT, *(PATHS[k] for k in PATHS if k != "SNAPSHOTS")])
    for path in changed:
        assert (temp / "out" / "files" / path).read_bytes() == (repo / path).read_bytes()
    assert text(temp / "out" / "avisos.txt") == "aviso: resposta futura inelegivel\naviso: buraco\n"


@pytest.mark.parametrize(
    ("change", "line"),
    [
        ("outro", "?? pipeline/outro.json"),  # arquivo novo fora da lista
        ("snapshot de outro dia", "?? pipeline/data/apple/snapshots/2026-10-20.json"),
        ("snapshot antigo alterado", " M pipeline/data/apple/snapshots/2026-10-12.json"),
    ],
)
def test_collect_refuses_anything_outside_the_closed_list(tmp_path, change, line):
    repo = make_repo(tmp_path)
    if change == "outro":
        (repo / "pipeline" / "outro.json").write_bytes(b"{}\n")
    elif change == "snapshot de outro dia":
        (repo / PATHS["SNAPSHOTS"] / "2026-10-20.json").write_bytes(b"{}\n")
    else:
        (repo / PATHS["SNAPSHOTS"] / "2026-10-12.json").write_bytes(b'{"reescrito": 1}\n')
    (tmp_path / "runner").mkdir()
    (tmp_path / "runner" / "pipeline.log").write_bytes(b"")
    done, _ = run(repo, tmp_path, "catalog-collect.sh")
    assert done.returncode == 1
    assert f"mudança fora da lista fechada: {line}" in done.stdout


# --- O Anime (M14, PR B): anime-collect.sh, anime-reserve.sh e anime-due.sh ---

JQ = shutil.which("jq")
needs_jq = pytest.mark.skipif(
    not JQ and not os.environ.get("CI"), reason="precisa de jq (a CI tem)"
)
NOW = "2026-10-26T09:17:00Z"
ANIME = {
    "ANIME_SNAPSHOTS": "pipeline/data/apple/anime/snapshots",
    "ANIME_CATALOG": "web/public/data/anime/catalog.json",
    "ANIME_SCHEDULE": "web/public/data/anime/schedule.json",
    "ANIME_FIXTURE_SCHEDULE": "web/public/fixtures/anime/schedule.json",
}
ANIME_SNAPSHOT = f"{ANIME['ANIME_SNAPSHOTS']}/2026-10-26T091700Z.json"
OLD_ANIME_SNAPSHOT = f"{ANIME['ANIME_SNAPSHOTS']}/2026-10-22T011811Z.json"


def make_anime_repo(tmp_path: Path) -> Path:
    """A main em miniatura com os arquivos dos Hits e os do Anime, commitados."""
    repo = make_repo(tmp_path)
    for key in ("ANIME_CATALOG", "ANIME_SCHEDULE", "ANIME_FIXTURE_SCHEDULE"):
        dest = repo / ANIME[key]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(f'{{"main": "{key}"}}\n'.encode())
    (repo / OLD_ANIME_SNAPSHOT).parent.mkdir(parents=True, exist_ok=True)
    (repo / OLD_ANIME_SNAPSHOT).write_bytes(b'{"busca": "antiga"}\n')
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "anime")
    return repo


def run_anime(
    repo: Path, tmp_path: Path, script: str, **extra: str
) -> tuple[subprocess.CompletedProcess[str], Path]:
    temp = tmp_path / "runner"
    temp.mkdir(exist_ok=True)
    (temp / "github-output").write_bytes(b"")
    (temp / "summary.md").write_bytes(b"")
    fake = tmp_path / "fake-python.sh"
    fake.write_bytes(
        b'#!/usr/bin/env bash\necho "$@" >> "$RUNNER_TEMP/python-args"\n'
        b'echo "aviso: teste"\necho "afrouxamento: teste"\n'
    )
    fake.chmod(0o755)
    env = {
        **os.environ,
        **ANIME,
        "TODAY": "2026-10-26",
        "NOW": NOW,
        "ANIME_DAYS": "28",
        "RUNNER_TEMP": str(temp),
        "GITHUB_OUTPUT": str(temp / "github-output"),
        "GITHUB_STEP_SUMMARY": str(temp / "summary.md"),
        "PYTHON": fake.as_posix(),
        **extra,
    }
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / script)], cwd=repo, env=env, capture_output=True, text=True
    )
    return done, temp


def test_anime_collect_without_changes_says_so(tmp_path):
    repo = make_anime_repo(tmp_path)
    done, temp = run_anime(repo, tmp_path, "anime-collect.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "changed=false" in text(temp / "github-output")
    assert not (temp / "anime-out").exists()


def test_anime_collect_copies_the_closed_list_and_the_warnings(tmp_path):
    repo = make_anime_repo(tmp_path)
    for key in ("ANIME_CATALOG", "ANIME_SCHEDULE", "ANIME_FIXTURE_SCHEDULE"):
        (repo / ANIME[key]).write_bytes(f'{{"novo": "{key}"}}\n'.encode())
    (repo / ANIME_SNAPSHOT).write_bytes(b'{"busca": "de agora"}\n')
    (tmp_path / "runner").mkdir()
    # O aviso do acervo curto sai do schedule-anime e de novo do validate-anime: vai uma vez só,
    # e os avisos vêm antes dos afrouxamentos.
    (tmp_path / "runner" / "anime.log").write_bytes(
        b"catalogo gravado\nafrouxamento: nivel 1\naviso: acervo curto\nLiSA: 2 de 3 temas\n"
        b"aviso: acervo curto\n"
    )
    done, temp = run_anime(repo, tmp_path, "anime-collect.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "changed=true" in text(temp / "github-output")
    out = temp / "anime-out"
    changed = text(out / "changed.txt").split()
    keys = ("ANIME_CATALOG", "ANIME_SCHEDULE", "ANIME_FIXTURE_SCHEDULE")
    assert sorted(changed) == sorted([ANIME_SNAPSHOT, *(ANIME[k] for k in keys)])
    for path in changed:
        assert (out / "files" / path).read_bytes() == (repo / path).read_bytes()
    assert text(out / "avisos.txt") == "aviso: acervo curto\nafrouxamento: nivel 1\n"
    assert not (temp / "out").exists()  # o artefato dos Hits fica de fora


@pytest.mark.parametrize(
    ("change", "line"),
    [
        ("hits", " M web/public/data/schedule.json"),  # os Hits não são da lista do Anime
        ("outro snapshot", "?? pipeline/data/apple/anime/snapshots/2026-10-26T091800Z.json"),
        ("snapshot antigo", " M pipeline/data/apple/anime/snapshots/2026-10-22T011811Z.json"),
        ("romaji", "?? pipeline/data/apple/anime/romaji.json"),
    ],
)
def test_anime_collect_refuses_anything_outside_the_closed_list(tmp_path, change, line):
    repo = make_anime_repo(tmp_path)
    if change == "hits":
        (repo / PATHS["SCHEDULE"]).write_bytes(b'{"outro": 1}\n')
    elif change == "outro snapshot":
        (repo / ANIME["ANIME_SNAPSHOTS"] / "2026-10-26T091800Z.json").write_bytes(b"{}\n")
    elif change == "snapshot antigo":
        (repo / OLD_ANIME_SNAPSHOT).write_bytes(b'{"reescrito": 1}\n')
    else:
        (repo / "pipeline/data/apple/anime/romaji.json").write_bytes(b"{}\n")
    (tmp_path / "runner").mkdir()
    (tmp_path / "runner" / "anime.log").write_bytes(b"")
    done, _ = run_anime(repo, tmp_path, "anime-collect.sh")
    assert done.returncode == 1
    assert f"mudança fora da lista fechada do Anime: {line}" in done.stdout


def test_anime_reserve_restores_main_drops_the_new_snapshot_and_regrows_the_schedule(tmp_path):
    repo = make_anime_repo(tmp_path)
    for key in ("ANIME_CATALOG", "ANIME_SCHEDULE"):
        (repo / ANIME[key]).write_bytes(b'{"quebrado": true}\n')
    (repo / ANIME_SNAPSHOT).write_bytes(b'{"busca": "que quebrou"}\n')
    (tmp_path / "runner").mkdir()
    (tmp_path / "runner" / "anime.log").write_bytes(b"aviso: da tentativa que quebrou\n")
    done, temp = run_anime(repo, tmp_path, "anime-reserve.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    for key in ("ANIME_CATALOG", "ANIME_SCHEDULE"):
        assert text(repo / ANIME[key]) == f'{{"main": "{key}"}}\n'
    assert not (repo / ANIME_SNAPSHOT).exists()
    assert (repo / OLD_ANIME_SNAPSHOT).exists()
    assert "dropped=true" in text(temp / "github-output")
    assert "a busca do Anime de hoje quebrou" in done.stdout
    assert text(temp / "python-args").split() == [
        "-m",
        "musicle_pipeline",
        "schedule-anime",
        "--provider",
        "apple",
        "--today",
        "2026-10-26",
        "--days",
        "28",
    ]
    # Os avisos da tentativa que quebrou saem; ficam só os da agenda nova.
    assert text(temp / "anime.log") == "aviso: teste\nafrouxamento: teste\n"


def test_anime_reserve_without_a_new_snapshot(tmp_path):
    repo = make_anime_repo(tmp_path)
    (repo / ANIME["ANIME_SCHEDULE"]).write_bytes(b'{"quebrado": true}\n')
    done, temp = run_anime(repo, tmp_path, "anime-reserve.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "dropped" not in text(temp / "github-output")
    assert "sem busca nova" in done.stdout
    assert text(repo / ANIME["ANIME_SCHEDULE"]) == '{"main": "ANIME_SCHEDULE"}\n'


def anime_schedule(last: str) -> bytes:
    """Uma agenda do Anime com 40 dias até `last` (os diários não importam para a folga)."""
    end = date.fromisoformat(last)
    days = {(end - timedelta(days=i)).isoformat(): {"number": 1} for i in range(40)}
    return json.dumps({"kind": "anime", "days": days}).encode()


@needs_jq
@pytest.mark.parametrize(
    ("last", "due", "ahead"),
    [
        ("2026-11-15", "true", "20"),  # menos de 21 dias à frente: gera
        ("2026-11-16", "false", "21"),  # 21: espera a semana que vem
        ("2026-10-24", "true", "0"),  # a agenda acabou: gera
    ],
)
def test_anime_due_measures_the_main_schedule(tmp_path, last, due, ahead):
    repo = tmp_path / "repo"
    path = repo / ANIME["ANIME_SCHEDULE"]
    path.parent.mkdir(parents=True)
    path.write_bytes(anime_schedule(last))
    done, temp = run_anime(repo, tmp_path, "anime-due.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert f"due={due}" in text(temp / "github-output")
    assert f"ahead={ahead}" in text(temp / "github-output")


def test_anime_due_without_the_schedule_does_nothing(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    done, temp = run_anime(repo, tmp_path, "anime-due.sh")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "due=false" in text(temp / "github-output")
    assert "ainda não tem a agenda do Anime" in text(temp / "summary.md")


def test_anime_due_refuses_an_odd_today(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    done, _ = run_anime(repo, tmp_path, "anime-due.sh", TODAY="2026-10-26; rm -rf /")
    assert done.returncode == 1
    assert "data inválida" in done.stdout
