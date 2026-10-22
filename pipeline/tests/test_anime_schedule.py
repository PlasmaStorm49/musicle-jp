"""A agenda do Anime (M14, PR A2): os 6 diários de cada dia, a janela por dificuldade entre os
modos, a franquia, a preferência pelas mais antigas, os pesos do tipo do tema, a P44, o só
acréscimo e o regenerar dos dias novos (ME51)."""

from __future__ import annotations

import copy
import os
import subprocess
import sys
from collections.abc import Callable, Mapping
from datetime import date, timedelta

import pytest

from musicle_pipeline import anime_schedule
from musicle_pipeline.anime import MODES, TIERS
from musicle_pipeline.anime_schedule import (
    DAILY_PER_TIER,
    FRANCHISE_DAYS,
    WINDOWS,
    _History,
    _oldest_third,
    generate_anime,
    pool_sizes,
    rule_problems,
    short_pools,
    theme_type,
    validate_anime_schedule,
    window_of,
)
from musicle_pipeline.cli import main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import anime_paths, provider_paths
from musicle_pipeline.schedule import ScheduleError, compare, regenerate_problems

EPOCH = date(2026, 10, 8)
VERSION = "2026-10-08.0000abcd"
# O mínimo da P235: 6 × K músicas por dificuldade (3 por dia em cada um dos 2 modos).
MINIMUM = {tier: DAILY_PER_TIER * WINDOWS[tier] for tier in TIERS}


def track(
    n: int,
    musica: str | None,
    titulo: str | None,
    *,
    franchise: str | None = None,
    kind: str = "OP",
    eligible: bool = True,
) -> JSON:
    """Uma faixa sintética, só com o que a agenda lê."""
    return {
        "id": f"x:tr:t{n:04d}",
        "songKey": f"song {n}|x:ar:a{n:04d}",
        "eligible": {"daily": True, "reason": None}
        if eligible
        else {"daily": False, "reason": "blocked"},
        "anime": {
            "franchiseIds": [f"anime:fr:{franchise or f'f{n:04d}'}"],
            "themes": [{"anime": f"Anime {n}", "type": kind, "sequence": 1}],
            "tiers": {"musica": musica, "titulo": titulo},
        },
    }


def catalog_of(tracks: list[JSON], version: str = VERSION) -> JSON:
    fids = sorted({f for t in tracks for f in t["anime"]["franchiseIds"]})
    return {
        "catalogVersion": version,
        "franchises": [{"id": f, "name": f, "search": [f]} for f in fids],
        "tracks": sorted(tracks, key=lambda t: t["id"]),
    }


def shared(
    per_tier: Mapping[str, int],
    franchise: Callable[[int, str], str | None] = lambda n, tier: None,
    kind: Callable[[int, str], str] = lambda n, tier: "OP",
) -> JSON:
    """Um acervo em que cada faixa tem a mesma dificuldade nos dois modos (o caso comum: os dois
    diários de uma dificuldade tiram do mesmo grupo de músicas)."""
    tracks = []
    for tier in TIERS:
        for _ in range(per_tier[tier]):
            n = len(tracks)
            tracks.append(track(n, tier, tier, franchise=franchise(n, tier), kind=kind(n, tier)))
    return catalog_of(tracks)


def check_rules(schedule: JSON, catalog: JSON) -> None:
    """As regras da geração, conferidas por fora, dia a dia: a faixa do diário, nenhuma música
    repetida nos 18, nenhuma franquia repetida no diário do titulo e a janela de cada
    dificuldade, contando os usos em qualquer diário dos dois modos (P245)."""
    tracks = {t["id"]: t for t in catalog["tracks"]}
    windows = {key: window_of(key[1], n) for key, n in pool_sizes(catalog).items()}
    last: dict[str, date] = {}
    for day_str in sorted(schedule["days"]):
        d = date.fromisoformat(day_str)
        day = schedule["days"][day_str]
        songs = []
        for mode in MODES:
            for tier in TIERS:
                answers = [tracks[r["answer"]] for r in day[mode][tier]]
                assert len(answers) == 3
                for t in answers:
                    assert t["eligible"]["daily"], (day_str, t["id"])
                    assert t["anime"]["tiers"][mode] == tier, (day_str, mode, tier, t["id"])
                    previous = last.get(t["songKey"])
                    gap = None if previous is None else (d - previous).days
                    assert gap is None or gap >= windows[mode, tier], (day_str, mode, tier, gap)
                if mode == "titulo":
                    franchises = [f for t in answers for f in t["anime"]["franchiseIds"]]
                    assert len(franchises) == len(set(franchises)), (day_str, tier)
                songs += [t["songKey"] for t in answers]
        assert len(songs) == len(set(songs)) == 18, day_str
        for song in songs:
            last[song] = d


