"""O quiz do dia (M18, Apêndice Q): os fatos de cada música, os dados do MAL, a curva, a run (as
regras de um dia da P378, com o que a revelação da P382 mostra), o pool com cooldown e os
especiais (P381), os arquivos por mês (P379) e a conferência, com os dias do MAL sem os dados dele
(P380)."""

from __future__ import annotations

import copy
import os
import shutil
import subprocess
import sys
from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal
from itertools import pairwise
from pathlib import Path

import pytest

from musicle_pipeline import anime_quiz as quiz
from musicle_pipeline import cli
from musicle_pipeline.anime import MODES, SEASONS
from musicle_pipeline.anime import TIERS as ANIME_TIERS
from musicle_pipeline.anime_quiz import (
    FAMILY_BY_ID,
    RUN_ROUNDS,
    SPECIAL_ROUNDS,
    STEPS,
    MalFacts,
    QuizContext,
    SongFacts,
    distance_bounds,
    generate_quiz,
    load_mal,
    merge_months,
    quiz_regenerate_problems,
    quiz_rule_problems,
    read_quiz_dir,
    read_quiz_ref,
    round_sig,
    song_facts,
    special_weekday,
    split_months,
    tier_cuts,
    validate_quiz_schedule,
    write_quiz_dir,
)
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON, InputError
from musicle_pipeline.paths import MIXED_FILE, QUIZ_DIR, anime_paths
from musicle_pipeline.prng import seeded
from musicle_pipeline.providers import ANIME_PROVIDERS
from musicle_pipeline.schedule import ScheduleError

EPOCH = date(2026, 10, 5)  # uma segunda: as semanas ISO começam no epoch
VERSION = "2026-10-05.0000abcd"
LABELS = ("Action", "Comedy", "Drama", "Fantasy", "Romance", "School", "Isekai", "Sci-Fi", "Gore")
SOURCES = ("manga", "light_novel", "original", "web_manga")
SONGS = 300
# Uma run de cada família, com um parâmetro que fecha a run no acervo sintético.
FAMILY_CASES = (
    ("ano", None),
    ("nota", None),
    ("membros", None),
    ("playlists", None),
    ("amq", None),
    ("rotulo", "Action"),
    ("fonte", "manga"),
    ("tema", None),
    ("estudio", "Estúdio 0"),
    ("ano_x", 2000),
)


def _facts(i: int) -> SongFacts:
    mal_id = 1000 + i // 2  # duas músicas por anime: a pergunta do tema tem o "mesmo anime"
    return SongFacts(
        # 7 anos, de 4 em 4: cada um com umas 43 músicas, o que fecha o especial do ano (30).
        year=2000 + 4 * ((i * 3) % 7),
        season=i % 4,
        amq=Decimal(30 + (i * 7) % 70) + Decimal(i % 10) / 10,  # de 30,0% a 99,9%
        playlists=1 + (i * 37) % 900,
        theme="OP" if i % 2 == 0 else "ED",
        label="OP1" if i % 2 == 0 else "ED1",
        mal_id=mal_id,
        anime_ids=frozenset({mal_id}),
    )


def _mal(mal_id: int) -> MalFacts:
    k = mal_id - 1000
    return MalFacts(
        genres=frozenset(LABELS[(k + j) % len(LABELS)] for j in (0, 2, 5)),
        mean=Decimal(600 + (k * 37) % 300) / 100,
        members=10_000 * (1 + (k * 13) % 200),
        source=SOURCES[k % len(SOURCES)],
        studios=frozenset({f"Estúdio {k % 4}"}),
    )


def _track(i: int) -> JSON:
    f = _facts(i)
    tier = ANIME_TIERS[i % 3]
    return {
        "id": f"x:tr:t{i:04d}",
        "songKey": f"song {i}|x:ar:a{i:04d}",
        "eligible": {"daily": True, "reason": None},
        "anime": {
            "franchiseIds": [f"anime:fr:f{f.mal_id // 3}"],
            "themes": [{"anime": f"Anime {f.mal_id}", "type": f.theme, "sequence": 1}],
            "tiers": {"musica": tier, "titulo": tier},
        },
    }


def _catalog(songs: int = SONGS) -> JSON:
    tracks = [_track(i) for i in range(songs)]
    fids = sorted({f for t in tracks for f in t["anime"]["franchiseIds"]})
    return {
        "catalogVersion": VERSION,
        "franchises": [{"id": f, "name": f, "search": [f]} for f in fids],
        "tracks": tracks,
    }


def _all_facts(catalog: JSON) -> dict[str, SongFacts]:
    return {t["songKey"]: _facts(i) for i, t in enumerate(catalog["tracks"])}


def _anime_day(answers: list[str]) -> JSON:
    it = iter(answers)
    return {
        mode: {tier: [{"answer": next(it)} for _ in range(3)] for tier in ANIME_TIERS}
        for mode in MODES
    }


def _mixed_day(answers: list[str]) -> JSON:
    it = iter(answers)
    return {mode: [{"answers": [next(it), next(it)]} for _ in range(4)] for mode in MODES}


def _days(first: date, count: int) -> list[str]:
    return [(first + timedelta(days=k)).isoformat() for k in range(count)]


