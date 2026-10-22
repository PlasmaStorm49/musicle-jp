"""Caminhos do repositório, independentes da pasta de onde o comando é chamado."""

from dataclasses import dataclass
from pathlib import Path

# pipeline/src/musicle_pipeline/paths.py → parents[3] é a raiz do repositório.
# Funciona porque o pacote é instalado em modo editável (pip install -e).
REPO_ROOT = Path(__file__).resolve().parents[3]


def repo_root() -> Path:
    if not (REPO_ROOT / "shared" / "schema").is_dir():
        raise RuntimeError(
            f"Raiz do repositório não encontrada em {REPO_ROOT}. "
            'Instale o pipeline em modo editável: pip install -e "pipeline[dev]"'
        )
    return REPO_ROOT


def resolve(path: Path) -> Path:
    """Caminho relativo é sempre relativo à raiz do repositório, não à pasta atual."""
    return path if path.is_absolute() else repo_root() / path


def catalog_schema_path() -> Path:
    return repo_root() / "shared" / "schema" / "catalog.schema.json"


def schedule_schema_path() -> Path:
    return repo_root() / "shared" / "schema" / "schedule.schema.json"


def default_fixture_path() -> Path:
    return repo_root() / "pipeline" / "fixtures" / "chart_fixture.json"


@dataclass(frozen=True)
class ProviderPaths:
    """Curadoria e cache de cada provedor, separados: os IDs de um não existem no outro."""

    romaji: Path
    aliases: Path
    # Onde o catálogo publicado desse provedor fica (o build recusa gravar em outro lugar).
    public_dir: Path


_CURATION_DIRS = {
    "fixture": Path("pipeline") / "fixtures",
    "apple": Path("pipeline") / "data" / "apple",
}
_PUBLIC_DIRS = {
    "fixture": Path("web") / "public" / "fixtures",
    "apple": Path("web") / "public" / "data",
}


def provider_paths(provider: str) -> ProviderPaths:
    curation = repo_root() / _CURATION_DIRS[provider]
    return ProviderPaths(
        romaji=curation / "romaji.json",
        aliases=curation / "aliases.toml",
        public_dir=repo_root() / _PUBLIC_DIRS[provider],
    )


def artist_schema_path() -> Path:
    return repo_root() / "shared" / "schema" / "artist.schema.json"


def artist_list_schema_path() -> Path:
    return repo_root() / "shared" / "schema" / "artist-list.schema.json"


@dataclass(frozen=True)
class ArtistPaths:
    """O modo por artista (M13) tem curadoria, cache e pasta próprios, separados dos da parada:
    um aliases.toml compartilhado quebraria o build da parada (ID que ela não tem), e o
    --refresh do romaji de um apagaria os textos do outro."""

    artists: Path  # artists.toml: a lista curada, na ordem da tela, e as regras de cada artista
    aliases: Path
    romaji: Path
    source: Path  # snapshots/ (apple, um por artista) ou artists_fixture.json (fixture)
    public_dir: Path  # onde ficam o index.json e um arquivo por artista


_ARTIST_SOURCES = {"fixture": "artists_fixture.json", "apple": "snapshots"}


def artist_paths(provider: str) -> ArtistPaths:
    curation = repo_root() / _CURATION_DIRS[provider] / "artists"
    return ArtistPaths(
        artists=curation / "artists.toml",
        aliases=curation / "aliases.toml",
        romaji=curation / "romaji.json",
        source=curation / _ARTIST_SOURCES[provider],
        public_dir=repo_root() / _PUBLIC_DIRS[provider] / "artists",
    )


def anime_catalog_schema_path() -> Path:
    return repo_root() / "shared" / "schema" / "anime-catalog.schema.json"


def anime_schedule_schema_path() -> Path:
    return repo_root() / "shared" / "schema" / "anime-schedule.schema.json"


@dataclass(frozen=True)
class AnimePaths:
    """O Anime (M14) tem curadoria, cache e pasta próprios, como o modo por artista: os ids e
    os textos dele não existem na parada."""

    aliases: Path  # o bloqueio (block) e as correções de latino
    romaji: Path
    source: Path  # snapshots/ (apple, só crescem) ou anime_fixture.json (fixture)
    public_dir: Path  # onde ficam o catalog.json e o schedule.json do Anime


_ANIME_SOURCES = {"fixture": "anime_fixture.json", "apple": "snapshots"}


def anime_paths(provider: str) -> AnimePaths:
    curation = repo_root() / _CURATION_DIRS[provider] / "anime"
    return AnimePaths(
        aliases=curation / "aliases.toml",
        romaji=curation / "romaji.json",
        source=curation / _ANIME_SOURCES[provider],
        public_dir=repo_root() / _PUBLIC_DIRS[provider] / "anime",
    )


def apple_snapshots_dir() -> Path:
    """Snapshots da parada real, um por dia (gravados pelo comando fetch; só crescem)."""
    return repo_root() / _CURATION_DIRS["apple"] / "snapshots"


def known_schedules() -> list[tuple[Path, str]]:
    """As agendas publicadas, existam ou não, com o tipo de cada uma: as dos Hits ("hits", a
    fictícia e a real) e as do Anime ("anime", M14). O schedule-check padrão confere as quatro,
    cada uma com o gerador do tipo dela, e uma que existia na base e sumiu também é erro."""
    hits = [(repo_root() / d / "schedule.json", "hits") for d in _PUBLIC_DIRS.values()]
    anime = [(anime_paths(p).public_dir / "schedule.json", "anime") for p in _PUBLIC_DIRS]
    return hits + anime
