"""A busca do Anime (M14): as fontes, os níveis, o sorteio, a Apple e o snapshot, sem rede."""

from __future__ import annotations

import json
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit

import pytest

from musicle_pipeline import fetch_anime as fa
from musicle_pipeline import mal_ranking
from musicle_pipeline.anime import Anime, Theme, build_anime_catalog
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


def amq_song(song_id: int, mal_id: object, rate: object, **extra: object) -> dict:
    """Uma música do get_n_random_songs do AnisongDB, só com o que a ordem do AMQ lê."""
    return {
        "annSongId": song_id,
        "linked_ids": {"myanimelist": mal_id},
        "songDifficulty": rate,
        "isDub": False,
        "isRebroadcast": False,
        **extra,
    }


class FakeWeb:
    """As quatro fontes, com o registro de cada pedido."""

    def __init__(self, quiz_fails: bool = False, amq: list[list[dict]] | None = None) -> None:
        self.gets: list[str] = []
        self.mal_urls: list[str] = []
        self.posts: list[tuple[str, dict]] = []
        self.quiz_fails = quiz_fails
        # As respostas do get_n_random_songs, uma por pedido (a última se repete).
        self.amq = amq if amq is not None else [[amq_song(1, 38000, 80)]]
        self.amq_calls = 0

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
        if url == fa.ANISONGDB_RANDOM_URL:  # antes do payload["query"]: o corpo do AMQ não tem
            page = self.amq[min(self.amq_calls, len(self.amq) - 1)]
            self.amq_calls += 1
            return json.dumps(page).encode()
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
    source = AppleAnimeProvider(tmp_path).source()
    catalog = build_anime_catalog("apple", "jp", source, Curation(), [], icon_artists=frozenset())
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


# --- a revisão do PR A3 (o /code-review) ---------------------------------------------------------


def test_a_network_failure_keeps_what_was_already_fetched():
    # A Apple cai no meio: o snapshot sai com o que já veio, e o anime pela metade fica de fora
    # (volta a ser sorteado numa próxima busca).
    web = FakeWeb()
    calls = {"n": 0}
    original = web.get

    def flaky(url: str) -> bytes:
        calls["n"] += 1
        if "search" in url and "Go+Shiina" in url:
            raise FetchError("HTTP 403")
        return original(url)

    web.get = flaky
    snap = run(web)
    assert snap["anime"] == []  # o único anime ficou pela metade: fora do snapshot
    assert snap["tracks"] == {}


def test_the_two_sources_join_with_wo_and_o():
    anime = fa.parse_animethemes({"data": {"findAnimeByExternalSite": [animethemes_item()]}})[38000]
    anime.themes[0].song = "Shinzou wo Sasageyo"
    quiz = [fa.SourceTheme("OP", 1, "Shinzou o Sasageyo", ["Linked Horizon"], {"anisongdb": 8})]
    merged = fa.merge_sources(anime, quiz)
    assert [t.song for t in merged.themes if t.type == "OP"] == ["Shinzou wo Sasageyo"]
    assert merged.themes[0].levels == {"animethemes": 9, "anisongdb": 8}


def test_the_two_sources_join_a_loose_title_left_over():
    # P275: o título igual primeiro; o que sobra junta pelo título frouxo, se for o único.
    anime = fa.parse_animethemes({"data": {"findAnimeByExternalSite": [animethemes_item()]}})[38000]
    anime.themes[0].song = "LOST IN PARADISE feat. AKLO"
    quiz = [
        fa.SourceTheme("OP", 1, "LOST IN PARADISE", ["ALI"], {"anisongdb": 8}),
        fa.SourceTheme("ED", 1, "Lost in Paradise", ["ALI"], {"anisongdb": 3}),
    ]
    merged = fa.merge_sources(anime, quiz)
    assert merged.themes[0].levels == {"animethemes": 9, "anisongdb": 8}
    # O encerramento de mesmo nome não casa com a abertura: entra à parte.
    assert [(t.type, t.song) for t in merged.themes][-1] == ("ED", "Lost in Paradise")


