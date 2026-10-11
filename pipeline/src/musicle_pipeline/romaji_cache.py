"""Cache de romaji em romaji.json, versionado no Git.

Um por provedor (pipeline/fixtures/ e pipeline/data/apple/): --refresh refaz só os textos do
provedor da vez e apagaria os do outro num arquivo compartilhado.

Quem escreve: o comando `romanize`, que usa a biblioteca de romanização (extra [romaji]).
Quem lê: o `build`, que NUNCA importa a biblioteca. Assim o build continua puro e a CI não
precisa instalar o dicionário. Todo romaji novo aparece no diff para revisão.

Formato:
    {
      "engine": "cutlet",
      "versions": {"cutlet": "...", ...},
      "entries": {"<texto de exibição>": ["hepburn", "grafia estrangeira (opcional)"]}
    }
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

from musicle_pipeline.io_json import dumps, read_json, write_if_changed
from musicle_pipeline.models import ChartSnapshot, InputError
from musicle_pipeline.normalize import display, needs_romaji, strip_album_suffix


@dataclass(frozen=True)
class RomajiCache:
    engine: str | None = None
    versions: Mapping[str, str] = field(default_factory=dict)
    entries: Mapping[str, tuple[str, ...]] = field(default_factory=dict)

    def variants(self, text: str) -> tuple[str, ...]:
        return self.entries.get(text, ())

    def to_json(self) -> dict:
        return {
            "engine": self.engine,
            "versions": dict(self.versions),
            "entries": {k: list(v) for k, v in self.entries.items()},
        }


def track_text(title: str) -> str:
    return display(title)


def album_text(title: str) -> str:
    return strip_album_suffix(title)


def artist_text(name: str) -> str:
    return display(name)


def collect_texts(snapshots: Iterable[ChartSnapshot]) -> list[str]:
    """Textos com kana ou kanji que precisam de romaji, sem repetição, ordenados."""
    texts: set[str] = set()
    for snap in snapshots:
        for e in snap.entries:
            t = e.track
            texts.add(track_text(t.title))
            texts.add(album_text(t.album.title))
            texts.update(artist_text(a.name) for a in t.artists)
            if t.artist_display:
                texts.add(artist_text(t.artist_display))
    return sorted(t for t in texts if needs_romaji(t))


def load_cache(path: Path) -> RomajiCache:
    """Arquivo ausente = cache vazio."""
    if not path.exists():
        return RomajiCache()
    data = read_json(path)
    entries = data.get("entries")
    if not isinstance(entries, dict) or not all(
        isinstance(v, list) and v and all(isinstance(s, str) and s for s in v)
        for v in entries.values()
    ):
        raise InputError(f"{path}: entries deveria mapear texto para lista de textos não vazia")
    return RomajiCache(
        engine=data.get("engine"),
        versions=data.get("versions", {}),
        entries={k: tuple(v) for k, v in entries.items()},
    )


def save_cache(path: Path, cache: RomajiCache) -> bool:
    return write_if_changed(path, dumps(cache.to_json()))
