"""Busca a parada real (RSS da Apple + iTunes lookup) e monta o snapshot do dia.

ÚNICO módulo do pipeline que usa a rede. Os outros comandos (build, validate, schedule,
romanize --check) nunca o importam: leem os snapshots gravados e ficam determinísticos (um teste
em subprocesso confere). Só a biblioteca padrão (urllib): dependência nova pediria versão
exata com 14 dias ou mais, de cada pacote e de todas as indiretas (P60).

Nunca acessa o `previewUrl` (termos da Apple, regra inviolável 8): o áudio é só do navegador.
"""

from __future__ import annotations

import http.client
import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from datetime import date
from urllib.parse import urlencode

from musicle_pipeline.io_json import loads
from musicle_pipeline.models import JSON
from musicle_pipeline.providers.apple import CHART, STOREFRONT, is_apple_url

RSS_URL = (
    "https://rss.marketingtools.apple.com/api/v2/{storefront}/music/most-played/100/songs.json"
)
LOOKUP_URL = "https://itunes.apple.com/lookup"
USER_AGENT = "musicle-jp-pipeline (+https://github.com/PlasmaStorm49/musicle-jp)"
TIMEOUT_SEC = 30
MAX_BYTES = 5 * 1024 * 1024
LOOKUP_BATCH = 200  # o lookup aceitou 200 ids numa chamada (pesquisa de 10/10/2026)
MIN_ITEMS = 50  # parada com menos itens que isto é resposta quebrada
MAX_MISSING = 0.2  # mais que 20% sem lookup: algo mudou na Apple; nada é gravado

# Campos guardados do lookup (o resto da resposta é jogado fora).
REQUIRED = (
    "trackId",
    "trackName",
    "artistId",
    "artistName",
    "collectionId",
    "collectionName",
    "releaseDate",
    "trackTimeMillis",
)
OPTIONAL = (
    "collectionArtistName",
    "trackExplicitness",
    "previewUrl",
    "artworkUrl100",
    "trackViewUrl",
)
# URL guardada → tipo de host aceito (fonte única em providers/apple.py, a mesma que o
# validate usa no catálogo). Qualquer outro host recusa o snapshot inteiro.
URL_KINDS = {"previewUrl": "preview", "artworkUrl100": "artwork", "trackViewUrl": "store"}

Transport = Callable[[str], bytes]


class FetchError(RuntimeError):
    """A busca falhou ou a resposta não tem a forma esperada; nada foi gravado."""


