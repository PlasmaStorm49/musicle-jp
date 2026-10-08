"""Funções auxiliares dos testes (importadas como `helpers`, via pythonpath do pytest)."""

from __future__ import annotations

from musicle_pipeline.models import (
    JSON,
    ChartEntry,
    ChartSnapshot,
    RawAlbum,
    RawArtist,
    RawTrack,
)


def track_by_id(catalog: JSON, provider_id: str) -> JSON:
    return next(t for t in catalog["tracks"] if t["id"] == f"fixture:tr:{provider_id}")


def album_by_id(catalog: JSON, album_id: str) -> JSON:
    return next(a for a in catalog["albums"] if a["id"] == album_id)


def make_track(
    pid: str,
    *,
    title: str | None = None,
    artist: str = "ar1",
    album: str = "al1",
    album_title: str = "Album",
    artwork: str | None = "art.svg",
    preview: str | None = "p.wav",
    preview_sec: int | None = 30,
    isrc: str | None = None,
) -> RawTrack:
    """Faixa sintética para testes que precisam controlar um detalhe só."""
    return RawTrack(
        provider_id=pid,
        title=title or f"Song {pid}",
        artists=(RawArtist(provider_id=artist, name=f"Artist {artist}"),),
        album=RawAlbum(
            provider_id=album,
            title=album_title,
            type="album",
            release_date="2024-01-01",
            artwork_url=artwork,
        ),
        duration_ms=200000,
        explicit=False,
        isrc=isrc,
        preview_url=preview,
        preview_duration_sec=preview_sec,
    )


def make_snapshot(day: str, tracks: list[RawTrack], size: int | None = None) -> ChartSnapshot:
    """Snapshot sintético: a ordem da lista define as posições (1, 2, 3...)."""
    return ChartSnapshot(
        id=day,
        date=day,
        fetched_at=f"{day}T00:00:00Z",
        chart="top-songs",
        size=size if size is not None else len(tracks),
        entries=tuple(ChartEntry(rank=i + 1, track=t) for i, t in enumerate(tracks)),
    )
