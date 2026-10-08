from __future__ import annotations

import os
import subprocess
import sys

import pytest

from musicle_pipeline.cli import main
from musicle_pipeline.paths import repo_root

COMMITTED = repo_root() / "web" / "public" / "fixtures" / "catalog.json"


def _build(out) -> int:
    return main(["build", "--provider", "fixture", "--out", str(out)])


def test_second_build_reports_no_changes(tmp_path, capsys):
    out = tmp_path / "catalog.json"
    assert _build(out) == 0
    assert "catálogo gravado" in capsys.readouterr().out
    first = out.read_bytes()
    assert _build(out) == 0
    assert "sem mudanças" in capsys.readouterr().out
    assert out.read_bytes() == first


def test_validate_command(tmp_path, capsys):
    out = tmp_path / "catalog.json"
    _build(out)
    assert main(["validate", str(out)]) == 0
    out.write_bytes(out.read_bytes().replace(b'"schemaVersion": 1', b'"schemaVersion": 2'))
    assert main(["validate", str(out)]) == 1
    assert "schemaVersion" in capsys.readouterr().err


@pytest.mark.parametrize("seed", ["1", "2"])
def test_bytes_do_not_depend_on_hash_seed(tmp_path, seed):
    # A ordem de um set muda com PYTHONHASHSEED. Se algo depender dela, os bytes mudam.
    out = tmp_path / f"catalog-{seed}.json"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", "build", "--provider", "fixture"]
    subprocess.run([*cmd, "--out", str(out)], check=True, env=env, capture_output=True)
    reference = tmp_path / "reference.json"
    assert _build(reference) == 0
    assert out.read_bytes() == reference.read_bytes()


def test_committed_catalog_is_up_to_date(tmp_path):
    """O catalog.json versionado tem de ser exatamente o que o pipeline gera hoje.

    Se falhar depois de mudar regras do pipeline, regenere o arquivo com o comando build.
    """
    if not COMMITTED.exists():
        pytest.skip("catálogo ainda não gerado")
    fresh = tmp_path / "catalog.json"
    _build(fresh)
    assert fresh.read_bytes() == COMMITTED.read_bytes()
