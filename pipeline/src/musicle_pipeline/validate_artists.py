"""Validação dos arquivos do modo por artista (M13): schema + invariantes, como o do catálogo."""

from __future__ import annotations

from collections.abc import Mapping
from functools import cache
from pathlib import Path

from jsonschema import Draft202012Validator

from musicle_pipeline.artists import INDEX, card_artwork
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.normalize import title_key
from musicle_pipeline.paths import artist_list_schema_path, artist_schema_path
from musicle_pipeline.validate import url_problems

# Objeto do Git acima de 1 MB é o que o GitHub recomenda evitar: cada versão fica no histórico.
MAX_FILE_BYTES = 1024 * 1024


@cache
def _validator(kind: str) -> Draft202012Validator:
    path = artist_schema_path() if kind == "artist" else artist_list_schema_path()
    schema = read_json(path)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _schema_problems(kind: str, data: JSON) -> list[str]:
    errors = sorted(_validator(kind).iter_errors(data), key=lambda e: list(e.absolute_path))
    return [f"schema: /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errors]


def _raw_problems(data: JSON, raw: bytes | None) -> list[str]:
    if raw is None:
        return []
    problems = []
    if len(raw) > MAX_FILE_BYTES:
        problems.append(f"arquivo com {len(raw)} bytes; o teto é {MAX_FILE_BYTES}")
    if dumps(data).encode("utf-8") != raw:
        problems.append("arquivo fora da forma canônica (regere com o pipeline)")
    return problems


def validate_artist_file(data: JSON, raw: bytes | None = None) -> list[str]:
    """Problemas de um arquivo de artista; vazia quando está tudo certo."""
    problems = _schema_problems("artist", data)
    if problems:
        return problems  # sem a forma certa, as invariantes quebrariam com KeyError
    for kind in ("artists", "albums", "tracks"):
        ids = [e["id"] for e in data[kind]]
        if ids != sorted(set(ids)):
            problems.append(f"{kind}: ids repetidos ou fora de ordem")
    artist_ids = {a["id"] for a in data["artists"]}
    album_ids = {a["id"] for a in data["albums"]}
    me = data["artistId"]
    if me not in artist_ids:
        problems.append(f"{me}: o artista do arquivo não está em artists")
    for al in data["albums"]:
        problems += [
            f"{al['id']}: artista inexistente {a}" for a in al["artistIds"] if a not in artist_ids
        ]
    used: set[str] = set()
    keys: set[str] = set()
    for t in data["tracks"]:
        tid = t["id"]
        used.add(t["albumId"])
        if t["albumId"] not in album_ids:
            problems.append(f"{tid}: álbum inexistente {t['albumId']}")
        problems += [
            f"{tid}: artista inexistente {a}" for a in t["artistIds"] if a not in artist_ids
        ]
        if me not in t["artistIds"]:
            problems.append(f"{tid}: o artista do arquivo ({me}) não está nos artistIds")
        if not t["songKey"].endswith("|" + me):
            problems.append(f"{tid}: songKey deveria terminar com |{me}")
        if not t["search"]["title"]:
            problems.append(f"{tid}: sem chave de busca (não daria para digitar)")
        if title_key(t["title"]) not in t["titleKeys"]:
            problems.append(f"{tid}: o title_key do título não está nos titleKeys")
        if not t["eligible"]["daily"]:
            # O índice conta toda faixa como música: uma inelegível nunca seria sorteada.
            problems.append(f"{tid}: faixa inelegível no arquivo ({t['eligible']['reason']})")
        if t["songKey"] in keys:
            problems.append(f"{tid}: songKey repetido (uma faixa por música)")
        keys.add(t["songKey"])
    problems += [f"{aid}: álbum sem nenhuma faixa" for aid in sorted(album_ids - used)]
    problems += url_problems(data["provider"], data["albums"], data["tracks"])
    return problems + _raw_problems(data, raw)


def validate_artist_list(data: JSON, raw: bytes | None = None) -> list[str]:
    problems = _schema_problems("list", data)
    if problems:
        return problems
    ids = [e["id"] for e in data["artists"]]
    files = [e["file"] for e in data["artists"]]
    if len(set(ids)) != len(ids) or len(set(files)) != len(files):
        problems.append("artista ou arquivo repetido na lista")
    if INDEX in files:
        problems.append(f"um artista não pode usar o nome {INDEX}")
    for e in data["artists"]:
        # O web monta o caminho pelo id do provedor: "apple:ar:123" → 123.json.
        if e["file"] != e["id"].rsplit(":", 1)[-1] + ".json":
            problems.append(f"{e['id']}: o arquivo deveria ser {e['id'].rsplit(':', 1)[-1]}.json")
    return problems + _raw_problems(data, raw)


def validate_artist_set(files: Mapping[str, JSON]) -> list[str]:
    """O índice e os arquivos batem entre si (nome, artista, contagem, provedor)."""
    index = files.get(INDEX)
    if index is None:
        return [f"{INDEX} ausente"]
    problems: list[str] = []
    listed = {e["file"] for e in index["artists"]}
    problems += [f"{n}: arquivo fora do {INDEX}" for n in sorted(set(files) - listed - {INDEX})]
    for e in index["artists"]:
        data = files.get(e["file"])
        if data is None:
            problems.append(f"{e['file']}: listado no {INDEX}, mas não existe")
            continue
        where = e["file"]
        if data["provider"] != index["provider"] or data["storefront"] != index["storefront"]:
            problems.append(f"{where}: provider/storefront diferentes do {INDEX}")
        if data["artistId"] != e["id"]:
            problems.append(f"{where}: artistId {data['artistId']} e o {INDEX} diz {e['id']}")
        if len(data["tracks"]) != e["songs"]:
            problems.append(f"{where}: {len(data['tracks'])} faixas e o {INDEX} diz {e['songs']}")
        me = next((a for a in data["artists"] if a["id"] == data["artistId"]), None)
        if me and (me["name"], me["nameLatin"]) != (e["name"], e["nameLatin"]):
            problems.append(f"{where}: nome diferente do {INDEX}")
        # A capa do cartão (P168) é a que a regra escolhe entre os álbuns do arquivo, cujos hosts
        # o validate_artist_file já conferiu: nunca uma URL de fora.
        if e["artworkUrl"] != card_artwork(data):
            problems.append(f"{where}: a capa do {INDEX} não é a do álbum da música mais popular")
    return problems


def validate_artist_dir(directory: Path) -> list[str]:
    """Confere a pasta publicada inteira: cada arquivo e o conjunto."""
    if not directory.is_dir():
        return [f"{directory}: pasta ausente"]
    problems: list[str] = []
    files: dict[str, JSON] = {}
    for path in sorted(directory.glob("*.json")):
        raw = path.read_bytes()
        data = read_json(path)
        check = validate_artist_list if path.name == INDEX else validate_artist_file
        found = check(data, raw)
        problems += [f"{path.name}: {p}" for p in found]
        if not found:
            files[path.name] = data
    others = sorted(p.name for p in directory.iterdir() if p.suffix != ".json")
    problems += [f"{name}: só JSON nesta pasta" for name in others]
    if not problems:
        problems += validate_artist_set(files)
    return problems
