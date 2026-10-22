"""A busca do Anime (M14, comando `fetch --anime`): sorteia animes, junta os temas das fontes de
anime e acha cada música na discografia do artista na Apple.

Usa a rede, como o `fetch.py`, de quem importa o transporte: os outros comandos nunca o carregam
(o teste em subprocesso confere o `fetch`, que este módulo importa). Só a biblioteca padrão.

As fontes (P239, P256), na ordem em que entram:
1. o sorteio: o ranking de popularidade do MyAnimeList, com o Client ID da variável
   `MAL_CLIENT_ID`; sem ela, as entradas mais incluídas em playlists do AnimeThemes. Mais, só na
   1ª carga, a lista do usuário (`--personal`, o XML exportado do MAL, P253);
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
from functools import cache
from pathlib import Path
from urllib.parse import urlencode

from musicle_pipeline.anime import (
    MODES,
    TIERS,
    Anime,
    Theme,
    fame,
    match_theme,
    theme_level,
    tier_of,
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
MAL_RANKING_URL = "https://api.myanimelist.net/v2/anime/ranking"
SEARCH_URL = "https://itunes.apple.com/search"
LOOKUP_URL = "https://itunes.apple.com/lookup"
ANIMETHEMES_BATCH = 100  # o máximo do findAnimeByExternalSite (pesquisa de 21/10/2026)
ANISONGDB_BATCH = 500  # o máximo do mal_ids_request
MAL_PAGE = 500
# O AnimeThemes permite 90 pedidos por minuto; o MAL não publica limite (cláusula 6: carga
# razoável). 1 s entre os pedidos das fontes de anime; a Apple fica com os 4 s do fetch.
SOURCE_PACE_SEC = 1
# Quantos do topo do ranking entram no sorteio: os populares de todos os tempos e os do meio.
POOL_SIZE = 3000
PERSONAL_SHARE = 0.15  # o teto da lista do usuário no acervo da 1ª carga (P253)
PERSONAL_STATUSES = {"Completed", "Watching", "On-Hold"}
MAX_ARTIST_CANDIDATES = 3  # artistas com o mesmo nome: a ambiguidade do casamento decide

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


def mal_get(client_id: str) -> Callable[[str], bytes]:
    """GET no MAL com o Client ID só no cabeçalho (P256): a URL que vai para as mensagens de
    erro nunca o tem."""

    def get(url: str) -> bytes:
        request = urllib.request.Request(
            url, headers={"User-Agent": USER_AGENT, "X-MAL-CLIENT-ID": client_id}
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT_SEC) as response:
            body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise FetchError(f"resposta maior que {MAX_BYTES} bytes: {url}")
        return body

    return get


# ---------------------------------------------------------------------------------------------
# Os níveis de 0 a 9 (P254), em escalas fixas de cada fonte: o número bruto nunca é guardado.

# A posição no ranking de popularidade do MAL: o topo de todos os tempos é 9.
_MAL_RANKS = (50, 150, 300, 600, 1000, 1600, 2500, 4000, 6000)
# As faixas de playlists que apontam para o tema no AnimeThemes (o topo, em 21/10/2026: 1.065).
_TRACKS = (3, 10, 20, 40, 70, 120, 200, 300, 500)


def mal_level(rank: int) -> int:
    """1º a 50º: 9; ... ; além do 6.000º: 0."""
    return sum(rank <= limit for limit in _MAL_RANKS)


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
    título (a numeração das duas fontes diverge). O tema que só o AnisongDB tem (a insert song,
    quase sempre) entra também."""
    left = list(quiz)
    themes = []
    for t in anime.themes:
        key = _song_key(t)
        other = next((q for q in left if _song_key(q) == key), None)
        if other is not None:
            left.remove(other)
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
    """O id do MAL → a posição no ranking de popularidade, até `size`."""
    ranks: dict[int, int] = {}
    offset = 0
    while offset < size:
        query = urlencode({"ranking_type": "bypopularity", "limit": MAL_PAGE, "offset": offset})
        page = _get_json(f"{MAL_RANKING_URL}?{query}", get, sleep, 3)
        data = page.get("data")
        if not isinstance(data, list) or not data:
            break
        for item in data:
            node, ranking = (item or {}).get("node") or {}, (item or {}).get("ranking") or {}
            if isinstance(node.get("id"), int) and isinstance(ranking.get("rank"), int):
                ranks.setdefault(node["id"], ranking["rank"])
        offset += len(data)
        sleep(SOURCE_PACE_SEC)
    return ranks


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
            query = {"id": artist_id, "entity": "song", "limit": 200, "country": STOREFRONT}
            found = _results(self._get(f"{LOOKUP_URL}?{urlencode(query)}"))
            self.cache.lookups[artist_id] = [s for s in (_song(r) for r in found) if s]
        return self.cache.lookups[artist_id]


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
    """O que já casou, por modo e faixa (com as funções do build), para saber quando parar."""

    target: int
    max_songs: int
    counts: dict[str, dict[str, int]] = field(
        default_factory=lambda: {m: dict.fromkeys(TIERS, 0) for m in MODES}
    )
    songs: set[str] = field(default_factory=set)

    def add(self, theme: Theme, anime: Anime) -> None:
        if theme.track is None or theme.track.provider_id in self.songs:
            return
        self.songs.add(theme.track.provider_id)
        levels = fame(theme, anime)
        for mode in MODES:
            self.counts[mode][tier_of(theme.type, levels[mode], theme_level(theme))] += 1

    def done(self) -> bool:
        full = all(n >= self.target for c in self.counts.values() for n in c.values())
        return full or len(self.songs) >= self.max_songs


