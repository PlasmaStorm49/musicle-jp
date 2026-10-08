"""Caminhos do repositório, independentes da pasta de onde o comando é chamado."""

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


def default_fixture_path() -> Path:
    return repo_root() / "pipeline" / "fixtures" / "chart_fixture.json"


def default_romaji_path() -> Path:
    return repo_root() / "pipeline" / "data" / "romaji.json"


def default_aliases_path() -> Path:
    return repo_root() / "pipeline" / "data" / "aliases.toml"
