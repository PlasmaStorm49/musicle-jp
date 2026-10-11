"""Validação do catálogo: schema JSON (forma) + invariantes (coerência entre campos)."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import date
from functools import cache, partial

from jsonschema import Draft202012Validator

from musicle_pipeline.catalog import catalog_version
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import catalog_schema_path
from musicle_pipeline.providers.apple import is_apple_url
from musicle_pipeline.similarity import MIN_OPTIONS, album_profiles, title_of


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

    problems.extend(_similar_problems(catalog))

    if catalog["catalogVersion"] != catalog_version(catalog):
        problems.append("catalogVersion não bate com o conteúdo (o arquivo foi editado à mão?)")
    return problems


def _disjoint(groups: list[frozenset[str]]) -> bool:
    seen: set[str] = set()
    for g in groups:
        if g & seen:
            return False
        seen |= g
    return True


def _similar_problems(catalog: JSON) -> list[str]:
    """Distratores: existem, não se parecem demais com a resposta e bastam para 4 opções."""
    problems: list[str] = []
    tracks = {t["id"]: t for t in catalog["tracks"]}
    albums = {a["id"]: a for a in catalog["albums"]}
    profiles = album_profiles(catalog["albums"], catalog["tracks"])

    for t in catalog["tracks"]:
        me = frozenset(t["artistIds"])
        groups = []
        for sid in t["similar"]:
            c = tracks.get(sid)
            if c is None or sid == t["id"]:
                problems.append(f"{t['id']}: distrator inválido {sid}")
                continue
            groups.append(frozenset(c["artistIds"]))
            if me & groups[-1]:
                problems.append(f"{t['id']}: distrator {sid} tem artista em comum")
            if title_of(c["songKey"]) == title_of(t["songKey"]):
                problems.append(f"{t['id']}: distrator {sid} tem o mesmo título")
            if not c["eligible"]["daily"]:
                problems.append(f"{t['id']}: distrator {sid} não é elegível")
        if not _disjoint(groups):
            problems.append(f"{t['id']}: distratores com artista repetido")
        titles = [title_of(tracks[s]["songKey"]) for s in t["similar"] if s in tracks]
        if len(set(titles)) != len(titles):
            problems.append(f"{t['id']}: distratores com título repetido entre si")
        if t["eligible"]["daily"] and len(t["similar"]) < MIN_OPTIONS:
            problems.append(
                f"{t['id']}: só {len(t['similar'])} distrator(es), mínimo {MIN_OPTIONS}"
            )
        album = albums.get(t["albumId"])  # álbum inexistente já foi relatado acima
        if t["eligible"]["daily"] and album and len(album["similar"]) < MIN_OPTIONS:
            problems.append(
                f"{t['albumId']}: álbum de resposta com menos de {MIN_OPTIONS} distratores"
            )

    for al in catalog["albums"]:
        me = profiles[al["id"]]
        groups = []
        for sid in al["similar"]:
            other = profiles.get(sid)
            if other is None or sid == al["id"] or not albums[sid]["artworkUrl"]:
                problems.append(f"{al['id']}: distrator inválido {sid}")
                continue
            groups.append(other["artists"])
            if me["artists"] & other["artists"]:
                problems.append(f"{al['id']}: distrator {sid} tem artista em comum")
            if me["songKeys"] & other["songKeys"]:
                problems.append(f"{al['id']}: distrator {sid} tem música em comum")
            if me["title"] == other["title"]:
                problems.append(f"{al['id']}: distrator {sid} tem o mesmo título")
        if not _disjoint(groups):
            problems.append(f"{al['id']}: distratores com artista repetido")
        titles = [profiles[s]["title"] for s in al["similar"] if s in profiles]
        if len(set(titles)) != len(titles):
            problems.append(f"{al['id']}: distratores com título repetido entre si")
    return problems


def _relative(pattern: str) -> Callable[[str], bool]:
    rx = re.compile(pattern)
    return lambda url: rx.fullmatch(url) is not None


# Onde cada provedor pode apontar. As URLs vão parar em <img>, no áudio e num href: sem esta
# lista, o schema aceitaria até "javascript:...". Os hosts da Apple têm fonte única no provedor
# (o fetch usa a mesma função antes de gravar o snapshot).
_URL_RULES: dict[str, dict[str, Callable[[str], bool] | None]] = {
    "fixture": {
        # Nome de arquivo sem "..": nada de subir de pasta (fixtures/audio/../x).
        "preview": _relative(r"fixtures/audio/(?!.*\.\.)[\w.-]+"),
        "artwork": _relative(r"fixtures/art/(?!.*\.\.)[\w.-]+"),
        "store": None,  # a parada fictícia não tem loja
    },
    "apple": {kind: partial(is_apple_url, kind) for kind in ("preview", "artwork", "store")},
}


def _url_problems(catalog: JSON) -> list[str]:
    rules = _URL_RULES.get(catalog["provider"])
    if rules is None:
        return [f"provider {catalog['provider']!r} sem regra de URLs"]

    def bad(kind: str, url: str | None) -> bool:
        rule = rules[kind]
        if url is None:
            return False
        return rule is None or not rule(url)

    problems = [
        f"{a['id']}: capa fora dos hosts do provedor: {a['artworkUrl']}"
        for a in catalog["albums"]
        if bad("artwork", a["artworkUrl"])
    ]
    for t in catalog["tracks"]:
        if t["preview"] is not None and bad("preview", t["preview"]["url"]):
            problems.append(f"{t['id']}: prévia fora dos hosts do provedor: {t['preview']['url']}")
        if bad("store", t["storeUrl"]):
            problems.append(f"{t['id']}: link da loja fora dos hosts do provedor: {t['storeUrl']}")
    return problems


def validate_catalog(catalog: JSON, raw: bytes | None = None) -> list[str]:
    """Lista de problemas; vazia quando está tudo certo.

    Com `raw` (os bytes do arquivo), confere também a forma canônica: um arquivo editado à
    mão quase sempre muda espaços ou ordem de chaves, e isso aparece aqui.
    """
    problems = _schema_problems(catalog)
    if problems:
        return problems  # sem a forma certa, as invariantes quebrariam com KeyError
    problems = _invariant_problems(catalog) + _url_problems(catalog)
    if raw is not None and dumps(catalog).encode("utf-8") != raw:
        problems.append("arquivo fora da forma canônica (regere com o pipeline)")
    return problems
