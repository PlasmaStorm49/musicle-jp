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

    def __init__(
        self, n: int = 60, skip: set[str] = frozenset(), per: dict | None = None, **over
    ) -> None:
        # over vale para todas as faixas; per, só para a faixa de cada id.
        self.n, self.skip, self.over, self.urls = n, skip, over, []
        self.per = per or {}

    def __call__(self, url: str) -> bytes:
        self.urls.append(url)
        if url.startswith("https://rss.marketingtools.apple.com/"):
            return rss(self.n)
        ids = parse_qs(urlsplit(url).query)["id"][0].split(",")
        if ids == ["9"]:
            return json.dumps(
                {"results": [{"wrapperType": "artist", "artistId": 9, "artistName": "Aa"}]}
            ).encode()
        results = [
            track(i, **{**self.over, **self.per.get(i, {})}) for i in ids if i not in self.skip
        ]
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


def test_too_many_items_is_refused():
    # O robô semanal recusaria a parada no PR (mais de 100) e travaria a agenda: recusa aqui.
    with pytest.raises(fetch.FetchError, match="o máximo é 100"):
        fetch.fetch_snapshot(TODAY, NOW, transport=FakeApple(n=101), sleep=no_sleep)


def test_too_many_tracks_without_lookup_is_refused():
    skip = {str(i) for i in range(20)}  # 20 de 60 = 33%
    with pytest.raises(fetch.FetchError, match="sem lookup"):
        fetch.fetch_snapshot(TODAY, NOW, transport=FakeApple(skip=skip), sleep=no_sleep)


def test_a_few_tracks_without_lookup_are_listed():
    snap = fetch.fetch_snapshot(TODAY, NOW, transport=FakeApple(skip={"3"}), sleep=no_sleep)
    assert snap["missing"] == ["3"]
    assert "3" not in snap["tracks"]


def test_one_unexpected_host_counts_as_missing_lookup():
    # Recusar a parada inteira por uma faixa a congelaria até alguém mudar o código.
    apple = FakeApple(per={"3": {"previewUrl": "https://evil.example/p.m4a"}})
    snap = fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)
    assert snap["missing"] == ["3"]
    assert "3" not in snap["tracks"]


def test_unexpected_host_everywhere_is_refused():
    # A Apple trocou de host para todas: mais de 20% sem lookup, nada é gravado.
    apple = FakeApple(previewUrl="https://evil.example/p.m4a")
    with pytest.raises(fetch.FetchError, match="sem lookup"):
        fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)


