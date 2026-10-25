"""O Anime (M14): o casamento com a Apple, as faixas, as franquias, o catálogo e a validação."""

from __future__ import annotations

import copy
import math
import os
import subprocess
import sys
from dataclasses import replace
from decimal import Decimal

import pytest

from musicle_pipeline.aliases import parse_aliases
from musicle_pipeline.anime import (
    CUTS,
    ICON_CHART_UNTIL,
    Anime,
    AnimeSource,
    Theme,
    anime_from_dict,
    build_anime_catalog,
    chances,
    chart_artists,
    franchise_songs,
    franchises_of,
    is_icon,
    joined_levels,
    joined_stats,
    loose_title,
    match_theme,
    merge_anime,
    same_song,
    tier_counts,
    tiers_of,
)
from musicle_pipeline.catalog import Curation
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json, write_if_changed
from musicle_pipeline.models import (
    ChartEntry,
    ChartSnapshot,
    InputError,
    RawAlbum,
    RawArtist,
    RawTrack,
)
from musicle_pipeline.paths import anime_paths
from musicle_pipeline.providers.apple_anime import AppleAnimeProvider, snapshot_id
from musicle_pipeline.providers.fixture_anime import FixtureAnimeProvider
from musicle_pipeline.validate_anime import MAX_FILE_BYTES, validate_anime_catalog

LISA = RawArtist("100", "LiSA")
OTHER = RawArtist("200", "LiSA")  # outro artista com o mesmo nome
# O romaji do cutlet, numa tabela: o teste não depende da biblioteca.
ROMAJI = {
    "紅蓮華": ("Gurenka",),
    "炎": ("Honoo",),
    "unlasting": ("unlasting",),
    "残響散歌": ("Zankyou sanka",),
    "シルシ": ("Shirushi",),
}


def romanize(text: str) -> tuple[str, ...]:
    return ROMAJI.get(text, (text,))


def track(
    tid: str,
    title: str,
    *,
    artist: RawArtist = LISA,
    album: str = "Album",
    album_type: str = "album",
    released: str = "2019-07-03",
    preview: str | None = "https://audio-ssl.itunes.apple.com/x.m4a",
    artwork: str | None = "https://is1-ssl.mzstatic.com/x/300x300bb.jpg",
) -> RawTrack:
    return RawTrack(
        provider_id=tid,
        title=title,
        artists=(artist,),
        album=RawAlbum(
            provider_id=f"al{tid}",
            title=album,
            type=album_type,
            release_date=released,
            artwork_url=artwork,
        ),
        duration_ms=240000,
        explicit=False,
        preview_url=preview,
        preview_duration_sec=30 if preview else None,
    )


DISCOGRAPHY = [
    track("1", "紅蓮華", album="紅蓮華 - Single", album_type="single"),
    track("2", "炎", released="2020-10-14"),
    track("3", "シルシ", released="2014-11-26"),
    track("4", "残響散歌", released="2022-01-12"),
    track("5", "unlasting", released="2019-12-11"),
]


# --- o casamento ---------------------------------------------------------------------------


def test_the_same_title_matches_without_romaji():
    found = match_theme("unlasting", DISCOGRAPHY, romanize, year=2019)
    assert (found.result, found.track and found.track.provider_id) == ("matched", "5")
    assert found.score is not None and found.score[0] == 1.0


def test_the_cutlet_reading_close_to_the_theme_matches_by_similarity():
    # O AnimeThemes escreve "Gurenge"; o cutlet lê 紅蓮華 como "Gurenka". A semelhança é
    # média, mas a folga para a 2ª música é grande (P246).
    found = match_theme("Gurenge", DISCOGRAPHY, romanize, year=2019)
    assert found.result == "matched"
    assert found.track is not None and found.track.provider_id == "1"
    assert found.score is not None and found.score[0] - found.score[1] >= 0.25


def test_a_song_the_artist_does_not_have_is_not_matched():
    found = match_theme("Crossing Field", DISCOGRAPHY, romanize, year=2012)
    assert found.result == "no-match" and found.track is None


def test_the_similar_song_far_from_the_anime_year_is_not_matched():
    assert match_theme("Gurenge", DISCOGRAPHY, romanize, year=2010).result == "no-match"


def test_two_songs_almost_alike_are_ambiguous():
    pool = [track("1", "Shine"), track("2", "Shiny")]
    assert match_theme("Shinin", pool, romanize, year=2019).result == "ambiguous"


def test_the_same_title_by_two_artists_with_the_same_name_is_ambiguous():
    pool = [track("1", "紅蓮華"), track("9", "紅蓮華", artist=OTHER)]
    assert match_theme("紅蓮華", pool, romanize).result == "ambiguous"


def test_the_original_wins_over_the_cover_and_the_compilation():
    pool = [
        track("1", "紅蓮華 (カバー)", released="2019-08-01"),
        track("2", "紅蓮華", album="LiSA BEST -Day-", album_type="compilation"),
        track("3", "紅蓮華", album="紅蓮華 - Single", album_type="single", released="2019-07-03"),
    ]
    found = match_theme("紅蓮華", pool, romanize)
    assert found.track is not None and found.track.provider_id == "3"


def test_the_tv_size_is_only_the_reserve():
    full = track("1", "紅蓮華")
    tv = track("2", "紅蓮華 (TV Size)")
    assert match_theme("紅蓮華", [tv, full], romanize).track == full
    found = match_theme("紅蓮華", [tv, track("3", "炎")], romanize)
    assert found.result == "matched" and found.track == tv
    # A completa sem prévia: a TV size da mesma música toca no lugar dela.
    silent = track("4", "紅蓮華", preview=None)
    assert match_theme("紅蓮華", [silent, tv], romanize).track == tv


