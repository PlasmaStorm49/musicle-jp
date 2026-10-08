"""Leitura e escrita de JSON byte a byte determinística."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def dumps(data: Any) -> str:
    """Forma canônica: chaves ordenadas, japonês sem escape, 2 espaços, \\n no fim."""
    return json.dumps(data, sort_keys=True, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def read_json(path: Path) -> Any:
    # Decodifica como UTF-8 estrito: um arquivo com BOM (gravado pelo PowerShell) falha aqui.
    return json.loads(path.read_bytes().decode("utf-8"))


def write_if_changed(path: Path, text: str) -> bool:
    """Grava só se os bytes mudaram. Devolve True se gravou.

    Grava num arquivo temporário e troca com os.replace: quem lê nunca vê um arquivo pela
    metade. Bytes explícitos evitam a conversão de \\n para \\r\\n do modo texto no Windows.
    """
    data = text.encode("utf-8")
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return True
