"""O especial dos artistas parecidos do quiz do dia (M18, S62; o usuário, 22/11/2026): os grupos
curados (Nana Mizuki e May'n; Yukari Tamura e Yui Ogura) e as músicas de cada artista.

- **Os grupos** ficam no `quiz_artists.toml` da pasta do Anime do provedor, escrito à mão: o `id`
  do grupo e os ids do modo por artista (`artists.toml`, qualquer seção; os que só servem ao quiz
  ficam na `section = "quiz"`, fora da lista da tela).
- **As músicas de um artista** saem de dois lugares (P385: o acervo do Anime não basta): primeiro o
  catálogo do Anime, depois o arquivo publicado do modo por artista (`artists/<id>.json`), por
  popularidade, até POOL_MAX. A música creditada a outro artista do grupo (um dueto) fica fora dos
  dois lados. As cantadas como personagem contam (o usuário, 22/11/2026): no Anime, pelo crédito
  "(CV:<nome>)"; no arquivo do artista, pelas `extra_tracks` da curadoria.
- **O piso** (o usuário, 22/11/2026): o grupo só entra com FLOOR músicas de cada artista (no acervo
  curto das fixtures, FLOOR_SHORT). A run acaba no total do lado menor (o artista da pergunta ou a
  soma do resto do grupo), até 30 (P451).

Só lê arquivos: sem rede e sem relógio. A ordem de tudo é fixa (o id), para a geração e a
conferência darem o mesmo resultado em qualquer máquina.
"""

from __future__ import annotations

import re
import tomllib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from musicle_pipeline.io_json import read_json
from musicle_pipeline.models import JSON, InputError

FLOOR = 15
FLOOR_SHORT = 3
# As músicas de um artista que o quiz usa: as do Anime todas e, do arquivo do artista, as mais
# populares até completar este número. Sem o teto, a Nana Mizuki (200 músicas no arquivo) teria a
# maior parte das rodadas com faixas de álbum que pouca gente conhece.
POOL_MAX = 40
_GROUP_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_ARTIST_ID = re.compile(r"[A-Za-z0-9_-]+")


@dataclass(frozen=True)
class ArtistSong:
    id: str  # a faixa: a do Anime, se a música está lá; senão, a do arquivo do artista
    key: str  # a songKey


@dataclass(frozen=True)
class ArtistSide:
    id: str  # o artista, com o provedor ("apple:ar:308629932")
    name: str  # o nome da pergunta: o latino, se houver; senão, o da loja
    songs: tuple[ArtistSong, ...]  # na ordem do pool: as do Anime, depois as do arquivo
    # Todas as faixas do artista que um dia gravado pode citar (sem o teto e sem a elegibilidade):
    # a conferência dos dias de antes, que o pool de hoje pode não ter mais (uma música nova no
    # Anime empurra a 40ª para fora).
    known: tuple[ArtistSong, ...] = ()


@dataclass(frozen=True)
class ArtistGroup:
    id: str
    sides: tuple[ArtistSide, ...]

    def side(self, artist_id: str) -> ArtistSide | None:
        return next((s for s in self.sides if s.id == artist_id), None)


def load_group_rules(path: Path) -> list[tuple[str, list[str]]]:
    """O quiz_artists.toml: [[groups]] com o id e os artistas (ids do provedor, sem prefixo)."""
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise InputError(f"{path}: TOML inválido: {exc}") from None
    if set(data) != {"groups"} or not isinstance(data["groups"], list) or not data["groups"]:
        raise InputError(f"{path}: esperado só [[groups]], com ao menos um grupo")
    rules: list[tuple[str, list[str]]] = []
    for i, item in enumerate(data["groups"], start=1):
        where = f"{path}: grupo nº {i}"
        if not isinstance(item, dict) or set(item) != {"id", "artists"}:
            raise InputError(f"{where}: as chaves são id e artists")
        group_id, artists = item["id"], item["artists"]
        if not isinstance(group_id, str) or not _GROUP_ID.fullmatch(group_id):
            raise InputError(f"{where}: id deveria ser minúsculas, números e hífen")
        if (
            not isinstance(artists, list)
            or len(artists) < 2
            or not all(isinstance(a, str) and _ARTIST_ID.fullmatch(a) for a in artists)
            or len(set(artists)) != len(artists)
        ):
            raise InputError(f"{where}: artists deveria ter 2 ou mais ids diferentes")
        rules.append((group_id, list(artists)))
    ids = [g for g, _ in rules]
    if len(set(ids)) != len(ids):
        raise InputError(f"{path}: grupo repetido")
    return rules