def test_the_tv_size_does_not_break_a_tie():
    # "Shine" e "Shiny" empatam; a TV size de uma delas não desempata (P246).
    pool = [track("1", "Shine"), track("2", "Shiny"), track("3", "Shine (TV Size)")]
    assert match_theme("Shinin", pool, romanize, year=2019).result == "ambiguous"


def test_karaoke_and_live_are_never_the_answer():
    pool = [track("1", "紅蓮華 (Instrumental)"), track("2", "紅蓮華 (Live at Budokan)")]
    assert match_theme("紅蓮華", pool, romanize).result == "no-match"


def test_a_song_without_a_playable_version_is_no_preview():
    pool = [track("1", "紅蓮華", preview=None), track("2", "炎")]
    assert match_theme("紅蓮華", pool, romanize).result == "no-preview"


def test_the_playable_version_wins_even_if_not_the_oldest():
    pool = [track("1", "紅蓮華", released="2019-07-03", artwork=None), track("2", "紅蓮華")]
    assert match_theme("紅蓮華", pool, romanize).track == pool[1]


# --- as faixas (P240, P252) ------------------------------------------------------------------


def theme(kind: str = "OP", song: int | None = None, result: str = "matched") -> Theme:
    return Theme(
        type=kind,
        sequence=1,
        song="Gurenge",
        artists=("LiSA",),
        levels={} if song is None else {"anisongdb": song},
        result=result,
        track=DISCOGRAPHY[0] if result == "matched" else None,
    )


def anime(mal_id: int = 1, *, show: int | None = None, series=(), themes=()) -> Anime:
    return Anime(
        mal_id=mal_id,
        slug=f"anime_{mal_id}",
        name=f"Anime {mal_id}",
        synonyms=(f"アニメ{mal_id}",),
        year=2019,
        series=tuple(series),
        levels={} if show is None else {"mal": show},
        themes=tuple(themes),
    )


def levels(**values: int) -> Theme:
    """Um tema com os níveis dados (quiz = anisongdb, pl = animethemes)."""
    names = {"quiz": "anisongdb", "pl": "animethemes"}
    return replace(theme(), levels={names[k]: v for k, v in values.items()})


def test_the_chance_of_guessing_the_anime_is_the_product():
    # p_a × p_t × o fator do tipo (P272): MAL 9 = 0,92; quiz 9 = 0,95.
    assert chances(theme(song=9), anime(show=9), 1)["titulo"] == Decimal("0.874")
    assert chances(theme("ED", song=9), anime(show=9), 1)["titulo"] == Decimal("0.6992")
    # A insert com quiz 7+ conta como abertura; a outra leva o fator 0,15.
    assert chances(theme("IN", song=9), anime(show=9), 1)["titulo"] == Decimal("0.874")
    assert chances(theme("IN", song=6), anime(show=9), 1)["titulo"] == Decimal("0.0897")
    # Sem o quiz, o estimado pelas playlists (pl 9 → 7,4); sem nada, quiz 2 e MAL 1.
    assert chances(levels(pl=9), anime(show=9), 1)["titulo"] == Decimal("0.7268")
    # A insert sem o quiz e com pl 9 também conta como abertura (o estimado é 7,4).
    insert = replace(levels(pl=9), type="IN")
    assert chances(insert, anime(show=9), 1)["titulo"] == Decimal("0.7268")
    assert chances(theme(), anime(), 1)["titulo"] == Decimal("0.0385875968")  # 0,92 × 0,8⁸ × 0,25
    # A concorrência é só do acertar a música.
    alone = chances(theme(song=2), anime(show=5), 1)["titulo"]
    assert chances(theme(song=2), anime(show=5), 21)["titulo"] == alone


def test_the_chance_of_guessing_the_song_is_the_product():
    # √(p_t × p_pl) × p_a^0,4 × o fator do tipo × a concorrência (P272), conferido em float.
    def musica(kind: str, songs: int, **values: int) -> float:
        return float(chances(replace(levels(**values), type=kind), anime(show=9), songs)["musica"])

    assert musica("OP", 1, quiz=7, pl=7) == pytest.approx(0.75 * 0.92**0.4, rel=1e-12)
    assert musica("OP", 1, quiz=7) == pytest.approx(0.75 * 0.8 * 0.92**0.4, rel=1e-12)  # sem pl
    assert musica("ED", 1, quiz=7, pl=7) == pytest.approx(0.75 * 0.92**0.4 * 0.8, rel=1e-12)
    # No acertar a música, a insert com quiz alto continua insert (o fator 0,3).
    assert musica("IN", 1, quiz=9, pl=9) == pytest.approx(0.95 * 0.92**0.4 * 0.3, rel=1e-12)
    # 21 músicas do mesmo tipo: a pouco conhecida (quiz 2) perde muito mais que a famosa (quiz 9).
    assert musica("OP", 21, quiz=2, pl=2) / musica("OP", 1, quiz=2, pl=2) == pytest.approx(
        1 / (1 + 0.75 * math.log(21)), rel=1e-12
    )
    assert musica("OP", 21, quiz=9, pl=9) / musica("OP", 1, quiz=9, pl=9) == pytest.approx(
        1 / (1 + 0.05 * math.log(21)), rel=1e-12
    )
    # Sem músicas contadas (n = 0), a concorrência não pesa, como com uma só.
    assert musica("OP", 0, quiz=2, pl=2) == musica("OP", 1, quiz=2, pl=2)


