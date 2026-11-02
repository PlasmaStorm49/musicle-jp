"""A agenda do Anime Royale (o usuário, 01/11/2026): por dia, 3 dificuldades (a faixa do `titulo`,
acertar o anime), cada uma uma rodada em que 5 músicas tocam e a pessoa as marca entre 9 opções (as
5 e 4 erradas), cada opção mostrada pela capa do anime dela. Usa o catálogo do Anime e lê, ao lado,
as agendas do Anime, das Misturadas e do quiz do dia.

A regra de ouro é a das outras agendas: SÓ CRESCE (o `grow` do `schedule.py`). Só o dia é outro:

- **A ordem e a semente:** para cada dificuldade (`TIERS`), o rng de
  "musicle-jp|anime-royale|<data>|<dificuldade>": 1 número por música que toca (o sorteio
  ponderado), o embaralhar dos tipos das erradas, 1 número por errada e o embaralhar das opções.
- **A capa:** só entram as músicas cujo 1º tema tem capa (a tela mostra o 1º tema). O mesmo anime
  se reconhece pela capa grande, porque o nome se repete (Fairy Tail, Shaman King).
- **A faixa:** as que tocam e as erradas saem da faixa do `titulo` da dificuldade, para a pessoa
  não acertar só pensando "essa eu conheço, então tocou".
- **Nunca afrouxam:** a música não repete no dia (as 27 opções das 3 dificuldades), e o mesmo anime
  não aparece duas vezes nas 9 opções (duas capas iguais na grade).
- **A franquia** pode repetir na rodada, com chance menor (o usuário, 01/11/2026): a que já está na
  rodada tem peso 1, e a nova, `FRANCHISE_NEW`.
- **As erradas seguem a mistura de tipos das certas:** os tipos das 4 saem do embaralhar dos 5 tipos
  das certas, e cada errada prefere o seu tipo (é preferência: sem candidata dele, vale qualquer
  uma). O pop-up mostra o tipo do tema, e erradas só de encerramento entregariam as aberturas.
- **O afrouxamento,** com registro: o nível 0 tem tudo (a janela das que tocam, a franquia das
  respostas do acertar o anime do dia fora, a faixa da dificuldade e as respostas dos outros
  diários do dia fora); depois, a janela encolhe (K − 1, ..., 1). Os três últimos só valem no
  acervo curto (as fixtures, de 34 faixas; no real, nunca devem chegar), nesta ordem: a franquia de
  uma resposta do acertar o anime do dia; qualquer faixa do `titulo`; e, sem nenhuma outra saída,
  uma resposta de outro diário do dia (o Anime, as Misturadas ou o quiz, que revela o nome).
- **A janela:** a música que tocou no Royale nos últimos K dias (hoje conta) não toca de novo; K =
  `WINDOW`, ou menos com acervo curto (as da faixa ÷ as 5 por dia, a menor das três). As erradas não
  têm janela: elas não tocam.
- **A preferência** (P236): o terço mais antigo das candidatas a tocar, como no Anime; e, no Fácil,
  no máximo `NEW_PER_ROUND` que nunca saiu (P360: nem no Anime, nem nas Misturadas, nem no Royale).

Mudou o consumo do rng, a ordem ou uma regra? Só os dias novos sentem (o `schedule-check` protege
os gravados, regerando os novos com o catálogo e as agendas ao lado).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from functools import cache

from jsonschema import Draft202012Validator

from musicle_pipeline.anime import TIERS
from musicle_pipeline.anime_mixed import mixed_rounds, validate_mixed_schedule
from musicle_pipeline.anime_schedule import (
    THEME_WEIGHTS,
    _History,
    _oldest_third,
    _outside,
    _prefer_seen,
    _rounds,
    theme_type,
    validate_anime_schedule,
)
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import anime_royale_schema_path
from musicle_pipeline.prng import Mulberry32, seeded
from musicle_pipeline.schedule import HORIZON_DAYS, TIMEZONE, Generator, Result, ScheduleError, grow

SCHEMA_VERSION = 1
KIND = "anime-royale"
# As músicas que tocam e as opções de cada dificuldade (o usuário, 01/11/2026).
PLAYED = 5
OPTIONS = 9
# A janela, em dias, com hoje: a música volta a tocar no Royale depois de um mês.
WINDOW = 30
# O peso da franquia nova na rodada; a que já está nela pesa 1 (o usuário: "chance menor").
FRANCHISE_NEW = 4
# As músicas que nunca saíram, por dificuldade (P360): sem a dificuldade, sem limite.
NEW_PER_ROUND = {"facil": 1}
# A faixa do Royale: a do acertar o anime.
MODE = "titulo"


def anime_of(track: JSON) -> str:
    """O anime da opção, pela capa grande do 1º tema (o que a tela mostra)."""
    return track["anime"]["themes"][0]["cover"]["large"]


def _pool(ordered: Sequence[JSON], ruler: str) -> list[JSON]:
    """As faixas elegíveis da faixa (ou de qualquer uma, "any"), com a capa no 1º tema, uma por
    música (o songKey junta a TV size e a completa): fica a de menor id, como no Anime."""
    seen: set[str] = set()
    pool = []
    for track in ordered:
        tier = track["anime"]["tiers"][MODE]
        fits = tier is not None if ruler == "any" else tier == ruler
        covered = track["anime"]["themes"][0]["cover"] is not None
        if track["eligible"]["daily"] and fits and covered and track["songKey"] not in seen:
            seen.add(track["songKey"])
            pool.append(track)
    return pool


class _Index:
    """Acesso rápido ao catálogo do Anime durante a geração do Royale."""

    def __init__(self, catalog: JSON) -> None:
        if "franchises" not in catalog:
            raise ScheduleError("o catálogo não é o do Anime (falta franchises)")
        self.version = catalog["catalogVersion"]
        self.tracks = {t["id"]: t for t in catalog["tracks"]}
        ordered = sorted(catalog["tracks"], key=lambda t: t["id"])
        self.pools = {ruler: _pool(ordered, ruler) for ruler in (*TIERS, "any")}
        self.window = max(1, min(WINDOW, *(len(self.pools[t]) // PLAYED for t in TIERS)))


def royale_short_pools(catalog: JSON) -> list[str]:
    """O aviso de acervo curto: alguma faixa não dá a janela de WINDOW dias."""
    idx = _Index(catalog)
    if idx.window >= WINDOW:
        return []
    counts = ", ".join(f"{t} {len(idx.pools[t])}" for t in TIERS)
    return [
        f"Royale: as faixas com capa ({counts}) não dão {WINDOW} dias ({PLAYED} por dia); a"
        f" janela cai para {idx.window} dia(s)"
    ]


def royale_rounds(day: JSON) -> Iterator[tuple[str, JSON]]:
    """(dificuldade, rodada) de cada dificuldade do dia, na ordem da geração."""
    for tier in TIERS:
        yield tier, day[tier]


def _history(days: Mapping[str, JSON], idx: _Index) -> _History:
    """O último dia em que cada música tocou no Royale (a agenda anterior inteira, P236)."""
    history = _History()
    for day_str in sorted(days):
        d = date.fromisoformat(day_str)
        for _tier, rnd in royale_rounds(days[day_str]):
            for answer in rnd["played"]:
                track = idx.tracks.get(answer)
                if track is not None:
                    history.songs[track["songKey"]] = d
    return history


@dataclass(frozen=True)
class _Others:
    """As agendas ao lado: o Royale lê as respostas delas no mesmo dia."""

    anime: Mapping[str, JSON]
    mixed: Mapping[str, JSON]
    quiz: Mapping[str, JSON] | None  # None: sem a agenda do quiz (a pasta não existe)

    def answers(self, d: date) -> tuple[list[str], list[str]]:
        """As respostas dos outros diários do dia e, delas, as do acertar o anime (o do Anime e o
        das Misturadas)."""
        where = d.isoformat()
        anime_day, mixed_day = self.anime.get(where), self.mixed.get(where)
        if anime_day is None or mixed_day is None:
            raise ScheduleError(
                f"{d}: a agenda do Anime ou a das Misturadas não tem o dia (gere as duas antes)"
            )
        titles = [a for mode, _t, _n, a in _rounds(anime_day) if mode == MODE]
        titles += [a for mode, _n, found in mixed_rounds(mixed_day) if mode == MODE for a in found]
        answers = [a for _m, _t, _n, a in _rounds(anime_day)]
        answers += [a for _m, _n, found in mixed_rounds(mixed_day) for a in found]
        if self.quiz is not None:
            quiz_day = self.quiz.get(where)
            if quiz_day is None:
                raise ScheduleError(f"{d}: a agenda do quiz não tem o dia (gere o quiz antes)")
            answers += [t for rnd in quiz_day["rounds"] for t in (rnd["a"], rnd["b"])]
        return answers, titles

    def before(self, d: date) -> Iterator[str]:
        """As respostas do Anime e das Misturadas dos dias antes de `d` (as novas da P360)."""
        for day_str, day in self.anime.items():
            if day_str < d.isoformat():  # datas ISO comparam certo como texto
                yield from (a for _m, _t, _n, a in _rounds(day))
        for day_str, day in self.mixed.items():
            if day_str < d.isoformat():
                yield from (a for _m, _n, found in mixed_rounds(day) for a in found)

    def last_day(self) -> str | None:
        """O último dia que as três têm: o Royale não passa dele."""
        ends = [max(days) for days in (self.anime, self.mixed, self.quiz or {}) if days]
        return min(ends) if ends else None


@dataclass
class _Used:
    """O que o dia já usou, para as regras que nunca afrouxam e as que afrouxam."""

    other_songs: set[str]
    title_franchises: set[str]
    day_songs: set[str] = field(default_factory=set)
    round_animes: set[str] = field(default_factory=set)
    round_franchises: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class _Level:
    """Um nível de afrouxamento: o que afrouxou e as regras que ainda valem nele."""

    what: str
    window: int
    ruler: str
    avoid_titles: bool = True  # sem a franquia das respostas do acertar o anime do dia
    avoid_others: bool = True  # sem as respostas dos outros diários do dia


def _levels(tier: str, window: int) -> list[_Level]:
    """Os níveis, do mais firme ao mais frouxo. Os três últimos só valem no acervo curto (as
    fixtures; no real, nunca devem chegar). As erradas passam a janela 0: elas não tocam."""
    levels = [_Level("", window, tier)]
    levels += [_Level(f"janela de {k} dia(s)", k, tier) for k in range(window - 1, 0, -1)]
    last = min(window, 1)
    levels.append(_Level("a franquia de uma resposta do acertar o anime", last, tier, False))
    levels.append(_Level("qualquer faixa do titulo", last, "any", False))
    levels.append(_Level("repete uma resposta de outro diário do dia", last, "any", False, False))
    return levels


def _candidates(
    idx: _Index, tier: str, window: int, history: _History, d: date, used: _Used
) -> tuple[int, str, list[JSON]]:
    for n, level in enumerate(_levels(tier, window)):
        found = []
        for track in idx.pools[level.ruler]:
            # Nunca afrouxam: a música do dia e o anime da rodada.
            if track["songKey"] in used.day_songs or anime_of(track) in used.round_animes:
                continue
            franchises = set(track["anime"]["franchiseIds"])
            if level.avoid_titles and franchises & used.title_franchises:
                continue
            if level.avoid_others and track["songKey"] in used.other_songs:
                continue
            if _outside(history.songs.get(track["songKey"]), d, level.window):
                found.append(track)
        if found:
            return n, level.what, found
    return -1, "", []


def _weighted(
    rng: Mulberry32, options: Sequence[JSON], tier: str, round_franchises: set[str], typed: bool
) -> JSON:
    """O sorteio ponderado: 1 número do rng, o randint sobre a soma. A franquia que já está na
    rodada pesa 1, e a nova, FRANCHISE_NEW; nas que tocam, o peso do tipo do tema (P252)
    multiplica (nas erradas, o tipo já foi escolhido)."""

    def weight(track: JSON) -> int:
        repeated = set(track["anime"]["franchiseIds"]) & round_franchises
        kind = THEME_WEIGHTS[tier][theme_type(track)] if typed else 1
        return kind * (1 if repeated else FRANCHISE_NEW)

    weights = [weight(t) for t in options]
    r = rng.randint(sum(weights))
    for track, w in zip(options, weights, strict=True):
        r -= w
        if r < 0:
            return track
    raise ScheduleError("erro interno: sorteio fora da soma dos pesos")


def _take(track: JSON, used: _Used) -> None:
    used.day_songs.add(track["songKey"])
    used.round_animes.add(anime_of(track))
    used.round_franchises |= set(track["anime"]["franchiseIds"])


def _generate_day(
    days: dict[str, JSON], d: date, epoch: date, idx: _Index, others: _Others
) -> tuple[JSON, list[str]]:
    answers, titles = others.answers(d)
    history = _history(days, idx)
    seen = set(history.songs) | {
        idx.tracks[a]["songKey"] for a in others.before(d) if a in idx.tracks
    }
    used = _Used(
        other_songs={idx.tracks[a]["songKey"] for a in answers if a in idx.tracks},
        title_franchises={f for a in titles if a in idx.tracks for f in _franchises(idx, a)},
    )
    relaxations: list[str] = []
    day: JSON = {"number": (d - epoch).days + 1, "catalogVersion": idx.version}
    for tier in TIERS:
        rng = seeded(f"musicle-jp|anime-royale|{d.isoformat()}|{tier}")
        used.round_animes, used.round_franchises = set(), set()

        def pick(window: int, what: str, tier: str = tier) -> list[JSON]:
            level, relaxed, candidates = _candidates(idx, tier, window, history, d, used)
            if not candidates:
                raise ScheduleError(f"{d}: sem faixa possível para {tier} ({what})")
            if level:
                relaxations.append(f"{d} {tier} ({what}): afrouxamento nível {level} ({relaxed})")
            return candidates

        played: list[JSON] = []
        fresh = 0  # as que nunca saíram que a rodada já levou
        for _ in range(PLAYED):
            candidates = pick(idx.window, "tocam")
            if fresh >= NEW_PER_ROUND.get(tier, PLAYED):
                candidates = _prefer_seen(candidates, seen)
            oldest = _oldest_third(candidates, history)
            track = _weighted(rng, oldest, tier, used.round_franchises, typed=True)
            if track["songKey"] not in seen:
                fresh += 1
            _take(track, used)
            played.append(track)
        kinds = [theme_type(t) for t in played]
        rng.shuffle(kinds)
        wrong: list[JSON] = []
        for kind in kinds[: OPTIONS - PLAYED]:
            candidates = pick(0, "erradas")
            same_kind = [t for t in candidates if theme_type(t) == kind] or candidates
            track = _weighted(rng, same_kind, tier, used.round_franchises, typed=False)
            _take(track, used)
            wrong.append(track)
        options = [t["id"] for t in (*played, *wrong)]
        rng.shuffle(options)
        day[tier] = {"played": [t["id"] for t in played], "options": options}
    return day, relaxations


def _franchises(idx: _Index, track_id: str) -> list[str]:
    return idx.tracks[track_id]["anime"]["franchiseIds"]


def _future_warnings(schedule: JSON, today: date, idx: _Index) -> list[str]:
    """Dias futuros já gravados não mudam; se envelheceram mal, o jogo anula a rodada (P238)."""
    warnings = []
    for day_str, day in sorted(schedule["days"].items()):
        if date.fromisoformat(day_str) < today:
            continue
        for tier, rnd in royale_rounds(day):
            tracks = [idx.tracks.get(a) for a in rnd["options"]]
            if any(t is None or not t["eligible"]["daily"] for t in tracks):
                warnings.append(f"{day_str} {tier}: uma opção não é mais elegível")
    return warnings


def generate_royale(
    catalog: JSON,
    anime_schedule: JSON,
    mixed_schedule: JSON,
    quiz_schedule: JSON | None,
    existing: JSON | None,
    today: date,
    epoch: date | None = None,
    horizon: int = HORIZON_DAYS,
) -> Result:
    """Acrescenta os dias que faltam até today + horizon, sem passar do último dia das agendas do
    Anime, das Misturadas e do quiz (cada dia lê as respostas delas). Nunca altera um dia
    existente. As agendas do Anime e das Misturadas são conferidas aqui também; a do quiz (os
    meses juntos, o `read_quiz_dir`) só é lida."""
    idx = _Index(catalog)
    problems = validate_anime_schedule(anime_schedule, catalog)
    problems += validate_mixed_schedule(mixed_schedule, catalog)
    if problems:
        raise ScheduleError("agendas ao lado inválidas:\n" + "\n".join(problems))
    warnings: list[str] = []
    if existing is not None:
        problems = validate_royale_schedule(existing, catalog)
        if problems:
            raise ScheduleError("agenda do Royale existente inválida:\n" + "\n".join(problems))
        warnings = _future_warnings(existing, today, idx)
    others = _Others(
        anime_schedule["days"],
        mixed_schedule["days"],
        None if quiz_schedule is None else quiz_schedule["days"],
    )
    if quiz_schedule is None:
        warnings.append("sem a agenda do quiz: o Royale não evita as músicas dele")
    last = others.last_day()
    if last is not None:
        horizon = min(horizon, (date.fromisoformat(last) - today).days)
    header = {"schemaVersion": SCHEMA_VERSION, "kind": KIND, "timezone": TIMEZONE}
    return grow(
        existing,
        header,
        today,
        epoch,
        horizon,
        lambda days, d, start: _generate_day(days, d, start, idx, others),
        warnings,
    )


def royale_generator(
    anime_schedule: JSON, mixed_schedule: JSON, quiz_schedule: JSON | None
) -> Generator:
    """O gerador com a assinatura do `generate` (o `regenerate_problems` o recebe), sobre as
    agendas ao lado (as do mesmo commit, no schedule-check)."""

    def generator(
        catalog: JSON, existing: JSON | None, today: date, epoch: date | None, horizon: int
    ) -> Result:
        return generate_royale(
            catalog, anime_schedule, mixed_schedule, quiz_schedule, existing, today, epoch, horizon
        )

    return generator


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(anime_royale_schema_path())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate_royale_schedule(schedule: JSON, catalog: JSON) -> list[str]:
    """Validação ESTRUTURAL, que vale para todos os dias: o schema (5 que tocam e 9 opções), o
    epoch, o número, as faixas existem no catálogo, as que tocam estão nas opções e nenhuma faixa
    repetida no dia. As regras da geração ficam com o `royale_rule_problems`."""
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
        options: list[str] = []
        for tier, rnd in royale_rounds(day):
            missing = [p for p in rnd["played"] if p not in rnd["options"]]
            if missing:
                problems.append(f"{where} {tier}: tocam fora das opções: {', '.join(missing)}")
            for option in rnd["options"]:
                if option not in tracks:
                    problems.append(f"{where} {tier}: opção inexistente {option}")
                options.append(option)
        repeated = sorted({o for o in options if options.count(o) > 1})
        if repeated:
            problems.append(f"{where}: faixa repetida no dia: {', '.join(repeated)}")
    return problems


def _day_rule_problems(where: str, day: JSON, tracks: Mapping[str, JSON]) -> list[str]:
    problems = []
    songs: set[str] = set()
    for tier, rnd in royale_rounds(day):
        at = f"{where} {tier}"
        animes: list[str] = []
        for option in rnd["options"]:
            track = tracks.get(option)
            if track is None:
                continue  # a validação estrutural já acusa
            if not track["eligible"]["daily"]:
                problems.append(f"{at}: opção inelegível ({track['eligible']['reason']})")
            if track["songKey"] in songs:
                problems.append(f"{at}: música repetida no dia")
            songs.add(track["songKey"])
            if track["anime"]["tiers"][MODE] is None:
                problems.append(f"{at}: faixa fora do acertar o anime")
            if track["anime"]["themes"][0]["cover"] is None:
                problems.append(f"{at}: opção sem capa ({option})")
            else:
                animes.append(anime_of(track))
        if len(animes) != len(set(animes)):
            problems.append(f"{at}: duas opções do mesmo anime")
    return problems


def royale_rule_problems(schedule: JSON, catalog: JSON) -> tuple[list[str], list[str]]:
    """As regras da geração que nunca afrouxam, dia a dia: cada opção elegível, do acertar o anime
    e com capa, nenhuma música repetida no dia e um anime por opção na rodada. Devolve (erros,
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
