from __future__ import annotations

from helpers import album_by_id, track_by_id
from musicle_pipeline.similarity import MAX_SIMILAR, MIN_OPTIONS, album_profiles


def test_only_albums_have_distractors(fixture_catalog):
    # P100: o Desafio é digitado; só o Normal (4 opções de álbum) usa distratores.
    assert all("similar" not in t for t in fixture_catalog["tracks"])
    assert all(len(al["similar"]) <= MAX_SIMILAR for al in fixture_catalog["albums"])


def test_collaboration_counts_every_artist(fixture_catalog):
    # tr05 é de ar02 e ar07: nenhum distrator do álbum dela pode ter qualquer um dos dois.
    profiles = album_profiles(fixture_catalog["albums"], fixture_catalog["tracks"])
    album = album_by_id(fixture_catalog, track_by_id(fixture_catalog, "tr05")["albumId"])
    assert album["similar"]
    for sid in album["similar"]:
        assert not {"fixture:ar:ar02", "fixture:ar:ar07"} & profiles[sid]["artists"], sid


def test_album_distractors_never_repeat_a_title(fixture_catalog):
    profiles = album_profiles(fixture_catalog["albums"], fixture_catalog["tracks"])
    for al in fixture_catalog["albums"]:
        titles = [profiles[s]["title"] for s in al["similar"]]
        assert len(titles) == len(set(titles)), al["id"]
        assert profiles[al["id"]]["title"] not in titles, al["id"]


def test_every_eligible_track_has_an_album_with_enough_distractors(fixture_catalog):
    for t in fixture_catalog["tracks"]:
        if t["eligible"]["daily"]:
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
    albums = {al["id"]: al for al in fixture_catalog["albums"]}
    for al in fixture_catalog["albums"]:
        year = int(al["releaseDate"][:4])
        windows = []
        for sid in al["similar"]:
            gap = abs(int(albums[sid]["releaseDate"][:4]) - year)
            windows.append(0 if gap <= 2 else 1 if gap <= 5 else 2)
        assert windows == sorted(windows), al["id"]