EASY = {mode: cut[0] for mode, cut in CUTS.items()}
MEDIUM = {mode: cut[1] for mode, cut in CUTS.items()}
STEP = Decimal("0.0001")


@pytest.mark.parametrize(
    ("musica", "titulo", "icon", "expected"),
    [
        # Os cortes fixos de cada modo (P273).
        (EASY["musica"], EASY["titulo"], False, ("facil", "facil")),
        (EASY["musica"] - STEP, EASY["titulo"] - STEP, False, ("medio", "medio")),
        (MEDIUM["musica"], MEDIUM["titulo"], False, ("medio", "medio")),
        (MEDIUM["musica"] - STEP, MEDIUM["titulo"] - STEP, False, ("dificil", "dificil")),
        # O nome da música nunca mais fácil que o anime, salvo o ícone (P274).
        (Decimal(1), Decimal(0), False, ("dificil", "dificil")),
        (Decimal(1), MEDIUM["titulo"], False, ("medio", "medio")),
        (Decimal(1), Decimal(0), True, ("facil", "dificil")),
        # O contrário fica: o anime pode ser mais fácil que o nome da música.
        (Decimal(0), Decimal(1), False, ("dificil", "facil")),
    ],
)
def test_tiers(musica, titulo, icon, expected):
    tiers = tiers_of({"musica": musica, "titulo": titulo}, icon)
    assert (tiers["musica"], tiers["titulo"]) == expected


def test_the_icon_needs_the_playlists_and_the_quiz():
    assert is_icon(levels(quiz=7, pl=8))
    assert not is_icon(levels(quiz=9, pl=7))
    assert not is_icon(levels(pl=9))
    assert not is_icon(levels(quiz=9))
    # O ícone que só aparece com a junção dos dois registros do tema (P275).
    show = anime(themes=[levels(pl=8), replace(levels(quiz=7), result="no-match", track=None)])
    assert is_icon(replace(theme(), levels=joined_levels(show)[0]))


@pytest.mark.parametrize(
    ("a", "b", "same"),
    [
        ("LOST IN PARADISE feat. AKLO", "LOST IN PARADISE", True),
        ("02~O-Two~", "O2", True),
        ("sh0ut", "shØut", True),
        ("Gurenge (TV size)", "Gurenge", True),
        ("Rubikon", "Rubicon", True),  # muito parecidos
        ("Soul", "S0ul", True),  # o 0 vira "o" antes do search_key, que encurta o "ou"
        ("Gurenge", "Homura", False),
    ],
)
def test_loose_titles(a, b, same):
    assert same_song(loose_title(a), loose_title(b)) is same
    assert same_song(loose_title(b), loose_title(a)) is same  # nas duas ordens


def test_similar_titles_do_not_depend_on_the_order():
    # O SequenceMatcher dá 0,25 e 0,5 conforme a ordem; o same_song, sempre o mesmo.
    assert same_song("tide", "diet") is same_song("diet", "tide")
    # O título que começa pelo enfeite não some: fica inteiro.
    assert loose_title("(K)NoW_NAME") != ""


def test_the_two_records_of_a_theme_join_their_levels():
    show = anime(
        themes=[
            replace(levels(pl=9), song="LOST IN PARADISE feat. AKLO"),
            replace(levels(quiz=8), song="LOST IN PARADISE", result="no-match", track=None),
            replace(theme("ED", song=3), song="Other"),
        ]
    )
    assert joined_levels(show) == (
        {"animethemes": 9, "anisongdb": 8},
        {"anisongdb": 8, "animethemes": 9},
        {"anisongdb": 3},
    )
    # O nível do próprio tema vence; com dois candidatos, nada se junta.
    own = anime(themes=[levels(quiz=5), replace(levels(quiz=7, pl=2), song="Gurenge (TV size)")])
    assert joined_levels(own)[0] == {"anisongdb": 5, "animethemes": 2}
    two = anime(themes=[levels(pl=2), levels(quiz=7), levels(quiz=8)])
    assert joined_levels(two)[0] == {"animethemes": 2}


def test_the_two_records_of_a_theme_join_their_exact_numbers():
    """Os números exatos do quiz do dia (M18) se juntam como os níveis: o do próprio tema vence,
    o que falta vem do outro registro, e com dois candidatos nada se junta."""
    pl, quiz = {"animethemes": Decimal(300)}, {"anisongdb": Decimal("81.0")}
    show = anime(
        themes=[
            replace(levels(pl=9), song="LOST IN PARADISE feat. AKLO", stats=pl),
            replace(
                levels(quiz=8), song="LOST IN PARADISE", result="no-match", track=None, stats=quiz
            ),
        ]
    )
    assert joined_stats(show) == ({**pl, **quiz}, {**quiz, **pl})
    own = {"animethemes": Decimal(5)}
    show = anime(
        themes=[replace(levels(pl=2), stats=own), replace(levels(pl=9), stats={**pl, **quiz})]
    )
    assert joined_stats(show)[0] == {**own, **quiz}
    two = anime(themes=[levels(pl=2), replace(levels(), stats=pl), replace(levels(), stats=quiz)])
    assert joined_stats(two)[0] == {}


def test_the_rivals_are_the_distinct_songs_of_the_franchise():
    series = [("kimetsu", "Kimetsu no Yaiba")]
    first = anime(1, series=series, themes=[theme(), theme("ED")])
    second = anime(
        2,
        series=series,
        themes=[replace(theme(), song="Zankyou Sanka"), replace(theme(), song="Gurenge (TV size)")],
    )
    assert franchise_songs([first, second, anime(3, themes=[theme()])]) == {
        ("kimetsu", "OP"): 2,
        ("kimetsu", "ED"): 1,
        ("anime_3", "OP"): 1,
    }


