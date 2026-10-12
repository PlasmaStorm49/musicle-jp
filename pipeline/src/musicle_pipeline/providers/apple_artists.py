"""Artistas da Apple para o modo por artista (M13), lidos dos snapshots do `fetch --artists`.

Sem rede, como a parada: lê `pipeline/data/apple/artists/snapshots/<artistId>.json` (um por
artista, substituído a cada busca) e traduz cada faixa com o mesmo mapeamento da parada
(`map_track`, P72): um erro de mapeamento se corrige no código, sem buscar de novo.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import (
    JSON,
    TIMESTAMP,
    ArtistEntry,
    ArtistSnapshot,
    InputError,
    RawArtist,
)
from musicle_pipeline.paths import artist_paths
from musicle_pipeline.providers.apple import (
    NAME,
    STOREFRONT,
    artist_names,
    map_track,
    partners_of,
)


class AppleArtistProvider:
    name = NAME
    storefront = STOREFRONT

    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory or artist_paths(NAME).source
        self.warnings: list[str] = []

    def _read(self, artist_id: str) -> JSON:
        path = self.directory / f"{artist_id}.json"
        if not path.exists():
            raise InputError(f"{path}: snapshot do artista ausente (rode o fetch --artists)")
        data = read_json(path)
        if data.get("provider") != NAME or data.get("storefront") != STOREFRONT:
            raise InputError(f"{path}: provider/storefront deveriam ser {NAME}/{STOREFRONT}")
        if data.get("artistId") != artist_id:
            raise InputError(f"{path}: artistId {data.get('artistId')!r} não bate com o arquivo")
        if not isinstance(data.get("fetchedAt"), str) or not TIMESTAMP.fullmatch(data["fetchedAt"]):
            raise InputError(f"{path}: fetchedAt fora do formato AAAA-MM-DDTHH:MM:SSZ")
        if not isinstance(data.get("tracks"), dict) or not data["tracks"]:
            raise InputError(f"{path}: snapshot sem faixas")
        songs, artists, artist = data.get("songs"), data.get("artists"), data.get("artist")
        if (
            not isinstance(songs, list)
            or not all(isinstance(s, str) for s in songs)
            or not isinstance(artists, dict)
            or not isinstance(artist, dict)
            or not isinstance(artist.get("artistName"), str)
        ):
            raise InputError(f"{path}: songs, artists ou artist com forma inesperada")
        return data

    def snapshot(self, artist_id: str) -> ArtistSnapshot:
        data = self._read(artist_id)
        where = f"artista {artist_id}"
        artists = artist_names(data["tracks"], data["artists"])
        chosen = artists.get(artist_id) or RawArtist(
            provider_id=artist_id, name=data["artist"]["artistName"]
        )
        partners = partners_of(list(artists.values()))
        rank = {}
        for position, track_id in enumerate(data["songs"], start=1):
            rank.setdefault(track_id, position)
        entries = []
        for track_id, found in sorted(data["tracks"].items()):
            track = map_track(found, artists, partners, where, self.warnings)
            if artist_id not in {a.provider_id for a in track.artists}:
                # Participação com um crédito que a chave estrita não reconheceu: a faixa veio no
                # lookup do artista, então é dele também (o validate exige ele nos artistIds).
                track = replace(track, artists=(*track.artists, chosen))
            entries.append(ArtistEntry(rank=rank.get(track_id), track=track))
        return ArtistSnapshot(artist=chosen, fetched_at=data["fetchedAt"], entries=tuple(entries))
