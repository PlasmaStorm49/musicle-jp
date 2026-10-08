from __future__ import annotations

from helpers import album_by_id, track_by_id
from musicle_pipeline.similarity import MAX_SIMILAR, MIN_OPTIONS, album_profiles, title_of


def _tracks(catalog):
    return {t["id"]: t for t in catalog["tracks"]}


def test_track_distractors_never_share_artist_title_or_song(fixture_catalog):
    tracks = _tracks(fixture_catalog)
    for t in fixture_catalog["tracks"]:
        assert len(t["similar"]) <= MAX_SIMILAR
        seen: set[str] = set()
        for sid in t["similar"]:
            c = tracks[sid]
            assert not set(c["artistIds"]) & set(t["artistIds"]), (t["id"], sid)
            assert c["songKey"] != t["songKey"]
            assert title_of(c["songKey"]) != title_of(t["songKey"])
            assert c["eligible"]["daily"], (t["id"], sid)
            assert not set(c["artistIds"]) & seen, "artista repetido entre distratores"
            seen |= set(c["artistIds"])


def test_collaboration_counts_every_artist(fixture_catalog):
    # tr05 é de ar02 e ar07: nenhum distrator dela pode ser de qualquer um dos dois.
    tracks = _tracks(fixture_catalog)
    for sid in track_by_id(fixture_catalog, "tr05")["similar"]:
        assert not {"fixture:ar:ar02", "fixture:ar:ar07"} & set(tracks[sid]["artistIds"])


def test_same_title_by_another_artist_is_not_a_distractor(fixture_catalog):
    assert "fixture:tr:tr04" not in track_by_id(fixture_catalog, "tr03")["similar"]
    assert "fixture:tr:tr03" not in track_by_id(fixture_catalog, "tr04")["similar"]


def test_every_eligible_track_has_enough_distractors(fixture_catalog):
    for t in fixture_catalog["tracks"]:
        if t["eligible"]["daily"]:
            assert len(t["similar"]) >= MIN_OPTIONS, t["id"]
            assert len(album_by_id(fixture_catalog, t["albumId"])["similar"]) >= MIN_OPTIONS


def test_albums_with_the_same_song_are_never_options_of_each_other(fixture_catalog):
    # al01 (single) e al02 (álbum) têm 夜明けのメロディ: como opções, seriam as duas certas.
    assert "fixture:al:al01" not in album_by_id(fixture_catalog, "fixture:al:al02")["similar"]
    assert "fixture:al:al02" not in album_by_id(fixture_catalog, "fixture:al:al01")["similar"]


def test_album_without_artwork_is_never_an_option(fixture_catalog):
    for al in fixture_catalog["albums"]:
        assert "fixture:al:al12" not in al["similar"]


def test_album_distractors_are_disjoint_by_artist(fixture_catalog):
    profiles = album_profiles(fixture_catalog["albums"], fixture_catalog["tracks"])
    for al in fixture_catalog["albums"]:
        seen: set[str] = set()
        for sid in al["similar"]:
            other = profiles[sid]["artists"]
            assert not other & profiles[al["id"]]["artists"]
            assert not other & seen
            seen |= other


def test_distractors_come_ordered_by_era(fixture_catalog):
    # A janela de ano (0: até 2 anos, 1: até 5, 2: mais) nunca diminui ao longo da lista.
    tracks = _tracks(fixture_catalog)
    for t in fixture_catalog["tracks"]:
        year = int(t["releaseDate"][:4])
        windows = []
        for sid in t["similar"]:
            gap = abs(int(tracks[sid]["releaseDate"][:4]) - year)
            windows.append(0 if gap <= 2 else 1 if gap <= 5 else 2)
        assert windows == sorted(windows), t["id"]