def test_the_chart_artists_stop_at_the_calibration_date():
    partner = RawArtist("300", "Partner")
    before = replace(DISCOGRAPHY[0], artists=(LISA, partner))
    after = replace(DISCOGRAPHY[0], artists=(OTHER,))

    def snapshot(day: str, t: RawTrack) -> ChartSnapshot:
        return ChartSnapshot(day, day, f"{day}T00:00:00Z", "x", 1, (ChartEntry(1, t),))

    snapshots = [snapshot(ICON_CHART_UNTIL, before), snapshot("2026-10-26", after)]
    # Só o artista principal: o parceiro depende de todos os snapshots (regra 20).
    assert chart_artists("apple", snapshots) == {"apple:ar:100"}


# --- as franquias e o catálogo -----------------------------------------------------------------


def test_the_franchise_is_the_series_or_the_anime_itself():
    assert franchises_of(anime(series=[("kimetsu", "Kimetsu no Yaiba")])) == (
        ("kimetsu", "Kimetsu no Yaiba"),
    )
    assert franchises_of(anime(7)) == (("anime_7", "Anime 7"),)


def source(*items: Anime) -> AnimeSource:
    return AnimeSource(snapshots=(("2026-10-21T230000Z", "2026-10-21T23:00:00Z"),), anime=items)


def build(
    *items: Anime,
    cur: Curation | None = None,
    notes: list[str] | None = None,
    icons: frozenset[str] = frozenset(),
):
    return build_anime_catalog(
        "apple",
        "jp",
        source(*items),
        cur or Curation(),
        [] if notes is None else notes,
        icon_artists=icons,
    )


def test_two_seasons_share_the_franchise_and_its_search_keys():
    first = anime(1, show=9, series=[("kimetsu", "Kimetsu no Yaiba")], themes=[theme(song=9)])
    second = replace(
        anime(2, show=8, series=[("kimetsu", "Kimetsu no Yaiba")]),
        name="Kimetsu no Yaiba: Yuukaku-hen",
        themes=(replace(theme(song=7), track=DISCOGRAPHY[3], song="Zankyou Sanka"),),
    )
    catalog = build(first, second)
    assert [f["id"] for f in catalog["franchises"]] == ["anime:fr:kimetsu"]
    keys = catalog["franchises"][0]["search"]
    assert "kimetsunoyaibayukakuhen" in keys and "あにめ1" in keys
    assert validate_anime_catalog(catalog, dumps(catalog).encode("utf-8")) == []


def test_a_track_of_two_themes_keeps_both_and_the_easiest_tier():
    op = anime(1, show=9, themes=[theme("OP", song=9)])
    ed = anime(2, show=2, themes=[theme("ED", song=2)])
    (t,) = build(op, ed)["tracks"]
    assert [x["anime"] for x in t["anime"]["themes"]] == ["Anime 1", "Anime 2"]
    assert t["anime"]["franchiseIds"] == ["anime:fr:anime_1", "anime:fr:anime_2"]
    assert t["anime"]["tiers"] == {"musica": "facil", "titulo": "facil"}


def test_the_theme_title_is_the_latin_and_a_search_key():
    (t,) = build(anime(1, themes=[theme(song=5)]))["tracks"]
    assert (t["title"], t["titleLatin"], t["latinSource"]) == ("紅蓮華", "Gurenge", "provider")
    assert "gurenge" in t["search"]["title"] and "lisa" in t["search"]["artist"]


def test_unmatched_themes_stay_out_and_are_counted():
    notes: list[str] = []
    catalog = build(anime(1, themes=[theme(song=5), theme(result="no-match")]), notes=notes)
    assert len(catalog["tracks"]) == 1
    assert "matched 1, no-match 1" in notes[0]


def test_the_block_makes_the_track_ineligible():
    cur = Curation(aliases=parse_aliases('[tracks."apple:tr:1"]\nblock = true\n'))
    (t,) = build(anime(1, themes=[theme(song=5)]), cur=cur)["tracks"]
    assert t["eligible"] == {"daily": False, "reason": "blocked"}


def test_a_stale_alias_fails_the_build():
    cur = Curation(aliases=parse_aliases('[tracks."apple:tr:999"]\nblock = true\n'))
    with pytest.raises(InputError, match="apple:tr:999"):
        build(anime(1, themes=[theme(song=5)]), cur=cur)


def test_nothing_matched_fails_the_build():
    with pytest.raises(InputError, match="nenhum tema"):
        build(anime(1, themes=[theme(result="no-artist")]))


def test_the_newest_snapshot_wins_for_the_same_anime():
    old, new = anime(1, show=2), anime(1, show=8)
    assert merge_anime([[old], [new]]) == (new,)


def test_a_new_search_never_loses_a_matched_track():
    # A agenda pode citar a faixa: a busca nova que não casou não a apaga.
    old = anime(1, themes=[theme(song=5)])
    new = anime(1, show=8, themes=[theme(result="no-match")])
    (merged,) = merge_anime([[old], [new]])
    assert merged.levels == {"mal": 8}
    assert [t.result for t in merged.themes] == ["matched"]
    # Casou de novo, com outra faixa: as duas ficam (a agenda pode citar a antiga, e um dia
    # gravado não muda; revisor do A2).
    again = anime(1, themes=[replace(theme(song=5), track=DISCOGRAPHY[1])])
    (merged,) = merge_anime([[old], [again]])
    assert [t.track for t in merged.themes] == [DISCOGRAPHY[1], DISCOGRAPHY[0]]
    # A mesma faixa de novo: uma vez só.
    (merged,) = merge_anime([[old], [old]])
    assert [t.track for t in merged.themes] == [DISCOGRAPHY[0]]


