"""A agenda das Misturadas (M17): os 2 diários de cada dia, um por modo (`musica`, acertar a
música; `titulo`, acertar o anime), com 4 rodadas de 2, 2, 2 e 3 músicas tocando juntas (P7). Usa
o catálogo do Anime e lê a agenda dele, ao lado (P25).

A regra de ouro é a das outras agendas: SÓ CRESCE (o `grow` do `schedule.py`). Só o dia é outro:

- **A ordem e a semente:** para cada modo (`musica`, `titulo`) e cada rodada (1 a 4), nessa
  ordem, o rng de "musicle-jp|anime-mixed|<data>|<modo>|<rodada>"; cada música da rodada consome
  1 número (o sorteio ponderado pelo tipo do tema, P252).
- **A régua** (P7; o usuário, 24/10/2026): nas rodadas 1, 2 e 4, o Fácil inteiro do modo (até
  então, só as muito conhecidas, o `anime.famous` do catálogo, que ficou fácil demais); na 3, o
  Médio ou o Difícil do modo.
- **Nunca afrouxam:** a música não repete nas 18 do dia (os dois modos); dentro da rodada, as
  músicas e as franquias são diferentes (um palpite serviria a duas).
- **O afrouxamento,** com registro: o nível 0 tem tudo, com a franquia nova no dia (entre os dois
  diários), no `titulo` a franquia nova no diário (a resposta seria a mesma em duas rodadas) e a
  janela; o 1 deixa a franquia repetir no dia; depois, a janela encolhe (K − 1, ..., 1). Os três
  últimos só valem no acervo curto (as fixtures, de 34 faixas; no real, nunca devem chegar), nesta
  ordem: a franquia repete no diário do `titulo`; qualquer faixa do modo (a régua da P7 cai: a
  rodada do Fácil pode receber uma Média ou Difícil, e a 3, uma Fácil); e, sem nenhuma outra
  saída, uma resposta dos 6 diários do Anime do dia (P25). A régua cai antes da P25 porque uma
  música repetida no mesmo dia é o que a pessoa mais nota.
- **A janela:** a música que saiu nas Misturadas nos últimos K dias fica de fora (hoje conta); K =
  WINDOW, ou menos com acervo curto: as do Fácil de cada modo ÷ as 7 dele por dia, e a união dos
  dois ÷ as 14 do dia, a menor das contas (a mesma música não sai nos dois modos).
- **A preferência** (P236): o terço mais antigo das candidatas, como no Anime.
- **As novas** (o usuário, 24/10/2026, com a carga C3): cada rodada leva no máximo
  `NEW_PER_ROUND` música que nunca saiu, nem no Anime nem nas Misturadas, antes do dia. Depois
  dela, a rodada prefere as que já saíram; sem nenhuma candidata assim, vale qualquer uma (é
  preferência, como no Anime, e não afrouxa com registro).

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
    _prefer_seen,
    _rounds,
    _weighted,
    validate_anime_schedule,
)
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import anime_mixed_schema_path
from musicle_pipeline.prng import seeded
from musicle_pipeline.schedule import HORIZON_DAYS, TIMEZONE, Generator, Result, ScheduleError, grow

SCHEMA_VERSION = 1
KIND = "anime-mixed"
# As 4 rodadas (P7): a régua e quantas músicas tocam juntas.
ROUNDS = (("facil", 2), ("facil", 2), ("hard", 2), ("facil", 3))
# A janela, em dias, com hoje: a música volta às Misturadas depois de duas semanas.
WINDOW = 14
# As do Fácil de um dia (as rodadas 1, 2 e 4 dos dois modos): o acervo ÷ isto é a janela.
EASY_PER_DAY = sum(n for ruler, n in ROUNDS if ruler == "facil") * len(MODES)
# As do Fácil de cada modo num dia (as rodadas 1, 2 e 4).
EASY_PER_MODE = EASY_PER_DAY // len(MODES)
# As músicas que nunca saíram numa rodada (o usuário, 24/10/2026, com a carga C3).
NEW_PER_ROUND = 1
# Os pesos do tipo do tema (P252) da régua da rodada (e não a do nível que afrouxou): o Fácil, os
# do Fácil; o Médio ou o Difícil da rodada 3, os do Difícil (o encerramento vale como a abertura).
WEIGHT_TIER = {"facil": "facil", "hard": "dificil"}
HARD_TIERS = ("medio", "dificil")


def _in_ruler(track: JSON, mode: str, ruler: str) -> bool:
    anime = track["anime"]
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
        self.pools = {(m, r): _pool(ordered, m, r) for m in MODES for r in ("facil", "hard", "any")}
        self.window = max(1, min(WINDOW, easy_days(self.pools)))


def easy_days(pools: Mapping[tuple[str, str], Sequence[JSON]]) -> int:
    """Quantos dias o Fácil dá sem repetir: o de cada modo (7 por dia) e o da união dos dois (14
    por dia), a menor. Só pela união, um modo com poucas ficaria com a janela cheia e afrouxaria
    todo dia."""
    union = {t["songKey"] for m in MODES for t in pools[m, "facil"]}
    per_mode = [len(pools[m, "facil"]) // EASY_PER_MODE for m in MODES]
    return min(len(union) // EASY_PER_DAY, *per_mode)


def mixed_short_pools(catalog: JSON) -> list[str]:
    """O aviso de acervo curto: o Fácil não dá a janela de WINDOW dias."""
    idx = _Index(catalog)
    if idx.window >= WINDOW:
        return []
    counts = ", ".join(f"{m} {len(idx.pools[m, 'facil'])}" for m in MODES)
    return [
        f"Misturadas: o Fácil ({counts}) não dá {WINDOW} dias ({EASY_PER_MODE} por modo e"
        f" {EASY_PER_DAY} por dia); a janela cai para {idx.window} dia(s)"
    ]


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


def _seen_songs(
    history: _History, anime_days: Mapping[str, JSON], d: date, idx: _Index
) -> set[str]:
    """As músicas que já saíram antes do dia, nas Misturadas ou no Anime: as outras são novas.
    Só os dias de antes, que nunca mudam (as duas agendas só crescem)."""
    seen = set(history.songs)
    for day_str, anime_day in anime_days.items():
        if day_str < d.isoformat():  # datas ISO comparam certo como texto
            seen |= _anime_songs(anime_day, idx)
    return seen


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
    """Os níveis, do mais firme ao mais frouxo. Os três últimos só valem no acervo curto (as
    fixtures, de 34 faixas; no real, nunca devem chegar): a franquia no diário do titulo, a régua
    da P7 (qualquer faixa do modo) e, por último, a P25."""
    levels = [_Level("", window, ruler), _Level("a franquia repete no dia", window, ruler, False)]
    levels += [_Level(f"janela de {k} dia(s)", k, ruler, False) for k in range(window - 1, 0, -1)]
    levels.append(_Level("a franquia repete no diário", 1, ruler, False, False))
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
    seen = _seen_songs(history, anime_days, d, idx)
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
            fresh = 0  # as que nunca saíram que a rodada já levou
            for _ in range(count):
                level, what, candidates = _candidates(idx, mode, ruler, history, d, used)
                if not candidates:
                    raise ScheduleError(f"{d}: sem faixa possível para {mode} rodada {n}")
                if level:
                    relaxations.append(
                        f"{d} {mode} rodada {n}: afrouxamento nível {level} ({what})"
                    )
                if fresh >= NEW_PER_ROUND:
                    candidates = _prefer_seen(candidates, seen)
                track = _weighted(rng, _oldest_third(candidates, history), WEIGHT_TIER[ruler])
                if track["songKey"] not in seen:
                    fresh += 1
                answers.append(track["id"])
                franchises = set(track["anime"]["franchiseIds"])
                used.day_songs.add(track["songKey"])
                used.round_franchises |= franchises
                used.diary_franchises |= franchises
                used.day_franchises |= franchises
            rounds.append({"answers": answers})
        day[mode] = rounds
    return day, relaxations


def _future_warnings(schedule: JSON, today: date, idx: _Index) -> list[str]:
    """Dias futuros já gravados não mudam; se envelheceram mal, o jogo anula a rodada (P238)."""
    warnings = []
    for day_str, day in sorted(schedule["days"].items()):
        if date.fromisoformat(day_str) < today:
            continue
        for mode, n, answers in mixed_rounds(day):
            tracks = [idx.tracks.get(a) for a in answers]
            if any(t is None or not t["eligible"]["daily"] for t in tracks):
                warnings.append(f"{day_str} {mode} rodada {n}: resposta não é mais elegível")
    return warnings


def generate_mixed(
    catalog: JSON,
    anime_schedule: JSON,
    existing: JSON | None,
    today: date,
    epoch: date | None = None,
    horizon: int = HORIZON_DAYS,
) -> Result:
    """Acrescenta os dias que faltam até today + horizon, sem passar do último dia da agenda do
    Anime (P25: cada dia lê as respostas dele). Nunca altera um dia existente. A agenda do Anime é
    conferida aqui também: o schedule-check a lê do disco, sem outra conferência."""
    idx = _Index(catalog)
    anime_problems = validate_anime_schedule(anime_schedule, catalog)
    if anime_problems:
        raise ScheduleError("agenda do Anime ao lado inválida:\n" + "\n".join(anime_problems))
    warnings: list[str] = []
    if existing is not None:
        problems = validate_mixed_schedule(existing, catalog)
        if problems:
            raise ScheduleError("agenda das Misturadas existente inválida:\n" + "\n".join(problems))
        warnings = _future_warnings(existing, today, idx)
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
        warnings,
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
            if track["anime"]["tiers"][mode] is None:
                problems.append(f"{at}: faixa fora do modo")
            round_franchises += track["anime"]["franchiseIds"]
        if len(round_franchises) != len(set(round_franchises)):
            problems.append(f"{at}: duas músicas da mesma franquia na rodada")
    return problems


def mixed_rule_problems(schedule: JSON, catalog: JSON) -> tuple[list[str], list[str]]:
    """As regras da geração que nunca afrouxam, dia a dia: cada resposta elegível e do modo,
    nenhuma música repetida nos 18 do dia e as franquias diferentes na rodada. Devolve (erros,
    avisos): erro nos dias gerados com este catálogo (o mesmo catalogVersion); aviso nos de antes,
    como no Anime. Um dia gerado com um catálogo de data mais nova que a deste é erro (o catálogo
    ficou para trás)."""
    tracks = {t["id"]: t for t in catalog["tracks"]}
    version = catalog["catalogVersion"]
    errors: list[str] = []
    warnings: list[str] = []
    for where, day in sorted(schedule["days"].items()):
        if day["catalogVersion"][:10] > version[:10]:
            errors.append(
                f"{where}: gerado com um catálogo mais novo ({day['catalogVersion']}) que este"
                f" ({version})"
            )
            continue
        found = _day_rule_problems(where, day, tracks)
        (errors if day["catalogVersion"] == version else warnings).extend(found)
    return errors, warnings
