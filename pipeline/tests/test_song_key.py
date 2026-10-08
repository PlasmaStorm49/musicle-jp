from __future__ import annotations

from helpers import track_by_id
from musicle_pipeline.normalize import song_key


def test_versions_of_the_same_song_share_the_key(fixture_catalog):
    keys = {track_by_id(fixture_catalog, pid)["songKey"] for pid in ("tr01", "tr02", "tr03")}
    assert keys == {"夜明けのめろでぃ|fixture:ar:ar01"}


def test_same_title_by_another_artist_is_another_song(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr04")["songKey"] == "夜明けのめろでぃ|fixture:ar:ar14"


def test_symbol_only_title_gets_a_non_empty_key(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr14")["songKey"] == "♡|fixture:ar:ar14"


def test_titles_that_look_like_versions_are_not_cut(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr25")["songKey"].startswith("live|")
    assert track_by_id(fixture_catalog, "tr26")["songKey"].startswith("stayforever|")


def test_feat_and_double_suffix_are_cut(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr27")["songKey"].startswith("風になる|")
    assert track_by_id(fixture_catalog, "tr28")["songKey"].startswith("青い春|")


def test_key_uses_the_primary_artist():
    assert song_key("Song", "x:ar:1") != song_key("Song", "x:ar:2")
