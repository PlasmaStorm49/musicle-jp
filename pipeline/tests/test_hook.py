"""O hook do formatador (.claude/hooks/format_file.py) e a forma dele no settings.json."""

import json
import os
import subprocess
import sys

import pytest

from musicle_pipeline.io_json import read_json
from musicle_pipeline.paths import repo_root

HOOK = repo_root() / ".claude" / "hooks" / "format_file.py"
UGLY = "import sys\nimport os\nx=1\nprint(os, sys,x)\n"
PRETTY = "import os\nimport sys\n\nx = 1\nprint(os, sys, x)\n"


def _run_hook(payload: bytes) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HOOK)], input=payload, capture_output=True, check=False
    )


def _payload(path) -> bytes:
    return json.dumps({"tool_input": {"file_path": str(path)}}).encode("utf-8")


def _fake_pipeline(tmp_path):
    project = tmp_path / "pipeline"
    (project / "src").mkdir(parents=True)
    (project / "pyproject.toml").write_text("[tool.ruff]\nline-length = 100\n", "utf-8")
    return project


WEB = repo_root() / "web"
HAS_BIOME = (WEB / "node_modules" / "@biomejs" / "biome" / "bin" / "biome").is_file()


@pytest.mark.skipif(not HAS_BIOME, reason="web/node_modules ausente (rode npm ci --prefix web)")
def test_formats_typescript_inside_web_keeping_unused_imports():
    probe = WEB / "test" / f"hook_probe_{os.getpid()}.ts"
    probe.write_text(
        'import { b } from "./b.ts";\nimport { a } from "./a.ts";\n'
        'import { unused } from "./c.ts";\nexport const x=a+b\n',
        "utf-8",
    )
    try:
        assert _run_hook(_payload(probe)).returncode == 0
        lines = probe.read_text("utf-8").splitlines()
        assert lines[:3] == [
            'import { a } from "./a.ts";',
            'import { b } from "./b.ts";',
            'import { unused } from "./c.ts";',  # import sem uso continua
        ]
        assert "export const x = a + b;" in lines
    finally:
        probe.unlink()


def test_web_file_outside_a_biome_project_is_untouched(tmp_path):
    target = tmp_path / "solto.ts"
    target.write_text("export const x=1\n", "utf-8")
    assert _run_hook(_payload(target)).returncode == 0
    assert target.read_text("utf-8") == "export const x=1\n"


def test_formats_python_file_inside_pipeline(tmp_path):
    target = _fake_pipeline(tmp_path) / "src" / "mod.py"
    target.write_text(UGLY, "utf-8")
    assert _run_hook(_payload(target)).returncode == 0
    assert target.read_text("utf-8") == PRETTY


def test_ignores_files_outside_a_pipeline_project(tmp_path):
    target = tmp_path / "solto.py"
    target.write_text(UGLY, "utf-8")
    assert _run_hook(_payload(target)).returncode == 0
    assert target.read_text("utf-8") == UGLY


def test_ignores_non_python_files(tmp_path):
    target = _fake_pipeline(tmp_path) / "notas.md"
    target.write_text("x=1\n", "utf-8")
    assert _run_hook(_payload(target)).returncode == 0
    assert target.read_text("utf-8") == "x=1\n"


def test_bad_input_never_blocks(tmp_path):
    result = _run_hook(b"isto nao e json")
    assert result.returncode == 0
    assert b"entrada inesperada" in result.stderr


def test_settings_wire_the_hook_without_a_shell():
    settings = read_json(repo_root() / ".claude" / "settings.json")
    (entry,) = settings["hooks"]["PostToolUse"]
    assert entry["matcher"] == "Edit|Write"
    (hook,) = entry["hooks"]
    assert hook["command"] == "${CLAUDE_PROJECT_DIR}/.venv/Scripts/python.exe"
    assert hook["args"] == ["${CLAUDE_PROJECT_DIR}/.claude/hooks/format_file.py"]
    assert "shell" not in hook
    assert os.path.exists(HOOK)
