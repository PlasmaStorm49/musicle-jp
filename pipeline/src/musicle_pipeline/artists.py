"""Modo por artista (M13): as músicas de cada artista da lista, para rodadas sem fim do Desafio.

Puro e determinístico, como o catálogo: lê os snapshots dos artistas (o `fetch --artists` grava)
pelo provedor, sem rede e sem a biblioteca de romaji, e refaz tudo do zero a cada build. Cada
artista vira um arquivo publicado com uma faixa por música (a canônica), e o índice lista os
artistas na ordem do artists.toml.

A limpeza dos títulos daqui (karaokê, inglês, crédito "(… from …)") vale só para este modo: o
normalize.py é o da parada, e mudá-lo mexeria nas respostas dos dias já jogados.
"""

from __future__ import annotations

import re
import tomllib
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal
from pathlib import Path
from typing import Literal, Protocol

from musicle_pipeline.aliases import KINDS
from musicle_pipeline.catalog import (
    Curation,
    album_record,
    artist_display_of,
    artist_record,
    eligibility,
    entity_id,
)
from musicle_pipeline.models import JSON, ArtistEntry, ArtistSnapshot, InputError, RawTrack
from musicle_pipeline.normalize import (
    TAILS,
    search_keys,
    strip_version_suffix,
    title_key,
)
from musicle_pipeline.romaji_cache import track_text

SCHEMA_VERSION = 1
MAX_SONGS = 200  # o teto que o usuário aceitou no pedido do modo; a ordem decide quem fica (P133)
INDEX = "index.json"

