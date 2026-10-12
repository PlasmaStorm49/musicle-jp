"""fetch --artists (M13): busca de um artista com um transporte falso (nenhum teste usa a rede)."""

from __future__ import annotations

import json
import urllib.error
from urllib.parse import parse_qs, urlsplit

import pytest

from musicle_pipeline import cli, fetch
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.paths import ArtistPaths

NOW = "2026-10-12T15:00:00Z"
ARTIST = "77"


def song(track_id: int, album: int, artist: int = 77, name: str = "LiSA", **over) -> dict:
    return {
        "wrapperType": "track",
        "kind": "song",
        "trackId": track_id,
        "trackName": f"曲{track_id}",
        "artistId": artist,
        "artistName": name,
        "collectionId": album,
        "collectionName": f"盤{album}",
        "releaseDate": "2026-09-01T07:00:00Z",
        "trackTimeMillis": 200000,
        "previewUrl": f"https://audio-ssl.itunes.apple.com/p/{track_id}.m4a",
        "artworkUrl100": "https://is1-ssl.mzstatic.com/a/100x100bb.jpg",
        "trackViewUrl": f"https://music.apple.com/jp/album/x/1?i={track_id}&uo=4",
        **over,
    }


def artist(artist_id: int, name: str) -> dict:
    return {"wrapperType": "artist", "artistId": artist_id, "artistName": name}


def album(album_id: int, artist_id: int = 77) -> dict:
    return {"wrapperType": "collection", "collectionId": album_id, "artistId": artist_id}


class FakeArtistApple:
    """O lookup da Apple para um artista: músicas (com uma participação), álbuns (com uma
    coletânea de outro artista) e as músicas de cada álbum (com a faixa de um convidado)."""

    def __init__(self, albums: int = 2, head: dict | None = None, songs: list | None = None):
        self.urls: list[str] = []
        self.albums = [900 + i for i in range(albums)]
        self.head = head if head is not None else artist(77, "LiSA")
        self.songs = (
            songs
            if songs is not None
            else [
                song(1, 900),
                song(2, 901),
                song(3, 800, artist=55, name="Outro & LiSA"),  # participação
                {"wrapperType": "track", "kind": "music-video", "trackId": 4},
            ]
        )

    def __call__(self, url: str) -> bytes:
        self.urls.append(url)
        query = parse_qs(urlsplit(url).query)
        ids = query["id"][0].split(",")
        entity = query.get("entity", [None])[0]
        if entity == "song" and ids == [ARTIST]:
            results = [self.head, *self.songs]
        elif entity == "album":
            results = [self.head, *map(album, self.albums), album(990, artist_id=1)]
        elif entity == "song":
            results = []
            for a in ids:
                results.append({"wrapperType": "collection", "collectionId": int(a)})
                results.append(song(int(a) * 10, int(a)))
                results.append(song(int(a) * 10 + 1, int(a), artist=56, name="Convidado"))
        else:
            names = {"77": "LiSA", "55": "Outro", "56": "Convidado"}
            results = [artist(int(i), names.get(i, "X")) for i in ids]
        return json.dumps({"results": results}).encode()


def test_lookup_url_of_the_chart_does_not_change():
    # A parada usa o mesmo construtor: a URL dela (e o cache da Apple) continua a mesma.
    assert fetch._lookup_url(["2", "1"]) == "https://itunes.apple.com/lookup?id=1%2C2&country=jp"
    assert fetch._lookup_url(["7"], "song", 200) == (
        "https://itunes.apple.com/lookup?id=7&country=jp&entity=song&limit=200"
    )


