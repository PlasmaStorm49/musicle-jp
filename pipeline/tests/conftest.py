from __future__ import annotations

import os
import shutil
from pathlib import PureWindowsPath

import pytest

from musicle_pipeline.catalog import build_catalog
from musicle_pipeline.models import JSON, ChartSnapshot
from musicle_pipeline.providers import FixtureProvider


@pytest.fixture(scope="session", autouse=True)
def _jq_without_crlf(tmp_path_factory: pytest.TempPathFactory):
    """No Windows, o jq.exe nativo (o do winget) escreve as linhas com CRLF, e o \r entraria nas
    contas dos scripts do robô ("2026-11-10\r"): um invólucro com o -b vai na frente do PATH dos
    testes que rodam os scripts pelo bash (ME129). Na CI, no Linux, nada muda."""
    jq = shutil.which("jq")
    if os.name != "nt" or not jq or not jq.lower().endswith(".exe"):
        yield
        return
    folder = tmp_path_factory.mktemp("jq-bin")
    # O bash do Git lê o caminho no formato dele: C:\a\jq.exe vira /c/a/jq.exe.
    native = PureWindowsPath(jq)
    posix = "/" + native.drive[0].lower() + native.as_posix()[2:]
    wrapper = folder / "jq"
    wrapper.write_text(
        f'#!/usr/bin/env bash\nexec "{posix}" -b "$@"\n', encoding="utf-8", newline="\n"
    )
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("PATH", f"{folder}{os.pathsep}{os.environ.get('PATH', '')}")
        yield


@pytest.fixture(scope="session")
def fixture_snapshots() -> list[ChartSnapshot]:
    return FixtureProvider().snapshots()


@pytest.fixture(scope="session")
def fixture_catalog(fixture_snapshots: list[ChartSnapshot]) -> JSON:
    return build_catalog(fixture_snapshots, "fixture", "jp")