def test_two_franchises_with_the_same_name_get_the_year():
    first = replace(anime(1, themes=[theme(song=5)]), name="Fruits Basket", year=2001)
    second = replace(
        anime(2, themes=[replace(theme(song=5), track=DISCOGRAPHY[1])]),
        name="Fruits Basket",
        year=2019,
    )
    catalog = build(first, second)
    assert [f["name"] for f in catalog["franchises"]] == [
        "Fruits Basket (2001)",
        "Fruits Basket (2019)",
    ]
    assert validate_anime_catalog(catalog) == []


# --- a leitura dos snapshots ---------------------------------------------------------------------


def test_the_snapshot_shape_is_checked():
    def track_of(ref, where):
        return DISCOGRAPHY[0]

    good = {"malId": 1, "slug": "a", "name": "A", "themes": []}
    assert anime_from_dict(good, track_of, "x").name == "A"
    bad_level = {**good, "levels": {"mal": 10}}
    with pytest.raises(InputError, match="0 a 9"):
        anime_from_dict(bad_level, track_of, "x")
    bad_theme = {
        **good,
        "themes": [{"type": "OP", "song": "x", "result": "no-match", "track": "1"}],
    }
    with pytest.raises(InputError, match="só o result matched"):
        anime_from_dict(bad_theme, track_of, "x")
    with pytest.raises(InputError, match="slug"):
        anime_from_dict({**good, "slug": "Com Espaço"}, track_of, "x")
    # A temporada e os números exatos do quiz do dia (M18): só os das duas fontes, nos limites.
    assert anime_from_dict({**good, "season": "fall"}, track_of, "x").season == "fall"
    with pytest.raises(InputError, match="season"):
        anime_from_dict({**good, "season": "autumn"}, track_of, "x")
    theme = {"type": "OP", "song": "x", "result": "no-match"}
    ok = {**theme, "stats": {"anisongdb": 72.5, "animethemes": 312}}
    (read,) = anime_from_dict({**good, "themes": [ok]}, track_of, "x").themes
    assert read.stats == {"anisongdb": Decimal("72.5"), "animethemes": Decimal(312)}
    for stats, message in (
        ({"anisongdb": 120}, "de 0 a 100"),
        ({"anisongdb": float("nan")}, "de 0 a 100"),  # o json do Python aceita o NaN
        ({"anisongdb": float("inf")}, "de 0 a 100"),
        ({"anisongdb": 72.25}, "1 casa"),
        ({"animethemes": 1.5}, "inteiro"),
        ({"animethemes": -1}, "inteiro"),
        ({"mal": 8.61}, "stats aceita só"),
        ({"anisongdb": True}, "número"),
        (None, "stats aceita só"),
    ):
        with pytest.raises(InputError, match=message):
            anime_from_dict({**good, "themes": [{**theme, "stats": stats}]}, track_of, "x")
    # Os snapshots antigos, sem os dois: o anime sem temporada, o tema sem números.
    (bare,) = anime_from_dict({**good, "themes": [theme]}, track_of, "x").themes
    assert bare.stats == {} and anime_from_dict(good, track_of, "x").season is None
    # A lista fechada vale também para cada série.
    extra = {**good, "series": [{"slug": "a", "name": "A", "score": 8.6}]}
    with pytest.raises(InputError, match="series"):
        anime_from_dict(extra, track_of, "x")


LOOKUP = {
    "trackId": 1,
    "trackName": "紅蓮華",
    "artistId": 100,
    "artistName": "LiSA",
    "collectionId": 10,
    "collectionName": "紅蓮華 - Single",
    "releaseDate": "2019-07-02T15:00:00Z",
    "trackTimeMillis": 240000,
    "trackExplicitness": "notExplicit",
    "previewUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a",
    "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg",
    "trackViewUrl": "https://music.apple.com/jp/album/x/10?i=1&uo=4",
}


def write_snapshot(directory, fetched_at: str, themes: list[dict], tracks: dict) -> None:
    data = {
        "provider": "apple",
        "storefront": "jp",
        "id": snapshot_id(fetched_at),
        "fetchedAt": fetched_at,
        "anime": [
            {
                "malId": 38000,
                "slug": "kimetsu_no_yaiba",
                "name": "Kimetsu no Yaiba",
                "synonyms": ["鬼滅の刃", "Demon Slayer"],
                "year": 2019,
                "series": [{"slug": "kimetsu_no_yaiba", "name": "Kimetsu no Yaiba"}],
                "levels": {"mal": 9},
                "themes": themes,
            }
        ],
        "artists": {"100": {"artistName": "LiSA"}},
        "resolved": {"LiSA": ["100"]},
        "tracks": tracks,
    }
    write_if_changed(directory / f"{data['id']}.json", dumps(data))


def test_the_apple_provider_maps_the_snapshot(tmp_path):
    op = {
        "type": "OP",
        "sequence": 1,
        "song": "Gurenge",
        "artists": ["LiSA"],
        "levels": {"anisongdb": 9},
        "result": "matched",
        "track": "1",
    }
    write_snapshot(tmp_path, "2026-10-21T23:10:05Z", [op], {"1": LOOKUP})
    provider = AppleAnimeProvider(tmp_path)
    src = provider.source()
    assert src.snapshots == (("2026-10-21T231005Z", "2026-10-21T23:10:05Z"),)
    (t,) = build_anime_catalog("apple", "jp", src, Curation(), [], icon_artists=frozenset())[
        "tracks"
    ]
    assert t["id"] == "apple:tr:1" and t["releaseDate"] == "2019-07-03"
    assert t["storeUrl"] == "https://music.apple.com/jp/album/x/10?i=1"