def _context(*, mal: bool = True, days: int = 70, songs: int = SONGS) -> QuizContext:
    catalog = _catalog(songs)
    ids = [t["id"] for t in catalog["tracks"]]
    anime_days, mixed_days = {}, {}
    for k, day in enumerate(_days(EPOCH, days)):
        # As respostas do dia mudam todo dia: 18 do Anime e 16 das Misturadas.
        start = (k * 34) % (songs - 34)
        anime_days[day] = _anime_day(ids[start : start + 18])
        mixed_days[day] = _mixed_day(ids[start + 18 : start + 34])
    mal_data = {1000 + k: _mal(1000 + k) for k in range(songs // 2)} if mal else None
    return QuizContext(catalog, _all_facts(catalog), mal_data, anime_days, mixed_days)


@pytest.fixture(scope="module")
def ctx() -> QuizContext:
    return _context()


@pytest.fixture(scope="module")
def schedule(ctx: QuizContext) -> JSON:
    """28 dias (4 semanas ISO inteiras) do acervo sintético, com os dados do MAL."""
    return generate_quiz(ctx, None, EPOCH, EPOCH, horizon=27).schedule


def _run_of(ctx: QuizContext, family_id: str, param: object) -> list[tuple[int, JSON, int]]:
    """A run inteira de uma família no epoch, sem o sorteio da pergunta do dia: (a rodada, o par
    e o nível de afrouxamento) de cada rodada."""
    family = FAMILY_BY_ID[family_id]
    direction = quiz.DIRECTIONS[family.kind][0]
    run, excluded = quiz._Run(), ctx.excluded(EPOCH)
    rounds = []
    for n in range(1, quiz.rounds_of(family) + 1):
        record, step = quiz._round(ctx, family, param, direction, EPOCH, n, run, excluded)
        if record is None:
            break
        rounds.append((n, record, step))
    return rounds


# --- os fatos e os dados do MAL


def test_the_facts_of_a_fixture_song():
    source = ANIME_PROVIDERS["fixture"]().source()
    facts = song_facts("fixture", source)
    catalog = read_json(anime_paths("fixture").public_dir / "catalog.json")
    key = next(t["songKey"] for t in catalog["tracks"] if t["id"] == "fixture:tr:tr21")
    # Midnight Drive: a 1ª abertura de Hoshizora Kaizoku (primavera de 2019), com 94,2% de
    # acerto no AMQ e 820 playlists.
    fact = facts[key]
    assert (fact.year, fact.season, fact.label, fact.theme, fact.mal_id) == (
        2019,
        1,
        "OP1",
        "OP",
        90001,
    )
    assert (fact.amq, fact.playlists) == (Decimal("94.2"), 820)


def test_only_the_first_opening_or_ending_gives_the_year():
    from musicle_pipeline.anime import Anime, Theme

    anime = Anime(9, "s", "S", (), 2002, (), {}, (), season="fall")
    later = Theme("OP", 8, "x", (), {}, "matched", None)
    first = Theme("ED", 1, "y", (), {"anisongdb": 4}, "matched", None, {"anisongdb": Decimal(41)})
    assert quiz._facts_of([(anime, later)]).year is None  # a série longa: a OP8 não leva 2002
    both = quiz._facts_of([(anime, later), (anime, first)])
    # A abertura e o encerramento; a temporada do mesmo anime; o número exato, e não o nível.
    assert (both.year, both.season, both.theme, both.amq) == (2002, 3, None, Decimal(41))
    old = Theme("ED", 1, "y", (), {"anisongdb": 4}, "matched", None)  # um snapshot antigo
    assert quiz._facts_of([(anime, old)]).amq is None
    # Duas estreias no mesmo ano: a temporada mais cedo; se uma não tem temporada, nenhuma.
    winter = Anime(10, "w", "W", (), 2002, (), {}, (), season="winter")
    unknown = Anime(11, "u", "U", (), 2002, (), {}, ())
    opening = Theme("OP", 1, "z", (), {}, "matched", None)
    assert quiz._facts_of([(anime, first), (winter, opening)]).season == 0
    assert quiz._facts_of([(anime, first), (unknown, opening)]).season is None


def test_the_mal_file_is_read_and_checked(tmp_path):
    path = tmp_path / "mal.json"
    path.write_text(
        '{"schemaVersion": 1, "anime": {"7": {"genres": ["Action"], "mean": 8.12, "members": 5,'
        ' "source": "manga", "studios": ["A"]}}}',
        encoding="utf-8",
    )
    found = load_mal(path)[7]
    assert found.mean == Decimal("8.12") and found.members == 5 and found.genres == {"Action"}
    # Sem os gêneros e os estúdios, "não sei" (None), e não "não tem": a música sai da pergunta.
    path.write_text('{"schemaVersion": 1, "anime": {"7": {"mean": 8}}}', encoding="utf-8")
    bare = load_mal(path)[7]
    assert (bare.genres, bare.studios) == (None, None)
    ctx = _context(days=1)
    song = ctx.songs[0]
    unknown = replace(song, mal=bare)
    assert ctx.has(FAMILY_BY_ID["rotulo"], "Action", unknown) is None
    assert ctx.has(FAMILY_BY_ID["estudio"], "Estúdio 0", unknown) is None
    for bad in (
        '{"schemaVersion": 2, "anime": {}}',
        '{"schemaVersion": 1, "anime": {"7": {"score": 1}}}',
        '{"schemaVersion": 1, "anime": {"7": {"mean": "8"}}}',
        '{"schemaVersion": 1, "anime": {"7": {"mean": NaN}}}',  # o json do Python aceita
        '{"schemaVersion": 1, "anime": {"x": {}}}',
    ):
        path.write_text(bad, encoding="utf-8")
        with pytest.raises(InputError):
            load_mal(path)


# --- a curva (P375)


def test_the_tier_curve_follows_the_phases():
    """A curva das faixas (o usuário, 25/10/2026, revista no mesmo dia): começa no Fácil; da
    rodada 6 em diante, as Médias entram sem tirar muito o Fácil, que fica perto da proporção
    natural de Fácil + Médio e desce bem pouco; da 10 à 14 em diante, algumas Difíceis."""
    shares = [quiz.tier_shares(n) for n in range(1, RUN_ROUNDS + 1)]
    assert shares[0] == (85, 15, 0)
    # A reta entre os pontos, nas rodadas do meio, e o último ponto valendo dali em diante.
    assert shares[2] == (73, 27, 0)
    assert shares[7] == (Decimal("53.5"), Decimal("45.5"), 1)
    assert shares[11] == (Decimal("49.5"), Decimal("44.5"), 6)
    assert shares[RUN_ROUNDS - 1] == (41, 39, 20)
    assert all(abs(sum(s) - 100) < Decimal("1e-20") for s in shares)
    for n, (easy, medium, hard) in enumerate(shares, start=1):
        assert easy >= 41 and easy > medium, n  # o Fácil fica, um pouco à frente do Médio
        if n <= 6:
            assert hard == 0, n  # nenhuma Difícil antes de as Médias entrarem
        if n >= 6:
            # Perto dos 56% de Fácil num pool Fácil + Médio, descendo bem pouco.
            assert Decimal("0.51") <= easy / (easy + medium) <= Decimal("0.56"), n
        if n <= 10:
            assert hard <= 2, n
        if n >= 14:
            assert hard >= 10, n  # algumas Difíceis
    assert all(a[0] >= b[0] and a[2] <= b[2] for a, b in pairwise(shares))
    first, second = tier_cuts(1)
    assert (first, second) == (int(Decimal("0.85") * 2**32), 2**32)


def test_the_distance_shrinks_to_the_floor():
    # O ano conta em temporadas: 40 são 10 anos, de 10 a 30 anos na 1ª rodada.
    assert distance_bounds("ano", quiz.curve(1)) == (Decimal(40), Decimal(120))
    # Nos valores inteiros, o mínimo arredonda: na curva média, a diferença de 1 ano (4
    # temporadas) chega na rodada 15, e a de 1 temporada (o mesmo ano), da 26 em diante.
    assert distance_bounds("ano", quiz.curve(14))[0] == 5
    assert distance_bounds("ano", quiz.curve(15))[0] == 4
    assert distance_bounds("ano", quiz.curve(25))[0] == 2
    assert distance_bounds("ano", quiz.curve(26))[0] == 1
    low, high = distance_bounds("ano", quiz.curve(RUN_ROUNDS))
    assert low == 1 and Decimal(3) < high < Decimal("3.03")
    low, high = distance_bounds("nota", quiz.curve(RUN_ROUNDS))  # a nota não arredonda
    assert Decimal("0.10") < low < Decimal("0.11") and high == low * 3
    low, _ = distance_bounds("membros", quiz.curve(1))  # as razões, na escala do logaritmo
    assert low == Decimal(10).ln()


def test_the_distance_comes_down_in_random_steps():
    """A descida de cada dia (o usuário, 25/10/2026): cada rodada guarda uma parte sorteada do que
    faltava, a descida nunca volta, umas runs descem mais rápido que outras e a média de muitos
    dias é a curva."""
    # A média da parte guardada (a uniforme de `low` a 1) é a da curva, a menos do arredondamento.
    low = 2 * quiz.curve(2) - 1
    assert abs((1 + low) / 2 - quiz.curve(2)) < Decimal("1e-25")
    days = [quiz.day_left(EPOCH + timedelta(days=k)) for k in range(365)]
    for left in days:
        assert len(left) == RUN_ROUNDS and left[0] == 1
        assert all(a >= b > 0 for a, b in pairwise(left))
    for n in (2, 6, 12, 20):
        mean = sum(left[n - 1] for left in days) / len(days)
        assert abs(mean / quiz.curve(n) - 1) < Decimal("0.1"), n
    sixth = sorted(left[5] for left in days)
    assert sixth[0] < Decimal("0.3") and sixth[-1] > Decimal("0.55")  # depressa e devagar
    fast = min(days, key=lambda left: left[11])
    slow = max(days, key=lambda left: left[11])
    assert distance_bounds("ano", fast[11])[0] < distance_bounds("ano", slow[11])[0]


def test_round_sig_reads_like_the_screen():
    assert [round_sig(n) for n in (0, 7, 123_456, 2_349_999, 95)] == [0, 7, 120_000, 2_300_000, 95]


# --- a run de cada família (P376, P378, P382)


@pytest.mark.parametrize(("family_id", "param"), FAMILY_CASES)
def test_a_full_run_of_each_family(ctx, family_id, param):
    """A run inteira, com as regras de um dia: nada que a revelação já deixe deduzir (as duas
    músicas já reveladas, quando ela mostra o valor de cada uma; o mesmo grupo de pares ligados,
    quando mostra só a diferença), nenhuma música repetida nas propriedades, nenhuma resposta do
    Anime ou das Misturadas do dia, a resposta da direção, o dado da revelação e, sem afrouxar, a
    distância da curva. A conta das regras é refeita aqui, sem o `_Run`."""
    family = FAMILY_BY_ID[family_id]
    rounds = _run_of(ctx, family_id, param)
    assert len(rounds) == quiz.rounds_of(family)  # o acervo grande fecha a run inteira
    assert rounds[0][2] == 0  # e a 1ª rodada sai sem afrouxar
    excluded = ctx.excluded(EPOCH)
    day = {"direction": quiz.DIRECTIONS[family.kind][0], "param": param}
    seen: set[str] = set()
    groups: list[set[str]] = []
    for n, rnd, step in rounds:
        a, b = ctx.by_id[rnd["a"]], ctx.by_id[rnd["b"]]
        pair = {a.key, b.key}
        assert len(pair) == 2 and not pair & excluded, n
        assert quiz._round_answer_problem(ctx, family, day, rnd) is None, n
        if family.kind == "property":
            assert not pair & seen, n
        elif family.diff_only:
            assert not any(pair <= g for g in groups), n
        else:
            assert not pair <= seen, n
        seen |= pair
        joined = [g for g in groups if g & pair]
        groups = [g for g in groups if not g & pair] + [pair.union(*joined)]
        if family.kind == "compare" and step == 0:
            low, high = distance_bounds(family_id, quiz.day_left(EPOCH)[n - 1])
            assert low <= abs(ctx.value(family_id, a) - ctx.value(family_id, b)) <= high, n
        if family_id == "nota":
            assert Decimal(str(rnd["info"]["diff"])) == abs(a.mal.mean - b.mal.mean)  # exata
        if family_id == "membros":
            assert rnd["info"]["diff"] == round_sig(abs(a.mal.members - b.mal.members))
        # O número que qualquer pessoa entende, e não um nível (o usuário, 25/10/2026).
        if family_id == "ano":
            shown = [(s["year"], s["season"]) for s in rnd["info"]["seasons"]]
            assert shown == [(x.facts.year, SEASONS[x.facts.season]) for x in (a, b)]
        if family_id == "amq":
            assert rnd["info"]["rates"] == [float(a.facts.amq), float(b.facts.amq)]
        if family_id == "playlists":
            assert rnd["info"]["playlists"] == [a.facts.playlists, b.facts.playlists]


def test_a_comparison_waits_for_enough_songs_with_the_data(ctx):
    """O acervo real antes da carga com a temporada e os números exatos: só algumas músicas têm
    o dado, e a pergunta fica fora do pool até ter as da run inteira. As outras nunca entram."""
    catalog = _catalog()
    facts = _all_facts(catalog)
    keys = [t["songKey"] for t in catalog["tracks"]]
    few = {
        key: replace(fact, amq=None, season=None) if i >= 40 else fact
        for i, (key, fact) in enumerate(zip(keys, facts.values(), strict=True))
    }
    mixed = QuizContext(catalog, few, ctx.mal, ctx.anime_days, ctx.mixed_days)
    amq, ano = FAMILY_BY_ID["amq"], FAMILY_BY_ID["ano"]
    assert len(mixed.compare_pool("amq")) == 40 < mixed.need(amq)
    assert not quiz._available(mixed, amq, True) and not quiz._available(mixed, ano, True)
    assert quiz._available(mixed, FAMILY_BY_ID["playlists"], True)  # essa tem o dado em todas
    with_data = {s.key for _, s in mixed.compare_pool("amq")}
    assert with_data == set(keys[:40])


def test_the_answers_of_the_day_only_in_the_short_acervo():
    """O último nível do afrouxamento (uma resposta do Anime ou das Misturadas do dia) só existe
    no acervo curto, o das fixtures; no real, a run para antes (P378)."""
    family = FAMILY_BY_ID["ano"]
    for songs, short in ((SONGS, False), (60, True)):
        small = _context(songs=songs, days=1)
        assert small.short is short
        everything = frozenset(s.key for s in small.songs)
        record, step = quiz._round(small, family, None, "max", EPOCH, 1, quiz._Run(), everything)
        if short:
            assert record is not None and step == len(STEPS) - 1
        else:
            assert (record, step) == (None, -1)


# --- os dias (P376, P378)


def test_the_generation_is_deterministic(ctx):
    again = generate_quiz(ctx, None, EPOCH, EPOCH, horizon=27).schedule
    assert dumps(again) == dumps(generate_quiz(ctx, None, EPOCH, EPOCH, horizon=27).schedule)


def test_every_day_is_valid_and_full(ctx, schedule):
    assert validate_quiz_schedule(schedule, ctx) == []
    errors, warnings = quiz_rule_problems(schedule, ctx)
    assert errors == [] and warnings == []
    for day in schedule["days"].values():
        family = FAMILY_BY_ID[day["family"]]
        # O acervo grande fecha a run inteira: 50 rodadas, e 30 no especial.
        assert len(day["rounds"]) == (SPECIAL_ROUNDS if family.special else RUN_ROUNDS)
        assert day["mal"] is True


def test_the_floor_lifts_the_openings_above_the_draw(ctx, schedule):
    """O piso (o usuário, 26/10/2026) num acervo com a metade de aberturas: as runs juntas ficam
    acima dos 65%. Este acervo é feito para as regras, e não para o tipo: nele, abertura e
    encerramento se alternam pelos números, e nem sempre há par de aberturas na janela (a
    busca não afrouxa a curva pelo tipo). No acervo real de 26/10, o piso valeu em toda
    rodada; a pergunta do tema fica fora (uma de cada)."""
    songs = {s.id: s for s in ctx.songs}
    marks = [
        quiz._opening(songs[rnd[side]])
        for day in schedule["days"].values()
        if day["family"] != "tema"
        for rnd in day["rounds"]
        for side in ("a", "b")
    ]
    assert sum(marks) / len(marks) >= 0.65


def test_the_floor_asks_only_the_openings_it_needs():
    run = quiz._Run()
    assert (run.need(), run.floor((False, False))) == (2, (True, True))  # 1 de 2 é 50%
    run.songs, run.openings = 2, 2
    assert (run.need(), run.floor((False, False))) == (1, (True, False))  # 3 de 4 bastam
    assert run.floor((False, True)) == (False, True)  # o sorteio já deu uma
    run.songs, run.openings = 4, 4
    assert (run.need(), run.floor((False, False))) == (0, (False, False))  # 4 de 6 são 67%


def test_the_floor_takes_the_opening_on_either_side(ctx):
    """Quando a rodada pede uma abertura e a 1ª música não pode ser uma, a 2ª é: o par conta."""
    opening = next(s for s in ctx.songs if quiz._opening(s))
    ending = next(s for s in ctx.songs if not quiz._opening(s))
    assert quiz._fit(ending, [opening, ending], True, False, 1) == (True, 1)
    assert quiz._fit(ending, [ending], True, False, 1) == (False, 1)
    assert quiz._want_b(ending, False, 1) is True
    assert quiz._want_b(opening, False, 1) is False


def test_without_a_song_of_the_drawn_type_any_one_serves(ctx):
    endings = [s for s in ctx.songs if not quiz._opening(s)][:3]
    openings = [s for s in ctx.songs if quiz._opening(s)][:3]
    rng = seeded("musicle-jp|teste")
    tried = quiz._candidates([*endings, *openings], True, rng)
    assert [quiz._opening(s) for s in tried] == [True, True, True, False, False, False]
    assert quiz._partner(endings, True, rng) in endings
    assert quiz._partner([*endings, openings[0]], True, rng) == openings[0]


def test_no_answer_of_the_anime_or_the_misturadas_of_the_day(ctx, schedule):
    for where, day in schedule["days"].items():
        excluded = ctx.excluded(date.fromisoformat(where))
        for rnd in day["rounds"]:
            assert ctx.by_id[rnd["a"]].key not in excluded
            assert ctx.by_id[rnd["b"]].key not in excluded


def _day(family: str, direction: str, pairs: list[tuple[int, int]]) -> JSON:
    rounds = [{"a": f"x:tr:t{a:04d}", "b": f"x:tr:t{b:04d}", "answer": "a"} for a, b in pairs]
    return {"catalogVersion": VERSION, "family": family, "direction": direction, "rounds": rounds}


def test_the_check_sees_a_deducible_pair_even_without_the_mal(ctx):
    """O par deduzível é erro na conferência, e ela só lê as chaves: vale também nos dias do MAL
    sem os dados dele. Fora do dia 1º (as respostas do dia) e com faixas de anos diferentes."""
    blind = QuizContext(_catalog(), _all_facts(_catalog()), None, ctx.anime_days, ctx.mixed_days)
    where = _days(EPOCH, 70)[-1]
    # A nota mostra só a diferença: 40 × 41 e 41 × 42 já dão 40 × 42.
    nota = _day("nota", "max", [(40, 41), (41, 42), (40, 42)])
    found = quiz._day_rule_problems(where, nota, blind)
    assert found == [f"{where} rodada 3: par que a run já deixa deduzir"]
    # O ano mostra o valor de cada uma: 40 e 42 já saíram (com outras), e o par sai de graça.
    ano = _day("ano", "max", [(40, 41), (42, 43), (40, 42)])
    found = quiz._day_rule_problems(where, ano, ctx)
    assert f"{where} rodada 3: par que a run já deixa deduzir" in found
    assert not any("rodada 1" in p or "rodada 2" in p for p in found if "deduzir" in p)


def test_the_check_sees_a_wrong_number_in_the_reveal(ctx, schedule):
    """A conferência compara o dado da revelação com os fatos, e não só a chave dele."""
    where = min(w for w, day in schedule["days"].items() if "info" in day["rounds"][0])
    day = copy.deepcopy(schedule["days"][where])
    assert quiz._day_rule_problems(where, day, ctx) == []
    day["rounds"][0]["info"] = {"themes": ["OP9", "ED9"]}  # nenhuma música do acervo é OP9
    found = quiz._day_rule_problems(where, day, ctx)
    assert found == [f"{where} rodada 1: o dado da revelação não bate com os fatos"]


# --- o pool, o cooldown e os especiais (P381)


def test_the_cooldown_holds(schedule):
    last: dict[str, date] = {}
    labels: list[str] = []
    for where, day in sorted(schedule["days"].items()):
        family = FAMILY_BY_ID[day["family"]]
        d = date.fromisoformat(where)
        if not family.special and family.id in last:
            assert (d - last[family.id]).days >= family.cooldown, (where, family.id)
        last[family.id] = d
        if family.id == "rotulo":
            labels.append(day["param"])
    # O mesmo rótulo espera 60 dias: os 8 primeiros não repetem (depois, a reserva repete o mais
    # antigo), e a lista de fora (Q.2) nunca entra.
    assert labels and len(set(labels[:8])) == len(labels[:8])
    assert "Gore" not in labels


def test_a_parameter_comes_back_only_after_the_others():
    ctx = _context(days=1)
    ano_x, rotulo = FAMILY_BY_ID["ano_x"], FAMILY_BY_ID["rotulo"]
    years = ctx.params(ano_x)
    used = {("ano_x", y): EPOCH + timedelta(days=i) for i, y in enumerate(years)}
    later = EPOCH + timedelta(days=60)
    # O especial roda em ciclo: todos já saíram, volta o mais antigo; um que nunca saiu vem antes.
    history = quiz._History(param=dict(used))
    assert quiz._param(ctx, ano_x, history, later, seeded("t")) == years[0]
    del history.param["ano_x", years[3]]
    assert quiz._param(ctx, ano_x, history, later, seeded("t")) == years[3]
    # O rótulo todo em cooldown (60 dias): a reserva é o parado há mais tempo.
    labels = ctx.params(rotulo)
    recent = {("rotulo", g): later - timedelta(days=len(labels) - i) for i, g in enumerate(labels)}
    assert quiz._param(ctx, rotulo, quiz._History(param=recent), later, seeded("t")) == labels[0]


def test_with_every_family_in_cooldown_the_oldest_comes_back():
    regular = list(quiz.FAMILIES)
    d = EPOCH + timedelta(days=10)
    # Todas saíram há 1 ou 2 dias, dentro do cooldown: volta a de 2 dias (a 1ª, no empate).
    last = {f.id: d - timedelta(days=1 + i % 2) for i, f in enumerate(regular)}
    assert quiz._ready(regular, quiz._History(family=last), d) == [regular[1]]


def test_an_acervo_without_any_question_is_an_error():
    catalog = _catalog()
    bare = {
        key: replace(fact, year=None, amq=None, playlists=None, theme=None)
        for key, fact in _all_facts(catalog).items()
    }
    days = _context(days=1)
    empty = QuizContext(catalog, bare, None, days.anime_days, days.mixed_days)
    with pytest.raises(ScheduleError, match="nenhuma pergunta possível"):
        generate_quiz(empty, None, EPOCH, EPOCH, horizon=0)


def test_one_special_a_week_without_repeating_the_type(schedule):
    specials = [
        (date.fromisoformat(w), day)
        for w, day in sorted(schedule["days"].items())
        if FAMILY_BY_ID[day["family"]].special
    ]
    weeks = [d.isocalendar().week for d, _ in specials]
    assert len(specials) == 4 and len(set(weeks)) == 4  # as 4 semanas, uma cada
    for d, _ in specials:
        assert d.weekday() == special_weekday(d)
    types = [day["family"] for _, day in specials]
    assert all(a != b for a, b in pairwise(types))
    params = [(day["family"], day["param"]) for _, day in specials]
    assert len(params) == len(set(params))  # o mesmo estúdio ou ano, só depois do ciclo


def test_a_week_that_starts_after_its_special_day_has_none(ctx):
    """A agenda que nasce depois do dia do especial da semana fica sem ele nessa semana."""
    start = next(
        d
        for d in (EPOCH + timedelta(days=k) for k in range(60))
        if d.weekday() == 6 and special_weekday(d) < 6
    )
    days = generate_quiz(ctx, None, start, start, horizon=0).schedule["days"]
    assert not FAMILY_BY_ID[days[start.isoformat()]["family"]].special


def test_without_the_mal_only_the_repository_families():
    ctx = _context(mal=False, days=30)
    result = generate_quiz(ctx, None, EPOCH, EPOCH, horizon=20)
    assert any("sem os dados do MAL" in w for w in result.warnings)
    for day in result.schedule["days"].values():
        assert not FAMILY_BY_ID[day["family"]].needs_mal and day["mal"] is False


def test_the_mal_families_come_from_the_day_flag_alone(ctx):
    """A conferência sem os dados do MAL tem de chegar à lista de famílias da geração (P380): a
    família do MAL entra só pelo `mal` do dia, e o dado que falta para a geração com erro, em vez
    de mudar a lista."""
    catalog = _catalog()
    mal = {k: replace(v, studios=frozenset()) for k, v in ctx.mal.items()}
    no_studios = QuizContext(catalog, _all_facts(catalog), mal, ctx.anime_days, ctx.mixed_days)
    estudio = FAMILY_BY_ID["estudio"]
    assert quiz._available(no_studios, estudio, True)
    assert not quiz._available(no_studios, estudio, False)
    with pytest.raises(ScheduleError, match="estudio sem nenhum parâmetro"):
        quiz._param(no_studios, estudio, quiz._History(), EPOCH, seeded("t"))


def test_the_quiz_needs_the_anime_and_the_misturadas_of_the_day():
    ctx = _context(days=3)
    # O horizonte não passa do último dia das duas agendas.
    result = generate_quiz(ctx, None, EPOCH, EPOCH, horizon=10)
    assert sorted(result.schedule["days"]) == _days(EPOCH, 3)
    del ctx.mixed_days[_days(EPOCH, 3)[1]]
    with pytest.raises(ScheduleError, match="Misturadas"):
        generate_quiz(ctx, None, EPOCH, EPOCH, horizon=2)


def test_a_bad_parameter_is_refused(ctx, schedule):
    where = min(schedule["days"])
    day = schedule["days"][where]
    for family, param, expected in (
        ("rotulo", 5, "o parâmetro de rotulo deveria ser um texto"),
        ("fonte", "anime", "fonte desconhecida: anime"),
    ):
        bad = {**day, "family": family, "direction": "tem", "param": param, "mal": True}
        found = validate_quiz_schedule({**schedule, "days": {where: bad}}, ctx)
        assert f"{where}: {expected}" in found


# --- os arquivos por mês (P379)


def test_the_months_split_and_merge(schedule):
    files = split_months(schedule)
    assert sorted(files) == ["2026-10.json", "2026-11.json"]
    assert all(
        set(f["days"]) <= {d for d in f["days"] if d[:7] == f["month"]} for f in files.values()
    )
    merged, problems = merge_months(files)
    assert problems == [] and merged == schedule


def test_a_bad_month_is_refused(schedule):
    files = copy.deepcopy(split_months(schedule))
    files["2026-11.json"]["month"] = "2026-12"
    files["2026-10.json"]["epoch"] = "2026-10-06"
    files["outro.json"] = files["2026-10.json"]
    _, problems = merge_months(files)
    text = "\n".join(problems)
    assert "o mês do arquivo é 2026-12" in text
    assert "dias fora do mês" in text
    assert "cabeçalho difere" in text
    assert "AAAA-MM.json" in text


def test_the_folder_grows_month_by_month(tmp_path, schedule):
    out = tmp_path / QUIZ_DIR
    assert sorted(write_quiz_dir(out, schedule)) == ["2026-10.json", "2026-11.json"]
    assert write_quiz_dir(out, schedule) == []  # nada mudou
    read, problems = read_quiz_dir(out)
    assert problems == [] and read == schedule
    # Em bytes: o write_text do Windows trocaria o \n e a codificação.
    text = dumps(read_json(out / "2026-10.json")).replace("\n", "\r\n")
    (out / "2026-10.json").write_bytes(text.encode("utf-8"))
    _, problems = read_quiz_dir(out)
    assert any("forma canônica" in p for p in problems)


def test_the_folder_holds_only_the_months(tmp_path, schedule):
    out = tmp_path / QUIZ_DIR
    write_quiz_dir(out, schedule)
    (out / ".gitkeep").write_bytes(b"")
    (out / "2026-12.json").mkdir()
    read, problems = read_quiz_dir(out)
    assert read == schedule  # os meses de verdade continuam lidos
    assert sorted(p.split(":")[0] for p in problems) == [".gitkeep", "2026-12.json"]


def test_a_git_folder_with_other_things_is_reported():
    """O read_quiz_ref numa revisão de verdade: uma pasta sem mês nenhum (e com subpastas) dá
    os problemas, e não um traceback. Revisão inexistente é erro."""
    found, problems = read_quiz_ref("HEAD", "pipeline/fixtures")
    assert found is None and problems
    assert all("só cabem os meses" in p for p in problems)
    with pytest.raises(ScheduleError, match="inexistente"):
        read_quiz_ref("nao-existe-esta-revisao", "pipeline/fixtures")


def test_growing_keeps_every_day(ctx, schedule):
    later = generate_quiz(ctx, schedule, EPOCH + timedelta(days=28), horizon=6).schedule
    assert all(later["days"][d] == day for d, day in schedule["days"].items())
    assert len(later["days"]) == len(schedule["days"]) + 7


# --- a conferência (P380)


def _grown(ctx: QuizContext, base: JSON) -> JSON:
    return generate_quiz(ctx, base, EPOCH + timedelta(days=28), horizon=6).schedule


def test_the_new_days_are_regenerated(ctx, schedule):
    current = _grown(ctx, schedule)
    assert quiz_regenerate_problems(schedule, current, ctx) == []
    edited = copy.deepcopy(current)
    day = edited["days"][max(edited["days"])]
    day["rounds"][3]["answer"] = "b" if day["rounds"][3]["answer"] == "a" else "a"
    assert quiz_regenerate_problems(schedule, edited, ctx)


def test_without_the_mal_data_the_check_sees_only_the_question(ctx, schedule):
    current = _grown(ctx, schedule)
    catalog = _catalog()
    blind = QuizContext(catalog, _all_facts(catalog), None, ctx.anime_days, ctx.mixed_days)
    assert quiz_regenerate_problems(schedule, current, blind) == []
    added = sorted(set(current["days"]) - set(schedule["days"]))
    mal_days = [d for d in added if FAMILY_BY_ID[current["days"][d]["family"]].needs_mal]
    assert mal_days, "a semana nova deveria ter uma pergunta do MAL"
    edited = copy.deepcopy(current)
    edited["days"][mal_days[0]]["rounds"][0]["answer"] = "a"  # as rodadas do MAL: sem conferir
    edited["days"][mal_days[0]]["rounds"][0]["a"] = edited["days"][mal_days[0]]["rounds"][1]["a"]
    assert quiz_regenerate_problems(schedule, edited, blind) == []
    edited["days"][mal_days[0]]["direction"] = (
        "max" if current["days"][mal_days[0]]["direction"] != "max" else "min"
    )
    assert quiz_regenerate_problems(schedule, edited, blind)  # a pergunta, sim


# --- a CLI, com as fixtures


def _fixture_anime(tmp_path: Path) -> Path:
    """Uma cópia da pasta do Anime fictício (o catálogo e as duas agendas), sem o quiz."""
    anime = tmp_path / "anime"
    anime.mkdir()
    for name in ("catalog.json", "schedule.json", MIXED_FILE):
        shutil.copyfile(anime_paths("fixture").public_dir / name, anime / name)
    return anime


def _fixture_quiz(anime: Path) -> tuple[JSON, JSON]:
    """Uma base de 5 dias e a mesma agenda crescida 4 dias, geradas em memória: nenhum teste
    regera a agenda fictícia versionada (ME51), e uma regra nova muda só os dias novos."""
    catalog = read_json(anime / "catalog.json")
    ctx = cli._quiz_context("fixture", catalog, anime / "schedule.json", anime / MIXED_FILE, None)
    base = generate_quiz(ctx, None, date(2026, 10, 8), date(2026, 10, 8), horizon=4).schedule
    return base, generate_quiz(ctx, base, date(2026, 10, 13), horizon=3).schedule


def test_the_command_writes_the_months(tmp_path, capsys):
    out = tmp_path / "quiz"
    args = ["schedule-quiz", "--provider", "fixture", "--today", "2026-10-08"]
    assert main([*args, "--epoch", "2026-10-08", "--days", "5", "--out-dir", str(out)]) == 0
    assert sorted(p.name for p in out.iterdir()) == ["2026-10.json"]
    assert "6 dia(s) novo(s)" in capsys.readouterr().out
    assert main([*args, "--days", "5", "--out-dir", str(out)]) == 0
    assert "sem mudanças" in capsys.readouterr().out


@pytest.mark.parametrize("seed", ["1", "2"])
def test_the_quiz_bytes_do_not_depend_on_hash_seed(tmp_path, seed):
    """A regra 1 do pipeline: a ordem de um set muda com o PYTHONHASHSEED, e os bytes não."""
    args = ["schedule-quiz", "--provider", "fixture", "--today", "2026-10-08"]
    args += ["--epoch", "2026-10-08", "--days", "10"]
    out = tmp_path / "quiz"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", *args, "--out-dir", str(out)]
    subprocess.run(cmd, check=True, env=env, capture_output=True)
    reference = tmp_path / "reference"
    assert main([*args, "--out-dir", str(reference)]) == 0
    assert (out / "2026-10.json").read_bytes() == (reference / "2026-10.json").read_bytes()


def test_the_command_refuses_another_providers_folder(capsys):
    target = anime_paths("apple").public_dir / QUIZ_DIR
    args = [
        "schedule-quiz",
        "--provider",
        "fixture",
        "--today",
        "2026-10-08",
        "--out-dir",
        str(target),
    ]
    assert main(args) == 1
    assert "grava em" in capsys.readouterr().err


def test_the_committed_fixture_quiz_is_valid():
    assert main(["validate-anime", "--provider", "fixture"]) == 0


def test_validate_anime_needs_the_agendas_beside_the_quiz(tmp_path, capsys):
    anime = _fixture_anime(tmp_path)
    write_quiz_dir(anime / QUIZ_DIR, _fixture_quiz(anime)[1])
    args = ["validate-anime", "--provider", "fixture", "--path", str(anime / "catalog.json")]
    assert main(args) == 0
    capsys.readouterr()
    (anime / MIXED_FILE).unlink()
    assert main(args) == 1
    assert "sem a agenda das Misturadas ao lado" in capsys.readouterr().err
    (anime / "schedule.json").unlink()
    assert main(args) == 1
    assert "sem a agenda do Anime ao lado" in capsys.readouterr().err


def test_the_check_of_a_quiz_folder(tmp_path, capsys):
    """O schedule-check de uma pasta de meses avulsa: só cresceu (e os dias novos são os do
    gerador), ou quebrou (um dia novo editado; um dia da base alterado)."""
    anime = _fixture_anime(tmp_path)
    base, grown = _fixture_quiz(anime)
    write_quiz_dir(tmp_path / "base", base)
    write_quiz_dir(anime / QUIZ_DIR, grown)
    args = ["schedule-check", "--path", str(anime / QUIZ_DIR), "--base", str(tmp_path / "base")]
    assert main(args) == 0
    assert "OK (5 dia(s) da base preservados, 9 no total)" in capsys.readouterr().out
    edited = copy.deepcopy(grown)
    rnd = edited["days"]["2026-10-15"]["rounds"][0]
    rnd["answer"] = "b" if rnd["answer"] == "a" else "a"
    write_quiz_dir(anime / QUIZ_DIR, edited)
    assert main(args) == 1
    assert "2026-10-15: dia novo diferente do que o gerador daria" in capsys.readouterr().out
    edited = copy.deepcopy(grown)
    day = edited["days"]["2026-10-09"]
    day["direction"] = {"max": "min", "min": "max", "tem": "nao", "nao": "tem"}[day["direction"]]
    write_quiz_dir(anime / QUIZ_DIR, edited)
    assert main(args) == 1
    assert "2026-10-09: dia alterado" in capsys.readouterr().out


def test_the_redo_exception_of_the_quiz(tmp_path, capsys):
    """A exceção à regra 4 (o usuário, 25/10/2026): os dias desde a data saem da base e são
    conferidos como novos (o gerador e o P44); só depois do --today, e com um dia antes dela."""
    anime = _fixture_anime(tmp_path)
    _, grown = _fixture_quiz(anime)
    old = copy.deepcopy(grown)  # a base com um dia futuro de outro gerador
    rnd = old["days"]["2026-10-15"]["rounds"][0]
    rnd["answer"] = "b" if rnd["answer"] == "a" else "a"
    write_quiz_dir(tmp_path / "base", old)
    write_quiz_dir(anime / QUIZ_DIR, grown)
    args = ["schedule-check", "--path", str(anime / QUIZ_DIR), "--base", str(tmp_path / "base")]
    assert main([*args, "--today", "2026-10-13"]) == 1
    assert "2026-10-15: dia alterado" in capsys.readouterr().out
    redo = [*args, "--quiz-redo-from", "2026-10-14"]
    assert main([*redo, "--today", "2026-10-13"]) == 0
    assert "os dias desde 2026-10-14 conferidos como novos" in capsys.readouterr().out
    # O dia refeito tem de ser o do gerador.
    edited = copy.deepcopy(grown)
    edited["days"]["2026-10-15"] = old["days"]["2026-10-15"]
    write_quiz_dir(anime / QUIZ_DIR, edited)
    assert main([*redo, "--today", "2026-10-13"]) == 1
    assert "2026-10-15: dia novo diferente do que o gerador daria" in capsys.readouterr().out
    # Nunca o dia de hoje: na data, a exceção vence, e a conferência é a de sempre.
    write_quiz_dir(anime / QUIZ_DIR, grown)
    assert main([*redo, "--today", "2026-10-14"]) == 1
    out = capsys.readouterr().out
    assert "a exceção do --quiz-redo-from venceu" in out
    assert "2026-10-15: dia alterado" in out
    # Nem sem o --today, nem a agenda inteira.
    assert main(redo) == 1
    assert "precisa do --today" in capsys.readouterr().out
    assert main([*args, "--quiz-redo-from", "2026-10-08", "--today", "2026-10-07"]) == 1
    assert "precisa de um dia da base antes de 2026-10-08" in capsys.readouterr().out


def test_a_deleted_quiz_folder_and_a_file_base_are_refused(tmp_path, capsys):
    anime = _fixture_anime(tmp_path)
    base, _ = _fixture_quiz(anime)
    write_quiz_dir(tmp_path / "base", base)
    gone = anime / QUIZ_DIR  # nunca gravada aqui: a da base sumiu
    assert main(["schedule-check", "--path", str(gone), "--base", str(tmp_path / "base")]) == 1
    assert "foi apagada" in capsys.readouterr().out
    write_quiz_dir(gone, base)
    lone = tmp_path / "base.json"
    lone.write_bytes(b"{}")
    assert main(["schedule-check", "--path", str(gone), "--base", str(lone)]) == 1
    assert "uma pasta de meses, não um arquivo" in capsys.readouterr().out


# --- O bônus de estreia (o usuário, 25/10/2026) ------------------------------------------------

DEBUT = date(2026, 10, 8)


def _bonus_ctx(mal: bool = True) -> quiz.QuizContext:
    """O contexto das fixtures publicadas, com os dados do MAL inventados ou sem eles."""
    public = anime_paths("fixture").public_dir
    catalog = read_json(public / "catalog.json")
    ctx = cli._quiz_context("fixture", catalog, public / "schedule.json", public / MIXED_FILE, None)
    if mal:
        return ctx
    facts = quiz.song_facts("fixture", ANIME_PROVIDERS["fixture"]().source())
    return quiz.QuizContext(catalog, facts, None, ctx.anime_days, ctx.mixed_days)


def test_the_debut_bonus_has_three_other_questions():
    ctx = _bonus_ctx()
    bonus = quiz.generate_bonus(ctx, DEBUT, "playlists")
    assert [r["family"] for r in bonus["rounds"]] == ["ano", "tema", "nota"]
    assert bonus["kind"] == "anime-quiz-bonus"
    assert bonus["date"] == "2026-10-08"
    assert bonus["mal"] is True
    assert bonus["catalogVersion"] == ctx.version
    assert quiz.validate_quiz_bonus(bonus, ctx) == []
    # Determinístico: a mesma semente dá o mesmo bônus.
    assert quiz.generate_bonus(_bonus_ctx(), DEBUT, "playlists") == bonus


def test_the_bonus_skips_the_day_question_and_the_mal_ones_without_the_mal_data():
    with_day = quiz.generate_bonus(_bonus_ctx(), DEBUT, "ano")
    assert [r["family"] for r in with_day["rounds"]] == ["tema", "nota", "amq"]
    ctx = _bonus_ctx(mal=False)
    without = quiz.generate_bonus(ctx, DEBUT, "playlists")
    families = [r["family"] for r in without["rounds"]]
    assert not any(quiz.FAMILY_BY_ID[f].needs_mal for f in families)
    assert without["mal"] is False
    assert quiz.validate_quiz_bonus(without, ctx) == []


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ("answer", "a resposta não é a da direção do dia"),
        ("track", "faixa inexistente ou repetida"),
        ("family", "duas rodadas com a mesma pergunta"),
        ("direction", "não serve a ano"),
        ("key", "schema:"),
        ("info", "o dado da revelação não bate com os fatos"),
    ],
)
def test_the_bonus_check_refuses_a_broken_round(change, message):
    ctx = _bonus_ctx()
    bonus = copy.deepcopy(quiz.generate_bonus(ctx, DEBUT, "playlists"))
    first = bonus["rounds"][0]  # o ano
    if change == "answer":
        first["answer"] = "b" if first["answer"] == "a" else "a"
    elif change == "track":
        first["b"] = "fixture:tr:nao-existe"
    elif change == "family":
        bonus["rounds"][1] = copy.deepcopy(first)
    elif change == "direction":
        first["direction"] = "tem"
    elif change == "key":
        first["extra"] = 1
    else:
        first["info"]["seasons"][0]["year"] -= 1
    problems = quiz.validate_quiz_bonus(bonus, ctx)
    assert any(message in p for p in problems), problems


def test_the_committed_fixture_bonus_is_the_generators_for_the_first_day():
    public = anime_paths("fixture").public_dir
    committed = public / "quiz-bonus.json"
    month = read_json(public / QUIZ_DIR / "2026-10.json")
    again = quiz.generate_bonus(_bonus_ctx(), DEBUT, month["days"]["2026-10-08"]["family"])
    assert committed.read_bytes() == dumps(again).encode("utf-8")


def test_the_bonus_command_needs_the_day_in_the_quiz_agenda(capsys):
    assert main(["quiz-bonus", "--provider", "fixture", "--date", "2026-12-01"]) == 1
    assert "o dia não está na agenda do quiz" in capsys.readouterr().err
