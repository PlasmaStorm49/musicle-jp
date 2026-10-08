"""Linha de comando: python -m musicle_pipeline build | validate."""

from __future__ import annotations

import argparse
import contextlib
import sys
from collections.abc import Sequence
from pathlib import Path

from musicle_pipeline.catalog import build_catalog
from musicle_pipeline.io_json import dumps, read_json, write_if_changed
from musicle_pipeline.models import InputError
from musicle_pipeline.normalize import has_unassigned
from musicle_pipeline.paths import resolve
from musicle_pipeline.providers import PROVIDERS
from musicle_pipeline.validate import validate_catalog


def _utf8_console() -> None:
    # Sem isto, imprimir japonês com a saída redirecionada quebra no Windows (cp1252).
    for stream in (sys.stdout, sys.stderr):
        # Em testes, o pytest troca a saída por um objeto sem reconfigure(); aí não há o que fazer.
        with contextlib.suppress(AttributeError, ValueError):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")


def _build(args: argparse.Namespace) -> int:
    provider = PROVIDERS[args.provider]()
    snapshots = provider.snapshots()
    for snap in snapshots:
        for e in snap.entries:
            texts = [e.track.title, e.track.album.title, *(a.name for a in e.track.artists)]
            if any(has_unassigned(t) for t in texts):
                print(
                    f"aviso: {snap.id} faixa {e.track.provider_id} tem caractere fora do "
                    "Unicode 15.0; ele some da busca",
                    file=sys.stderr,
                )
    catalog = build_catalog(snapshots, provider.name, provider.storefront)
    problems = validate_catalog(catalog)
    if problems:
        print("catálogo inválido, nada foi gravado:", *problems, sep="\n  ", file=sys.stderr)
        return 1
    out = resolve(args.out)
    if write_if_changed(out, dumps(catalog)):
        print(
            f"catálogo gravado: {out} ({len(catalog['tracks'])} faixas, "
            f"versão {catalog['catalogVersion']})"
        )
    else:
        print(f"sem mudanças: {out} (versão {catalog['catalogVersion']})")
    return 0


def _validate(args: argparse.Namespace) -> int:
    path = resolve(args.path)
    raw = path.read_bytes()
    problems = validate_catalog(read_json(path), raw)
    if problems:
        print(f"{path}: {len(problems)} problema(s)", *problems, sep="\n  ", file=sys.stderr)
        return 1
    print(f"{path}: OK")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    _utf8_console()
    parser = argparse.ArgumentParser(
        prog="python -m musicle_pipeline",
        description="Pipeline de dados do musicle-jp. Caminhos relativos partem da raiz do repo.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="gera o catálogo a partir das paradas")
    build.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    build.add_argument("--out", type=Path, required=True, help="arquivo catalog.json de saída")
    build.set_defaults(func=_build)

    validate = sub.add_parser("validate", help="confere um catalog.json")
    validate.add_argument("path", type=Path)
    validate.set_defaults(func=_validate)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except InputError as exc:
        print(f"entrada inválida:\n{exc}", file=sys.stderr)
        return 1