def test_the_apple_provider_refuses_a_missing_track(tmp_path):
    op = {"type": "OP", "song": "Gurenge", "result": "matched", "track": "2"}
    write_snapshot(tmp_path, "2026-10-21T23:10:05Z", [op], {"1": LOOKUP})
    with pytest.raises(InputError, match="ausente do snapshot"):
        AppleAnimeProvider(tmp_path).source()


def test_the_apple_provider_refuses_a_malformed_lookup(tmp_path):
    op = {"type": "OP", "song": "Gurenge", "result": "matched", "track": "1"}
    broken = {k: v for k, v in LOOKUP.items() if k != "trackTimeMillis"}
    write_snapshot(tmp_path, "2026-10-21T23:10:05Z", [op], {"1": broken})
    with pytest.raises(InputError, match="forma inesperada"):
        AppleAnimeProvider(tmp_path).source()


def test_the_apple_provider_needs_a_snapshot(tmp_path):
    with pytest.raises(InputError, match="nenhum snapshot"):
        AppleAnimeProvider(tmp_path).source()


def test_the_snapshot_name_matches_the_fetch_time(tmp_path):
    write_snapshot(tmp_path, "2026-10-21T23:10:05Z", [], {})
    (tmp_path / "2026-10-21T231005Z.json").rename(tmp_path / "2026-10-21T000000Z.json")
    with pytest.raises(InputError, match="não bate"):
        AppleAnimeProvider(tmp_path).source()


# --- as fixtures, o tamanho e o CLI ------------------------------------------------------------


COMMITTED = anime_paths("fixture").public_dir / "catalog.json"


def test_the_fixture_has_every_mode_and_tier():
    notes: list[str] = []
    provider = FixtureAnimeProvider()
    catalog = build_anime_catalog(
        "fixture", "jp", provider.source(), Curation(), notes, icon_artists=frozenset()
    )
    for mode, counts in tier_counts(catalog).items():
        assert min(counts.values()) >= 6, (mode, counts)  # 6 por faixa na agenda fictícia (P235)
    assert any(n.startswith("musica: facil") for n in notes)
    assert validate_anime_catalog(catalog) == []


@pytest.mark.parametrize("provider", ["fixture", "apple"])
def test_committed_anime_catalog_is_up_to_date(tmp_path, provider):
    """O catálogo do Anime versionado (o fictício e, desde a carga de teste, C1, o real, a partir
    dos snapshots de pipeline/data/apple/anime/) é o que o build-anime gera hoje. Se falhar,
    regere com o build-anime do provedor. Sem `skip`: um catálogo apagado tem de falhar aqui."""
    fresh = tmp_path / "catalog.json"
    assert main(["build-anime", "--provider", provider, "--out", str(fresh)]) == 0
    assert fresh.read_bytes() == (anime_paths(provider).public_dir / "catalog.json").read_bytes()


@pytest.mark.parametrize("seed", ["1", "2"])
def test_anime_bytes_do_not_depend_on_hash_seed(tmp_path, seed):
    out = tmp_path / f"catalog-{seed}.json"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", "build-anime", "--provider", "fixture"]
    subprocess.run([*cmd, "--out", str(out)], check=True, env=env, capture_output=True)
    assert out.read_bytes() == COMMITTED.read_bytes()


def test_build_anime_refuses_another_providers_public_dir(capsys):
    real = anime_paths("apple").public_dir / "catalog.json"
    before = real.read_bytes() if real.exists() else None
    assert main(["build-anime", "--provider", "fixture", "--out", str(real)]) == 1
    assert "grava em" in capsys.readouterr().err
    assert (real.read_bytes() if real.exists() else None) == before


def test_validate_anime_command(tmp_path, capsys):
    assert main(["validate-anime", "--provider", "fixture"]) == 0
    assert main(["validate-anime", "--provider", "fixture", "--path", str(tmp_path / "x")]) == 1
    assert "arquivo ausente" in capsys.readouterr().err
    broken = tmp_path / "catalog.json"
    broken.write_bytes(COMMITTED.read_bytes().replace(b'"schemaVersion": 1', b'"schemaVersion": 2'))
    assert main(["validate-anime", "--provider", "fixture", "--path", str(broken)]) == 1
    assert "schemaVersion" in capsys.readouterr().err


def test_validation_catches_broken_references():
    catalog = read_json(COMMITTED)
    catalog["tracks"][0]["anime"]["franchiseIds"] = ["anime:fr:nao_existe"]
    problems = validate_anime_catalog(catalog)
    assert any("franquia inexistente" in p for p in problems)
    catalog = read_json(COMMITTED)
    catalog["franchises"].append({"id": "anime:fr:zzz", "name": "Z", "search": ["z"]})
    assert any("franquia sem faixa" in p for p in validate_anime_catalog(catalog))