# Versões que nunca são a música do sorteio (P124 e a especificação: sem instrumental etc.): a
# música que só existe assim sai da lista. Casam em qualquer parte do sufixo ("[2007 Mix /
# Karaoke]").
_OUT = re.compile(
    r"karaoke|カラオケ|instrumental|\binst\b|off[\s-]*vocal|オフ・?ボーカル"
    r"|tv\s*-?\s*(?:size|サイズ|ver|edit)|remix|リミックス|ライブ|ライヴ"
    r"|acoustic|アコースティック|english\s*(?:ver|version)|the\s+first\s+take"
    # Ao vivo: o sufixo inteiro "Live", ou começando por ele ("Live at Budokan", "Live ver."),
    # ou terminando nele ("2019 Live"). "(Live Forever)" é parte do nome.
    r"|^live$|^live\s+(?:at|in|from|ver|version)\b|\blive\s+ver(?:sion)?\b|\s+live$"
    # O show no meio do sufixo: '("Walpurgisnacht" Live at …)', "-2015武道館 Live Chocolate Ver.-".
    r"|\blive\s+(?:at|in|from)\b|\blive\b.*\bver(?:sion)?\b|武道館|budokan|\btour\b"
    # Arranjos que não são a música do sorteio (vistos nos 6 artistas reais em 12/10/2026).
    r"|a\s*cappella|\bslowed\b|\bsped\s*up\b|\bstripped\b|\bshort\s+(?:size|ver)|\bmix\b"
    r"|re-?echoed|restarred",
    re.IGNORECASE,
)
# Versões aceitáveis que o normalize.py da parada não conhece nesses formatos ("-MOVIE ver.-",
# "(Yui.Ver)", "(Remaster for … 2022)", "(… edit)", "-prologue-", "(カバー)", "[Classic]").
_SECONDARY = re.compile(
    r"\bver(?:sion)?\.?$|\bver\.|\bedit\b|remaster|\bprologue\b|\bepilogue\b|\bcover\b|カバー"
    r"|^classic$",
    re.IGNORECASE,
)
# "Bubble feat.Uta": o feat. sem espaço, que o normalize.py da parada não tira.
_TIGHT_FEAT = re.compile(r"\s+(?:feat|ft)\.(?=\S).+$", re.IGNORECASE)
# Crédito do intérprete, do parceiro ou da origem no título: "新時代 (ウタ from ONE PIECE FILM
# RED)", "ninelie [with chelly]" e "アイドル (From 'X')" são a mesma música sem o crédito.
_CREDIT = re.compile(r"(?:.+\s)?from\s.+|with\s.+", re.IGNORECASE)
# Os delimitadores da parada e um que só aparece aqui: o "-X-" colado das versões da LiSA
# ("ADAMAS -LANDER Live ver.-").
_ARTIST_TAILS = (
    *TAILS,
    re.compile(r"\s+-(\S.*?)-\s*$"),
    # O hífen sem o de fechamento, só quando o sufixo é uma versão ("-short size ver.",
    # "-ANIME edit").
    re.compile(r"\s+-(\S[^-]*\b(?:ver(?:sion)?\.?|edit))\s*$", re.IGNORECASE),
    # O "-X-" grudado no nome, sem o espaço antes ("Empty MERMAiD-Instrumental-", da LiSA), de
    # uma palavra só: com espaço, o "-NiNE Live ver.-" de "ADAMAS -ONLiNE LEO-NiNE Live ver.-"
    # partiria o sufixo inteiro. Só um sufixo conhecido muda a chave ("ROCK-mode" fica igual).
    re.compile(r"(?<=\S)-([^\s-]+)-\s*$"),
)
# Versão que não entra, no fim do título e sem delimitador: "六等星の夜 Tvsize" (Aimer). A
# música que só tem essa versão sai da lista, como as outras de "out".
_UNDELIMITED_OUT = re.compile(
    r"\s(?:tv\s*-?\s*(?:size|サイズ)|instrumental|karaoke|off\s*vocal)$", re.IGNORECASE
)
# Álbum ao vivo (o título da faixa às vezes não diz) e em inglês (P135, P124). Só com marcador
# de show: "Live to Survive - Single" (Aimer) é um single de estúdio. O que escapar vai para o
# exclude_albums.
_LIVE_ALBUM = re.compile(
    r"\blive\s+(?:at|in|from|is|tour)\b|[(\[]live\b|\blive\s*[)\]]|\blive\s*(?:\d{4}|$)"
    r"|ライブ|ライヴ|\btour\b|ツアー"
    r"|武道館|budokan|the\s+first\s+take",
    re.IGNORECASE,
)
# Faixa que não é música: a abertura, o fecho e as vinhetas de um álbum ("Prologue",
# 'Interlude "Awakening"', do YOASOBI). Só o título inteiro: "… -prologue-" é a música.
_NOT_A_SONG = re.compile(r"^(?:prologue|epilogue|intro|outro|interlude)\b", re.IGNORECASE)
_ENGLISH_ALBUM = re.compile(r"english\s*(?:ver|version)", re.IGNORECASE)
_BEST_ALBUM = re.compile(r"\bbest\b|ベスト|greatest\s+hits", re.IGNORECASE)
_ARTIST_ID = re.compile(r"[A-Za-z0-9_-]+")


class ArtistProvider(Protocol):
    name: str
    storefront: str
    warnings: list[str]

    def snapshot(self, artist_id: str) -> ArtistSnapshot: ...


@dataclass(frozen=True)
class ArtistRules:
    """Um artista do artists.toml: o id no provedor e as correções de curadoria (P136)."""

    id: str
    exclude_albums: frozenset[str] = frozenset()  # collectionId (ex.: os E-SIDE do YOASOBI)
    exclude_tracks: frozenset[str] = frozenset()  # trackId
    # Pares de trackId da mesma música com títulos que a chave não junta (o título em romaji):
    # o 2º entra no grupo do 1º (P134).
    same_song: tuple[tuple[str, str], ...] = ()
    # trackId de uma faixa de cada música lançada como single (lado A, P172): entre as sem posição
    # no lookup de músicas, elas vêm antes das outras (o lookup só ordena 200 faixas).
    singles: frozenset[str] = frozenset()


_RULE_KEYS = {"id", "exclude_albums", "exclude_tracks", "same_song", "singles"}