def test_an_empty_romanization_does_not_stop_the_matching():
    from musicle_pipeline.anime import match_theme

    def broken(text: str):
        raise ValueError("romanização vazia")

    pool = fa._raw_tracks([fa._song(song(10, "紅蓮華"))], {})
    assert match_theme("紅蓮華", list(pool.values()), broken).result == "matched"


def test_the_progress_counts_the_rivals_of_the_anime():
    # A faixa aproximada da busca leva a concorrência, como o build: o encerramento de quiz 5 e
    # pl 5 num anime do MAL 9 dá o nome no Fácil sozinho (0,43) e no Médio entre 21 (0,18).
    (track,) = fa._raw_tracks([fa._song(song(10, "紅蓮華"))], {}).values()
    ending = Theme(
        "ED", 1, "Gurenge", ("LiSA",), {"anisongdb": 5, "animethemes": 5}, "matched", track
    )
    show = Anime(38000, "kimetsu", "Kimetsu no Yaiba", (), 2019, (), {"mal": 9}, ())
    alone = fa.Progress(target=1, max_songs=99)
    alone.add(ending, show, 1)
    assert alone.counts["musica"]["facil"] == 1 and alone.counts["titulo"]["facil"] == 1
    many = fa.Progress(target=1, max_songs=99)
    many.add(ending, show, 21)
    assert many.counts["musica"]["medio"] == 1 and many.counts["titulo"]["facil"] == 1


def test_the_anime_options_need_anime(capsys):
    args = ["fetch", "--provider", "apple", "--fetched-at", NOW, "--today", "2026-10-22"]
    assert main([*args, "--max-songs", "10"]) == 1
    assert "só valem com --anime" in capsys.readouterr().err


# --- a busca longa (PR C2) -----------------------------------------------------------------------


def run_with(web: FakeWeb, **io_args) -> dict:
    io = fa.AnimeFetch(get=web.get, post=web.post, mal=web.mal, apple_pace=0, **io_args)
    return fa.fetch_anime_snapshot(
        NOW, lambda t: ROMAJI.get(t, (t,)), set(), {}, {}, io, target_per_tier=99, max_songs=99
    )


def test_the_snapshot_is_saved_after_each_anime():
    saved: list[dict] = []
    snap = run_with(FakeWeb(), save=saved.append)
    assert len(saved) == 1 and saved[-1] == snap  # um anime: uma gravação, igual ao final


def test_the_deadline_stops_before_the_next_anime():
    ticks = iter([0.0, 999.0])
    snap = run_with(FakeWeb(), clock=lambda: next(ticks), deadline=60)
    assert snap["anime"] == []  # o prazo venceu antes do 1º anime


def test_ctrl_c_keeps_what_was_already_fetched():
    web = FakeWeb()
    original = web.get

    def interrupted(url: str) -> bytes:
        if "search" in url:
            raise KeyboardInterrupt
        return original(url)

    web.get = interrupted
    snap = run_with(web)
    assert snap["anime"] == [] and snap["id"] == "2026-10-22T010000Z"


def test_an_artist_over_200_songs_is_searched_in_the_albums():
    web = FakeWeb()
    lookups: list[str] = []

    def get(url: str) -> bytes:
        query = parse_qs(urlsplit(url).query)
        if "search" in url:
            return json.dumps(
                {"results": [artist("LiSA", 1)] if query["term"][0] == "LiSA" else []}
            ).encode()
        lookups.append(url)
        if query.get("entity") == ["album"]:
            album = {"wrapperType": "collection", "collectionId": 5000, "artistId": 1}
            return json.dumps({"results": [artist("LiSA", 1), album]}).encode()
        if query["id"] == ["5000"]:
            far = {**song(9999, "from the edge"), "collectionId": 5000}
            return json.dumps({"results": [far]}).encode()
        # O lookup de músicas no teto (200), sem o tema: só a busca nos álbuns o acha.
        fillers = [song(100 + i, f"Outra música {i}") for i in range(fa.SONG_LIMIT)]
        return json.dumps({"results": [artist("LiSA", 1), song(10, "紅蓮華"), *fillers]}).encode()

    web.get = get
    snap = run_with(web)
    results = {t["song"]: (t["result"], t["track"]) for t in snap["anime"][0]["themes"]}
    assert results["from the edge"] == ("matched", "9999")
    assert sum("entity=album" in u for u in lookups) == 1  # os álbuns uma vez só por artista