def answers_of(day: JSON) -> list[str]:
    return [r["answer"] for mode in MODES for tier in TIERS for r in day[mode][tier]]


# --- os 61 dias, a janela e o dia -------------------------------------------------------------


@pytest.fixture(scope="module")
def minimum():
    return shared(MINIMUM)


@pytest.fixture(scope="module")
def sixty_one_days(minimum):
    # Hoje = epoch e horizonte de 60: os mesmos 61 dias de gerar aos poucos (cada dia só
    # depende dos anteriores), sem gerar dia passado (P44).
    return generate_anime(minimum, None, EPOCH, EPOCH, horizon=60)


def test_sixty_one_days_without_relaxing_with_the_minimum_of_p235(sixty_one_days, minimum):
    # 6 × K por dificuldade, cada faixa na mesma dificuldade nos dois modos: a janela K inteira
    # cabe, sem afrouxar nada, e o acervo não é curto.
    days = sixty_one_days.schedule["days"]
    assert (len(days), min(days), max(days)) == (61, "2026-10-08", "2026-12-07")
    assert sixty_one_days.relaxations == []
    assert short_pools(minimum) == []
    assert days["2026-10-08"]["number"] == 1
    assert set(days["2026-10-08"]) == {"number", "catalogVersion", "musica", "titulo"}
    assert validate_anime_schedule(sixty_one_days.schedule, minimum) == []
    assert rule_problems(sixty_one_days.schedule, minimum) == ([], [])
    check_rules(sixty_one_days.schedule, minimum)


def test_the_header_marks_the_anime_schedule(sixty_one_days):
    schedule = sixty_one_days.schedule
    assert {k: v for k, v in schedule.items() if k != "days"} == {
        "schemaVersion": 1,
        "kind": "anime",
        "timezone": "America/Sao_Paulo",
        "epoch": "2026-10-08",
    }


def test_a_song_comes_back_exactly_after_its_window(sixty_one_days, minimum):
    # Com o mínimo, as músicas de uma dificuldade que voltam são as de K dias atrás: hoje conta
    # como um dos K dias.
    tracks = {t["id"]: t for t in minimum["tracks"]}
    days = sixty_one_days.schedule["days"]

    def songs(day_str: str, tier: str) -> set[str]:
        return {tracks[r["answer"]]["songKey"] for m in MODES for r in days[day_str][m][tier]}

    for tier in TIERS:
        back = (EPOCH + timedelta(days=WINDOWS[tier])).isoformat()
        assert songs(back, tier) == songs("2026-10-08", tier), tier


