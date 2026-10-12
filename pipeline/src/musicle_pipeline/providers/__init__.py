"""Provedores de parada (e dos artistas do M13). Cada um entrega o contrato de
musicle_pipeline.models: snapshots da parada, ou o snapshot de um artista."""

from collections.abc import Callable

from musicle_pipeline.artists import ArtistProvider
from musicle_pipeline.providers.apple import AppleProvider
from musicle_pipeline.providers.apple_artists import AppleArtistProvider
from musicle_pipeline.providers.base import ChartProvider
from musicle_pipeline.providers.fixture import FixtureProvider
from musicle_pipeline.providers.fixture_artists import FixtureArtistProvider

PROVIDERS: dict[str, Callable[[], ChartProvider]] = {
    "fixture": FixtureProvider,
    "apple": AppleProvider,
}
ARTIST_PROVIDERS: dict[str, Callable[[], ArtistProvider]] = {
    "fixture": FixtureArtistProvider,
    "apple": AppleArtistProvider,
}

__all__ = [
    "ARTIST_PROVIDERS",
    "PROVIDERS",
    "AppleArtistProvider",
    "AppleProvider",
    "ChartProvider",
    "FixtureArtistProvider",
    "FixtureProvider",
]
