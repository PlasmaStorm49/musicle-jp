"""O especial dos artistas parecidos do quiz do dia (M18, S62; o usuário, 22/11/2026): os grupos,
as músicas de cada artista, a prioridade da estreia, a run e a conferência."""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest

from musicle_pipeline import anime_quiz as quiz
from musicle_pipeline.anime_quiz import (
    ARTISTS,
    FAMILY_BY_ID,
    QuizContext,
    generate_quiz,
    quiz_regenerate_problems,
    quiz_rule_problems,
    special_weekday,
    validate_quiz_schedule,
)
from musicle_pipeline.anime_quiz_artists import (
    FLOOR,
    POOL_MAX,
    ArtistGroup,
    ArtistSide,
    ArtistSong,
    load_artist_groups,
    load_group_rules,
)
from musicle_pipeline.io_json import dumps
from musicle_pipeline.models import JSON, InputError
from test_anime_quiz import EPOCH, _context


def _side(artist: str, name: str, count: int) -> ArtistSide:
    songs = tuple(
        ArtistSong(id=f"x:tr:{artist}{k:03d}", key=f"{artist} {k}|x:ar:{artist}")
        for k in range(count)
    )
    return ArtistSide(id=f"x:ar:{artist}", name=name, songs=songs)


GROUPS = (
    ArtistGroup("mizuki-mayn", (_side("mz", "Nana Mizuki", 34), _side("my", "May'n", 20))),
    ArtistGroup("tamura-ogura", (_side("tm", "Yukari Tamura", 18), _side("og", "Yui Ogura", 16))),
    # Abaixo do piso: nunca sai.
    ArtistGroup("curto", (_side("c1", "Curto Um", FLOOR - 1), _side("c2", "Curto Dois", 40))),
)


@pytest.fixture(scope="module")
def ctx() -> QuizContext:
    base = _context()
    return QuizContext(
        {"catalogVersion": base.version, "franchises": [], "tracks": list(base.tracks.values())},
        {s.key: s.facts for s in base.songs},
        base.mal,
        base.anime_days,
        base.mixed_days,
        GROUPS,
    )


def _special_days(first: date, count: int) -> list[date]:
    days = [first + timedelta(days=k) for k in range(count)]
    return [d for d in days if d.weekday() == special_weekday(d)]


@pytest.fixture(scope="module")
def schedule(ctx: QuizContext) -> JSON:
    """5 semanas ISO do acervo sintético, com os grupos."""
    return generate_quiz(ctx, None, EPOCH, EPOCH, horizon=34).schedule


# --- os grupos e as músicas


def test_only_the_groups_with_the_floor_enter(ctx):
    assert [g.id for g in ctx.ready_groups()] == ["mizuki-mayn", "tamura-ogura"]
    assert ctx.params(FAMILY_BY_ID[ARTISTS]) == ["mizuki-mayn", "tamura-ogura"]


def test_the_debut_puts_each_group_in_the_first_specials(schedule):
    # A prioridade da estreia: os dois primeiros especiais são os dois grupos, um de cada vez; o
    # terceiro volta à regra de não repetir o tipo da semana anterior.
    specials = [schedule["days"][d.isoformat()] for d in _special_days(EPOCH, 35)]
    assert [s["family"] for s in specials[:2]] == [ARTISTS, ARTISTS]
    assert sorted(s["group"] for s in specials[:2]) == ["mizuki-mayn", "tamura-ogura"]
    assert specials[2]["family"] != ARTISTS


def test_the_artists_day(schedule, ctx):
    days = [(d, day) for d, day in sorted(schedule["days"].items()) if day["family"] == ARTISTS]
    assert days
    for where, day in days:
        group = next(g for g in GROUPS if g.id == day["group"])
        asked, *others = day["artists"]
        side = group.side(asked)
        assert side is not None and day["param"] == side.name
        assert sorted([asked, *others]) == sorted(s.id for s in group.sides)
        rest = [s for s in group.sides if s is not side]
        # A run acaba no total do lado menor, até 30 (P451).
        assert len(day["rounds"]) == min(len(side.songs), sum(len(s.songs) for s in rest), 30)
        mine = {s.id for s in side.songs}
        used: Counter[str] = Counter()
        for rnd in day["rounds"]:
            answer = rnd[rnd["answer"]]
            other = rnd["b"] if rnd["answer"] == "a" else rnd["a"]
            assert (answer in mine) == (day["direction"] == "tem"), where
            assert (other in mine) == (day["direction"] == "nao"), where
            assert "info" not in rnd
            used.update((rnd["a"], rnd["b"]))
        assert max(used.values()) == 1  # nenhuma música repete na run


