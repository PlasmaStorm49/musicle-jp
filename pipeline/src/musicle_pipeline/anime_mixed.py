"""A agenda das Misturadas (M17): os 2 diários de cada dia, um por modo (`musica`, acertar a
música; `titulo`, acertar o anime), com 4 rodadas de 2, 2, 2 e 3 músicas tocando juntas (P7). Usa
o catálogo do Anime e lê a agenda dele, ao lado (P25).

A regra de ouro é a das outras agendas: SÓ CRESCE (o `grow` do `schedule.py`). Só o dia é outro:

- **A ordem e a semente:** para cada modo (`musica`, `titulo`) e cada rodada (1 a 4), nessa
  ordem, o rng de "musicle-jp|anime-mixed|<data>|<modo>|<rodada>"; cada música da rodada consome
  1 número (o sorteio ponderado pelo tipo do tema, P252).
- **A régua** (P7): nas rodadas 1, 2 e 4, a muito conhecida do modo (o `anime.famous` do
  catálogo); na 3, o Médio ou o Difícil do modo.
- **Nunca afrouxam:** a música não repete nas 18 do dia (os dois modos); dentro da rodada, as
  músicas e as franquias são diferentes (um palpite serviria a duas).
- **O afrouxamento,** com registro: o nível 0 tem tudo, com a franquia nova no dia (entre os dois
  diários), no `titulo` a franquia nova no diário (a resposta seria a mesma em duas rodadas) e a
  janela; o 1 deixa a franquia repetir no dia; o 2, nas rodadas da muito conhecida, abre para o
  Fácil inteiro (o acervo curto); depois, a janela encolhe (K − 1, ..., 1). Os dois últimos só
  valem no acervo curto (as fixtures, de 34 faixas; no real, nunca chegam): a franquia repete no
  diário do `titulo`, e, sem nenhuma outra saída, uma resposta dos 6 diários do Anime do dia
  (P25).
- **A janela:** a música que saiu nas Misturadas nos últimos K dias fica de fora (hoje conta); K =
  WINDOW, ou menos com acervo curto (as muito conhecidas ÷ as 14 delas por dia).
- **A preferência** (P236): o terço mais antigo das candidatas, como no Anime.

Mudou o consumo do rng, a ordem, a régua ou uma regra? Só os dias novos sentem (o `schedule-check`
protege os gravados, regerando os novos com o catálogo e a agenda do Anime ao lado).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from functools import cache

from jsonschema import Draft202012Validator

from musicle_pipeline.anime import MODES
from musicle_pipeline.anime_schedule import (
    _History,
    _oldest_third,
    _outside,
    _rounds,
    _weighted,
)
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import anime_mixed_schema_path
from musicle_pipeline.prng import seeded
from musicle_pipeline.schedule import HORIZON_DAYS, TIMEZONE, Generator, Result, ScheduleError, grow

SCHEMA_VERSION = 1
KIND = "anime-mixed"
# As 4 rodadas (P7): a régua e quantas músicas tocam juntas.
ROUNDS = (("famous", 2), ("famous", 2), ("hard", 2), ("famous", 3))
# A janela, em dias, com hoje: a música volta às Misturadas depois de duas semanas.
WINDOW = 14
# As muito conhecidas de um dia (as rodadas 1, 2 e 4 dos dois modos): o acervo ÷ isto é a janela.
FAMOUS_PER_DAY = sum(n for ruler, n in ROUNDS if ruler == "famous") * len(MODES)
# Os pesos do tipo do tema (P252) de cada régua: a muito conhecida e o Fácil, os do Fácil; o Médio
# ou o Difícil da rodada 3, os do Difícil (o encerramento vale como a abertura).
WEIGHT_TIER = {"famous": "facil", "facil": "facil", "hard": "dificil", "any": "dificil"}
HARD_TIERS = ("medio", "dificil")


def _in_ruler(track: JSON, mode: str, ruler: str) -> bool:
    anime = track["anime"]
    if ruler == "famous":
        return bool(anime.get("famous", {}).get(mode))
    if ruler == "facil":
        return anime["tiers"][mode] == "facil"
    if ruler == "any":  # o acervo curto (as fixtures): qualquer faixa que entra no modo
        return anime["tiers"][mode] is not None
    return anime["tiers"][mode] in HARD_TIERS


def _pool(ordered: Sequence[JSON], mode: str, ruler: str) -> list[JSON]:
    """As faixas elegíveis da régua, uma por música (o songKey junta a TV size e a completa): fica
    a de menor id, como no Anime."""
    seen: set[str] = set()
    pool = []
    for track in ordered:
        playable = track["eligible"]["daily"] and _in_ruler(track, mode, ruler)
        if playable and track["songKey"] not in seen:
            seen.add(track["songKey"])
            pool.append(track)
    return pool


class _Index:
    """Acesso rápido ao catálogo do Anime durante a geração das Misturadas."""

    def __init__(self, catalog: JSON) -> None:
        if "franchises" not in catalog:
            raise ScheduleError("o catálogo não é o do Anime (falta franchises)")
        self.version = catalog["catalogVersion"]
        self.tracks = {t["id"]: t for t in catalog["tracks"]}
        ordered = sorted(catalog["tracks"], key=lambda t: t["id"])
        self.pools = {
            (m, r): _pool(ordered, m, r) for m in MODES for r in ("famous", "facil", "hard", "any")
        }
        famous = {t["songKey"] for m in MODES for t in self.pools[m, "famous"]}
        self.window = max(1, min(WINDOW, len(famous) // FAMOUS_PER_DAY))


def mixed_rounds(day: JSON) -> Iterator[tuple[str, int, list[str]]]:
    """(modo, rodada, respostas) de cada rodada do dia, na ordem da geração."""
    for mode in MODES:
        for n, rnd in enumerate(day[mode], start=1):
            yield mode, n, rnd["answers"]


def _history(days: Mapping[str, JSON], idx: _Index) -> _History:
    """O último dia em que cada música saiu nas Misturadas (a agenda anterior inteira, P236)."""
    history = _History()
    for day_str in sorted(days):
        d = date.fromisoformat(day_str)
        for _mode, _n, answers in mixed_rounds(days[day_str]):
            for answer in answers:
                track = idx.tracks.get(answer)
                if track is not None:
                    history.songs[track["songKey"]] = d
    return history


def _anime_songs(anime_day: JSON, idx: _Index) -> set[str]:
    """As músicas das 18 respostas dos 6 diários do Anime do dia (P25)."""
    return {
        idx.tracks[answer]["songKey"]
        for _m, _t, _n, answer in _rounds(anime_day)
        if answer in idx.tracks
    }


@dataclass
class _Used:
    """O que o dia já usou, para as regras que nunca afrouxam e as que afrouxam."""

    anime_songs: set[str]
    day_songs: set[str] = field(default_factory=set)
    day_franchises: set[str] = field(default_factory=set)
    diary_franchises: set[str] = field(default_factory=set)
    round_franchises: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class _Level:
    """Um nível de afrouxamento: o que afrouxou e as regras que ainda valem nele."""

    what: str
    window: int
    ruler: str
    day_franchise: bool = True  # a franquia nova no dia (entre os dois diários)
    diary_franchise: bool = True  # no titulo, a franquia nova no diário
    avoid_anime: bool = True  # sem as respostas dos 6 diários do Anime do dia (P25)


def _levels(ruler: str, window: int) -> list[_Level]:
    """Os níveis, do mais firme ao mais frouxo. Os dois últimos só valem no acervo curto (as
    fixtures, de 34 faixas): no real, nunca chegam."""
    wide = "facil" if ruler == "famous" else ruler
    levels = [_Level("", window, ruler), _Level("a franquia repete no dia", window, ruler, False)]
    if ruler == "famous":
        levels.append(_Level("o Fácil inteiro", window, "facil", False))
    levels += [_Level(f"janela de {k} dia(s)", k, wide, False) for k in range(window - 1, 0, -1)]
    levels.append(_Level("a franquia repete no diário", 1, wide, False, False))
    levels.append(_Level("qualquer faixa do modo", 1, "any", False, False))
    levels.append(
        _Level("repete uma resposta do Anime do dia (P25)", 1, "any", False, False, False)
    )
    return levels


def _candidates(
    idx: _Index, mode: str, ruler: str, history: _History, d: date, used: _Used
) -> tuple[int, str, list[JSON]]:
    for n, level in enumerate(_levels(ruler, idx.window)):
        found = []
        for track in idx.pools[mode, level.ruler]:
            franchises = set(track["anime"]["franchiseIds"])
            # Nunca afrouxam: a música do dia e a franquia da rodada.
            if track["songKey"] in used.day_songs or franchises & used.round_franchises:
                continue
            if level.diary_franchise and mode == "titulo" and franchises & used.diary_franchises:
                continue
            if level.day_franchise and franchises & used.day_franchises:
                continue
            if level.avoid_anime and track["songKey"] in used.anime_songs:
                continue
            if _outside(history.songs.get(track["songKey"]), d, level.window):
                found.append(track)
        if found:
            return n, level.what, found
    return -1, "", []


def _generate_day(
    days: dict[str, JSON], d: date, epoch: date, idx: _Index, anime_days: Mapping[str, JSON]
) -> tuple[JSON, list[str]]:
    anime_day = anime_days.get(d.isoformat())
    if anime_day is None:
        # Sem o dia do Anime, a P25 não teria como valer: a agenda do Anime vem antes.
        raise ScheduleError(f"{d}: a agenda do Anime não tem o dia (gere o Anime antes, P25)")
    history = _history(days, idx)
    used = _Used(anime_songs=_anime_songs(anime_day, idx))
    relaxations: list[str] = []
    day: JSON = {"number": (d - epoch).days + 1, "catalogVersion": idx.version}
    for mode in MODES:
        used.diary_franchises = set()
        rounds = []
        for n, (ruler, count) in enumerate(ROUNDS, start=1):
            rng = seeded(f"musicle-jp|anime-mixed|{d.isoformat()}|{mode}|{n}")
            used.round_franchises = set()
            answers = []
            for _ in range(count):
                level, what, candidates = _candidates(idx, mode, ruler, history, d, used)
                if not candidates:
                    raise ScheduleError(f"{d}: sem faixa possível para {mode} rodada {n}")
                if level:
                    relaxations.append(
                        f"{d} {mode} rodada {n}: afrouxamento nível {level} ({what})"
                    )
                track = _weighted(rng, _oldest_third(candidates, history), WEIGHT_TIER[ruler])
                answers.append(track["id"])
                franchises = set(track["anime"]["franchiseIds"])
                used.day_songs.add(track["songKey"])
                used.round_franchises |= franchises
                used.diary_franchises |= franchises
                used.day_franchises |= franchises
            rounds.append({"answers": answers})
        day[mode] = rounds
    return day, relaxations


def generate_mixed(
    catalog: JSON,
    anime_schedule: JSON,
    existing: JSON | None,
    today: date,
    epoch: date | None = None,
    horizon: int = HORIZON_DAYS,
) -> Result:
    """Acrescenta os dias que faltam até today + horizon, sem passar do último dia da agenda do
    Anime (P25: cada dia lê as respostas dele). Nunca altera um dia existente."""
    idx = _Index(catalog)
    if existing is not None:
        problems = validate_mixed_schedule(existing, catalog)
        if problems:
            raise ScheduleError("agenda das Misturadas existente inválida:\n" + "\n".join(problems))
    anime_days = anime_schedule["days"]
    if anime_days:
        horizon = min(horizon, (date.fromisoformat(max(anime_days)) - today).days)
    header = {"schemaVersion": SCHEMA_VERSION, "kind": KIND, "timezone": TIMEZONE}
    return grow(
        existing,
        header,
        today,
        epoch,
        horizon,
        lambda days, d, start: _generate_day(days, d, start, idx, anime_days),
    )


def mixed_generator(anime_schedule: JSON) -> Generator:
    """O gerador com a assinatura do `generate` (o `regenerate_problems` o recebe), sobre a agenda
    do Anime ao lado (a do mesmo commit, no schedule-check)."""

    def generator(
        catalog: JSON, existing: JSON | None, today: date, epoch: date | None, horizon: int
    ) -> Result:
        return generate_mixed(catalog, anime_schedule, existing, today, epoch, horizon)

    return generator


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(anime_mixed_schema_path())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate_mixed_schedule(schedule: JSON, catalog: JSON) -> list[str]:
    """Validação ESTRUTURAL, que vale para todos os dias: o schema, o epoch, o número, as
    respostas existem no catálogo, a conta de músicas de cada rodada (2, 2, 2 e 3) e nenhuma
    faixa repetida no dia. As regras da geração ficam com o `mixed_rule_problems`."""
    errors = sorted(_validator().iter_errors(schedule), key=lambda e: list(e.absolute_path))
    if errors:
        return [f"schema: /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errors]
    tracks = {t["id"] for t in catalog["tracks"]}
    try:
        epoch = date.fromisoformat(schedule["epoch"])
        dates = sorted(date.fromisoformat(d) for d in schedule["days"])
    except ValueError as exc:
        return [f"data inválida: {exc}"]
    problems: list[str] = []
    before = [d.isoformat() for d in dates if d < epoch]
    if before:
        problems.append(f"dias antes do epoch: {', '.join(before)}")
    for d in dates:
        where = d.isoformat()
        day = schedule["days"][where]
        if day["number"] != (d - epoch).days + 1:
            problems.append(f"{where}: number deveria ser {(d - epoch).days + 1}")
        answers: list[str] = []
        for mode, n, round_answers in mixed_rounds(day):
            expected = ROUNDS[n - 1][1]
            if len(round_answers) != expected:
                problems.append(
                    f"{where} {mode} rodada {n}: {expected} músicas, e não {len(round_answers)}"
                )
            for answer in round_answers:
                if answer not in tracks:
                    problems.append(f"{where} {mode} rodada {n}: resposta inexistente {answer}")
                answers.append(answer)
        repeated = sorted({a for a in answers if answers.count(a) > 1})
        if repeated:
            problems.append(f"{where}: faixa repetida no dia: {', '.join(repeated)}")
    return problems


def _day_rule_problems(where: str, day: JSON, tracks: Mapping[str, JSON]) -> list[str]:
    problems = []
    songs: set[str] = set()
    for mode, n, answers in mixed_rounds(day):
        at = f"{where} {mode} rodada {n}"
        round_franchises: list[str] = []
        for answer in answers:
            track = tracks.get(answer)
            if track is None:
                continue  # a validação estrutural já acusa
            if not track["eligible"]["daily"]:
                problems.append(f"{at}: resposta inelegível ({track['eligible']['reason']})")
            if track["songKey"] in songs:
                problems.append(f"{at}: música repetida no dia")
            songs.add(track["songKey"])
            round_franchises += track["anime"]["franchiseIds"]
        if len(round_franchises) != len(set(round_franchises)):
            problems.append(f"{at}: duas músicas da mesma franquia na rodada")
    return problems


def mixed_rule_problems(schedule: JSON, catalog: JSON) -> tuple[list[str], list[str]]:
    """As regras da geração que nunca afrouxam, dia a dia: cada resposta elegível, nenhuma música
    repetida nos 18 do dia e as franquias diferentes na rodada. Devolve (erros, avisos): erro nos
    dias gerados com este catálogo (o mesmo catalogVersion); aviso nos de antes, como no Anime."""
    tracks = {t["id"]: t for t in catalog["tracks"]}
    version = catalog["catalogVersion"]
    errors: list[str] = []
    warnings: list[str] = []
    for where, day in sorted(schedule["days"].items()):
        found = _day_rule_problems(where, day, tracks)
        (errors if day["catalogVersion"] == version else warnings).extend(found)
    return errors, warnings
