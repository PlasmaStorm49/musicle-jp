"""A busca do Anime (M14, comando `fetch --anime`): sorteia animes, junta os temas das fontes de
anime e acha cada música na discografia do artista na Apple.

Usa a rede, como o `fetch.py`, de quem importa o transporte: os outros comandos nunca o carregam
(o teste em subprocesso confere o `fetch`, que este módulo importa). Só a biblioteca padrão.

As fontes (P239, P256), na ordem em que entram:
1. o sorteio: o ranking de popularidade do MyAnimeList (`mal_ranking.py`), com o Client ID da
   variável `MAL_CLIENT_ID`, ou já baixado (`--ranks-file`, o do robô); sem os dois, as entradas
   mais incluídas em playlists do AnimeThemes. Mais, só na 1ª carga, a lista do usuário
   (`--personal`, o XML exportado do MAL, P253). Com o `--draw amq` (a carga C3, à mão), não há
   sorteio: a ordem é a dos animes mais acertados no Anime Music Quiz (o AnisongDB), e o MAL dá
   só o nível;
2. os animes e os temas: o AnimeThemes (GraphQL), pelo id do MAL;
3. a dificuldade e os artistas que faltam no AnimeThemes: o AnisongDB, pelo id do MAL;
4. a música: a busca do artista e o lookup das músicas dele na Apple (P242).

Do que vem de fora, o snapshot guarda só o que o build usa: os títulos, os artistas, as séries, o
nível de 0 a 9 de cada fonte (P254) e as respostas aparadas da Apple das faixas escolhidas. Nada
do MAL além do id e do nível (P256). O Client ID vai só no cabeçalho do pedido: nunca em log,
arquivo ou mensagem de erro.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from functools import cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode

from musicle_pipeline.anime import (
    MODES,
    THEME_TYPES,
    TIERS,
    Anime,
    Theme,
    anime_factor,
    chances,
    is_icon,
    loose_title,
    match_theme,
    same_song,
    tiers_of,
)
from musicle_pipeline.fetch import (
    MAX_BYTES,
    PACE_SEC,
    TIMEOUT_SEC,
    USER_AGENT,
    FetchError,
    _get_json,
    _results,
    _song,
    get_any,
    http_get,
)
from musicle_pipeline.mal_ranking import (
    MalError,
    RankingFile,
    fetch_ranking,
    mal_level,
    top_ranks,
)
from musicle_pipeline.mal_ranking import mal_get as mal_get  # o CLI e os testes o usam daqui
from musicle_pipeline.models import JSON, RawTrack
from musicle_pipeline.normalize import search_key
from musicle_pipeline.prng import seeded
from musicle_pipeline.providers.apple import (
    STOREFRONT,
    artist_names,
    map_track,
    partner_key,
    partners_of,
)
from musicle_pipeline.providers.apple_anime import snapshot_id

ANIMETHEMES_URL = "https://graphql.animethemes.moe/"
ANISONGDB_URL = "https://anisongdb.com/api/mal_ids_request"
ANISONGDB_RANDOM_URL = "https://anisongdb.com/api/get_n_random_songs"
SEARCH_URL = "https://itunes.apple.com/search"
LOOKUP_URL = "https://itunes.apple.com/lookup"
ANIMETHEMES_BATCH = 100  # o máximo do findAnimeByExternalSite (pesquisa de 21/10/2026)
ANISONGDB_BATCH = 500  # o máximo do mal_ids_request
# O AnimeThemes permite 90 pedidos por minuto; o MAL não publica limite (cláusula 6: carga
# razoável). 1 s entre os pedidos das fontes de anime; a Apple fica com os 4 s do fetch.
SOURCE_PACE_SEC = 1
# Quantos do topo do ranking entram no sorteio: os populares de todos os tempos e os do meio.
POOL_SIZE = 3000
# A ordem pelos acertos do AMQ (`--draw amq`, a carga C3): a amostra das músicas com a taxa de
# acerto a partir de AMQ_MIN_RATE, em pedidos de AMQ_BATCH (o máximo do get_n_random_songs), até um
# trazer menos de AMQ_FRESH músicas novas ou AMQ_CALLS pedidos (em 23/10/2026, 8 pedidos já davam
# ~1.400 músicas, e o 8º trouxe só 29 novas). O nível do MAL vem da escala inteira (MAL_LEVEL_SIZE):
# o anime do AMQ pode estar entre o 3.001º e o 6.000º, que o sorteio de hoje nunca alcança.
AMQ_MIN_RATE = 60
AMQ_BATCH = 500
AMQ_FRESH = 10
AMQ_CALLS = 12
MAL_LEVEL_SIZE = 6000
PERSONAL_SHARE = 0.15  # o teto da lista do usuário no acervo da 1ª carga (P253)
PERSONAL_STATUSES = {"Completed", "Watching", "On-Hold"}
MAX_ARTIST_CANDIDATES = 3  # artistas com o mesmo nome: a ambiguidade do casamento decide
SONG_LIMIT = 200  # o teto do lookup de músicas de um artista
ALBUM_BATCH = 50  # álbuns por lookup (o mesmo do modo por artista)

# A query do AnimeThemes: só os campos que o snapshot guarda (sem vídeo nem áudio, regra 8).
ANIMETHEMES_QUERY = """
query AnimeByMal($ids: [Int!]) {
  findAnimeByExternalSite(site: MAL, id: $ids) {
    slug
    title { romaji english native }
    year
    synonyms { text }
    series { nodes { slug title { romaji } } }
    resources { nodes { site externalId } }
    animethemes {
      type
      sequence
      group { slug }
      song { title { romaji native } performances { as artist { slug name { main native } } } }
      animethemeentries { tracksCount }
    }
  }
}
"""

PostTransport = Callable[[str, bytes, Mapping[str, str]], bytes]


def http_post(url: str, body: bytes, headers: Mapping[str, str]) -> bytes:
    """POST com JSON, o User-Agent do projeto (o padrão do urllib leva 403 do Cloudflare no
    AnimeThemes e no AnisongDB), timeout e teto de tamanho."""
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Accept": "application/json",
            **headers,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SEC) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise FetchError(f"resposta maior que {MAX_BYTES} bytes: {url}")
    return data


# ---------------------------------------------------------------------------------------------
# Os níveis de 0 a 9 (P254), em escalas fixas de cada fonte: o número bruto nunca é guardado.

# A posição no ranking de popularidade do MAL: o `mal_level`, no mal_ranking.py (o arquivo da
# anime-mal já sai com o nível).
# As faixas de playlists que apontam para o tema no AnimeThemes (o topo, em 21/10/2026: 1.065).
_TRACKS = (3, 10, 20, 40, 70, 120, 200, 300, 500)


def tracks_level(count: int) -> int:
    """De 0 a 2 playlists: 0; 500 ou mais: 9."""
    return sum(count >= limit for limit in _TRACKS)


def anisongdb_level(difficulty: float) -> int:
    """A taxa de acerto do Anime Music Quiz (0 a 100), em décimos: 87% dá 8."""
    return max(0, min(9, int(difficulty // 10)))


# ---------------------------------------------------------------------------------------------
# As fontes de anime.


@dataclass
class SourceTheme:
    type: str
    sequence: int | None
    song: str
    artists: list[str]
    levels: dict[str, int] = field(default_factory=dict)


@dataclass
class SourceAnime:
    mal_id: int
    slug: str
    name: str
    synonyms: list[str]
    year: int | None
    series: list[tuple[str, str]]
    themes: list[SourceTheme]


_SLUG = re.compile(r"[a-z0-9_-]+")


def _text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return unicodedata.normalize("NFC", value).strip()
    return None


def parse_animethemes(data: object) -> dict[int, SourceAnime]:
    """A resposta do findAnimeByExternalSite → os animes pelo id do MAL. Os temas de um grupo
    ("HD Remaster", "English Version") repetem a música e ficam de fora."""
    if not isinstance(data, dict):
        raise FetchError("AnimeThemes com forma inesperada")
    errors = data.get("errors")
    if errors:
        raise FetchError(f"AnimeThemes devolveu erro: {str(errors)[:200]}")
    items = (data.get("data") or {}).get("findAnimeByExternalSite")
    if not isinstance(items, list):
        raise FetchError("AnimeThemes com forma inesperada")
    found: dict[int, SourceAnime] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        mal = [
            r.get("externalId")
            for r in (item.get("resources") or {}).get("nodes") or []
            if isinstance(r, dict)
            and r.get("site") == "MAL"
            and isinstance(r.get("externalId"), int)
        ]
        slug = item.get("slug")
        title = item.get("title") or {}
        name = _text(title.get("romaji"))
        if not mal or not isinstance(slug, str) or not _SLUG.fullmatch(slug) or name is None:
            continue
        synonyms = [
            s
            for s in (
                _text(title.get("english")),
                _text(title.get("native")),
                *(_text(x.get("text")) for x in item.get("synonyms") or [] if isinstance(x, dict)),
            )
            if s is not None and s != name
        ]
        series = []
        for node in (item.get("series") or {}).get("nodes") or []:
            s_slug = node.get("slug") if isinstance(node, dict) else None
            s_name = _text(((node or {}).get("title") or {}).get("romaji"))
            if isinstance(s_slug, str) and _SLUG.fullmatch(s_slug) and s_name:
                series.append((s_slug, s_name))
        themes = []
        for theme in item.get("animethemes") or []:
            if not isinstance(theme, dict) or theme.get("group") is not None:
                continue
            kind, song = theme.get("type"), theme.get("song") or {}
            song_title = _text((song.get("title") or {}).get("romaji"))
            if kind not in ("OP", "ED", "IN") or song_title is None:
                continue
            artists = []
            for perf in song.get("performances") or []:
                names = ((perf or {}).get("artist") or {}).get("name") or {}
                for n in (_text(names.get("main")), _text(names.get("native"))):
                    if n and n not in artists:
                        artists.append(n)
            counts = [
                e.get("tracksCount")
                for e in theme.get("animethemeentries") or []
                if isinstance(e, dict) and isinstance(e.get("tracksCount"), int)
            ]
            sequence = theme.get("sequence")
            themes.append(
                SourceTheme(
                    type=kind,
                    sequence=sequence if isinstance(sequence, int) and sequence >= 1 else None,
                    song=song_title,
                    artists=artists,
                    levels={"animethemes": tracks_level(max(counts))} if counts else {},
                )
            )
        year = item.get("year")
        for mal_id in mal:
            found[mal_id] = SourceAnime(
                mal_id=mal_id,
                slug=slug,
                name=name,
                synonyms=list(dict.fromkeys(synonyms)),
                year=year if isinstance(year, int) else None,
                series=series,
                themes=themes,
            )
    return found


_SONG_TYPE = re.compile(r"(Opening|Ending)\s*(\d+)?|Insert Song", re.IGNORECASE)


def parse_anisongdb(items: object) -> dict[int, list[SourceTheme]]:
    """A resposta do mal_ids_request → os temas de cada anime, com o nível do quiz. As dublagens
    e as reprises ficam de fora."""
    if not isinstance(items, list):
        raise FetchError("AnisongDB com forma inesperada")
    out: dict[int, list[SourceTheme]] = {}
    for item in items:
        if not isinstance(item, dict) or item.get("isDub") or item.get("isRebroadcast"):
            continue
        mal_id = (item.get("linked_ids") or {}).get("myanimelist")
        song = _text(item.get("songName"))
        match = _SONG_TYPE.fullmatch(str(item.get("songType", "")).strip())
        if not isinstance(mal_id, int) or song is None or match is None:
            continue
        kind = {"opening": "OP", "ending": "ED"}.get((match.group(1) or "").lower(), "IN")
        names = [
            n
            for a in item.get("artists") or []
            if isinstance(a, dict)
            for n in (_text(x) for x in (a.get("names") or [])[:1])
            if n
        ] or [n for n in [_text(item.get("songArtist"))] if n]
        difficulty = item.get("songDifficulty")
        levels = (
            {"anisongdb": anisongdb_level(difficulty)}
            if isinstance(difficulty, int | float) and not isinstance(difficulty, bool)
            else {}
        )
        out.setdefault(mal_id, []).append(
            SourceTheme(
                type=kind,
                sequence=int(match.group(2)) if match.group(2) else None,
                song=song,
                artists=names,
                levels=levels,
            )
        )
    return out


_WO = re.compile(r"\bwo\b", re.IGNORECASE)


def _song_key(theme: SourceTheme) -> tuple[str, str]:
    """O tipo e o título, com o "wo" como "o": "Shinzou wo Sasageyo" (AnimeThemes) e "Shinzou o
    Sasageyo" (AnisongDB) são o mesmo tema."""
    return theme.type, search_key(_WO.sub("o", theme.song))