def test_the_check_takes_the_artists_day(schedule, ctx):
    assert validate_quiz_schedule(schedule, ctx) == []
    assert quiz_rule_problems(schedule, ctx) == ([], [])
    # Os dias novos saem iguais ao gerador.
    first, *_ = sorted(schedule["days"])
    base = {**schedule, "days": {first: schedule["days"][first]}}
    assert quiz_regenerate_problems(base, schedule, ctx) == []


def test_the_check_refuses_a_wrong_artists_day(schedule, ctx):
    where, day = next((d, x) for d, x in sorted(schedule["days"].items()) if x["family"] == ARTISTS)
    swapped = {**day, "direction": "nao" if day["direction"] == "tem" else "tem"}
    problems = quiz._day_rule_problems(where, swapped, ctx)
    assert any("artista da pergunta" in p for p in problems)
    no_group = {k: v for k, v in day.items() if k != "group"}
    wrong = {**schedule, "days": {**schedule["days"], where: no_group}}
    assert any("grupo e dos artistas" in p for p in validate_quiz_schedule(wrong, ctx))
    other_day = next(x for x in schedule["days"].values() if x["family"] != ARTISTS)
    extra = {**other_day, "group": "mizuki-mayn"}
    bad = {**schedule, "days": {**schedule["days"], "2099-01-01": extra}}
    assert any("só os artistas parecidos" in p for p in validate_quiz_schedule(bad, ctx))


def test_without_groups_nothing_changes():
    # Sem o quiz_artists.toml, o especial não sai, e a agenda é a de antes.
    plain = _context()
    days = generate_quiz(plain, None, EPOCH, EPOCH, horizon=20).schedule["days"]
    assert all(day["family"] != ARTISTS for day in days.values())


# --- a leitura dos grupos e das músicas


def _track(tid: str, key: str, artists: list[str], display: str, pop: float = 0.5) -> JSON:
    return {
        "id": tid,
        "songKey": key,
        "artistIds": artists,
        "artistDisplay": display,
        "eligible": {"daily": True, "reason": None},
        "popularity": pop,
    }


def test_the_songs_of_each_artist(tmp_path: Path):
    rules = tmp_path / "quiz_artists.toml"
    rules.write_text('[[groups]]\nid = "a-b"\nartists = ["1", "2"]\n', encoding="utf-8")
    anime = {
        "tracks": [
            _track("x:tr:an1", "um|x:ar:1", ["x:ar:1"], "Cantora"),
            # Cantada como personagem: conta (o usuário, 22/11/2026).
            _track("x:tr:an2", "dois|x:ar:9", ["x:ar:9"], "Heroína(CV:歌手)"),
            # O dueto dos dois artistas do grupo fica fora dos dois lados.
            _track("x:tr:an3", "tres|x:ar:1", ["x:ar:1", "x:ar:2"], "Cantora & Outra"),
            {
                **_track("x:tr:an4", "quatro|x:ar:1", ["x:ar:1"], "Cantora"),
                "eligible": {"daily": False, "reason": "x"},
            },
        ]
    }
    many = [
        _track(f"x:tr:f{k:03d}", f"f{k}|x:ar:1", ["x:ar:1"], "Cantora", k / 100) for k in range(60)
    ]
    files = {
        "1": {
            "artists": [{"id": "x:ar:1", "name": "歌手", "nameLatin": "Kashu"}],
            "tracks": [_track("x:tr:an1", "um|x:ar:1", ["x:ar:1"], "Cantora"), *many],
        },
        "2": {
            "artists": [{"id": "x:ar:2", "name": "Outra", "nameLatin": None}],
            "tracks": [_track("x:tr:o1", "o|x:ar:2", ["x:ar:2"], "Outra")],
        },
    }
    for name, data in files.items():
        (tmp_path / f"{name}.json").write_text(dumps(data), encoding="utf-8")
    (group,) = load_artist_groups("x", rules, tmp_path, anime)
    one, two = group.sides
    assert (one.name, two.name) == ("Kashu", "Outra")
    ids = [s.id for s in one.songs]
    # O Anime primeiro (a do arquivo com a mesma música não repete), depois as mais populares.
    assert ids[:3] == ["x:tr:an1", "x:tr:an2", "x:tr:f059"]
    assert len(ids) == POOL_MAX and "x:tr:an3" not in ids and "x:tr:an4" not in ids
    assert [s.id for s in two.songs] == ["x:tr:o1"]
    # As conhecidas (a conferência dos dias gravados) passam do teto e levam a que não é elegível.
    known = [s.id for s in one.known]
    assert len(known) == 2 + 60 + 1 and "x:tr:an4" in known and "x:tr:f000" in known


