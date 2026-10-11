"""AppleProvider: tradução da resposta aparada da Apple para o contrato neutro (sem rede)."""

from __future__ import annotations

from pathlib import Path

import pytest

from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import InputError
from musicle_pipeline.providers.apple import (
    AppleProvider,
    album_type,
    artwork_at,
    japan_date,
    store_url,
)

ART = "https://is1-ssl.mzstatic.com/image/thumb/Music/ab/cd/100x100bb.jpg"


def lookup(track_id: str, **over) -> dict:
    """Uma faixa como o fetch grava (campos aparados do iTunes lookup)."""
    base = {
        "trackId": track_id,
        "trackName": f"曲{track_id}",
        "artistId": "900",
        "artistName": "アーティスト",
        "collectionId": f"5{track_id}",
        "collectionName": f"曲{track_id} - Single",
        "releaseDate": "2026-09-01T07:00:00Z",
        "trackTimeMillis": 200000,
        "trackExplicitness": "notExplicit",
        "previewUrl": f"https://audio-ssl.itunes.apple.com/p/{track_id}.m4a",
        "artworkUrl100": ART,
        "trackViewUrl": f"https://music.apple.com/jp/album/x/5{track_id}?i={track_id}&uo=4",
    }
    return {**base, **over}


def write_snapshot(
    directory, day: str, tracks: list[dict], rss_ids: list[str] | None = None, artists=None
):
    rss_ids = rss_ids or [t["trackId"] for t in tracks]
    snapshot = {
        "provider": "apple",
        "storefront": "jp",
        "chart": "most-played/songs",
        "date": day,
        "fetchedAt": f"{day}T22:00:00Z",
        "rss": [{"id": i, "name": f"曲{i}", "artistName": "x"} for i in rss_ids],
        "tracks": {t["trackId"]: t for t in tracks},
        "artists": artists or {"900": {"artistName": "アーティスト"}},
        "missing": [i for i in rss_ids if i not in {t["trackId"] for t in tracks}],
    }
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{day}.json").write_bytes(dumps(snapshot).encode("utf-8"))


def only_track(tmp_path, artists=None, **over):
    write_snapshot(tmp_path, "2026-10-10", [lookup("1", **over)], artists=artists)
    return AppleProvider(tmp_path).snapshots()[0].entries[0].track


@pytest.mark.parametrize(
    ("name", "collection_artist", "kind"),
    [
        ("結び - Single", None, "single"),
        ("Brand New - EP", None, "ep"),
        ("Best", "Various Artists", "compilation"),
        ("Album", None, "album"),
    ],
)
def test_album_type_by_store_suffix(name, collection_artist, kind):
    assert album_type(name, collection_artist) == kind


def test_release_date_is_the_japan_day():
    # 15:00Z já é meia-noite do dia seguinte no Japão; cortar em UTC daria o dia anterior.
    assert japan_date("2026-10-09T15:00:00Z") == "2026-10-10"
    assert japan_date("2026-10-09T07:00:00Z") == "2026-10-09"


def test_artwork_size_is_rewritten_in_the_file_name():
    assert artwork_at(ART).endswith("/300x300bb.jpg")
    assert artwork_at("https://is1-ssl.mzstatic.com/x/other.png") == (
        "https://is1-ssl.mzstatic.com/x/other.png"
    )


def test_store_url_drops_only_the_tracking_parameter():
    url = "https://music.apple.com/jp/album/x/51?i=1&uo=4"
    assert store_url(url) == "https://music.apple.com/jp/album/x/51?i=1"


def test_track_fields_are_mapped(tmp_path):
    t = only_track(tmp_path, trackExplicitness="explicit")
    assert t.provider_id == "1"
    assert t.title == "曲1"
    assert t.album.title == "曲1 - Single"
    assert t.album.type == "single"
    assert t.album.release_date == "2026-09-01"
    assert t.album.artwork_url.endswith("/300x300bb.jpg")
    assert t.explicit is True
    assert t.duration_ms == 200000
    assert t.preview_url.endswith("/1.m4a")
    assert t.preview_duration_sec == 30
    assert t.store_url == "https://music.apple.com/jp/album/x/51?i=1"
    assert [a.name for a in t.artists] == ["アーティスト"]
    assert t.artist_display is None