def merge_sources(anime: SourceAnime, quiz: Sequence[SourceTheme]) -> SourceAnime:
    """Os temas do AnimeThemes com o nível e os artistas do AnisongDB, casados pelo tipo e pelo
    título (a numeração das duas fontes diverge). Primeiro o título igual; depois, para o que
    sobrou, o único do mesmo tipo com o título frouxo igual ou muito parecido (P275: "LOST IN
    PARADISE feat. AKLO" e "LOST IN PARADISE"). O tema que só o AnisongDB tem (a insert song,
    quase sempre) entra também."""
    left = list(quiz)
    partners: list[SourceTheme | None] = []
    for t in anime.themes:
        key = _song_key(t)
        other = next((q for q in left if _song_key(q) == key), None)
        if other is not None:
            left.remove(other)
        partners.append(other)
    for i, t in enumerate(anime.themes):
        if partners[i] is None:
            mine = loose_title(t.song)
            close = [q for q in left if q.type == t.type and same_song(loose_title(q.song), mine)]
            if len(close) == 1:
                left.remove(close[0])
                partners[i] = close[0]
    themes = []
    for t, other in zip(anime.themes, partners, strict=True):
        if other is not None:
            t = SourceTheme(
                type=t.type,
                sequence=t.sequence,
                song=t.song,
                artists=t.artists or other.artists,
                levels={**t.levels, **other.levels},
            )
        themes.append(t)
    known = {_song_key(t) for t in themes}
    for q in left:
        if _song_key(q) not in known:
            known.add(_song_key(q))
            themes.append(q)
    return SourceAnime(
        mal_id=anime.mal_id,
        slug=anime.slug,
        name=anime.name,
        synonyms=anime.synonyms,
        year=anime.year,
        series=anime.series,
        themes=themes,
    )