def _ids(value: object, where: str) -> frozenset[str]:
    if not isinstance(value, list) or not all(isinstance(v, str) and v for v in value):
        raise InputError(f"{where}: deveria ser uma lista de ids (texto)")
    return frozenset(value)


def load_artist_list(path: Path) -> list[ArtistRules]:
    """A lista curada, na ordem do arquivo (é a ordem da tela)."""
    if not path.exists():
        raise InputError(f"{path}: lista de artistas ausente")
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise InputError(f"{path}: TOML inválido: {exc}") from None
    if set(data) != {"artists"} or not isinstance(data["artists"], list) or not data["artists"]:
        raise InputError(f"{path}: esperado só [[artists]], com ao menos um artista")
    rules: list[ArtistRules] = []
    for i, item in enumerate(data["artists"], start=1):
        where = f"{path}: artista nº {i}"
        if not isinstance(item, dict) or not set(item) <= _RULE_KEYS:
            raise InputError(f"{where}: chaves aceitas: {sorted(_RULE_KEYS)}")
        artist_id = item.get("id")
        if not isinstance(artist_id, str) or not _ARTIST_ID.fullmatch(artist_id):
            raise InputError(f"{where}: id do provedor ausente ou inválido")
        pairs = item.get("same_song", [])
        if not isinstance(pairs, list) or not all(
            isinstance(p, list) and len(p) == 2 and all(isinstance(x, str) and x for x in p)
            for p in pairs
        ):
            raise InputError(f"{where}: same_song deveria ser uma lista de pares de trackId")
        rules.append(
            ArtistRules(
                id=artist_id,
                exclude_albums=_ids(item.get("exclude_albums", []), f"{where} exclude_albums"),
                exclude_tracks=_ids(item.get("exclude_tracks", []), f"{where} exclude_tracks"),
                same_song=tuple((a, b) for a, b in pairs),
                singles=_ids(item.get("singles", []), f"{where} singles"),
            )
        )
    ids = [r.id for r in rules]
    if len(set(ids)) != len(ids):
        raise InputError(f"{path}: artista repetido")
    return rules


def _last_tail(text: str) -> tuple[str, str] | None:
    """O sufixo delimitado mais à direita: (o que vem antes, o conteúdo dele)."""
    tails = [m for r in _ARTIST_TAILS if (m := r.search(text))]
    last = max(tails, key=lambda m: m.start(), default=None)
    if last is None:
        return None
    return text[: last.start()].strip(), last.group(1).strip()


def artist_title_key(title: str) -> str:
    """A chave da música dentro do artista: o title_key da parada, depois de tirar, em laço, os
    sufixos que só valem aqui (karaokê, inglês, THE FIRST TAKE, crédito "(… from …)")."""
    s = _TIGHT_FEAT.sub("", unicodedata.normalize("NFKC", title).strip())
    while True:
        # As versões da parada (remaster, feat., TV size) saem antes: o crédito pode vir antes
        # delas ("新時代 (ウタ from …) [2023 Remaster]").
        s = strip_version_suffix(s)
        cut = _last_tail(s)
        known = cut is not None and (
            _OUT.search(cut[1]) or _CREDIT.fullmatch(cut[1]) or _SECONDARY.search(cut[1])
        )
        if cut is None or not cut[0] or not known:
            return title_key(s)
        s = cut[0]


def version_kind(track: RawTrack) -> Literal["out", "secondary"] | None:
    """ "out": nunca é a música do sorteio (karaokê, instrumental, ao vivo, inglês...);
    "secondary": outra versão aceitável (remaster, feat., crédito); None: a original."""
    album = unicodedata.normalize("NFKC", track.album.title)
    if _LIVE_ALBUM.search(album) or _ENGLISH_ALBUM.search(album):
        return "out"
    nfkc = unicodedata.normalize("NFKC", track.title).strip()
    if _NOT_A_SONG.match(nfkc) or _UNDELIMITED_OUT.search(nfkc):
        return "out"
    credit = False
    s = nfkc
    while (cut := _last_tail(s)) is not None and cut[0]:
        rest, inner = cut
        if _OUT.search(inner):
            return "out"
        credit = (
            credit or _CREDIT.fullmatch(inner) is not None or _SECONDARY.search(inner) is not None
        )
        s = rest
    changed = (
        strip_version_suffix(nfkc) != nfkc
        or _TIGHT_FEAT.search(nfkc) is not None
        or _UNDELIMITED_VER.search(nfkc) is not None
    )
    return "secondary" if credit or changed else None


