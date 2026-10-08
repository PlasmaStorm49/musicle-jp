from __future__ import annotations

import pytest

from musicle_pipeline.catalog import build_catalog
from musicle_pipeline.models import JSON, ChartSnapshot
from musicle_pipeline.providers import FixtureProvider


@pytest.fixture(scope="session")
def fixture_snapshots() -> list[ChartSnapshot]:
    return FixtureProvider().snapshots()


@pytest.fixture(scope="session")
def fixture_catalog(fixture_snapshots: list[ChartSnapshot]) -> JSON:
    return build_catalog(fixture_snapshots, "fixture", "jp")
