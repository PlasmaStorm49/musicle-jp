"""Teste cruzado: a normalização em TypeScript (web/) dá exatamente o mesmo que a do Python.

Os vetores conferem casos escolhidos à mão; este teste confere TODOS os caracteres do plano
básico que existem no Unicode do Python (15.0), mais as strings da varredura do loose_key.
O Node 24 roda o arquivo .ts direto (type stripping), sem build.
"""

from __future__ import annotations

import itertools
import json
import shutil
import subprocess
import unicodedata as ud

import pytest

from musicle_pipeline.normalize import loose_key, normalize
from musicle_pipeline.paths import repo_root

SCRIPT = repo_root() / "web" / "scripts" / "dump-normalize.ts"


def _node_runs_typescript() -> bool:
    if shutil.which("node") is None:
        return False
    probe = subprocess.run(
        ["node", "-p", "Boolean(process.features.typescript)"], capture_output=True, check=False
    )
    return probe.stdout.strip() == b"true"


pytestmark = pytest.mark.skipif(not _node_runs_typescript(), reason="Node sem suporte a .ts")


def _bmp_characters() -> list[str]:
    cps = itertools.chain(range(0xD800), range(0xE000, 0x10000))
    return [chr(cp) for cp in cps if ud.category(chr(cp)) != "Cn"]


def _short_strings() -> list[str]:
    alphabet = "aeiounmshtczjydbp"
    return [
        "".join(letters)
        for size in range(1, 5)
        for letters in itertools.product(alphabet, repeat=size)
    ]


def _first_differences(inputs, python, typescript, limit=20):
    diffs = []
    for text, ts_out in zip(inputs, typescript, strict=True):
        py_out = python(text)
        if py_out != ts_out:
            diffs.append((text.encode("unicode_escape").decode(), py_out, ts_out))
            if len(diffs) == limit:
                break
    return diffs


def test_typescript_normalize_matches_python_everywhere():
    chars, strings = _bmp_characters(), _short_strings()
    # ensure_ascii: a entrada vai só em ASCII (\uXXXX), sem depender da página de código.
    payload = json.dumps({"normalize": chars, "looseKey": strings}, ensure_ascii=True)
    result = subprocess.run(
        ["node", str(SCRIPT)], input=payload.encode("ascii"), capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr.decode("utf-8", "replace")
    out = json.loads(result.stdout.decode("utf-8"))  # bytes → UTF-8 explícito
    assert len(out["normalize"]) == len(chars) == 62034
    assert len(out["looseKey"]) == len(strings)
    assert _first_differences(chars, normalize, out["normalize"]) == []
    assert _first_differences(strings, loose_key, out["looseKey"]) == []
