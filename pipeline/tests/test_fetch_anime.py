"""A busca do Anime (M14): as fontes, os níveis, o sorteio, a Apple e o snapshot, sem rede."""

from __future__ import annotations

import json
from urllib.parse import parse_qs, urlsplit

import pytest

from musicle_pipeline import fetch_anime as fa
from musicle_pipeline.anime import build_anime_catalog
from musicle_pipeline.catalog import Curation
from musicle_pipeline.cli import main
from musicle_pipeline.fetch import FetchError
from musicle_pipeline.io_json import dumps, write_if_changed
from musicle_pipeline.providers.apple_anime import AppleAnimeProvider
from musicle_pipeline.validate_anime import validate_anime_catalog

NOW = "2026-10-22T01:00:00Z"
SECRET = "client-id-de-teste-0000"


def test_level_scales():
    assert (fa.mal_level(1), fa.mal_level(50), fa.mal_level(51), fa.mal_level(6001)) == (9, 9, 8, 0)
    assert (fa.tracks_level(1065), fa.tracks_level(2), fa.tracks_level(3)) == (9, 0, 1)
    assert (fa.anisongdb_level(87.5), fa.anisongdb_level(100), fa.anisongdb_level(3)) == (8, 9, 0)


def animethemes_item(mal_id: int = 38000) -> dict:
    return {
        "slug": "kimetsu_no_yaiba",
        "title": {"romaji": "Kimetsu no Yaiba", "english": "Demon Slayer", "native": "鬼滅の刃"},
        "year": 2019,
        "synonyms": [{"text": "KnY"}, {"text": "Kimetsu no Yaiba"}],
        "series": {"nodes": [{"slug": "kimetsu_no_yaiba", "title": {"romaji": "Kimetsu"}}]},
        "resources": {
            "nodes": [{"site": "MAL", "externalId": mal_id}, {"site": "KITSU", "externalId": 1}]
        },
        "animethemes": [
            {
                "type": "OP",
                "sequence": None,
                "group": None,
                "song": {
                    "title": {"romaji": "Gurenge", "native": None},
                    "performances": [
                        {
                            "as": None,
                            "artist": {"slug": "lisa", "name": {"main": "LiSA", "native": None}},
                        },
                        {
                            "as": None,
                            "artist": {"slug": "lisa", "name": {"main": "LiSA", "native": None}},
                        },
                    ],
                },
                "animethemeentries": [{"tracksCount": 950}, {"tracksCount": 3}],
            },
            {
                "type": "OP",
                "sequence": 1,
                "group": {"slug": "english"},  # o grupo repete a música: fica de fora
                "song": {"title": {"romaji": "Gurenge"}, "performances": []},
                "animethemeentries": [],
            },
            {
                "type": "ED",
                "sequence": 1,
                "group": None,
                "song": {"title": {"romaji": "from the edge"}, "performances": []},
                "animethemeentries": [{"tracksCount": 40}],
            },
        ],
    }


def test_parse_animethemes():
    found = fa.parse_animethemes({"data": {"findAnimeByExternalSite": [animethemes_item()]}})
    anime = found[38000]
    assert (anime.slug, anime.name, anime.year) == ("kimetsu_no_yaiba", "Kimetsu no Yaiba", 2019)
    assert anime.synonyms == ["Demon Slayer", "鬼滅の刃", "KnY"]
    assert anime.series == [("kimetsu_no_yaiba", "Kimetsu")]
    op, ed = anime.themes
    assert (op.type, op.sequence, op.song, op.artists, op.levels) == (
        "OP",
        None,
        "Gurenge",
        ["LiSA"],
        {"animethemes": 9},
    )
    assert (ed.artists, ed.levels) == ([], {"animethemes": 4})
    with pytest.raises(FetchError, match="erro"):
        fa.parse_animethemes({"errors": [{"message": "complexity"}]})


QUIZ = [
    {
        "linked_ids": {"myanimelist": 38000},
        "songType": "Ending 1",
        "songName": "from the edge",
        "songArtist": "FictionJunction feat. LiSA",
        "artists": [{"names": ["FictionJunction"]}, {"names": ["LiSA", "Lisa"]}],
        "songDifficulty": 61.2,
    },
    {
        "linked_ids": {"myanimelist": 38000},
        "songType": "Opening 1",
        "songName": "Gurenge",
        "artists": [{"names": ["LiSA"]}],
        "songDifficulty": 87.0,
    },
    {
        "linked_ids": {"myanimelist": 38000},
        "songType": "Insert Song",
        "songName": "Kamado Tanjirou no Uta",
        "artists": [{"names": ["Go Shiina"]}],
        "songDifficulty": 35.0,
    },
    {
        "linked_ids": {"myanimelist": 38000},
        "songType": "Opening 1",
        "songName": "Gurenge (English)",
        "isDub": True,
        "artists": [],
    },
]