def test_the_window_counts_both_modes_and_each_tier():
    # Cada faixa numa dificuldade em cada modo (a música do Fácil no musica pode ser do Difícil
    # no titulo): a janela da dificuldade do diário conta os usos em qualquer diário.
    tracks = [track(n, TIERS[n % 3], TIERS[(n // 3) % 3]) for n in range(1260)]
    catalog = catalog_of(tracks)
    result = generate_anime(catalog, None, EPOCH, EPOCH, horizon=60)
    assert result.relaxations == []
    check_rules(result.schedule, catalog)
    by_id = {t["id"]: t for t in tracks}
    modes: dict[str, set[str]] = {}
    for day in result.schedule["days"].values():
        for mode in MODES:
            for tier in TIERS:
                for r in day[mode][tier]:
                    modes.setdefault(by_id[r["answer"]]["songKey"], set()).add(mode)
    # O caso que a janela entre os modos protege aconteceu: a mesma música nos dois modos.
    assert any(found == set(MODES) for found in modes.values())


def test_the_franchise_never_repeats_in_the_titulo_diary_and_is_spaced_between_days():
    # Franquias grandes (6 músicas cada, como um Conan pequeno): dentro do diário do titulo
    # nunca repetem, e entre dias ficam espaçadas, sem afrouxar, porque sobra acervo.
    catalog = shared(
        {tier: 2 * MINIMUM[tier] for tier in TIERS},
        franchise=lambda n, tier: f"big{n // 6:03d}",
    )
    result = generate_anime(catalog, None, EPOCH, EPOCH, horizon=40)
    assert result.relaxations == []
    check_rules(result.schedule, catalog)
    tracks = {t["id"]: t for t in catalog["tracks"]}
    last: dict[str, date] = {}
    for day_str in sorted(result.schedule["days"]):
        d = date.fromisoformat(day_str)
        used = [tracks[a] for a in answers_of(result.schedule["days"][day_str])]
        for t in used:
            for f in t["anime"]["franchiseIds"]:
                assert f not in last or (d - last[f]).days >= FRANCHISE_DAYS, (day_str, f)
        for t in used:
            for f in t["anime"]["franchiseIds"]:
                last[f] = d


def test_the_franchise_spacing_is_the_first_rule_to_relax():
    # 3 franquias por dificuldade: no 2º dia, todas saíram ontem. O espaçamento afrouxa (nível
    # 1, com registro), e a janela das músicas fica.
    catalog = shared({tier: 18 for tier in TIERS}, franchise=lambda n, tier: f"{tier}{n % 3}")
    result = generate_anime(catalog, None, EPOCH, EPOCH, horizon=1)
    assert result.relaxations
    assert all(r.startswith("2026-10-09") for r in result.relaxations)
    assert all("nível 1 (sem espaçar a franquia)" in r for r in result.relaxations)
    check_rules(result.schedule, catalog)


def test_a_short_agenda_with_18_per_tier_does_not_repeat():
    # A carga de teste (P255): ~18 por dificuldade dão 3 dias sem repetir (hoje, amanhã e a
    # margem da meia-noite), com a janela encolhida para 3.
    catalog = shared({tier: 18 for tier in TIERS})
    result = generate_anime(catalog, None, EPOCH, EPOCH, horizon=2)
    days = result.schedule["days"]
    assert len(days) == 3
    assert result.relaxations == []
    songs = [a for day in days.values() for a in answers_of(day)]
    assert len(songs) == len(set(songs)) == 54
    warnings = short_pools(catalog)
    assert len(warnings) == 6
    assert "musica facil: 18 música(s), menos de 6 × 21 = 126 (P235)" in warnings[0]
    assert all(w.endswith("a janela cai para 3 dia(s)") for w in warnings)


def test_a_diary_without_candidates_is_an_error():
    # 2 músicas no Difícil não fazem um diário de 3 rodadas (a música do dia nunca repete).
    catalog = shared({"facil": 18, "medio": 18, "dificil": 2})
    with pytest.raises(ScheduleError, match="sem faixa possível para musica dificil, rodada 3"):
        generate_anime(catalog, None, EPOCH, EPOCH, horizon=0)


def test_ineligible_and_other_tiers_stay_out():
    tracks = [track(n, "facil", "facil") for n in range(30)]
    tracks += [track(100 + n, "facil", "facil", eligible=False) for n in range(30)]
    tracks += [track(200 + n, "medio", "medio") for n in range(18)]
    tracks += [track(250 + n, "dificil", "dificil") for n in range(18)]
    tracks += [track(300 + n, "facil", None) for n in range(3)]  # fora do titulo
    catalog = catalog_of(tracks)
    assert pool_sizes(catalog)["musica", "facil"] == 33
    assert pool_sizes(catalog)["titulo", "facil"] == 30
    result = generate_anime(catalog, None, EPOCH, EPOCH, horizon=5)
    check_rules(result.schedule, catalog)


def test_the_hits_catalog_is_refused(fixture_catalog):
    with pytest.raises(ScheduleError, match="não é o do Anime"):
        generate_anime(fixture_catalog, None, EPOCH, EPOCH)


# --- a preferência e os pesos ----------------------------------------------------------------


def test_the_oldest_third_counts_never_used_as_oldest_and_keeps_ties():
    pool = [track(n, "facil", "facil") for n in range(9)]
    history = _History(
        songs={pool[n]["songKey"]: date(2026, 10, 1) + timedelta(days=n % 3) for n in range(6)}
    )
    # As 3 nunca usadas são o terço (9 / 3).
    assert [t["id"] for t in _oldest_third(pool, history)] == [t["id"] for t in pool[6:]]
    # Sem as nunca usadas: o corte cai nas de 01/10, e os empates entram juntos.
    oldest = _oldest_third(pool[:6], history)
    assert sorted(t["id"] for t in oldest) == [pool[0]["id"], pool[3]["id"]]
    # Todas empatadas (o começo da agenda): o terço é todo mundo.
    assert len(_oldest_third(pool, _History())) == 9


@pytest.mark.parametrize("start", [EPOCH + timedelta(days=n) for n in range(5)])
def test_the_first_round_prefers_the_songs_that_never_came_out(start):
    # 9 músicas por dificuldade: a janela é de 1 dia (nada barra a de ontem), e no 2º dia a
    # preferência põe a 1ª rodada entre as 3 que ainda não saíram.
    catalog = shared({tier: 9 for tier in TIERS})
    result = generate_anime(catalog, None, start, start, horizon=1)
    first, second = (result.schedule["days"][d] for d in sorted(result.schedule["days"]))
    used = set(answers_of(first))
    for tier in TIERS:
        assert second["musica"][tier][0]["answer"] not in used, tier


def test_the_easiest_theme_type_counts():
    both = track(1, "facil", "facil")
    both["anime"]["themes"] = [
        {"anime": "B", "type": "ED", "sequence": 2},
        {"anime": "A", "type": "OP", "sequence": 1},
    ]
    assert theme_type(both) == "OP"


def _type_counts(catalog: JSON) -> dict[str, dict[str, int]]:
    result = generate_anime(catalog, None, EPOCH, EPOCH, horizon=60)
    tracks = {t["id"]: t for t in catalog["tracks"]}
    counts: dict[str, dict[str, int]] = {tier: {"OP": 0, "ED": 0, "IN": 0} for tier in TIERS}
    for day in result.schedule["days"].values():
        for mode in MODES:
            for tier in TIERS:
                for r in day[mode][tier]:
                    counts[tier][theme_type(tracks[r["answer"]])] += 1
    return counts


def test_the_theme_type_weights_p252(monkeypatch):
    # Metade abertura, metade encerramento (e, no Difícil, um terço de insert songs). Contra o
    # sorteio sem peso, a abertura sai mais no Fácil e no Médio, e a insert, menos no Difícil.
    # A preferência pelas mais antigas (P236) puxa para o uniforme: a que não sai envelhece e
    # entra no terço. Com estes números, o Fácil fica em uns 60% de aberturas.
    def kind(n: int, tier: str) -> str:
        if tier == "dificil":
            return ("OP", "ED", "IN")[n % 3]
        return ("OP", "ED")[n % 2]

    catalog = shared({tier: 2 * MINIMUM[tier] for tier in TIERS}, kind=kind)
    weighted = _type_counts(catalog)
    flat = {tier: dict.fromkeys(("OP", "ED", "IN"), 1) for tier in TIERS}
    monkeypatch.setattr(anime_schedule, "THEME_WEIGHTS", flat)
    uniform = _type_counts(catalog)
    for tier in ("facil", "medio"):
        assert weighted[tier]["OP"] > weighted[tier]["ED"], tier
        assert weighted[tier]["OP"] > uniform[tier]["OP"], tier
    assert weighted["dificil"]["IN"] < uniform["dificil"]["IN"]
    assert weighted["dificil"]["IN"] < min(weighted["dificil"]["OP"], weighted["dificil"]["ED"])


# --- a P44, o só acréscimo e o ME51 -------------------------------------------------------------


@pytest.fixture(scope="module")
def small():
    return shared({tier: 36 for tier in TIERS})


@pytest.fixture(scope="module")
def first_22(small):
    """Agenda nova no epoch: hoje + 21, de 08/10 a 29/10."""
    return generate_anime(small, None, EPOCH, EPOCH).schedule


def test_never_generates_a_past_day(small, first_22):
    gapped = generate_anime(small, first_22, EPOCH + timedelta(days=30))
    assert (gapped.added[0], gapped.added[-1], len(gapped.added)) == (
        "2026-11-07",
        "2026-11-28",
        22,
    )
    hole = [(date(2026, 10, 30) + timedelta(days=i)).isoformat() for i in range(8)]
    assert not [d for d in hole if d in gapped.schedule["days"]]
    assert "buraco de 8 dia(s) sem desafio: 2026-10-30 a 2026-11-06 (P44)" in gapped.warnings
    assert compare(first_22, gapped.schedule) == []
    assert gapped.schedule["days"]["2026-11-07"]["number"] == 31
    assert validate_anime_schedule(gapped.schedule, small) == []


def test_a_new_schedule_with_a_past_epoch_starts_today(small):
    result = generate_anime(small, None, EPOCH + timedelta(days=5), EPOCH)
    assert min(result.schedule["days"]) == "2026-10-13"
    assert result.schedule["days"]["2026-10-13"]["number"] == 6


def test_the_epoch_is_required_and_cannot_change(small, first_22):
    with pytest.raises(ScheduleError, match="--epoch"):
        generate_anime(small, None, EPOCH)
    with pytest.raises(ScheduleError, match="diverge"):
        generate_anime(small, first_22, EPOCH, date(2026, 10, 1))


def test_existing_days_never_change_when_the_catalog_changes(small, first_22):
    victim = first_22["days"]["2026-10-20"]["titulo"]["medio"][0]["answer"]
    changed = copy.deepcopy(small)
    for t in changed["tracks"]:
        if t["id"] == victim:
            t["eligible"] = {"daily": False, "reason": "blocked"}
    second = generate_anime(changed, first_22, EPOCH + timedelta(days=7))
    assert len(second.schedule["days"]) == 29
    assert compare(first_22, second.schedule) == []
    # O dia futuro que usa a faixa bloqueada fica igual, mas gera aviso (o jogo anula a rodada).
    assert "2026-10-20 titulo medio rodada 1: resposta não é mais elegível" in second.warnings
    assert victim not in {a for d in second.added for a in answers_of(second.schedule["days"][d])}


def test_regenerating_the_new_days_gives_the_same(small, first_22):
    # O ME51: a preferência lê a agenda anterior inteira, então gerar aos poucos ou de uma vez
    # dá o mesmo, e o schedule-check reconhece os dias novos.
    grown = generate_anime(small, first_22, date(2026, 10, 30)).schedule
    assert regenerate_problems(first_22, grown, small, generate_anime) == []
    at_once = generate_anime(small, None, EPOCH, EPOCH, horizon=(date(2026, 11, 20) - EPOCH).days)
    assert dumps(at_once.schedule) == dumps(grown)
    edited = copy.deepcopy(grown)
    rnd = edited["days"]["2026-10-31"]["musica"]
    rnd["facil"][0], rnd["medio"][0] = rnd["medio"][0], rnd["facil"][0]
    problems = regenerate_problems(first_22, edited, small, generate_anime)
    assert problems == [
        "2026-10-31: dia novo diferente do que o gerador daria (editado à mão, ou o catálogo mudou"
        " depois do schedule?)"
    ]


def test_an_invalid_existing_schedule_is_refused(small, first_22):
    broken = copy.deepcopy(first_22)
    broken["days"]["2026-10-09"]["number"] = 7
    with pytest.raises(ScheduleError, match="inválida"):
        generate_anime(small, broken, EPOCH + timedelta(days=30))


# --- a validação ------------------------------------------------------------------------------


def test_structural_validation_catches_broken_files(small, first_22):
    broken = copy.deepcopy(first_22)
    broken["days"]["2026-10-09"]["number"] = 7
    broken["days"]["2026-10-10"]["titulo"]["facil"][0]["answer"] = "x:tr:fantasma"
    day = broken["days"]["2026-10-11"]
    day["titulo"]["dificil"][2] = copy.deepcopy(day["musica"]["facil"][0])
    broken["days"]["2026-10-07"] = copy.deepcopy(broken["days"]["2026-10-08"])
    problems = validate_anime_schedule(broken, small)
    assert "dias antes do epoch: 2026-10-07" in problems
    assert "2026-10-09: number deveria ser 2" in problems
    assert "2026-10-10 titulo facil rodada 1: resposta inexistente x:tr:fantasma" in problems
    assert any(p.startswith("2026-10-11: faixa repetida no dia") for p in problems)
    # O cabeçalho: sem o kind, é a agenda dos Hits, não a do Anime.
    no_kind = {k: v for k, v in first_22.items() if k != "kind"}
    assert any("kind" in p for p in validate_anime_schedule(no_kind, small))


def test_the_rules_are_errors_for_this_catalog_and_warnings_for_older_ones(small, first_22):
    # Uma faixa recalibrada (do Fácil para o Médio) depois da agenda: nos dias gerados com o
    # catálogo de agora, é erro; nos de um catálogo anterior, só aviso (P238).
    victim = first_22["days"]["2026-10-08"]["musica"]["facil"][0]["answer"]
    changed = copy.deepcopy(small)
    for t in changed["tracks"]:
        if t["id"] == victim:
            t["anime"]["tiers"]["musica"] = "medio"
    errors, warnings = rule_problems(first_22, changed)
    assert "2026-10-08 musica facil rodada 1: a faixa é medio nesse modo" in errors
    assert all(e.endswith("a faixa é medio nesse modo") for e in errors)
    assert warnings == []
    newer = {**changed, "catalogVersion": "2026-10-09.ffffffff"}
    assert rule_problems(first_22, newer) == ([], errors)
    older = {**small, "catalogVersion": "2026-10-07.ffffffff"}
    errors, _ = rule_problems(first_22, older)
    assert len(errors) == len(first_22["days"])
    assert errors[0].startswith("2026-10-08: gerado com um catálogo mais novo")


# --- as fixtures e o CLI ------------------------------------------------------------------------

FIXTURE = anime_paths("fixture").public_dir
COMMITTED = FIXTURE / "schedule.json"


def test_committed_anime_schedule_is_what_the_generator_gives():
    """A agenda fictícia do Anime versionada é a que o schedule-anime gera: os dias gerados com
    o catálogo de agora (o mesmo catalogVersion) saem iguais, a partir dos anteriores. Se o
    catálogo fictício mudar, os dias antigos ficam como estão (a agenda só cresce), e o teste
    passa a olhar só os dias novos."""
    committed = read_json(COMMITTED)
    catalog = read_json(FIXTURE / "catalog.json")
    days = sorted(committed["days"])
    current = [
        d for d in days if committed["days"][d]["catalogVersion"] == catalog["catalogVersion"]
    ]
    if not current:
        pytest.skip("nenhum dia gerado com o catálogo fictício de agora")
    first, last = date.fromisoformat(current[0]), date.fromisoformat(days[-1])
    base = {**committed, "days": {d: committed["days"][d] for d in days if d < current[0]}}
    again = generate_anime(catalog, base, first, horizon=(last - first).days)
    assert dumps(again.schedule).encode("utf-8") == COMMITTED.read_bytes()


def test_the_fixture_schedule_has_the_dates_of_the_hits_one():
    # As mesmas datas da agenda fictícia dos Hits: o dev e o e2e fixam o relógio nelas.
    hits = read_json(provider_paths("fixture").public_dir / "schedule.json")
    anime = read_json(COMMITTED)
    assert anime["epoch"] == hits["epoch"]
    assert min(anime["days"]) == min(hits["days"])
    assert set(anime["days"]) <= set(hits["days"])


def test_the_fixture_schedule_is_valid_and_has_every_diary():
    catalog = read_json(FIXTURE / "catalog.json")
    schedule = read_json(COMMITTED)
    assert validate_anime_schedule(schedule, catalog) == []
    errors, _ = rule_problems(schedule, catalog)
    assert errors == []
    check_rules(schedule, catalog)


@pytest.mark.parametrize("seed", ["1", "2"])
def test_anime_schedule_bytes_do_not_depend_on_hash_seed(tmp_path, seed):
    args = ["schedule-anime", "--provider", "fixture", "--today", "2026-10-08"]
    args += ["--epoch", "2026-10-08", "--days", "20"]
    out = tmp_path / "schedule.json"
    env = {**os.environ, "PYTHONHASHSEED": seed}
    cmd = [sys.executable, "-m", "musicle_pipeline", *args, "--out", str(out)]
    subprocess.run(cmd, check=True, env=env, capture_output=True)
    reference = tmp_path / "reference.json"
    assert main([*args, "--out", str(reference)]) == 0
    assert out.read_bytes() == reference.read_bytes()


def test_schedule_anime_command(tmp_path, capsys):
    out = tmp_path / "schedule.json"
    args = ["schedule-anime", "--provider", "fixture", "--out", str(out)]
    # Agenda nova sem --epoch.
    assert main([*args, "--today", "2026-10-21"]) == 1
    assert "precisa de --epoch" in capsys.readouterr().err
    # Hoje e amanhã (--days 1), com o epoch no passado: o buraco é avisado (P44).
    assert main([*args, "--today", "2026-10-21", "--epoch", "2026-10-08", "--days", "1"]) == 0
    captured = capsys.readouterr()
    assert "2 dia(s) novo(s) (2026-10-21 a 2026-10-22), 2 no total" in captured.out
    assert "aviso: buraco de 13 dia(s) sem desafio: 2026-10-08 a 2026-10-20 (P44)" in captured.err
    assert "aviso: musica facil: 9 música(s)" in captured.err
    # De novo, no mesmo dia: nada novo.
    assert main([*args, "--today", "2026-10-21", "--days", "1"]) == 0
    assert "0 dia(s) novo(s), 2 no total; sem mudanças" in capsys.readouterr().out


def test_schedule_anime_refuses_another_providers_public_dir(capsys):
    real = anime_paths("apple").public_dir / "schedule.json"
    before = real.read_bytes() if real.exists() else None
    args = ["schedule-anime", "--provider", "fixture", "--out", str(real)]
    assert main([*args, "--today", "2026-10-21", "--epoch", "2026-10-21"]) == 1
    assert "grava em" in capsys.readouterr().err
    assert (real.read_bytes() if real.exists() else None) == before


def test_validate_anime_checks_the_schedule_next_to_the_catalog(tmp_path, capsys):
    assert main(["validate-anime", "--provider", "fixture"]) == 0
    captured = capsys.readouterr()
    assert f"{COMMITTED}: OK" in captured.out
    assert "aviso: titulo dificil: 11 música(s)" in captured.err
    args = ["validate-anime", "--provider", "fixture", "--schedule"]
    assert main([*args, str(tmp_path / "nao-existe.json")]) == 1
    assert "arquivo ausente (rode o schedule-anime)" in capsys.readouterr().err
    loose = tmp_path / "schedule.json"
    loose.write_bytes(COMMITTED.read_bytes() + b"\n")
    assert main([*args, str(loose)]) == 1
    assert "forma canônica" in capsys.readouterr().err
    broken = read_json(COMMITTED)
    first = min(broken["days"])
    rounds = broken["days"][first]["titulo"]
    rounds["facil"][0], rounds["dificil"][0] = rounds["dificil"][0], rounds["facil"][0]
    loose.write_bytes(dumps(broken).encode("utf-8"))
    assert main([*args, str(loose)]) == 1
    assert f"{first} titulo facil rodada 1: a faixa é dificil nesse modo" in capsys.readouterr().err