def test_a_thousand_songs_fit_under_the_cap():
    """A medida do PR A1 (P236): 1.000 músicas reais, com as URLs da Apple, cabem no teto."""
    lookups = {}
    items = []
    for i in range(1000):
        tid = str(1_500_000_000 + i)
        lookups[tid] = {
            **LOOKUP,
            "trackId": int(tid),
            "trackName": f"テスト曲 {i}",
            "collectionId": 1_400_000_000 + i,
            "collectionName": f"テストアルバム {i}",
            "artistId": 100 + i % 300,
            "artistName": f"歌手{i % 300}",
            "previewUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/"
            f"ce/88/fa/ce88fa23-a092-743d-e2bf-c07023bf{i:04d}/mzaf_6331046814096677569.plus.aac.p.m4a",
            "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Music7/v4/df/27/f9/"
            f"df27f992-d880-dbdf-1327-0c9d1088{i:04d}/eve-0001_1.jpg/100x100bb.jpg",
            "trackViewUrl": f"https://music.apple.com/jp/album/x/{1_400_000_000 + i}?i={tid}",
        }
        items.append(
            Anime(
                mal_id=i + 1,
                slug=f"anime_{i}",
                name=f"Anime Title Number {i}: The Long Subtitle",
                synonyms=(f"アニメのタイトル{i}", f"Anime English Title {i}"),
                year=2019,
                series=(),
                levels={"mal": i % 10},
                themes=(
                    Theme(
                        "OP",
                        1,
                        f"Tesuto Kyoku {i}",
                        (f"Kashu {i % 300}",),
                        {"anisongdb": 5},
                        "matched",
                        None,
                    ),
                ),
            )
        )
    from musicle_pipeline.providers.apple import artist_names, map_track, partners_of

    names = artist_names(lookups, {})
    partners = partners_of(list(names.values()))
    mapped = {k: map_track(v, names, partners, "x", []) for k, v in lookups.items()}
    items = [
        replace(a, themes=(replace(a.themes[0], track=mapped[str(1_500_000_000 + n)]),))
        for n, a in enumerate(items)
    ]
    catalog = build_anime_catalog(
        "apple", "jp", source(*items), Curation(), [], icon_artists=frozenset()
    )
    size = len(dumps(catalog).encode("utf-8"))
    assert size < MAX_FILE_BYTES, size


# --- a revisão do PR A1 (o revisor) --------------------------------------------------------------


def test_a_live_or_karaoke_tv_size_is_not_a_reserve():
    pool = [track("1", "紅蓮華 - TV Size (Live)"), track("2", "紅蓮華 (TV Size) (Instrumental)")]
    assert match_theme("紅蓮華", pool, romanize).result == "no-match"
    assert (
        match_theme("紅蓮華", [track("3", "紅蓮華 -TV size ver.-")], romanize).result == "matched"
    )


def test_similarity_needs_keys_of_close_length():
    # "hana" e "hanabi" começam igual, mas são outra música: sem a trava, dariam 0,80.
    pool = [track("1", "Hanabi"), track("2", "炎")]
    assert match_theme("Hana", pool, romanize, year=2019).result == "no-match"


def test_without_the_year_only_the_same_title_matches():
    assert match_theme("Gurenge", DISCOGRAPHY, romanize, year=None).result == "no-match"
    assert match_theme("unlasting", DISCOGRAPHY, romanize, year=None).result == "matched"


def test_the_version_of_the_anime_era_wins():
    old = track("1", "Again", released="2005-01-01")
    new = track("2", "Again", released="2009-06-03")
    assert match_theme("Again", [old, new], romanize, year=2009).track == new


def test_an_unknown_key_in_the_snapshot_is_refused():
    # P254: um número bruto de fonte gravado por engano não passa calado.
    def track_of(ref, where):
        return DISCOGRAPHY[0]

    with pytest.raises(InputError, match="chave desconhecida"):
        anime_from_dict({"malId": 1, "slug": "a", "name": "A", "score": 8.61}, track_of, "x")
    theme_data = {"type": "OP", "song": "x", "result": "no-match", "popularity": 0.9}
    with pytest.raises(InputError, match="chave desconhecida"):
        anime_from_dict(
            {"malId": 1, "slug": "a", "name": "A", "themes": [theme_data]}, track_of, "x"
        )
    with pytest.raises(InputError, match="sequence"):
        anime_from_dict(
            {
                "malId": 1,
                "slug": "a",
                "name": "A",
                "themes": [{"type": "OP", "sequence": True, "song": "x", "result": "no-match"}],
            },
            track_of,
            "x",
        )


def test_the_published_popularity_comes_only_from_the_tier():
    # P240: sem nível do tema (o quiz 2), o MAL 8 dá o Médio nos dois modos (0,184 e 0,177), mas
    # nenhum nível vai para o arquivo.
    (t,) = build(anime(1, show=8, themes=[theme()]))["tracks"]
    assert t["anime"]["tiers"] == {"musica": "medio", "titulo": "medio"}
    assert t["popularity"] == 0.6667
    assert "levels" not in t["anime"]


def test_the_song_name_is_easier_than_the_anime_only_for_an_icon():
    # Quiz 9 e pl 7 num anime pouco visto (MAL 0): o nome da música daria Fácil (0,37), e o
    # anime fica no Médio (0,117). Só o artista da parada (P274) deixa a música no Fácil.
    show = anime(1, show=0, themes=[levels(quiz=9, pl=7)])
    (t,) = build(show)["tracks"]
    assert t["anime"]["tiers"] == {"musica": "medio", "titulo": "medio"}
    (t,) = build(show, icons=frozenset({"apple:ar:100"}))["tracks"]
    assert t["anime"]["tiers"] == {"musica": "facil", "titulo": "medio"}