@dataclass(frozen=True)
class Song:
    key: str  # artist_title_key do grupo
    canonical: RawTrack  # a faixa que vai para o arquivo
    members: tuple[RawTrack, ...]  # todas as versões conhecidas (títulos para a exclusão)
    rank: int | None  # a melhor posição no lookup de músicas


def _preview(t: RawTrack) -> JSON | None:
    if t.preview_url is None:
        return None
    return {"url": t.preview_url, "durationSec": t.preview_duration_sec, "startSec": 0}


def _canonical_order(t: RawTrack) -> tuple[bool, bool, str, str]:
    """P132: a versão original, de álbum que não é coletânea, a mais antiga, o menor id."""
    compilation = t.album.type == "compilation" or _BEST_ALBUM.search(t.album.title) is not None
    return (version_kind(t) == "secondary", compilation, t.album.release_date, t.provider_id)


def _stale_rules(snap: ArtistSnapshot, rules: ArtistRules) -> list[str]:
    tracks = {e.track.provider_id for e in snap.entries}
    albums = {e.track.album.provider_id for e in snap.entries}
    paired = {x for pair in rules.same_song for x in pair}
    return [
        *(f"exclude_albums: {a}" for a in sorted(rules.exclude_albums - albums)),
        *(f"exclude_tracks: {t}" for t in sorted(rules.exclude_tracks - tracks)),
        *(f"same_song: {t}" for t in sorted(paired - tracks)),
        *(f"singles: {t}" for t in sorted(rules.singles - tracks)),
    ]


# "… ver." no fim, sem delimitador: a Aimer escreve "今日から思い出 Evergreen ver.".
_UNDELIMITED_VER = re.compile(r"\s\S.*\bver(?:sion)?\.?$", re.IGNORECASE)


def _join_undelimited_versions(entries: Sequence[ArtistEntry], key_of: dict[str, str]) -> None:
    """O título que termina em "ver." sem delimitador é versão da música do prefixo mais longo
    (cortado num espaço) que existe no artista: a chave dele passa a ser a dela."""
    keys = set(key_of.values())
    for e in entries:
        title = unicodedata.normalize("NFKC", e.track.title).strip()
        if not _UNDELIMITED_VER.search(title):
            continue
        words = title.split(" ")
        for cut in range(len(words) - 1, 0, -1):
            prefix = artist_title_key(" ".join(words[:cut]))
            if prefix != key_of[e.track.provider_id] and prefix in keys:
                key_of[e.track.provider_id] = prefix
                break


def _inherited_ranks(
    snap: ArtistSnapshot, rules: ArtistRules, groups: Mapping[str, object]
) -> dict[str, list[int]]:
    """As posições no lookup das faixas do exclude_tracks, para a música delas (P172).

    A curadoria tira a versão (a da coletânea com o nome dela no título), não o sucesso: sem
    isso, ガラスの林檎 perdia a posição 42 do Seiko Matsuda. A música é a do título sem o sufixo
    que a chave não tira ("(SEIKO STORY〜80's HITS COLLECTION〜)"), como no aviso de "pode ser
    versão de outra música", e só sem ela a da chave da própria faixa: outra edição da coletânea
    tem a mesma faixa, com o mesmo sufixo, e a posição iria para essa cópia, uma música repetida.
    """
    out: dict[str, list[int]] = {}
    for e in snap.entries:
        if e.rank is None or e.track.provider_id not in rules.exclude_tracks:
            continue
        cut = _last_tail(unicodedata.normalize("NFKC", e.track.title))
        base = artist_title_key(cut[0]) if cut and cut[0] else None
        for key in (base, artist_title_key(e.track.title)):
            if key in groups:
                out.setdefault(key, []).append(e.rank)
                break
    return out