def _cv(name: str) -> re.Pattern[str]:
    """O crédito de personagem com o nome: "アンジュ(CV:水樹奈々)", "(CV：水樹奈々)". O nome acaba
    ali: "CV:水樹奈々子" é outra pessoa."""
    return re.compile(r"CV\s*[:：.]\s*" + re.escape(name) + r"(?=[)）、,，/／・&＆\s]|$)")


def _credited(track: JSON, artist_id: str, cv: re.Pattern[str]) -> bool:
    return artist_id in track["artistIds"] or bool(cv.search(track.get("artistDisplay") or ""))


def _side(
    artist_id: str,
    file: JSON,
    anime: JSON,
    others: Sequence[tuple[str, re.Pattern[str]]],
) -> ArtistSide:
    me = next((a for a in file["artists"] if a["id"] == artist_id), None)
    if me is None:
        raise InputError(f"{artist_id}: o arquivo do artista não credita o próprio artista")
    cv = _cv(me["name"])

    def credited(track: JSON, check_cv: bool) -> bool:
        if not (artist_id in track["artistIds"] or (check_cv and _credited(track, artist_id, cv))):
            return False
        return not any(_credited(track, other, other_cv) for other, other_cv in others)

    by_anime = sorted(anime["tracks"], key=lambda t: t["id"])
    by_file = sorted(file["tracks"], key=lambda t: (-t["popularity"], t["id"]))
    # O Anime primeiro, na ordem do id (a faixa de menor id da música, como o acervo do quiz);
    # depois o arquivo do artista, das mais populares para as menos (e pelo id, no empate). A
    # mesma faixa (o id) e a mesma música (a songKey) entram uma vez só: a cantada como personagem
    # tem no Anime a chave do personagem e no arquivo a do artista, com o mesmo id (P378: a chave
    # que vale é a do Anime, a das respostas do dia).
    found = [(t, True) for t in by_anime if credited(t, True)]
    found += [(t, False) for t in by_file if credited(t, False)]
    songs: list[ArtistSong] = []
    known: list[ArtistSong] = []
    seen_ids: set[str] = set()
    seen_keys: set[str] = set()
    for track, from_anime in found:
        if track["id"] in seen_ids or track["songKey"] in seen_keys:
            continue
        seen_ids.add(track["id"])
        seen_keys.add(track["songKey"])
        song = ArtistSong(id=track["id"], key=track["songKey"])
        known.append(song)
        if track["eligible"]["daily"] and (from_anime or len(songs) < POOL_MAX):
            songs.append(song)
    return ArtistSide(
        id=artist_id, name=me["nameLatin"] or me["name"], songs=tuple(songs), known=tuple(known)
    )


def load_artist_groups(
    provider: str, rules_path: Path | None, artists_dir: Path, anime: JSON
) -> list[ArtistGroup]:
    """Os grupos, com as músicas de cada artista. Sem o quiz_artists.toml, nenhum: o especial não
    sai. Um artista sem o arquivo publicado é erro (rode o build-artists antes)."""
    if rules_path is None or not rules_path.exists():
        return []
    groups: list[ArtistGroup] = []
    files: dict[str, JSON] = {}
    for group_id, raw_ids in load_group_rules(rules_path):
        ids = [f"{provider}:ar:{a}" for a in raw_ids]
        names: list[tuple[str, re.Pattern[str]]] = []
        for raw, artist_id in zip(raw_ids, ids, strict=True):
            path = artists_dir / f"{raw}.json"
            if not path.exists():
                raise InputError(
                    f"grupo {group_id}: falta {path} (o artista no artists.toml e o build-artists)"
                )
            files.setdefault(artist_id, read_json(path))
            me = next((a for a in files[artist_id]["artists"] if a["id"] == artist_id), None)
            names.append((artist_id, _cv(me["name"] if me else raw)))
        sides = tuple(
            _side(artist_id, files[artist_id], anime, [n for n in names if n[0] != artist_id])
            for artist_id in ids
        )
        groups.append(ArtistGroup(id=group_id, sides=sides))
    return groups


def artist_tracks(groups: Sequence[ArtistGroup]) -> Mapping[str, str]:
    """As faixas de todos os grupos → a songKey: o que a conferência aceita numa rodada deles
    (todas as conhecidas, também as que saíram do pool)."""
    out: dict[str, str] = {}
    for group in groups:
        for side in group.sides:
            for song in side.known or side.songs:
                out.setdefault(song.id, song.key)
    return out
