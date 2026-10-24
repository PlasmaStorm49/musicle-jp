"""O Anime (M14): as músicas de anime, com a prévia da Apple, e as duas respostas de cada uma (a
música e a franquia do anime).

Puro e determinístico, como o catálogo: lê os snapshots do `fetch --anime` pelo provedor, sem rede
e sem a biblioteca de romaji, e refaz o catálogo do zero a cada build. O casamento de um tema com
a faixa da Apple (`match_theme`) também é puro: o `fetch --anime` o chama com o cutlet, e os
testes, com uma tabela.

As fontes de anime (AnimeThemes, AnisongDB, MyAnimeList) só dão dados (P251): o áudio é sempre a
prévia da Apple. Da popularidade, o snapshot guarda só o nível de 0 a 9 de cada fonte (P254), e
do MyAnimeList, só o id e o nível (P256).
"""

from __future__ import annotations

import contextlib
import re
import unicodedata
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from decimal import ROUND_HALF_EVEN, Decimal, localcontext
from difflib import SequenceMatcher
from typing import Protocol

from musicle_pipeline.aliases import KINDS
from musicle_pipeline.artists import (
    artist_base_title,
    artist_title_key,
    canonical_order,
    is_out_suffix,
    last_tail,
    preview_of,
    version_kind,
)
from musicle_pipeline.catalog import (
    Curation,
    album_record,
    artist_display_of,
    artist_record,
    catalog_version,
    eligibility,
    entity_id,
)
from musicle_pipeline.models import JSON, TIMESTAMP, ChartSnapshot, InputError, RawTrack
from musicle_pipeline.normalize import display, needs_romaji, search_key, search_keys
from musicle_pipeline.romaji_cache import artist_text, track_text

SCHEMA_VERSION = 1
THEME_TYPES = ("OP", "ED", "IN")
MODES = ("musica", "titulo")  # acertar a música, acertar o anime (P231)
TIERS = ("facil", "medio", "dificil")
MAX_LEVEL = 9  # o nível de popularidade de cada fonte vai de 0 a 9 (P254)
# De onde vem cada nível: do anime (o MyAnimeList) e do tema (o Anime Music Quiz, pelo
# AnisongDB, e as playlists do AnimeThemes).
ANIME_LEVELS = ("mal",)
THEME_LEVELS = ("anisongdb", "animethemes")
# O resultado da busca de cada tema, no snapshot: só o "matched" tem faixa.
RESULTS = ("matched", "no-artist", "no-match", "ambiguous", "no-preview")
# As faixas de dificuldade (P272 a P275, calibradas na carga grande, C2). Cada tema vira a chance
# de acertar cada modo, um produto de fatores entre 0 e 1 (a conta está no `chances`).
# Sem o quiz, o quiz médio dos temas do C2 que têm os dois níveis, por nível das playlists
# (o índice); sem nenhum dos dois, NO_QUIZ.
QUIZ_FROM_PL = tuple(
    Decimal(q) for q in ("2.2", "2.5", "2.4", "3.1", "3.1", "3.5", "4.3", "5.2", "6.0", "7.4")
)
NO_QUIZ = Decimal(2)
# O anime do nível 9 do MAL (o top 50) tem a chance MAL_TOP, e cada nível abaixo multiplica por
# MAL_STEP. Sem o nível, o NO_MAL.
MAL_TOP = Decimal("0.92")
MAL_STEP = Decimal("0.8")
NO_MAL = 1
# O fator do tipo do tema em cada modo: o encerramento é menos ouvido que a abertura, e a insert
# song quase nunca é lembrada.
TYPE_FACTOR = {
    "musica": {"OP": Decimal(1), "ED": Decimal("0.8"), "IN": Decimal("0.3")},
    "titulo": {"OP": Decimal(1), "ED": Decimal("0.8"), "IN": Decimal("0.15")},
}
# No "acertar o anime", a insert song com o quiz a partir deste conta como abertura: é a abertura
# de outra temporada, e o quiz mede quem reconhece o anime pela música. Vale também o quiz
# estimado pelas playlists (o pl 9 dá 7,4), como na calibração.
IN_AS_OPENING_QUIZ = 7
# No "acertar a música": o título sem o nível das playlists vale o quiz com este desconto, e a
# fama do anime entra com este expoente (pesa menos que a do tema).
NO_PL_FACTOR = Decimal("0.8")
ANIME_EXPONENT = Decimal("0.4")
# Os cortes fixos (P273): Fácil a partir do 1º, Médio a partir do 2º. São constantes de
# propósito: recalcular os quantis a cada build mudaria a faixa das músicas conforme o acervo
# cresce. Vieram dos quantis da chance na carga do C2, antes do teto da P274 (o Fácil com 25%
# das músicas; o Médio até 58% no "acertar o anime" e até 55% no "acertar a música"), num
# número redondo logo abaixo do valor do quantil, para as músicas empatadas nele ficarem juntas.
CUTS = {
    "musica": (Decimal("0.271"), Decimal("0.145")),
    "titulo": (Decimal("0.25"), Decimal("0.108")),
}
# O ícone (P274), a música que a pessoa sabe o nome mesmo sem ver o anime: as playlists e o quiz
# no alto, ou o artista na parada dos Hits até a última antes da calibração (19/10/2026). A
# data é fixa, para o catálogo do Anime não mudar a cada parada nova, e é a de um snapshot que
# já existe: o fetch recusa um dia anterior ao último (regra 19), então nenhum entra nela.
ICON_PL = 8
ICON_QUIZ = 7
ICON_CHART_UNTIL = "2026-10-19"
_SLUG = re.compile(r"[a-z0-9_-]+")
FRANCHISE_PREFIX = "anime:fr:"


