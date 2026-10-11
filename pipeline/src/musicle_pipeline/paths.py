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


def apple_snapshots_dir() -> Path:
    """Snapshots da parada real, um por dia (gravados pelo comando fetch; só crescem)."""
    return repo_root() / _CURATION_DIRS["apple"] / "snapshots"


def public_schedules() -> list[Path]:
    """As agendas publicadas que existem (fictícia e real), para o schedule-check padrão."""
    return [
        path
        for path in (repo_root() / d / "schedule.json" for d in _PUBLIC_DIRS.values())
        if path.exists()
    ]
