"""Validação do catálogo: schema JSON (forma) + invariantes (coerência entre campos)."""

from __future__ import annotations

from datetime import date
from functools import cache

from jsonschema import Draft202012Validator

from musicle_pipeline.catalog import catalog_version
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import catalog_schema_path


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(catalog_schema_path())
    Draft202012Validator.check_schema(schema)  # o próprio schema também é testado
    return Draft202012Validator(schema)


def _schema_problems(catalog: JSON) -> list[str]:
    errors = sorted(_validator().iter_errors(catalog), key=lambda e: list(e.absolute_path))
    return [f"schema: /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errors]


def _invariant_problems(catalog: JSON) -> list[str]:
    """Regras que o JSON Schema não consegue expressar."""
    problems: list[str] = []
    snapshots = catalog["snapshots"]
    snap_dates = [s["date"] for s in snapshots]
    if snap_dates != sorted(set(snap_dates)):
        problems.append("snapshots fora de ordem ou com data repetida")
    for d in snap_dates:
        try:
            date.fromisoformat(d)
        except ValueError:
            problems.append(f"data inválida: {d}")
    sizes = {s["date"]: s["size"] for s in snapshots}
    if catalog["generatedAt"] != snapshots[-1]["fetchedAt"]:
        problems.append("generatedAt deveria ser o fetchedAt do último snapshot")

    for kind in ("artists", "albums", "tracks"):
        ids = [e["id"] for e in catalog[kind]]
        if ids != sorted(set(ids)):
            problems.append(f"{kind}: ids repetidos ou fora de ordem")
    artist_ids = {a["id"] for a in catalog["artists"]}
    album_ids = {a["id"] for a in catalog["albums"]}

    for al in catalog["albums"]:
        for aid in al["artistIds"]:
            if aid not in artist_ids:
                problems.append(f"{al['id']}: artista inexistente {aid}")

    used_albums: set[str] = set()
    for t in catalog["tracks"]:
        tid, chart = t["id"], t["chart"]
        used_albums.add(t["albumId"])
        if t["albumId"] not in album_ids:
            problems.append(f"{tid}: álbum inexistente {t['albumId']}")
        for aid in t["artistIds"]:
            if aid not in artist_ids:
                problems.append(f"{tid}: artista inexistente {aid}")
        if not t["songKey"].endswith("|" + t["artistIds"][0]):
            problems.append(f"{tid}: songKey deveria terminar com |{t['artistIds'][0]}")
        if chart["firstSeen"] not in sizes or chart["lastSeen"] not in sizes:
            problems.append(f"{tid}: firstSeen/lastSeen precisam ser datas de snapshot")
            continue
        if chart["firstSeen"] > chart["lastSeen"]:
            problems.append(f"{tid}: firstSeen depois de lastSeen")
        if chart["lastRank"] > sizes[chart["lastSeen"]]:
            problems.append(f"{tid}: lastRank maior que o size do snapshot")
        if chart["bestRank"] > chart["lastRank"]:
            problems.append(f"{tid}: bestRank pior que lastRank")
        if chart["appearances"] > len(snapshots):
            problems.append(f"{tid}: mais aparições que snapshots")
        if chart["inLatest"] != (chart["lastSeen"] == snap_dates[-1]):
            problems.append(f"{tid}: inLatest incoerente com lastSeen")

    for aid in sorted(album_ids - used_albums):
        problems.append(f"{aid}: álbum sem nenhuma faixa")

    if catalog["catalogVersion"] != catalog_version(catalog):
        problems.append("catalogVersion não bate com o conteúdo (o arquivo foi editado à mão?)")
    return problems


def validate_catalog(catalog: JSON, raw: bytes | None = None) -> list[str]:
    """Lista de problemas; vazia quando está tudo certo.

    Com `raw` (os bytes do arquivo), confere também a forma canônica: um arquivo editado à
    mão quase sempre muda espaços ou ordem de chaves, e isso aparece aqui.
    """
    problems = _schema_problems(catalog)
    if problems:
        return problems  # sem a forma certa, as invariantes quebrariam com KeyError
    problems = _invariant_problems(catalog)
    if raw is not None and dumps(catalog).encode("utf-8") != raw:
        problems.append("arquivo fora da forma canônica (regere com o pipeline)")
    return problems
