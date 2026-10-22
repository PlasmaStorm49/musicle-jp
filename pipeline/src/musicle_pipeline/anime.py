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

import re
import unicodedata
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from decimal import ROUND_HALF_EVEN, Decimal
from difflib import SequenceMatcher
from typing import Protocol

from musicle_pipeline.aliases import KINDS
from musicle_pipeline.artists import (
    _canonical_order,
    _preview,
    artist_base_title,
    artist_title_key,
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
from musicle_pipeline.models import JSON, TIMESTAMP, InputError, RawTrack
from musicle_pipeline.normalize import (
    needs_romaji,
    search_key,
    search_keys,
    song_key,
    strip_version_suffix,
)
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
# Os cortes das faixas (P240), provisórios na carga de teste (C1) e calibrados na grande (C2).
# São constantes de propósito: recalcular os tercis a cada build mudaria a faixa das músicas
# conforme o acervo cresce.
EASY_LEVEL = 7
MEDIUM_LEVEL = 4
# Sem nível nenhum, a regra da abertura e do encerramento (P240).
_DEFAULT_TIER = {"OP": "medio", "ED": "dificil", "IN": "dificil"}
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
    return tuple(value)


def theme_from_dict(data: JSON, track_of: Callable[[object, str], RawTrack], where: str) -> Theme:
    if not isinstance(data, dict):
        raise InputError(f"{where}: tema com forma inesperada")
    kind, sequence, result = data.get("type"), data.get("sequence"), data.get("result")
    if kind not in THEME_TYPES:
        raise InputError(f"{where}: type deveria ser um de {list(THEME_TYPES)}")
    where = f"{where} {kind}{sequence or ''}"
    if sequence is not None and (not isinstance(sequence, int) or sequence < 1):
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
        song=song,
        artists=_texts(data.get("artists", []), f"{where} artists"),
        levels=_levels(data.get("levels", {}), THEME_LEVELS, where),
        result=result,
        track=None if ref is None else track_of(ref, where),
    )


def anime_from_dict(data: JSON, track_of: Callable[[object, str], RawTrack], where: str) -> Anime:
    if not isinstance(data, dict):
        raise InputError(f"{where}: anime com forma inesperada")
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
        name=name,
        synonyms=_texts(data.get("synonyms", []), f"{where} synonyms"),
        year=year,
        series=tuple((s["slug"], s["name"]) for s in series),
        levels=_levels(data.get("levels", {}), ANIME_LEVELS, where),
        themes=tuple(theme_from_dict(t, track_of, where) for t in themes),
    )