@pytest.mark.parametrize(
    "release", ["2026-02-30T07:00:00Z", "2026-10-01T24:00:00Z", "２０２６-10-01T07:00:00Z"]
)
def test_impossible_release_date_counts_as_missing_lookup(release):
    # A regex aceitaria 30/02 e 24:00; o provedor quebraria depois, ao converter a data.
    apple = FakeApple(per={"4": {"releaseDate": release}})
    snap = fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)
    assert snap["missing"] == ["4"]


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
    # Os comandos de todo dia, nos dois provedores: nenhum pode carregar o módulo de rede.
    fixture_out, real_out, schedule_out = (tmp_path / n for n in ("f.json", "r.json", "s.json"))
    artists_out = tmp_path / "artists"
    build_artists = ["build-artists", "--provider", "fixture", "--out-dir", str(artists_out)]
    build_anime = ["build-anime", "--provider", "fixture", "--out", str(tmp_path / "anime.json")]
    lab_chances = [
        "anime-chances",
        "--provider",
        "fixture",
        "--out",
        str(tmp_path / "chances.json"),
    ]
    schedule_anime = ["schedule-anime", "--provider", "fixture", "--today", "2026-10-10"]
    schedule_anime += ["--epoch", "2026-10-10", "--out", str(tmp_path / "anime-schedule.json")]
    schedule = [
        "schedule",
        "--catalog",
        "web/public/fixtures/catalog.json",
        "--out",
        str(schedule_out),
        "--today",
        "2026-10-10",
        "--epoch",
        "2026-10-10",
    ]
    code = (
        "import sys\n"
        "from musicle_pipeline.cli import main\n"
        f"assert main(['build', '--provider', 'fixture', '--out', {str(fixture_out)!r}]) == 0\n"
        f"assert main(['build', '--provider', 'apple', '--out', {str(real_out)!r}]) == 0\n"
        "assert main(['romanize', '--provider', 'fixture', '--check']) == 0\n"
        "assert main(['romanize', '--provider', 'apple', '--check']) == 0\n"
        "assert main(['validate', 'web/public/data/catalog.json']) == 0\n"
        f"assert main({schedule!r}) == 0\n"
        # O modo por artista (M13): só o fetch --artists usa a rede.
        "assert main(['romanize', '--provider', 'fixture', '--artists', '--check']) == 0\n"
        f"assert main({build_artists!r}) == 0\n"
        "assert main(['validate-artists', '--provider', 'fixture']) == 0\n"
        # O Anime (M14): só o fetch --anime usa a rede.
        f"assert main({build_anime!r}) == 0\n"
        "assert main(['validate-anime', '--provider', 'fixture']) == 0\n"
        f"assert main({schedule_anime!r}) == 0\n"
        # As Misturadas (M17): o horizonte não passa da agenda fictícia, e nada é gravado.
        "assert main(['schedule-mixed', '--provider', 'fixture', '--today', '2026-10-08']) == 0\n"
        # O laboratório das Misturadas (M17): a chance de cada música, também sem rede.
        f"assert main({lab_chances!r}) == 0\n"
        # O ranking do MAL (M14, PR B) também usa a rede: só o fetch --anime o carrega.
        "print(any(m in sys.modules for m in ('musicle_pipeline.fetch', 'musicle_pipeline.mal_ranking')))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8", check=True
    )
    assert result.stdout.strip().splitlines()[-1] == "False"


def test_ids_beyond_the_batch_size_are_split(monkeypatch):
    # A parada tem no máximo 100 itens (MAX_ITEMS) e o lote é de 200: com o lote menor, o corte
    # em lotes continua testado.
    monkeypatch.setattr(fetch, "LOOKUP_BATCH", 40)
    apple = FakeApple(n=60)
    snap = fetch.fetch_snapshot(TODAY, NOW, transport=apple, sleep=no_sleep)
    track_lookups = [u for u in apple.urls if u.startswith(fetch.LOOKUP_URL) and "%2C" in u]
    sizes = [len(parse_qs(urlsplit(u).query)["id"][0].split(",")) for u in track_lookups]
    assert sizes[:2] == [40, 20]
    assert len(snap["tracks"]) == 60


def test_timeout_is_retried():
    apple, failures = FakeApple(), [1]

    def slow(url: str) -> bytes:
        if failures[0]:
            failures[0] -= 1
            raise TimeoutError("lento")
        return apple(url)

    assert fetch.fetch_snapshot(TODAY, NOW, transport=slow, sleep=no_sleep)["rss"]


@pytest.mark.parametrize(
    ("code", "retried"), [(404, False), (403, False), (429, True), (503, True)]
)
def test_http_errors_retry_only_when_they_can_pass(code, retried):
    calls = []

    def failing(url: str) -> bytes:
        calls.append(url)
        raise urllib.error.HTTPError(url, code, "erro", {}, None)

    with pytest.raises(fetch.FetchError):
        fetch.fetch_snapshot(TODAY, NOW, transport=failing, sleep=no_sleep)
    assert len(calls) == (3 if retried else 1)


def test_invalid_json_is_a_fetch_error():
    with pytest.raises(fetch.FetchError, match="JSON inválido"):
        fetch.fetch_snapshot(TODAY, NOW, transport=lambda _url: b"<html>", sleep=no_sleep)


def test_lookup_with_unexpected_shape_is_a_fetch_error():
    apple = FakeApple()

    def broken(url: str) -> bytes:
        return apple(url) if "rss." in url else json.dumps({"results": None}).encode()

    with pytest.raises(fetch.FetchError, match="forma inesperada"):
        fetch.fetch_snapshot(TODAY, NOW, transport=broken, sleep=no_sleep)


