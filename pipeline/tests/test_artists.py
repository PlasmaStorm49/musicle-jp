"""Modo por artista (M13): a chave das músicas, as versões, a canônica, a ordem e os arquivos."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from musicle_pipeline import artists
from musicle_pipeline.aliases import parse_aliases
from musicle_pipeline.artists import (
    FLOWER_ROLES,
    LEVELS,
    ArtistRules,
    MedalName,
    MedalRules,
    artist_title_key,
    build_artist_file,
    build_artists,
    load_artist_list,
    select_songs,
    version_kind,
)
from musicle_pipeline.catalog import Curation
from musicle_pipeline.models import (
    ArtistEntry,
    ArtistSnapshot,
    InputError,
    RawAlbum,
    RawArtist,
    RawTrack,
)
from musicle_pipeline.normalize import title_key
from musicle_pipeline.validate_artists import validate_artist_list

ME = RawArtist("77", "テスト歌手", "Tesuto Kashu")
OTHER = RawArtist("55", "他の歌手", "Hoka")
# Os 3 nomes das medalhas, que o build-artists exige (P301): latinos, sem o romaji.
NAMED = MedalRules(names=tuple((lv, MedalName(f"Nome {lv}")) for lv in LEVELS))


def named_rules(artist_id: str, **kw) -> ArtistRules:
    return ArtistRules(artist_id, medals=NAMED, **kw)


def track(
    tid: str,
    title: str,
    album: str = "Album",
    album_id: str | None = None,
    date: str = "2024-01-01",
    kind: str = "album",
    by: tuple[RawArtist, ...] = (ME,),
    preview: str | None = "fixtures/audio/x.wav",
) -> RawTrack:
    return RawTrack(
        provider_id=tid,
        title=title,
        artists=by,
        album=RawAlbum(
            provider_id=album_id or f"al{tid}",
            title=album,
            type=kind,
            release_date=date,
            artwork_url="fixtures/art/x.svg",
        ),
        duration_ms=200000,
        explicit=False,
        preview_url=preview,
        preview_duration_sec=30,
    )


def snap(*entries: tuple[int | None, RawTrack]) -> ArtistSnapshot:
    return ArtistSnapshot(
        artist=ME,
        fetched_at="2026-10-12T15:00:00Z",
        entries=tuple(ArtistEntry(rank, t) for rank, t in entries),
    )


def pick(s: ArtistSnapshot, rules: ArtistRules | None = None, blocked=frozenset()):
    notes: list[str] = []
    songs = select_songs(s, rules or ArtistRules("77"), lambda t: t in blocked, notes)
    return songs, notes


@pytest.mark.parametrize(
    ("title", "same"),
    [
        ("光 (Karaoke)", "光"),
        ("Fly Me (In Other Words) [2007 Mix / Karaoke]", "Fly Me (In Other Words)"),
        ("新時代 (ウタ from ONE PIECE FILM RED)", "新時代"),
        ("アイドル (From 'Oshi no Ko')", "アイドル"),  # o crédito da origem também
        ("新時代 (ウタ from ONE PIECE FILM RED) [2023 Remaster]", "新時代"),  # crédito + remaster
        ("光 (Karaoke) (2022 Remaster)", "光"),
        # Formatos vistos nos 6 artistas reais (12/10/2026):
        ("ADAMAS -LANDER Live ver.-", "ADAMAS"),  # o "-X-" colado (LiSA)
        ("ADAMAS -ONLiNE LEO-NiNE Live ver.-", "ADAMAS"),  # com hífen dentro
        ("crossing field -2015武道館 Live Chocolate Ver.-", "crossing field"),
        ('cold rain ("Walpurgisnacht" Live at TOKYO GARDEN THEATER)', "cold rain"),  # Aimer
        ("ninelie (TV size) [with chelly]", "ninelie"),  # o crédito "with"
        ("炎 -MOVIE ver.-", "炎"),
        ("best day, best way -short size ver.", "best day, best way"),  # sem o hífen final
        ("KICK BACK -ANIME edit", "KICK BACK"),
        ("星の消えた夜に (Remaster for 星の消えた夜に 2022)", "星の消えた夜に"),
        ("Bubble feat.Uta", "Bubble (feat. Uta)"),  # o feat. sem espaço (Eve)
        ("唱 (Sped Up)", "唱"),
        ("紅蓮華 - From THE FIRST TAKE", "紅蓮華"),
        ("夜に駆ける (English Version)", "夜に駆ける"),
        ("Song (TV Size)", "Song"),  # o title_key da parada já tira
        ("Song (Remastered 2022)", "Song"),
        ("Empty MERMAiD-Instrumental-", "Empty MERMAiD"),  # o "-X-" grudado (LiSA)
        ("紅蓮華 -ONLiNE LEO-NiNE Live ver.-", "紅蓮華"),  # um hífen dentro não o confunde
        # System of a Down (13/10/2026): o " - " dentro do parêntese, o set de DJ e o "(Clean)".
        ("Sugar (Live at Irving Plaza, NYC, NY - January 1999)", "Sugar"),
        ("Science (Live from The Hurricane Festival - Explicit)", "Science"),
        ("Chop Suey! (Mixed)", "Chop Suey!"),
        ("Kill Rock 'n Roll (Clean)", "Kill Rock 'n Roll"),
    ],
)
def test_the_key_joins_versions_of_the_same_song(title, same):
    assert artist_title_key(title) == artist_title_key(same)


@pytest.mark.parametrize(
    "title",
    [
        "Stay (Forever)",
        "Deep (EPIC)",
        "Alive",
        "ROCK-mode",
        "Chill-Chill-Dal-Da",
        "X-Y-",
        # Só o sufixo inteiro: a palavra no nome fica.
        "Mixed Feelings",
        "Clean Slate (Mixed Up)",
        "Soldier Side - Intro",  # a abertura do álbum é outra faixa (o artists.toml a tira)
    ],
)
def test_the_key_keeps_tails_that_are_part_of_the_name(title):
    assert artist_title_key(title) == title_key(title)


@pytest.mark.parametrize(
    ("title", "album", "kind"),
    [
        ("光", "Album", None),
        ("光 (Karaoke)", "Album", "out"),
        ("光 (Instrumental)", "Album", "out"),
        ("光 - Off Vocal", "Album", "out"),
        ("光 (Live)", "Album", "out"),
        ("光", "LiVE is Smile Always～LADYBUG～ at 日本武道館", "out"),  # ao vivo pelo álbum
        ("光", "Into The Night (English Version) - Single", "out"),
        ("光 - From THE FIRST TAKE", "Album", "out"),
        ("光 (Acoustic)", "Album", "out"),
        ("光 (feat. 他の歌手)", "Album", "secondary"),
        ("光 (2022 Remaster)", "Album", "secondary"),
        ("新時代 (ウタ from ONE PIECE FILM RED)", "Album", "secondary"),
        ("Alive", "Alive", None),  # "live" só como palavra inteira
        ("Live to Survive", "Live to Survive - Single", None),  # single de estúdio (Aimer)
        ("Song", "Ado 1st Live Kigeki (Live At Zepp DiverCity, 2022)", "out"),
        ("Song", "LiVE is Smile Always～LANDER～", "out"),
        ("Song", "Ado WORLD TOUR “Hibana”", "out"),
        # Não sai como ao vivo; é "secondary" pela regra da parada (o normalize.py tira "live ...").
        ("Song (Live Forever)", "Album", "secondary"),
        ("Song (Live at Budokan)", "Album", "out"),
        ("Song - 2019 Live", "Album", "out"),
        ("Song (Live Ver.)", "Album", "out"),
        ("唱 (A Cappella)", "Album", "out"),
        ("唱 (Sped Up)", "Album", "out"),
        ("唱 (Stripped)", "Album", "out"),
        ("best day, best way -short size ver.", "Album", "out"),
        ('Black Bird (Aimer "soleil et pluie" Asia Tour in Shanghai)', "Album", "out"),
        ("冬のダイヤモンド(Re-echoed by Genki Rockets)", "Album", "out"),
        ("NANIMONO (feat. 米津玄師) -extended mix-", "Album", "out"),
        ("Prologue", "THE BOOK", "out"),  # vinheta de álbum, não música
        ('Interlude "Awakening"', "THE BOOK 3", "out"),
        ("After Dark -prologue-", "Album", "secondary"),  # a música, com o nome da versão
        ("KICK BACK -ANIME edit", "Album", "secondary"),
        ("炎 -MOVIE ver.-", "Album", "secondary"),
        ("ninelie [with chelly]", "Album", "secondary"),
        ("今日から思い出 Evergreen ver.", "Album", "secondary"),
        ("光 (Off-Vocal)", "Album", "out"),
        ("光 (ライヴ)", "Album", "out"),
        ("Song", "Album（Live）", "out"),  # largura total no nome do álbum
        ("Song", "Tour Final LIVE", "out"),
        ("Empty MERMAiD-Instrumental-", "Album", "out"),  # o "-X-" grudado (LiSA)
        ("六等星の夜 Tvsize", "Album", "out"),  # sem delimitador (Aimer)
        ("Re:pray TV Size", "Album", "out"),
        ("Song Instrumental", "Album", "out"),
        ("Size", "Album", None),  # só no fim e depois de um espaço
        # System of a Down (13/10/2026, ME85).
        ("Sugar (Live at Irving Plaza, NYC, NY - January 1999)", "Toxicity", "out"),
        ("Science (Live from The Hurricane Festival - Explicit)", "Hypnotize - Single", "out"),
        ("Chop Suey! (Mixed)", "Today's Hits: October 2024 (DJ Mix)", "out"),
        ("Arto (Mixed)", "Album", "out"),  # o "(Mixed)" basta, sem o álbum de DJ
        ("Chop Suey!", "Today's Hits: October 2024 (DJ Mix)", "out"),  # e o álbum de DJ também
        ("Kill Rock 'n Roll (Clean)", "Hypnotize", "secondary"),
        ("Song (Mixed Up)", "Album", None),  # "Mixed" só como o sufixo inteiro
        ("Song - Clean Slate", "Album", None),
        ("Song (Remix - feat. 他の歌手)", "Album", "out"),  # o " - " dentro do parêntese
    ],
)
def test_version_kind(title, album, kind):
    assert version_kind(track("1", title, album)) == kind


def test_a_song_only_in_out_versions_leaves_the_list():
    songs, notes = pick(snap((1, track("1", "夜風 (Karaoke)")), (2, track("2", "灯台"))))
    assert [s.canonical.title for s in songs] == ["灯台"]
    assert any("só em versão que não entra" in n for n in notes)


def test_the_canonical_is_the_oldest_original_of_a_regular_album():
    songs, _ = pick(
        snap(
            (3, track("1", "光", album="BEST", date="2020-01-01")),  # coletânea, mais antiga
            (1, track("2", "光 (Live)", date="2018-01-01")),
            (2, track("3", "光", album="光 - Single", kind="single", date="2021-05-01")),
            (None, track("4", "光", album="光 (Deluxe)", date="2023-01-01")),
            (None, track("5", "光 (2022 Remaster)", date="2019-01-01")),
        )
    )
    assert len(songs) == 1
    assert songs[0].canonical.provider_id == "3"
    assert songs[0].rank == 1  # a melhor posição de qualquer versão
    assert {t.provider_id for t in songs[0].members} == {"1", "2", "3", "4", "5"}


def test_a_song_without_a_playable_version_leaves_the_list():
    songs, notes = pick(snap((1, track("1", "光", preview=None)), (2, track("2", "灯台"))))
    assert [s.canonical.provider_id for s in songs] == ["2"]
    assert any("sem prévia tocável" in n for n in notes)


def test_a_blocked_canonical_gives_way_to_the_next_version():
    songs, _ = pick(
        snap((1, track("1", "光", date="2020-01-01")), (2, track("2", "光", date="2021-01-01"))),
        blocked={"1"},
    )
    assert songs[0].canonical.provider_id == "2"


def test_participation_and_cover_stay():
    songs, _ = pick(
        snap(
            (1, track("1", "JANE DOE", by=(OTHER, ME))),  # outro artista principal
            (2, track("2", "千本桜", album="歌ってみたアルバム")),  # cover
        )
    )
    assert [s.canonical.provider_id for s in songs] == ["1", "2"]


def test_curation_excludes_and_joins():
    rules = ArtistRules(
        "77",
        exclude_albums=frozenset({"alE"}),
        exclude_tracks=frozenset({"9"}),
        same_song=(("1", "2"),),
    )
    songs, notes = pick(
        snap(
            (1, track("1", "うっせぇわ")),
            (2, track("2", "Usseewa", date="2025-01-01")),
            (3, track("3", "Into The Night", album="E-SIDE", album_id="alE")),
            (4, track("9", "Demo")),
        ),
        rules,
    )
    assert [s.canonical.provider_id for s in songs] == ["1"]
    assert {t.provider_id for t in songs[0].members} == {"1", "2"}
    assert any("tirada(s) pela curadoria" in n for n in notes)


def test_curation_that_cites_an_unknown_id_is_an_error():
    with pytest.raises(InputError, match="exclude_tracks: 404"):
        pick(snap((1, track("1", "光"))), ArtistRules("77", exclude_tracks=frozenset({"404"})))


def test_the_order_and_the_cap(monkeypatch):
    monkeypatch.setattr(artists, "MAX_SONGS", 3)
    songs, notes = pick(
        snap(
            (2, track("1", "B")),
            (1, track("2", "A")),
            (None, track("3", "C", date="2010-01-01")),  # sem posição: depois das ranqueadas
            (None, track("4", "D", date="2020-01-01")),
            (None, track("5", "D (Live)", album="D Live")),  # D em 2 álbuns passa à frente de C
        )
    )
    assert [s.canonical.title for s in songs] == ["A", "B", "D"]
    assert any("1 música(s) além das 3" in n for n in notes)


def test_the_file_record():
    songs, _ = pick(
        snap((1, track("1", "光")), (2, track("2", "灯台 (Karaoke)")), (3, track("3", "灯台")))
    )
    data = build_artist_file("fixture", "jp", snap(), songs, Curation())
    assert data["artistId"] == "fixture:ar:77"
    first, second = sorted(data["tracks"], key=lambda t: -t["popularity"])
    assert (first["popularity"], second["popularity"]) == (1.0, 0.5)
    assert first["songKey"] == f"{artist_title_key('光')}|fixture:ar:77"
    assert second["titleKeys"] == sorted({title_key("灯台"), title_key("灯台 (Karaoke)")})
    assert first["search"]["artist"] == []
    assert "chart" not in first and "isrc" not in first
    assert "similar" not in data["albums"][0]


def test_the_songkey_is_the_chosen_artist_even_in_a_participation():
    songs, _ = pick(snap((1, track("1", "JANE DOE", by=(OTHER, ME)))))
    data = build_artist_file("fixture", "jp", snap(), songs, Curation())
    (only,) = data["tracks"]
    assert only["songKey"].endswith("|fixture:ar:77")
    assert only["artistIds"] == ["fixture:ar:55", "fixture:ar:77"]


class FakeProvider:
    name = "fixture"
    storefront = "jp"

    def __init__(self, snapshots: dict[str, ArtistSnapshot]) -> None:
        self.snapshots = snapshots
        self.warnings: list[str] = []

    def snapshot(self, artist_id: str) -> ArtistSnapshot:
        return self.snapshots[artist_id]


def _with_art(t: RawTrack, url: str | None) -> RawTrack:
    return replace(t, album=replace(t.album, artwork_url=url))


def _card(*entries: tuple[int | None, RawTrack]) -> str | None:
    s = snap(*entries)
    songs, _ = pick(s)
    return artists.card_artwork(build_artist_file("fixture", "jp", s, songs, Curation()))


def test_the_card_cover_is_the_most_popular_song_on_an_album_of_the_artist_alone():
    # A mais popular é um single em parceria (a capa seria a do outro artista também): vale a
    # seguinte, de um álbum só dele (P168).
    collab = _with_art(track("1", "共演", kind="single", by=(ME, OTHER)), "fixtures/art/c.svg")
    solo = _with_art(track("2", "ソロ"), "fixtures/art/s.svg")
    third = _with_art(track("3", "三番"), "fixtures/art/t.svg")
    assert _card((1, collab), (2, solo), (3, third)) == "fixtures/art/s.svg"
    # Só parcerias: a capa da mais popular.
    assert _card((1, collab)) == "fixtures/art/c.svg"


def test_the_card_cover_skips_albums_without_artwork():
    # Direto na função, com o arquivo montado à mão: a faixa sem capa não passaria do
    # select_songs (é inelegível), e o filtro da capa vazia ficaria sem teste.
    me = "fixture:ar:77"

    def album(n: str, art: str | None, by: list[str]) -> dict:
        return {"id": f"fixture:al:{n}", "artistIds": by, "artworkUrl": art}

    def song(n: str, popularity: float) -> dict:
        return {"id": f"fixture:tr:{n}", "albumId": f"fixture:al:{n}", "popularity": popularity}

    data = {
        "artistId": me,
        "albums": [album("1", None, [me]), album("2", "fixtures/art/2.svg", [me])],
        "tracks": [song("1", 1.0), song("2", 0.5)],
    }
    assert artists.card_artwork(data) == "fixtures/art/2.svg"  # a mais popular não tem capa
    data["albums"][1]["artworkUrl"] = None
    assert artists.card_artwork(data) is None  # nenhuma tem: a tela mostra o monograma


def test_singles_come_before_the_other_songs_without_a_lookup_position():
    # P172: sem posição no lookup, o single da curadoria passa à frente da música em mais álbuns
    # e mais antiga; a posição no lookup continua vindo antes de tudo.
    ranked = track("1", "Ranked")
    deep = track("2", "Deep cut", date="1980-01-01")
    deep_again = track("3", "Deep cut", album_id="alcompilation", date="1981-01-01")
    single = track("4", "Hit single", date="1999-01-01")
    s = snap((1, ranked), (None, deep), (None, deep_again), (None, single))
    before, _ = pick(s)
    assert [x.canonical.title for x in before] == ["Ranked", "Deep cut", "Hit single"]
    after, _ = pick(s, ArtistRules("77", singles=frozenset({"4"})))
    assert [x.canonical.title for x in after] == ["Ranked", "Hit single", "Deep cut"]


def test_a_single_the_snapshot_does_not_have_is_an_error():
    # O id velho na curadoria não pode passar calado (o mesmo das outras chaves).
    with pytest.raises(InputError, match="singles: 404"):
        pick(snap((1, track("1", "光"))), ArtistRules("77", singles=frozenset({"404"})))


def test_an_excluded_track_leaves_its_lookup_position_to_its_song():
    # P172: a curadoria tira a versão da coletânea (com o nome dela no título), não o sucesso. A
    # posição vai para a música do título sem o sufixo, e não para outra edição com o mesmo
    # sufixo (que viraria uma música repetida entre as publicadas).
    original = track("1", "ガラスの林檎", date="1983-01-01")
    story = track("2", "ガラスの林檎(SEIKO STORY)", album="SEIKO STORY", date="1983-01-01")
    other_edition = track(
        "3", "ガラスの林檎(SEIKO STORY)", album="SEIKO STORY 2", date="1983-01-01"
    )
    filler = track("4", "Filler")
    s = snap((None, original), (5, story), (None, other_edition), (9, filler))
    songs, _ = pick(s, ArtistRules("77", exclude_tracks=frozenset({"2"})))
    by_title = {x.canonical.title: x.rank for x in songs}
    assert by_title["ガラスの林檎"] == 5
    assert by_title["ガラスの林檎(SEIKO STORY)"] is None  # a cópia fica sem a posição
    assert by_title["Filler"] == 9


def test_build_artists_lists_in_order_and_warns_about_romaji_twins():
    provider = FakeProvider(
        {
            "77": snap((1, track("1", "Kimi")), (2, track("2", "きみ"))),
            "55": ArtistSnapshot(
                OTHER, "2026-10-12T15:00:00Z", (ArtistEntry(1, track("5", "光", by=(OTHER,))),)
            ),
        }
    )
    cur = Curation(aliases=parse_aliases('[tracks."fixture:tr:2"]\naliases = ["kimi"]\n', "t"))
    notes: list[str] = []
    files = build_artists(provider, [named_rules("77"), named_rules("55")], cur, notes)
    assert list(files) == ["index.json", "77.json", "55.json"]
    assert [e["file"] for e in files["index.json"]["artists"]] == ["77.json", "55.json"]
    assert any("possível música repetida" in n for n in notes)
    assert all("section" not in e for e in files["index.json"]["artists"])


def _named(artist_id: str, name: str, latin: str | None = None) -> ArtistSnapshot:
    who = RawArtist(artist_id, name, latin)
    return ArtistSnapshot(
        who, "2026-10-12T15:00:00Z", (ArtistEntry(1, track(f"t{artist_id}", "光", by=(who,))),)
    )


def test_the_foreign_section_comes_last_in_alphabetical_order():
    # P200 e P201: a principal fica na ordem do artists.toml, mesmo com os de fora no meio; a
    # seção vem depois, em ordem alfabética do nome (o latino, se o nome não for latino).
    provider = FakeProvider(
        {
            "1": _named("1", "System Of A Down"),
            "2": _named("2", "ミナト", "Minato"),
            "3": _named("3", "볼빨간사춘기", "Bolbbalgan4"),
            "4": _named("4", "aimer"),
            "5": _named("5", "夜風シアター", "Yokaze Theater"),
        }
    )
    rules = [
        named_rules("1", section="foreign"),
        named_rules("2"),
        named_rules("3", section="foreign"),
        named_rules("4", section="foreign"),
        named_rules("5"),
    ]
    index = build_artists(provider, rules, Curation(), [])["index.json"]
    order = [(e["file"], e.get("section")) for e in index["artists"]]
    assert order == [
        ("2.json", None),
        ("5.json", None),
        ("4.json", "foreign"),  # aimer, sem caixa
        ("3.json", "foreign"),  # pelo latino, Bolbbalgan4
        ("1.json", "foreign"),
    ]
    assert validate_artist_list(index) == []


def test_the_list_out_of_order_is_refused():
    provider = FakeProvider({"1": _named("1", "B"), "2": _named("2", "A"), "3": _named("3", "C")})
    rules = [
        named_rules("1", section="foreign"),
        named_rules("2", section="foreign"),
        named_rules("3"),
    ]
    index = build_artists(provider, rules, Curation(), [])["index.json"]
    main, first, second = index["artists"]
    # A seção fora da ordem alfabética, e a principal depois da seção.
    for wrong in ([main, second, first], [first, second, main]):
        problems = validate_artist_list({**index, "artists": wrong})
        assert any("fora de ordem" in p for p in problems), wrong


def test_build_artists_refuses_a_stale_alias():
    provider = FakeProvider({"77": snap((1, track("1", "光")))})
    cur = Curation(aliases=parse_aliases('[tracks."fixture:tr:404"]\nblock = true\n', "t"))
    with pytest.raises(InputError, match="fixture:tr:404"):
        build_artists(provider, [ArtistRules("77")], cur, [])


def test_load_artist_list(tmp_path: Path):
    path = tmp_path / "artists.toml"
    path.write_text(
        '[[artists]]\nid = "2"\nexclude_albums = ["9"]\nsame_song = [["1", "3"]]\n'
        'singles = ["4", "5"]\n\n'
        '[[artists]]\nid = "1"\nsection = "foreign"\n',
        encoding="utf-8",
    )
    rules = load_artist_list(path)
    assert [r.id for r in rules] == ["2", "1"]  # a ordem do arquivo é a da tela
    assert rules[0].exclude_albums == {"9"}
    assert rules[0].same_song == (("1", "3"),)
    assert rules[0].singles == {"4", "5"}
    assert rules[1].singles == frozenset()
    assert (rules[0].section, rules[1].section) == (None, "foreign")


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("", "esperado só"),
        ('[[artists]]\nid = "1"\nnome = "x"\n', "chaves aceitas"),
        ('[[artists]]\nid = "1 2"\n', "id do provedor"),
        ('[[artists]]\nid = "1"\n\n[[artists]]\nid = "1"\n', "repetido"),
        ('[[artists]]\nid = "1"\nsame_song = [["1"]]\n', "pares"),
        ('[[artists]]\nid = "1"\nexclude_tracks = [1]\n', "lista de ids"),
        ('[[artists]]\nid = "1"\nsingles = "4"\n', "singles"),
        ('[[artists]]\nid = "1"\nsection = "abroad"\n', "section aceita"),
        ('[[artists]]\nid = "1"\nsection = 1\n', "section aceita"),
        ("[[artists]\n", "TOML inválido"),
    ],
)
def test_load_artist_list_refuses(tmp_path: Path, text, message):
    path = tmp_path / "artists.toml"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(InputError, match=message):
        load_artist_list(path)


def test_missing_list_is_an_error(tmp_path: Path):
    with pytest.raises(InputError, match="ausente"):
        load_artist_list(tmp_path / "nada.toml")


def test_a_title_with_an_unknown_suffix_is_flagged():
    # "(Demo)" não é versão conhecida: a música fica à parte, mas o build avisa.
    songs, notes = pick(snap((1, track("1", "灯台")), (2, track("2", "灯台 (Demo)"))))
    assert len(songs) == 2
    assert any("'灯台 (Demo)' pode ser versão de outra música" in n for n in notes)


def test_title_keys_include_the_group_key():
    # Um cover da parada com o título sem o crédito ("新時代") casa pela chave do grupo.
    songs, _ = pick(snap((1, track("1", "新時代 (ウタ from ONE PIECE FILM RED)"))))
    data = build_artist_file("fixture", "jp", snap(), songs, Curation())
    assert title_key("新時代") in data["tracks"][0]["titleKeys"]


def test_a_version_without_delimiter_joins_the_song_of_its_prefix():
    # "今日から思い出 Evergreen ver." (Aimer) não tem delimitador: entra no grupo do prefixo.
    songs, _ = pick(
        snap(
            (1, track("1", "今日から思い出", date="2020-01-01")),
            (2, track("2", "今日から思い出 Evergreen ver.", date="2021-01-01")),
            (3, track("3", "Forever ver.")),  # sem música do prefixo: fica como está
        )
    )
    by_key = {s.canonical.provider_id: {t.provider_id for t in s.members} for s in songs}
    assert by_key == {"1": {"1", "2"}, "3": {"3"}}


# As medalhas do Superfan de cada artista (M16): o [artists.medals] do artists.toml.
MEDALS_HEAD = '[[artists]]\nid = "1"\n\n[artists.medals]\n'
ALL_FLOWERS = "".join(f'{role} = "#0a0b0c"\n' for role in FLOWER_ROLES)


def test_load_artist_list_reads_the_medals(tmp_path: Path):
    path = tmp_path / "artists.toml"
    path.write_text(
        MEDALS_HEAD
        + 'acertos = { name = " 歌い手 ", latin = "Utaite" }\n'
        + 'completo = { name = "Round Robin" }\nperfeito = { name = "はらぺこ" }\n'
        + 'album = "9"\ncrop = { z = 2, x = 0.5, y = 0.25 }\nsash = { text = "Eve" }\n\n'
        + "[artists.medals.flowers]\n"
        + ALL_FLOWERS,
        encoding="utf-8",
    )
    (rules,) = load_artist_list(path)
    m = rules.medals
    assert m is not None
    assert dict(m.names) == {
        "acertos": MedalName("歌い手", "Utaite"),  # o display() tira o espaço das pontas
        "completo": MedalName("Round Robin"),
        "perfeito": MedalName("はらぺこ"),
    }
    assert (m.album, m.crop, m.sash) == ("9", (2.0, 0.5, 0.25), ("Eve", False))
    assert [role for role, _ in m.flowers] == list(FLOWER_ROLES)


def test_the_medals_are_optional_in_the_list(tmp_path: Path):
    # O fetch e o romanize de um artista novo rodam antes da escolha dos nomes: quem os exige é o
    # build (P301).
    path = tmp_path / "artists.toml"
    path.write_text('[[artists]]\nid = "1"\n', encoding="utf-8")
    assert load_artist_list(path)[0].medals is None


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ('nome = "x"\n', "chaves aceitas"),
        ('acertos = { name = "狂言", latin = "Kyōgen" }\n', "sem mácron"),
        ('perfeito = { name = "x", latin = "y" }\n', "esperado"),
        ('completo = "Round Robin"\n', "esperado"),
        ('acertos = { name = "  " }\n', "name vazio"),
        ('album = "1 2"\n', "collectionId"),
        ("crop = { z = 0.5, x = 0.5, y = 0.5 }\n", "crop"),
        ("crop = { z = 2, x = 0.5 }\n", "crop"),
        ("crop = { z = true, x = 0.5, y = 0.5 }\n", "crop"),
        ("crop = { z = 2, x = 1.5, y = 0.5 }\n", "crop"),
        ('sash = { text = "Eve", along = "sim" }\n', "sash"),
        ("sash = { along = true }\n", "sash"),
        ('[artists.medals.flowers]\nd = "#000000"\n', "flowers"),
        ("[artists.medals.flowers]\n" + ALL_FLOWERS.replace("#0a0b0c", "#0A0B0C", 1), "flowers"),
    ],
)
def test_load_artist_list_refuses_bad_medals(tmp_path: Path, body, message):
    path = tmp_path / "artists.toml"
    path.write_text(MEDALS_HEAD + body, encoding="utf-8")
    with pytest.raises(InputError, match=message):
        load_artist_list(path)


def test_build_artists_requires_the_three_names():
    provider = FakeProvider({"77": snap((1, track("1", "光")))})
    with pytest.raises(InputError, match=r"faltam os nomes das medalhas \(acertos, completo, "):
        build_artists(provider, [ArtistRules("77")], Curation(), [])
    two = MedalRules(names=NAMED.names[:2])
    with pytest.raises(InputError, match=r"medalhas \(perfeito\)"):
        build_artists(provider, [ArtistRules("77", medals=two)], Curation(), [])


@pytest.mark.parametrize(("name", "latin"), [("歌い手", None), ("Round Robin", "Round Robin")])
def test_build_artists_wants_the_latin_only_for_kana_and_kanji(name, latin):
    names = (("acertos", MedalName(name, latin)), *NAMED.names[1:])
    provider = FakeProvider({"77": snap((1, track("1", "光")))})
    with pytest.raises(InputError, match="leva o latin só quando"):
        build_artists(provider, [ArtistRules("77", medals=MedalRules(names=names))], Curation(), [])


def test_build_artists_writes_the_medals():
    provider = FakeProvider(
        {"77": snap((1, track("1", "光", album_id="900")), (2, track("2", "影")))}
    )
    names = (("acertos", MedalName("歌い手", "Utaite")), *NAMED.names[1:])
    medals = MedalRules(
        names=names,
        album="900",
        crop=(1.5, 0.4, 0.6),
        sash=("テスト", False),
        flowers=tuple((role, "#123456") for role in FLOWER_ROLES),
    )
    files = build_artists(provider, [ArtistRules("77", medals=medals)], Curation(), [])
    (entry,) = files["index.json"]["artists"]
    assert entry["medals"] == {
        "names": {
            "acertos": {"name": "歌い手", "latin": "Utaite"},
            "completo": {"name": "Nome completo", "latin": None},
            "perfeito": {"name": "Nome perfeito"},
        },
        "artworkUrl": "fixtures/art/x.svg",  # a capa do álbum 900, que está no arquivo
        "crop": {"z": 1.5, "x": 0.4, "y": 0.6},
        "sash": {"text": "テスト", "along": False},
        "flowers": dict.fromkeys(FLOWER_ROLES, "#123456"),
    }
    assert validate_artist_list(files["index.json"]) == []


def test_build_artists_refuses_a_medal_album_outside_the_file():
    provider = FakeProvider({"77": snap((1, track("1", "光")))})
    with pytest.raises(InputError, match="o álbum 404 das medalhas"):
        build_artists(
            provider, [ArtistRules("77", medals=replace(NAMED, album="404"))], Curation(), []
        )