def parse_personal_list(text: str) -> tuple[list[int], list[int]]:
    """O XML exportado do MAL (P253) → (os animes com nota 8 ou mais, os outros), dos status
    "Completed", "Watching" e "On-Hold". Só 3 campos são lidos; a lista nunca vai para o
    repositório."""
    import xml.etree.ElementTree as ET  # o XML é o do próprio usuário, lido só na 1ª carga

    root = ET.fromstring(text)
    strong: list[int] = []
    other: list[int] = []
    for item in root.iter("anime"):
        status = (item.findtext("my_status") or "").strip()
        raw_id = (item.findtext("series_animedb_id") or "").strip()
        raw_score = (item.findtext("my_score") or "0").strip()
        if status not in PERSONAL_STATUSES or not raw_id.isdigit():
            continue
        score = int(raw_score) if raw_score.isdigit() else 0
        (strong if score >= 8 else other).append(int(raw_id))
    return sorted(set(strong)), sorted(set(other) - set(strong))


# ---------------------------------------------------------------------------------------------
# O sorteio.


def mal_ranking(
    get: Callable[[str], bytes], sleep: Callable[[float], None], size: int = POOL_SIZE
) -> dict[int, int]:
    """O id do MAL → a posição no ranking de popularidade, até `size`. A busca fica no
    `mal_ranking.py` (só a biblioteca padrão, para a tarefa anime-mal do robô); aqui a falha
    vira a do fetch."""
    try:
        return fetch_ranking(get, sleep, size)
    except MalError as exc:
        raise FetchError(str(exc)) from None


def animethemes_popular(
    post: PostTransport, sleep: Callable[[float], None], pages: int = 10
) -> dict[int, int]:
    """Sem o MAL: os animes dos temas mais incluídos em playlists do AnimeThemes, na ordem
    (a posição faz o papel do ranking)."""
    query = """
    query Popular($page: Int!) {
      animethemeentryPagination(sort: [TRACKS_COUNT_DESC], first: 100, page: $page) {
        data { animetheme { anime { resources { nodes { site externalId } } } } }
      }
    }
    """
    ranks: dict[int, int] = {}
    for page in range(1, pages + 1):
        body = json.dumps({"query": query, "variables": {"page": page}}).encode("utf-8")
        data = get_any(ANIMETHEMES_URL, lambda url, body=body: post(url, body, {}), sleep, 3)
        if not isinstance(data, dict):
            raise FetchError("AnimeThemes com forma inesperada")
        if data.get("errors"):
            raise FetchError(f"AnimeThemes devolveu erro: {str(data['errors'])[:200]}")
        entries = ((data.get("data") or {}).get("animethemeentryPagination") or {}).get("data")
        for entry in entries or []:
            anime = ((entry or {}).get("animetheme") or {}).get("anime") or {}
            for r in (anime.get("resources") or {}).get("nodes") or []:
                if r.get("site") == "MAL" and isinstance(r.get("externalId"), int):
                    ranks.setdefault(r["externalId"], len(ranks) + 1)
        sleep(SOURCE_PACE_SEC)
    return ranks


