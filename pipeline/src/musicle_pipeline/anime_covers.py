"""As capas dos animes (o Anime Royale, o usuário, 01/11/2026).

O Royale mostra cada opção pela capa do anime dela. A capa vem do AnimeThemes, que a copia da
AniList (a pesquisa de 01/11/2026): o repositório guarda só o caminho de cada arquivo, nunca a
imagem, e o navegador a carrega direto do host deles (a base fica no web, num lugar só). São duas
por anime: a pequena (100 px de largura, a da grade) e a grande (460 px, a do pop-up).

Um arquivo à parte dos snapshots, que só crescem e recusam chave nova: o `fetch --anime-covers`
(com rede) acrescenta as capas dos animes que ainda não têm, e o `build-anime` as põe em cada
tema do catálogo. Nas fixtures, o arquivo é escrito à mão, com as capas falsas que o
`fake-assets` desenha.

Formato (pipeline/fixtures/anime/ e pipeline/data/apple/anime/):

    {
      "covers": {"<id do MAL>": {"large": "anime/large-cover/<arquivo>", "small": "..."}},
      "provider": "apple"
    }
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON, InputError

SIZES = ("small", "large")
# A chave do arquivo: o id do MAL, só algarismos ASCII (o isdigit aceitaria o "²").
_MAL_ID = re.compile(r"[1-9][0-9]*")
# Os caminhos aceitos, por provedor: o do AnimeThemes (letras e números, como em 01/11/2026) e o
# das capas falsas das fixtures (o slug, em SVG). Nada de "..", "//" nem esquema: a URL se monta
# com a base do web, e um caminho fora do padrão poderia apontar para outro lugar (regra 5).
_PATHS = {
    "apple": re.compile(r"anime/(small|large)-cover/[A-Za-z0-9]+\.(?:avif|png|jpe?g|webp)"),
    "fixture": re.compile(r"anime/(small|large)-cover/[a-z0-9_]+\.svg"),
}


@dataclass(frozen=True)
class Cover:
    small: str
    large: str

    def record(self) -> JSON:
        return {"large": self.large, "small": self.small}


def path_problem(provider: str, size: str, path: object) -> str | None:
    """O que há de errado no caminho da capa `size` do provedor (None: nada)."""
    pattern = _PATHS.get(provider)
    if pattern is None:
        return f"o provedor {provider} não tem capas"
    if not isinstance(path, str):
        return f"a capa {size} não é texto"
    match = pattern.fullmatch(path)
    if match is None or match.group(1) != size:
        return f"a capa {size} fora do padrão: {path!r}"
    return None


def cover_problems(provider: str, value: object, where: str) -> list[str]:
    """Os problemas de uma capa ({small, large}) do provedor."""
    if not isinstance(value, dict) or set(value) != set(SIZES):
        return [f"{where}: a capa tem de ter só {list(SIZES)}"]
    return [
        f"{where}: {problem}"
        for size in SIZES
        if (problem := path_problem(provider, size, value[size])) is not None
    ]


def load_covers(path: Path, provider: str) -> dict[int, Cover]:
    """As capas do arquivo do provedor, pelo id do MAL. Sem o arquivo, nenhuma: o anime sem capa
    só fica fora do Royale."""
    if not path.exists():
        return {}
    data = read_json(path)
    if not isinstance(data, dict) or set(data) != {"covers", "provider"}:
        raise InputError(f"{path}: esperado {{covers, provider}}")
    if data["provider"] != provider:
        raise InputError(f"{path}: as capas são do provedor {data['provider']!r}, não {provider}")
    items = data["covers"]
    if not isinstance(items, dict):
        raise InputError(f"{path}: covers não é um objeto")
    covers: dict[int, Cover] = {}
    for key, value in items.items():
        if _MAL_ID.fullmatch(key) is None:
            raise InputError(f"{path}: a chave {key!r} não é um id do MAL")
        problems = cover_problems(provider, value, f"{path}: {key}")
        if problems:
            raise InputError("\n".join(problems))
        covers[int(key)] = Cover(small=value["small"], large=value["large"])
    return covers


def covers_file(provider: str, covers: Mapping[int, Cover]) -> JSON:
    """O arquivo das capas (o `dumps` ordena as chaves)."""
    return {"covers": {str(k): covers[k].record() for k in covers}, "provider": provider}
