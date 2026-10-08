"""Linha de comando: python -m musicle_pipeline build | validate | romanize."""

from __future__ import annotations

import argparse
import contextlib
import sys
from collections.abc import Sequence
from pathlib import Path

from musicle_pipeline.aliases import load_aliases
from musicle_pipeline.catalog import Curation, build_catalog
from musicle_pipeline.io_json import dumps, read_json, write_if_changed
from musicle_pipeline.models import InputError
from musicle_pipeline.normalize import has_unassigned
from musicle_pipeline.paths import default_aliases_path, default_romaji_path, resolve
from musicle_pipeline.providers import PROVIDERS
from musicle_pipeline.romaji_cache import RomajiCache, collect_texts, load_cache, save_cache
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
    romaji = load_cache(resolve(args.romaji))
    missing = [t for t in collect_texts(snapshots) if not romaji.variants(t)]
    if missing:
        print(
            f"aviso: {len(missing)} texto(s) sem romaji; rode o comando romanize",
            file=sys.stderr,
        )
    curation = Curation(romaji=romaji, aliases=load_aliases(resolve(args.aliases)))
    catalog = build_catalog(snapshots, provider.name, provider.storefront, curation)
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


def _romanize(args: argparse.Namespace) -> int:
    path = resolve(args.cache)
    cache = load_cache(path)
    texts = collect_texts(PROVIDERS[args.provider]().snapshots())
    todo = texts if args.refresh else [t for t in texts if not cache.variants(t)]

    if args.check:
        # Não importa a biblioteca: dá para rodar na CI sem instalar o dicionário.
        if todo:
            print(f"{path}: {len(todo)} texto(s) sem romaji:", *todo, sep="\n  ", file=sys.stderr)
            return 1
        print(f"{path}: OK ({len(texts)} textos cobertos)")
        return 0

    try:
        from musicle_pipeline import romaji  # só aqui: o build nunca carrega a biblioteca
    except ImportError as exc:
        print(f'biblioteca de romaji ausente ({exc}). Instale: pip install -e "pipeline[romaji]"')
        return 1

    if cache.engine not in (None, romaji.ENGINE) and not args.refresh:
        print(
            f"o cache foi gerado com {cache.engine} e a biblioteca atual é {romaji.ENGINE}; "
            "use --refresh para refazer tudo",
            file=sys.stderr,
        )
        return 1
    # Sem --refresh, nunca apaga. Com --refresh, refaz do zero só com os textos atuais, para
    # não misturar saídas de bibliotecas ou versões diferentes no mesmo arquivo.
    entries = {} if args.refresh else dict(cache.entries)
    entries.update({t: romaji.romanize(t) for t in todo})
    new = RomajiCache(
        engine=romaji.ENGINE,
        versions=romaji.versions(),
        entries=dict(sorted(entries.items())),
    )
    changed = save_cache(path, new)
    print(f"{path}: {len(todo)} texto(s) romanizado(s); {'gravado' if changed else 'sem mudanças'}")
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
    build.add_argument("--romaji", type=Path, default=default_romaji_path(), help="cache de romaji")
    build.add_argument("--aliases", type=Path, default=default_aliases_path(), help="curadoria")
    build.set_defaults(func=_build)

    validate = sub.add_parser("validate", help="confere um catalog.json")
    validate.add_argument("path", type=Path)
    validate.set_defaults(func=_validate)

    romanize = sub.add_parser("romanize", help="completa o cache de romaji (extra [romaji])")
    romanize.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    romanize.add_argument("--cache", type=Path, default=default_romaji_path())
    mode = romanize.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="só confere se falta texto (código 1)")
    mode.add_argument("--refresh", action="store_true", help="refaz todas as entradas")
    romanize.set_defaults(func=_romanize)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except InputError as exc:
        print(f"entrada inválida:\n{exc}", file=sys.stderr)
        return 1