def _rate(value: object) -> float | None:
    """A taxa de acerto do AMQ (0 a 100), ou None se não é número."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def amq_rates(
    post: PostTransport,
    sleep: Callable[[float], None],
    min_rate: int = AMQ_MIN_RATE,
    max_calls: int = AMQ_CALLS,
    log: Callable[[str], None] = lambda _m: None,
) -> dict[int, float]:
    """A maior taxa de acerto no Anime Music Quiz de cada anime (o AnisongDB; a carga C3, P335):
    a amostra das músicas com a taxa de `min_rate` a 100, sem dublagem e sem reprise, em pedidos
    de AMQ_BATCH, até um trazer menos de AMQ_FRESH músicas novas ou `max_calls` pedidos. Cada
    música conta uma vez (o `annSongId`), e cada anime vale a maior taxa das músicas dele. A
    música com a taxa fora do filtro (o servidor que o ignorou, um NaN) fica de fora, com aviso.
    A taxa fica só na memória (P254): o log leva só as contagens."""
    filters = {
        "difficulty": {"start": min_rate, "end": 100},
        "song_types": ["opening", "ending", "insert"],
        "broadcasts": ["normal"],
        "song_categories": ["standard"],
    }
    body = json.dumps({"n": AMQ_BATCH, "filters": filters}).encode("utf-8")
    best: dict[int, float] = {}
    seen: set[int] = set()
    outside: set[int] = set()  # as músicas, e não as aparições: a amostra repete
    calls = 0
    for _ in range(max_calls):
        data = get_any(ANISONGDB_RANDOM_URL, lambda url: post(url, body, {}), sleep, 3)
        calls += 1
        if not isinstance(data, list):
            raise FetchError("AnisongDB com forma inesperada")
        fresh = 0
        for item in data:
            if not isinstance(item, dict) or item.get("isDub") or item.get("isRebroadcast"):
                continue
            song = item.get("annSongId")
            mal_id = (item.get("linked_ids") or {}).get("myanimelist")
            if not isinstance(song, int) or isinstance(song, bool) or song in seen:
                continue
            if not isinstance(mal_id, int) or isinstance(mal_id, bool) or mal_id < 1:
                continue
            rate = _rate(item.get("songDifficulty"))
            # O NaN falha nas duas comparações, e o infinito passa de 100: os dois ficam de fora.
            if rate is None or not min_rate <= rate <= 100:
                outside.add(song)
                continue
            seen.add(song)
            fresh += 1
            best[mal_id] = max(best.get(mal_id, rate), rate)
        sleep(SOURCE_PACE_SEC)
        if fresh < AMQ_FRESH:
            break
    if outside:
        log(f"aviso: {len(outside)} música(s) do AMQ fora do filtro da taxa, deixadas de fora")
    log(f"o AMQ: {calls} pedido(s), {len(seen)} música(s), {len(best)} anime(s)")
    return best


def amq_ranks(rates: Mapping[int, float], level_of: Callable[[int], int | None]) -> dict[int, int]:
    """A ordem da carga pelo AMQ (P336): a taxa de acerto vezes a fama do anime no MAL (o p_a da
    P272, `anime_factor`). A taxa sozinha puxa o nicho: o AMQ toca a música do anime de nicho só
    para quem o assistiu, e quase todos acertam. A posição 1 é o maior produto; o empate sai pelo
    id. Em Decimal, como a chance."""
    score = {
        mal_id: Decimal(str(rate)) / 100 * anime_factor(level_of(mal_id))
        for mal_id, rate in rates.items()
    }
    ordered = sorted(score, key=lambda m: (-score[m], m))
    return {mal_id: position for position, mal_id in enumerate(ordered, start=1)}


def ranked_order(ranks: Mapping[int, int], tried: set[int], limit: int) -> list[int]:
    """A ordem sem sorteio (a carga C3, P336): da posição 1 em diante, sem os já tentados, até
    `limit`."""
    ordered = sorted((m for m in ranks if m not in tried), key=lambda m: (ranks[m], m))
    return ordered[:limit]


def draw_order(
    ranks: Mapping[int, int],
    personal: tuple[Sequence[int], Sequence[int]],
    tried: set[int],
    seed: str,
    limit: int,
) -> list[int]:
    """A ordem em que os animes são buscados, até `limit`: um sorteio com peso pela popularidade
    (o topo sai mais, mas o meio do ranking também aparece), com a lista do usuário intercalada,
    um a cada ~7 (o teto de ~15%, P253), primeiro os de nota 8 ou mais. Determinística pela
    semente (o PRNG do projeto: o pacote não usa o `random`)."""
    rng = seeded(seed)
    strong, other = personal
    mine = [m for m in dict.fromkeys([*strong, *other]) if m not in tried]
    taken = set(mine)
    pool = sorted(
        (m for m in ranks if m not in tried and m not in taken), key=lambda m: (ranks[m], m)
    )
    # Peso inteiro: o 1º do ranking vale len(pool), o último vale 1 (o randint sobre a soma).
    weights = [len(pool) - i for i in range(len(pool))]
    alive = list(range(len(pool)))
    total = sum(weights)
    every = round(1 / PERSONAL_SHARE)
    order: list[int] = []
    while len(order) < limit and (alive or mine):
        if mine and (len(order) % every == 0 or not alive):
            order.append(mine.pop(0))
            continue
        pick = rng.randint(total)
        for position, index in enumerate(alive):
            pick -= weights[index]
            if pick < 0:
                order.append(pool[index])
                total -= weights[index]
                del alive[position]
                break
    return order


# ---------------------------------------------------------------------------------------------
# A Apple: o artista do tema e a discografia dele.


@dataclass
class AppleCache:
    """O que já se sabe nesta busca: o nome do tema → os ids da Apple (o que vai para o
    snapshot, `resolved`), e as faixas de cada artista (só na memória)."""

    resolved: dict[str, list[str]] = field(default_factory=dict)
    official: JSON = field(default_factory=dict)
    lookups: dict[str, list[JSON]] = field(default_factory=dict)
    # A discografia mapeada de cada conjunto de artistas: os temas seguidos do mesmo artista
    # não remapeiam as mesmas faixas.
    mapped: dict[tuple[str, ...], dict[str, RawTrack]] = field(default_factory=dict)
    albums: dict[str, list[JSON]] = field(default_factory=dict)


def choose_artists(name: str, results: Sequence[JSON]) -> list[str]:
    """Os artistas da busca que são o do tema (P242): o nome igual; senão, a mesma chave estrita
    (largura, caixa e espaços); entre vários, os de gênero anime. A ambiguidade do casamento
    decide entre os que sobrarem."""
    artists = [
        r
        for r in results
        if r.get("wrapperType") == "artist"
        and isinstance(r.get("artistName"), str)
        and re.fullmatch(r"[0-9]+", str(r.get("artistId", "")))
    ]
    target = unicodedata.normalize("NFKC", name).strip()
    exact = [r for r in artists if unicodedata.normalize("NFKC", r["artistName"]).strip() == target]
    if len(exact) == 1:
        return [str(exact[0]["artistId"])]
    # A chave frouxa da busca por último: "Youko Hikasa" (o AnimeThemes) é "Yoko Hikasa" (a
    # Apple). Um artista errado ainda teria de casar o título da música.
    keyed = (
        exact
        or [r for r in artists if partner_key(r["artistName"]) == partner_key(name)]
        or [r for r in artists if search_key(r["artistName"]) == search_key(name)]
    )
    anime = [r for r in keyed if r.get("primaryGenreName") in ("アニメ", "Anime")]
    chosen = anime if anime else keyed
    return [str(r["artistId"]) for r in chosen[:MAX_ARTIST_CANDIDATES]]


class AppleClient:
    def __init__(
        self,
        cache: AppleCache,
        transport: Callable[[str], bytes],
        sleep: Callable[[float], None],
        pace: float = PACE_SEC,
    ) -> None:
        self.cache, self.transport, self.sleep, self.pace = cache, transport, sleep, pace
        self.requests = 0

    def _get(self, url: str) -> JSON:
        if self.requests:
            self.sleep(self.pace)
        self.requests += 1
        return _get_json(url, self.transport, self.sleep, 3)

    def artists_for(self, name: str) -> list[str]:
        if name not in self.cache.resolved:
            query = {"term": name, "country": STOREFRONT, "entity": "musicArtist", "limit": 10}
            found = _results(self._get(f"{SEARCH_URL}?{urlencode(query)}"))
            ids = choose_artists(name, found)
            for r in found:
                if str(r.get("artistId")) in ids:
                    self.cache.official[str(r["artistId"])] = {"artistName": r["artistName"]}
            self.cache.resolved[name] = ids
        return self.cache.resolved[name]

    def songs_of(self, artist_id: str) -> list[JSON]:
        if artist_id not in self.cache.lookups:
            query = {"id": artist_id, "entity": "song", "limit": SONG_LIMIT, "country": STOREFRONT}
            found = _results(self._get(f"{LOOKUP_URL}?{urlencode(query)}"))
            self.cache.lookups[artist_id] = [s for s in (_song(r) for r in found) if s]
        return self.cache.lookups[artist_id]

    def capped(self, artist_id: str) -> bool:
        """O lookup de músicas veio no teto: o artista tem mais músicas do que ele mostra."""
        return len(self.songs_of(artist_id)) >= SONG_LIMIT

    def album_songs_of(self, artist_id: str) -> list[JSON]:
        """As músicas dos álbuns do artista, só as dele, para quem passa de 200 (LiSA, Aimer):
        o lookup de músicas ordena só as 200 primeiras. Os álbuns em lotes, como o modo por
        artista (o teto de 200 vale por álbum)."""
        if artist_id not in self.cache.albums:
            query = {"id": artist_id, "entity": "album", "limit": SONG_LIMIT, "country": STOREFRONT}
            found = _results(self._get(f"{LOOKUP_URL}?{urlencode(query)}"))
            albums = sorted(
                {
                    str(r["collectionId"])
                    for r in found
                    if r.get("wrapperType") == "collection"
                    and str(r.get("artistId")) == artist_id
                    and re.fullmatch(r"[0-9]+", str(r.get("collectionId", "")))
                },
                key=int,
            )
            songs: list[JSON] = []
            for start in range(0, len(albums), ALBUM_BATCH):
                batch = albums[start : start + ALBUM_BATCH]
                query = {
                    "id": ",".join(batch),
                    "entity": "song",
                    "limit": SONG_LIMIT,
                    "country": STOREFRONT,
                }
                for r in _results(self._get(f"{LOOKUP_URL}?{urlencode(query)}")):
                    s = _song(r)
                    if s is not None and s["artistId"] == artist_id and s["collectionId"] in batch:
                        songs.append(s)
            self.cache.albums[artist_id] = songs
        return self.cache.albums[artist_id]


def _raw_tracks(lookups: Sequence[JSON], official: JSON) -> dict[str, RawTrack]:
    by_id = {t["trackId"]: t for t in lookups}
    names = artist_names(by_id, official)
    partners = partners_of(list(names.values()))
    warnings: list[str] = []
    return {
        tid: map_track(t, names, partners, "fetch --anime", warnings) for tid, t in by_id.items()
    }


# ---------------------------------------------------------------------------------------------
# A busca inteira.


@dataclass
class Progress:
    """O que já casou, por modo e faixa (com a conta do build, aproximada), para saber quando
    parar."""

    target: int
    max_songs: int
    counts: dict[str, dict[str, int]] = field(
        default_factory=lambda: {m: dict.fromkeys(TIERS, 0) for m in MODES}
    )
    songs: set[str] = field(default_factory=set)

    def add(self, theme: Theme, anime: Anime, songs: int) -> None:
        """A faixa aproximada do tema: a franquia inteira e o artista da parada só o build
        conhece, então `songs` (a concorrência) são as músicas do mesmo tipo no próprio anime, e
        o ícone vem só dos níveis."""
        if theme.track is None or theme.track.provider_id in self.songs:
            return
        self.songs.add(theme.track.provider_id)
        for mode, tier in tiers_of(chances(theme, anime, songs), is_icon(theme)).items():
            self.counts[mode][tier] += 1

    def done(self) -> bool:
        full = all(n >= self.target for c in self.counts.values() for n in c.values())
        return full or len(self.songs) >= self.max_songs


@dataclass
class AnimeFetch:
    """Os transportes e as pausas (os testes trocam todos)."""

    get: Callable[[str], bytes] = http_get
    post: PostTransport = http_post
    mal: Callable[[str], bytes] | None = None  # None: sem o MAL (P256)
    # O ranking do MAL já baixado (o --ranks-file, que a tarefa anime-mal do robô entrega, P256):
    # o sorteio sai da ordem dele e o nível, dos níveis dele, sem nenhum pedido ao MAL.
    mal_file: RankingFile | None = None
    sleep: Callable[[float], None] = lambda _s: None
    apple_pace: float = PACE_SEC
    log: Callable[[str], None] = lambda _m: None
    # O relógio monotônico e o prazo em segundos (None: sem prazo). O pacote não lê o relógio: o
    # CLI passa o time.monotonic, e os testes, um contador.
    clock: Callable[[], float] = lambda: 0.0
    deadline: float | None = None
    # A gravação do snapshot parcial depois de cada anime (a busca longa não perde nada se parar).
    save: Callable[[JSON], None] | None = None


def _post_json(io: AnimeFetch, url: str, body: bytes) -> object:
    """O POST com as mesmas repetições do GET (429 e 5xx esperam e tentam de novo). Os erros
    do GraphQL vêm com HTTP 200: quem lê confere o `errors`."""
    return get_any(url, lambda target: io.post(target, body, {}), io.sleep, 3)


def _batched(items: Sequence[int], size: int) -> Iterable[list[int]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


def _mal_level_of(io: AnimeFetch, mal_ranks: Mapping[int, int], mal_id: int) -> int | None:
    """O nível do MAL do anime (P256): o do arquivo da anime-mal (o --ranks-file), ou o da
    posição no ranking do MAL baixado agora (a carga do terminal); sem o MAL, nenhum."""
    if io.mal_file is not None:
        return io.mal_file.levels.get(mal_id)
    if io.mal is not None and mal_id in mal_ranks:
        return mal_level(mal_ranks[mal_id])
    return None


Draw = Literal["mal", "amq"]


def _plan(
    io: AnimeFetch,
    fetched_at: str,
    tried: set[int],
    personal: tuple[Sequence[int], Sequence[int]],
    max_anime: int,
    pool_size: int,
    draw: Draw,
) -> tuple[list[int], Mapping[int, int]]:
    """A ordem dos animes e o ranking do MAL que dá o nível de cada um. No sorteio de sempre, os
    dois saem do mesmo ranking. Com o `draw="amq"` (a carga C3), a ordem é a dos acertos do AMQ,
    sem sorteio (P336), e o MAL dá só o nível (P335): sem o MAL, a chance de todos cairia, e a
    busca recusa."""
    if draw == "amq":
        if io.mal_file is None and io.mal is None:
            raise FetchError(
                "a ordem pelo AMQ precisa do nível do MAL: o MAL_CLIENT_ID ou o --ranks-file (P335)"
            )
        io.log("a ordem pelos acertos do Anime Music Quiz (AnisongDB) e a fama no MAL, sem sorteio")
        rates = amq_rates(io.post, io.sleep, log=io.log)
        if not rates:
            raise FetchError("a ordem pelo AMQ veio vazia")
        mal_ranks: Mapping[int, int] = {}
        if io.mal_file is not None:
            if len(io.mal_file.order) < MAL_LEVEL_SIZE:
                io.log(
                    f"aviso: o --ranks-file tem {len(io.mal_file.order)} anime(s), menos que os "
                    f"{MAL_LEVEL_SIZE} da escala; os do AMQ além dele ficam sem nível"
                )
        elif io.mal is not None:
            io.log("o nível pelo ranking do MyAnimeList")
            mal_ranks = mal_ranking(io.mal, io.sleep, MAL_LEVEL_SIZE)
            # Vazio, todo anime da carga ficaria sem nível para sempre (os snapshots só crescem).
            if not mal_ranks:
                raise FetchError("o ranking do MAL veio vazio: sem ele, nenhum anime teria nível")
        # O nível já conhecido, a ordem pesa o acerto pela fama (P336): o nicho vai para o fim.
        amq = amq_ranks(rates, lambda m: _mal_level_of(io, mal_ranks, m))
        order = ranked_order(amq, tried, max_anime)
        unleveled = sum(_mal_level_of(io, mal_ranks, m) is None for m in order)
        if unleveled:
            io.log(f"aviso: {unleveled} de {len(order)} anime(s) da ordem sem nível do MAL")
        return order, mal_ranks
    if io.mal_file is not None:
        io.log("o sorteio pelo ranking do MyAnimeList (do --ranks-file)")
        ranks = top_ranks(io.mal_file.draw_ranks(), pool_size)
    elif io.mal is not None:
        io.log("o sorteio pelo ranking do MyAnimeList")
        ranks = mal_ranking(io.mal, io.sleep, pool_size)
    else:
        io.log("sem MAL_CLIENT_ID: o sorteio pelas playlists do AnimeThemes")
        ranks = animethemes_popular(io.post, io.sleep, max(1, -(-pool_size // 100)))
    if not ranks:
        raise FetchError("o sorteio veio vazio")
    order = draw_order(ranks, personal, tried, f"musicle-jp|anime|{fetched_at}", max_anime)
    return order, ranks


def _anime_record(anime: SourceAnime, level: int | None) -> JSON:
    return {
        "malId": anime.mal_id,
        "slug": anime.slug,
        "name": anime.name,
        "synonyms": anime.synonyms,
        "year": anime.year,
        "series": [{"slug": s, "name": n} for s, n in anime.series],
        "levels": {} if level is None else {"mal": level},
        "themes": [],
    }


def fetch_anime_snapshot(
    fetched_at: str,
    romanize: Callable[[str], Sequence[str]],
    tried: set[int],
    known_resolved: Mapping[str, list[str]],
    known_official: JSON,
    io: AnimeFetch,
    personal: tuple[Sequence[int], Sequence[int]] = ((), ()),
    target_per_tier: int = 18,
    max_songs: int = 70,
    max_anime: int = 400,
    pool_size: int = POOL_SIZE,
    draw: Draw = "mal",
) -> JSON:
    """Um snapshot novo do Anime, sorteado entre os `pool_size` mais populares (um número menor
    puxa o sorteio para o topo, e o Fácil cresce), ou, com o `draw="amq"`, na ordem dos animes
    mais acertados no AMQ. Para quando cada modo e faixa tem `target_per_tier` músicas, quando
    chega a `max_songs`, ou depois de `max_anime` animes tentados."""
    order, mal_ranks = _plan(io, fetched_at, tried, personal, max_anime, pool_size, draw)
    cache = AppleCache(
        resolved={k: list(v) for k, v in known_resolved.items()}, official=dict(known_official)
    )
    apple = AppleClient(cache, io.get, io.sleep, io.apple_pace)
    progress = Progress(target_per_tier, max_songs)
    records: list[JSON] = []
    used_lookups: dict[str, JSON] = {}

    def build() -> JSON:
        # Os nomes oficiais dos artistas das faixas e de todos os resolvidos nesta busca: uma busca
        # seguinte que os pegue do cache (`resolved`) ainda acha o latino deles.
        new = {k: v for k, v in cache.resolved.items() if k not in known_resolved}
        artist_ids = {t["artistId"] for t in used_lookups.values()} | {
            i for v in new.values() for i in v
        }
        return {
            "provider": "apple",
            "storefront": STOREFRONT,
            "id": snapshot_id(fetched_at),
            "fetchedAt": fetched_at,
            # Pelo AMQ, a ordem da busca é a do acerto: no snapshot, que vai para o Git, os animes
            # saem pelo id, para a ordem não guardar o ranking (P254). No sorteio, fica a dele.
            "anime": sorted(records, key=lambda r: r["malId"]) if draw == "amq" else list(records),
            "artists": {k: v for k, v in sorted(cache.official.items()) if k in artist_ids},
            # Só as resoluções novas: as antigas já estão nos snapshots de antes.
            "resolved": dict(sorted(new.items())),
            "tracks": dict(sorted(used_lookups.items())),
        }

    start = io.clock()
    try:
        _search(
            order, io, mal_ranks, apple, romanize, progress, records, used_lookups, start, build
        )
    except KeyboardInterrupt:
        # O Ctrl+C na busca longa: o que já veio fica (o anime pela metade volta a ser sorteado).
        io.log("busca interrompida; grava o que já veio")
    return build()


def _search(
    order: Sequence[int],
    io: AnimeFetch,
    mal_ranks: Mapping[int, int],
    apple: AppleClient,
    romanize: Callable[[str], Sequence[str]],
    progress: Progress,
    records: list[JSON],
    used_lookups: dict[str, JSON],
    start: float,
    build: Callable[[], JSON],
) -> None:
    stopped = False
    for batch in _batched(order, ANIMETHEMES_BATCH):
        body = json.dumps({"query": ANIMETHEMES_QUERY, "variables": {"ids": batch}}).encode()
        try:
            sources = parse_animethemes(_post_json(io, ANIMETHEMES_URL, body))
        except FetchError as exc:
            io.log(f"AnimeThemes falhou ({exc}); a busca para e grava o que já veio")
            break
        io.sleep(SOURCE_PACE_SEC)
        try:
            quiz = parse_anisongdb(
                _post_json(io, ANISONGDB_URL, json.dumps({"mal_ids": batch}).encode())
            )
        except FetchError as exc:
            # O AnisongDB não tem responsável público e pode sumir: sem ele, os temas ficam sem o
            # nível do quiz (vale o das playlists, senão a regra OP/ED).
            io.log(f"AnisongDB indisponível neste lote ({exc}); seguindo sem ele")
            quiz = {}
        io.sleep(SOURCE_PACE_SEC)
        for mal_id in batch:
            if progress.done():
                break
            if io.deadline is not None and io.clock() - start >= io.deadline:
                io.log("prazo da busca: grava o que já veio")
                stopped = True
                break
            source = sources.get(mal_id)
            if source is None:
                continue  # o AnimeThemes não tem o anime: nem entra no snapshot (outro sorteio)
            source = merge_sources(source, quiz.get(mal_id, []))
            # O nível do anime é só o do MAL (P256): sem ele, a posição nas playlists do
            # AnimeThemes serve ao sorteio, mas não vira nível (o tema já tem o das playlists).
            record = _anime_record(source, _mal_level_of(io, mal_ranks, mal_id))
            anime = Anime(
                mal_id=mal_id,
                slug=source.slug,
                name=source.name,
                synonyms=tuple(source.synonyms),
                year=source.year,
                series=tuple(source.series),
                levels=record["levels"],
                themes=(),
            )
            try:
                entries = [_theme(theme, anime, apple, romanize) for theme in source.themes]
            except FetchError as exc:
                # Uma falha de rede da Apple, depois das repetições: o que já veio fica, e este
                # anime volta a ser sorteado numa próxima busca (ele não entra no snapshot).
                io.log(f"{source.name}: a Apple falhou ({exc}); a busca para e grava o que já veio")
                stopped = True
                break
            # As músicas distintas de cada tipo no anime (todos os temas, com faixa ou não, como
            # no build), para a concorrência do Progress.
            rivals = {
                kind: len({loose_title(t.song) for t in source.themes if t.type == kind})
                for kind in THEME_TYPES
            }
            for entry in entries:
                record["themes"].append(entry["record"])
                if entry["lookup"] is not None:
                    used_lookups[entry["lookup"]["trackId"]] = entry["lookup"]
                    progress.add(entry["theme"], anime, rivals[entry["theme"].type])
            records.append(record)
            matched = sum(t["result"] == "matched" for t in record["themes"])
            io.log(
                f"{source.name}: {matched} de {len(record['themes'])} tema(s) "
                f"(no total, {len(progress.songs)} música(s))"
            )
            if io.save is not None:
                io.save(build())
        if stopped or progress.done():
            break


def _theme(
    theme: SourceTheme, anime: Anime, apple: AppleClient, romanize: Callable[[str], Sequence[str]]
) -> JSON:
    base: JSON = {
        "type": theme.type,
        "sequence": theme.sequence,
        "song": theme.song,
        "artists": theme.artists,
        "levels": theme.levels,
        "track": None,
    }
    ids = [i for name in theme.artists for i in apple.artists_for(name)]
    ids = list(dict.fromkeys(ids))
    if not ids:
        return {"record": {**base, "result": "no-artist"}, "lookup": None, "theme": None}
    lookups = [t for artist_id in ids for t in apple.songs_of(artist_id)]
    key = tuple(ids)
    if key not in apple.cache.mapped:
        apple.cache.mapped[key] = _raw_tracks(lookups, apple.cache.official)
    tracks = apple.cache.mapped[key]
    found = match_theme(theme.song, list(tracks.values()), romanize, anime.year)
    capped = [i for i in ids if apple.capped(i)]
    if found.result == "no-match" and capped:
        # A música pode estar além das 200 do lookup: os álbuns do artista, uma vez por busca.
        extra = [t for artist_id in capped for t in apple.album_songs_of(artist_id)]
        seen = {t["trackId"] for t in lookups}
        lookups = lookups + [t for t in extra if t["trackId"] not in seen]
        full = ("albums", *key)
        if full not in apple.cache.mapped:
            apple.cache.mapped[full] = _raw_tracks(lookups, apple.cache.official)
        tracks = apple.cache.mapped[full]
        found = match_theme(theme.song, list(tracks.values()), romanize, anime.year)
    record = {**base, "result": found.result}
    if found.track is None:
        return {"record": record, "lookup": None, "theme": None}
    record["track"] = found.track.provider_id
    chosen = Theme(
        type=theme.type,
        sequence=theme.sequence,
        song=theme.song,
        artists=tuple(theme.artists),
        levels=theme.levels,
        result="matched",
        track=found.track,
    )
    lookup = next(t for t in lookups if t["trackId"] == found.track.provider_id)
    return {"record": record, "lookup": lookup, "theme": chosen}


def cached_romanizer() -> Callable[[str], Sequence[str]]:
    """O cutlet, com cache: a discografia de um artista se repete em cada tema dele."""
    from musicle_pipeline import romaji  # só aqui: o build nunca importa o cutlet (regra 9)

    return cache(romaji.romanize)


def tried_and_resolved(snapshots_dir: Path) -> tuple[set[int], dict[str, list[str]], JSON]:
    """Os animes já tentados (o sorteio os pula), a resolução de artistas já feita e os nomes
    oficiais deles."""
    from musicle_pipeline.io_json import read_json

    tried: set[int] = set()
    resolved: dict[str, list[str]] = {}
    official: JSON = {}
    if snapshots_dir.is_dir():
        for path in sorted(snapshots_dir.glob("*.json")):
            data = read_json(path)
            tried.update(a["malId"] for a in data.get("anime", []) if isinstance(a, dict))
            resolved.update(data.get("resolved", {}))
            official.update(data.get("artists", {}))
    return tried, resolved, official
