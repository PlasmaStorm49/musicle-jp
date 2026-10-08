"""Monta o catálogo como uma redução pura de TODOS os snapshots.

Não existe "atualizar o catálogo anterior": todo build parte do zero. Assim, mudar uma regra
(por exemplo, a normalização) atualiza todas as faixas, e o resultado depende só da entrada.
"""

from __future__ import annotations

import hashlib
import unicodedata as ud
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal, localcontext

from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import (
    JSON,
    ChartSnapshot,
    RawAlbum,
    RawArtist,
    RawTrack,
    check_snapshots,
)
from musicle_pipeline.normalize import search_keys, song_key, strip_album_suffix

SCHEMA_VERSION = 1
MIN_PREVIEW_SEC = 16  # o trecho mais longo do jogo tem 16 s
POPULARITY_HALF_LIFE_WEEKS = 8


def _display(text: str) -> str:
    # Texto de exibição em NFC: o mesmo título pode chegar decomposto (NFD) do provedor.
    return ud.normalize("NFC", text).strip()


def _id(provider: str, kind: str, provider_id: str) -> str:
    return f"{provider}:{kind}:{provider_id}"


@dataclass
class _Appearance:
    date: str
    rank: int
    size: int


@dataclass
class _TrackAcc:
    """Acumulador de uma faixa enquanto os snapshots são percorridos."""

    meta: RawTrack
    isrc: str | None
    appearances: list[_Appearance] = field(default_factory=list)


def _artist_record(provider: str, a: RawArtist) -> JSON:
    return {
        "id": _id(provider, "ar", a.provider_id),
        "name": _display(a.name),
        "nameLatin": a.name_latin,
        "search": search_keys([a.name, a.name_latin]),
    }


def _album_record(provider: str, al: RawAlbum, artists: Sequence[RawArtist]) -> JSON:
    return {
        "id": _id(provider, "al", al.provider_id),
        "title": _display(al.title),
        "titleLatin": al.title_latin,
        "artistIds": [_id(provider, "ar", a.provider_id) for a in artists],
        "artistDisplay": " & ".join(_display(a.name) for a in artists),
        "type": al.type,
        "releaseDate": al.release_date,
        "artworkUrl": al.artwork_url,
        "similar": [],
        "search": search_keys([strip_album_suffix(al.title), al.title_latin]),
    }


def popularity(appearances: Sequence[_Appearance], latest: str) -> float:
    """Maior nota entre as aparições: posição relativa × decaimento pelo tempo.

    Usa Decimal (aritmética em software) para dar exatamente o mesmo número no Windows e no
    Linux; float com pow() da biblioteca C pode diferir no último bit entre sistemas.
    """
    latest_day = date.fromisoformat(latest)
    with localcontext() as ctx:
        ctx.prec = 28
        best = Decimal(0)
        for ap in appearances:
            weeks_ago = (latest_day - date.fromisoformat(ap.date)).days // 7
            position = Decimal(ap.size - ap.rank + 1) / Decimal(ap.size)
            decay = Decimal("0.5") ** (Decimal(weeks_ago) / Decimal(POPULARITY_HALF_LIFE_WEEKS))
            best = max(best, position * decay)
        return float(best.quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN))


def eligibility(preview: JSON | None, artwork_url: str | None) -> JSON:
    """Pode ser resposta do desafio diário? Um só motivo, na ordem de gravidade."""
    if preview is None:
        return {"daily": False, "reason": "no-preview"}
    duration = preview["durationSec"]
    if duration is not None and duration - preview["startSec"] < MIN_PREVIEW_SEC:
        return {"daily": False, "reason": "short-preview"}
    if not artwork_url:
        return {"daily": False, "reason": "no-artwork"}
    return {"daily": True, "reason": None}