def check_snapshot_header(data: JSON, where: str) -> tuple[str, str]:
    """O id e o fetchedAt de um snapshot do Anime."""
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
    mas o tema que já casou com uma faixa nunca a perde: a agenda pode citá-la (os ids do
    catálogo não somem). Ele fica como estava, se a busca nova não casou."""
    merged: dict[int, Anime] = {}
    for batch in batches:
        for anime in batch:
            old = merged.get(anime.mal_id)
            if old is not None:
                matched = {_theme_key(t) for t in anime.themes if t.track is not None}
                kept = tuple(
                    t for t in old.themes if t.track is not None and _theme_key(t) not in matched
                )
                fresh = tuple(
                    t for t in anime.themes if _theme_key(t) not in {_theme_key(k) for k in kept}
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
_TV_SIZE = re.compile(r"tv\s*-?\s*(?:size|サイズ|ver|edit)", re.IGNORECASE)


@dataclass(frozen=True)
class Match:
    result: str  # matched, no-match, ambiguous ou no-preview
    track: RawTrack | None = None
    score: tuple[float, float] | None = None  # a 1ª e a 2ª músicas mais parecidas


def _forms(text: str, romanize: Romanizer) -> set[str]:
    """As chaves de comparação de um título: a da busca e, com kana ou kanji, a do romaji."""
    forms = {search_key(text)}
    if needs_romaji(text):
        forms |= {search_key(v) for v in romanize(text)}
    return {f for f in forms if f}


def _similarity(a: str, b: str) -> float:
    return 1.0 if a == b else SequenceMatcher(None, a, b).ratio()


def _tv_only(t: RawTrack) -> bool:
    """A TV size, que só é resposta quando a completa não está na loja (P244)."""
    title = unicodedata.normalize("NFKC", t.title)
    return (
        _TV_SIZE.search(title) is not None
        and version_kind(replace(t, title=strip_version_suffix(title))) != "out"
    )


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
    elif best < FUZZY_MIN or not _near(year, group):
        return Match("no-match", score=score)
    elif best - second < FUZZY_MARGIN:
        return Match("ambiguous", score=score)
    playable = [t for t in group if eligibility(_preview(t), t.album.artwork_url)["daily"]]
    # A TV size disputa o título com as outras músicas, mas só é a resposta quando nenhuma
    # versão completa da mesma música toca (P244).
    full = [t for t in playable if t not in reserve]
    if not (full or playable):
        return Match("no-preview", score=score)
    return Match("matched", min(full or playable, key=_canonical_order), score)


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
# As faixas de dificuldade (P240, P252).


def fame(theme: Theme, anime: Anime) -> dict[str, int | None]:
    """O nível de 0 a 9 de cada modo. O do tema (o Anime Music Quiz, senão as playlists) mede
    quanto a música é reconhecida; o do anime (o MyAnimeList), quanto o anime é visto. No
    "acertar o anime", o do tema pesa o dobro: é a taxa de acerto do próprio quiz."""
    song = next((theme.levels[k] for k in THEME_LEVELS if k in theme.levels), None)
    show = next((anime.levels[k] for k in ANIME_LEVELS if k in anime.levels), None)
    if song is None or show is None:
        one = song if song is not None else show
        return dict.fromkeys(MODES, one)
    # Inteiros com arredondamento para cima na metade: o mesmo resultado em qualquer sistema.
    return {"musica": (song + show + 1) // 2, "titulo": (2 * song + show + 1) // 3}


def tier_of(theme_type: str, level: int | None) -> str:
    """A faixa de um tema num modo (P252): no Fácil, quase só aberturas, e o encerramento só no
    topo; a insert song, só no Difícil."""
    if theme_type == "IN":
        return "dificil"
    if level is None:
        return _DEFAULT_TIER[theme_type]
    tier = "facil" if level >= EASY_LEVEL else "medio" if level >= MEDIUM_LEVEL else "dificil"
    if theme_type == "ED" and tier == "facil" and level < MAX_LEVEL:
        return "medio"
    return tier


def _popularity(levels: Iterable[int | None], theme_types: Iterable[str]) -> float:
    known = [lv for lv in levels if lv is not None]
    if known:
        value = Decimal(max(known)) / Decimal(MAX_LEVEL)
    else:
        # Sem nível, a mesma regra das faixas: a abertura é mais conhecida.
        value = Decimal(5 if "OP" in theme_types else 3) / Decimal(MAX_LEVEL)
    return float(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN))


# ---------------------------------------------------------------------------------------------
# O catálogo publicado.


def franchises_of(anime: Anime) -> tuple[tuple[str, str], ...]:
    """As franquias do anime (P234): as séries do AnimeThemes; sem série, o próprio anime."""
    return anime.series or ((anime.slug, anime.name),)


def franchise_id(slug: str) -> str:
    return FRANCHISE_PREFIX + slug


@dataclass
class _TrackAcc:
    track: RawTrack
    uses: list[tuple[Anime, Theme]] = field(default_factory=list)


def _track_record(provider: str, acc: _TrackAcc, album: JSON, cur: Curation) -> JSON:
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
    preview = _preview(t)
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
    fames = [(theme, fame(theme, anime)) for anime, theme in acc.uses]
    tiers = {
        mode: TIERS[min(TIERS.index(tier_of(theme.type, f[mode])) for theme, f in fames)]
        for mode in MODES
    }
    themes = sorted(
        {(anime.name, theme.type, theme.sequence or 0) for anime, theme in acc.uses},
        key=lambda x: (THEME_TYPES.index(x[1]), x[2], x[0]),
    )
    return {
        "id": track_id,
        "songKey": song_key(t.title, artist_ids[0]),
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
        "popularity": _popularity(
            (f[mode] for _, f in fames for mode in MODES), (theme.type for _, theme in acc.uses)
        ),
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
            "tiers": tiers,
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


def build_anime_catalog(
    provider: str, storefront: str, source: AnimeSource, cur: Curation, notes: list[str]
) -> JSON:
    """O catálogo do Anime a partir de todos os snapshots. Os avisos vão para `notes`."""
    if not source.snapshots:
        raise InputError("nenhum snapshot do Anime")
    accs: dict[str, _TrackAcc] = {}
    results: dict[str, int] = {}
    for anime in source.anime:
        for theme in anime.themes:
            results[theme.result] = results.get(theme.result, 0) + 1
            if theme.track is not None:
                acc = accs.setdefault(theme.track.provider_id, _TrackAcc(theme.track))
                acc.uses.append((anime, theme))
    if not accs:
        raise InputError("nenhum tema casou com uma faixa da Apple")
    stale = _stale_aliases(provider, (a.track for a in accs.values()), cur)
    if stale:
        raise InputError("aliases.toml do Anime cita IDs sem faixa:\n" + "\n".join(stale))
    artists: dict[str, JSON] = {}
    albums: dict[str, JSON] = {}
    tracks: list[JSON] = []
    for key in sorted(accs):
        t = accs[key].track
        for a in t.artists:
            artists[entity_id(provider, "ar", a.provider_id)] = artist_record(provider, a, cur)
        album = {k: v for k, v in album_record(provider, t, cur).items() if k != "similar"}
        albums[album["id"]] = album
        tracks.append(_track_record(provider, accs[key], album, cur))
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
