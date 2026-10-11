"""Provedores de parada. Cada um entrega snapshots no contrato de musicle_pipeline.models."""

from collections.abc import Callable

from musicle_pipeline.providers.apple import AppleProvider
from musicle_pipeline.providers.base import ChartProvider
from musicle_pipeline.providers.fixture import FixtureProvider

PROVIDERS: dict[str, Callable[[], ChartProvider]] = {
    "fixture": FixtureProvider,
    "apple": AppleProvider,
}

__all__ = ["PROVIDERS", "AppleProvider", "ChartProvider", "FixtureProvider"]
