"""A agenda do quiz do dia (M18, Apêndice Q do PLANO): a run de cada dia, com uma pergunta (a
família, a direção e o parâmetro) e até 50 pares de prévias de temas de anime (o especial, até
30, P376). Usa o catálogo do Anime, os snapshots dele (o ano, os níveis e os temas de cada
música) e as agendas do Anime e das Misturadas do mesmo dia (P378).

A regra de ouro é a das outras agendas: SÓ CRESCE (o `grow` do `schedule.py`). Os meses ficam em
arquivos separados (`anime/quiz/AAAA-MM.json`, P379), mas são uma agenda só para a geração e
para a conferência.

- **A pergunta do dia:** a família sai do pool, entre as que passaram do cooldown (P381); sem
  nenhuma, a parada há mais tempo. A direção ("a mais antiga" ou "a mais recente"; "a isekai" ou
  "a que não é") e o parâmetro (o rótulo, a fonte) saem do mesmo rng. Um dia por semana ISO, o
  sorteado pela semente da semana, é de especial (o estúdio ou o ano), sem repetir o tipo do
  especial anterior; o parâmetro do especial roda em ciclo.
- **A semente:** "musicle-jp|anime-quiz|<data>|dia" para a pergunta, "musicle-jp|anime-quiz|<data>|
  <rodada>" para cada par, "musicle-jp|anime-quiz|<data>|descida" para a descida da distância e
  "musicle-jp|anime-quiz|semana|<ano ISO>-W<semana>" para o dia do especial. Os números do rng de
  cada rodada dependem só do acervo: um afrouxamento consome mais.
- **As duas camadas** (P375): a faixa de cada música (a do "acertar o anime") sai da parte de
  Fácil, Médio e Difícil de cada rodada (`TIER_SHARES`), e a distância do par fica entre o mínimo
  e 3 × o mínimo (nas comparações) ou numa faixa em volta do alvo da semelhança dos gêneros (nas
  propriedades). A distância desce em degraus sorteados, e a curva g(n) é a média deles: umas
  runs descem mais rápido, outras mais devagar. Nas famílias de valor inteiro, o mínimo arredonda
  para o inteiro mais perto: sem isso, a diferença de 1 (o piso) nunca chegaria. Toda conta da
  curva é em `Decimal` (a regra 8 do pipeline): a mesma em Windows e em Linux.
- **As regras de um dia** (P378): nas comparações, nada que a run já deixe deduzir, com o que a
  revelação mostrou (P382): o par de duas músicas já reveladas, quando ela mostra o valor de cada
  uma (o ano, a taxa do AMQ, as playlists), ou de duas do mesmo grupo de pares ligados, quando
  mostra só a diferença (a nota, os membros). Isso cobre o par repetido e a ordem transitiva. Nas
  propriedades, nenhuma música repetida na run. Em todas, nenhuma resposta do Anime ou das
  Misturadas do dia.
- **O afrouxamento,** com registro: a distância alargada, qualquer faixa, qualquer distância e,
  só no acervo curto (as fixtures, de 34 faixas), as respostas do Anime e das Misturadas do dia.
  Sem par nenhum, a run para naquela rodada.
- **O MAL** (P380): os gêneros, a nota, os membros, a fonte e os estúdios vêm de um arquivo de
  entrada (o artefato da anime-mal; nas fixtures, os dados inventados do repositório) e nunca são
  guardados: o dia leva só os pares e, na nota e nos membros, a diferença (P382). O dia diz se o
  MAL estava na geração (`mal`). Na conferência sem os dados do MAL, os dias das famílias dele
  têm conferidas só a família e a direção.

Mudou o consumo do rng, a ordem, a curva ou uma regra? Só os dias novos sentem (o `schedule-check`
protege os gravados, regerando os novos com o catálogo, os snapshots e as agendas ao lado).
"""

from __future__ import annotations

import re
import subprocess
from bisect import bisect_left, bisect_right
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, localcontext
from functools import cache
from itertools import pairwise
from pathlib import Path

from jsonschema import Draft202012Validator

from musicle_pipeline.anime import (
    SEASONS,
    THEME_TYPES,
    Anime,
    AnimeSource,
    Theme,
    _accumulate,
    song_key,
)
from musicle_pipeline.anime_mixed import mixed_rounds
from musicle_pipeline.anime_schedule import _rounds
from musicle_pipeline.io_json import dumps, loads, read_json, write_if_changed
from musicle_pipeline.models import JSON, InputError
from musicle_pipeline.paths import anime_quiz_schema_path, repo_root
from musicle_pipeline.prng import Mulberry32, seeded
from musicle_pipeline.schedule import HORIZON_DAYS, TIMEZONE, Result, ScheduleError, grow

SCHEMA_VERSION = 1
KIND = "anime-quiz"
RUN_ROUNDS = 50  # P376
SPECIAL_ROUNDS = 30  # P376
TIERS = ("facil", "medio", "dificil")
# A curva das faixas (o usuário, 25/10/2026, no lugar da gaussiana da P375): a parte de Fácil,
# Médio e Difícil, em %, nas rodadas de cada ponto, com a reta entre eles e o último valendo dali
# em diante. Começa no Fácil, sem nenhuma Difícil até a rodada 6; da 6 à 10, assenta no Médio, e
# a Difícil só começa a aparecer (2% na 10); da 10 à 14 em diante, entram algumas Difíceis, mas o
# Médio fica sempre a maioria; o Fácil diminui e nunca some.
TIER_SHARES = (
    (1, (85, 15, 0)),
    (6, (30, 70, 0)),
    (10, (20, 78, 2)),
    (14, (14, 76, 10)),
    (20, (10, 74, 16)),
    (30, (8, 72, 20)),
)
# A distância: a curva média é g(n) = piso + (início − piso) × e^(−(n−1)/DIST_TAU), e o par fica
# entre o mínimo e BAND × o mínimo. Nas propriedades, o alvo da semelhança dos gêneros (Jaccard)
# é SIM_TOP × (1 − o que falta), com SIM_HALF de folga para cada lado.
DIST_TAU = Decimal("5.6")
# A descida de cada dia (o usuário, 25/10/2026): cada rodada guarda, do que faltava descer, uma
# parte sorteada de 2 × e^(−1/DIST_TAU) − 1 (uns 67%) a 100%, pela semente
# "musicle-jp|anime-quiz|<data>|descida". A média dessa parte é e^(−1/DIST_TAU): a de muitos dias
# é a curva g(n), e cada run desce no seu passo, umas rodadas mais, outras nada.
BAND = Decimal(3)
SIM_TOP = Decimal("0.6")
SIM_HALF = Decimal("0.25")
# A distância mínima de "qualquer distância": só tira o empate (os dois com o mesmo valor).
NO_TIE = Decimal("1e-9")
# Quantas 1ªs músicas a busca de um par tenta, em cada nível de afrouxamento.
TRIES = 40
# Acervo curto (as fixtures): um parâmetro (um rótulo, um estúdio) entra com as músicas para a
# run inteira ou, se o acervo é pequeno, com um quarto das músicas dele.
SHORT_SHARE = 4
# Os rótulos do MAL que nunca viram pergunta (Q.2 do Apêndice Q).
OFF_LABELS = frozenset({"Ecchi", "Erotica", "Hentai", "Gore"})
# As fontes do MAL em grupos (o `source`): o mangá, a light novel, a novel, o original, a visual
# novel e o jogo. As outras ("other", "mixed_media"...) ficam fora da pergunta.
SOURCE_GROUPS = {
    "manga": "manga",
    "web_manga": "manga",
    "4_koma_manga": "manga",
    "digital_manga": "manga",
    "light_novel": "light_novel",
    "novel": "novel",
    "web_novel": "novel",
    "original": "original",
    "visual_novel": "visual_novel",
    "game": "game",
    "card_game": "game",
}
DIRECTIONS = {"compare": ("max", "min"), "property": ("tem", "nao")}


