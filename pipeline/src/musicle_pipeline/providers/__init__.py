"""Provedores de parada (e dos artistas do M13, e do Anime do M14). Cada um entrega o contrato de
musicle_pipeline.models: snapshots da parada, o snapshot de um artista, ou os animes."""

from collections.abc import Callable

from musicle_pipeline.anime import AnimeProvider
from musicle_pipeline.artists import ArtistProvider
from musicle_pipeline.providers.apple import AppleProvider
from musicle_pipeline.providers.apple_anime import AppleAnimeProvider
from musicle_pipeline.providers.apple_artists import AppleArtistProvider
from musicle_pipeline.providers.base import ChartProvider
from musicle_pipeline.providers.fixture import FixtureProvider
from musicle_pipeline.providers.fixture_anime import FixtureAnimeProvider
from musicle_pipeline.providers.fixture_artists import FixtureArtistProvider

PROVIDERS: dict[str, Callable[[], ChartProvider]] = {
    "fixture": FixtureProvider,
    "apple": AppleProvider,
}
ARTIST_PROVIDERS: dict[str, Callable[[], ArtistProvider]] = {
    "fixture": FixtureArtistProvider,
    "apple": AppleArtistProvider,
}

ANIME_PROVIDERS: dict[str, Callable[[], AnimeProvider]] = {
    "fixture": FixtureAnimeProvider,
    "apple": AppleAnimeProvider,
}

__all__ = [
    "ANIME_PROVIDERS",
    "ARTIST_PROVIDERS",
    "PROVIDERS",
    "AppleAnimeProvider",
    "AppleArtistProvider",
    "AppleProvider",
    "ChartProvider",
    "FixtureAnimeProvider",
    "FixtureArtistProvider",
    "FixtureProvider",
]
