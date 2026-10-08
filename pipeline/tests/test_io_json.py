from __future__ import annotations

import pytest

from musicle_pipeline.io_json import dumps, read_json, write_if_changed


def test_dumps_is_canonical():
    assert dumps({"b": 1, "a": "日本"}) == '{\n  "a": "日本",\n  "b": 1\n}\n'


def test_dumps_rejects_nan():
    with pytest.raises(ValueError):
        dumps({"x": float("nan")})


def test_write_if_changed_writes_lf_bytes_once(tmp_path):
    path = tmp_path / "sub" / "out.json"
    text = dumps({"título": "夜明け"})
    assert write_if_changed(path, text) is True
    assert write_if_changed(path, text) is False
    raw = path.read_bytes()
    assert b"\r" not in raw
    assert raw.endswith(b"}\n")
    assert raw == text.encode("utf-8")
    assert not (tmp_path / "sub" / "out.json.tmp").exists()


def test_read_json_rejects_bom(tmp_path):
    # Arquivo gravado com BOM (padrão de alguns comandos do PowerShell) não é aceito.
    path = tmp_path / "bom.json"
    path.write_bytes(b"\xef\xbb\xbf{}")
    with pytest.raises(ValueError):
        read_json(path)