# ---------------------------------------------------------------------------------------------
# O que o quiz sabe de cada música.


@dataclass(frozen=True)
class SongFacts:
    """O que os snapshots do Anime dizem de uma música (a songKey), juntando todos os temas dela."""

    year: int | None  # o ano confiável: o anime da 1ª abertura ou do 1º encerramento dela
    amq: Decimal | None  # a taxa de acerto do Anime Music Quiz (o AnisongDB), em %
    playlists: int | None  # as playlists do AnimeThemes que apontam para ela
    theme: str | None  # "OP" ou "ED", quando todos os temas dela são do mesmo tipo
    label: str  # o tema principal, para a revelação ("OP1", "ED2", "IN")
    mal_id: int  # o anime principal: o de menor ano (no empate, o menor id)
    anime_ids: frozenset[int]  # todos os animes da música (o "mesmo anime" da pergunta do tema)
    season: int | None = None  # a temporada da estreia nesse ano (o índice de SEASONS)


@dataclass(frozen=True)
class MalFacts:
    """Os dados do MAL de um anime, usados e descartados (P380)."""

    genres: frozenset[str]
    mean: Decimal | None
    members: int | None
    source: str | None
    studios: frozenset[str]


def _main_use(use: tuple[Anime, Theme]) -> tuple[int, int, int, int]:
    anime, theme = use
    return (anime.year or 9999, anime.mal_id, THEME_TYPES.index(theme.type), theme.sequence or 0)


def _facts_of(uses: Sequence[tuple[Anime, Theme]]) -> SongFacts:
    main_anime, main_theme = min(uses, key=_main_use)
    # A série longa leva o ano de estreia em todos os temas (a OP8 de Naruto ficaria com 2002):
    # só a 1ª abertura e o 1º encerramento dão o ano da música, e a temporada vem do mesmo anime.
    debut = [
        (a.year, a.season)
        for a, t in uses
        if t.type in ("OP", "ED") and (t.sequence or 1) == 1 and a.year
    ]
    year = min((y for y, _ in debut), default=None)
    # Um uso da estreia sem a temporada (um snapshot antigo) deixa a temporada sem saber: a do
    # outro uso do mesmo ano podia ser mais tarde, e a música fica fora da pergunta do ano.
    first = [s for y, s in debut if y == year]
    seasons = [SEASONS.index(s) for s in first if s is not None] if None not in first else []
    # Os números exatos (o usuário, 25/10/2026): sem eles (os snapshots antigos), a música fica
    # fora da pergunta, e o nível não serve no lugar.
    amq = [t.stats["anisongdb"] for _, t in uses if "anisongdb" in t.stats]
    playlists = [int(t.stats["animethemes"]) for _, t in uses if "animethemes" in t.stats]
    types = {t.type for _, t in uses}
    return SongFacts(
        year=year,
        season=min(seasons) if seasons else None,
        amq=max(amq) if amq else None,
        playlists=max(playlists) if playlists else None,
        theme=next(iter(types)) if len(types) == 1 and types <= {"OP", "ED"} else None,
        label=f"{main_theme.type}{main_theme.sequence or ''}",
        mal_id=main_anime.mal_id,
        anime_ids=frozenset(a.mal_id for a, _ in uses),
    )


def song_facts(provider: str, source: AnimeSource) -> dict[str, SongFacts]:
    """Os fatos de cada música (a songKey) do acervo, a partir dos snapshots: a mesma leitura da
    chance da P272 (`_accumulate`), com os níveis dos dois registros do mesmo tema juntos."""
    accs, _ = _accumulate(source)
    uses: dict[str, list[tuple[Anime, Theme]]] = {}
    for pid in sorted(accs):
        acc = accs[pid]
        uses.setdefault(song_key(provider, acc.track), []).extend(acc.uses)
    return {key: _facts_of(found) for key, found in sorted(uses.items())}


def _text_list(value: object, where: str) -> frozenset[str]:
    if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
        raise InputError(f"{where}: deveria ser uma lista de textos")
    return frozenset(value)


def load_mal(path: Path) -> dict[int, MalFacts]:
    """O arquivo dos dados do MAL do quiz: {"schemaVersion": 1, "anime": {"<id do MAL>": {"genres",
    "mean", "members", "source", "studios"}}}. Nas fixtures, os inventados; no robô, o artefato."""
    data = read_json(path)
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise InputError(f"{path}: deveria ter o schemaVersion 1")
    anime = data.get("anime")
    if not isinstance(anime, dict):
        raise InputError(f"{path}: falta o mapa anime")
    out: dict[int, MalFacts] = {}
    for key, raw in sorted(anime.items()):
        where = f"{path}: anime {key}"
        if not key.isdigit() or not isinstance(raw, dict):
            raise InputError(f"{where}: deveria ser um id do MAL com um objeto")
        unknown = set(raw) - {"genres", "mean", "members", "source", "studios"}
        if unknown:
            raise InputError(f"{where}: chave desconhecida: {sorted(unknown)}")
        mean, members, source = raw.get("mean"), raw.get("members"), raw.get("source")
        score: Decimal | None = None
        if mean is not None:
            if isinstance(mean, bool) or not isinstance(mean, int | float):
                raise InputError(f"{where}: mean deveria ser um número")
            # O texto do número, e não o float: "8.12" é 8.12, sem o erro da base 2.
            score = Decimal(str(mean))
            if not score.is_finite():  # o json do Python aceita NaN e Infinity
                raise InputError(f"{where}: mean deveria ser um número finito")
        if members is not None and (isinstance(members, bool) or not isinstance(members, int)):
            raise InputError(f"{where}: members deveria ser um inteiro")
        if source is not None and not isinstance(source, str):
            raise InputError(f"{where}: source deveria ser um texto")
        out[int(key)] = MalFacts(
            genres=_text_list(raw.get("genres", []), f"{where}: genres"),
            mean=score,
            members=members if members and members > 0 else None,
            source=source,
            studios=_text_list(raw.get("studios", []), f"{where}: studios"),
        )
    return out


# ---------------------------------------------------------------------------------------------
# As famílias de pergunta (Q.2 do Apêndice Q).


@dataclass(frozen=True)
class Family:
    id: str
    kind: str  # "compare" (a maior ou a menor) ou "property" (a que tem ou a que não tem)
    needs_mal: bool
    cooldown: int  # P381: os dias até a família poder voltar
    param_cooldown: int = 0  # P381: os dias até o mesmo parâmetro poder voltar
    special: bool = False
    start: Decimal = Decimal(0)  # a distância da 1ª rodada (nas comparações e no ano X)
    floor: Decimal = Decimal(0)  # o piso da distância
    log: bool = False  # a distância é uma razão (os membros): conta na escala do logaritmo
    whole: bool = False  # os valores são inteiros: o mínimo da distância arredonda
    diff_only: bool = False  # a revelação mostra só a diferença entre os dois (P382)