def test_track_without_preview_has_no_duration(tmp_path):
    t = only_track(tmp_path, previewUrl=None)
    assert t.preview_url is None
    assert t.preview_duration_sec is None


def test_collaboration_keeps_the_canonical_artist_and_the_store_spelling(tmp_path):
    t = only_track(tmp_path, artistName="アーティスト & ゲスト")
    assert [a.name for a in t.artists] == ["アーティスト"]  # nome canônico do lookup do artista
    assert t.artist_display == "アーティスト & ゲスト"


def test_track_without_lookup_is_left_out_and_ranks_are_compacted(tmp_path):
    write_snapshot(tmp_path, "2026-10-10", [lookup("1"), lookup("3")], rss_ids=["1", "2", "3"])
    snap = AppleProvider(tmp_path).snapshots()[0]
    assert [(e.rank, e.track.provider_id) for e in snap.entries] == [(1, "1"), (2, "3")]
    assert snap.size == 2


def test_album_is_fixed_by_track_across_snapshots(tmp_path):
    write_snapshot(tmp_path, "2026-10-10", [lookup("1")])
    write_snapshot(tmp_path, "2026-10-17", [lookup("1", collectionId="777")])
    provider = AppleProvider(tmp_path)
    later = provider.snapshots()[1].entries[0].track
    assert later.album.provider_id == "51"
    assert any("mudou de álbum" in w for w in provider.warnings)


def test_snapshots_are_read_in_date_order(tmp_path):
    write_snapshot(tmp_path, "2026-10-17", [lookup("1")])
    write_snapshot(tmp_path, "2026-10-10", [lookup("1")])
    assert [s.date for s in AppleProvider(tmp_path).snapshots()] == ["2026-10-10", "2026-10-17"]


def test_file_name_must_match_the_date(tmp_path):
    write_snapshot(tmp_path, "2026-10-10", [lookup("1")])
    (tmp_path / "2026-10-10.json").rename(tmp_path / "2026-10-11.json")
    with pytest.raises(InputError, match="não bate"):
        AppleProvider(tmp_path).snapshots()


def test_no_snapshot_is_an_error(tmp_path):
    with pytest.raises(InputError, match="fetch"):
        AppleProvider(tmp_path / "vazio").snapshots()


def test_romanized_artist_lookup_becomes_the_latin_name(tmp_path):
    # O lookup de artista vem romanizado ("Kenshi Yonezu"); o nome exibido continua o japonês.
    t = only_track(tmp_path, artists={"900": {"artistName": "Artisuto"}})
    assert t.artists[0].name == "アーティスト"
    assert t.artists[0].name_latin == "Artisuto"
    assert t.artist_display is None


def test_real_sample_from_the_first_chart():
    """Amostra reduzida da parada real de 10/10/2026 (só metadados): regressão do mapeamento."""
    directory = Path(__file__).parent / "data" / "apple"
    snap = AppleProvider(directory).snapshots()[0]
    by_title = {e.track.title: e.track for e in snap.entries}
    assert [e.rank for e in snap.entries] == [1, 2, 3, 4, 5]
    assert by_title["結び"].album.type == "single"
    assert by_title["わたがし"].album.type == "ep"
    assert by_title["スパークル"].album.type == "album"
    assert by_title["SAD SONG"].explicit is True
    jane = by_title["JANE DOE"]
    assert [a.name for a in jane.artists] == ["米津玄師"]
    assert jane.artists[0].name_latin == "Kenshi Yonezu"
    assert jane.artist_display == "米津玄師 & 宇多田ヒカル"
    for t in by_title.values():
        assert t.store_url.startswith("https://music.apple.com/jp/") and "uo=" not in t.store_url
        assert "i=" in t.store_url
        assert t.preview_url.startswith("https://audio-ssl.itunes.apple.com/")
        assert t.album.artwork_url.endswith("/300x300bb.jpg")
