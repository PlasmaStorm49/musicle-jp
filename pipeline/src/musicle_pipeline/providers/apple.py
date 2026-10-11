"""Parada real do Japão (Apple), lida dos snapshots que o comando `fetch` grava.

Este módulo não usa a rede: lê `pipeline/data/apple/snapshots/AAAA-MM-DD.json` (um por dia, só
crescem) e traduz, campo a campo, a resposta aparada da Apple para o contrato neutro
(`RawTrack`). O mapeamento fica aqui, na leitura, de propósito (P72): um erro de mapeamento se
corrige no código e refaz o catálogo inteiro, sem regravar o histórico.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import (
    JSON,
    ChartEntry,
    ChartSnapshot,
    InputError,
    RawAlbum,
    RawArtist,
    RawTrack,
)
from musicle_pipeline.normalize import needs_romaji
from musicle_pipeline.paths import apple_snapshots_dir

NAME = "apple"
STOREFRONT = "jp"
CHART = "most-played/songs"
PREVIEW_SEC = 30  # previews da Apple têm 30 s; a duração exata só o navegador conhece
ARTWORK_PX = 300  # as capas aparecem com 56 e 96 px: 300 cobre telas de até 3x
# A data de lançamento vem em UTC com hora (ex.: 15:00Z = meia-noite no Japão); somar 9 h dá o
# dia do Japão antes de cortar.
JST = timedelta(hours=9)
_ARTWORK_SIZE = re.compile(r"/\d+x\d+bb\.(jpg|png|webp)$")
_DATE_FILE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")
# Separadores de parceria no nome do artista da faixa ("A & B", "A, B", "A × B", "A feat. B").
_COLLAB = re.compile(r" & |, | × | ＆ |、| feat\. | Feat\. ")
# Convidados no título: "777 (feat. Awich, ONE OK ROCK & Paledusk)". Sem "with": "(with love)"
# é letra de música mais vezes do que crédito.
_FEAT_IN_TITLE = re.compile(r"\((?:feat\.|ft\.) ([^)]+)\)", re.IGNORECASE)
_PARTNER_MIN = 2  # chave de 1 caractere ("A", "x") casaria por acaso
# Nome de coletânea no collectionArtistName. O campo também aparece em parceria (a faixa
# "ILLIT & HANA" vem com collectionArtistName "ILLIT"), então só ele não basta.
_VARIOUS = {"various artists", "ヴァリアス・アーティスト"}

# Hosts da Apple: fonte única para o fetch (antes de gravar) e o validate (no catálogo). As URLs
# vão parar em <img>, no áudio e num href.
HOSTS = {
    "preview": re.compile(r"^audio-ssl\.itunes\.apple\.com$"),
    "artwork": re.compile(r"^is[0-9]+-ssl\.mzstatic\.com$"),  # \d casaria "١" (árabe)
    "store": re.compile(r"^music\.apple\.com$"),
}


def is_apple_url(kind: str, url: str) -> bool:
    """https, só o host da lista (minúsculo, sem porta, usuário nem senha), sem espaço e com
    caminho. As mesmas regras do jq do robô e do core/apple.ts do web."""
    if any(c.isspace() for c in url) or "\\" in url:
        return False
    try:
        parts = urlsplit(url)
        host = parts.hostname or ""
    except ValueError:  # ex.: colchete de IPv6 malformado
        return False
    return (
        parts.scheme == "https"
        and parts.netloc == host  # o hostname vem em minúsculas e sem porta nem usuário
        and parts.path not in ("", "/")
        and HOSTS[kind].fullmatch(host) is not None
    )


def snapshot_days(directory: Path) -> list[str]:
    """Datas dos snapshots gravados, em ordem (só arquivos AAAA-MM-DD.json)."""
    if not directory.is_dir():
        return []
    return sorted(p.stem for p in directory.glob("*.json") if _DATE_FILE.match(p.name))


def album_type(collection_name: str, collection_artist: str | None) -> str:
    """Tipo do álbum pelo sufixo que a loja põe no nome (" - Single", " - EP")."""
    if collection_name.endswith(" - Single"):
        return "single"
    if collection_name.endswith(" - EP"):
        return "ep"
    if collection_artist and collection_artist.strip().casefold() in _VARIOUS:
        return "compilation"
    return "album"


def japan_date(iso: str) -> str:
    """AAAA-MM-DD no Japão a partir de um instante ISO em UTC."""
    instant = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (instant + JST).date().isoformat()


def artwork_at(url: str, px: int = ARTWORK_PX) -> str:
    """Troca o tamanho no nome do arquivo da capa (…/100x100bb.jpg → …/300x300bb.jpg)."""
    return _ARTWORK_SIZE.sub(rf"/{px}x{px}bb.\1", url)


def store_url(track_view_url: str) -> str:
    """Tira só o parâmetro de rastreio `uo`; o `i=` fica (sem ele, o link abre o álbum)."""
    parts = urlsplit(track_view_url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != "uo"]
    return urlunsplit(parts._replace(query=urlencode(query)))


def partner_key(name: str) -> str:
    """Chave estrita para achar um parceiro: só largura (NFKC), caixa e espaços.

    Não é a `search_key`: ela tira pontuação e aproxima o romaji, e "=LOVE" viraria "love",
    que casa com qualquer "Love". Aqui, um erro liga o artista errado à resposta.
    """
    return " ".join(unicodedata.normalize("NFKC", name).lower().split())


def credited_names(artist_name: str, track_name: str) -> list[str]:
    """Os nomes creditados na faixa, na ordem: os da grafia do artista e os convidados do título."""
    names = _COLLAB.split(artist_name)
    for match in _FEAT_IN_TITLE.finditer(track_name):
        names.extend(_COLLAB.split(match.group(1)))
    return [n.strip() for n in names if n.strip()]


def artist_names(
    lookups: JSON, official: JSON, known_latin: dict[str, str] | None = None
) -> dict[str, RawArtist]:
    """Nome exibido e latino de cada artista do snapshot.

    O lookup de ARTISTA devolve o nome romanizado ou em inglês ("Kenshi Yonezu"), mesmo com a
    loja do Japão; o nome nas FAIXAS vem em japonês ("米津玄師"), às vezes com parceiros
    ("A, B & C"). Então, o nome exibido é:
    1. o do lookup, se ele é o começo de alguma grafia das faixas (o nome limpo de uma parceria);
    2. senão, a grafia solo mais frequente das faixas (sem " & ", ", " ou " × ");
    3. senão (o artista só aparece em parcerias), o primeiro nome da parceria mais frequente.
    O latino é o nome do lookup, quando é todo em letras latinas (latinSource "provider");
    se o lookup do artista faltou neste snapshot, vale o último latino conhecido (`known_latin`,
    que é atualizado aqui), para um lookup incompleto não trocar "Kenshi Yonezu" pelo cutlet.
    Suposição (vale nas parcerias da 1ª parada real): o `artistId` da faixa é o do 1º nome.
    """
    seen: dict[str, Counter[str]] = {}
    for t in lookups.values():
        seen.setdefault(str(t["artistId"]), Counter())[t["artistName"]] += 1
    result: dict[str, RawArtist] = {}
    for artist_id, counts in seen.items():
        lookup_name = official.get(artist_id, {}).get("artistName")
        solo = Counter({n: c for n, c in counts.items() if not _COLLAB.search(n)})
        if lookup_name and any(n.startswith(lookup_name) for n in counts):
            name = lookup_name
        elif solo:
            name = min(solo, key=lambda n: (-solo[n], len(n), n))
        else:
            name = _COLLAB.split(min(counts, key=lambda n: (-counts[n], len(n), n)))[0]
        latin = lookup_name if lookup_name and lookup_name != name else None
        if latin is not None and needs_romaji(latin):
            latin = None  # o lookup trouxe outra grafia não latina: não serve de latino
        if known_latin is not None:
            if latin is None and lookup_name is None:
                latin = known_latin.get(artist_id)
            elif latin is not None:
                known_latin[artist_id] = latin
        result[artist_id] = RawArtist(provider_id=artist_id, name=name, name_latin=latin)
    return result


class AppleProvider:
    """Snapshots reais gravados pelo `fetch`. Sem rede: build e testes ficam determinísticos."""

    name = NAME
    storefront = STOREFRONT

    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory or apple_snapshots_dir()
        self.warnings: list[str] = []

    def snapshots(self) -> list[ChartSnapshot]:
        files = [self.directory / f"{day}.json" for day in snapshot_days(self.directory)]
        if not files:
            raise InputError(f"{self.directory}: nenhum snapshot (rode o comando fetch)")
        self.warnings = []
        latins: dict[str, str] = {}  # último latino oficial de cada artista
        # 1ª passada: os artistas de cada dia (o latino conhecido avança na ordem dos dias).
        days: list[tuple[JSON, dict[str, RawArtist]]] = []
        for path in files:
            data = read_json(path)
            self._check_header(data, path)
            days.append((data, artist_names(data["tracks"], data["artists"], latins)))
        # 2ª passada: as faixas, com os parceiros procurados entre TODOS os artistas. Numa
        # passada só, o resultado dependeria da ordem em que cada artista apareceu.
        partners = self._partners([a for _, artists in days for a in artists.values()])
        albums: dict[str, RawAlbum] = {}  # álbum fixo por faixa: vale o primeiro que apareceu
        return [self._snapshot(data, artists, albums, partners) for data, artists in days]

    @staticmethod
    def _check_header(data: JSON, path: Path) -> None:
        if data.get("provider") != NAME or data.get("storefront") != STOREFRONT:
            raise InputError(f"{path}: provider/storefront deveriam ser {NAME}/{STOREFRONT}")
        if f"{data.get('date')}.json" != path.name:
            raise InputError(f"{path}: date {data.get('date')!r} não bate com o nome do arquivo")

    @staticmethod
    def _partners(seen: list[RawArtist]) -> dict[str, RawArtist | None]:
        """Chave estrita do nome → artista; None quando a chave é de mais de um artista.

        Os parceiros de uma faixa só ganham id se são artistas de alguma faixa: o lookup traz
        um artistId por faixa, o do 1º nome. Cada id vale pelo registro mais novo (`seen` está
        na ordem dos dias), o mesmo que fica no catálogo.
        """
        latest = {a.provider_id: a for a in seen}
        owners: dict[str, set[str]] = {}
        for a in latest.values():
            for name in (a.name, a.name_latin):
                key = partner_key(name) if name else ""
                if len(key) >= _PARTNER_MIN:
                    owners.setdefault(key, set()).add(a.provider_id)
        return {
            key: latest[next(iter(ids))] if len(ids) == 1 else None for key, ids in owners.items()
        }

    def _snapshot(
        self,
        data: JSON,
        artists: dict[str, RawArtist],
        albums: dict[str, RawAlbum],
        partners: dict[str, RawArtist | None],
    ) -> ChartSnapshot:
        day: str = data["date"]
        lookups: JSON = data["tracks"]
        tracks: list[RawTrack] = []
        placed: set[str] = set()
        for item in data["rss"]:
            track_id = str(item["id"])
            found = lookups.get(track_id)
            if found is None or not found.get("trackTimeMillis"):
                continue  # sem lookup não há álbum nem duração: a faixa fica fora deste dia
            if track_id in placed:
                # Faixa repetida travaria o build para sempre (snapshot não se edita): fica a 1ª.
                self.warnings.append(f"{day}: faixa {track_id} repetida na parada; ficou a 1ª")
                continue
            placed.add(track_id)
            tracks.append(self._track(found, artists, albums, partners, day))
        # Posições recompactadas (1..n): a faixa sem lookup some e as de baixo sobem.
        entries = tuple(ChartEntry(rank=i, track=t) for i, t in enumerate(tracks, start=1))
        return ChartSnapshot(
            id=day,
            date=day,
            fetched_at=data["fetchedAt"],
            chart=data.get("chart", CHART),
            size=len(entries),
            entries=entries,
        )

    @staticmethod
    def _release_date(iso: str, track_id: str, day: str) -> str:
        try:
            return japan_date(iso)
        except ValueError as exc:
            # O fetch já recusa data impossível; um snapshot antigo ainda poderia ter uma.
            raise InputError(f"{day}: faixa {track_id}: releaseDate inválida ({iso!r})") from exc

    def _track(
        self,
        t: JSON,
        artists: dict[str, RawArtist],
        albums: dict[str, RawAlbum],
        partners: dict[str, RawArtist | None],
        day: str,
    ) -> RawTrack:
        track_id = str(t["trackId"])
        artist = artists[str(t["artistId"])]
        # O artista do lookup vem em 1º (o songKey usa o 1º id); depois, os parceiros conhecidos,
        # na ordem do crédito. Sem eles, o distrator poderia ter o mesmo artista da resposta
        # (JANE DOE, de 米津玄師 & 宇多田ヒカル, contra First Love), e a busca pelo
        # parceiro falharia.
        credited = [artist]
        own = {partner_key(n) for n in (artist.name, artist.name_latin) if n}
        for name in credited_names(t["artistName"], t["trackName"]):
            key = partner_key(name)
            if key in own or key not in partners:
                continue  # o próprio artista (mesmo com nome repetido) ou nome sem faixa
            partner = partners[key]
            if partner is None:
                warning = f"parceiro {name!r} é nome de mais de um artista: ficou sem ligação"
                if warning not in self.warnings:
                    self.warnings.append(warning)
            elif partner.provider_id not in {a.provider_id for a in credited}:
                credited.append(partner)
        album = RawAlbum(
            provider_id=str(t["collectionId"]),
            title=t["collectionName"],
            type=album_type(t["collectionName"], t.get("collectionArtistName")),
            release_date=self._release_date(t["releaseDate"], track_id, day),
            artwork_url=artwork_at(t["artworkUrl100"]) if t.get("artworkUrl100") else None,
        )
        first = albums.setdefault(track_id, album)
        if first.provider_id != album.provider_id:
            # Trocar de álbum deixaria o álbum antigo sem faixa e quebraria dias já jogados.
            self.warnings.append(
                f"{day}: faixa {track_id} mudou de álbum ({first.provider_id} → "
                f"{album.provider_id}); mantido o primeiro"
            )
            album = first
        preview = t.get("previewUrl")
        return RawTrack(
            provider_id=track_id,
            title=t["trackName"],
            artists=tuple(credited),
            album=album,
            duration_ms=int(t["trackTimeMillis"]),
            explicit=t.get("trackExplicitness") == "explicit",
            preview_url=preview,
            preview_duration_sec=PREVIEW_SEC if preview else None,
            store_url=store_url(t["trackViewUrl"]) if t.get("trackViewUrl") else None,
            # Com parceiro, vale a grafia da loja: o parceiro só do título ("YAO", com "(feat.
            # ONE OK ROCK)") não vira "YAO & ONE OK ROCK", um crédito que a loja não mostra.
            artist_display=(
                t["artistName"] if len(credited) > 1 or t["artistName"] != artist.name else None
            ),
        )
