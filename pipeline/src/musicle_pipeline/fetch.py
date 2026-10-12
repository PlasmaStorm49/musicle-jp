"""Busca a parada real (RSS da Apple + iTunes lookup) e monta o snapshot do dia.

ÚNICO módulo do pipeline que usa a rede (também no modo por artista, fetch --artists). Os
outros comandos (build, validate, schedule, romanize --check, build-artists, validate-artists)
nunca o importam: leem os snapshots gravados e ficam determinísticos (um teste
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
from musicle_pipeline.providers.apple import CHART, STOREFRONT, is_apple_url, japan_date

RSS_URL = (
    "https://rss.marketingtools.apple.com/api/v2/{storefront}/music/most-played/100/songs.json"
)
LOOKUP_URL = "https://itunes.apple.com/lookup"
USER_AGENT = "musicle-jp-pipeline (+https://github.com/PlasmaStorm49/musicle-jp)"
TIMEOUT_SEC = 30
MAX_BYTES = 5 * 1024 * 1024
LOOKUP_BATCH = 200  # o lookup aceitou 200 ids numa chamada (pesquisa de 10/10/2026)
MIN_ITEMS = 50  # parada com menos itens que isto é resposta quebrada
# O endereço pede 100. Mais que isso é resposta estranha, e o robô semanal também recusaria (a
# conferência com jq do PR): recusar aqui leva ao caminho "PR só com a agenda", que não trava.
MAX_ITEMS = 100
MAX_MISSING = 0.2  # mais que 20% sem lookup: algo mudou na Apple; nada é gravado

# Modo por artista (M13): o lookup de músicas do artista (traz as participações, até 200) e o
# dos álbuns dele, cujas músicas vêm em lotes (o limite de 200 vale por álbum, 12/10/2026).
ARTIST_LIMIT = 200
ALBUM_BATCH = 50
# Pausa entre os pedidos (e de um artista para o seguinte): a Apple documenta cerca de 20
# pedidos por minuto, e 4 s deixa folga (15 por minuto).
PACE_SEC = 4
SHRINK_MIN = 0.8  # um snapshot novo com menos de 80% das faixas do anterior é recusado

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
# validate usa no catálogo). A faixa com outro host conta como sem lookup (_hosts_ok).
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


def _lookup_url(ids: Sequence[str], entity: str | None = None, limit: int | None = None) -> str:
    # Ids ordenados: a mesma consulta vira a mesma URL (cache da Apple, max-age de 1 dia).
    query = {"id": ",".join(sorted(ids)), "country": STOREFRONT}
    if entity is not None:
        query["entity"] = entity
    if limit is not None:
        query["limit"] = str(limit)
    return f"{LOOKUP_URL}?{urlencode(query)}"


def _hosts_ok(track: JSON) -> bool:
    """URLs só nos hosts da Apple. Uma faixa fora disso conta como sem lookup (entra no limite
    de 20%): recusar a parada inteira por uma faixa a congelaria até alguém mudar o código."""
    return all(
        track.get(key) is None or (isinstance(track[key], str) and is_apple_url(kind, track[key]))
        for key, kind in URL_KINDS.items()
    )


def _real_date(text: str) -> bool:
    """A regex aceita 2026-02-30 e 25:00; a data tem de passar pela mesma conversão que o
    provedor faz depois (japan_date), senão o snapshot gravado quebraria o build."""
    try:
        japan_date(text)
    except ValueError:
        return False
    return True


# [0-9], e não \d: no Python, \d também casa dígitos de outras escritas ("١").
_ISO_INSTANT = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?")
_TEXT = ("trackName", "artistName", "collectionName")


def _valid(result: JSON) -> bool:
    """Tipos e formatos que o providers/apple.py usa: um valor torto gravado num snapshot (que
    nunca muda) quebraria o build para sempre. Faixa fora disso conta como sem lookup."""
    if any(result.get(k) in (None, "") for k in REQUIRED):
        return False
    ids_ok = all(
        re.fullmatch(r"[0-9]+", str(result[k])) for k in ("trackId", "artistId", "collectionId")
    )
    texts_ok = all(isinstance(result[k], str) and result[k].strip() for k in _TEXT)
    millis = result["trackTimeMillis"]
    millis_ok = isinstance(millis, int) and not isinstance(millis, bool) and millis > 0
    date_ok = (
        isinstance(result["releaseDate"], str)
        and _ISO_INSTANT.fullmatch(result["releaseDate"]) is not None
        and _real_date(result["releaseDate"])
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
    return trimmed if _hosts_ok(trimmed) else None


def _results(found: JSON) -> list[JSON]:
    results = found.get("results")
    if not isinstance(results, list) or not all(isinstance(r, dict) for r in results):
        raise FetchError("lookup com forma inesperada (results não é lista de objetos)")
    return results


def _artist_names(results: list[JSON], batch: Sequence[str]) -> JSON:
    """{artistId: {"artistName"}} do lookup de artistas. Como nas faixas (_valid): um valor torto
    gravado no snapshot quebraria o build para sempre; artista fora disso fica sem latino (ME50)."""
    names: JSON = {}
    for result in results:
        name = result.get("artistName")
        artist_id = str(result.get("artistId", ""))
        if (
            result.get("wrapperType") == "artist"
            and isinstance(name, str)
            and name.strip()
            and re.fullmatch(r"[0-9]+", artist_id)
            and artist_id in batch
        ):
            names[artist_id] = {"artistName": name}
    return names


def _song(result: JSON) -> JSON | None:
    if result.get("wrapperType") != "track" or result.get("kind") != "song":
        return None
    return _trim(result)


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
    if len(items) > MAX_ITEMS:
        raise FetchError(f"RSS com {len(items)} itens; o máximo é {MAX_ITEMS}")
    rss = []
    for item in items:
        if (
            not isinstance(item, dict)
            or not re.fullmatch(r"[0-9]+", str(item.get("id", "")))  # [0-9]: veja _ISO_INSTANT
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
        found = _results(_get_json(_lookup_url(batch), transport, sleep, tries))
        artists.update(_artist_names(found, batch))

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


def fetch_artist_snapshot(
    artist_id: str,
    fetched_at: str,
    transport: Transport | None = None,
    sleep: Callable[[float], None] | None = None,
    tries: int = 3,
    pace: float = PACE_SEC,
    wait_first: bool = False,
) -> JSON:
    """Todas as faixas conhecidas de um artista (M13), aparadas. Levanta FetchError.

    1. o lookup de músicas do artista: a ordem dá a prioridade das músicas e traz as
       participações (faixa de outro artista principal com ele no crédito);
    2. os álbuns dele (só os com o artistId dele: coletânea de vários artistas fica de fora);
    3. as músicas desses álbuns, em lotes (só as faixas do próprio artista);
    4. o lookup dos artistas das faixas, para o nome latino oficial.
    """
    transport = transport or http_get  # procurado na hora: os testes trocam o http_get
    if sleep is None:
        import time  # só aqui: o pacote nunca lê o relógio (o sleep é injetável nos testes)

        sleep = time.sleep
    if not re.fullmatch(r"[0-9]+", artist_id):
        raise FetchError(f"id de artista inválido: {artist_id!r}")

    def lookup(ids: Sequence[str], entity: str | None = None) -> list[JSON]:
        url = _lookup_url(ids, entity, ARTIST_LIMIT if entity else None)
        return _results(_get_json(url, transport, sleep, tries))

    if wait_first:
        sleep(pace)
    results = lookup([artist_id], "song")
    head = results[0] if results else {}
    name = head.get("artistName")
    if (
        head.get("wrapperType") != "artist"
        or str(head.get("artistId")) != artist_id
        or not isinstance(name, str)
        or not name.strip()
    ):
        raise FetchError(f"o lookup de {artist_id} não devolveu o artista no 1º resultado")
    tracks: JSON = {}
    songs: list[str] = []
    for result in results[1:]:
        found = _song(result)
        if found is not None and found["trackId"] not in tracks:
            tracks[found["trackId"]] = found
            songs.append(found["trackId"])
    if not songs:
        raise FetchError(f"o lookup de {artist_id} não trouxe nenhuma música")

    sleep(pace)
    albums: list[str] = []
    for result in lookup([artist_id], "album"):
        album_id = str(result.get("collectionId", ""))
        if (
            result.get("wrapperType") == "collection"
            and str(result.get("artistId")) == artist_id
            and re.fullmatch(r"[0-9]+", album_id)
            and album_id not in albums
        ):
            albums.append(album_id)
    albums.sort(key=int)  # a ordem da resposta pode mudar: os lotes e o diff, não
    for start in range(0, len(albums), ALBUM_BATCH):
        batch = albums[start : start + ALBUM_BATCH]
        sleep(pace)
        for result in lookup(batch, "song"):
            found = _song(result)
            if (
                found is not None
                and found["collectionId"] in batch
                and found["artistId"] == artist_id
            ):
                tracks.setdefault(found["trackId"], found)

    artists: JSON = {}
    for batch in _batches(sorted({t["artistId"] for t in tracks.values()} | {artist_id})):
        sleep(pace)
        artists.update(_artist_names(lookup(batch), batch))

    return {
        "provider": "apple",
        "storefront": STOREFRONT,
        "artistId": artist_id,
        "fetchedAt": fetched_at,
        "artist": {"artistName": name},
        "songs": songs,
        "albums": albums,
        "tracks": dict(sorted(tracks.items())),
        "artists": dict(sorted(artists.items())),
    }
