"""Agenda do Anime (M14, Apêndice M do PLANO): os 6 diários de cada dia, 2 modos × 3
dificuldades (P231, P232), de 3 rodadas digitadas cada.

A regra de ouro é a dos Hits (`schedule.py`): a agenda SÓ CRESCE. O laço (o cabeçalho, a P44, o
horizonte e a defesa do `compare`) é o `grow` de lá, e o `compare`, o `check_dates` e o
`regenerate_problems` também valem aqui. Só o dia é outro:

- **A ordem e a semente:** para cada modo (`musica`, `titulo`) e cada dificuldade (`facil`,
  `medio`, `dificil`), nessa ordem, um diário com o rng de
  "musicle-jp|anime|<data>|<modo>|<dificuldade>". Cada rodada consome exatamente 1 número do
  rng: o sorteio ponderado (`randint` sobre a soma dos pesos inteiros).
- **As candidatas** de um diário: as faixas elegíveis cuja faixa no modo é a dificuldade dele.
- **A janela** (P235, P245): a música (o `songKey`, que junta as versões) que saiu em qualquer
  diário, dos dois modos, nos últimos K dias fica de fora; K = 21, 28 e 35 no Fácil, no Médio e
  no Difícil. Hoje conta como um dos K: a música de K dias atrás volta. Assim, 6 × K músicas por
  dificuldade (3 por dia em cada modo) bastam, o mínimo da P235. Com acervo curto, K = mín(K,
  músicas do diário // 6), e no mínimo 1.
- **Dentro do dia:** nenhuma música repete nos 18, e no `titulo` nenhuma franquia repete no
  diário. Essas duas nunca afrouxam.
- **O afrouxamento,** com registro (vai para o corpo do PR, como aviso de acervo curto): o nível
  0 tem todas as regras, inclusive a franquia espaçada entre dias (a que saiu nos últimos
  mín(7, K) dias fica de fora: Conan e One Piece têm dezenas de temas); o nível 1 tira esse
  espaçamento; do 2 em diante, a janela encolhe (K − 1, ..., 1; com 1, só valem as regras do
  dia).
- **A preferência** (P236): o sorteio sai do terço mais antigo das candidatas, pelo último dia em
  que cada música saiu (a nunca usada conta como a mais antiga, e os empates no corte entram
  juntos), e não "sempre a mais antiga", que viraria um rodízio previsível. O último dia vem da
  agenda anterior inteira, então regerar os dias novos dá o mesmo resultado (ME51).
- **O tipo do tema** (P252): o peso de cada candidata é o do tipo mais fácil entre os temas da
  faixa (a abertura, o encerramento ou a insert song), na dificuldade do diário.

Mudou o consumo do rng, a ordem, os pesos ou uma regra? Isso muda só os dias novos (regra 13 do
`pipeline/CLAUDE.md`): o `schedule-check` protege os gravados.
"""

from __future__ import annotations

import math
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from datetime import date
from functools import cache

from jsonschema import Draft202012Validator

from musicle_pipeline.anime import MODES, THEME_TYPES, TIERS
from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import anime_schedule_schema_path
from musicle_pipeline.prng import Mulberry32, seeded
from musicle_pipeline.schedule import (
    HORIZON_DAYS,
    ROUNDS,
    TIMEZONE,
    Result,
    ScheduleError,
    grow,
)

SCHEMA_VERSION = 1
KIND = "anime"
# A janela de cada dificuldade, em dias, com hoje (P235).
WINDOWS = {"facil": 21, "medio": 28, "dificil": 35}
# As respostas de uma dificuldade por dia: 3 rodadas em cada um dos 2 modos. 6 × K músicas
# sustentam a janela K (P235).
DAILY_PER_TIER = ROUNDS * len(MODES)
# O espaçamento da franquia entre dias, no nível 0: no máximo uma vez por semana (e nunca mais que
# a janela do diário). Provisório, como os pesos: a carga grande (C2) mede.
FRANCHISE_DAYS = 7
# Os pesos do tipo do tema no sorteio (P252), inteiros. Provisórios: os números finais saem da
# carga grande (C2). No Fácil e no Médio, a abertura 3 vezes mais que o encerramento; no Difícil,
# a insert song rara. O `tier_of` do anime.py já põe a insert só no Difícil: o peso dela no
# Fácil e no Médio só garante que a soma nunca é zero.
THEME_WEIGHTS = {
    "facil": {"OP": 3, "ED": 1, "IN": 1},
    "medio": {"OP": 3, "ED": 1, "IN": 1},
    "dificil": {"OP": 3, "ED": 3, "IN": 1},
}