@dataclass
class AnimeFetch:
    """Os transportes e as pausas (os testes trocam todos)."""

    get: Callable[[str], bytes] = http_get
    post: PostTransport = http_post
    mal: Callable[[str], bytes] | None = None  # None: sem o MAL (P256)
    sleep: Callable[[float], None] = lambda _s: None
    apple_pace: float = PACE_SEC
    log: Callable[[str], None] = lambda _m: None


def _post_json(io: AnimeFetch, url: str, body: bytes) -> object:
    """O POST com as mesmas repetições do GET (429 e 5xx esperam e tentam de novo). Os erros
    do GraphQL vêm com HTTP 200: quem lê confere o `errors`."""
    return get_any(url, lambda target: io.post(target, body, {}), io.sleep, 3)


def _batched(items: Sequence[int], size: int) -> Iterable[list[int]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


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
) -> JSON:
    """Um snapshot novo do Anime. Para quando cada modo e faixa tem `target_per_tier` músicas,
    quando chega a `max_songs`, ou depois de `max_anime` animes tentados."""
    if io.mal is not None:
        io.log("o sorteio pelo ranking do MyAnimeList")
        ranks = mal_ranking(io.mal, io.sleep)
    else:
        io.log("sem MAL_CLIENT_ID: o sorteio pelas playlists do AnimeThemes")
        ranks = animethemes_popular(io.post, io.sleep)
    if not ranks:
        raise FetchError("o sorteio veio vazio")
    order = draw_order(ranks, personal, tried, f"musicle-jp|anime|{fetched_at}", max_anime)
    cache = AppleCache(
        resolved={k: list(v) for k, v in known_resolved.items()}, official=dict(known_official)
    )
    apple = AppleClient(cache, io.get, io.sleep, io.apple_pace)
    progress = Progress(target_per_tier, max_songs)
    records: list[JSON] = []
    used_lookups: dict[str, JSON] = {}
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
            source = sources.get(mal_id)
            if source is None:
                continue  # o AnimeThemes não tem o anime: nem entra no snapshot (outro sorteio)
            source = merge_sources(source, quiz.get(mal_id, []))
            # O nível do anime é só o do MAL (P256): sem ele, a posição nas playlists do
            # AnimeThemes serve ao sorteio, mas não vira nível (o tema já tem o das playlists).
            rank = ranks.get(mal_id) if io.mal is not None else None
            record = _anime_record(source, None if rank is None else mal_level(rank))
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
            for entry in entries:
                record["themes"].append(entry["record"])
                if entry["lookup"] is not None:
                    used_lookups[entry["lookup"]["trackId"]] = entry["lookup"]
                    progress.add(entry["theme"], anime)
            records.append(record)
            matched = sum(t["result"] == "matched" for t in record["themes"])
            io.log(f"{source.name}: {matched} de {len(record['themes'])} tema(s)")
        if stopped or progress.done():
            break
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
        "anime": records,
        "artists": {k: v for k, v in sorted(cache.official.items()) if k in artist_ids},
        # Só as resoluções novas: as antigas já estão nos snapshots de antes.
        "resolved": dict(sorted(new.items())),
        "tracks": dict(sorted(used_lookups.items())),
    }


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