def test_repeated_rss_ids_keep_the_first_position():
    def repeated(url: str) -> bytes:
        if url.startswith("https://rss."):
            results = [{"id": str(i % 55), "name": "x"} for i in range(60)]  # 55..59 repetem
            return json.dumps({"feed": {"results": results}}).encode()
        return FakeApple()(url)

    snap = fetch.fetch_snapshot(TODAY, NOW, transport=repeated, sleep=no_sleep)
    ids = [r["id"] for r in snap["rss"]]
    assert len(ids) == len(set(ids)) == 55


def test_rss_id_that_is_not_a_number_is_refused():
    def odd(url: str) -> bytes:
        results = [{"id": f"x{i}", "name": "x"} for i in range(60)]
        return json.dumps({"feed": {"results": results}}).encode()

    with pytest.raises(fetch.FetchError, match="forma inesperada"):
        fetch.fetch_snapshot(TODAY, NOW, transport=odd, sleep=no_sleep)


def test_lookup_with_a_wrong_type_counts_as_missing():
    apple = FakeApple()

    def one_bad(url: str) -> bytes:
        body = json.loads(apple(url))
        for r in body.get("results", []):
            if r.get("trackId") == 3:
                r["releaseDate"] = "ontem"
        return json.dumps(body).encode()

    snap = fetch.fetch_snapshot(TODAY, NOW, transport=one_bad, sleep=no_sleep)
    assert snap["missing"] == ["3"]


def test_http_get_refuses_a_response_over_the_limit(monkeypatch):
    class Big:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def read(self, size):
            return b"x" * size

    monkeypatch.setattr(fetch.urllib.request, "urlopen", lambda *_a, **_k: Big())
    with pytest.raises(fetch.FetchError, match="maior que"):
        fetch.http_get("https://itunes.apple.com/lookup?id=1")


# --- ME50 e ME53: o lookup de artista e o id do RSS com as mesmas regras das faixas ---


@pytest.mark.parametrize(
    "artist",
    [
        {"wrapperType": "artist", "artistId": 9, "artistName": 123},  # nome que não é texto
        {"wrapperType": "artist", "artistId": 9, "artistName": "   "},  # nome em branco
        {"wrapperType": "artist", "artistId": "9a", "artistName": "Aa"},  # id torto
        {"wrapperType": "artist", "artistId": 8, "artistName": "Aa"},  # id fora do lote
    ],
)
def test_an_odd_artist_lookup_is_left_out(artist):
    # Um valor torto gravado no snapshot (que nunca muda) quebraria o build para sempre: o
    # artista fica sem latino, e a parada segue.
    apple = FakeApple()

    def odd(url: str) -> bytes:
        ids = parse_qs(urlsplit(url).query).get("id", [""])[0].split(",")
        if ids == ["9"]:
            return json.dumps({"results": [artist]}).encode()
        return apple(url)

    snap = fetch.fetch_snapshot(TODAY, NOW, transport=odd, sleep=no_sleep)
    assert snap["artists"] == {}
    assert snap["missing"] == []


def test_rss_id_with_digits_of_another_script_is_refused():
    # \d casaria "١٢" (dígitos árabes); o id vai para a URL e para o nome dos arquivos. Só o
    # RSS é torto: o lookup responde como a Apple, para a recusa ser mesmo a do id.
    apple = FakeApple()

    def arabic(url: str) -> bytes:
        if not url.startswith("https://rss.marketingtools.apple.com/"):
            return apple(url)
        results = [{"id": f"{i}", "name": "x"} for i in range(59)] + [{"id": "١٢", "name": "x"}]
        return json.dumps({"feed": {"results": results}}).encode()

    with pytest.raises(fetch.FetchError, match="forma inesperada"):
        fetch.fetch_snapshot(TODAY, NOW, transport=arabic, sleep=no_sleep)
