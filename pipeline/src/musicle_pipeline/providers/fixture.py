from __future__ import annotations

from pathlib import Path

from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import ChartSnapshot, InputError, snapshot_from_dict
from musicle_pipeline.paths import default_fixture_path


class FixtureProvider:
    """Parada fictícia em JSON, para desenvolver sem depender de API (até o M11)."""

    name = "fixture"

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_fixture_path()
        data = read_json(self.path)
        if data.get("provider") != self.name:
            raise InputError(f"{self.path}: provider deveria ser {self.name!r}")
        self.storefront: str = data["storefront"]
        self._raw = data["snapshots"]

    def snapshots(self) -> list[ChartSnapshot]:
        return [snapshot_from_dict(s) for s in self._raw]
