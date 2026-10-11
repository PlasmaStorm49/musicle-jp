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
    is_apple_url,
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


def _artists(track_id: str, tmp_path, tracks: list[dict], artists: dict) -> list[str]:
    write_snapshot(tmp_path, "2026-10-10", tracks, artists=artists)
    snap = AppleProvider(tmp_path).snapshots()[0]
    track = next(e.track for e in snap.entries if e.track.provider_id == track_id)
    return [a.provider_id for a in track.artists]


def test_collaboration_links_partners_that_are_known_artists(tmp_path):
    # JANE DOE (米津玄師 & 宇多田ヒカル): o lookup traz o id do 1º nome; o 2º vira parceiro porque
    # tem faixa própria. O 1º continua em 1º (o songKey usa o 1º id e não pode mudar).
    tracks = [
        lookup("1", artistId="530", artistName="米津玄師 & 宇多田ヒカル", trackName="JANE DOE"),
        lookup("2", artistId="187", artistName="宇多田ヒカル", trackName="First Love"),
    ]
    artists = {"530": {"artistName": "Kenshi Yonezu"}, "187": {"artistName": "Hikaru Utada"}}
    assert _artists("1", tmp_path, tracks, artists) == ["530", "187"]


def test_partner_in_the_title_and_unknown_partners(tmp_path):
    # "(feat. …)" no título também conta; nome sem faixa própria (sem id) fica de fora.
    tracks = [
        lookup("1", artistId="64", trackName="777 (feat. Awich, ONE OK ROCK & Paledusk)"),
        lookup("2", artistId="252", artistName="ONE OK ROCK"),
    ]
    artists = {"64": {"artistName": "YAO"}, "252": {"artistName": "ONE OK ROCK"}}
    tracks[0]["artistName"] = "YAO"
    assert _artists("1", tmp_path, tracks, artists) == ["64", "252"]


def test_partner_only_in_the_title_keeps_the_store_spelling(tmp_path):
    # Sem a grafia da loja, o catálogo juntaria os nomes: "YAO & ONE OK ROCK", que a loja não usa.
    tracks = [
        lookup("1", artistId="64", artistName="YAO", trackName="777 (feat. ONE OK ROCK)"),
        lookup("2", artistId="252", artistName="ONE OK ROCK"),
    ]
    write_snapshot(
        tmp_path,
        "2026-10-10",
        tracks,
        artists={"64": {"artistName": "YAO"}, "252": {"artistName": "ONE OK ROCK"}},
    )
    snap = AppleProvider(tmp_path).snapshots()[0]
    assert snap.entries[0].track.artist_display == "YAO"
    assert snap.entries[1].track.artist_display is None  # solo: nada a guardar


@pytest.mark.parametrize(
    ("credit", "title"),
    [
        ("アーティスト & Love", "曲1"),  # "=LOVE" na chave frouxa viraria "love"
        ("アーティスト", "曲1 (with =LOVE)"),  # "(with …)" é letra mais vezes que crédito
        ("アーティスト & A", "曲1"),  # chave de 1 caractere casaria por acaso
    ],
)
def test_partner_needs_a_strict_match(tmp_path, credit, title):
    tracks = [
        lookup("1", artistName=credit, trackName=title),
        lookup("2", artistId="127", artistName="=LOVE"),
        lookup("3", artistId="8", artistName="A"),
    ]
    artists = {"900": {"artistName": "アーティスト"}, "127": {"artistName": "=LOVE"}}
    assert _artists("1", tmp_path, tracks, artists) == ["900"]


def test_partner_shared_by_two_artists_is_left_out_with_a_warning(tmp_path):
    tracks = [
        lookup("1", artistName="アーティスト & ミク"),
        lookup("2", artistId="11", artistName="ミク"),
        lookup("3", artistId="12", artistName="ミク"),
    ]
    write_snapshot(tmp_path, "2026-10-10", tracks, artists={})
    provider = AppleProvider(tmp_path)
    first = provider.snapshots()[0].entries[0].track
    assert [a.provider_id for a in first.artists] == ["900"]
    assert provider.warnings == ["parceiro 'ミク' é nome de mais de um artista: ficou sem ligação"]