def test_artist_snapshot_joins_songs_and_albums():
    apple, waits = FakeArtistApple(), []
    snap = fetch.fetch_artist_snapshot(ARTIST, NOW, transport=apple, sleep=waits.append)
    assert snap["artistId"] == ARTIST
    assert snap["artist"] == {"artistName": "LiSA"}
    # A ordem do lookup de músicas, com a participação e sem o clipe.
    assert snap["songs"] == ["1", "2", "3"]
    # Só os álbuns do artista: a coletânea de outro artista (990) fica de fora.
    assert snap["albums"] == ["900", "901"]
    # As músicas dos álbuns entram, sem a faixa do convidado.
    assert sorted(snap["tracks"]) == ["1", "2", "3", "9000", "9010"]
    assert set(snap["artists"]) == {"55", "77"}
    assert snap["tracks"]["1"]["trackId"] == "1"  # aparado como na parada
    assert "kind" not in snap["tracks"]["1"]
    # Uma pausa entre os pedidos: músicas, álbuns, 1 lote de álbuns e os artistas.
    assert waits == [fetch.PACE_SEC] * 3
    assert all("country=jp" in u for u in apple.urls)
    assert any("entity=album&limit=200" in u for u in apple.urls)


def test_album_songs_come_in_batches(monkeypatch):
    monkeypatch.setattr(fetch, "ALBUM_BATCH", 2)
    apple = FakeArtistApple(albums=5)
    fetch.fetch_artist_snapshot(ARTIST, NOW, transport=apple, sleep=lambda _s: None)
    batches = [u for u in apple.urls if "entity=song" in u and f"id={ARTIST}&" not in u]
    assert len(batches) == 3


@pytest.mark.parametrize(
    "head",
    [{}, artist(78, "Outra"), {"wrapperType": "artist", "artistId": 77, "artistName": " "}],
)
def test_refuses_a_lookup_without_the_artist_first(head):
    apple = FakeArtistApple(head=head)
    with pytest.raises(fetch.FetchError, match="não devolveu o artista"):
        fetch.fetch_artist_snapshot(ARTIST, NOW, transport=apple, sleep=lambda _s: None)


def test_refuses_an_artist_without_songs():
    apple = FakeArtistApple(songs=[])
    with pytest.raises(fetch.FetchError, match="nenhuma música"):
        fetch.fetch_artist_snapshot(ARTIST, NOW, transport=apple, sleep=lambda _s: None)


def test_refuses_an_odd_id():
    with pytest.raises(fetch.FetchError, match="inválido"):
        fetch.fetch_artist_snapshot("7&x=1", NOW, transport=FakeArtistApple())


# --- CLI ---


@pytest.fixture
def artists_dir(tmp_path, monkeypatch):
    curation = tmp_path / "artists"
    curation.mkdir()
    (curation / "artists.toml").write_text(
        f'[[artists]]\nid = "{ARTIST}"\n\n[[artists]]\nid = "88"\n', encoding="utf-8"
    )
    paths = ArtistPaths(
        artists=curation / "artists.toml",
        aliases=curation / "aliases.toml",
        romaji=curation / "romaji.json",
        source=curation / "snapshots",
        public_dir=tmp_path / "public",
    )
    monkeypatch.setattr(cli, "artist_paths", lambda _provider: paths)
    return paths


def run(*extra: str) -> int:
    return main(["fetch", "--provider", "apple", "--artists", "--fetched-at", NOW, *extra])


def test_cli_writes_one_snapshot_per_artist(artists_dir, monkeypatch):
    calls = []

    def fake(artist_id, fetched_at, wait_first=False):
        calls.append(artist_id)
        return {
            "artistId": artist_id,
            "fetchedAt": fetched_at,
            "tracks": {"1": {}},
            "albums": [],
            "songs": ["1"],
        }

    monkeypatch.setattr(fetch, "fetch_artist_snapshot", fake)
    assert run() == 0
    assert calls == [ARTIST, "88"]
    assert read_json(artists_dir.source / f"{ARTIST}.json")["artistId"] == ARTIST
    assert run("--artist", "88") == 0
    assert calls[-1] == "88"


def test_cli_keeps_the_old_snapshot_when_one_artist_fails(artists_dir, monkeypatch, capsys):
    old = artists_dir.source / "88.json"
    old.parent.mkdir(parents=True)
    old.write_bytes(dumps({"tracks": {"1": {}}}).encode("utf-8"))

    def fake(artist_id, fetched_at, wait_first=False):
        if artist_id == "88":
            raise fetch.FetchError("falha de rede")
        return {"tracks": {"1": {}}, "albums": [], "songs": ["1"]}

    monkeypatch.setattr(fetch, "fetch_artist_snapshot", fake)
    assert run() == 1
    assert "o snapshot anterior fica" in capsys.readouterr().err
    assert read_json(old) == {"tracks": {"1": {}}}
    assert (artists_dir.source / f"{ARTIST}.json").exists()  # o outro artista foi gravado


