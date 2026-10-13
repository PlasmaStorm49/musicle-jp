from __future__ import annotations

import os
import re
import subprocess
import sys

import pytest

from musicle_pipeline.cli import main
from musicle_pipeline.io_json import read_json
from musicle_pipeline.paths import artist_paths, repo_root

COMMITTED = {
    "fixture": repo_root() / "web" / "public" / "fixtures" / "catalog.json",
    "apple": repo_root() / "web" / "public" / "data" / "catalog.json",
}


# Os arquivos do modo por artista (M13), separados: a pasta inteira, não um arquivo.
COMMITTED_ARTISTS = {p: artist_paths(p).public_dir for p in ("fixture", "apple")}


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
    out.write_bytes(out.read_bytes().replace(b'"schemaVersion": 2', b'"schemaVersion": 3'))
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
    (dos dois provedores: as fixtures e a Apple, a partir dos snapshots versionados). Sem
    `skip`: os dois catálogos são versionados, e um apagado tem de falhar aqui.
    """
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


def test_schedule_check_without_path_needs_one_with_base(tmp_path, capsys):
    assert main(["schedule-check", "--base", str(tmp_path / "base.json")]) == 1
    assert "exatamente um --path" in capsys.readouterr().err


def test_schedule_check_catches_a_deleted_schedule(tmp_path, capsys):
    base = tmp_path / "base.json"
    base.write_bytes((repo_root() / "web" / "public" / "fixtures" / "schedule.json").read_bytes())
    missing = tmp_path / "apagada.json"
    assert main(["schedule-check", "--path", str(missing), "--base", str(base)]) == 1
    assert "foi apagada" in capsys.readouterr().out


def test_schedule_check_with_nothing_on_either_side(tmp_path, capsys):
    args = ["schedule-check", "--path", str(tmp_path / "a.json")]
    assert main([*args, "--base", str(tmp_path / "b.json")]) == 0
    assert "nenhuma agenda" in capsys.readouterr().out


def _build_artists(out_dir, provider: str = "fixture") -> int:
    return main(["build-artists", "--provider", provider, "--out-dir", str(out_dir)])


@pytest.mark.parametrize("provider", sorted(COMMITTED_ARTISTS))
def test_committed_artists_are_up_to_date(tmp_path, provider):
    """A pasta versionada do modo por artista é exatamente o que o build-artists gera hoje, sem
    arquivo a mais nem a menos. Se falhar, regere com o build-artists do provedor."""
    fresh = tmp_path / "artists"
    assert _build_artists(fresh, provider) == 0
    committed = COMMITTED_ARTISTS[provider]
    assert sorted(p.name for p in fresh.iterdir()) == sorted(p.name for p in committed.iterdir())
    for path in fresh.iterdir():
        assert path.read_bytes() == (committed / path.name).read_bytes(), path.name


# Uma versão que não entra e escapou das regras do artists.py (como o "-Instrumental-" grudado
# e o "Tvsize" sem delimitador, vistos no PR B do M13, e o show com " - " no parêntese e o set
# de DJ, do System of a Down): a faixa publicada nunca fala nisso.
_OUT_IN_TITLE = re.compile(
    r"instrumental|karaoke|カラオケ|off\s*-?\s*vocal|tv\s*-?\s*size"
    r"|\blive\s+(?:at|in|from)\b|\(mixed\)|\[mixed\]|\bdj\s+mix\b",
    re.I,
)


@pytest.mark.parametrize("provider", sorted(COMMITTED_ARTISTS))
def test_published_artist_titles_are_not_out_versions(provider):
    files = [
        p for p in sorted(COMMITTED_ARTISTS[provider].glob("*.json")) if p.name != "index.json"
    ]
    assert files
    for path in files:
        for track in read_json(path)["tracks"]:
            assert not _OUT_IN_TITLE.search(track["title"]), (path.name, track["title"])


@pytest.mark.parametrize("seed", ["1", "2"])
def test_artist_bytes_do_not_depend_on_hash_seed(tmp_path, seed):
    out = tmp_path / f"artists-{seed}"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", "build-artists", "--provider", "fixture"]
    subprocess.run([*cmd, "--out-dir", str(out)], check=True, env=env, capture_output=True)
    reference = tmp_path / "reference"
    assert _build_artists(reference) == 0
    for path in reference.iterdir():
        assert (out / path.name).read_bytes() == path.read_bytes(), path.name


def test_build_artists_removes_orphans_and_refuses_another_dir(tmp_path, capsys):
    out = tmp_path / "artists"
    assert _build_artists(out) == 0  # a pasta passa a ter o índice: é uma pasta publicada
    (out / "saiu-da-lista.json").write_text("{}", encoding="utf-8")
    assert _build_artists(out) == 0
    assert not (out / "saiu-da-lista.json").exists()
    assert "1 órfão(s) apagado(s)" in capsys.readouterr().out
    # Numa pasta sem índice (um --out-dir errado, como a da curadoria), nada é apagado.
    other = tmp_path / "curadoria"
    other.mkdir()
    (other / "artists_fixture.json").write_text("{}", encoding="utf-8")
    assert _build_artists(other) == 0
    assert (other / "artists_fixture.json").exists()
    real = repo_root() / "web" / "public" / "data" / "artists"
    existed = real.exists()
    assert _build_artists(real) == 1
    assert "grava em" in capsys.readouterr().err
    assert real.exists() == existed


def test_validate_artists_command(tmp_path, capsys):
    assert main(["validate-artists", "--provider", "fixture"]) == 0
    out = tmp_path / "artists"
    _build_artists(out)
    (out / "ar01.json").write_bytes((out / "ar01.json").read_bytes() + b" ")
    assert main(["validate-artists", "--provider", "fixture", "--dir", str(out)]) == 1
    assert "canônica" in capsys.readouterr().err


def test_build_artists_warns_about_missing_romaji(tmp_path, monkeypatch, capsys):
    from musicle_pipeline import cli
    from musicle_pipeline.catalog import Curation

    monkeypatch.setattr(cli, "_artist_curation", lambda _provider: Curation())
    assert _build_artists(tmp_path / "artists") == 0
    assert "sem romaji; rode o romanize --artists" in capsys.readouterr().err
