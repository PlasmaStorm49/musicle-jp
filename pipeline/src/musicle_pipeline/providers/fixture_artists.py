"""Artistas fictícios para o modo por artista (M13): dev, e2e e testes.

As faixas são as da parada fictícia, citadas pelo id (`"ref": "tr05"`): os mesmos títulos e as
mesmas URLs, então o `fake-assets` da parada já gera o áudio e as capas, sem arquivo novo (ele
apaga como órfão o que o catálogo dele não cita). As versões sintéticas (karaokê, ao vivo,
inglês...) vêm inteiras no formato neutro e existem para cair nas regras: nunca são publicadas.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from musicle_pipeline.catalog import artist_display_of
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import (
    JSON,
    ArtistEntry,
    ArtistSnapshot,
    InputError,
    RawArtist,
    RawTrack,
    track_from_dict,
)
from musicle_pipeline.paths import artist_paths
from musicle_pipeline.providers.fixture import FixtureProvider

NAME = "fixture"


class FixtureArtistProvider:
    name = NAME

    def __init__(self, path: Path | None = None, chart: Path | None = None) -> None:
        self.path = path or artist_paths(NAME).source
        data = read_json(self.path)
        if data.get("provider") != NAME:
            raise InputError(f"{self.path}: provider deveria ser {NAME!r}")
        self.storefront: str = data["storefront"]
        self.fetched_at: str = data["fetchedAt"]
        self._artists: JSON = data["artists"]
        chart_provider = FixtureProvider(chart)
        # A última aparição de cada faixa da parada fictícia, por data (a mesma que fica no
        # catálogo, que também ordena os snapshots).
        ordered = sorted(chart_provider.snapshots(), key=lambda s: s.date)
        self._chart: dict[str, RawTrack] = {
            e.track.provider_id: e.track for s in ordered for e in s.entries
        }
        self.warnings: list[str] = []

    def _track(self, item: JSON, where: str) -> RawTrack:
        if "ref" in item:
            found = self._chart.get(item["ref"])
            if found is None:
                raise InputError(f"{where}: {item['ref']} não está na parada fictícia")
            return found
        return track_from_dict(item["track"], where)

    def snapshot(self, artist_id: str) -> ArtistSnapshot:
        spec = self._artists.get(artist_id)
        if spec is None:
            raise InputError(f"{self.path}: artista {artist_id} ausente")
        where = f"{self.path} artista {artist_id}"
        entries = tuple(
            ArtistEntry(rank=item.get("rank"), track=self._track(item, where))
            for item in spec["entries"]
        )
        if "artist" in spec:
            return self._anime(artist_id, spec["artist"], entries, where)
        chosen = next(
            (a for e in entries for a in e.track.artists if a.provider_id == artist_id), None
        )
        if chosen is None:
            raise InputError(f"{where}: nenhuma faixa credita o artista")
        return ArtistSnapshot(artist=chosen, fetched_at=self.fetched_at, entries=entries)

    def _anime(
        self, artist_id: str, declared: object, entries: tuple[ArtistEntry, ...], where: str
    ) -> ArtistSnapshot:
        """O anime fictício (o usuário, 02/11/2026): as faixas são de outros artistas da parada, e
        o artista dele vem declarado, como o "artist" do snapshot da Apple. Como no provedor da
        Apple, a faixa que não o credita o ganha nos artistIds, e a exibição fica a da faixa. Só
        aqui: no artista comum, um `ref` de outro artista continua recusado pelo validate."""
        if (
            not isinstance(declared, dict)
            or not set(declared) <= {"name", "nameLatin"}
            or not isinstance(declared.get("name"), str)
            or not isinstance(declared.get("nameLatin", ""), str)
        ):
            raise InputError(f'{where}: "artist" deveria ser {{"name": "…", "nameLatin": "…"}}')
        chosen = RawArtist(
            provider_id=artist_id, name=declared["name"], name_latin=declared.get("nameLatin")
        )
        entries = tuple(
            e
            if artist_id in {a.provider_id for a in e.track.artists}
            else replace(
                e,
                track=replace(
                    e.track,
                    artists=(*e.track.artists, chosen),
                    artist_display=artist_display_of(e.track),
                ),
            )
            for e in entries
        )
        return ArtistSnapshot(artist=chosen, fetched_at=self.fetched_at, entries=entries)