def _track_record(provider: str, acc: _TrackAcc, albums: dict[str, JSON], latest: str) -> JSON:
    t = acc.meta
    track_id = _id(provider, "tr", t.provider_id)
    artist_ids = [_id(provider, "ar", a.provider_id) for a in t.artists]
    album = albums[_id(provider, "al", t.album.provider_id)]
    preview = (
        None
        if t.preview_url is None
        else {"url": t.preview_url, "durationSec": t.preview_duration_sec, "startSec": 0}
    )
    dates = [ap.date for ap in acc.appearances]
    last = max(acc.appearances, key=lambda ap: ap.date)
    return {
        "id": track_id,
        "songKey": song_key(t.title, artist_ids[0]),
        "title": _display(t.title),
        "titleLatin": t.title_latin,
        "latinSource": "provider" if t.title_latin else None,
        "artistIds": artist_ids,
        "artistDisplay": " & ".join(_display(a.name) for a in t.artists),
        "albumId": album["id"],
        "releaseDate": t.album.release_date,
        "durationMs": t.duration_ms,
        "explicit": t.explicit,
        "isrc": acc.isrc,
        "preview": preview,
        "chart": {
            "firstSeen": min(dates),
            "lastSeen": last.date,
            "bestRank": min(ap.rank for ap in acc.appearances),
            "lastRank": last.rank,
            "appearances": len(acc.appearances),
            "inLatest": last.date == latest,
        },
        "popularity": popularity(acc.appearances, latest),
        "eligible": eligibility(preview, album["artworkUrl"]),
        "similar": [],
        "search": {
            "title": search_keys([t.title, t.title_latin]),
            "artist": search_keys([n for a in t.artists for n in (a.name, a.name_latin)]),
        },
    }


def catalog_version(catalog: JSON) -> str:
    """Data do último snapshot + 8 hex do SHA-256 do conteúdo (sem o próprio campo)."""
    body = {k: v for k, v in catalog.items() if k != "catalogVersion"}
    digest = hashlib.sha256(dumps(body).encode("utf-8")).hexdigest()[:8]
    return f"{catalog['snapshots'][-1]['date']}.{digest}"


def build_catalog(snapshots: Sequence[ChartSnapshot], provider: str, storefront: str) -> JSON:
    check_snapshots(snapshots)
    ordered = sorted(snapshots, key=lambda s: s.date)
    latest = ordered[-1]

    artists: dict[str, JSON] = {}
    albums: dict[str, JSON] = {}
    tracks: dict[str, _TrackAcc] = {}

    for snap in ordered:
        # Da pior para a melhor posição: se duas entradas do mesmo snapshot discordam sobre um
        # álbum ou artista, vale a de menor posição (processada por último). Entre snapshots,
        # vale o mais novo, pela mesma lógica.
        for entry in sorted(snap.entries, key=lambda e: -e.rank):
            t = entry.track
            for a in t.artists:
                artists[_id(provider, "ar", a.provider_id)] = _artist_record(provider, a)
            albums[_id(provider, "al", t.album.provider_id)] = _album_record(
                provider, t.album, t.artists
            )
            acc = tracks.get(t.provider_id)
            if acc is None:
                acc = tracks[t.provider_id] = _TrackAcc(meta=t, isrc=t.isrc)
            acc.meta = t  # previewUrl nulo sobrescreve: afeta a elegibilidade de propósito
            acc.isrc = t.isrc or acc.isrc  # isrc nulo não apaga um código já conhecido
            acc.appearances.append(_Appearance(snap.date, entry.rank, snap.size))

    catalog: JSON = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": latest.fetched_at,
        "provider": provider,
        "storefront": storefront,
        "snapshots": [
            {
                "id": s.id,
                "date": s.date,
                "fetchedAt": s.fetched_at,
                "chart": s.chart,
                "size": s.size,
            }
            for s in ordered
        ],
        "artists": [artists[k] for k in sorted(artists)],
        "albums": [albums[k] for k in sorted(albums)],
        "tracks": sorted(
            (_track_record(provider, acc, albums, latest.date) for acc in tracks.values()),
            key=lambda r: r["id"],
        ),
    }
    catalog["catalogVersion"] = catalog_version(catalog)
    return catalog