# --- a ordem pelos acertos do AMQ (a carga C3) ---------------------------------------------------


def test_amq_ranks_each_anime_by_its_best_guess_rate(monkeypatch):
    monkeypatch.setattr(fa, "AMQ_FRESH", 1)  # o 2º pedido, sem música nova, encerra a amostra
    page = [
        amq_song(1, 100, 70),
        amq_song(2, 200, 90),
        amq_song(3, 100, 95.5),  # o anime 100 vale a maior taxa dele
        amq_song(4, 50, 90),  # o empate com o 200 sai pelo id
        amq_song(5, 300, 99, isDub=True),  # a dublagem fica de fora
        amq_song(6, 400, 99, isRebroadcast=True),  # e a reprise também
        amq_song(7, None, 99),  # sem o id do MAL
        amq_song(9, True, 99),  # o id booleano
        amq_song(10, 0, 99),  # e o zero
        {"linked_ids": {"myanimelist": 700}, "songDifficulty": 99},  # sem o annSongId
        amq_song(1, 600, 99),  # a música repetida conta uma vez (a 1ª vale)
        # A taxa fora do filtro (o servidor que o ignorou), o NaN, o infinito e o que não é número.
        amq_song(11, 800, 40),
        amq_song(12, 900, float("nan")),
        amq_song(13, 901, float("inf")),
        amq_song(14, 902, True),
    ]
    web = FakeWeb(amq=[page, page])
    logs: list[str] = []
    rates = fa.amq_rates(web.post, lambda _s: None, log=logs.append)
    assert rates == {100: 95.5, 200: 90, 50: 90}
    # Com a mesma fama no MAL, vale o acerto; o empate sai pelo id.
    assert fa.amq_ranks(rates, lambda _m: 9) == {100: 1, 50: 2, 200: 3}
    assert web.amq_calls == 2
    url, body = web.posts[0]
    assert url == fa.ANISONGDB_RANDOM_URL and body["n"] == 500
    assert body["filters"] == {
        "difficulty": {"start": 60, "end": 100},
        "song_types": ["opening", "ending", "insert"],
        "broadcasts": ["normal"],
        "song_categories": ["standard"],
    }
    assert "4 música(s) do AMQ fora do filtro" in logs[0]
    assert logs[-1] == "o AMQ: 2 pedido(s), 4 música(s), 3 anime(s)"
    assert not any("95" in line for line in logs)  # só as contagens no log (P254)


def test_amq_stops_at_the_call_limit_and_refuses_a_bad_shape():
    pages = [[amq_song(n * 100 + i, n * 100 + i, 80) for i in range(20)] for n in range(1, 6)]
    web = FakeWeb(amq=pages)
    rates = fa.amq_rates(web.post, lambda _s: None, max_calls=3)
    assert web.amq_calls == 3 and len(rates) == 60
    broken = FakeWeb()
    broken.post = lambda url, body, headers: json.dumps({"x": 1}).encode()  # type: ignore[method-assign]
    with pytest.raises(FetchError, match="forma inesperada"):
        fa.amq_rates(broken.post, lambda _s: None)


def test_the_amq_order_weighs_the_guess_rate_by_the_mal_fame():
    # O viés do AMQ (P336): a música de um anime de nicho só toca para quem o assistiu, e quase
    # todos acertam. O nicho com 100% e sem nível no MAL vai atrás do clássico com 80% e nível 9,
    # e o 6 com 95% fica entre os dois.
    rates = {1: 100.0, 2: 80.0, 3: 95.0}
    levels = {1: None, 2: 9, 3: 6}
    assert fa.amq_ranks(rates, levels.get) == {2: 1, 3: 2, 1: 3}
    # A fama é a mesma da chance da P272 (o p_a do "acertar o anime").
    assert fa.anime_factor(9) == Decimal("0.92") and fa.anime_factor(None) == fa.anime_factor(1)


