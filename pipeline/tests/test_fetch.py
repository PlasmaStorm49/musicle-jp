"""fetch: busca da parada real com um transporte falso (nenhum teste usa a rede)."""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
from datetime import date
from urllib.parse import parse_qs, urlsplit

import pytest

from musicle_pipeline import cli, fetch
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json

TODAY = date(2026, 10, 10)
NOW = "2026-10-10T22:00:00Z"


def rss(n: int) -> bytes:
    results = [
        {"id": str(i), "name": f"曲{i}", "artistName": "A", "artistId": "9"} for i in range(n)
    ]
    return json.dumps({"feed": {"results": results}}).encode()


def track(i: str, **over) -> dict:
    base = {
        "wrapperType": "track",
        "kind": "song",
        "trackId": int(i),
        "trackName": f"曲{i}",
        "artistId": 9,
        "artistName": "A",
        "collectionId": 500 + int(i),
        "collectionName": "C - Single",
        "releaseDate": "2026-09-01T07:00:00Z",
        "trackTimeMillis": 200000,
        "previewUrl": f"https://audio-ssl.itunes.apple.com/p/{i}.m4a",
        "artworkUrl100": "https://is1-ssl.mzstatic.com/a/100x100bb.jpg",
        "trackViewUrl": f"https://music.apple.com/jp/album/x/1?i={i}&uo=4",
        "trackPrice": 255,  # campo que o fetch descarta
    }
    return {**base, **over}


class FakeApple:
    """Responde como a Apple: RSS, lookup de faixas e de artistas. Guarda as URLs pedidas."""

    def __init__(self, n: int = 60, skip: set[str] = frozenset(), **over) -> None:
        self.n, self.skip, self.over, self.urls = n, skip, over, []

    def __call__(self, url: str) -> bytes:
        self.urls.append(url)
        if url.startswith("https://rss.marketingtools.apple.com/"):
            return rss(self.n)
        ids = parse_qs(urlsplit(url).query)["id"][0].split(",")
        if ids == ["9"]:
            return json.dumps(
                {"results": [{"wrapperType": "artist", "artistId": 9, "artistName": "Aa"}]}
            ).encode()
        results = [track(i, **self.over) for i in ids if i not in self.skip]
        return json.dumps({"results": results}).encode()


def no_sleep(_seconds: float) -> None:
    pass


def test_snapshot_keeps_only_the_used_fields():
    apple = FakeApple()
    snap = fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)
    assert (snap["provider"], snap["date"], snap["fetchedAt"]) == ("apple", "2026-10-10", NOW)
    assert [r["id"] for r in snap["rss"]] == [str(i) for i in range(60)]
    t = snap["tracks"]["7"]
    assert t["trackId"] == "7" and t["collectionId"] == "507"
    assert "trackPrice" not in t and "wrapperType" not in t
    assert snap["artists"] == {"9": {"artistName": "Aa"}}
    assert snap["missing"] == []


def test_lookup_uses_japan_store_sorted_ids_and_never_touches_audio():
    apple = FakeApple()
    fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)
    lookups = [u for u in apple.urls if u.startswith(fetch.LOOKUP_URL)]
    first = parse_qs(urlsplit(lookups[0]).query)
    assert first["country"] == ["jp"]
    ids = first["id"][0].split(",")
    assert ids == sorted(ids)
    assert not [u for u in apple.urls if "audio-ssl" in u or u.endswith(".m4a")]


def test_too_few_items_is_refused():
    with pytest.raises(fetch.FetchError, match="menos de 50"):
        fetch.fetch_snapshot(TODAY, NOW, transport=FakeApple(n=10), sleep=no_sleep)


def test_too_many_tracks_without_lookup_is_refused():
    skip = {str(i) for i in range(20)}  # 20 de 60 = 33%
    with pytest.raises(fetch.FetchError, match="sem lookup"):
        fetch.fetch_snapshot(TODAY, NOW, transport=FakeApple(skip=skip), sleep=no_sleep)


def test_a_few_tracks_without_lookup_are_listed():
    snap = fetch.fetch_snapshot(TODAY, NOW, transport=FakeApple(skip={"3"}), sleep=no_sleep)
    assert snap["missing"] == ["3"]
    assert "3" not in snap["tracks"]


def test_unexpected_host_is_refused():
    apple = FakeApple(previewUrl="https://evil.example/p.m4a")
    with pytest.raises(fetch.FetchError, match="host inesperado"):
        fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)


def test_network_errors_are_retried_with_growing_waits():
    apple, waits, failures = FakeApple(), [], [2]

    def flaky(url: str) -> bytes:
        if failures[0]:
            failures[0] -= 1
            raise urllib.error.URLError("caiu")
        return apple(url)

    fetch.fetch_snapshot(TODAY, NOW, transport=flaky, sleep=waits.append)
    assert waits == [5, 10]


def test_network_failure_after_all_tries():
    def down(_url: str) -> bytes:
        raise urllib.error.URLError("fora do ar")

    with pytest.raises(fetch.FetchError, match="falha de rede"):
        fetch.fetch_snapshot(TODAY, NOW, transport=down, sleep=no_sleep)


@pytest.fixture
def snapshots_dir(tmp_path, monkeypatch):
    directory = tmp_path / "snapshots"
    monkeypatch.setattr(cli, "apple_snapshots_dir", lambda: directory)
    return directory


def run_fetch(today: str = "2026-10-10") -> int:
    return main(["fetch", "--provider", "apple", "--today", today, "--fetched-at", NOW])


def test_cli_writes_the_snapshot(snapshots_dir, monkeypatch):
    monkeypatch.setattr(fetch, "http_get", FakeApple())
    assert run_fetch() == 0
    assert read_json(snapshots_dir / "2026-10-10.json")["date"] == "2026-10-10"


def test_cli_does_nothing_when_today_already_exists(snapshots_dir, capsys):
    snapshots_dir.mkdir()
    (snapshots_dir / "2026-10-10.json").write_text("{}", encoding="utf-8")
    assert run_fetch() == 0
    assert "já existe" in capsys.readouterr().out


def test_cli_refuses_a_date_before_the_last_snapshot(snapshots_dir, capsys):
    snapshots_dir.mkdir()
    (snapshots_dir / "2026-10-17.json").write_text("{}", encoding="utf-8")
    assert run_fetch() == 1
    assert "não é posterior" in capsys.readouterr().err


def test_cli_skips_an_unchanged_chart(snapshots_dir, monkeypatch, capsys):
    monkeypatch.setattr(fetch, "http_get", FakeApple())
    snapshots_dir.mkdir()
    previous = fetch.fetch_snapshot(date(2026, 10, 3), NOW)
    (snapshots_dir / "2026-10-03.json").write_bytes(dumps(previous).encode("utf-8"))
    assert run_fetch() == 0
    assert "parada igual" in capsys.readouterr().out
    assert not (snapshots_dir / "2026-10-10.json").exists()


def test_other_commands_never_import_the_network_module(tmp_path):
    out = tmp_path / "catalog.json"
    code = (
        "import sys\n"
        "from musicle_pipeline.cli import main\n"
        f"assert main(['build', '--provider', 'fixture', '--out', {str(out)!r}]) == 0\n"
        "assert main(['romanize', '--provider', 'fixture', '--check']) == 0\n"
        "print('musicle_pipeline.fetch' in sys.modules)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8", check=True
    )
    assert result.stdout.strip().splitlines()[-1] == "False"
