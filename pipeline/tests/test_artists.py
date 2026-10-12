"""Modo por artista (M13): a chave das músicas, as versões, a canônica, a ordem e os arquivos."""

from __future__ import annotations

from pathlib import Path

import pytest

from musicle_pipeline import artists
from musicle_pipeline.aliases import parse_aliases
from musicle_pipeline.artists import (
    ArtistRules,
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

ME = RawArtist("77", "テスト歌手", "Tesuto Kashu")
OTHER = RawArtist("55", "他の歌手", "Hoka")


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
        ("紅蓮華 - From THE FIRST TAKE", "紅蓮華"),
        ("夜に駆ける (English Version)", "夜に駆ける"),
        ("Song (TV Size)", "Song"),  # o title_key da parada já tira
        ("Song (Remastered 2022)", "Song"),
    ],
)
def test_the_key_joins_versions_of_the_same_song(title, same):
    assert artist_title_key(title) == artist_title_key(same)


@pytest.mark.parametrize("title", ["Stay (Forever)", "Deep (EPIC)", "Alive"])
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
        ("光 (Off-Vocal)", "Album", "out"),
        ("光 (ライヴ)", "Album", "out"),
        ("Song", "Album（Live）", "out"),  # largura total no nome do álbum
        ("Song", "Tour Final LIVE", "out"),
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
    files = build_artists(provider, [ArtistRules("77"), ArtistRules("55")], cur, notes)
    assert list(files) == ["index.json", "77.json", "55.json"]
    assert [e["file"] for e in files["index.json"]["artists"]] == ["77.json", "55.json"]
    assert any("possível música repetida" in n for n in notes)


def test_build_artists_refuses_a_stale_alias():
    provider = FakeProvider({"77": snap((1, track("1", "光")))})
    cur = Curation(aliases=parse_aliases('[tracks."fixture:tr:404"]\nblock = true\n', "t"))
    with pytest.raises(InputError, match="fixture:tr:404"):
        build_artists(provider, [ArtistRules("77")], cur, [])


def test_load_artist_list(tmp_path: Path):
    path = tmp_path / "artists.toml"
    path.write_text(
        '[[artists]]\nid = "2"\nexclude_albums = ["9"]\nsame_song = [["1", "3"]]\n\n'
        '[[artists]]\nid = "1"\n',
        encoding="utf-8",
    )
    rules = load_artist_list(path)
    assert [r.id for r in rules] == ["2", "1"]  # a ordem do arquivo é a da tela
    assert rules[0].exclude_albums == {"9"}
    assert rules[0].same_song == (("1", "3"),)


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("", "esperado só"),
        ('[[artists]]\nid = "1"\nnome = "x"\n', "chaves aceitas"),
        ('[[artists]]\nid = "1 2"\n', "id do provedor"),
        ('[[artists]]\nid = "1"\n\n[[artists]]\nid = "1"\n', "repetido"),
        ('[[artists]]\nid = "1"\nsame_song = [["1"]]\n', "pares"),
        ('[[artists]]\nid = "1"\nexclude_tracks = [1]\n', "lista de ids"),
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
