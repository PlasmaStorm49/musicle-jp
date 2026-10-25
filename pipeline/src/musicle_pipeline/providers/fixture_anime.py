"""Animes fictícios para o Anime (M14): dev, e2e e testes.

Como os artistas fictícios, as faixas são as da parada fictícia, citadas pelo id (`"ref":
"tr05"`): os mesmos títulos e as mesmas URLs, então o `fake-assets` da parada já gera o áudio e
as capas, sem arquivo novo. Os animes, os temas e os níveis são inventados, no mesmo formato dos
snapshots reais.

Uma diferença de propósito: os temas têm as playlists exatas (`stats.animethemes`, o quiz do dia,
M18) sem o nível delas (`levels.animethemes`). O fetch grava os dois juntos, mas o nível mudaria
as faixas do catálogo fictício, que o dev e o e2e usam. A taxa do AMQ bate com o nível dela.
"""

from __future__ import annotations

from pathlib import Path

from musicle_pipeline.anime import AnimeSource, anime_from_dict, check_snapshot_header
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import InputError, RawTrack
from musicle_pipeline.paths import anime_paths
from musicle_pipeline.providers.fixture import FixtureProvider

NAME = "fixture"


class FixtureAnimeProvider:
    name = NAME

    def __init__(self, path: Path | None = None, chart: Path | None = None) -> None:
        self.path = path or anime_paths(NAME).source
        self._data = read_json(self.path)
        if self._data.get("provider") != NAME:
            raise InputError(f"{self.path}: provider deveria ser {NAME!r}")
        self.storefront: str = self._data["storefront"]
        ordered = sorted(FixtureProvider(chart).snapshots(), key=lambda s: s.date)
        # A última aparição de cada faixa da parada fictícia (a mesma que fica no catálogo).
        self._chart: dict[str, RawTrack] = {
            e.track.provider_id: e.track for s in ordered for e in s.entries
        }
        self.warnings: list[str] = []

    def _track(self, ref: object, where: str) -> RawTrack:
        if not isinstance(ref, dict) or not isinstance(ref.get("ref"), str):
            raise InputError(f'{where}: track deveria ser {{"ref": id da parada fictícia}}')
        found = self._chart.get(ref["ref"])
        if found is None:
            raise InputError(f"{where}: {ref['ref']} não está na parada fictícia")
        return found

    def source(self) -> AnimeSource:
        allowed = {"provider", "storefront", "id", "fetchedAt", "anime"}
        snapshot, fetched_at = check_snapshot_header(self._data, str(self.path), allowed)
        anime = [anime_from_dict(a, self._track, str(self.path)) for a in self._data["anime"]]
        ids = [a.mal_id for a in anime]
        if len(set(ids)) != len(ids):
            raise InputError(f"{self.path}: anime repetido")
        return AnimeSource(
            snapshots=((snapshot, fetched_at),),
            anime=tuple(sorted(anime, key=lambda a: a.mal_id)),
        )
