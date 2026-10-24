"""Validação do catálogo do Anime (M14): schema + invariantes, como o do catálogo da parada."""

from __future__ import annotations

from functools import cache

from jsonschema import Draft202012Validator

from musicle_pipeline.anime import MODES, SCHEMA_VERSION
from musicle_pipeline.catalog import catalog_version
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import anime_catalog_schema_path
from musicle_pipeline.validate import url_problems

# O teto do arquivo (P236), pela medida do PR A1: 1.000 músicas dão uns 2,1 MB (600, uns 1,3 MB;
# o Pages manda comprimido, umas 5 vezes menor). Passou disso, o acervo cresceu além do previsto, e
# cada versão fica no histórico do Git.
MAX_FILE_BYTES = 3 * 1024 * 1024


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(anime_catalog_schema_path())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _schema_problems(data: JSON) -> list[str]:
    errors = sorted(_validator().iter_errors(data), key=lambda e: list(e.absolute_path))
    return [f"schema: /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errors]


def _invariant_problems(data: JSON) -> list[str]:
    problems: list[str] = []
    ids = [s["id"] for s in data["snapshots"]]
    if ids != sorted(set(ids)):
        problems.append("snapshots: ids repetidos ou fora de ordem")
    if data["generatedAt"] != data["snapshots"][-1]["fetchedAt"]:
        problems.append("generatedAt deveria ser o fetchedAt do último snapshot")
    day = data["snapshots"][-1]["fetchedAt"][:10]
    if data["catalogVersion"] != catalog_version(data, day):
        problems.append("catalogVersion não bate com o conteúdo (regere com o pipeline)")
    for kind in ("franchises", "artists", "albums", "tracks"):
        ids = [e["id"] for e in data[kind]]
        if ids != sorted(set(ids)):
            problems.append(f"{kind}: ids repetidos ou fora de ordem")
    artist_ids = {a["id"] for a in data["artists"]}
    album_ids = {a["id"] for a in data["albums"]}
    franchise_ids = {f["id"] for f in data["franchises"]}
    for al in data["albums"]:
        problems += [
            f"{al['id']}: artista inexistente {a}" for a in al["artistIds"] if a not in artist_ids
        ]
    used_albums: set[str] = set()
    used_franchises: set[str] = set()
    for t in data["tracks"]:
        tid = t["id"]
        used_albums.add(t["albumId"])
        if t["albumId"] not in album_ids:
            problems.append(f"{tid}: álbum inexistente {t['albumId']}")
        problems += [
            f"{tid}: artista inexistente {a}" for a in t["artistIds"] if a not in artist_ids
        ]
        if not t["songKey"].endswith("|" + t["artistIds"][0]):
            problems.append(f"{tid}: songKey deveria terminar com o 1º artista")
        if not t["search"]["title"]:
            problems.append(f"{tid}: sem chave de busca (não daria para digitar)")
        for fid in t["anime"]["franchiseIds"]:
            used_franchises.add(fid)
            if fid not in franchise_ids:
                problems.append(f"{tid}: franquia inexistente {fid}")
        if all(t["anime"]["tiers"][mode] is None for mode in MODES):
            problems.append(f"{tid}: sem faixa em nenhum modo")
        # A muito conhecida (a régua das Misturadas, M17) é sempre uma do Fácil do modo.
        famous = t["anime"].get("famous", {})
        problems += [
            f"{tid}: muito conhecida no {mode} sem ser do Fácil"
            for mode in MODES
            if famous.get(mode) and t["anime"]["tiers"][mode] != "facil"
        ]
    problems += [f"{a}: álbum sem faixa" for a in sorted(album_ids - used_albums)]
    problems += [f"{f}: franquia sem faixa" for f in sorted(franchise_ids - used_franchises)]
    names: dict[str, list[str]] = {}
    for f in data["franchises"]:
        names.setdefault(f["name"], []).append(f["id"])
    problems += [
        f"franquias com o mesmo nome: {sorted(ids)} (o jogador não as distinguiria)"
        for name, ids in sorted(names.items())
        if len(ids) > 1
    ]
    return problems


def validate_anime_catalog(data: JSON, raw: bytes | None = None) -> list[str]:
    """Problemas do catálogo do Anime; vazia quando está tudo certo. Com `raw`, confere também
    a forma canônica e o tamanho."""
    if data.get("schemaVersion") != SCHEMA_VERSION:
        return [f"schemaVersion {data.get('schemaVersion')!r}; esperado {SCHEMA_VERSION}"]
    problems = _schema_problems(data)
    if problems:
        return problems  # sem a forma certa, as invariantes quebrariam com KeyError
    problems = _invariant_problems(data)
    problems += url_problems(data["provider"], data["albums"], data["tracks"])
    if raw is not None:
        if len(raw) > MAX_FILE_BYTES:
            problems.append(f"arquivo com {len(raw)} bytes; o teto é {MAX_FILE_BYTES}")
        if dumps(data).encode("utf-8") != raw:
            problems.append("arquivo fora da forma canônica (regere com o pipeline)")
    return problems
