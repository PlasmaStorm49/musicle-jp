"""Leitura dos snapshots de artista da Apple (M13), com o mapeamento da parada (sem rede)."""

from __future__ import annotations

import pytest

from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import InputError
from musicle_pipeline.providers.apple_artists import AppleArtistProvider

FETCHED = "2026-10-12T15:00:00Z"


def lookup(track_id: str, artist_id: str, artist_name: str, title: str) -> dict:
    return {
        "trackId": track_id,
        "trackName": title,
        "artistId": artist_id,
        "artistName": artist_name,
        "collectionId": f"5{track_id}",
        "collectionName": f"{title} - Single",
        "releaseDate": "2025-03-01T15:00:00Z",
        "trackTimeMillis": 210000,
        "previewUrl": f"https://audio-ssl.itunes.apple.com/p/{track_id}.m4a",
        "artworkUrl100": "https://is1-ssl.mzstatic.com/a/100x100bb.jpg",
        "trackViewUrl": f"https://music.apple.com/jp/album/x/1?i={track_id}&uo=4",
    }


def write(tmp_path, data: dict, name: str = "18756224.json"):
    tmp_path.joinpath(name).write_bytes(dumps(data).encode("utf-8"))
    return AppleArtistProvider(tmp_path)


def snapshot(**over) -> dict:
    return {
        "provider": "apple",
        "storefront": "jp",
        "artistId": "18756224",
        "fetchedAt": FETCHED,
        "artist": {"artistName": "Hikaru Utada"},
        "songs": ["2", "1", "2"],
        "albums": ["51"],
        "tracks": {
            "1": lookup("1", "18756224", "宇多田ヒカル", "First Love"),
            "2": lookup("2", "530814268", "米津玄師 & 宇多田ヒカル", "JANE DOE"),
            "3": lookup("3", "18756224", "宇多田ヒカル", "光"),
        },
        "artists": {
            "18756224": {"artistName": "Hikaru Utada"},
            "530814268": {"artistName": "Kenshi Yonezu"},
        },
        **over,
    }


def test_reads_tracks_ranks_and_the_participation(tmp_path):
    snap = write(tmp_path, snapshot()).snapshot("18756224")
    assert snap.artist.name == "宇多田ヒカル"
    assert snap.artist.name_latin == "Hikaru Utada"
    assert snap.fetched_at == FETCHED
    ranks = {e.track.provider_id: e.rank for e in snap.entries}
    assert ranks == {"1": 2, "2": 1, "3": None}  # a 1ª posição de cada faixa no lookup
    jane = next(e.track for e in snap.entries if e.track.provider_id == "2")
    # Outro artista principal, e o artista escolhido como parceiro (pelo nome da parceria).
    assert [a.provider_id for a in jane.artists] == ["530814268", "18756224"]
    assert jane.artist_display == "米津玄師 & 宇多田ヒカル"


def test_a_participation_without_a_known_credit_still_belongs_to_the_artist(tmp_path):
    data = snapshot()
    data["tracks"]["2"]["artistName"] = "米津玄師"  # o crédito não cita o artista
    snap = write(tmp_path, data).snapshot("18756224")
    jane = next(e.track for e in snap.entries if e.track.provider_id == "2")
    assert "18756224" in {a.provider_id for a in jane.artists}
    # A exibição é o crédito da loja, sem o artista escolhido juntado ("米津玄師 & 宇多田ヒカル"
    # seria um crédito que a loja não mostra; e com "DAOKO×米津玄師", o nome sairia duas vezes).
    assert jane.artist_display == "米津玄師"


@pytest.mark.parametrize(
    ("over", "message"),
    [
        ({"provider": "fixture"}, "provider/storefront"),
        ({"artistId": "1"}, "não bate com o arquivo"),
        ({"fetchedAt": "ontem"}, "fetchedAt"),
        ({"tracks": {}}, "sem faixas"),
        ({"songs": "1"}, "forma inesperada"),
        ({"artist": {}}, "forma inesperada"),
        ({"artists": []}, "forma inesperada"),
    ],
)
def test_refuses_an_odd_header(tmp_path, over, message):
    with pytest.raises(InputError, match=message):
        write(tmp_path, snapshot(**over)).snapshot("18756224")


def test_missing_snapshot_asks_for_the_fetch(tmp_path):
    with pytest.raises(InputError, match="fetch --artists"):
        AppleArtistProvider(tmp_path).snapshot("18756224")
