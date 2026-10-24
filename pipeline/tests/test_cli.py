from __future__ import annotations

import copy
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date

import pytest

from musicle_pipeline.anime_schedule import generate_anime
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.paths import anime_paths, artist_paths, known_schedules, repo_root

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


# --- o despacho do schedule-check pelo tipo da agenda (o Anime, M14) ---

ANIME = anime_paths("fixture").public_dir


def test_known_schedules_are_the_hits_and_the_anime_ones():
    found = [(p.relative_to(repo_root()).as_posix(), kind) for p, kind in known_schedules()]
    assert found == [
        ("web/public/fixtures/schedule.json", "hits"),
        ("web/public/data/schedule.json", "hits"),
        ("web/public/fixtures/anime/schedule.json", "anime"),
        ("web/public/data/anime/schedule.json", "anime"),
        ("web/public/fixtures/anime/mixed.json", "anime-mixed"),
        ("web/public/data/anime/mixed.json", "anime-mixed"),
    ]


def _anime_check(tmp_path, current) -> list[str]:
    """O schedule-check de uma agenda do Anime avulsa (o tipo sai do conteúdo), com uma base de
    5 dias e o catálogo fictício do Anime."""
    catalog = read_json(ANIME / "catalog.json")
    base = generate_anime(catalog, None, date(2026, 10, 8), date(2026, 10, 8), horizon=4)
    (tmp_path / "base.json").write_bytes(dumps(base.schedule).encode("utf-8"))
    (tmp_path / "schedule.json").write_bytes(dumps(current).encode("utf-8"))
    return [
        "schedule-check",
        *("--path", str(tmp_path / "schedule.json"), "--base", str(tmp_path / "base.json")),
        *("--catalog", str(ANIME / "catalog.json"), "--today", "2026-10-13"),
    ]


def _anime_grown() -> dict:
    catalog = read_json(ANIME / "catalog.json")
    base = generate_anime(catalog, None, date(2026, 10, 8), date(2026, 10, 8), horizon=4)
    return generate_anime(catalog, base.schedule, date(2026, 10, 13), horizon=3).schedule


def test_schedule_check_regenerates_the_anime_days_with_the_anime_generator(tmp_path, capsys):
    grown = _anime_grown()
    assert main(_anime_check(tmp_path, grown)) == 0
    assert "OK (5 dia(s) da base preservados, 9 no total)" in capsys.readouterr().out
    # Um dia novo editado à mão: só o gerador do Anime, com o catálogo dele, percebe.
    edited = copy.deepcopy(grown)
    rounds = edited["days"]["2026-10-14"]["titulo"]
    rounds["facil"][0], rounds["facil"][1] = rounds["facil"][1], rounds["facil"][0]
    assert main(_anime_check(tmp_path, edited)) == 1
    assert "2026-10-14: dia novo diferente do que o gerador daria" in capsys.readouterr().out


def test_schedule_check_refuses_a_changed_anime_day(tmp_path, capsys):
    edited = copy.deepcopy(_anime_grown())
    rounds = edited["days"]["2026-10-09"]["musica"]
    rounds["medio"][0], rounds["medio"][2] = rounds["medio"][2], rounds["medio"][0]
    del edited["days"]["2026-10-10"]
    assert main(_anime_check(tmp_path, edited)) == 1
    out = capsys.readouterr().out
    assert "2026-10-09: dia alterado" in out and "2026-10-10: dia removido" in out
    # O tipo da agenda também é cabeçalho: tirá-lo quebra o só-acréscimo.
    plain = {k: v for k, v in _anime_grown().items() if k != "kind"}
    assert main(_anime_check(tmp_path, plain)) == 1
    assert "kind mudou: 'anime' → None" in capsys.readouterr().out


def test_the_one_time_redo_accepts_only_its_day_before_it_comes(tmp_path, capsys, monkeypatch):
    # A exceção de uma vez à regra 4 (o 24/10 do Anime real): o dia listado pode mudar enquanto
    # não chegou; o mesmo dia depois de chegar, ou outro dia, continua recusado.
    edited = copy.deepcopy(_anime_grown())
    rounds = edited["days"]["2026-10-12"]["musica"]
    rounds["medio"][0], rounds["medio"][2] = rounds["medio"][2], rounds["medio"][0]
    args = _anime_check(tmp_path, edited)
    redo = {(str(tmp_path / "schedule.json"), "2026-10-12")}
    monkeypatch.setattr("musicle_pipeline.cli._REDONE_DAYS", redo)
    assert main([*args[:-1], "2026-10-11"]) == 0
    assert main(args) == 1  # o --today 2026-10-13: o dia já passou
    assert "2026-10-12: dia alterado" in capsys.readouterr().out
    other = copy.deepcopy(_anime_grown())
    other["days"]["2026-10-11"]["musica"]["medio"].reverse()
    assert main([*_anime_check(tmp_path, other)[:-1], "2026-10-10"]) == 1
    assert "2026-10-11: dia alterado" in capsys.readouterr().out


def test_a_new_fixture_schedule_may_be_born_with_past_days(tmp_path, capsys):
    # A agenda fictícia do Anime nasce com as datas da dos Hits (as do e2e), que já passaram:
    # ninguém a joga. Fora das fixtures, a mesma agenda nova com dias passados quebra (P44).
    args = ["--base", str(tmp_path / "base.json"), "--today", "2026-10-21"]
    assert main(["schedule-check", "--path", str(ANIME / "schedule.json"), *args]) == 0
    assert "agenda fictícia nova; o --today não vale" in capsys.readouterr().out
    loose = tmp_path / "schedule.json"
    loose.write_bytes((ANIME / "schedule.json").read_bytes())
    assert main(["schedule-check", "--path", str(loose), *args]) == 1
    assert "2026-10-08: dia novo antes de hoje (2026-10-21), P44" in capsys.readouterr().out
    # Depois de criada (com base), a agenda fictícia volta a seguir a P44 (revisor do A2).
    fixture = read_json(ANIME / "schedule.json")
    base = tmp_path / "base5.json"
    days = sorted(fixture["days"])[:5]
    base.write_text(
        json.dumps({**fixture, "days": {d: fixture["days"][d] for d in days}}), encoding="utf-8"
    )
    grown = ["--base", str(base), "--today", "2026-10-21"]
    assert main(["schedule-check", "--path", str(ANIME / "schedule.json"), *grown]) == 1
    assert "dia novo antes de hoje (2026-10-21), P44" in capsys.readouterr().out


@pytest.mark.skipif(shutil.which("git") is None, reason="git não está no PATH")
def test_the_default_schedule_check_covers_every_schedule(capsys):
    # As dos Hits continuam com o resultado de antes; as do Anime (a fictícia e, desde a carga de
    # teste, C1, a real) entram com o gerador delas.
    assert main(["schedule-check", "--base-ref", "HEAD"]) == 0
    out = capsys.readouterr().out
    for path in (
        repo_root() / "web" / "public" / "fixtures" / "schedule.json",
        repo_root() / "web" / "public" / "data" / "schedule.json",
        ANIME / "schedule.json",
        anime_paths("apple").public_dir / "schedule.json",
        # As Misturadas (M17): a fictícia; a real nasce depois da carga C3.
        ANIME / "mixed.json",
    ):
        assert f"{path}: OK (" in out


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