def test_cli_refuses_a_snapshot_that_shrank(artists_dir, monkeypatch, capsys):
    out = artists_dir.source / f"{ARTIST}.json"
    out.parent.mkdir(parents=True)
    out.write_bytes(dumps({"tracks": {str(i): {} for i in range(10)}}).encode("utf-8"))
    small = {"tracks": {"1": {}}, "albums": [], "songs": ["1"]}
    monkeypatch.setattr(fetch, "fetch_artist_snapshot", lambda _a, _f, **_k: small)
    assert run("--artist", ARTIST) == 1
    assert "use --force" in capsys.readouterr().err
    assert len(read_json(out)["tracks"]) == 10
    assert run("--artist", ARTIST, "--force") == 0
    assert len(read_json(out)["tracks"]) == 1


@pytest.mark.parametrize(
    ("args", "message"),
    [
        (["--artists", "--today", "2026-10-12"], "--today é da parada"),
        (["--artists", "--artist", "99"], "fora do artists.toml"),
        ([], "--today é obrigatório"),
        (["--today", "2026-10-12", "--artist", "77"], "só valem com --artists"),
    ],
)
def test_cli_refuses_odd_combinations(artists_dir, args, message, capsys):
    assert main(["fetch", "--provider", "apple", "--fetched-at", NOW, *args]) == 1
    assert message in capsys.readouterr().err


def test_network_failure_is_a_fetch_error():
    def down(_url: str) -> bytes:
        raise urllib.error.URLError("fora do ar")

    with pytest.raises(fetch.FetchError, match="falha de rede"):
        fetch.fetch_artist_snapshot(ARTIST, NOW, transport=down, sleep=lambda _s: None)


def test_waits_before_the_first_request_when_asked():
    # Do 2º artista em diante, a pausa vale também de um artista para o outro.
    waits: list[float] = []
    fetch.fetch_artist_snapshot(
        ARTIST, NOW, transport=FakeArtistApple(), sleep=waits.append, wait_first=True
    )
    assert waits == [fetch.PACE_SEC] * 4


def test_cli_pauses_between_artists(artists_dir, monkeypatch):
    seen = []

    def fake(artist_id, fetched_at, wait_first=False):
        seen.append(wait_first)
        return {"tracks": {"1": {}}, "albums": [], "songs": ["1"]}

    monkeypatch.setattr(fetch, "fetch_artist_snapshot", fake)
    assert run() == 0
    assert seen == [False, True]


def test_albums_come_sorted():
    apple = FakeArtistApple(albums=3)
    apple.albums.reverse()  # a Apple pode mudar a ordem: os lotes e o diff, não
    snap = fetch.fetch_artist_snapshot(ARTIST, NOW, transport=apple, sleep=lambda _s: None)
    assert snap["albums"] == ["900", "901", "902"]


def test_cli_warns_at_the_limit_and_does_not_repeat_artists(artists_dir, monkeypatch, capsys):
    calls = []
    full = {"tracks": {"1": {}}, "albums": [], "songs": [str(i) for i in range(fetch.ARTIST_LIMIT)]}

    def fake(artist_id, fetched_at, wait_first=False):
        calls.append(artist_id)
        return full

    monkeypatch.setattr(fetch, "fetch_artist_snapshot", fake)
    assert run("--artist", ARTIST, "--artist", ARTIST) == 0
    assert calls == [ARTIST]
    assert "veio no limite" in capsys.readouterr().err


def test_cli_survives_an_old_snapshot_without_tracks(artists_dir, monkeypatch):
    out = artists_dir.source / f"{ARTIST}.json"
    out.parent.mkdir(parents=True)
    out.write_bytes(dumps({"velho": True}).encode("utf-8"))
    new = {"tracks": {"1": {}}, "albums": [], "songs": ["1"]}
    monkeypatch.setattr(fetch, "fetch_artist_snapshot", lambda _a, _f, **_k: new)
    assert run("--artist", ARTIST) == 0
    assert read_json(out) == new