def test_the_ranked_order_has_no_draw_and_skips_the_tried():
    ranks = {5: 2, 7: 1, 9: 3, 11: 4}
    assert fa.ranked_order(ranks, {7}, 10) == [5, 9, 11]
    assert fa.ranked_order(ranks, set(), 2) == [7, 5]


def amq_run(web: FakeWeb, logs: list[str] | None = None, **io_args) -> dict:
    io_args.setdefault("mal", web.mal)
    sink = logs if logs is not None else []  # e não `logs or []`: a lista vazia é falsa
    io = fa.AnimeFetch(get=web.get, post=web.post, apple_pace=0, log=sink.append, **io_args)
    return fa.fetch_anime_snapshot(
        NOW, lambda t: ROMAJI.get(t, (t,)), set(), {}, {}, io, target_per_tier=1, draw="amq"
    )


def test_the_amq_orders_and_the_mal_only_levels(monkeypatch):
    # O AMQ põe o 38000 em 1º, e o MAL, em 2.000º: o nível é o da posição no MAL (3), e não o da
    # ordem (que daria 9). O MAL é pedido até a escala inteira (6.000), e não os 3.000 do sorteio.
    sizes: list[int] = []

    def ranking(get, sleep, size):
        sizes.append(size)
        return {38000: 2000}

    monkeypatch.setattr(fa, "fetch_ranking", ranking)
    web = FakeWeb(amq=[[amq_song(1, 38000, 83.7)]])
    logs: list[str] = []
    snap = amq_run(web, logs)
    assert snap["anime"][0]["levels"] == {"mal": 3}
    assert sizes == [6000]
    assert not any("Popular" in p.get("query", "") for _, p in web.posts)  # nem o AnimeThemes
    # A taxa não vai para o snapshot nem para o log (P254).
    assert "83.7" not in dumps(snap) and not any("83" in line for line in logs)


def test_the_amq_with_the_ranks_file_levels_from_it():
    web = FakeWeb()
    mal_file = fa.RankingFile(order=(38000,), levels={38000: 6})
    logs: list[str] = []
    snap = amq_run(web, logs, mal=None, mal_file=mal_file)
    assert web.mal_urls == []  # nenhum pedido ao MAL
    assert snap["anime"][0]["levels"] == {"mal": 6}
    # O arquivo do robô tem só os 3.000 do topo: o aviso diz que os de além ficam sem nível.
    assert any("o --ranks-file tem 1 anime(s)" in line for line in logs)


def test_the_amq_order_needs_the_mal_level(monkeypatch):
    web = FakeWeb()
    with pytest.raises(FetchError, match="nível do MAL"):
        run(web, with_mal=False, draw="amq")
    assert web.posts == []  # recusa antes de qualquer pedido
    # O ranking do MAL vazio também recusa: todo anime da carga ficaria sem nível para sempre.
    monkeypatch.setattr(fa, "fetch_ranking", lambda get, sleep, size: {})
    with pytest.raises(FetchError, match="ranking do MAL veio vazio"):
        amq_run(FakeWeb())


def test_a_failing_or_empty_amq_stops_the_load():
    # Sem cair em silêncio para o sorteio do MAL: seria outra carga.
    web = FakeWeb()

    def down(url: str, body: bytes, headers) -> bytes:
        if url == fa.ANISONGDB_RANDOM_URL:
            raise FetchError("fora do ar")
        return FakeWeb.post(web, url, body, headers)

    web.post = down  # type: ignore[method-assign]
    with pytest.raises(FetchError, match="fora do ar"):
        amq_run(web)
    assert web.mal_urls == []
    with pytest.raises(FetchError, match="veio vazia"):
        amq_run(FakeWeb(amq=[[]]))