# As distâncias de cada comparação: o ano em temporadas (40 são 10 anos; o piso, 1 temporada, é
# o verão e o outono do mesmo ano); a taxa do AMQ em pontos percentuais; as playlists e os
# membros pela razão (o logaritmo). Os valores do AMQ e das playlists são um primeiro chute (o
# usuário, 25/10/2026): calibrar com a carga que traz os números exatos.
FAMILIES = (
    Family("ano", "compare", False, 5, start=Decimal(40), floor=Decimal(1), whole=True),
    Family("nota", "compare", True, 5, start=Decimal(2), floor=Decimal("0.10"), diff_only=True),
    Family(
        "membros",
        "compare",
        True,
        5,
        start=Decimal(10),
        floor=Decimal("1.3"),
        log=True,
        diff_only=True,
    ),
    Family("playlists", "compare", False, 10, start=Decimal(8), floor=Decimal("1.25"), log=True),
    Family("amq", "compare", False, 5, start=Decimal(25), floor=Decimal(2)),
    Family("rotulo", "property", True, 3, param_cooldown=60),
    Family("fonte", "property", True, 5, param_cooldown=30),
    Family("tema", "property", False, 10),
)
SPECIALS = (
    Family("estudio", "property", True, 0, special=True),
    Family(
        "ano_x",
        "property",
        False,
        0,
        special=True,
        start=Decimal(10),
        floor=Decimal(1),
        whole=True,
    ),
)
FAMILY_BY_ID = {f.id: f for f in (*FAMILIES, *SPECIALS)}
# As que têm parâmetro: o rótulo, a fonte, o estúdio e o ano (o tema não tem: é a abertura ou o
# encerramento, pela direção).
PARAM_FAMILIES = frozenset({"rotulo", "fonte", "estudio", "ano_x"})


def rounds_of(family: Family) -> int:
    return SPECIAL_ROUNDS if family.special else RUN_ROUNDS


# ---------------------------------------------------------------------------------------------
# A curva (P375), toda em Decimal.


@cache
def _decay(n: int, tau: Decimal) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = 28
        return (-Decimal(n - 1) / tau).exp()


@cache
def tier_shares(n: int) -> tuple[Decimal, Decimal, Decimal]:
    """A parte (em %) de Fácil, Médio e Difícil na rodada n: a reta entre os pontos de
    TIER_SHARES; antes do 1º, o 1º; depois do último, o último."""
    with localcontext() as ctx:
        ctx.prec = 28
        for (n0, s0), (n1, s1) in pairwise(TIER_SHARES):
            if n <= n0:
                break
            if n <= n1:
                t = Decimal(n - n0) / Decimal(n1 - n0)
                pairs = zip(s0, s1, strict=True)
                a, b, c = (Decimal(x) + (Decimal(y) - Decimal(x)) * t for x, y in pairs)
                return a, b, c
        else:
            s0 = TIER_SHARES[-1][1]
        a, b, c = (Decimal(x) for x in s0)
        return a, b, c


@cache
def tier_cuts(n: int) -> tuple[int, int]:
    """Os limites do sorteio da faixa da rodada n, sobre um número de 32 bits do rng: abaixo do
    1º, Fácil; abaixo do 2º, Médio; o resto, Difícil."""
    easy, medium, _ = tier_shares(n)
    with localcontext() as ctx:
        ctx.prec = 28
        span = Decimal(2**32) / 100
        return int(easy * span), int((easy + medium) * span)


def _tier(rng: Mulberry32, n: int) -> int:
    u = rng.next_u32()
    first, second = tier_cuts(n)
    return 0 if u < first else 1 if u < second else 2


@cache
def _ln(value: Decimal) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = 28
        return value.ln()


def curve(n: int) -> Decimal:
    """O que falta descer na rodada n, na curva média: 1 na 1ª, e^(−(n−1)/DIST_TAU) depois."""
    return _decay(n, DIST_TAU)


@cache
def day_left(d: date) -> tuple[Decimal, ...]:
    """O que falta descer em cada rodada do dia d (o índice 0 é a 1ª, com 1): cada rodada guarda
    uma parte sorteada do que faltava, de 2 × e^(−1/DIST_TAU) − 1 a 1, e a média dessa parte é a
    da curva. Um número do rng por rodada, da semente da descida, à parte da pergunta e dos
    pares."""
    rng = seeded(f"musicle-jp|anime-quiz|{d.isoformat()}|descida")
    with localcontext() as ctx:
        ctx.prec = 28
        low = 2 * curve(2) - 1
        left = [Decimal(1)]
        for _ in range(RUN_ROUNDS - 1):
            keep = low + (1 - low) * Decimal(rng.next_u32()) / Decimal(2**32)
            left.append(left[-1] * keep)
        return tuple(left)


@cache
def distance_bounds(family_id: str, left: Decimal) -> tuple[Decimal, Decimal]:
    """O mínimo e o máximo da distância do par quando falta `left` da descida (nas razões, na
    escala do logaritmo). Nos valores inteiros, o mínimo arredonda para o inteiro mais perto: a
    descida só chega perto do piso, e a diferença de 1 ficaria sempre de fora."""
    family = FAMILY_BY_ID[family_id]
    start, floor = family.start, family.floor
    if family.log:
        start, floor = _ln(start), _ln(floor)
    with localcontext() as ctx:
        ctx.prec = 28
        low = floor + (start - floor) * left
        high = low * BAND
        if family.whole:
            low = low.quantize(Decimal(1), rounding=ROUND_HALF_UP)
        return low, high


@cache
def similarity_target(family_id: str, left: Decimal) -> Decimal:
    """O alvo da semelhança dos gêneros quando falta `left` da descida. Na pergunta do tema, a
    semelhança é a relação dos dois (0, franquias diferentes; 0,5, a mesma franquia; 1, o mesmo
    anime), e o alvo vai até 1."""
    top = Decimal(1) if family_id == "tema" else SIM_TOP
    with localcontext() as ctx:
        ctx.prec = 28
        return top * (1 - left)


# Os níveis de afrouxamento de uma rodada: (o que afrouxou, a largura da distância, qualquer
# faixa, sem as respostas do Anime e das Misturadas do dia).
STEPS = (
    ("", "band", False, False),
    ("a distância alargada", "wide", False, False),
    ("qualquer faixa", "band", True, False),
    ("qualquer faixa e a distância alargada", "wide", True, False),
    ("qualquer faixa e qualquer distância", "any", True, False),
    ("uma resposta do Anime ou das Misturadas do dia (acervo curto)", "any", True, True),
)


def _window(family: Family, width: str, left: Decimal) -> tuple[Decimal, Decimal]:
    """A faixa aceita quando falta `left` da descida: a diferença do valor (nas comparações e no
    ano X) ou a semelhança dos gêneros (nas outras propriedades)."""
    if family.kind == "compare" or family.id == "ano_x":
        if width == "any":
            return NO_TIE, Decimal("Infinity")
        low, high = distance_bounds(family.id, left)
        return (low / 2, high * 2) if width == "wide" else (low, high)
    if width == "any":
        return Decimal(-1), Decimal(2)
    target = similarity_target(family.id, left)
    half = SIM_HALF * 2 if width == "wide" else SIM_HALF
    return target - half, target + half


def jaccard(a: frozenset[str], b: frozenset[str]) -> Decimal:
    union = a | b
    if not union:
        return Decimal(0)
    with localcontext() as ctx:
        ctx.prec = 28
        return Decimal(len(a & b)) / Decimal(len(union))


