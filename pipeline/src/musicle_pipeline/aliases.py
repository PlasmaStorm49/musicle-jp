"""Curadoria manual: corrige romaji, acrescenta apelidos e bloqueia.

Um aliases.toml por provedor (pipeline/fixtures/ e pipeline/data/apple/): os IDs de um não
existem no outro.

Formato (por ID do catálogo):

    [tracks."fixture:tr:tr22"]
    latin = "Tokyo Lights"       # título latino exibido; vence o provedor e o romaji automático
    aliases = ["tokyo raitsu"]   # termos extras de busca
    block = true                 # tira a faixa do desafio diário (reason "blocked")
"""

from __future__ import annotations

import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from musicle_pipeline.models import InputError

KINDS = ("tracks", "albums", "artists")
_ALLOWED_KEYS = {
    "tracks": {"latin", "aliases", "block"},
    "albums": {"latin", "aliases"},
    "artists": {"latin", "aliases"},
}


@dataclass(frozen=True)
class Alias:
    latin: str | None = None
    aliases: tuple[str, ...] = ()
    block: bool = False


_EMPTY = Alias()


@dataclass(frozen=True)
class Aliases:
    entries: Mapping[str, Mapping[str, Alias]] = field(default_factory=dict)

    def get(self, kind: str, entity_id: str) -> Alias:
        return self.entries.get(kind, {}).get(entity_id, _EMPTY)

    def ids(self, kind: str) -> set[str]:
        return set(self.entries.get(kind, {}))


def _parse_entry(kind: str, entity_id: str, raw: Any, where: str) -> Alias:
    if not isinstance(raw, dict):
        raise InputError(f"{where}: [{kind}.{entity_id!r}] deveria ser uma tabela")
    unknown = set(raw) - _ALLOWED_KEYS[kind]
    if unknown:
        raise InputError(f"{where}: [{kind}.{entity_id!r}] chave desconhecida: {sorted(unknown)}")
    latin = raw.get("latin")
    aliases = raw.get("aliases", [])
    block = raw.get("block", False)
    if latin is not None and (not isinstance(latin, str) or not latin.strip()):
        raise InputError(f"{where}: [{kind}.{entity_id!r}] latin deveria ser texto não vazio")
    if not isinstance(aliases, list) or not all(isinstance(a, str) and a.strip() for a in aliases):
        raise InputError(f"{where}: [{kind}.{entity_id!r}] aliases deveria ser lista de textos")
    if not isinstance(block, bool):
        raise InputError(f"{where}: [{kind}.{entity_id!r}] block deveria ser true ou false")
    return Alias(latin=latin.strip() if latin else None, aliases=tuple(aliases), block=block)


def parse_aliases(text: str, where: str = "aliases.toml") -> Aliases:
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise InputError(f"{where}: TOML inválido: {exc}") from None
    unknown = set(data) - set(KINDS)
    if unknown:
        raise InputError(f"{where}: seção desconhecida: {sorted(unknown)} (use {list(KINDS)})")
    return Aliases(
        {
            kind: {
                eid: _parse_entry(kind, eid, raw, where) for eid, raw in data.get(kind, {}).items()
            }
            for kind in KINDS
        }
    )


def load_aliases(path: Path) -> Aliases:
    """Arquivo ausente = nenhuma curadoria."""
    if not path.exists():
        return Aliases()
    return parse_aliases(path.read_bytes().decode("utf-8"), str(path))