def test_the_amq_snapshot_lists_the_anime_by_id():
    # A ordem da busca é a do acerto (o 38000 antes do 500); no snapshot, que vai para o Git, os
    # animes saem pelo id, para a ordem não guardar o ranking (P254).
    web = FakeWeb(amq=[[amq_song(1, 38000, 90), amq_song(2, 500, 70)]])

    def two_shows(url: str, body: bytes, headers) -> bytes:
        if url == fa.ANIMETHEMES_URL:
            web.posts.append((url, json.loads(body)))
            shows = [animethemes_item(38000), animethemes_item(500)]
            return json.dumps({"data": {"findAnimeByExternalSite": shows}}).encode()
        return FakeWeb.post(web, url, body, headers)

    web.post = two_shows  # type: ignore[method-assign]
    io = fa.AnimeFetch(get=web.get, post=web.post, mal=web.mal, apple_pace=0)
    snap = fa.fetch_anime_snapshot(
        NOW,
        lambda t: ROMAJI.get(t, (t,)),
        set(),
        {},
        {},
        io,
        target_per_tier=99,
        max_songs=99,
        draw="amq",
    )
    assert [a["malId"] for a in snap["anime"]] == [500, 38000]


def test_the_cli_draw_option(monkeypatch, tmp_path, capsys):
    seen: dict = {}

    def fake_snapshot(fetched_at, romanize, tried, resolved, official, io, **kwargs):
        seen.update(kwargs, mal=io.mal, mal_file=io.mal_file)
        return {
            "provider": "apple",
            "storefront": "jp",
            "id": "2026-10-22T010000Z",
            "fetchedAt": fetched_at,
            "anime": [{"malId": 38000, "themes": []}],
            "artists": {},
            "resolved": {},
            "tracks": {},
        }

    monkeypatch.setattr(fa, "fetch_anime_snapshot", fake_snapshot)
    monkeypatch.setattr(fa, "cached_romanizer", lambda: lambda t: (t,))
    base = ["fetch", "--provider", "apple", "--anime", "--fetched-at", NOW]
    # Sem o MAL, o --draw amq recusa antes da rede (P335).
    monkeypatch.delenv("MAL_CLIENT_ID", raising=False)
    assert main([*base, "--draw", "amq", "--out-dir", str(tmp_path / "a")]) == 1
    assert "--draw amq precisa do nível do MAL" in capsys.readouterr().err
    monkeypatch.setenv("MAL_CLIENT_ID", SECRET)
    assert (
        main([*base, "--draw", "amq", "--personal", "x.xml", "--out-dir", str(tmp_path / "b")]) == 1
    )
    assert "--personal é só do sorteio do MAL" in capsys.readouterr().err
    assert main([*base, "--draw", "amq", "--pool-size", "300", "--out-dir", str(tmp_path)]) == 1
    assert "--pool-size é do sorteio do MAL" in capsys.readouterr().err
    assert main([*base, "--draw", "amq", "--out-dir", str(tmp_path / "c")]) == 0
    assert seen["draw"] == "amq" and seen["mal"] is not None
    # Sem a opção, o sorteio de sempre (o robô não a passa).
    assert main([*base, "--out-dir", str(tmp_path / "d")]) == 0
    assert seen["draw"] == "mal"
    # Com o --ranks-file, o amq dispensa a variável: o nível sai do arquivo.
    monkeypatch.delenv("MAL_CLIENT_ID")
    ranks = tmp_path / "ranks.json"
    mal_ranking.write_ranks(ranks, {38000: 3})
    args = [*base, "--draw", "amq", "--ranks-file", str(ranks), "--out-dir", str(tmp_path / "e")]
    assert main(args) == 0
    assert seen["draw"] == "amq" and seen["mal"] is None and seen["mal_file"] is not None
    # E a opção só vale com --anime.
    args = ["fetch", "--provider", "apple", "--fetched-at", NOW, "--today", "2026-10-22"]
    assert main([*args, "--draw", "amq"]) == 1
    assert "--draw só valem com --anime" in capsys.readouterr().err