def test_partner_known_only_from_a_later_snapshot_links_the_earlier_days(tmp_path):
    # Duas passadas: o resultado não depende da ordem em que cada artista apareceu. O parceiro
    # vale pelo registro mais novo (o latino de 17/10), o mesmo que fica no catálogo.
    write_snapshot(
        tmp_path,
        "2026-10-10",
        [lookup("1", artistId="530", artistName="米津玄師 & 宇多田ヒカル")],
        artists={"530": {"artistName": "Kenshi Yonezu"}},
    )
    write_snapshot(
        tmp_path,
        "2026-10-17",
        [lookup("2", artistId="187", artistName="宇多田ヒカル")],
        artists={"187": {"artistName": "Hikaru Utada"}},
    )
    first = AppleProvider(tmp_path).snapshots()[0].entries[0].track
    assert [(a.provider_id, a.name_latin) for a in first.artists] == [
        ("530", "Kenshi Yonezu"),
        ("187", "Hikaru Utada"),
    ]


def test_partner_matches_by_latin_name_and_from_an_earlier_snapshot(tmp_path):
    # O parceiro aparece pelo nome latino, e só tinha faixa própria num snapshot anterior.
    write_snapshot(
        tmp_path,
        "2026-10-10",
        [lookup("2", artistId="187", artistName="宇多田ヒカル")],
        artists={"187": {"artistName": "Hikaru Utada"}},
    )
    write_snapshot(
        tmp_path,
        "2026-10-17",
        [lookup("1", artistId="530", artistName="米津玄師 & Hikaru Utada")],
        artists={"530": {"artistName": "Kenshi Yonezu"}},
    )
    last = AppleProvider(tmp_path).snapshots()[-1]
    assert [a.provider_id for a in last.entries[0].track.artists] == ["530", "187"]


def test_impossible_release_date_in_an_old_snapshot_is_an_input_error(tmp_path):
    write_snapshot(tmp_path, "2026-10-10", [lookup("1", releaseDate="2026-02-30T07:00:00Z")])
    with pytest.raises(InputError, match="releaseDate inválida"):
        AppleProvider(tmp_path).snapshots()


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


@pytest.mark.parametrize(
    ("kind", "url", "ok"),
    [
        ("store", "https://music.apple.com/jp/album/x/1?i=2", True),
        ("store", "javascript:alert(1)", False),
        ("store", "http://music.apple.com/jp/album/x/1", False),
        ("store", "https://music.apple.com.evil.example/x", False),
        ("store", "https://evil@music.apple.com/x", False),
        ("store", "https://music.apple.com/", False),
        ("store", "https://music.apple.com/x\n", False),
        ("preview", "https://audio-ssl.itunes.apple.com/p/1.m4a", True),
        ("preview", "https://audio-ssl.itunes.apple.com.evil/p.m4a", False),
        ("artwork", "https://is1-ssl.mzstatic.com/a/300x300bb.jpg", True),
        ("artwork", "https://isx-ssl.mzstatic.com/a.jpg", False),
        # As mesmas regras do jq do robô e do web: sem porta, host em minúsculas, dígito ASCII.
        ("store", "https://music.apple.com:8443/jp/album/x/1", False),
        ("store", "https://music.apple.com:443/jp/album/x/1", False),
        ("store", "https://Music.Apple.com/jp/album/x/1", False),
        ("store", "https://music.apple.com./jp/album/x/1", False),
        ("artwork", "https://is١-ssl.mzstatic.com/a.jpg", False),
    ],
)
def test_apple_url_allowlist(kind, url, ok):
    assert is_apple_url(kind, url) is ok


def test_collection_artist_alone_is_not_a_compilation():
    # A faixa "ILLIT & HANA" vem com collectionArtistName "ILLIT": parceria, não coletânea.
    assert album_type("Album", "ILLIT") == "album"
    assert album_type("Hits", "ヴァリアス・アーティスト") == "compilation"


def test_artist_latin_survives_a_snapshot_without_the_artist_lookup(tmp_path):
    write_snapshot(
        tmp_path, "2026-10-10", [lookup("1")], artists={"900": {"artistName": "Artisuto"}}
    )
    write_snapshot(tmp_path, "2026-10-17", [lookup("1")], artists={"901": {"artistName": "x"}})
    later = AppleProvider(tmp_path).snapshots()[1].entries[0].track
    assert later.artists[0].name_latin == "Artisuto"


def test_repeated_track_in_the_chart_keeps_the_first(tmp_path):
    write_snapshot(tmp_path, "2026-10-10", [lookup("1"), lookup("2")], rss_ids=["1", "2", "1"])
    provider = AppleProvider(tmp_path)
    snap = provider.snapshots()[0]
    assert [e.track.provider_id for e in snap.entries] == ["1", "2"]
    assert any("repetida" in w for w in provider.warnings)