def select_songs(
    snap: ArtistSnapshot,
    rules: ArtistRules,
    blocked: Callable[[str], bool],
    notes: list[str],
) -> list[Song]:
    """As músicas do artista, na ordem de prioridade (P133), até MAX_SONGS.

    `blocked(trackId)` diz se a curadoria tirou a faixa do sorteio (block no aliases.toml). Os
    descartes e o corte vão para `notes`, para a revisão do PR.
    """
    where = f"artista {rules.id}"
    stale = _stale_rules(snap, rules)
    if stale:
        raise InputError(f"{where}: artists.toml cita ids que o snapshot não tem: {stale}")
    kept = [
        e
        for e in snap.entries
        if e.track.album.provider_id not in rules.exclude_albums
        and e.track.provider_id not in rules.exclude_tracks
    ]
    if len(kept) != len(snap.entries):
        notes.append(f"{where}: {len(snap.entries) - len(kept)} faixa(s) tirada(s) pela curadoria")

    key_of = {e.track.provider_id: artist_title_key(e.track.title) for e in kept}
    for first, second in rules.same_song:
        if first in key_of and second in key_of:
            old, new = key_of[second], key_of[first]
            key_of = {tid: new if key == old else key for tid, key in key_of.items()}
    _join_undelimited_versions(kept, key_of)
    groups: dict[str, list[tuple[int | None, RawTrack]]] = {}
    for e in kept:
        groups.setdefault(key_of[e.track.provider_id], []).append((e.rank, e.track))
    inherited = _inherited_ranks(snap, rules, groups)

    songs: list[Song] = []
    for key in sorted(groups):
        members = tuple(sorted((t for _, t in groups[key]), key=lambda t: t.provider_id))
        good = [t for t in members if version_kind(t) != "out"]
        if not good:
            notes.append(f"{where}: só em versão que não entra: {members[0].title!r}")
            continue
        playable = [
            t
            for t in good
            if eligibility(_preview(t), t.album.artwork_url, blocked(t.provider_id))["daily"]
        ]
        if not playable:
            notes.append(f"{where}: sem prévia tocável: {good[0].title!r}")
            continue
        ranks = [r for r, _ in groups[key] if r is not None] + inherited.get(key, [])
        canonical = min(playable, key=_canonical_order)
        songs.append(Song(key, canonical, members, min(ranks) if ranks else None))

    # P133: (1) a posição no lookup de músicas; (2) o single (lado A) da curadoria, P172: o lookup
    # só ordena 200 faixas, e no resto o sucesso não se distingue pelos álbuns nem pela data; (3)
    # quantos álbuns têm a música (o sucesso volta nas coletâneas e nos ao vivo); (4) a mais
    # antiga; (5) a chave.
    songs.sort(
        key=lambda s: (
            s.rank is None,
            s.rank or 0,
            not any(t.provider_id in rules.singles for t in s.members),
            -len({t.album.provider_id for t in s.members}),
            min(t.album.release_date for t in s.members),
            s.key,
        )
    )
    keys = {s.key for s in songs}
    for s in songs:
        # "灯台 (Demo)": o sufixo não é de versão conhecida, e a música fica à parte; se o título
        # sem ele é outra música do artista, avisa (a correção é same_song ou exclude_tracks).
        cut = _last_tail(unicodedata.normalize("NFKC", s.canonical.title))
        if cut and cut[0] and (other := artist_title_key(cut[0])) != s.key and other in keys:
            notes.append(
                f"{where}: {s.canonical.title!r} pode ser versão de outra música do artista "
                "(junte com same_song ou tire com exclude_tracks)"
            )
    if len(songs) > MAX_SONGS:
        cut = songs[MAX_SONGS:]
        notes.append(
            f"{where}: {len(cut)} música(s) além das {MAX_SONGS} ficaram de fora "
            f"(a 1ª: {cut[0].canonical.title!r})"
        )
        songs = songs[:MAX_SONGS]
    return songs