@dataclass(frozen=True)
class Theme:
    """Um tema do anime (a abertura, o encerramento ou a insert song) e o que a busca achou."""

    type: str  # OP, ED ou IN
    sequence: int | None
    song: str  # o título do AnimeThemes (em romaji ou em inglês)
    artists: tuple[str, ...]  # os nomes do AnimeThemes, em latino
    levels: Mapping[str, int]
    result: str
    track: RawTrack | None  # só no "matched"


@dataclass(frozen=True)
class Anime:
    mal_id: int
    slug: str  # o do AnimeThemes: a franquia do anime que não está em série nenhuma
    name: str
    synonyms: tuple[str, ...]
    year: int | None
    series: tuple[tuple[str, str], ...]  # (slug, nome) de cada série (franquia) do AnimeThemes
    levels: Mapping[str, int]
    themes: tuple[Theme, ...]


@dataclass(frozen=True)
class AnimeSource:
    """O que os snapshots juntos dizem: os animes tentados, com os temas e as faixas achadas."""

    snapshots: tuple[tuple[str, str], ...]  # (id, fetchedAt), na ordem
    anime: tuple[Anime, ...]


class AnimeProvider(Protocol):
    name: str
    storefront: str
    warnings: list[str]

    def source(self) -> AnimeSource: ...


# ---------------------------------------------------------------------------------------------
# A leitura do snapshot (o formato é o mesmo nos dois provedores; só a faixa muda de forma).


# As chaves aceitas em cada nível do snapshot: uma a mais (um "score" bruto, por exemplo) é
# recusada, porque sem revisão humana (P238) esta é a trava da P254.
ANIME_KEYS = {"malId", "slug", "name", "synonyms", "year", "series", "levels", "themes"}
THEME_KEYS = {"type", "sequence", "song", "artists", "levels", "result", "track"}


def _closed(data: JSON, allowed: set[str], where: str) -> None:
    extra = sorted(set(data) - allowed)
    if extra:
        raise InputError(f"{where}: chave desconhecida {extra}")


def _levels(value: object, allowed: tuple[str, ...], where: str) -> dict[str, int]:
    if not isinstance(value, dict) or not set(value) <= set(allowed):
        raise InputError(f"{where}: levels aceita só {list(allowed)}")
    for key, level in value.items():
        if not isinstance(level, int) or isinstance(level, bool) or not 0 <= level <= MAX_LEVEL:
            raise InputError(f"{where}: nível {key} deveria ser um inteiro de 0 a {MAX_LEVEL}")
    return dict(value)


