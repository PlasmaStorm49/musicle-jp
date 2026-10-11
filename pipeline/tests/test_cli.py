from __future__ import annotations

import os
import subprocess
import sys

import pytest

from musicle_pipeline.cli import main
from musicle_pipeline.paths import repo_root

COMMITTED = {
    "fixture": repo_root() / "web" / "public" / "fixtures" / "catalog.json",
    "apple": repo_root() / "web" / "public" / "data" / "catalog.json",
}


def _build(out, provider: str = "fixture") -> int:
    return main(["build", "--provider", provider, "--out", str(out)])


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


@pytest.mark.parametrize("provider", sorted(COMMITTED))
@pytest.mark.parametrize("seed", ["1", "2"])
def test_bytes_do_not_depend_on_hash_seed(tmp_path, seed, provider):
    # A ordem de um set muda com PYTHONHASHSEED. Se algo depender dela, os bytes mudam.
    out = tmp_path / f"catalog-{seed}.json"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", "build", "--provider", provider]
    subprocess.run([*cmd, "--out", str(out)], check=True, env=env, capture_output=True)
    reference = tmp_path / "reference.json"
    assert _build(reference, provider) == 0
    assert out.read_bytes() == reference.read_bytes()


@pytest.mark.parametrize("provider", sorted(COMMITTED))
def test_committed_catalog_is_up_to_date(tmp_path, provider):
    """O catalog.json versionado tem de ser exatamente o que o pipeline gera hoje.

    Se falhar depois de mudar regras do pipeline, regenere o arquivo com o comando build
    (dos dois provedores: as fixtures e a Apple, a partir dos snapshots versionados).
    """
    if not COMMITTED[provider].exists():
        pytest.skip("catálogo ainda não gerado")
    fresh = tmp_path / "catalog.json"
    assert _build(fresh, provider) == 0
    assert fresh.read_bytes() == COMMITTED[provider].read_bytes()


def test_build_refuses_another_providers_public_dir(capsys):
    # A fixture nunca sobrescreve o catálogo real (nem o contrário).
    real = repo_root() / "web" / "public" / "data" / "catalog.json"
    before = real.read_bytes() if real.exists() else None
    assert main(["build", "--provider", "fixture", "--out", str(real)]) == 1
    assert "grava em" in capsys.readouterr().err
    assert (real.read_bytes() if real.exists() else None) == before


def test_schedule_check_needs_one_path_with_base(tmp_path, capsys):
    first, second = tmp_path / "a.json", tmp_path / "b.json"
    args = ["schedule-check", "--path", str(first), "--path", str(second)]
    assert main([*args, "--base", str(tmp_path / "base.json")]) == 1
    assert "exatamente um --path" in capsys.readouterr().err