def _position_score(position: int, total: int) -> float:
    """1 para a primeira música, 1/N para a última, em Decimal (igual no Windows e no Linux)."""
    value = Decimal(total - position) / Decimal(total)
    return float(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN))


def _track_record(
    provider: str, artist_id: str, song: Song, score: float, album: JSON, cur: Curation
) -> JSON:
    t = song.canonical
    track_id = entity_id(provider, "tr", t.provider_id)
    text = track_text(t.title)
    latin, source = cur.latin("tracks", track_id, text, t.title_latin)
    preview = _preview(t)
    artist_ids = [entity_id(provider, "ar", a.provider_id) for a in t.artists]
    return {
        "id": track_id,
        "songKey": f"{song.key}|{artist_id}",
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
        "popularity": score,
        "eligible": eligibility(
            preview, album["artworkUrl"], blocked=cur.aliases.get("tracks", track_id).block
        ),
        "search": {
            "title": search_keys(cur.search_texts("tracks", track_id, text, t.title_latin)),
            "artist": [],
        },
        # A chave do grupo também: um cover na parada com o título sem o crédito ("新時代", de
        # outro artista) casa com "新時代 (ウタ from …)" por ela (P141).
        "titleKeys": sorted({song.key, *(title_key(m.title) for m in song.members)}),
    }


def build_artist_file(
    provider: str, storefront: str, snap: ArtistSnapshot, songs: Sequence[Song], cur: Curation
) -> JSON:
    artist_id = entity_id(provider, "ar", snap.artist.provider_id)
    artists: dict[str, JSON] = {}
    albums: dict[str, JSON] = {}
    tracks: list[JSON] = []
    # Da última para a primeira música: se duas discordam sobre um álbum ou artista, vale a de
    # melhor posição (processada por último), como no catálogo.
    for position in reversed(range(len(songs))):
        song = songs[position]
        t = song.canonical
        for a in t.artists:
            artists[entity_id(provider, "ar", a.provider_id)] = artist_record(provider, a, cur)
        album = {k: v for k, v in album_record(provider, t, cur).items() if k != "similar"}
        albums[album["id"]] = album
        tracks.append(
            _track_record(
                provider, artist_id, song, _position_score(position, len(songs)), album, cur
            )
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "provider": provider,
        "storefront": storefront,
        "artistId": artist_id,
        "fetchedAt": snap.fetched_at,
        "artists": [artists[k] for k in sorted(artists)],
        "albums": [albums[k] for k in sorted(albums)],
        "tracks": sorted(tracks, key=lambda r: r["id"]),
    }


def file_name(rules: ArtistRules) -> str:
    return f"{rules.id}.json"


def card_artwork(data: JSON) -> str | None:
    """A capa do cartão da lista (P168): a do álbum da música mais popular, de preferência um
    álbum só do artista (a capa de uma parceria, como o 打上花火 do DAOKO×米津玄師, seria a de
    outro artista). Sem nenhum álbum só dele, a do álbum da mais popular; sem capa nenhuma, None,
    e a tela mostra o monograma (P171)."""
    albums = {a["id"]: a for a in data["albums"]}
    ranked = sorted(data["tracks"], key=lambda t: (-t["popularity"], t["id"]))
    covered = [albums[t["albumId"]] for t in ranked if albums[t["albumId"]]["artworkUrl"]]
    solo = [a for a in covered if a["artistIds"] == [data["artistId"]]]
    chosen = (solo or covered)[:1]
    return chosen[0]["artworkUrl"] if chosen else None