def test_parse_anisongdb_and_merge():
    quiz = fa.parse_anisongdb(QUIZ)[38000]
    assert [(q.type, q.sequence, q.song) for q in quiz] == [
        ("ED", 1, "from the edge"),
        ("OP", 1, "Gurenge"),
        ("IN", None, "Kamado Tanjirou no Uta"),
    ]
    anime = fa.parse_animethemes({"data": {"findAnimeByExternalSite": [animethemes_item()]}})[38000]
    merged = fa.merge_sources(anime, quiz)
    by_song = {t.song: t for t in merged.themes}
    # O AnimeThemes sem artista (62% das músicas) ganha os do AnisongDB; os níveis se juntam.
    assert by_song["from the edge"].artists == ["FictionJunction", "LiSA"]
    assert by_song["Gurenge"].levels == {"animethemes": 9, "anisongdb": 8}
    assert by_song["Kamado Tanjirou no Uta"].type == "IN"  # a insert só do AnisongDB entra


def test_parse_personal_list():
    xml = """<?xml version="1.0"?><myanimelist>
      <anime><series_animedb_id>1</series_animedb_id><my_status>Completed</my_status><my_score>9</my_score></anime>
      <anime><series_animedb_id>2</series_animedb_id><my_status>Watching</my_status><my_score>0</my_score></anime>
      <anime><series_animedb_id>3</series_animedb_id><my_status>Plan to Watch</my_status><my_score>10</my_score></anime>
      <anime><series_animedb_id>4</series_animedb_id><my_status>On-Hold</my_status><my_score>7</my_score></anime>
      <anime><series_animedb_id>5</series_animedb_id><my_status>Dropped</my_status><my_score>8</my_score></anime>
    </myanimelist>"""
    assert fa.parse_personal_list(xml) == ([1], [2, 4])


def test_draw_order_is_deterministic_and_mixes_the_personal_list():
    ranks = {m: m for m in range(1, 101)}
    first = fa.draw_order(ranks, ([500, 501], [502]), {7}, "semente", 20)
    assert first == fa.draw_order(ranks, ([500, 501], [502]), {7}, "semente", 20)
    assert len(first) == 20 and len(set(first)) == 20 and 7 not in first
    assert [first[0], first[7], first[14]] == [500, 501, 502]  # um da lista a cada 7
    assert first != fa.draw_order(ranks, ([500, 501], [502]), {7}, "outra", 20)
    # O topo sai mais: na média, os sorteados ficam na metade de cima do ranking.
    drawn = [m for m in first if m < 500]
    assert sum(drawn) / len(drawn) < 50


def artist(name: str, aid: int, genre: str = "アニメ") -> dict:
    return {"wrapperType": "artist", "artistName": name, "artistId": aid, "primaryGenreName": genre}


def test_choose_artists():
    results = [artist("LiSA", 1), artist("LISA", 2, "ポップ"), artist("Lisa", 3, "R&B")]
    assert fa.choose_artists("LiSA", results) == ["1"]  # o nome igual vence
    assert fa.choose_artists("lisa", results) == ["1"]  # a chave estrita, e o gênero anime
    assert fa.choose_artists("Youko Hikasa", [artist("Yoko Hikasa", 9)]) == ["9"]  # a frouxa
    assert fa.choose_artists("Outro", results) == []


def song(tid: int, title: str, released: str = "2019-07-02T15:00:00Z") -> dict:
    return {
        "wrapperType": "track",
        "kind": "song",
        "trackId": tid,
        "trackName": title,
        "artistId": 1,
        "artistName": "LiSA",
        "collectionId": tid + 1000,
        "collectionName": f"{title} - Single",
        "releaseDate": released,
        "trackTimeMillis": 240000,
        "trackExplicitness": "notExplicit",
        "previewUrl": f"https://audio-ssl.itunes.apple.com/itunes-assets/{tid}.m4a",
        "artworkUrl100": f"https://is1-ssl.mzstatic.com/image/thumb/{tid}/100x100bb.jpg",
        "trackViewUrl": f"https://music.apple.com/jp/album/x/{tid + 1000}?i={tid}&uo=4",
    }