def test_many_endings_of_the_franchise_make_the_name_harder():
    # Quiz 5 e pl 5 no MAL 9: o nome dá 0,43 sozinho (Fácil) e 0,18 entre 21 encerramentos.
    ending = replace(levels(quiz=5, pl=5), type="ED")
    (t,) = build(anime(1, show=9, themes=[ending]))["tracks"]
    assert t["anime"]["tiers"] == {"musica": "facil", "titulo": "facil"}
    others = [
        replace(theme("ED", result="no-match"), song=f"Ending {i}", track=None) for i in range(20)
    ]
    (t,) = build(anime(1, show=9, themes=[ending, *others]))["tracks"]
    assert t["anime"]["tiers"] == {"musica": "medio", "titulo": "facil"}


def test_the_build_joins_the_levels_of_the_two_sources():
    # Sem a junção, o pl 2 estimaria o quiz em 2,4 (Médio no MAL 8); com o quiz 9 do outro
    # registro do mesmo tema (P275), o anime vai ao Fácil.
    matched = replace(levels(pl=2), song="Gurenge feat. X")
    quiz = replace(levels(quiz=9), result="no-match", track=None)
    (t,) = build(anime(1, show=8, themes=[matched]))["tracks"]
    assert t["anime"]["tiers"]["titulo"] == "medio"
    (t,) = build(anime(1, show=8, themes=[matched, quiz]))["tracks"]
    assert t["anime"]["tiers"]["titulo"] == "facil"


def test_the_same_song_in_two_tracks_gets_the_easiest_tier():
    # A abertura de uma temporada (a gravação completa) é a insert song pouco conhecida da outra
    # (a TV size): as duas faixas ficam com a faixa da abertura, porque a fama é da música.
    tv = replace(DISCOGRAPHY[0], provider_id="9", title="紅蓮華 (TV Size)")
    one = anime(1, show=9, themes=[theme("OP", song=9)])
    two = anime(2, show=2, themes=[replace(theme("IN", song=2), track=tv)])
    tracks = build(one, two)["tracks"]
    assert len(tracks) == 2
    assert all(t["anime"]["tiers"] == {"musica": "facil", "titulo": "facil"} for t in tracks)
    assert all(t["popularity"] == 1.0 for t in tracks)


def test_the_tv_size_and_the_full_song_share_the_song_key():
    tv = replace(DISCOGRAPHY[0], provider_id="9", title="紅蓮華 (TV Size)")
    one = anime(1, themes=[theme(song=5)])
    two = anime(2, themes=[replace(theme(song=5), track=tv)])
    keys = {t["songKey"] for t in build(one, two)["tracks"]}
    assert len(keys) == 1


def test_the_lab_chances_are_the_ones_behind_the_tiers(tmp_path, capsys):
    # O laboratório das Misturadas (M17) lê a chance de cada música: a mesma que dá as faixas do
    # catálogo, em texto com 4 casas, fora do que é publicado.
    out = tmp_path / "chances.json"
    assert main(["anime-chances", "--provider", "fixture", "--out", str(out)]) == 0
    chances_by_song = read_json(out)
    catalog = read_json(COMMITTED)
    assert set(chances_by_song) == {t["songKey"] for t in catalog["tracks"]}
    assert list(chances_by_song) == sorted(chances_by_song)  # a saída ordenada (o dumps)
    for track in catalog["tracks"]:
        chance = {mode: Decimal(v) for mode, v in chances_by_song[track["songKey"]].items()}
        assert all(v == v.quantize(Decimal("0.0001")) and 0 <= v <= 1 for v in chance.values())
        # O "acertar o anime" nunca é rebaixado (P274): a faixa dele sai direto do corte.
        easy, medium = CUTS["titulo"]
        tier = track["anime"]["tiers"]["titulo"]
        value = chance["titulo"]
        assert tier == ("facil" if value >= easy else "medio" if value >= medium else "dificil")
    assert "música(s)" in capsys.readouterr().out
    # Gravar de novo, igual, não mexe no arquivo; e a chance nunca vai para o site.
    assert main(["anime-chances", "--provider", "fixture", "--out", str(out)]) == 0
    assert "sem mudanças" in capsys.readouterr().out
    public = anime_paths("fixture").public_dir / "chances.json"
    assert main(["anime-chances", "--provider", "fixture", "--out", str(public)]) == 1
    assert not public.exists()
    # Nem numa pasta rastreada do repositório, que um `git add` levaria ao commit (P254): lá dentro,
    # só a pasta do laboratório, que o .gitignore deixa de fora.
    tracked = anime_paths("fixture").source.parent / "chances.json"
    assert main(["anime-chances", "--provider", "fixture", "--out", str(tracked)]) == 1
    assert "não entra no Git" in capsys.readouterr().err
    assert not tracked.exists()


def test_the_catalog_has_no_famous_mark_anymore():
    # A régua das muito conhecidas saiu (o usuário, 24/10/2026): as Misturadas tiram do Fácil
    # inteiro, e o campo, que ninguém lia, não vai mais para o arquivo público. O esquema o recusa.
    catalog = read_json(COMMITTED)
    assert all("famous" not in t["anime"] for t in catalog["tracks"])
    marked = copy.deepcopy(catalog)
    marked["tracks"][0]["anime"]["famous"] = {"musica": True, "titulo": False}
    assert any("famous" in p for p in validate_anime_catalog(marked))


def test_validation_catches_a_stale_version_and_hand_edits(tmp_path):
    catalog = read_json(COMMITTED)
    catalog["franchises"][0]["name"] = "Outro nome"
    problems = validate_anime_catalog(catalog)
    assert any("catalogVersion" in p for p in problems)
    raw = COMMITTED.read_bytes().replace(b"\n", b"\r\n")
    assert any("canônica" in p for p in validate_anime_catalog(read_json(COMMITTED), raw))