def http_get(url: str) -> bytes:
    """Transporte padrão: GET com timeout, User-Agent do projeto e teto de tamanho."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SEC) as response:
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise FetchError(f"resposta maior que {MAX_BYTES} bytes: {url}")
    return body


def _get_json(url: str, transport: Transport, sleep: Callable[[float], None], tries: int) -> JSON:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            data = loads(transport(url))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise FetchError(f"JSON inválido em {url}: {exc}") from None
        except urllib.error.HTTPError as exc:
            # 429 (limite) e 5xx passam com o tempo; 4xx não: repetir só atrasaria o erro.
            if exc.code != 429 and exc.code < 500:
                raise FetchError(f"HTTP {exc.code} em {url}") from None
            last = exc
        except (
            urllib.error.URLError,
            http.client.HTTPException,
            TimeoutError,
            ConnectionError,
        ) as exc:
            last = exc
        else:
            if not isinstance(data, dict):
                raise FetchError(f"resposta com forma inesperada em {url}")
            return data
        if attempt + 1 < tries:
            sleep(5 * (attempt + 1))  # espera crescente; o lookup tem limite por minuto
    raise FetchError(f"falha de rede em {url}: {last}")


def _lookup_url(ids: Sequence[str]) -> str:
    # Ids ordenados: a mesma consulta vira a mesma URL (cache da Apple, max-age de 1 dia).
    return f"{LOOKUP_URL}?{urlencode({'id': ','.join(sorted(ids)), 'country': STOREFRONT})}"


def _check_hosts(track: JSON) -> None:
    for key, kind in URL_KINDS.items():
        url = track.get(key)
        if url is not None and not (isinstance(url, str) and is_apple_url(kind, url)):
            raise FetchError(f"faixa {track['trackId']}: {key} com host inesperado: {url}")


_ISO_INSTANT = re.compile(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?")
_TEXT = ("trackName", "artistName", "collectionName")


def _valid(result: JSON) -> bool:
    """Tipos e formatos que o providers/apple.py usa: um valor torto gravado num snapshot (que
    nunca muda) quebraria o build para sempre. Faixa fora disso conta como sem lookup."""
    if any(result.get(k) in (None, "") for k in REQUIRED):
        return False
    ids_ok = all(
        re.fullmatch(r"\d+", str(result[k])) for k in ("trackId", "artistId", "collectionId")
    )
    texts_ok = all(isinstance(result[k], str) and result[k].strip() for k in _TEXT)
    millis = result["trackTimeMillis"]
    millis_ok = isinstance(millis, int) and not isinstance(millis, bool) and millis > 0
    date_ok = isinstance(result["releaseDate"], str) and _ISO_INSTANT.fullmatch(
        result["releaseDate"]
    )
    optional_ok = all(result.get(k) is None or isinstance(result[k], str) for k in OPTIONAL)
    return bool(ids_ok and texts_ok and millis_ok and date_ok and optional_ok)


def _trim(result: JSON) -> JSON | None:
    """Só os campos usados, todos com o tipo certo; None se faltar ou se algum vier torto."""
    if not _valid(result):
        return None
    trimmed = {k: result[k] for k in (*REQUIRED, *OPTIONAL) if result.get(k) is not None}
    trimmed["trackId"] = str(trimmed["trackId"])
    trimmed["artistId"] = str(trimmed["artistId"])
    trimmed["collectionId"] = str(trimmed["collectionId"])
    _check_hosts(trimmed)
    return trimmed


def _results(found: JSON) -> list[JSON]:
    results = found.get("results")
    if not isinstance(results, list) or not all(isinstance(r, dict) for r in results):
        raise FetchError("lookup com forma inesperada (results não é lista de objetos)")
    return results


def _batches(ids: Sequence[str]) -> list[list[str]]:
    ordered = sorted(ids)
    return [ordered[i : i + LOOKUP_BATCH] for i in range(0, len(ordered), LOOKUP_BATCH)]


def fetch_snapshot(
    today: date,
    fetched_at: str,
    transport: Transport | None = None,
    sleep: Callable[[float], None] | None = None,
    tries: int = 3,
) -> JSON:
    """Parada do dia + lookup das faixas e dos artistas, aparados. Levanta FetchError."""
    transport = transport or http_get  # procurado na hora: os testes trocam o http_get
    if sleep is None:
        import time  # só aqui: o pacote nunca lê o relógio (o sleep é injetável nos testes)

        sleep = time.sleep
    feed = _get_json(RSS_URL.format(storefront=STOREFRONT), transport, sleep, tries)
    items = feed.get("feed", {}).get("results") if isinstance(feed, dict) else None
    if not isinstance(items, list) or len(items) < MIN_ITEMS:
        raise FetchError(f"RSS com forma inesperada ou menos de {MIN_ITEMS} itens")
    rss = []
    for item in items:
        if (
            not isinstance(item, dict)
            or not re.fullmatch(r"\d+", str(item.get("id", "")))
            or not isinstance(item.get("name"), str)
        ):
            raise FetchError(f"item do RSS com forma inesperada: {item!r}")
        if any(r["id"] == str(item["id"]) for r in rss):
            continue  # id repetido: fica a 1ª posição (repetido travaria o build para sempre)
        rss.append(
            {"id": str(item["id"]), "name": item["name"], "artistName": item.get("artistName")}
        )

    tracks: JSON = {}
    for batch in _batches([r["id"] for r in rss]):
        for result in _results(_get_json(_lookup_url(batch), transport, sleep, tries)):
            if result.get("wrapperType") == "track" and result.get("kind") == "song":
                trimmed = _trim(result)
                if trimmed is not None and trimmed["trackId"] in batch:
                    tracks[trimmed["trackId"]] = trimmed
    missing = [r["id"] for r in rss if r["id"] not in tracks]
    if len(missing) > MAX_MISSING * len(rss):
        raise FetchError(
            f"{len(missing)} de {len(rss)} faixas sem lookup (limite {MAX_MISSING:.0%})"
        )

    artists: JSON = {}
    for batch in _batches(sorted({t["artistId"] for t in tracks.values()})):
        for result in _results(_get_json(_lookup_url(batch), transport, sleep, tries)):
            if result.get("wrapperType") == "artist" and result.get("artistName"):
                artists[str(result["artistId"])] = {"artistName": result["artistName"]}

    return {
        "provider": "apple",
        "storefront": STOREFRONT,
        "chart": CHART,
        "date": today.isoformat(),
        "fetchedAt": fetched_at,
        "rss": rss,
        "tracks": dict(sorted(tracks.items())),
        "artists": dict(sorted(artists.items())),
        "missing": missing,
    }
