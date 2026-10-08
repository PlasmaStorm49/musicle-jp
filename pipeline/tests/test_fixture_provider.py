from __future__ import annotations

from musicle_pipeline.models import check_snapshots


def test_fixture_has_three_valid_weekly_snapshots(fixture_snapshots):
    assert [s.date for s in fixture_snapshots] == ["2026-09-21", "2026-09-28", "2026-10-05"]
    assert all(s.size == 30 for s in fixture_snapshots)
    check_snapshots(fixture_snapshots)  # não pode levantar erro


def test_fixture_covers_42_tracks(fixture_snapshots):
    ids = {e.track.provider_id for s in fixture_snapshots for e in s.entries}
    assert ids == {f"tr{n:02d}" for n in range(1, 43)}


def test_nfd_title_arrives_decomposed(fixture_snapshots):
    # Garante que o caso de teste continua no arquivo: o pipeline é que tem de recompor.
    titles = {e.track.provider_id: e.track.title for s in fixture_snapshots for e in s.entries}
    assert "゙" in titles["tr16"]