def build_artist_list(provider: str, storefront: str, files: Sequence[tuple[str, JSON]]) -> JSON:
    """O índice, na ordem recebida (a do artists.toml)."""
    entries = []
    for name, data in files:
        me = next((a for a in data["artists"] if a["id"] == data["artistId"]), None)
        if me is None:
            raise InputError(f"{name}: nenhuma música publicada credita o artista do arquivo")
        entries.append(
            {
                "id": data["artistId"],
                "name": me["name"],
                "nameLatin": me["nameLatin"],
                "file": name,
                "songs": len(data["tracks"]),
                "artworkUrl": card_artwork(data),
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "provider": provider,
        "storefront": storefront,
        "artists": entries,
    }


def _duplicate_notes(data: JSON) -> list[str]:
    """Títulos diferentes com uma chave de busca em comum: talvez a mesma música (um em romaji,
    outro em japonês). A junção é manual (same_song), porque o romaji erra nome próprio."""
    owners: dict[str, list[str]] = {}
    for t in data["tracks"]:
        for key in t["search"]["title"]:
            owners.setdefault(key, []).append(t["title"])
    return [
        f"{data['artistId']}: possível música repetida ({' / '.join(sorted(titles))}): "
        "junte com same_song no artists.toml, se for"
        for key, titles in sorted(owners.items())
        if len(titles) > 1
    ]


def artist_snapshots(
    provider: ArtistProvider, rules: Sequence[ArtistRules]
) -> list[tuple[ArtistRules, ArtistSnapshot]]:
    return [(r, provider.snapshot(r.id)) for r in rules]


def selections(
    provider_name: str,
    snapshots: Sequence[tuple[ArtistRules, ArtistSnapshot]],
    cur: Curation,
    notes: list[str],
) -> list[tuple[ArtistRules, ArtistSnapshot, list[Song]]]:
    def blocked(track_id: str) -> bool:
        return cur.aliases.get("tracks", entity_id(provider_name, "tr", track_id)).block

    return [(r, snap, select_songs(snap, r, blocked, notes)) for r, snap in snapshots]


def _stale_aliases(
    provider_name: str, snapshots: Sequence[tuple[ArtistRules, ArtistSnapshot]], cur: Curation
) -> list[str]:
    """Ids do aliases.toml que nenhum snapshot tem (o mesmo cuidado do catálogo da parada):
    vale contra todas as faixas conhecidas, não só as que ficaram, porque o block tira uma."""
    known: dict[str, set[str]] = {kind: set() for kind in KINDS}
    for _, snap in snapshots:
        for e in snap.entries:
            t = e.track
            known["tracks"].add(entity_id(provider_name, "tr", t.provider_id))
            known["albums"].add(entity_id(provider_name, "al", t.album.provider_id))
            known["artists"].update(
                entity_id(provider_name, "ar", a.provider_id) for a in t.artists
            )
    return [f"{k}: {eid}" for k in KINDS for eid in sorted(cur.aliases.ids(k) - known[k])]


def build_artists(
    provider: ArtistProvider,
    rules: Sequence[ArtistRules],
    cur: Curation,
    notes: list[str],
) -> dict[str, JSON]:
    """Todos os arquivos publicados (o índice e um por artista), pelo nome. É sempre o conjunto
    inteiro: a conferência dos aliases velhos olha todos os artistas juntos."""
    snapshots = artist_snapshots(provider, rules)
    stale = _stale_aliases(provider.name, snapshots, cur)
    if stale:
        raise InputError("aliases.toml cita IDs que nenhum artista tem:\n" + "\n".join(stale))
    files: list[tuple[str, JSON]] = []
    for r, snap, songs in selections(provider.name, snapshots, cur, notes):
        if not songs:
            raise InputError(f"artista {r.id}: nenhuma música tocável")
        data = build_artist_file(provider.name, provider.storefront, snap, songs, cur)
        notes.extend(_duplicate_notes(data))
        files.append((file_name(r), data))
    index = build_artist_list(provider.name, provider.storefront, files)
    return {INDEX: index, **dict(files)}