def _texts(value: object, where: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
        raise InputError(f"{where}: deveria ser uma lista de textos")
    return tuple(display(v) for v in value)


def theme_from_dict(data: JSON, track_of: Callable[[object, str], RawTrack], where: str) -> Theme:
    if not isinstance(data, dict):
        raise InputError(f"{where}: tema com forma inesperada")
    _closed(data, THEME_KEYS, where)
    kind, sequence, result = data.get("type"), data.get("sequence"), data.get("result")
    if kind not in THEME_TYPES:
        raise InputError(f"{where}: type deveria ser um de {list(THEME_TYPES)}")
    where = f"{where} {kind}{sequence or ''}"
    if sequence is not None and (
        not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1
    ):
        raise InputError(f"{where}: sequence deveria ser um inteiro positivo ou null")
    if result not in RESULTS:
        raise InputError(f"{where}: result deveria ser um de {list(RESULTS)}")
    song = data.get("song")
    if not isinstance(song, str) or not song.strip():
        raise InputError(f"{where}: song vazio")
    ref = data.get("track")
    if (result == "matched") != (ref is not None):
        raise InputError(f"{where}: só o result matched tem track")
    return Theme(
        type=kind,
        sequence=sequence,
        song=display(song),
        artists=_texts(data.get("artists", []), f"{where} artists"),
        levels=_levels(data.get("levels", {}), THEME_LEVELS, where),
        result=result,
        track=None if ref is None else track_of(ref, where),
    )


def anime_from_dict(data: JSON, track_of: Callable[[object, str], RawTrack], where: str) -> Anime:
    if not isinstance(data, dict):
        raise InputError(f"{where}: anime com forma inesperada")
    _closed(data, ANIME_KEYS, where)
    mal_id = data.get("malId")
    if not isinstance(mal_id, int) or isinstance(mal_id, bool) or mal_id < 1:
        raise InputError(f"{where}: malId deveria ser um inteiro positivo")
    where = f"{where} anime {mal_id}"
    slug, name, year = data.get("slug"), data.get("name"), data.get("year")
    if not isinstance(slug, str) or not _SLUG.fullmatch(slug):
        raise InputError(f"{where}: slug inválido")
    if not isinstance(name, str) or not name.strip():
        raise InputError(f"{where}: name vazio")
    if year is not None and (not isinstance(year, int) or isinstance(year, bool)):
        raise InputError(f"{where}: year deveria ser um inteiro ou null")
    series = data.get("series", [])
    if not isinstance(series, list) or not all(
        isinstance(s, dict)
        and isinstance(s.get("slug"), str)
        and _SLUG.fullmatch(s["slug"])
        and isinstance(s.get("name"), str)
        and s["name"].strip()
        for s in series
    ):
        raise InputError(f"{where}: series deveria ser uma lista de {{slug, name}}")
    themes = data.get("themes", [])
    if not isinstance(themes, list):
        raise InputError(f"{where}: themes deveria ser uma lista")
    return Anime(
        mal_id=mal_id,
        slug=slug,
        name=display(name),
        synonyms=_texts(data.get("synonyms", []), f"{where} synonyms"),
        year=year,
        series=tuple((s["slug"], display(s["name"])) for s in series),
        levels=_levels(data.get("levels", {}), ANIME_LEVELS, where),
        themes=tuple(theme_from_dict(t, track_of, where) for t in themes),
    )


def check_snapshot_header(data: JSON, where: str, allowed: set[str]) -> tuple[str, str]:
    """O id e o fetchedAt de um snapshot do Anime, que só tem as chaves `allowed`."""
    _closed(data, allowed, where)
    snapshot_id, fetched_at = data.get("id"), data.get("fetchedAt")
    if not isinstance(snapshot_id, str) or not snapshot_id:
        raise InputError(f"{where}: id ausente")
    if not isinstance(fetched_at, str) or not TIMESTAMP.fullmatch(fetched_at):
        raise InputError(f"{where}: fetchedAt fora do formato AAAA-MM-DDTHH:MM:SSZ")
    if not isinstance(data.get("anime"), list):
        raise InputError(f"{where}: anime deveria ser uma lista")
    return snapshot_id, fetched_at


def _theme_key(theme: Theme) -> tuple[str, int | None, str]:
    return theme.type, theme.sequence, theme.song


def merge_anime(batches: Iterable[Sequence[Anime]]) -> tuple[Anime, ...]:
    """Os animes de todos os snapshots, na ordem. Um anime buscado de novo vale pelo mais novo,
    mas uma faixa que já casou nunca some: a agenda pode citá-la (os ids do catálogo não somem,
    e um dia gravado não muda). O tema antigo fica como estava se a busca nova não casou, e fica
    ao lado do novo se ela casou com outra faixa (as duas são a mesma música)."""
    merged: dict[int, Anime] = {}
    for batch in batches:
        for anime in batch:
            old = merged.get(anime.mal_id)
            if old is not None:
                tracks = {t.track.provider_id for t in anime.themes if t.track is not None}
                kept = tuple(
                    t
                    for t in old.themes
                    if t.track is not None and t.track.provider_id not in tracks
                )
                # O tema novo sem faixa, com um antigo que casou: fica o antigo, uma vez só.
                kept_keys = {_theme_key(k) for k in kept}
                fresh = tuple(
                    t for t in anime.themes if t.track is not None or _theme_key(t) not in kept_keys
                )
                anime = replace(anime, themes=fresh + kept)
            merged[anime.mal_id] = anime
    return tuple(merged[k] for k in sorted(merged))


# ---------------------------------------------------------------------------------------------
# O casamento de um tema com a faixa da Apple (P242, P244, P246), para o fetch --anime.

Romanizer = Callable[[str], Sequence[str]]
# A semelhança só vale com folga grande para a 2ª música mais parecida (P246): na dúvida,
# descarta. Provisórios: a carga de teste (C1) mede.
FUZZY_MIN = 0.6
FUZZY_MARGIN = 0.25
# Na semelhança, a faixa precisa ser da época do anime: um ano antes (o single que saiu antes da
# estreia) até dois depois.
YEARS_BEFORE, YEARS_AFTER = 1, 2
_TV_SIZE = re.compile(
    r"tv\s*-?\s*(?:size|サイズ|ver(?:sion)?|edit)(?:\s*ver(?:sion)?)?\.?", re.IGNORECASE
)
# A semelhança só entre chaves de comprimento parecido: "gurenge" e "gurenka" (o cutlet troca
# uma letra) passam; "hana" e "hanabi" (outra música que começa igual), não.
LENGTH_SLACK = 0.15


@dataclass(frozen=True)
class Match:
    result: str  # matched, no-match, ambiguous ou no-preview
    track: RawTrack | None = None
    score: tuple[float, float] | None = None  # a 1ª e a 2ª músicas mais parecidas


def _forms(text: str, romanize: Romanizer) -> set[str]:
    """As chaves de comparação de um título: a da busca e, com kana ou kanji, a do romaji."""
    forms = {search_key(text)}
    if needs_romaji(text):
        # O cutlet não leu nada (o título só de marcas): fica só a chave da busca.
        with contextlib.suppress(ValueError):
            forms |= {search_key(v) for v in romanize(text)}
    return {f for f in forms if f}


def _similarity(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if abs(len(a) - len(b)) > max(1, LENGTH_SLACK * max(len(a), len(b))):
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _tv_only(t: RawTrack) -> bool:
    """A TV size, que só é resposta quando a completa não toca (P244). Um sufixo que nunca entra
    (ao vivo, karaokê) junto com o dela tira a faixa da reserva."""
    s = unicodedata.normalize("NFKC", t.title).strip()
    tv = False
    while (cut := last_tail(s)) is not None and cut[0]:
        rest, inner = cut
        if _TV_SIZE.fullmatch(inner):
            tv = True
        elif is_out_suffix(inner):
            return False
        s = rest
    return tv and version_kind(replace(t, title=s)) != "out"


def _near(year: int | None, group: Sequence[RawTrack]) -> bool:
    if year is None:
        return True
    return any(
        year - YEARS_BEFORE <= int(t.album.release_date[:4]) <= year + YEARS_AFTER for t in group
    )


def _round(value: float) -> float:
    return float(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN))


def _match_in(
    song_forms: set[str],
    pool: Sequence[RawTrack],
    reserve: Sequence[RawTrack],
    romanize: Romanizer,
    year: int | None,
) -> Match:
    groups: dict[tuple[str, str], list[RawTrack]] = {}
    for t in [*pool, *reserve]:
        key = (t.artists[0].provider_id, artist_title_key(t.title))
        groups.setdefault(key, []).append(t)
    if not groups:
        return Match("no-match")
    scored = []
    for key, group in groups.items():
        forms = set().union(*(_forms(artist_base_title(t.title), romanize) for t in group))
        best = max(_similarity(a, b) for a in song_forms for b in forms) if forms else 0.0
        scored.append((-best, key, group))
    scored.sort(key=lambda s: (s[0], s[1]))
    best, second = -scored[0][0], (-scored[1][0] if len(scored) > 1 else 0.0)
    score = (_round(best), _round(second))
    group = scored[0][2]
    if best == 1.0:
        if second == 1.0:
            return Match("ambiguous", score=score)  # dois títulos iguais: na dúvida, descarta
    elif best < FUZZY_MIN or year is None or not _near(year, group):
        # Sem o ano da estreia, só o título igual: a semelhança sozinha é dúvida.
        return Match("no-match", score=score)
    elif best - second < FUZZY_MARGIN:
        return Match("ambiguous", score=score)
    playable = [t for t in group if eligibility(preview_of(t), t.album.artwork_url)["daily"]]
    # A TV size disputa o título com as outras músicas, mas só é a resposta quando nenhuma
    # versão completa da mesma música toca (P244).
    full = [t for t in playable if t not in reserve]
    if not (full or playable):
        return Match("no-preview", score=score)
    chosen = full or playable
    # O mesmo título do artista em épocas diferentes (outra música, ou a regravação): vale a
    # versão da época do anime, se houver.
    near = [t for t in chosen if _near(year, [t])]
    return Match("matched", min(near or chosen, key=canonical_order), score)


def match_theme(
    song: str, candidates: Sequence[RawTrack], romanize: Romanizer, year: int | None = None
) -> Match:
    """A faixa da discografia (as faixas dos artistas do tema na Apple) que é a música do tema.

    Em camadas (P246): o título igual (o japonês contra o japonês, o romaji contra o romaji);
    senão, o mais parecido, só com folga grande para a 2ª música e da época do anime. As versões
    que nunca são resposta (karaokê, ao vivo...) ficam de fora, e a TV size é a reserva (P244).
    A versão escolhida é a canônica do modo por artista (a original, de álbum que não é
    coletânea, a mais antiga) entre as que tocam.
    """
    song_forms = _forms(song, romanize)
    if not song_forms:
        return Match("no-match")
    primary = [t for t in candidates if version_kind(t) != "out"]
    reserve = [t for t in candidates if version_kind(t) == "out" and _tv_only(t)]
    return _match_in(song_forms, primary, reserve, romanize, year)


# ---------------------------------------------------------------------------------------------
# As faixas de dificuldade (P272 a P275).


def chances(theme: Theme, anime: Anime, songs: int) -> dict[str, Decimal]:
    """A chance de acertar cada modo (P272), com os níveis de 0 a 9 de cada fonte:

    - p_t = (quiz + 0,5) / 10, a taxa de acerto do Anime Music Quiz (sem o quiz, o estimado pelas
      playlists, `QUIZ_FROM_PL`); p_pl = (pl + 0,5) / 10, as playlists do AnimeThemes;
      p_a = MAL_TOP × MAL_STEP^(9 − m), o MyAnimeList;
    - acertar o anime: p_a × p_t × o fator do tipo;
    - acertar a música: √(p_t × p_pl) × p_a^ANIME_EXPONENT × o fator do tipo × a concorrência,
      1 / (1 + (1 − p_t) × ln n), com n = `songs`, as músicas do mesmo tipo na franquia (a 21ª
      ED de BLEACH quase ninguém sabe o nome); a muito conhecida (p_t alto) sofre menos.

    Em Decimal (aritmética em software, regra 8): o mesmo resultado em qualquer sistema.
    """
    quiz_level = theme.levels.get("anisongdb")
    pl = theme.levels.get("animethemes")
    if quiz_level is not None:
        quiz = Decimal(quiz_level)
    else:
        quiz = QUIZ_FROM_PL[pl] if pl is not None else NO_QUIZ
    mal = next((anime.levels[k] for k in ANIME_LEVELS if k in anime.levels), NO_MAL)
    show_type = "OP" if theme.type == "IN" and quiz >= IN_AS_OPENING_QUIZ else theme.type
    with localcontext() as ctx:
        ctx.prec = 28
        p_t = (quiz + Decimal("0.5")) / 10
        p_a = MAL_TOP * MAL_STEP ** (MAX_LEVEL - mal)
        title = (p_t * (pl + Decimal("0.5")) / 10).sqrt() if pl is not None else p_t * NO_PL_FACTOR
        rivals = 1 / (1 + (1 - p_t) * Decimal(max(songs, 1)).ln())
        return {
            "musica": title * p_a**ANIME_EXPONENT * TYPE_FACTOR["musica"][theme.type] * rivals,
            "titulo": p_a * p_t * TYPE_FACTOR["titulo"][show_type],
        }


def is_icon(theme: Theme) -> bool:
    """O tema que é ícone pelos próprios níveis (P274; o do artista da parada vem à parte)."""
    return (
        theme.levels.get("animethemes", -1) >= ICON_PL
        and theme.levels.get("anisongdb", -1) >= ICON_QUIZ
    )


def tiers_of(chance: Mapping[str, Decimal], icon: bool) -> dict[str, str]:
    """As faixas pelos cortes fixos (P273). O nome da música quase sempre é mais difícil que o
    anime (P274): no "acertar a música", a faixa nunca é mais fácil que a do "acertar o anime",
    salvo o ícone."""
    tiers = {}
    for mode in MODES:
        easy, medium = CUTS[mode]
        value = chance[mode]
        tiers[mode] = "facil" if value >= easy else "medio" if value >= medium else "dificil"
    if not icon and TIERS.index(tiers["musica"]) < TIERS.index(tiers["titulo"]):
        tiers["musica"] = tiers["titulo"]
    return tiers


# O título frouxo, para achar o mesmo tema escrito de dois jeitos (P275): sem o enfeite do fim
# ("02~O-Two~", "(TV size)", "feat. AKLO", "with ..."), e com o ø e o 0 como "o" ("shØut" e
# "sh0ut"). Muito parecido é a razão do SequenceMatcher a partir de SAME_SONG_RATIO ("Rubikon"
# e "Rubicon").
_DECOR = re.compile(r"\s*(?:[~～<＜(（\[].*|\b(?:feat|ft)\.?\s.*|\bwith\s.*)$", re.IGNORECASE)
SAME_SONG_RATIO = 0.8


# Antes do search_key, que encurta o "ou" ("Soul" e "S0ul" ficam iguais).
_O_LIKE = str.maketrans({"Ø": "o", "ø": "o", "0": "o"})


def loose_title(song: str) -> str:
    return search_key((_DECOR.sub("", song) or song).translate(_O_LIKE))


def same_song(a: str, b: str) -> bool:
    """Dois títulos frouxos (`loose_title`) do mesmo tema: iguais ou muito parecidos. A razão do
    SequenceMatcher muda com a ordem dos dois ("tide" e "diet" dão 0,25 e 0,5): a ordem fixa
    deixa a junção igual qualquer que seja a ordem dos temas."""
    return a == b or SequenceMatcher(None, *sorted((a, b))).ratio() >= SAME_SONG_RATIO


def joined_levels(anime: Anime) -> tuple[Mapping[str, int], ...]:
    """Os níveis de cada tema do anime, completados pelos do outro registro do mesmo tema (P275).

    As fontes escrevem o título de jeitos diferentes, e as buscas até o C2 só juntavam o título
    igual: "LOST IN PARADISE feat. AKLO" (AnimeThemes) ficou sem o quiz, que foi para um tema à
    parte, "LOST IN PARADISE" (AnisongDB). Junta o único tema do mesmo tipo com o título frouxo
    igual ou muito parecido; o nível do próprio tema vence.
    """
    keys = [loose_title(t.song) for t in anime.themes]
    joined = []
    for i, theme in enumerate(anime.themes):
        others = [
            other
            for j, other in enumerate(anime.themes)
            if j != i and other.type == theme.type and same_song(keys[j], keys[i])
        ]
        levels = dict(theme.levels)
        if len(others) == 1:
            for source, level in others[0].levels.items():
                levels.setdefault(source, level)
        joined.append(levels)
    return tuple(joined)


SongCounts = Mapping[tuple[str, str], int]  # (franquia, tipo do tema) → as músicas distintas


def franchise_songs(anime: Iterable[Anime]) -> dict[tuple[str, str], int]:
    """As músicas distintas (pelo título frouxo) de cada franquia e tipo: o n da concorrência.
    Contam todos os temas, com faixa ou não."""
    songs: dict[tuple[str, str], set[str]] = {}
    for a in anime:
        for theme in a.themes:
            songs.setdefault((main_franchise(a), theme.type), set()).add(loose_title(theme.song))
    return {key: len(titles) for key, titles in songs.items()}


def chart_artists(provider: str, snapshots: Iterable[ChartSnapshot]) -> frozenset[str]:
    """Os ids dos artistas da parada dos Hits até `ICON_CHART_UNTIL` (o ícone, P274). Só o
    artista principal de cada faixa: o parceiro sai de todos os snapshots (regra 20), e um
    snapshot novo mudaria o conjunto."""
    return frozenset(
        entity_id(provider, "ar", entry.track.artists[0].provider_id)
        for snapshot in snapshots
        if snapshot.date <= ICON_CHART_UNTIL
        for entry in snapshot.entries
    )


# A popularidade publicada é só a da faixa mais fácil (P240): o arquivo não leva o nível de
# fonte nenhuma, nem o do MAL. A web só a usa para ordenar as sugestões.
_TIER_POPULARITY = {"facil": 1.0, "medio": 0.6667, "dificil": 0.3333}


# ---------------------------------------------------------------------------------------------
# O catálogo publicado.


def franchises_of(anime: Anime) -> tuple[tuple[str, str], ...]:
    """As franquias do anime (P234): as séries do AnimeThemes; sem série, o próprio anime."""
    return anime.series or ((anime.slug, anime.name),)


def main_franchise(anime: Anime) -> str:
    """A 1ª franquia do anime, a da concorrência (P272)."""
    return franchises_of(anime)[0][0]


def franchise_id(slug: str) -> str:
    return FRANCHISE_PREFIX + slug


def song_key(provider: str, track: RawTrack) -> str:
    """A chave do modo por artista, que junta a TV size e a completa: a janela da P245 conta as
    duas como a mesma música."""
    artist = entity_id(provider, "ar", track.artists[0].provider_id)
    return f"{artist_title_key(track.title)}|{artist}"


@dataclass
class _TrackAcc:
    track: RawTrack
    uses: list[tuple[Anime, Theme]] = field(default_factory=list)


def song_chances(
    provider: str, accs: Iterable[_TrackAcc], icon_artists: frozenset[str], songs: SongCounts
) -> tuple[dict[str, dict[str, Decimal]], set[str]]:
    """A maior chance de cada modo de cada música (a songKey), entre todos os temas de todas as
    faixas dela (a TV size e a completa, ou a abertura de uma temporada que é a insert song de
    outra): a janela já as conta como uma música só (P245), e a fama é da música. Também as
    músicas que são ícone (P274)."""
    best: dict[str, dict[str, Decimal]] = {}
    icons: set[str] = set()
    for acc in accs:
        key = song_key(provider, acc.track)
        top = best.setdefault(key, dict.fromkeys(MODES, Decimal(0)))
        if any(entity_id(provider, "ar", a.provider_id) in icon_artists for a in acc.track.artists):
            icons.add(key)
        for anime, theme in acc.uses:
            for mode, value in chances(
                theme, anime, songs[main_franchise(anime), theme.type]
            ).items():
                top[mode] = max(top[mode], value)
            if is_icon(theme):
                icons.add(key)
    return best, icons


def _song_tiers(
    provider: str, accs: Iterable[_TrackAcc], icon_artists: frozenset[str], songs: SongCounts
) -> dict[str, dict[str, str]]:
    """As faixas de cada música (a songKey), pela chance dela (`song_chances`)."""
    best, icons = song_chances(provider, accs, icon_artists, songs)
    return {key: tiers_of(chance, key in icons) for key, chance in best.items()}


def _track_record(
    provider: str, acc: _TrackAcc, album: JSON, cur: Curation, tiers: Mapping[str, str]
) -> JSON:
    t = acc.track
    track_id = entity_id(provider, "tr", t.provider_id)
    text = track_text(t.title)
    sung = sorted({theme.song for _, theme in acc.uses})
    # O título do AnimeThemes já vem em romaji: é o latino da faixa em japonês ("紅蓮華" →
    # "Gurenge"), como o latino do provedor na parada.
    latin_from = (
        next((s for s in sung if not needs_romaji(s)), None) if needs_romaji(text) else None
    )
    latin, source = cur.latin("tracks", track_id, text, latin_from)
    preview = preview_of(t)
    artist_ids = [entity_id(provider, "ar", a.provider_id) for a in t.artists]
    artist_texts = [
        s
        for a, aid in zip(t.artists, artist_ids, strict=True)
        for s in cur.search_texts("artists", aid, artist_text(a.name), a.name_latin)
    ]
    if t.artist_display:
        artist_texts.append(artist_text(t.artist_display))
    # Os nomes do AnimeThemes, em latino ("Kenshi Yonezu"), também acham a faixa.
    artist_texts += [n for _, theme in acc.uses for n in theme.artists]
    themes = sorted(
        {(anime.name, theme.type, theme.sequence or 0) for anime, theme in acc.uses},
        key=lambda x: (THEME_TYPES.index(x[1]), x[2], x[0]),
    )
    return {
        "id": track_id,
        "songKey": song_key(provider, t),
        "title": text,
        "titleLatin": latin,
        "latinSource": source,
        "artistIds": artist_ids,
        "artistDisplay": artist_display_of(t),
        "albumId": album["id"],
        "releaseDate": t.album.release_date,
        "durationMs": t.duration_ms,
        "explicit": t.explicit,
        "preview": preview,
        "storeUrl": t.store_url,
        "popularity": _TIER_POPULARITY[min(tiers.values(), key=TIERS.index)],
        "eligible": eligibility(
            preview, album["artworkUrl"], blocked=cur.aliases.get("tracks", track_id).block
        ),
        "search": {
            "title": search_keys([*cur.search_texts("tracks", track_id, text, latin_from), *sung]),
            "artist": search_keys(artist_texts),
        },
        "anime": {
            "franchiseIds": sorted(
                {franchise_id(slug) for anime, _ in acc.uses for slug, _ in franchises_of(anime)}
            ),
            "themes": [
                {"anime": name, "type": kind, "sequence": sequence or None}
                for name, kind, sequence in themes
            ],
            "tiers": dict(tiers),
        },
    }


def _franchise_records(anime: Sequence[Anime], used: set[str]) -> list[JSON]:
    """Cada franquia com uma faixa: o nome e as chaves de busca de todos os títulos e sinônimos
    dos animes dela (digitar "Bakemonogatari" acha "Monogatari")."""
    names: dict[str, str] = {}
    texts: dict[str, list[str]] = {}
    years: dict[str, list[int]] = {}
    for a in anime:
        for slug, name in franchises_of(a):
            fid = franchise_id(slug)
            names.setdefault(fid, name)
            texts.setdefault(fid, [name]).extend([a.name, *a.synonyms])
            if a.year is not None:
                years.setdefault(fid, []).append(a.year)
    owners: dict[str, list[str]] = {}
    for fid in sorted(used):
        owners.setdefault(names[fid], []).append(fid)
    for name, fids in owners.items():
        if len(fids) > 1:
            # Duas franquias com o mesmo nome (um remake sem série): o jogador não as
            # distinguiria na lista. O ano da 1ª temporada as separa; sem ano, o slug.
            for fid in fids:
                first = min(years.get(fid, []), default=None)
                names[fid] = (
                    f"{name} ({first if first is not None else fid[len(FRANCHISE_PREFIX) :]})"
                )
    return [
        {"id": fid, "name": names[fid], "search": search_keys(texts[fid])} for fid in sorted(used)
    ]


def _stale_aliases(provider: str, tracks: Iterable[RawTrack], cur: Curation) -> list[str]:
    known: dict[str, set[str]] = {kind: set() for kind in KINDS}
    for t in tracks:
        known["tracks"].add(entity_id(provider, "tr", t.provider_id))
        known["albums"].add(entity_id(provider, "al", t.album.provider_id))
        known["artists"].update(entity_id(provider, "ar", a.provider_id) for a in t.artists)
    return [f"{k}: {eid}" for k in KINDS for eid in sorted(cur.aliases.ids(k) - known[k])]


def _accumulate(source: AnimeSource) -> tuple[dict[str, _TrackAcc], dict[str, int]]:
    """Os usos (o anime e o tema, com os níveis juntos) de cada faixa casada, e a contagem dos
    resultados da busca."""
    if not source.snapshots:
        raise InputError("nenhum snapshot do Anime")
    accs: dict[str, _TrackAcc] = {}
    results: dict[str, int] = {}
    for anime in source.anime:
        for theme, levels in zip(anime.themes, joined_levels(anime), strict=True):
            results[theme.result] = results.get(theme.result, 0) + 1
            if theme.track is not None:
                acc = accs.setdefault(theme.track.provider_id, _TrackAcc(theme.track))
                acc.uses.append((anime, replace(theme, levels=levels)))
    if not accs:
        raise InputError("nenhum tema casou com uma faixa da Apple")
    return accs, results


def anime_chances(
    provider: str, source: AnimeSource, *, icon_artists: frozenset[str]
) -> dict[str, dict[str, Decimal]]:
    """A chance de cada música por modo (P272), a mesma que dá as faixas do catálogo. Só para o
    laboratório das Misturadas (M17), num arquivo fora do Git: o catálogo publicado leva só a
    faixa (P240), e o repositório não guarda número (P254)."""
    accs, _ = _accumulate(source)
    best, _ = song_chances(provider, accs.values(), icon_artists, franchise_songs(source.anime))
    return best


def build_anime_catalog(
    provider: str,
    storefront: str,
    source: AnimeSource,
    cur: Curation,
    notes: list[str],
    *,
    icon_artists: frozenset[str],
) -> JSON:
    """O catálogo do Anime a partir de todos os snapshots. Os avisos vão para `notes`;
    `icon_artists` são os artistas cuja música é ícone (`chart_artists`, P274)."""
    accs, results = _accumulate(source)
    stale = _stale_aliases(provider, (a.track for a in accs.values()), cur)
    if stale:
        raise InputError("aliases.toml do Anime cita IDs sem faixa:\n" + "\n".join(stale))
    tiers = _song_tiers(provider, accs.values(), icon_artists, franchise_songs(source.anime))
    artists: dict[str, JSON] = {}
    albums: dict[str, JSON] = {}
    tracks: list[JSON] = []
    for key in sorted(accs):
        t = accs[key].track
        for a in t.artists:
            artists[entity_id(provider, "ar", a.provider_id)] = artist_record(provider, a, cur)
        album = {k: v for k, v in album_record(provider, t, cur).items() if k != "similar"}
        albums[album["id"]] = album
        tracks.append(_track_record(provider, accs[key], album, cur, tiers[song_key(provider, t)]))
    used = {fid for t in tracks for fid in t["anime"]["franchiseIds"]}
    catalog: JSON = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": source.snapshots[-1][1],
        "provider": provider,
        "storefront": storefront,
        "snapshots": [{"id": sid, "fetchedAt": at} for sid, at in source.snapshots],
        "franchises": _franchise_records(source.anime, used),
        "artists": [artists[k] for k in sorted(artists)],
        "albums": [albums[k] for k in sorted(albums)],
        "tracks": sorted(tracks, key=lambda r: r["id"]),
    }
    # A receita do catálogo da parada; o dia é o da última busca (o snapshot não tem "date").
    catalog["catalogVersion"] = catalog_version(catalog, source.snapshots[-1][1][:10])
    summary = ", ".join(f"{k} {results[k]}" for k in RESULTS if k in results)
    notes.append(f"{len(tracks)} faixa(s) de {len(source.anime)} anime(s); temas: {summary}")
    notes.extend(
        f"{mode}: " + ", ".join(f"{tier} {n}" for tier, n in counts.items())
        for mode, counts in tier_counts(catalog).items()
    )
    return catalog


def tier_counts(catalog: JSON) -> dict[str, dict[str, int]]:
    """Quantas músicas tocáveis cada modo e faixa têm (o aviso de acervo curto, P235)."""
    counts = {mode: dict.fromkeys(TIERS, 0) for mode in MODES}
    for t in catalog["tracks"]:
        for mode in MODES:
            tier = t["anime"]["tiers"][mode]
            if t["eligible"]["daily"] and tier is not None:
                counts[mode][tier] += 1
    return counts
