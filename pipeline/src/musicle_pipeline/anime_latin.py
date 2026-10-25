"""O latino das músicas do Anime para os Hits e os artistas (o usuário, 24/10/2026).

A mesma música pode estar nos três acervos, e cada um a guarda à parte. O latino do Anime vem
do AnimeThemes (ou do aliases.toml do Anime), feito por pessoas, e o dos Hits e dos artistas,
do cutlet ("明け星": "Akeboshi" no Anime, "Ake hoshi" nos artistas, e "akeboshi" não a achava
na busca deles). O `anime-latin` extrai do catálogo do Anime publicado o latino de cada música,
e o `build` e o `build-artists` o leem como o latino do provedor (depois do da Apple) e na busca.

Um arquivo à parte, e não o catálogo do Anime lido pelo build: o robô refaz o catálogo do Anime
sem refazer o dos Hits, e um build que o lesse sairia diferente do catálogo dos Hits gravado. O
`latin.json` só muda pelo `anime-latin`, à mão, no mesmo PR que refaz os Hits e os artistas.

Formato (pipeline/fixtures/anime/ e pipeline/data/apple/anime/):

    {
      "catalogVersion": "<a versão do catálogo do Anime de onde saiu>",
      "provider": "apple",
      "tracks": {"<anime_latin_key>": "<latino>"}
    }
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from musicle_pipeline.artists import artist_title_key
from musicle_pipeline.catalog import anime_latin_key
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON, InputError
from musicle_pipeline.normalize import normalize

# Só o latino feito por pessoas: o do AnimeThemes ("provider") e o do aliases.toml do Anime.
HUMAN_SOURCES = ("provider", "manual")
# O NFKC não troca os travessões pelo hífen: "X –TV size-" passaria como um título sem sufixo.
_DASHES = re.compile("[‐-―−－]")


@dataclass(frozen=True)
class AnimeLatin:
    tracks: Mapping[str, str] = field(default_factory=dict)
    catalog_version: str | None = None  # a do catálogo do Anime de onde saiu


def extract_latin(catalog: JSON) -> tuple[dict[str, str], list[str]]:
    """O latino de cada música do catálogo do Anime, pela anime_latin_key, e os avisos.

    Fica de fora o título com sufixo de versão ou de crédito ("X (TV Size)", "X (feat. Y)"): o
    latino do AnimeThemes é o do tema, sem o sufixo, e o nome da faixa ficaria pela metade. Uma
    chave com dois latinos diferentes também fica de fora, com aviso: não há como escolher.
    """
    found: dict[str, set[str]] = {}
    for track in catalog["tracks"]:
        latin = track["titleLatin"]
        if not latin or track["latinSource"] not in HUMAN_SOURCES:
            continue
        title = track["title"]
        dashed = _DASHES.sub("-", title)
        if not normalize(title) or artist_title_key(dashed) != normalize(dashed):
            continue
        found.setdefault(anime_latin_key(title, track["artistIds"][0]), set()).add(latin)
    notes = [
        f"{key}: latinos diferentes {sorted(latins)}; fica sem o do Anime"
        for key, latins in sorted(found.items())
        if len(latins) > 1
    ]
    names = {key: next(iter(latins)) for key, latins in found.items() if len(latins) == 1}
    return dict(sorted(names.items())), notes


def latin_file(catalog: JSON) -> tuple[JSON, list[str]]:
    names, notes = extract_latin(catalog)
    data = {
        "catalogVersion": catalog["catalogVersion"],
        "provider": catalog["provider"],
        "tracks": names,
    }
    return data, notes


def load_latin(path: Path, provider: str) -> AnimeLatin:
    """Arquivo ausente = nenhum latino do Anime. O de outro provedor é recusado: as chaves dele
    nunca casariam, e os latinos do Anime sumiriam sem erro."""
    if not path.exists():
        return AnimeLatin()
    data = read_json(path)
    if not isinstance(data, dict) or data.get("provider") != provider:
        raise InputError(f"{path}: deveria ser o latin.json do provedor {provider}")
    tracks, version = data.get("tracks"), data.get("catalogVersion")
    if (
        not isinstance(version, str)
        or not isinstance(tracks, dict)
        or not all(
            isinstance(k, str) and isinstance(v, str) and v.strip() for k, v in tracks.items()
        )
    ):
        raise InputError(f"{path}: tracks deveria mapear a chave da música para um texto")
    return AnimeLatin(tracks=tracks, catalog_version=version)
