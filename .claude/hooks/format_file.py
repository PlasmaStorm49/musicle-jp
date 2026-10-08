"""Hook PostToolUse do Claude Code: formata o arquivo Python que acabou de ser editado.

O Claude Code roda este script depois de cada Edit/Write e manda, pela entrada padrão, um JSON
com tool_input.file_path. Só mexe em arquivos .py de um projeto cujo pyproject.toml fica numa
pasta chamada "pipeline" (subindo a partir do arquivo, o que funciona também em worktree).

Sempre sai com código 0: formatação nunca deve bloquear o trabalho. Falhas vão para o stderr.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def find_pipeline(path: Path) -> Path | None:
    for parent in path.parents:
        if (parent / "pyproject.toml").is_file():
            return parent if parent.name == "pipeline" else None
    return None


def run_ruff(project: Path, *args: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "ruff", *args],
        cwd=project,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if result.returncode != 0:
        print(f"ruff {args[0]}: {result.stdout}{result.stderr}".strip(), file=sys.stderr)


def main() -> int:
    try:
        # utf-8-sig aceita com ou sem BOM (o pipe do PowerShell 5.1 acrescenta um).
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
        file_path = Path(payload["tool_input"]["file_path"]).resolve()
    except (ValueError, KeyError, TypeError) as exc:
        print(f"format_file: entrada inesperada ({exc})", file=sys.stderr)
        return 0
    if file_path.suffix != ".py" or not file_path.is_file():
        return 0
    project = find_pipeline(file_path)
    if project is None:
        return 0
    # Só a regra I (ordem dos imports). Nunca F401 (import sem uso): o Claude costuma pôr o
    # import numa edição e o uso na seguinte, e o --fix apagaria o import no meio do caminho.
    run_ruff(project, "check", "--fix", "--select", "I", "--force-exclude", str(file_path))
    run_ruff(project, "format", "--force-exclude", str(file_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