def pool_sizes(catalog: JSON) -> dict[tuple[str, str], int]:
    """Quantas músicas (`songKey`) elegíveis cada modo e dificuldade têm."""
    songs: dict[tuple[str, str], set[str]] = {(m, t): set() for m in MODES for t in TIERS}
    for track in catalog["tracks"]:
        if not track["eligible"]["daily"]:
            continue
        for mode in MODES:
            tier = track["anime"]["tiers"][mode]
            if tier is not None:
                songs[mode, tier].add(track["songKey"])
    return {key: len(found) for key, found in songs.items()}


def window_of(tier: str, songs: int) -> int:
    """A janela efetiva: a da dificuldade, ou menos, com acervo curto (6 respostas por dia)."""
    return max(1, min(WINDOWS[tier], songs // DAILY_PER_TIER))


def short_pools(catalog: JSON) -> list[str]:
    """O aviso de acervo curto (P235): o modo e a dificuldade com menos de 6 × K músicas."""
    warnings = []
    for (mode, tier), songs in pool_sizes(catalog).items():
        need = DAILY_PER_TIER * WINDOWS[tier]
        if songs < need:
            warnings.append(
                f"{mode} {tier}: {songs} música(s), menos de {DAILY_PER_TIER} × {WINDOWS[tier]}"
                f" = {need} (P235); a janela cai para {window_of(tier, songs)} dia(s)"
            )
    return warnings


def _one_per_song(ordered: Sequence[JSON], mode: str, tier: str) -> list[JSON]:
    """As faixas elegíveis do diário, uma por música (o songKey junta a TV size e a completa):
    duas faixas da mesma música dobrariam o peso dela no sorteio. Fica a de menor id."""
    seen: set[str] = set()
    pool = []
    for track in ordered:
        playable = track["eligible"]["daily"] and track["anime"]["tiers"][mode] == tier
        if playable and track["songKey"] not in seen:
            seen.add(track["songKey"])
            pool.append(track)
    return pool


class _Index:
    """Acesso rápido ao catálogo do Anime durante a geração."""

    def __init__(self, catalog: JSON) -> None:
        if "franchises" not in catalog:
            raise ScheduleError("o catálogo não é o do Anime (falta franchises)")
        self.version = catalog["catalogVersion"]
        self.tracks = {t["id"]: t for t in catalog["tracks"]}
        ordered = sorted(catalog["tracks"], key=lambda t: t["id"])
        self.pools = {(m, t): _one_per_song(ordered, m, t) for m in MODES for t in TIERS}
        self.windows = {key: window_of(key[1], n) for key, n in pool_sizes(catalog).items()}


def _rounds(day: JSON) -> Iterator[tuple[str, str, int, str]]:
    """(modo, dificuldade, rodada, resposta) de cada rodada do dia, na ordem da geração."""
    for mode in MODES:
        for tier in TIERS:
            for n, rnd in enumerate(day[mode][tier], start=1):
                yield mode, tier, n, rnd["answer"]


@dataclass
class _History:
    """O último dia em que cada música e cada franquia saíram, em qualquer diário."""

    songs: dict[str, date] = field(default_factory=dict)
    franchises: dict[str, date] = field(default_factory=dict)


def _history(days: dict[str, JSON], idx: _Index) -> _History:
    """Montado com a agenda anterior inteira (P236): o mesmo, seja qual for o 1º dia gerado."""
    history = _History()
    for day_str in sorted(days):  # datas ISO comparam certo como texto: o último dia fica
        d = date.fromisoformat(day_str)
        for _mode, _tier, _n, answer in _rounds(days[day_str]):
            track = idx.tracks.get(answer)
            if track is None:
                continue
            history.songs[track["songKey"]] = d
            for fid in track["anime"]["franchiseIds"]:
                history.franchises[fid] = d
    return history


def _outside(last: date | None, d: date, window: int) -> bool:
    """Fora da janela: nunca saiu, ou saiu há `window` dias ou mais (hoje conta como um deles)."""
    return last is None or (d - last).days >= window


def _candidates(
    pool: Sequence[JSON],
    history: _History,
    d: date,
    window: int,
    mode: str,
    day_songs: set[str],
    diary_franchises: set[str],
) -> tuple[int, str, list[JSON]]:
    """Primeiro nível de afrouxamento com candidata; devolve (nível, o que afrouxou, candidatas).

    Nível 0 = todas as regras; 1 = sem espaçar a franquia entre dias; 2 em diante = janela
    K - 1, K - 2, ..., 1. A música do dia e a franquia do diário (no titulo) nunca afrouxam.
    """
    spacing = min(FRANCHISE_DAYS, window)
    levels = [(window, True), (window, False)]
    levels += [(k, False) for k in range(window - 1, 0, -1)]
    fixed = [
        t
        for t in pool
        if t["songKey"] not in day_songs
        and not (mode == "titulo" and diary_franchises & set(t["anime"]["franchiseIds"]))
    ]

    def spaced_out(track: JSON) -> bool:
        return all(
            _outside(history.franchises.get(f), d, spacing) for f in track["anime"]["franchiseIds"]
        )

    for level, (k, spaced) in enumerate(levels):
        found = [
            t
            for t in fixed
            if _outside(history.songs.get(t["songKey"]), d, k) and (not spaced or spaced_out(t))
        ]
        if found:
            what = "sem espaçar a franquia" if level == 1 else f"janela de {k} dia(s)"
            return level, what, found
    return len(levels), "", []


def _oldest_third(candidates: Sequence[JSON], history: _History) -> list[JSON]:
    """O terço mais antigo (P236), pelo último dia em que a música saiu. A nunca usada conta como
    a mais antiga, e os empates no corte entram juntos (no começo, todas)."""

    def last(track: JSON) -> date:
        return history.songs.get(track["songKey"], date.min)

    ordered = sorted(candidates, key=lambda t: (last(t), t["id"]))
    cut = last(ordered[math.ceil(len(ordered) / 3) - 1])
    return [t for t in ordered if last(t) <= cut]


def theme_type(track: JSON) -> str:
    """O tipo mais fácil entre os temas da faixa (a abertura, o encerramento, a insert song)."""
    return min((theme["type"] for theme in track["anime"]["themes"]), key=THEME_TYPES.index)


def _weighted(rng: Mulberry32, options: Sequence[JSON], tier: str) -> JSON:
    """O sorteio ponderado pelo tipo do tema (P252): 1 número do rng, o randint sobre a soma."""
    weights = [THEME_WEIGHTS[tier][theme_type(t)] for t in options]
    r = rng.randint(sum(weights))
    for track, weight in zip(options, weights, strict=True):
        r -= weight
        if r < 0:
            return track
    raise ScheduleError("erro interno: sorteio fora da soma dos pesos")


def _generate_day(
    days: dict[str, JSON], d: date, epoch: date, idx: _Index
) -> tuple[JSON, list[str]]:
    history = _history(days, idx)
    day_songs: set[str] = set()
    relaxations: list[str] = []
    day: JSON = {"number": (d - epoch).days + 1, "catalogVersion": idx.version}
    for mode in MODES:
        day[mode] = {}
        for tier in TIERS:
            rng = seeded(f"musicle-jp|anime|{d.isoformat()}|{mode}|{tier}")
            diary_franchises: set[str] = set()
            rounds = []
            for n in range(1, ROUNDS + 1):
                level, what, candidates = _candidates(
                    idx.pools[mode, tier],
                    history,
                    d,
                    idx.windows[mode, tier],
                    mode,
                    day_songs,
                    diary_franchises,
                )
                if not candidates:
                    raise ScheduleError(f"{d}: sem faixa possível para {mode} {tier}, rodada {n}")
                if level:
                    relaxations.append(
                        f"{d} {mode} {tier} rodada {n}: afrouxamento nível {level} ({what})"
                    )
                answer = _weighted(rng, _oldest_third(candidates, history), tier)
                rounds.append({"answer": answer["id"]})
                day_songs.add(answer["songKey"])
                diary_franchises.update(answer["anime"]["franchiseIds"])
            day[mode][tier] = rounds
    return day, relaxations


def _future_warnings(schedule: JSON, today: date, idx: _Index) -> list[str]:
    """Dias futuros já gravados não mudam; se envelheceram mal, o jogo anula a rodada (P238)."""
    warnings = []
    for day_str, day in sorted(schedule["days"].items()):
        if date.fromisoformat(day_str) < today:
            continue
        for mode, tier, n, answer in _rounds(day):
            track = idx.tracks.get(answer)
            if track is None or not track["eligible"]["daily"]:
                warnings.append(f"{day_str} {mode} {tier} rodada {n}: resposta não é mais elegível")
    return warnings


def generate_anime(
    catalog: JSON,
    existing: JSON | None,
    today: date,
    epoch: date | None = None,
    horizon: int = HORIZON_DAYS,
) -> Result:
    """Acrescenta os dias que faltam até today + horizon (o `--days`). Nunca altera um dia
    existente. A regra do robô (só gerar com menos de 21 dias à frente, P237) fica fora daqui."""
    idx = _Index(catalog)
    warnings: list[str] = []
    if existing is not None:
        problems = validate_anime_schedule(existing, catalog)
        if problems:
            raise ScheduleError("agenda do Anime existente inválida:\n" + "\n".join(problems))
        warnings = _future_warnings(existing, today, idx)
    header = {"schemaVersion": SCHEMA_VERSION, "kind": KIND, "timezone": TIMEZONE}
    return grow(
        existing,
        header,
        today,
        epoch,
        horizon,
        lambda days, d, start: _generate_day(days, d, start, idx),
        warnings,
    )


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(anime_schedule_schema_path())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate_anime_schedule(schedule: JSON, catalog: JSON) -> list[str]:
    """Validação ESTRUTURAL, que vale para todos os dias, inclusive os antigos: o schema, o
    epoch, o número, as respostas existem no catálogo (os ids do Anime nunca somem) e nenhuma
    faixa repete no dia. As regras da geração ficam com o `rule_problems`."""
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
    # Buraco é válido (P44): um dia que não foi gerado a tempo fica sem diário.
    before = [d.isoformat() for d in dates if d < epoch]
    if before:
        problems.append(f"dias antes do epoch: {', '.join(before)}")
    for d in dates:
        where = d.isoformat()
        day = schedule["days"][where]
        if day["number"] != (d - epoch).days + 1:
            problems.append(f"{where}: number deveria ser {(d - epoch).days + 1}")
        answers = []
        for mode, tier, n, answer in _rounds(day):
            if answer not in tracks:
                problems.append(f"{where} {mode} {tier} rodada {n}: resposta inexistente {answer}")
            answers.append(answer)
        repeated = sorted({a for a in answers if answers.count(a) > 1})
        if repeated:
            problems.append(f"{where}: faixa repetida no dia: {', '.join(repeated)}")
    return problems


def _day_rule_problems(where: str, day: JSON, tracks: dict[str, JSON]) -> list[str]:
    problems = []
    songs: dict[str, str] = {}
    franchises: dict[tuple[str, str], set[str]] = {}
    for mode, tier, n, answer in _rounds(day):
        track = tracks.get(answer)
        if track is None:
            continue  # a validação estrutural já acusa
        at = f"{where} {mode} {tier} rodada {n}"
        if not track["eligible"]["daily"]:
            problems.append(f"{at}: resposta inelegível ({track['eligible']['reason']})")
        if track["anime"]["tiers"][mode] != tier:
            problems.append(f"{at}: a faixa é {track['anime']['tiers'][mode]} nesse modo")
        song = track["songKey"]
        if song in songs:
            problems.append(f"{at}: música repetida no dia (já em {songs[song]})")
        songs.setdefault(song, f"{mode} {tier} rodada {n}")
        if mode == "titulo":
            used = franchises.setdefault((mode, tier), set())
            if used & set(track["anime"]["franchiseIds"]):
                problems.append(f"{at}: franquia repetida no diário")
            used.update(track["anime"]["franchiseIds"])
    return problems


def rule_problems(schedule: JSON, catalog: JSON) -> tuple[list[str], list[str]]:
    """As regras da geração, dia a dia: cada resposta elegível e da faixa do diário, nenhuma
    música repetida nos 18 e, no titulo, nenhuma franquia repetida no diário. Devolve (erros,
    avisos).

    São erro nos dias gerados com este catálogo (o mesmo catalogVersion: o schedule-anime roda
    depois do build-anime). Nos de antes, só avisam: o catálogo mudou depois, o jogo anula a
    rodada que ficou inelegível, e uma faixa recalibrada só vale para os dias novos. Um dia
    gerado com um catálogo de data mais nova que a deste é erro (o catálogo ficou para trás).
    """
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
