"""Monta o catálogo como uma redução pura de TODOS os snapshots.

Não existe "atualizar o catálogo anterior": todo build parte do zero. Assim, mudar uma regra
(por exemplo, a normalização) atualiza todas as faixas, e o resultado depende só da entrada:
os snapshots, o cache de romaji e a curadoria manual.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal, localcontext

from musicle_pipeline.aliases import KINDS, Aliases
from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import (
    JSON,
    ChartSnapshot,
    InputError,
    RawArtist,
    RawTrack,
    check_snapshots,
)
from musicle_pipeline.normalize import display, search_keys, song_key
from musicle_pipeline.romaji_cache import RomajiCache, album_text, artist_text, track_text
from musicle_pipeline.similarity import album_similar, track_similar

SCHEMA_VERSION = 1
MIN_PREVIEW_SEC = 16  # o trecho mais longo do jogo tem 16 s
POPULARITY_HALF_LIFE_WEEKS = 8


@dataclass(frozen=True)
class Curation:
    """Tudo que vem de fora dos snapshots: romaji gerado e correções manuais."""

    romaji: RomajiCache = field(default_factory=RomajiCache)
    aliases: Aliases = field(default_factory=Aliases)

    def latin(
        self, kind: str, entity_id: str, text: str, from_provider: str | None
    ) -> tuple[str | None, str | None]:
        """Título latino exibido e sua origem: manual > provedor > romaji automático."""
        alias = self.aliases.get(kind, entity_id)
        if alias.latin:
            return alias.latin, "manual"
        if from_provider:
            return from_provider, "provider"
        variants = self.romaji.variants(text)
        if variants:
            return variants[0], self.romaji.engine
        return None, None

    def search_texts(
        self, kind: str, entity_id: str, text: str, from_provider: str | None
    ) -> list[str | None]:
        """Tudo que deve achar a entidade na busca, não só o que é exibido."""
        alias = self.aliases.get(kind, entity_id)
        return [text, from_provider, alias.latin, *alias.aliases, *self.romaji.variants(text)]


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


def _artist_record(provider: str, a: RawArtist, cur: Curation) -> JSON:
    artist_id = _id(provider, "ar", a.provider_id)
    text = artist_text(a.name)
    latin, source = cur.latin("artists", artist_id, text, a.name_latin)
    return {
        "id": artist_id,
        "name": display(a.name),
        "nameLatin": latin,
        "latinSource": source,
        "search": search_keys(cur.search_texts("artists", artist_id, text, a.name_latin)),
    }


def artist_display_of(t: RawTrack) -> str:
    """Como os artistas da faixa aparecem: a grafia do provedor, ou a junção dos nomes."""
    return display(t.artist_display) if t.artist_display else _joined(t.artists)


def _joined(artists: Sequence[RawArtist]) -> str:
    return " & ".join(display(a.name) for a in artists)


def _album_record(provider: str, t: RawTrack, cur: Curation) -> JSON:
    al, artists = t.album, t.artists
    # Single e EP são a própria faixa: herdam a grafia de parceria. Num álbum completo, uma
    # faixa "feat." não pode virar o artista do álbum inteiro.
    shown = artist_display_of(t) if al.type in ("single", "ep") else _joined(artists)
    album_id = _id(provider, "al", al.provider_id)
    text = album_text(al.title)
    latin, source = cur.latin("albums", album_id, text, al.title_latin)
    return {
        "id": album_id,
        "title": display(al.title),
        "titleLatin": latin,
        "latinSource": source,
        "artistIds": [_id(provider, "ar", a.provider_id) for a in artists],
        "artistDisplay": shown,
        "type": al.type,
        "releaseDate": al.release_date,
        "artworkUrl": al.artwork_url,
        "similar": [],
        "search": search_keys(cur.search_texts("albums", album_id, text, al.title_latin)),
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


def eligibility(preview: JSON | None, artwork_url: str | None, blocked: bool = False) -> JSON:
    """Pode ser resposta do desafio diário? Um só motivo, na ordem de gravidade."""
    if blocked:
        return {"daily": False, "reason": "blocked"}  # decisão manual vence as outras
    if preview is None:
        return {"daily": False, "reason": "no-preview"}
    duration = preview["durationSec"]
    if duration is not None and duration - preview["startSec"] < MIN_PREVIEW_SEC:
        return {"daily": False, "reason": "short-preview"}
    if not artwork_url:
        return {"daily": False, "reason": "no-artwork"}
    return {"daily": True, "reason": None}


def _track_record(
    provider: str, acc: _TrackAcc, albums: dict[str, JSON], latest: str, cur: Curation
) -> JSON:
    t = acc.meta
    track_id = _id(provider, "tr", t.provider_id)
    artist_ids = [_id(provider, "ar", a.provider_id) for a in t.artists]
    album = albums[_id(provider, "al", t.album.provider_id)]
    text = track_text(t.title)
    latin, source = cur.latin("tracks", track_id, text, t.title_latin)
    preview = (
        None
        if t.preview_url is None
        else {"url": t.preview_url, "durationSec": t.preview_duration_sec, "startSec": 0}
    )
    dates = [ap.date for ap in acc.appearances]
    last = max(acc.appearances, key=lambda ap: ap.date)
    artist_texts = [
        s
        for a, aid in zip(t.artists, artist_ids, strict=True)
        for s in cur.search_texts("artists", aid, artist_text(a.name), a.name_latin)
    ]
    if t.artist_display:
        # A grafia de parceria ("A & B") também acha a faixa, com o romaji dela.
        shown = artist_text(t.artist_display)
        artist_texts += [shown, *cur.romaji.variants(shown)]
    return {
        "id": track_id,
        "songKey": song_key(t.title, artist_ids[0]),
        "title": text,
        "titleLatin": latin,
        "latinSource": source,
        "artistIds": artist_ids,
        "artistDisplay": artist_display_of(t),
        "albumId": album["id"],
        "releaseDate": t.album.release_date,
        "durationMs": t.duration_ms,
        "explicit": t.explicit,
        "isrc": acc.isrc,
        "preview": preview,
        "storeUrl": t.store_url,
        "chart": {
            "firstSeen": min(dates),
            "lastSeen": last.date,
            "bestRank": min(ap.rank for ap in acc.appearances),
            "lastRank": last.rank,
            "appearances": len(acc.appearances),
            "inLatest": last.date == latest,
        },
        "popularity": popularity(acc.appearances, latest),
        "eligible": eligibility(
            preview, album["artworkUrl"], blocked=cur.aliases.get("tracks", track_id).block
        ),
        "similar": [],
        "search": {
            "title": search_keys(cur.search_texts("tracks", track_id, text, t.title_latin)),
            "artist": search_keys(artist_texts),
        },
    }


def catalog_version(catalog: JSON) -> str:
    """Data do último snapshot + 8 hex do SHA-256 do conteúdo (sem o próprio campo)."""
    body = {k: v for k, v in catalog.items() if k != "catalogVersion"}
    digest = hashlib.sha256(dumps(body).encode("utf-8")).hexdigest()[:8]
    return f"{catalog['snapshots'][-1]['date']}.{digest}"


def build_catalog(
    snapshots: Sequence[ChartSnapshot],
    provider: str,
    storefront: str,
    curation: Curation | None = None,
) -> JSON:
    cur = curation or Curation()
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
                artists[_id(provider, "ar", a.provider_id)] = _artist_record(provider, a, cur)
            albums[_id(provider, "al", t.album.provider_id)] = _album_record(provider, t, cur)
            acc = tracks.get(t.provider_id)
            if acc is None:
                acc = tracks[t.provider_id] = _TrackAcc(meta=t, isrc=t.isrc)
            acc.meta = t  # previewUrl nulo sobrescreve: afeta a elegibilidade de propósito
            acc.isrc = t.isrc or acc.isrc  # isrc nulo não apaga um código já conhecido
            acc.appearances.append(_Appearance(snap.date, entry.rank, snap.size))

    track_ids = {_id(provider, "tr", pid) for pid in tracks}
    existing = {"tracks": track_ids, "albums": set(albums), "artists": set(artists)}
    stale = [f"{k}: {eid}" for k in KINDS for eid in sorted(cur.aliases.ids(k) - existing[k])]
    if stale:
        raise InputError("aliases.toml cita IDs que não existem no catálogo:\n" + "\n".join(stale))

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
            (_track_record(provider, acc, albums, latest.date, cur) for acc in tracks.values()),
            key=lambda r: r["id"],
        ),
    }
    # Distratores por último: dependem da popularidade e da elegibilidade de todas as faixas.
    for track_id, similar in track_similar(catalog["tracks"], albums).items():
        next(t for t in catalog["tracks"] if t["id"] == track_id)["similar"] = similar
    for album_id, similar in album_similar(catalog["albums"], catalog["tracks"]).items():
        albums[album_id]["similar"] = similar
    catalog["catalogVersion"] = catalog_version(catalog)
    return catalog
