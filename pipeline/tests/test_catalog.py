from __future__ import annotations

from dataclasses import replace

import pytest

from helpers import album_by_id, make_snapshot, make_track, track_by_id
from musicle_pipeline.catalog import build_catalog, popularity
from musicle_pipeline.models import InputError
from musicle_pipeline.validate import validate_catalog


def test_fixture_catalog_is_valid(fixture_catalog):
    assert validate_catalog(fixture_catalog) == []
    assert len(fixture_catalog["tracks"]) == 42
    assert fixture_catalog["generatedAt"] == "2026-10-05T00:00:00Z"
    assert fixture_catalog["catalogVersion"].startswith("2026-10-05.")


def test_track_that_left_the_chart_stays_in_the_catalog(fixture_catalog):
    chart = track_by_id(fixture_catalog, "tr06")["chart"]
    assert chart == {
        "firstSeen": "2026-09-21",
        "lastSeen": "2026-09-21",
        "bestRank": 6,
        "lastRank": 6,
        "appearances": 1,
        "inLatest": False,
    }


def test_new_entry_is_in_latest(fixture_catalog):
    chart = track_by_id(fixture_catalog, "tr07")["chart"]
    assert (chart["firstSeen"], chart["appearances"], chart["inLatest"]) == ("2026-10-05", 1, True)


def test_track_that_left_and_came_back(fixture_catalog):
    chart = track_by_id(fixture_catalog, "tr08")["chart"]
    assert chart["firstSeen"] == "2026-09-21"
    assert chart["lastSeen"] == "2026-10-05"
    assert chart["appearances"] == 2
    assert chart["inLatest"] is True


def test_latest_metadata_wins_but_null_isrc_does_not_erase(fixture_catalog):
    t = track_by_id(fixture_catalog, "tr09")
    assert t["preview"]["url"] == "fixtures/audio/tr09-v2.wav"
    assert t["isrc"] == "JPZZ02600009"
    assert album_by_id(fixture_catalog, t["albumId"])["artworkUrl"].endswith("-v2.svg")


@pytest.mark.parametrize(
    ("pid", "reason"),
    [("tr11", "short-preview"), ("tr12", "no-artwork"), ("tr13", "no-preview")],
)
def test_ineligible_tracks(fixture_catalog, pid, reason):
    assert track_by_id(fixture_catalog, pid)["eligible"] == {"daily": False, "reason": reason}


def test_track_without_preview_has_null_preview(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr13")["preview"] is None


def test_regular_track_is_eligible(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr01")["eligible"] == {"daily": True, "reason": None}


def test_display_title_is_recomposed_to_nfc(fixture_catalog):
    assert track_by_id(fixture_catalog, "tr16")["title"] == "ガラスの靴"


def test_collaboration_keeps_artist_order(fixture_catalog):
    t = track_by_id(fixture_catalog, "tr05")
    assert t["artistIds"] == ["fixture:ar:ar02", "fixture:ar:ar07"]
    assert t["artistDisplay"] == "夜風シアター & 青井ユウ"


def test_search_keys_cover_kana_and_latin(fixture_catalog):
    t = track_by_id(fixture_catalog, "tr22")
    assert t["search"]["title"] == ["tokyolights", "東京らいつ"]
    assert "lovesong" in track_by_id(fixture_catalog, "tr17")["search"]["title"]
    assert "あいのうた" in track_by_id(fixture_catalog, "tr18")["search"]["title"]


def test_album_search_drops_store_suffix(fixture_catalog):
    assert album_by_id(fixture_catalog, "fixture:al:al01")["search"] == ["夜明けのめろでぃ"]


def test_popularity_falls_with_rank_and_with_time():
    a, b = make_track("a"), make_track("b")
    cat = build_catalog([make_snapshot("2026-01-05", [a, b])], "fixture", "jp")
    assert track_by_id(cat, "a")["popularity"] == 1.0
    assert track_by_id(cat, "b")["popularity"] == 0.5

    old = build_catalog(
        [make_snapshot("2026-01-05", [a]), make_snapshot("2026-03-02", [b])], "fixture", "jp"
    )
    # "a" foi nº 1 oito semanas antes do último snapshot: metade da nota.
    assert track_by_id(old, "a")["popularity"] == 0.5


def test_popularity_uses_the_size_of_each_snapshot():
    t = make_track("a")
    filler = [make_track(f"f{i}") for i in range(9)]
    cat = build_catalog([make_snapshot("2026-01-05", [*filler, t])], "fixture", "jp")
    assert track_by_id(cat, "a")["popularity"] == 0.1  # posição 10 de 10


def test_popularity_is_exact_decimal():
    from musicle_pipeline.catalog import _Appearance

    # 3 semanas: 0,5^(3/8) = 0,77110541... → 0,7711
    assert popularity([_Appearance("2026-01-05", 1, 1)], "2026-01-26") == 0.7711


def test_lowest_rank_wins_metadata_conflict_inside_a_snapshot():
    first = make_track("a", album="al1", album_title="Título bom")
    second = make_track("b", album="al1", album_title="Título ruim")
    cat = build_catalog([make_snapshot("2026-01-05", [first, second])], "fixture", "jp")
    assert album_by_id(cat, "fixture:al:al1")["title"] == "Título bom"


def test_build_does_not_depend_on_snapshot_order(fixture_snapshots):
    forward = build_catalog(fixture_snapshots, "fixture", "jp")
    backward = build_catalog(list(reversed(fixture_snapshots)), "fixture", "jp")
    assert forward == backward


def test_duplicate_rank_is_rejected():
    ok = make_snapshot("2026-01-05", [make_track("a"), make_track("b")])
    bad = replace(ok, entries=(ok.entries[0], ok.entries[0]))
    with pytest.raises(InputError, match=r"repetida|posições"):
        build_catalog([bad], "fixture", "jp")


def test_size_mismatch_is_rejected():
    with pytest.raises(InputError, match="entradas para size"):
        build_catalog([make_snapshot("2026-01-05", [make_track("a")], size=30)], "fixture", "jp")


def test_repeated_snapshot_date_is_rejected():
    s = make_snapshot("2026-01-05", [make_track("a")])
    with pytest.raises(InputError, match="repetidas"):
        build_catalog([s, s], "fixture", "jp")
