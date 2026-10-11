"""Contrato de entrada: o que todo provedor de parada (fixture, Apple...) precisa entregar.

As dataclasses são congeladas e usam tuple em vez de list, para que nenhum passo do
pipeline altere a entrada sem querer.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

JSON = dict[str, Any]

_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")


class InputError(ValueError):
    """Dado de entrada do provedor fora do contrato."""


@dataclass(frozen=True)
class RawArtist:
    provider_id: str
    name: str
    name_latin: str | None = None


@dataclass(frozen=True)
class RawAlbum:
    provider_id: str
    title: str
    type: str
    release_date: str
    title_latin: str | None = None
    artwork_url: str | None = None


@dataclass(frozen=True)
class RawTrack:
    provider_id: str
    title: str
    artists: tuple[RawArtist, ...]  # o primeiro é o artista principal
    album: RawAlbum
    duration_ms: int
    explicit: bool
    title_latin: str | None = None
    isrc: str | None = None
    preview_url: str | None = None
    preview_duration_sec: int | float | None = None  # None = desconhecido
    store_url: str | None = None  # página da faixa na loja (link "Ouvir no Apple Music")
    # Grafia do provedor para os artistas da faixa (ex.: "A & B"), quando difere da junção dos
    # nomes canônicos; None = usar a junção.
    artist_display: str | None = None


@dataclass(frozen=True)
class ChartEntry:
    rank: int
    track: RawTrack


@dataclass(frozen=True)
class ChartSnapshot:
    id: str
    date: str
    fetched_at: str
    chart: str
    size: int
    entries: tuple[ChartEntry, ...]


def _get(data: JSON, key: str, where: str) -> Any:
    try:
        return data[key]
    except (KeyError, TypeError):
        raise InputError(f"{where}: campo obrigatório ausente: {key}") from None


def _number(value: int | float | None) -> int | float | None:
    # 30 e 30.0 virariam textos diferentes no JSON; normaliza para inteiro quando dá.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def artist_from_dict(data: JSON, where: str) -> RawArtist:
    return RawArtist(
        provider_id=_get(data, "providerId", where),
        name=_get(data, "name", where),
        name_latin=data.get("nameLatin"),
    )


def album_from_dict(data: JSON, where: str) -> RawAlbum:
    return RawAlbum(
        provider_id=_get(data, "providerId", where),
        title=_get(data, "title", where),
        type=_get(data, "type", where),
        release_date=_get(data, "releaseDate", where),
        title_latin=data.get("titleLatin"),
        artwork_url=data.get("artworkUrl"),
    )


def track_from_dict(data: JSON, where: str) -> RawTrack:
    where = f"{where} faixa {data.get('providerId', '?')}"
    return RawTrack(
        provider_id=_get(data, "providerId", where),
        title=_get(data, "title", where),
        artists=tuple(artist_from_dict(a, where) for a in _get(data, "artists", where)),
        album=album_from_dict(_get(data, "album", where), where),
        duration_ms=_get(data, "durationMs", where),
        explicit=_get(data, "explicit", where),
        title_latin=data.get("titleLatin"),
        isrc=data.get("isrc"),
        preview_url=data.get("previewUrl"),
        preview_duration_sec=_number(data.get("previewDurationSec")),
        store_url=data.get("storeUrl"),
        artist_display=data.get("artistDisplay"),
    )


def check_snapshots(snapshots: Sequence[ChartSnapshot]) -> None:
    """Confere a entrada antes de montar o catálogo. Junta todos os problemas num só erro."""
    problems: list[str] = []
    if not snapshots:
        problems.append("nenhum snapshot")
    dates = [s.date for s in snapshots]
    if len(set(dates)) != len(dates):
        problems.append(f"datas de snapshot repetidas: {sorted(dates)}")
    for s in snapshots:
        where = f"snapshot {s.id}"
        try:
            date.fromisoformat(s.date)
        except ValueError:
            problems.append(f"{where}: data inválida {s.date!r}")
        if s.id != s.date:
            problems.append(f"{where}: id deveria ser igual à data {s.date}")
        if not _TIMESTAMP.fullmatch(s.fetched_at):
            problems.append(f"{where}: fetchedAt fora do formato AAAA-MM-DDTHH:MM:SSZ")
        if len(s.entries) != s.size:
            problems.append(f"{where}: {len(s.entries)} entradas para size {s.size}")
        ranks = sorted(e.rank for e in s.entries)
        if ranks != list(range(1, len(s.entries) + 1)):
            problems.append(f"{where}: posições deveriam ser 1..{len(s.entries)} sem repetição")
        ids = [e.track.provider_id for e in s.entries]
        if len(set(ids)) != len(ids):
            problems.append(f"{where}: faixa repetida no mesmo snapshot")
        for e in s.entries:
            if not e.track.artists:
                problems.append(f"{where} faixa {e.track.provider_id}: sem artista")
    if problems:
        raise InputError("\n".join(problems))


def snapshot_from_dict(data: JSON) -> ChartSnapshot:
    where = f"snapshot {data.get('id', '?')}"
    entries = tuple(
        ChartEntry(
            rank=_get(e, "rank", where), track=track_from_dict(_get(e, "track", where), where)
        )
        for e in _get(data, "entries", where)
    )
    return ChartSnapshot(
        id=_get(data, "id", where),
        date=_get(data, "date", where),
        fetched_at=_get(data, "fetchedAt", where),
        chart=_get(data, "chart", where),
        size=_get(data, "size", where),
        entries=entries,
    )
