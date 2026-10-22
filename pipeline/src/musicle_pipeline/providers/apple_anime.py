"""O Anime da Apple (M14), lido dos snapshots do `fetch --anime`.

Sem rede, como a parada: lê `pipeline/data/apple/anime/snapshots/<id>.json` (um por busca, só
crescem; pode haver mais de um por dia) e traduz cada faixa com o mesmo mapeamento da parada
(`map_track`, P72): um erro de mapeamento se corrige no código, sem buscar de novo. O snapshot
guarda só as faixas escolhidas, não a discografia inteira de cada artista.
"""

from __future__ import annotations

import re
from pathlib import Path

from musicle_pipeline.anime import (
    Anime,
    AnimeSource,
    anime_from_dict,
    check_snapshot_header,
    merge_anime,
)
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON, InputError, RawTrack
from musicle_pipeline.paths import anime_paths
from musicle_pipeline.providers.apple import (
    NAME,
    STOREFRONT,
    artist_names,
    map_track,
    partners_of,
)

# O id do snapshot é o instante da busca, sem os dois-pontos (que o Windows não aceita no nome).
SNAPSHOT_ID = re.compile(r"\d{4}-\d{2}-\d{2}T\d{6}Z")
SNAPSHOT_KEYS = {
    "provider",
    "storefront",
    "id",
    "fetchedAt",
    "anime",
    "artists",
    "resolved",
    "tracks",
}
# Os campos aparados de cada faixa (os do fetch.py): outro seria resposta não aparada.
TRACK_KEYS = {
    "trackId",
    "trackName",
    "artistId",
    "artistName",
    "collectionId",
    "collectionName",
    "releaseDate",
    "trackTimeMillis",
    "collectionArtistName",
    "trackExplicitness",
    "previewUrl",
    "artworkUrl100",
    "trackViewUrl",
}


def snapshot_id(fetched_at: str) -> str:
    """2026-10-21T23:10:05Z → 2026-10-21T231005Z."""
    day, time = fetched_at.split("T")
    return f"{day}T{time.replace(':', '')}"


class AppleAnimeProvider:
    name = NAME
    storefront = STOREFRONT

    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory or anime_paths(NAME).source
        self.warnings: list[str] = []

    def _files(self) -> list[Path]:
        if not self.directory.is_dir():
            return []
        return sorted(p for p in self.directory.glob("*.json") if SNAPSHOT_ID.fullmatch(p.stem))

    def source(self) -> AnimeSource:
        files = self._files()
        if not files:
            raise InputError(f"{self.directory}: nenhum snapshot do Anime (rode o fetch --anime)")
        self.warnings = []
        loaded: list[tuple[Path, JSON]] = []
        lookups: JSON = {}
        official: JSON = {}
        for path in files:
            data = read_json(path)
            if data.get("provider") != NAME or data.get("storefront") != STOREFRONT:
                raise InputError(f"{path}: provider/storefront deveriam ser {NAME}/{STOREFRONT}")
            snapshot, fetched_at = check_snapshot_header(data, str(path), SNAPSHOT_KEYS)
            if snapshot != path.stem or snapshot != snapshot_id(fetched_at):
                raise InputError(f"{path}: id {snapshot!r} não bate com o nome nem o fetchedAt")
            tracks, artists = data.get("tracks"), data.get("artists")
            if not isinstance(tracks, dict) or not isinstance(artists, dict):
                raise InputError(f"{path}: tracks e artists deveriam ser objetos")
            for tid, found in tracks.items():
                if not isinstance(found, dict) or not set(found) <= TRACK_KEYS:
                    raise InputError(f"{path}: faixa {tid} com campos fora dos aparados")
            lookups.update(tracks)
            official.update(artists)
            loaded.append((path, data))
        # Os artistas e os parceiros de todos os snapshots juntos, como na parada: numa passada só,
        # o resultado dependeria da ordem das buscas.
        names = artist_names(lookups, official)
        partners = partners_of(list(names.values()))
        mapped: dict[str, RawTrack] = {}

        def track_of(ref: object, where: str) -> RawTrack:
            if not isinstance(ref, str) or ref not in lookups:
                raise InputError(f"{where}: faixa {ref!r} ausente do snapshot")
            if ref not in mapped:
                try:
                    mapped[ref] = map_track(lookups[ref], names, partners, where, self.warnings)
                except (KeyError, TypeError, ValueError) as exc:
                    raise InputError(f"{where}: faixa {ref} com forma inesperada: {exc!r}") from exc
            return mapped[ref]

        batches: list[list[Anime]] = []
        for path, data in loaded:
            batches.append([anime_from_dict(item, track_of, str(path)) for item in data["anime"]])
        return AnimeSource(
            snapshots=tuple((data["id"], data["fetchedAt"]) for _, data in loaded),
            anime=merge_anime(batches),
        )