def round_sig(value: int, digits: int = 2) -> int:
    """O inteiro com `digits` algarismos significativos (120.345 → 120.000), como a tela o lê."""
    if value <= 0:
        return 0
    step = 10 ** max(0, len(str(value)) - digits)
    return (value + step // 2) // step * step


# ---------------------------------------------------------------------------------------------
# O acervo do quiz.


@dataclass(frozen=True)
class Song:
    id: str  # a faixa (a de menor id da songKey, como no Anime)
    key: str  # a songKey
    tier: int  # 0, 1 ou 2: a faixa do "acertar o anime"
    franchises: frozenset[str]
    facts: SongFacts
    mal: MalFacts | None


def source_group(mal: MalFacts | None) -> str | None:
    return SOURCE_GROUPS.get(mal.source or "") if mal else None


class QuizContext:
    """O acervo, os fatos, os dados do MAL (ou None) e as agendas do Anime e das Misturadas: tudo
    o que a geração e a conferência de um dia leem."""

    def __init__(
        self,
        catalog: JSON,
        facts: Mapping[str, SongFacts],
        mal: Mapping[int, MalFacts] | None,
        anime_days: Mapping[str, JSON],
        mixed_days: Mapping[str, JSON],
    ) -> None:
        if "franchises" not in catalog:
            raise ScheduleError("o catálogo não é o do Anime (falta franchises)")
        self.version = catalog["catalogVersion"]
        self.tracks = {t["id"]: t for t in catalog["tracks"]}
        self.mal = mal
        self.anime_days = anime_days
        self.mixed_days = mixed_days
        songs: list[Song] = []
        seen: set[str] = set()
        for track in sorted(catalog["tracks"], key=lambda t: t["id"]):
            tier = track["anime"]["tiers"]["titulo"]
            key = track["songKey"]
            if not track["eligible"]["daily"] or tier is None or key in seen or key not in facts:
                continue
            seen.add(key)
            fact = facts[key]
            songs.append(
                Song(
                    id=track["id"],
                    key=key,
                    tier=TIERS.index(tier),
                    franchises=frozenset(track["anime"]["franchiseIds"]),
                    facts=fact,
                    mal=mal.get(fact.mal_id) if mal is not None else None,
                )
            )
        self.songs = songs
        # O acervo curto (as fixtures, de 34 faixas) é o único em que a run usa uma resposta do
        # Anime ou das Misturadas do dia (o último nível de STEPS); no real, ela para antes (P378).
        self.short = len(songs) < RUN_ROUNDS * 2
        self.by_id = {s.id: s for s in songs}
        self._compare: dict[str, list[tuple[Decimal, Song]]] = {}
        self._property: dict[tuple[str, object], tuple[list[Song], list[Song]]] = {}
        self._params: dict[str, list[object]] = {}

    # --- as comparações

    def value(self, family_id: str, song: Song) -> Decimal | None:
        """O valor que a comparação ordena; nos membros, o logaritmo (a distância é uma razão)."""
        f, m = song.facts, song.mal
        if family_id == "ano":
            # Em temporadas (4 por ano): sem a da estreia, a música fica fora da pergunta.
            return None if f.year is None or f.season is None else Decimal(4 * f.year + f.season)
        if family_id == "playlists":
            return _ln(Decimal(f.playlists)) if f.playlists else None  # a razão: o logaritmo
        if family_id == "amq":
            return f.amq
        if family_id == "nota":
            return m.mean if m else None
        if family_id == "membros":
            return _ln(Decimal(m.members)) if m and m.members else None
        raise ValueError(f"família sem valor: {family_id}")

    def compare_pool(self, family_id: str) -> list[tuple[Decimal, Song]]:
        """As músicas com valor na família, ordenadas pelo valor (e pelo id, no empate)."""
        if family_id not in self._compare:
            found = [(v, s) for s in self.songs if (v := self.value(family_id, s)) is not None]
            self._compare[family_id] = sorted(found, key=lambda vs: (vs[0], vs[1].id))
        return self._compare[family_id]

    # --- as propriedades

    def has(self, family: Family, param: object, song: Song) -> bool | None:
        """Se a música tem a propriedade (True), não tem (False) ou fica fora da pergunta (None)."""
        f, m = song.facts, song.mal
        if family.id == "tema":
            return None if f.theme is None else f.theme == "OP"
        if family.id == "ano_x":
            return None if f.year is None else f.year == param
        if m is None:
            return None
        if family.id == "rotulo":
            return param in m.genres
        if family.id == "fonte":
            group = source_group(m)
            return None if group is None else group == param
        if family.id == "estudio":
            return param in m.studios
        raise ValueError(f"família sem propriedade: {family.id}")

    def property_pool(self, family: Family, param: object) -> tuple[list[Song], list[Song]]:
        """(as que têm, as que não têm), cada lista na ordem do id."""
        key = (family.id, param)
        if key not in self._property:
            yes, no = [], []
            for song in self.songs:
                mark = self.has(family, param, song)
                if mark is True:
                    yes.append(song)
                elif mark is False:
                    no.append(song)
            self._property[key] = (yes, no)
        return self._property[key]

    def similarity(self, family: Family, param: object, a: Song, b: Song) -> Decimal:
        if family.id == "tema":
            if a.facts.anime_ids & b.facts.anime_ids:
                return Decimal(1)
            return Decimal("0.5") if a.franchises & b.franchises else Decimal(0)
        genres_a = a.mal.genres if a.mal else frozenset()
        genres_b = b.mal.genres if b.mal else frozenset()
        if family.id == "rotulo":  # o próprio rótulo separa os dois: fica fora da conta
            genres_a, genres_b = genres_a - {param}, genres_b - {param}
        return jaccard(genres_a, genres_b)

    def need(self, family: Family) -> int:
        """As músicas que uma pergunta precisa para entrar no pool: as da run inteira ou, no
        acervo curto, um quarto das do acervo."""
        return min(rounds_of(family), max(2, len(self.songs) // SHORT_SHARE))

    def params(self, family: Family) -> list[object]:
        """Os parâmetros que fecham a run (o rótulo, a fonte, o estúdio ou o ano), em ordem."""
        if family.id not in self._params:
            need = self.need(family)
            counts: Counter[object] = Counter()
            for song in self.songs:
                m = song.mal
                if family.id == "rotulo" and m:
                    counts.update(g for g in m.genres if g not in OFF_LABELS)
                elif family.id == "fonte" and (group := source_group(m)):
                    counts[group] += 1
                elif family.id == "estudio" and m:
                    counts.update(m.studios)
                elif family.id == "ano_x" and song.facts.year is not None:
                    counts[song.facts.year] += 1
            self._params[family.id] = sorted((p for p, n in counts.items() if n >= need), key=str)
        return self._params[family.id]

    # --- as regras de um dia

    def excluded(self, d: date) -> frozenset[str]:
        """As músicas das respostas do Anime e das Misturadas do dia (P378): o quiz revela o nome,
        e entregaria o diário."""
        where = d.isoformat()
        anime_day, mixed_day = self.anime_days.get(where), self.mixed_days.get(where)
        if anime_day is None or mixed_day is None:
            raise ScheduleError(
                f"{d}: a agenda do Anime ou a das Misturadas não tem o dia (gere as duas antes)"
            )
        answers = [a for _m, _t, _n, a in _rounds(anime_day)]
        answers += [a for _m, _n, found in mixed_rounds(mixed_day) for a in found]
        return frozenset(self.tracks[a]["songKey"] for a in answers if a in self.tracks)


# ---------------------------------------------------------------------------------------------
# A run de um dia.


@dataclass
class _Run:
    """O que a run já revelou, para nada se repetir nem se deduzir (P378): as músicas que já
    saíram e os grupos de pares ligados (cada par junta os grupos das duas músicas)."""

    used: set[str] = field(default_factory=set)
    parent: dict[str, str] = field(default_factory=dict)

    def _root(self, key: str) -> str:
        while (up := self.parent.get(key, key)) != key:
            key = up
        return key

    def join(self, a: str, b: str) -> None:
        self.used |= {a, b}
        ra, rb = self._root(a), self._root(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)  # a raiz é a menor: a mesma em toda máquina

    def known(self, family: Family, a: str, b: str) -> bool:
        """Se a run já deixa deduzir a resposta do par, pelo que a revelação mostrou (P382):
        quando ela mostra o valor de cada uma (o ano, a taxa do AMQ, as playlists), basta as duas
        já terem saído;
        quando mostra só a diferença (a nota, os membros), as duas no mesmo grupo dão a conta.
        Os dois casos cobrem o par repetido e a ordem transitiva."""
        if family.diff_only:
            return self._root(a) == self._root(b)
        return a in self.used and b in self.used


def _rotated(items: Sequence[Song], rng: Mulberry32) -> Iterable[Song]:
    """As candidatas a partir de uma sorteada, em roda, até TRIES delas: um número do rng. A
    lista já vem sem as que a regra recusa, para o limite não se gastar com elas. O limite segura
    o tempo da busca: sem par nas primeiras, o nível seguinte de afrouxamento resolve."""
    if not items:
        return []
    start = rng.randint(len(items))
    return [items[(start + i) % len(items)] for i in range(min(len(items), TRIES))]


def _search_compare(
    ctx: QuizContext,
    family: Family,
    rng: Mulberry32,
    run: _Run,
    excluded: frozenset[str],
    tiers: tuple[int, int] | None,
    window: tuple[Decimal, Decimal],
) -> tuple[Song, Song] | None:
    pool = ctx.compare_pool(family.id)
    # As 1ªs na ordem do id, e não na do valor: as TRIES tentadas se espalham pelos valores (na
    # ordem do valor, seriam vizinhas e falhariam juntas).
    first = sorted(
        (s for _, s in pool if s.key not in excluded and (tiers is None or s.tier == tiers[0])),
        key=lambda s: s.id,
    )
    second = [
        (v, s) for v, s in pool if s.key not in excluded and (tiers is None or s.tier == tiers[1])
    ]
    keys = [v for v, _ in second]
    low, high = window
    for a in _rotated(first, rng):
        va = ctx.value(family.id, a)
        assert va is not None
        found: dict[str, Song] = {}
        for lo, hi in ((va + low, va + high), (va - high, va - low)):
            for _, b in second[bisect_left(keys, lo) : bisect_right(keys, hi)]:
                if b.key != a.key and not run.known(family, a.key, b.key):
                    found[b.id] = b
        if found:
            partners = [found[i] for i in sorted(found)]
            return a, partners[rng.randint(len(partners))]
    return None


def _search_property(
    ctx: QuizContext,
    family: Family,
    param: object,
    rng: Mulberry32,
    run: _Run,
    excluded: frozenset[str],
    tiers: tuple[int, int] | None,
    window: tuple[Decimal, Decimal],
) -> tuple[Song, Song] | None:
    yes, no = ctx.property_pool(family, param)
    out = excluded | run.used  # nas propriedades, nenhuma música volta na run (P378)
    first = [s for s in yes if s.key not in out and (tiers is None or s.tier == tiers[0])]
    second = [s for s in no if s.key not in out and (tiers is None or s.tier == tiers[1])]
    low, high = window
    if family.id == "ano_x":
        assert isinstance(param, int)
        # A distância ao ano X não depende da 1ª música: a lista sai uma vez só. As do "não" têm
        # o ano (sem ele, a música fica fora da pergunta, no `has`).
        second = [b for b in second if low <= abs(Decimal(b.facts.year or 0) - param) <= high]
    for a in _rotated(first, rng):
        partners = second
        if family.id != "ano_x":
            partners = [b for b in second if low <= ctx.similarity(family, param, a, b) <= high]
        if partners:
            return a, partners[rng.randint(len(partners))]
    return None


def _info(family: Family, a: Song, b: Song) -> JSON | None:
    """O dado da revelação (P382), na ordem a e b: o número que qualquer pessoa entende (o
    usuário, 25/10/2026), e não um nível."""
    if family.id == "ano":
        seasons = []
        for song in (a, b):
            assert song.facts.year is not None and song.facts.season is not None
            seasons.append({"year": song.facts.year, "season": SEASONS[song.facts.season]})
        return {"seasons": seasons}
    if family.id == "ano_x":
        return {"years": [a.facts.year, b.facts.year]}
    if family.id == "playlists":
        return {"playlists": [a.facts.playlists, b.facts.playlists]}
    if family.id == "amq":
        assert a.facts.amq is not None and b.facts.amq is not None
        return {"rates": [float(a.facts.amq), float(b.facts.amq)]}
    if family.id == "tema":
        return {"themes": [a.facts.label, b.facts.label]}
    if family.id == "nota":
        assert a.mal and b.mal and a.mal.mean is not None and b.mal.mean is not None
        return {"diff": float(abs(a.mal.mean - b.mal.mean).quantize(Decimal("0.01")))}
    if family.id == "membros":
        assert a.mal and b.mal and a.mal.members and b.mal.members
        return {"diff": round_sig(abs(a.mal.members - b.mal.members))}
    return None  # as propriedades do MAL: só a resposta


def _record(
    ctx: QuizContext,
    family: Family,
    direction: str,
    pair: tuple[Song, Song],
    rng: Mulberry32,
    run: _Run,
) -> JSON:
    a, b = pair  # nas propriedades, a tem a propriedade e b não tem
    if family.kind == "compare":
        va, vb = ctx.value(family.id, a), ctx.value(family.id, b)
        assert va is not None and vb is not None and va != vb
        high, low = (a, b) if va > vb else (b, a)
        answer = high if direction == "max" else low
    else:
        answer = a if direction == "tem" else b
    run.join(a.key, b.key)
    first, second = (a, b) if rng.randint(2) == 0 else (b, a)
    record: JSON = {"a": first.id, "b": second.id, "answer": "a" if answer is first else "b"}
    info = _info(family, first, second)
    if info is not None:
        record["info"] = info
    return record


def _round(
    ctx: QuizContext,
    family: Family,
    param: object,
    direction: str,
    d: date,
    n: int,
    run: _Run,
    excluded: frozenset[str],
) -> tuple[JSON | None, int]:
    """O par da rodada n e o nível de afrouxamento (0, nenhum); sem par, (None, -1)."""
    rng = seeded(f"musicle-jp|anime-quiz|{d.isoformat()}|{n}")
    tiers = (_tier(rng, n), _tier(rng, n))
    left = day_left(d)[n - 1]
    for step, (_what, width, any_tier, with_day_answers) in enumerate(STEPS):
        if with_day_answers and not ctx.short:
            break  # no acervo real, a run para antes de usar uma resposta do dia (P378)
        out = frozenset() if with_day_answers else excluded
        chosen = tiers if not any_tier else None
        window = _window(family, width, left)
        if family.kind == "compare":
            pair = _search_compare(ctx, family, rng, run, out, chosen, window)
        else:
            pair = _search_property(ctx, family, param, rng, run, out, chosen, window)
        if pair is not None:
            return _record(ctx, family, direction, pair, rng, run), step
    return None, -1


# ---------------------------------------------------------------------------------------------
# A pergunta do dia: o pool, o cooldown e os especiais (P381).


@dataclass
class _History:
    family: dict[str, date] = field(default_factory=dict)  # o último dia de cada família
    param: dict[tuple[str, object], date] = field(default_factory=dict)  # e de cada parâmetro
    last_special: str | None = None  # a família do especial mais recente


def _history(days: Mapping[str, JSON], d: date) -> _History:
    history = _History()
    for day_str in sorted(days):
        if day_str >= d.isoformat():  # datas ISO comparam certo como texto
            break
        day = days[day_str]
        when = date.fromisoformat(day_str)
        history.family[day["family"]] = when
        if "param" in day:
            history.param[day["family"], day["param"]] = when
        if FAMILY_BY_ID[day["family"]].special:
            history.last_special = day["family"]
    return history


def special_weekday(d: date) -> int:
    """O dia da semana (0, segunda) do especial da semana ISO de `d`."""
    iso = d.isocalendar()
    return seeded(f"musicle-jp|anime-quiz|semana|{iso.year}-W{iso.week:02d}").randint(7)


def _available(ctx: QuizContext, family: Family, mal_on: bool) -> bool:
    if family.needs_mal:
        # Só o `mal` do dia decide (P380): a conferência sem os dados do MAL tem de chegar à mesma
        # lista de famílias que a geração, e por isso o acervo do MAL não entra na conta. Se os
        # dados vierem incompletos, a geração para com erro (no `_param` ou sem par na rodada 1).
        return mal_on
    if family.kind == "compare":
        # Com poucas músicas que têm o dado (o acervo real antes da carga com a temporada e os
        # números exatos), a run pararia cedo: a pergunta espera o acervo crescer.
        return len(ctx.compare_pool(family.id)) >= ctx.need(family)
    if family.id == "tema":
        yes, no = ctx.property_pool(family, None)
        return bool(yes and no)
    return bool(ctx.params(family))


def _pick(rng: Mulberry32, items: Sequence[object]) -> object:
    return items[rng.randint(len(items))]


def _ready(candidates: Sequence[Family], history: _History, d: date) -> list[Family]:
    """As que passaram do cooldown; sem nenhuma, a parada há mais tempo (a 1ª, no empate)."""
    ready = [
        f
        for f in candidates
        if f.id not in history.family or (d - history.family[f.id]).days >= f.cooldown
    ]
    if ready:
        return ready
    return [min(candidates, key=lambda f: history.family[f.id])]


def _param(ctx: QuizContext, family: Family, history: _History, d: date, rng: Mulberry32) -> object:
    params = ctx.params(family)
    if not params:  # só nas famílias do MAL, que entram sem olhar o acervo (`_available`)
        raise ScheduleError(
            f"{d}: {family.id} sem nenhum parâmetro com músicas que bastem (os dados do MAL vieram"
            " incompletos?)"
        )
    last = {p: history.param.get((family.id, p)) for p in params}
    if family.special:
        # O ciclo: o mesmo estúdio ou ano só volta depois de todos os outros.
        fresh = [p for p in params if last[p] is None]
        if not fresh:
            oldest = min(v for v in last.values() if v is not None)
            fresh = [p for p in params if last[p] == oldest]
        return _pick(rng, fresh)
    ready = [p for p in params if last[p] is None or (d - last[p]).days >= family.param_cooldown]
    if not ready:
        oldest = min(v for v in last.values() if v is not None)
        ready = [p for p in params if last[p] == oldest]
    return _pick(rng, ready)


def _choose(
    ctx: QuizContext, days: Mapping[str, JSON], d: date, mal_on: bool
) -> tuple[Family, str, object]:
    """A família, a direção e o parâmetro do dia (o parâmetro, None quando não há, ou quando a
    conferência não tem os dados do MAL)."""
    rng = seeded(f"musicle-jp|anime-quiz|{d.isoformat()}|dia")
    history = _history(days, d)
    family: Family | None = None
    if d.weekday() == special_weekday(d):
        specials = [s for s in SPECIALS if _available(ctx, s, mal_on)]
        if len(specials) > 1:
            specials = [s for s in specials if s.id != history.last_special]
        if specials:
            family = specials[rng.randint(len(specials))]
    if family is None:
        regular = [f for f in FAMILIES if _available(ctx, f, mal_on)]
        if not regular:
            raise ScheduleError(f"{d}: nenhuma pergunta possível com este acervo")
        ready = _ready(regular, history, d)
        family = ready[rng.randint(len(ready))]
    direction = DIRECTIONS[family.kind][rng.randint(2)]
    param: object = None
    if family.id in PARAM_FAMILIES and not (family.needs_mal and ctx.mal is None):
        param = _param(ctx, family, history, d, rng)
    return family, direction, param


def _generate_day(
    days: Mapping[str, JSON],
    d: date,
    epoch: date,
    ctx: QuizContext,
    mal_on: bool,
) -> tuple[JSON, list[str]]:
    family, direction, param = _choose(ctx, days, d, mal_on)
    day: JSON = {
        "number": (d - epoch).days + 1,
        "catalogVersion": ctx.version,
        "family": family.id,
        "direction": direction,
    }
    if param is not None:
        day["param"] = param
    day["mal"] = mal_on
    if family.needs_mal and ctx.mal is None:
        return day, []  # a conferência sem os dados do MAL para aqui (P380)
    excluded = ctx.excluded(d)
    run = _Run()
    rounds: list[JSON] = []
    steps: Counter[int] = Counter()
    relaxations: list[str] = []
    for n in range(1, rounds_of(family) + 1):
        record, step = _round(ctx, family, param, direction, d, n, run, excluded)
        if record is None:
            relaxations.append(f"{d} {family.id}: a run para na rodada {n - 1} (sem par possível)")
            break
        if step:
            steps[step] += 1
        rounds.append(record)
    if not rounds:
        raise ScheduleError(f"{d}: nenhum par possível para a pergunta {family.id}")
    relaxations += [
        f"{d} {family.id}: {count} rodada(s) com {STEPS[step][0]}"
        for step, count in sorted(steps.items())
    ]
    day["rounds"] = rounds
    return day, relaxations


def _future_warnings(schedule: JSON, today: date, ctx: QuizContext) -> list[str]:
    """Dias futuros já gravados não mudam: o aviso mostra os que envelheceram mal, como nas
    outras agendas (P238). O que a tela faz com a rodada fica para a web (o PR B do M18)."""
    warnings = []
    for day_str, day in sorted(schedule["days"].items()):
        if date.fromisoformat(day_str) < today:
            continue
        for n, rnd in enumerate(day["rounds"], start=1):
            tracks = [ctx.tracks.get(rnd[side]) for side in ("a", "b")]
            if any(t is None or not t["eligible"]["daily"] for t in tracks):
                warnings.append(f"{day_str} rodada {n}: faixa que não é mais elegível")
    return warnings


def generate_quiz(
    ctx: QuizContext,
    existing: JSON | None,
    today: date,
    epoch: date | None = None,
    horizon: int = HORIZON_DAYS,
) -> Result:
    """Acrescenta os dias que faltam até today + horizon, sem passar do último dia das agendas do
    Anime e das Misturadas (o dia lê as respostas das duas, P378). Nunca altera um dia existente.
    A agenda existente é a dos meses juntos (`merge_months`)."""
    warnings: list[str] = []
    if existing is not None:
        problems = validate_quiz_schedule(existing, ctx)
        if problems:
            raise ScheduleError("agenda do quiz existente inválida:\n" + "\n".join(problems))
        warnings = _future_warnings(existing, today, ctx)
    if ctx.mal is None:
        warnings.append("sem os dados do MAL: as perguntas do MAL ficam fora dos dias novos")
    for days in (ctx.anime_days, ctx.mixed_days):
        if days:
            horizon = min(horizon, (date.fromisoformat(max(days)) - today).days)
    header = {"schemaVersion": SCHEMA_VERSION, "kind": KIND, "timezone": TIMEZONE}
    return grow(
        existing,
        header,
        today,
        epoch,
        horizon,
        lambda days, d, start: _generate_day(days, d, start, ctx, ctx.mal is not None),
        warnings,
    )


# ---------------------------------------------------------------------------------------------
# Os arquivos por mês (P379).

MONTH_FILE = re.compile(r"(\d{4}-\d{2})\.json")
_HEADER = ("schemaVersion", "kind", "timezone", "epoch")


@cache
def _validator() -> Draft202012Validator:
    schema = read_json(anime_quiz_schema_path())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def split_months(schedule: JSON) -> dict[str, JSON]:
    """A agenda inteira → um arquivo por mês (o nome → o conteúdo), cada um com o cabeçalho."""
    header = {k: schedule[k] for k in _HEADER}
    months: dict[str, JSON] = {}
    for day_str in sorted(schedule["days"]):
        month = day_str[:7]
        entry = months.setdefault(f"{month}.json", {**header, "month": month, "days": {}})
        entry["days"][day_str] = schedule["days"][day_str]
    return months


def merge_months(files: Mapping[str, JSON]) -> tuple[JSON | None, list[str]]:
    """Os arquivos dos meses → a agenda inteira, com os problemas: o nome, o schema, o mês, os
    dias fora do mês e o cabeçalho diferente entre os meses."""
    problems: list[str] = []
    header: JSON | None = None
    days: dict[str, JSON] = {}
    for name in sorted(files):
        data = files[name]
        match = MONTH_FILE.fullmatch(name)
        if match is None:
            problems.append(f"{name}: o nome deveria ser AAAA-MM.json")
            continue
        errors = sorted(_validator().iter_errors(data), key=lambda e: list(e.absolute_path))
        if errors:
            problems += [
                f"{name}: schema: /{'/'.join(map(str, e.absolute_path))}: {e.message}"
                for e in errors
            ]
            continue
        if data["month"] != match.group(1):
            problems.append(f"{name}: o mês do arquivo é {data['month']}")
        outside = sorted(d for d in data["days"] if d[:7] != data["month"])
        if outside:
            problems.append(f"{name}: dias fora do mês: {', '.join(outside)}")
        mine = {k: data[k] for k in _HEADER}
        if header is None:
            header = mine
        elif mine != header:
            problems.append(f"{name}: o cabeçalho difere do dos outros meses")
        days.update(data["days"])
    if header is None:
        return None, problems
    return {**header, "days": dict(sorted(days.items()))}, problems


def read_quiz_dir(directory: Path) -> tuple[JSON | None, list[str]]:
    """A agenda do quiz da pasta (None se não há pasta nem mês), com os problemas dos arquivos,
    a forma canônica inclusive."""
    if not directory.is_dir():
        return None, []
    files: dict[str, JSON] = {}
    problems: list[str] = []
    for path in sorted(directory.iterdir()):
        if not path.is_file() or MONTH_FILE.fullmatch(path.name) is None:
            problems.append(f"{path.name}: na pasta do quiz só cabem os meses (AAAA-MM.json)")
            continue
        raw = path.read_bytes()
        try:
            data = loads(raw)
        except ValueError as exc:
            problems.append(f"{path.name}: JSON inválido: {exc}")
            continue
        files[path.name] = data
        if dumps(data).encode("utf-8") != raw:
            problems.append(f"{path.name}: fora da forma canônica (regere com o pipeline)")
    merged, more = merge_months(files)
    return merged, problems + more


def write_quiz_dir(directory: Path, schedule: JSON) -> list[str]:
    """Grava cada mês que mudou; devolve os nomes gravados. Um mês nunca some: a agenda só
    cresce, e os meses antigos ficam (P379)."""
    return [
        name
        for name, data in split_months(schedule).items()
        if write_if_changed(directory / name, dumps(data))
    ]


def read_quiz_ref(ref: str, relative: str) -> tuple[JSON | None, list[str]]:
    """A agenda do quiz numa revisão do git (os meses da pasta, em bytes). Revisão inexistente é
    erro; a pasta ausente nela vale como agenda vazia."""
    root = repo_root()
    check = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
        cwd=root,
        capture_output=True,
        check=False,
    )
    if check.returncode != 0:
        raise ScheduleError(f"revisão do git inexistente: {ref}")
    listed = subprocess.run(
        ["git", "ls-tree", ref, "--", f"{relative}/"],
        cwd=root,
        capture_output=True,
        check=True,
    )
    files: dict[str, JSON] = {}
    problems: list[str] = []
    for line in listed.stdout.decode("utf-8").splitlines():
        meta, path = line.split("\t", 1)  # "<modo> <tipo> <hash>\t<caminho>"
        name = path.rsplit("/", 1)[-1]
        if meta.split()[1] != "blob" or MONTH_FILE.fullmatch(name) is None:
            problems.append(f"{name}: na pasta do quiz só cabem os meses (AAAA-MM.json)")
            continue
        shown = subprocess.run(
            ["git", "show", f"{ref}:{relative}/{name}"], cwd=root, capture_output=True, check=True
        )
        try:
            files[name] = loads(shown.stdout)
        except ValueError as exc:
            problems.append(f"{name}: JSON inválido: {exc}")
    if not files:
        return None, problems
    merged, more = merge_months(files)
    return merged, problems + more


# ---------------------------------------------------------------------------------------------
# As conferências.


def validate_quiz_schedule(schedule: JSON, ctx: QuizContext) -> list[str]:
    """Validação ESTRUTURAL dos meses juntos (o schema de cada mês fica com o `merge_months`):
    o número de cada dia, a família, a direção e o parâmetro, o MAL da família, a conta das
    rodadas, as faixas no catálogo e o dado da revelação de cada família."""
    try:
        epoch = date.fromisoformat(schedule["epoch"])
        dates = sorted(date.fromisoformat(d) for d in schedule["days"])
    except ValueError as exc:
        return [f"data inválida: {exc}"]
    problems: list[str] = []
    before = [d.isoformat() for d in dates if d < epoch]
    if before:
        problems.append(f"dias antes do epoch: {', '.join(before)}")
    expected_info = {
        "ano": "seasons",
        "ano_x": "years",
        "playlists": "playlists",
        "amq": "rates",
        "tema": "themes",
        "nota": "diff",
        "membros": "diff",
    }
    for d in dates:
        where = d.isoformat()
        day = schedule["days"][where]
        if day["number"] != (d - epoch).days + 1:
            problems.append(f"{where}: number deveria ser {(d - epoch).days + 1}")
        family = FAMILY_BY_ID[day["family"]]  # o schema já recusou família desconhecida
        if day["direction"] not in DIRECTIONS[family.kind]:
            problems.append(f"{where}: direção {day['direction']} não serve a {family.id}")
        if family.needs_mal and not day["mal"]:
            problems.append(f"{where}: {family.id} precisa dos dados do MAL, e o dia diz que não")
        has_param = "param" in day
        if family.id in PARAM_FAMILIES and not has_param:
            problems.append(f"{where}: {family.id} precisa do parâmetro")
        if family.id not in PARAM_FAMILIES and has_param:
            problems.append(f"{where}: {family.id} não tem parâmetro")
        if family.id == "ano_x" and has_param and not isinstance(day["param"], int):
            problems.append(f"{where}: o ano do especial deveria ser um inteiro")
        if family.id in ("rotulo", "fonte", "estudio") and has_param:
            if not isinstance(day["param"], str):
                problems.append(f"{where}: o parâmetro de {family.id} deveria ser um texto")
            elif family.id == "fonte" and day["param"] not in SOURCE_GROUPS.values():
                problems.append(f"{where}: fonte desconhecida: {day['param']}")
        if len(day["rounds"]) > rounds_of(family):
            problems.append(f"{where}: {len(day['rounds'])} rodadas, mais que {rounds_of(family)}")
        for n, rnd in enumerate(day["rounds"], start=1):
            at = f"{where} rodada {n}"
            for side in ("a", "b"):
                if rnd[side] not in ctx.tracks:
                    problems.append(f"{at}: faixa inexistente {rnd[side]}")
            if rnd["a"] == rnd["b"]:
                problems.append(f"{at}: as duas faixas são a mesma")
            want = expected_info.get(family.id)
            got = next(iter(rnd["info"])) if "info" in rnd else None
            if got != want:
                problems.append(f"{at}: o dado da revelação deveria ser {want}, e não {got}")
    return problems


def _round_answer_problem(ctx: QuizContext, family: Family, day: JSON, rnd: JSON) -> str | None:
    """Se a resposta da rodada não confere com os fatos (as famílias que a conferência conhece)."""
    a, b = ctx.by_id.get(rnd["a"]), ctx.by_id.get(rnd["b"])
    if a is None or b is None:
        return "faixa fora do acervo do quiz"
    answer, other = (a, b) if rnd["answer"] == "a" else (b, a)
    if family.kind == "compare":
        va, vo = ctx.value(family.id, answer), ctx.value(family.id, other)
        if va is None or vo is None or va == vo:
            return "par sem valor ou empatado"
        if (va > vo) != (day["direction"] == "max"):
            return "a resposta não é a da direção do dia"
        return None
    param = day.get("param")
    mark_answer, mark_other = ctx.has(family, param, answer), ctx.has(family, param, other)
    if mark_answer is None or mark_other is None or mark_answer == mark_other:
        return "o par não tem uma música com a propriedade e uma sem"
    if mark_answer != (day["direction"] == "tem"):
        return "a resposta não é a da direção do dia"
    return None


def _day_rule_problems(where: str, day: JSON, ctx: QuizContext) -> list[str]:
    family = FAMILY_BY_ID[day["family"]]
    problems: list[str] = []
    knows_mal = not family.needs_mal or ctx.mal is not None
    try:
        excluded = ctx.excluded(date.fromisoformat(where))
    except ScheduleError:
        excluded = frozenset()  # sem as agendas ao lado: a regra não tem como ser conferida
    run = _Run()
    for n, rnd in enumerate(day["rounds"], start=1):
        at = f"{where} rodada {n}"
        keys = [ctx.tracks[t]["songKey"] for t in (rnd["a"], rnd["b"]) if t in ctx.tracks]
        if len(keys) != 2:
            continue  # a validação estrutural já acusa
        pair = frozenset(keys)
        if len(pair) == 1:
            problems.append(f"{at}: as duas faixas são a mesma música")
        # A mesma régua da geração (P378, P382); só lê as chaves, e vale também sem o MAL.
        if family.kind == "property" and run.used & pair:
            problems.append(f"{at}: música repetida na run")
        if family.kind == "compare" and run.known(family, *keys):
            problems.append(f"{at}: par que a run já deixa deduzir")
        run.join(*keys)
        if excluded & pair:
            problems.append(f"{at}: música de uma resposta do Anime ou das Misturadas do dia")
        if knows_mal:
            problem = _round_answer_problem(ctx, family, day, rnd)
            if problem:
                problems.append(f"{at}: {problem}")
            elif rnd.get("info") != _info(family, ctx.by_id[rnd["a"]], ctx.by_id[rnd["b"]]):
                # O número da revelação é o dos fatos (o mesmo float que o `_info` grava).
                problems.append(f"{at}: o dado da revelação não bate com os fatos")
    return problems


def quiz_rule_problems(schedule: JSON, ctx: QuizContext) -> tuple[list[str], list[str]]:
    """As regras da geração que a conferência consegue ver, dia a dia: nas comparações, nada que a
    revelação já deixe deduzir (P382); nas propriedades, a música sem repetir; nenhuma resposta do
    Anime ou das Misturadas do dia; e a resposta certa pelos fatos (nas famílias do MAL, só com
    os dados dele). Devolve (erros,
    avisos): erro nos dias gerados com este catálogo; aviso nos de antes, como no Anime. No acervo
    curto, o afrouxamento das respostas do dia vira aviso."""
    version = ctx.version
    errors: list[str] = []
    warnings: list[str] = []
    relaxed = 0
    for where, day in sorted(schedule["days"].items()):
        found = _day_rule_problems(where, day, ctx)
        if ctx.short:
            # As fixtures (34 faixas) afrouxam as respostas do dia (o último nível de STEPS):
            # um aviso só, com a conta, e não um por rodada.
            moved = [p for p in found if "resposta do Anime ou das Misturadas" in p]
            relaxed += len(moved)
            found = [p for p in found if p not in moved]
        if day["catalogVersion"] == version:
            errors += found
        else:
            warnings += [f"{p} (catálogo mudou depois do dia)" for p in found]
    if relaxed:
        warnings.append(
            f"quiz: {relaxed} rodada(s) com uma resposta do Anime ou das Misturadas do dia"
            " (acervo curto)"
        )
    return errors, warnings


def _added(base: JSON | None, current: JSON) -> list[str]:
    known = base["days"] if base else {}
    return sorted(d for d in current["days"] if d not in known)


# O que a conferência sem os dados do MAL compara num dia de uma família do MAL (P380).
PARTIAL_KEYS = ("number", "catalogVersion", "family", "direction", "mal")


def quiz_regenerate_problems(base: JSON | None, current: JSON, ctx: QuizContext) -> list[str]:
    """Os dias novos são os que o gerador daria: cada um é refeito com os dias de antes (os
    gravados), o catálogo, os fatos e as agendas ao lado. Sem os dados do MAL, os dias das
    famílias dele têm conferidas só a família e a direção (P380). Agenda nova (sem base) fica com
    a validação, como nas outras."""
    added = _added(base, current)
    if not base or not base["days"] or not added:
        return []
    epoch = date.fromisoformat(current["epoch"])
    problems: list[str] = []
    for day_str in added:
        stored = current["days"][day_str]
        before = {k: v for k, v in current["days"].items() if k < day_str}
        try:
            again, _ = _generate_day(
                before, date.fromisoformat(day_str), epoch, ctx, bool(stored["mal"])
            )
        except ScheduleError as exc:
            problems.append(f"{day_str}: não deu para regerar o dia: {exc}")
            continue
        if FAMILY_BY_ID[again["family"]].needs_mal and ctx.mal is None:
            same = all(again.get(k) == stored.get(k) for k in PARTIAL_KEYS)
        else:
            same = again == stored
        if not same:
            problems.append(
                f"{day_str}: dia novo diferente do que o gerador daria (editado à mão, ou o"
                " catálogo mudou depois do schedule-quiz?)"
            )
    return problems