class FakeWeb:
    """As quatro fontes, com o registro de cada pedido."""

    def __init__(self, quiz_fails: bool = False) -> None:
        self.gets: list[str] = []
        self.mal_urls: list[str] = []
        self.posts: list[tuple[str, dict]] = []
        self.quiz_fails = quiz_fails

    def mal(self, url: str) -> bytes:
        self.mal_urls.append(url)
        offset = int(parse_qs(urlsplit(url).query)["offset"][0])
        data = [] if offset else [{"node": {"id": 38000}, "ranking": {"rank": 3}}]
        return json.dumps({"data": data}).encode()

    def post(self, url: str, body: bytes, headers) -> bytes:
        payload = json.loads(body)
        self.posts.append((url, payload))
        if url == fa.ANISONGDB_URL:
            if self.quiz_fails:
                raise FetchError("fora do ar")
            return json.dumps(QUIZ).encode()
        if "Popular" in payload["query"]:
            entry = {
                "animetheme": {
                    "anime": {"resources": {"nodes": [{"site": "MAL", "externalId": 38000}]}}
                }
            }
            data = {"animethemeentryPagination": {"data": [entry]}}
            return json.dumps({"data": data}).encode()
        return json.dumps({"data": {"findAnimeByExternalSite": [animethemes_item()]}}).encode()

    def get(self, url: str) -> bytes:
        self.gets.append(url)
        query = parse_qs(urlsplit(url).query)
        if "search" in url:
            term = query["term"][0]
            return json.dumps({"results": [artist("LiSA", 1)] if term == "LiSA" else []}).encode()
        results = [
            artist("LiSA", 1),
            song(10, "紅蓮華"),
            song(11, "紅蓮華 (TV Size)"),
            song(12, "炎", "2020-10-13T15:00:00Z"),
            song(13, "from the edge"),
        ]
        return json.dumps({"results": results}).encode()


ROMAJI = {"紅蓮華": ("Gurenka",), "炎": ("Honoo",)}


def run(web: FakeWeb, with_mal: bool = True, **kwargs) -> dict:
    io = fa.AnimeFetch(get=web.get, post=web.post, mal=web.mal if with_mal else None, apple_pace=0)
    return fa.fetch_anime_snapshot(
        NOW, lambda t: ROMAJI.get(t, (t,)), set(), {}, {}, io, target_per_tier=1, **kwargs
    )


def test_a_full_search_with_the_mal(tmp_path):
    web = FakeWeb()
    snap = run(web)
    (anime,) = snap["anime"]
    assert anime["levels"] == {"mal": 9}
    results = {t["song"]: (t["result"], t["track"]) for t in anime["themes"]}
    assert results["Gurenge"] == ("matched", "10")  # a completa, e não a TV size
    assert results["from the edge"] == ("matched", "13")
    assert results["Kamado Tanjirou no Uta"] == ("no-artist", None)
    assert set(snap["tracks"]) == {"10", "13"}  # só as faixas escolhidas
    assert snap["resolved"] == {"FictionJunction": [], "Go Shiina": [], "LiSA": ["1"]}
    # Um pedido de cada fonte de anime por lote, e o artista buscado uma vez só.
    assert sum(1 for g in web.gets if "search" in g) == 3
    # O snapshot vira um catálogo válido.
    write_if_changed(tmp_path / f"{snap['id']}.json", dumps(snap))
    catalog = build_anime_catalog(
        "apple", "jp", AppleAnimeProvider(tmp_path).source(), Curation(), []
    )
    assert validate_anime_catalog(catalog, dumps(catalog).encode()) == []


def test_the_client_id_never_leaves_the_header(monkeypatch):
    sent: list = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, size):
            return b'{"data": []}'

    def fake_urlopen(request, timeout):
        sent.append(request)
        return Response()

    monkeypatch.setattr(fa.urllib.request, "urlopen", fake_urlopen)
    get = fa.mal_get(SECRET)
    get("https://api.myanimelist.net/v2/anime/ranking?limit=1")
    (request,) = sent
    assert request.get_header("X-mal-client-id") == SECRET
    assert SECRET not in request.full_url
    web = FakeWeb()
    snap = run(web)
    assert SECRET not in dumps(snap)


def test_without_the_mal_the_draw_uses_animethemes_and_no_mal_level():
    web = FakeWeb()
    snap = run(web, with_mal=False)
    assert web.mal_urls == []
    assert snap["anime"][0]["levels"] == {}
    assert any("Popular" in p["query"] for _, p in web.posts if "query" in p)


def test_a_missing_anisongdb_does_not_stop_the_search():
    snap = run(FakeWeb(quiz_fails=True))
    themes = snap["anime"][0]["themes"]
    assert [t["song"] for t in themes] == ["Gurenge", "from the edge"]
    assert themes[0]["levels"] == {"animethemes": 9}


def test_the_search_stops_at_max_songs():
    snap = run(FakeWeb(), max_songs=1)
    matched = [t for t in snap["anime"][0]["themes"] if t["result"] == "matched"]
    assert len(matched) >= 1


def test_fetch_anime_flags(capsys):
    args = ["fetch", "--provider", "apple", "--fetched-at", NOW]
    assert main([*args, "--anime", "--today", "2026-10-22"]) == 1
    assert "--anime é uma busca à parte" in capsys.readouterr().err
    assert main([*args, "--today", "2026-10-22", "--personal", "x.xml"]) == 1
    assert "só valem com --anime" in capsys.readouterr().err
