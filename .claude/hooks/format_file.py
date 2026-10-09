"""Hook PostToolUse do Claude Code: formata o arquivo que acabou de ser editado.

O Claude Code roda este script depois de cada Edit/Write e manda, pela entrada padrão, um JSON
com tool_input.file_path. Sobe pastas a partir do arquivo (o que funciona também em worktree):

- .py dentro de um projeto cujo pyproject.toml fica numa pasta "pipeline" → Ruff;
- .ts/.tsx/.js/.mjs/.json/.css dentro de um projeto com package.json e biome.json → Biome.

Só formatação e ordem dos imports, nunca correções de lint: o Claude costuma pôr o import numa
edição e o uso na seguinte, e um "remover import sem uso" apagaria o import no meio do caminho.

Sempre sai com código 0: formatação nunca deve bloquear o trabalho. Falhas vão para o stderr.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

WEB_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".json", ".jsonc", ".css"}


def find_pipeline(path: Path) -> Path | None:
    for parent in path.parents:
        if (parent / "pyproject.toml").is_file():
            return parent if parent.name == "pipeline" else None
    return None


def find_web(path: Path) -> Path | None:
    for parent in path.parents:
        if (parent / "package.json").is_file():
            return parent if (parent / "biome.json").is_file() else None
    return None


def run(cmd: list[str], cwd: Path, label: str) -> None:
    result = subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", check=False
    )
    if result.returncode != 0:
        print(f"{label}: {result.stdout}{result.stderr}".strip(), file=sys.stderr)


def format_python(project: Path, file_path: Path) -> None:
    ruff = [sys.executable, "-m", "ruff"]
    run(
        [*ruff, "check", "--fix", "--select", "I", "--force-exclude", str(file_path)],
        project,
        "ruff",
    )
    run([*ruff, "format", "--force-exclude", str(file_path)], project, "ruff format")


def format_web(project: Path, file_path: Path) -> None:
    biome = project / "node_modules" / "@biomejs" / "biome" / "bin" / "biome"
    node = shutil.which("node")
    if node is None or not biome.is_file():
        return  # worktree novo, sem npm install ainda: não há o que fazer
    # --linter-enabled=false: só formatador e organização de imports (assist).
    flags = ["--linter-enabled=false", "--no-errors-on-unmatched", "--files-ignore-unknown=true"]
    run([node, str(biome), "check", "--write", *flags, str(file_path)], project, "biome")


def main() -> int:
    try:
        # utf-8-sig aceita com ou sem BOM (o pipe do PowerShell 5.1 acrescenta um).
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
        file_path = Path(payload["tool_input"]["file_path"]).resolve()
    except (ValueError, KeyError, TypeError) as exc:
        print(f"format_file: entrada inesperada ({exc})", file=sys.stderr)
        return 0
    if not file_path.is_file():
        return 0
    if file_path.suffix == ".py":
        project = find_pipeline(file_path)
        if project is not None:
            format_python(project, file_path)
    elif file_path.suffix in WEB_SUFFIXES:
        project = find_web(file_path)
        if project is not None:
            format_web(project, file_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
