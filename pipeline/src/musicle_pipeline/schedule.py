"""Agenda dos diários: quais músicas tocam em cada dia e, no Normal, com quais opções.

Regra de ouro: a agenda SÓ CRESCE. Um dia gravado nunca muda, nem quando o catálogo muda;
quem jogou o dia 5 ontem e quem joga hoje viram o mesmo diário. Por isso:

- a geração parte do último dia gravado e só acrescenta dias de hoje em diante: dia que já
  passou nunca é gerado (P44), e o buraco que sobra fica sem diário para sempre;
- "hoje" é argumento (--today), nunca o relógio, e o fuso do jogo é America/Sao_Paulo;
- a validação de dias antigos é só estrutural; elegibilidade e restrições valem na geração.

Dois modos (P100): o Normal (lista "album") escolhe o álbum entre 4 opções; o Desafio (lista
"song") digita o nome da música, sem opções. Cada rodada do Normal consome exatamente 7 números
do rng: 1 para a resposta, 3 para escolher os distratores (Fisher-Yates parcial) e 3 para
embaralhar as 4 opções. A do Desafio consome só 1, o da resposta. Os dias gravados antes dos
dois modos têm opções também na lista "song" e continuam assim (a agenda só cresce): o jogo as
ignora.

A agenda do Anime (M14, `anime_schedule.py`) usa o mesmo laço (`grow`), o `compare`, o
`check_dates` e o `regenerate_problems`; só o dia é outro.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import cache
from itertools import pairwise

from jsonschema import Draft202012Validator

from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import repo_root, schedule_schema_path
from musicle_pipeline.prng import Mulberry32, seeded
from musicle_pipeline.similarity import MIN_OPTIONS

SCHEMA_VERSION = 1
TIMEZONE = "America/Sao_Paulo"
HORIZON_DAYS = 21
ROUNDS = 3
TARGETS = ("song", "album")
MAX_WINDOW = 180


class ScheduleError(ValueError):
    """A agenda não pode ser gerada ou está inconsistente."""


@dataclass
class Result:
    schedule: JSON
    added: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    relaxations: list[str] = field(default_factory=list)


def window_size(catalog: JSON) -> int:
    """K = mín(180, piso(0,5 × P / 6)), P = músicas distintas elegíveis; 6 respostas por dia."""
    songs = {t["songKey"] for t in catalog["tracks"] if t["eligible"]["daily"]}
    return min(MAX_WINDOW, len(songs) // 12)


class _Index:
    """Acesso rápido ao catálogo durante a geração."""

    def __init__(self, catalog: JSON) -> None:
        self.version = catalog["catalogVersion"]
        self.tracks = {t["id"]: t for t in catalog["tracks"]}
        self.albums = {a["id"]: a for a in catalog["albums"]}
        self.eligible = sorted(
            (t for t in catalog["tracks"] if t["eligible"]["daily"]),
            key=lambda t: (-t["popularity"], t["id"]),
        )
        self.window = window_size(catalog)

    def album_songs(self, album_id: str) -> set[str]:
        return {t["songKey"] for t in self.tracks.values() if t["albumId"] == album_id}


@dataclass
class _Used:
    """O que as respostas já escolhidas de um conjunto de dias ocupam."""

    tracks: set[str] = field(default_factory=set)
    songs: set[str] = field(default_factory=set)
    albums: set[str] = field(default_factory=set)

    def add(self, track: JSON) -> None:
        self.tracks.add(track["id"])
        self.songs.add(track["songKey"])
        self.albums.add(track["albumId"])

    def blocks(self, track: JSON) -> bool:
        return (
            track["id"] in self.tracks
            or track["songKey"] in self.songs
            or track["albumId"] in self.albums
        )


def _day_answers(day: JSON) -> Iterable[str]:
    for target in TARGETS:
        for rnd in day[target]:
            yield rnd["answer"]


def _recent(days: dict[str, JSON], d: date, window: int, idx: _Index) -> _Used:
    used = _Used()
    for back in range(1, window + 1):
        previous = days.get((d - timedelta(days=back)).isoformat())
        for answer in _day_answers(previous) if previous else ():
            track = idx.tracks.get(answer)
            if track:
                used.add(track)
    return used


def _pick_distractors(rng: Mulberry32, pool: list[str]) -> list[str]:
    """Fisher-Yates parcial: 3 trocas, 3 números do rng."""
    pool = list(pool)
    for i in range(MIN_OPTIONS):
        j = i + rng.randint(len(pool) - i)
        pool[i], pool[j] = pool[j], pool[i]
    return pool[:MIN_OPTIONS]


def _candidates(
    days: dict[str, JSON],
    d: date,
    idx: _Index,
    day_used: _Used,
    artists_by_target: dict[str, set[str]],
    target: str,
) -> tuple[int, list[JSON]]:
    """Primeiro nível de afrouxamento com candidato; devolve (nível, candidatos).

    Nível 0 = todas as regras; 1 = artista só não repete dentro do mesmo diário;
    2 em diante = janela K-1, K-2, ..., 0. Faixa, música e álbum nunca repetem no dia.
    """
    levels = [(idx.window, True), (idx.window, False)]
    levels += [(k, False) for k in range(idx.window - 1, -1, -1)]
    for level, (window, cross_target) in enumerate(levels):
        recent = _recent(days, d, window, idx)
        banned_artists = set(artists_by_target[target])
        if cross_target:
            banned_artists = banned_artists.union(*artists_by_target.values())
        candidates = [
            t
            for t in idx.eligible
            if not recent.blocks(t)
            and not day_used.blocks(t)
            and not banned_artists & set(t["artistIds"])
        ]
        if candidates:
            return level, candidates
    return len(levels), []


def _generate_day(days: dict[str, JSON], d: date, epoch: date, idx: _Index) -> tuple[JSON, list]:
    day_used = _Used()
    artists_by_target: dict[str, set[str]] = {t: set() for t in TARGETS}
    relaxations: list[str] = []
    day: JSON = {
        "number": (d - epoch).days + 1,
        "catalogVersion": idx.version,
        "song": [],
        "album": [],
    }
    for target in TARGETS:
        rng = seeded(f"musicle-jp|{d.isoformat()}|{target}")
        answered_songs: set[str] = set()
        answered_albums: set[str] = set()
        for rnd in range(ROUNDS):
            level, candidates = _candidates(days, d, idx, day_used, artists_by_target, target)
            if not candidates:
                raise ScheduleError(f"{d}: sem faixa possível para {target}, rodada {rnd + 1}")
            if level:
                relaxations.append(f"{d} {target} rodada {rnd + 1}: afrouxamento nível {level}")

            # Faixa de dificuldade cortada depois do filtro: nunca fica vazia.
            tier = math.ceil(len(candidates) * (rnd + 1) / ROUNDS)
            answer = candidates[rng.randint(tier)]

            if target == "song":
                # Desafio: digitado, sem opções.
                day[target].append({"answer": answer["id"]})
            else:
                correct = answer["albumId"]
                pool = [
                    a
                    for a in idx.albums[correct]["similar"]
                    if a not in answered_albums and not idx.album_songs(a) & answered_songs
                ]
                if len(pool) < MIN_OPTIONS:
                    pool = list(idx.albums[correct]["similar"])
                options = [correct, *_pick_distractors(rng, pool)]
                rng.shuffle(options)
                day[target].append({"answer": answer["id"], "options": options})
            day_used.add(answer)
            artists_by_target[target] |= set(answer["artistIds"])
            answered_songs.add(answer["songKey"])
            answered_albums.add(answer["albumId"])
    return day, relaxations


def _future_warnings(schedule: JSON, today: date, idx: _Index) -> list[str]:
    """Dias futuros já gravados não mudam; se envelheceram mal, o jogo anula a rodada."""
    warnings = []
    for day_str, day in sorted(schedule["days"].items()):
        if date.fromisoformat(day_str) < today:
            continue
        for target in TARGETS:
            for n, rnd in enumerate(day[target], start=1):
                track = idx.tracks.get(rnd["answer"])
                if track is None or not track["eligible"]["daily"]:
                    warnings.append(f"{day_str} {target} rodada {n}: resposta não é mais elegível")
    return warnings


def generate(
    catalog: JSON,
    existing: JSON | None,
    today: date,
    epoch: date | None = None,
    horizon: int = HORIZON_DAYS,
) -> Result:
    """Acrescenta os dias que faltam até today + horizon. Nunca altera um dia existente."""
    idx = _Index(catalog)
    warnings: list[str] = []
    if existing is not None:
        problems = validate_schedule(existing, catalog)
        if problems:
            raise ScheduleError("agenda existente inválida:\n" + "\n".join(problems))
        warnings = _future_warnings(existing, today, idx)
    header = {"schemaVersion": SCHEMA_VERSION, "timezone": TIMEZONE}
    return grow(
        existing,
        header,
        today,
        epoch,
        horizon,
        lambda days, d, start: _generate_day(days, d, start, idx),
        warnings,
    )


# O gerador de um dia: (os dias anteriores, a data, o epoch) → (o dia, os afrouxamentos).
MakeDay = Callable[[dict[str, JSON], date, date], tuple[JSON, list[str]]]
# O gerador de uma agenda inteira, com a assinatura do `generate` (o `regenerate_problems` o
# recebe, para valer também para o Anime).
Generator = Callable[[JSON, JSON | None, date, date | None, int], Result]


def grow(
    existing: JSON | None,
    header: JSON,
    today: date,
    epoch: date | None,
    horizon: int,
    make_day: MakeDay,
    warnings: Iterable[str] = (),
) -> Result:
    """O laço comum das agendas (os Hits e o Anime, M14): acrescenta os dias que faltam até
    today + horizon e nunca altera um dia existente.

    `header` são os campos fixos de uma agenda nova, sem o epoch e os dias. A agenda existente
    já chega validada pelo chamador, que conhece o formato do dia; `warnings` (os dias futuros
    que envelheceram mal) abre a lista de avisos. O `make_day` só vê os dias anteriores ao que
    gera: é isso que deixa regerar os dias novos com o mesmo resultado (ME51).
    """
    if existing is None:
        if epoch is None:
            raise ScheduleError("agenda nova precisa de --epoch (a data do diário nº 1)")
        schedule: JSON = {**header, "epoch": epoch.isoformat(), "days": {}}
    else:
        if epoch is not None and epoch.isoformat() != existing["epoch"]:
            raise ScheduleError(f"--epoch {epoch} diverge do epoch da agenda {existing['epoch']}")
        schedule = {**existing, "days": dict(existing["days"])}
    start_epoch = date.fromisoformat(schedule["epoch"])

    result = Result(schedule=schedule, warnings=list(warnings))
    last = max(map(date.fromisoformat, schedule["days"]), default=start_epoch - timedelta(days=1))
    first_missing = max(start_epoch, last + timedelta(days=1))
    # P44 (a): dia que já passou nunca é gerado. Ninguém mais poderia jogá-lo, e ele entraria na
    # agenda como dia não jogado, quebrando a sequência de quem jogou todos os dias disponíveis.
    d = max(first_missing, today)
    if d > first_missing:
        gap = (d - first_missing).days
        gap_end = d - timedelta(days=1)
        result.warnings.append(
            f"buraco de {gap} dia(s) sem diário: {first_missing} a {gap_end} (P44)"
        )
    while d <= today + timedelta(days=horizon):
        day, relaxations = make_day(schedule["days"], d, start_epoch)
        schedule["days"][d.isoformat()] = day
        result.added.append(d.isoformat())
        result.relaxations.extend(relaxations)
        d += timedelta(days=1)

    # Defesa: nenhum dia antigo pode ter mudado.
    if existing is not None:
        changed = compare(existing, schedule)
        if changed:
            raise ScheduleError("erro interno, dia antigo alterado:\n" + "\n".join(changed))
    return result


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(schedule_schema_path())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate_schedule(schedule: JSON, catalog: JSON) -> list[str]:
    """Validação ESTRUTURAL, que vale para todos os dias, inclusive os antigos.

    Não confere elegibilidade nem restrições do dia: essas regras valem no momento da geração.
    Um dia antigo cuja resposta deixou de ser elegível continua válido.
    """
    errors = sorted(_validator().iter_errors(schedule), key=lambda e: list(e.absolute_path))
    if errors:
        return [f"schema: /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errors]
    problems: list[str] = []
    tracks = {t["id"]: t for t in catalog["tracks"]}
    albums = {a["id"] for a in catalog["albums"]}
    try:
        epoch = date.fromisoformat(schedule["epoch"])
        dates = sorted(date.fromisoformat(d) for d in schedule["days"])
    except ValueError as exc:
        return [f"data inválida: {exc}"]
    # Buraco é válido (P44): um dia que não foi gerado a tempo fica sem diário.
    before = [d.isoformat() for d in dates if d < epoch]
    if before:
        problems.append(f"dias antes do epoch: {', '.join(before)}")
    for d in dates:
        day = schedule["days"][d.isoformat()]
        where = d.isoformat()
        if day["number"] != (d - epoch).days + 1:
            problems.append(f"{where}: number deveria ser {(d - epoch).days + 1}")
        for n, rnd in enumerate(day["song"], start=1):
            if rnd["answer"] not in tracks:
                problems.append(f"{where} song rodada {n}: resposta inexistente {rnd['answer']}")
            # Só os dias de antes dos dois modos (P100) têm opções na lista "song".
            options = rnd.get("options")
            if options is None:
                continue
            if rnd["answer"] not in options:
                problems.append(f"{where} song rodada {n}: a resposta não está nas opções")
            missing = [o for o in options if o not in tracks]
            if missing:
                problems.append(f"{where} song rodada {n}: faixas inexistentes {missing}")
        for n, rnd in enumerate(day["album"], start=1):
            track = tracks.get(rnd["answer"])
            if track is None:
                problems.append(f"{where} album rodada {n}: resposta inexistente {rnd['answer']}")
            elif track["albumId"] not in rnd["options"]:
                problems.append(
                    f"{where} album rodada {n}: o álbum da resposta não está nas opções"
                )
            missing = [o for o in rnd["options"] if o not in albums]
            if missing:
                problems.append(f"{where} album rodada {n}: álbuns inexistentes {missing}")
    return problems


def compare(base: JSON | None, current: JSON) -> list[str]:
    """Problemas de "só acréscimo": dia que sumiu ou mudou, dia novo no meio da agenda da base
    (preencheria um buraco com um dia que já passou, P44) ou cabeçalho alterado."""
    if base is None:
        return []
    # O "kind" só existe nas agendas do Anime (M14) e das Misturadas (M17); nos Hits, falta dos
    # dois lados.
    problems = [
        f"{key} mudou: {base.get(key)!r} → {current.get(key)!r}"
        for key in ("schemaVersion", "kind", "timezone", "epoch")
        if base.get(key) != current.get(key)
    ]
    for day_str, day in sorted(base["days"].items()):
        if day_str not in current["days"]:
            problems.append(f"{day_str}: dia removido")
        elif current["days"][day_str] != day:
            problems.append(f"{day_str}: dia alterado")
    if base["days"]:
        # Datas ISO (AAAA-MM-DD) comparam certo como texto.
        base_last = max(base["days"])
        for day_str in sorted(current["days"]):
            if day_str not in base["days"] and day_str < base_last:
                problems.append(f"{day_str}: dia novo antes do fim da agenda da base ({base_last})")
    # Os dias novos de uma geração formam um bloco seguido (o generate acrescenta de um dia até
    # hoje + horizonte). Um dia solto mais à frente, com buraco antes, congelaria a agenda: o
    # buraco nunca mais poderia ser preenchido.
    try:
        added = [date.fromisoformat(d) for d in _added_days(base, current)]
    except ValueError as exc:
        return [*problems, f"data inválida: {exc}"]
    problems.extend(
        f"dias novos com buraco entre eles: {prev} e {nxt}"
        for prev, nxt in pairwise(added)
        if (nxt - prev).days != 1
    )
    return problems


def _added_days(base: JSON | None, current: JSON) -> list[str]:
    """Os dias da agenda que a base não tem, em ordem (datas ISO comparam certo como texto)."""
    known = base["days"] if base else {}
    return sorted(d for d in current["days"] if d not in known)


def check_dates(base: JSON | None, current: JSON, today: date) -> list[str]:
    """P44 na CI, que sabe que dia é hoje: dia novo nunca já passou, e o 1º dia novo é o 1º que a
    geração daria hoje. Um --today no futuro deixaria um buraco que nunca mais se preenche; um PR
    com o merge só no dia seguinte traria um dia que ninguém pôde jogar."""
    added = _added_days(base, current)
    if not added:
        return []
    problems = [
        f"{d}: dia novo antes de hoje ({today}), P44" for d in added if d < today.isoformat()
    ]
    try:
        floor = date.fromisoformat(current["epoch"])
        if base and base["days"]:
            floor = max(floor, date.fromisoformat(max(base["days"])) + timedelta(days=1))
    except (KeyError, ValueError) as exc:
        return [*problems, f"data inválida: {exc}"]
    expected = max(floor, today).isoformat()
    if added[0] > expected:
        problems.append(
            f"o 1º dia novo deveria ser {expected}, e não {added[0]}: o buraco ficaria para sempre"
            " (P44)"
        )
    return problems


def regenerate_problems(
    base: JSON | None, current: JSON, catalog: JSON, generator: Generator | None = None
) -> list[str]:
    """Os dias novos são os que o gerador daria (regra inviolável 3): o gerador (o `generate` dos
    Hits ou o do Anime) os refaz a partir da base, do 1º ao último. Cada dia só depende dos
    anteriores, da data e do catálogo, então o resultado não depende do --today da geração.
    Agenda nova (sem base) fica com o validate."""
    added = _added_days(base, current)
    if not base or not base["days"] or not added:
        return []
    first, last = date.fromisoformat(added[0]), date.fromisoformat(added[-1])
    try:
        again = (generator or generate)(catalog, base, first, None, (last - first).days).schedule
    except ScheduleError as exc:
        return [f"não deu para regerar os dias novos: {exc}"]
    problems = [
        f"{d}: dia novo diferente do que o gerador daria (editado à mão, ou o catálogo mudou"
        " depois do schedule?)"
        for d in added
        if again["days"].get(d) != current["days"][d]
    ]
    return problems


def commit_exists(ref: str) -> bool:
    """A revisão existe no clone e é (ou aponta para) um commit."""
    check = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
        cwd=repo_root(),
        capture_output=True,
        check=False,
    )
    return check.returncode == 0


# O SHA de um commit (SHA-1 ou SHA-256). O before de um branch novo é só de zeros.
_SHA = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")


def choose_base_ref(
    event: str, before: str | None, exists: Callable[[str], bool] = commit_exists
) -> tuple[str, str]:
    """A revisão com que a CI compara a agenda, e o porquê (ME12; antes, no YAML). No PR, o 1º
    pai do commit de merge de teste: a base exata do que foi testado (a ponta da main pode ter
    andado depois). No push, o `before`, a ponta de antes do push; sem ele (branch novo, só de
    zeros, ou fora do clone), o 1º pai."""
    if event == "pull_request":
        return "HEAD^1", "o 1º pai do commit de merge de teste do PR"
    if not before or _SHA.fullmatch(before) is None or not before.strip("0"):
        return "HEAD^1", "o 1º pai, porque o push não trouxe o before: branch novo?"
    if not exists(before):
        return "HEAD^1", f"o 1º pai, porque o before {before} não está no clone"
    return before, "a ponta de antes do push"


def read_base_ref(ref: str, path: str) -> JSON | None:
    """Lê o arquivo numa revisão do git, em bytes (sem passar por redirecionamento de shell).

    Ref inexistente é erro; arquivo ausente nessa revisão vale como agenda vazia.
    """
    if not commit_exists(ref):
        raise ScheduleError(f"revisão do git inexistente: {ref}")
    shown = subprocess.run(
        ["git", "show", f"{ref}:{path}"], cwd=repo_root(), capture_output=True, check=False
    )
    if shown.returncode != 0:
        return None
    return json.loads(shown.stdout.decode("utf-8"))