def test_the_same_track_in_the_anime_and_in_the_file_enters_once(tmp_path: Path):
    # A cantada como personagem: no Anime, com a chave do personagem; no arquivo do artista (as
    # extra_tracks), com a chave dele e o mesmo id. Entra uma vez, com a chave do Anime (P378).
    rules = tmp_path / "quiz_artists.toml"
    rules.write_text('[[groups]]\nid = "a-b"\nartists = ["1", "2"]\n', encoding="utf-8")
    anime = {"tracks": [_track("x:tr:cv", "canção|x:ar:9", ["x:ar:9"], "Heroína(CV:歌手)")]}
    files = {
        "1": {
            "artists": [{"id": "x:ar:1", "name": "歌手", "nameLatin": None}],
            "tracks": [_track("x:tr:cv", "canção|x:ar:1", ["x:ar:9", "x:ar:1"], "Heroína")],
        },
        # O nome que só começa igual é outra pessoa.
        "2": {"artists": [{"id": "x:ar:2", "name": "歌手子", "nameLatin": None}], "tracks": []},
    }
    for name, data in files.items():
        (tmp_path / f"{name}.json").write_text(dumps(data), encoding="utf-8")
    (group,) = load_artist_groups("x", rules, tmp_path, anime)
    one, two = group.sides
    assert one.songs == (ArtistSong(id="x:tr:cv", key="canção|x:ar:9"),)
    assert two.songs == ()


def test_a_stored_day_keeps_a_track_that_left_the_pool(schedule, ctx):
    # O dia gravado cita uma faixa que saiu do pool (o teto, a popularidade): continua valendo.
    where, day = next((d, x) for d, x in sorted(schedule["days"].items()) if x["family"] == ARTISTS)
    group = next(g for g in GROUPS if g.id == day["group"])
    used = {t for rnd in day["rounds"] for t in (rnd["a"], rnd["b"])}
    shrunk = tuple(
        ArtistSide(s.id, s.name, tuple(x for x in s.songs if x.id not in used), known=s.songs)
        for s in group.sides
    )
    groups = [ArtistGroup(group.id, shrunk), *(g for g in GROUPS if g.id != group.id)]
    later = QuizContext(
        {"catalogVersion": ctx.version, "franchises": [], "tracks": list(ctx.tracks.values())},
        {s.key: s.facts for s in ctx.songs},
        ctx.mal,
        ctx.anime_days,
        ctx.mixed_days,
        groups,
    )
    assert quiz._day_rule_problems(where, day, later) == []
    one_day = {**schedule, "days": {where: day}}
    assert validate_quiz_schedule(one_day, later) == []


def test_a_group_without_the_artist_file_is_refused(tmp_path: Path):
    rules = tmp_path / "quiz_artists.toml"
    rules.write_text('[[groups]]\nid = "a-b"\nartists = ["1", "2"]\n', encoding="utf-8")
    with pytest.raises(InputError, match="build-artists"):
        load_artist_groups("x", rules, tmp_path, {"tracks": []})
    assert load_artist_groups("x", tmp_path / "nao.toml", tmp_path, {"tracks": []}) == []


@pytest.mark.parametrize(
    "text",
    [
        '[[groups]]\nid = "A"\nartists = ["1", "2"]\n',
        '[[groups]]\nid = "a"\nartists = ["1"]\n',
        '[[groups]]\nid = "a"\nartists = ["1", "1"]\n',
        '[[groups]]\nid = "a"\nartists = ["1", "2"]\n[[groups]]\nid = "a"\nartists = ["3", "4"]\n',
        '[[groups]]\nid = "a"\nartists = ["1", "2"]\nextra = 1\n',
    ],
)
def test_the_group_rules_are_strict(tmp_path: Path, text: str):
    path = tmp_path / "quiz_artists.toml"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(InputError):
        load_group_rules(path)
