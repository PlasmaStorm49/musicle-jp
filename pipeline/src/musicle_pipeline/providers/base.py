from __future__ import annotations

from typing import Protocol

from musicle_pipeline.models import ChartSnapshot


class ChartProvider(Protocol):
    """Interface que todo provedor implementa. O resto do pipeline só conhece isto.

    Protocol é "tipagem estrutural": qualquer classe com estes atributos serve, sem herdar.
    """

    name: str  # prefixo dos IDs no catálogo, ex.: "fixture" → "fixture:tr:01"
    storefront: str  # país da loja, ex.: "jp"

    def snapshots(self) -> list[ChartSnapshot]:
        """Todos os snapshots disponíveis, em qualquer ordem."""
        ...
