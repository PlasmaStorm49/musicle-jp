"""Distratores do modo 4 opções: para cada faixa e álbum, os candidatos mais parecidos.

"Parecido" = mesma época, popularidade próxima e mesmo tipo de lançamento, de artista diferente.
Cada lista tem no máximo 1 candidato por artista: qualquer sorteio de 3 já sai com artistas
distintos. A agenda (schedule.py) só sorteia dentro destas listas.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from musicle_pipeline.models import JSON

MAX_SIMILAR = 10
MIN_OPTIONS = 3  # o modo 4 opções precisa da resposta + 3 distratores


def _year(release_date: str) -> int:
    return int(release_date[:4])


def _year_window(a: int, b: int) -> int:
    gap = abs(a - b)
    return 0 if gap <= 2 else 1 if gap <= 5 else 2


def _pop(value: float) -> int:
    # Popularidade tem 4 casas; em inteiro, a diferença não sofre arredondamento de float.
    return round(value * 10000)


def title_of(song_key: str) -> str:
    """A parte do songKey antes do "|": o título sem sufixos, sem o artista."""
    return song_key.rsplit("|", 1)[0]


def _diversify(ordered: Iterable[tuple[str, frozenset[str]]]) -> list[str]:
    """Percorre em ordem de proximidade pulando quem tem artista já usado."""
    chosen: list[str] = []
    used: set[str] = set()
    for entity_id, artists in ordered:
        if artists & used:
            continue
        chosen.append(entity_id)
        used |= artists
        if len(chosen) == MAX_SIMILAR:
            break
    return chosen


def track_similar(tracks: list[JSON], albums: dict[str, JSON]) -> dict[str, list[str]]:
    eligible = [t for t in tracks if t["eligible"]["daily"]]
    result: dict[str, list[str]] = {}
    for t in tracks:
        artists = frozenset(t["artistIds"])
        year, pop = _year(t["releaseDate"]), _pop(t["popularity"])
        kind = albums[t["albumId"]]["type"]
        candidates = [
            c
            for c in eligible
            if c["id"] != t["id"]
            and not artists & set(c["artistIds"])
            and c["songKey"] != t["songKey"]
            and title_of(c["songKey"]) != title_of(t["songKey"])
        ]
        candidates.sort(
            key=lambda c: (
                _year_window(year, _year(c["releaseDate"])),
                abs(pop - _pop(c["popularity"])),
                albums[c["albumId"]]["type"] != kind,
                c["id"],
            )
        )
        result[t["id"]] = _diversify((c["id"], frozenset(c["artistIds"])) for c in candidates)
    return result


def album_profiles(albums: list[JSON], tracks: list[JSON]) -> dict[str, dict]:
    """Dados de cada álbum calculados a partir das faixas (não gravados no catálogo)."""
    by_album: dict[str, list[JSON]] = defaultdict(list)
    for t in tracks:
        by_album[t["albumId"]].append(t)
    profiles = {}
    for al in albums:
        own = by_album[al["id"]]
        profiles[al["id"]] = {
            "artists": frozenset(al["artistIds"]).union(*(t["artistIds"] for t in own)),
            "songKeys": frozenset(t["songKey"] for t in own),
            "pop": max((_pop(t["popularity"]) for t in own), default=0),
            "playable": any(t["eligible"]["reason"] != "blocked" for t in own),
        }
    return profiles


def album_similar(albums: list[JSON], tracks: list[JSON]) -> dict[str, list[str]]:
    profiles = album_profiles(albums, tracks)
    pool = [
        al
        for al in albums
        if al["artworkUrl"] and al["type"] != "compilation" and profiles[al["id"]]["playable"]
    ]
    result: dict[str, list[str]] = {}
    for al in albums:
        me = profiles[al["id"]]
        year = _year(al["releaseDate"])
        candidates = [
            c
            for c in pool
            if c["id"] != al["id"]
            and not me["artists"] & profiles[c["id"]]["artists"]
            and not me["songKeys"] & profiles[c["id"]]["songKeys"]
        ]
        candidates.sort(
            key=lambda c: (
                _year_window(year, _year(c["releaseDate"])),
                abs(me["pop"] - profiles[c["id"]]["pop"]),
                c["type"] != al["type"],
                c["id"],
            )
        )
        result[al["id"]] = _diversify((c["id"], profiles[c["id"]]["artists"]) for c in candidates)
    return result
