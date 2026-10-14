"""Linha de comando: python -m musicle_pipeline <comando>. Rode com --help para a lista."""

from __future__ import annotations

import argparse
import contextlib
import re
import sys
from collections.abc import Callable, Mapping, Sequence
from datetime import date
from pathlib import Path
from typing import Any

from musicle_pipeline.aliases import load_aliases
from musicle_pipeline.artists import (
    INDEX,
    artist_snapshots,
    build_artists,
    load_artist_list,
    selections,
)
from musicle_pipeline.catalog import Curation, build_catalog
from musicle_pipeline.fake_assets import generate_assets
from musicle_pipeline.io_json import dumps, read_json, write_if_changed
from musicle_pipeline.models import InputError
from musicle_pipeline.normalize import has_unassigned, needs_romaji
from musicle_pipeline.paths import (
    apple_snapshots_dir,
    artist_paths,
    known_schedules,
    provider_paths,
    repo_root,
    resolve,
)
from musicle_pipeline.providers import ARTIST_PROVIDERS, PROVIDERS
from musicle_pipeline.providers.apple import snapshot_days
from musicle_pipeline.romaji_cache import (
    RomajiCache,
    collect_texts,
    collect_track_texts,
    load_cache,
    save_cache,
)
from musicle_pipeline.schedule import (
    HORIZON_DAYS,
    ScheduleError,
    check_dates,
    compare,
    generate,
    read_base_ref,
    regenerate_problems,
    validate_schedule,
)
from musicle_pipeline.validate import validate_catalog
from musicle_pipeline.validate_artists import (
    validate_artist_dir,
    validate_artist_file,
    validate_artist_list,
    validate_artist_set,
)


def _utf8_console() -> None:
    # Sem isto, imprimir japonês com a saída redirecionada quebra no Windows (cp1252).
    for stream in (sys.stdout, sys.stderr):
        # Em testes, o pytest troca a saída por um objeto sem reconfigure(); aí não há o que fazer.
        with contextlib.suppress(AttributeError, ValueError):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")


def _build(args: argparse.Namespace) -> int:
    paths = provider_paths(args.provider)
    out = resolve(args.out).resolve()  # resolvido: "pipeline/../web/..." não escapa da trava
    # Trava: dentro de web/public, o catálogo de um provedor só vai para a pasta dele (o
    # fictício nunca sobrescreve o real, nem o contrário). Fora dali (testes), tanto faz.
    public = (repo_root() / "web" / "public").resolve()
    if out.is_relative_to(public) and out.parent != paths.public_dir.resolve():
        print(
            f"o provedor {args.provider} grava em {paths.public_dir}, não em {out.parent}",
            file=sys.stderr,
        )
        return 1
    provider = PROVIDERS[args.provider]()
    snapshots = provider.snapshots()
    for message in getattr(provider, "warnings", []):
        print(f"aviso: {message}", file=sys.stderr)
    for snap in snapshots:
        for e in snap.entries:
            texts = [e.track.title, e.track.album.title, *(a.name for a in e.track.artists)]
            if any(has_unassigned(t) for t in texts):
                print(
                    f"aviso: {snap.id} faixa {e.track.provider_id} tem caractere fora do "
                    "Unicode 15.0; ele some da busca",
                    file=sys.stderr,
                )
    romaji = load_cache(resolve(args.romaji) if args.romaji else paths.romaji)
    missing = [t for t in collect_texts(snapshots) if not romaji.variants(t)]
    if missing:
        print(
            f"aviso: {len(missing)} texto(s) sem romaji; rode o comando romanize",
            file=sys.stderr,
        )
    aliases = load_aliases(resolve(args.aliases) if args.aliases else paths.aliases)
    curation = Curation(romaji=romaji, aliases=aliases)
    notes: list[str] = []
    catalog = build_catalog(snapshots, provider.name, provider.storefront, curation, notes)
    for message in notes:
        print(f"aviso: {message}", file=sys.stderr)
    problems = validate_catalog(catalog)
    if problems:
        print("catálogo inválido, nada foi gravado:", *problems, sep="\n  ", file=sys.stderr)
        return 1
    if write_if_changed(out, dumps(catalog)):
        print(
            f"catálogo gravado: {out} ({len(catalog['tracks'])} faixas, "
            f"versão {catalog['catalogVersion']})"
        )
    else:
        print(f"sem mudanças: {out} (versão {catalog['catalogVersion']})")
    return 0


def _report(path: Path, problems: list[str]) -> int:
    if problems:
        print(f"{path}: {len(problems)} problema(s)", *problems, sep="\n  ", file=sys.stderr)
        return 1
    print(f"{path}: OK")
    return 0


def _validate(args: argparse.Namespace) -> int:
    path = resolve(args.path)
    catalog = read_json(path)
    code = _report(path, validate_catalog(catalog, path.read_bytes()))
    if args.schedule is None or code:
        return code
    spath = resolve(args.schedule)
    schedule = read_json(spath)
    problems = validate_schedule(schedule, catalog)
    if not problems and dumps(schedule).encode("utf-8") != spath.read_bytes():
        problems.append("arquivo fora da forma canônica (regere com o pipeline)")
    return _report(spath, problems)


def _artist_curation(provider: str) -> Curation:
    paths = artist_paths(provider)
    return Curation(romaji=load_cache(paths.romaji), aliases=load_aliases(paths.aliases))


def _build_artists(args: argparse.Namespace) -> int:
    paths = artist_paths(args.provider)
    out_dir = (resolve(args.out_dir) if args.out_dir else paths.public_dir).resolve()
    # A mesma trava do build: dentro de web/public, cada provedor só grava na pasta dele.
    public = (repo_root() / "web" / "public").resolve()
    if out_dir.is_relative_to(public) and out_dir != paths.public_dir.resolve():
        print(
            f"o provedor {args.provider} grava em {paths.public_dir}, não em {out_dir}",
            file=sys.stderr,
        )
        return 1
    provider = ARTIST_PROVIDERS[args.provider]()
    rules = load_artist_list(paths.artists)
    notes: list[str] = []
    cur = _artist_curation(args.provider)
    files = build_artists(provider, rules, cur, notes)
    for message in [*provider.warnings, *notes]:
        print(f"aviso: {message}", file=sys.stderr)
    missing = [t for t in _artist_texts(args.provider) if not cur.romaji.variants(t)]
    if missing:
        print(
            f"aviso: {len(missing)} texto(s) sem romaji; rode o romanize --artists",
            file=sys.stderr,
        )
    texts = {name: dumps(data) for name, data in files.items()}
    problems = [
        f"{name}: {problem}"
        for name, data in files.items()
        for problem in (validate_artist_list if name == INDEX else validate_artist_file)(
            data, texts[name].encode("utf-8")
        )
    ] + validate_artist_set(files)
    if problems:
        print("arquivos inválidos, nada foi gravado:", *problems, sep="\n  ", file=sys.stderr)
        return 1
    # Artista que saiu da lista: o arquivo dele ficaria publicado sem estar no índice. Só numa
    # pasta publicada (a do provedor, ou uma que já tem índice): um --out-dir errado (a pasta da
    # curadoria também se chama artists/) não pode apagar o que não é dele.
    owned = out_dir == paths.public_dir.resolve() or (out_dir / INDEX).exists()
    written = [n for n in files if write_if_changed(out_dir / n, texts[n])]
    removed = sorted(p.name for p in out_dir.glob("*.json") if p.name not in files) if owned else []
    for name in removed:
        (out_dir / name).unlink()
    songs = sum(len(data["tracks"]) for n, data in files.items() if n != INDEX)
    print(
        f"{out_dir}: {len(files) - 1} artista(s), {songs} música(s); "
        f"{len(written)} gravado(s), {len(removed)} órfão(s) apagado(s)"
    )
    return 0


def _validate_artists(args: argparse.Namespace) -> int:
    directory = resolve(args.dir) if args.dir else artist_paths(args.provider).public_dir
    return _report(directory, validate_artist_dir(directory))


def _schedule(args: argparse.Namespace) -> int:
    catalog_path = resolve(args.catalog)
    catalog = read_json(catalog_path)
    if _report(catalog_path, validate_catalog(catalog, catalog_path.read_bytes())):
        return 1
    out = resolve(args.out)
    existing = read_json(out) if out.exists() else None
    result = generate(catalog, existing, args.today, args.epoch, args.days)
    for message in result.warnings:
        print(f"aviso: {message}", file=sys.stderr)
    for message in result.relaxations:
        print(f"afrouxamento: {message}", file=sys.stderr)
    changed = write_if_changed(out, dumps(result.schedule))
    span = f" ({result.added[0]} a {result.added[-1]})" if result.added else ""
    total = len(result.schedule["days"])
    print(f"{out}: {len(result.added)} dia(s) novo(s){span}, {total} no total", end="")
    print("" if changed else "; sem mudanças")
    return 0


def _fake_assets(args: argparse.Namespace) -> int:
    catalog = read_json(resolve(args.catalog))
    report = generate_assets(catalog, resolve(args.public))
    print(
        f"assets: {len(report.written)} gravado(s), {report.unchanged} sem mudança, "
        f"{len(report.removed)} órfão(s) apagado(s)"
    )
    return 0


def _schedule_check(args: argparse.Namespace) -> int:
    if args.base is not None and len(args.path or []) != 1:
        print("--base compara com um arquivo só: passe exatamente um --path", file=sys.stderr)
        return 1
    if args.catalog is not None and len(args.path or []) != 1:
        print("--catalog vale para uma agenda só: passe exatamente um --path", file=sys.stderr)
        return 1
    paths = [resolve(p) for p in args.path] if args.path else known_schedules()
    results = [code for code in (_check_one(path, args) for path in paths) if code is not None]
    if not results:
        print("nenhuma agenda para conferir (nem aqui nem na base)")
        return 0
    return max(results)


def _check_one(path: Path, args: argparse.Namespace) -> int | None:
    """0 = só cresceu, 1 = quebrou, None = a agenda não existe aqui nem na base."""
    if args.base is not None:
        base_path = resolve(args.base)
        base = read_json(base_path) if base_path.exists() else None
        origin = str(base_path)
    else:
        relative = path.relative_to(repo_root()).as_posix()
        base = read_base_ref(args.base_ref, relative)
        origin = f"{args.base_ref}:{relative}"
    if not path.exists():
        if base is None:
            return None
        # Apagar a agenda inteira também quebra o só-acréscimo (regra inviolável 4).
        print(f"{path}: existe em {origin} e foi apagada (a agenda só cresce)")
        return 1
    current = read_json(path)
    problems = compare(base, current)
    if args.today is not None:
        problems += check_dates(base, current, args.today)
    # Os dias novos precisam ser os do gerador, com o catálogo ao lado da agenda (o do mesmo PR).
    catalog_path = resolve(args.catalog) if args.catalog else path.with_name("catalog.json")
    if not problems:
        if catalog_path.exists():
            problems += regenerate_problems(base, current, read_json(catalog_path))
        elif args.catalog:
            problems.append(f"{catalog_path}: catálogo não encontrado")
        else:
            # Uma agenda avulsa (--path), sem catálogo ao lado: o resto vale, mas é bom saber.
            print(
                f"{path}: aviso: sem {catalog_path.name} ao lado, os dias novos não foram regerados"
            )
    if problems:
        print(f"{path} quebra o só-acréscimo em relação a {origin}:", *problems, sep="\n  ")
        return 1
    kept = len(base["days"]) if base else 0
    print(f"{path}: OK ({kept} dia(s) da base preservados, {len(current['days'])} no total)")
    return 0


def _fetch(args: argparse.Namespace) -> int:
    # Só aqui: os outros comandos nunca carregam o módulo de rede (teste em subprocesso).
    from musicle_pipeline import fetch

    if args.artists:
        if args.today is not None:
            print("--today é da parada; com --artists, não passe", file=sys.stderr)
            return 1
        return _fetch_artists(args, fetch)
    if args.today is None:
        print("--today é obrigatório na busca da parada", file=sys.stderr)
        return 1
    if args.artist or args.force:
        print("--artist e --force só valem com --artists", file=sys.stderr)
        return 1
    directory = apple_snapshots_dir()
    out = directory / f"{args.today.isoformat()}.json"
    if out.exists():
        print(f"{out}: já existe; nada a buscar")
        return 0
    days = snapshot_days(directory)  # o mesmo filtro (AAAA-MM-DD.json) que o provedor usa
    if days and days[-1] >= args.today.isoformat():
        print(
            f"--today {args.today} não é posterior ao último snapshot ({days[-1]})", file=sys.stderr
        )
        return 1
    try:
        snapshot = fetch.fetch_snapshot(args.today, args.fetched_at)
    except fetch.FetchError as exc:
        print(f"fetch: {exc}; nada foi gravado", file=sys.stderr)
        return 1
    if days:
        previous = read_json(directory / f"{days[-1]}.json")
        if [r["id"] for r in previous["rss"]] == [r["id"] for r in snapshot["rss"]]:
            print(f"parada igual à de {days[-1]}; nada foi gravado")
            return 0
    write_if_changed(out, dumps(snapshot))
    print(f"{out}: {len(snapshot['rss'])} faixas na parada, {len(snapshot['missing'])} sem lookup")
    return 0


def _fetch_artists(args: argparse.Namespace, fetch: Any) -> int:
    """Um snapshot por artista do artists.toml (ou só os de --artist), substituído a cada busca.
    A falha de um artista não apaga o snapshot anterior dele, e o comando sai com 1."""
    paths = artist_paths("apple")
    listed = [r.id for r in load_artist_list(paths.artists)]
    chosen = list(dict.fromkeys(args.artist or listed))  # sem repetir, na ordem
    unknown = [a for a in chosen if a not in listed]
    if unknown:
        print(f"fora do {paths.artists.name}: {', '.join(unknown)}", file=sys.stderr)
        return 1
    failed = 0
    for position, artist_id in enumerate(chosen):
        try:
            # A pausa entre os pedidos vale também de um artista para o seguinte.
            snapshot = fetch.fetch_artist_snapshot(
                artist_id, args.fetched_at, wait_first=position > 0
            )
        except fetch.FetchError as exc:
            print(f"fetch {artist_id}: {exc}; o snapshot anterior fica", file=sys.stderr)
            failed += 1
            continue
        out = paths.source / f"{artist_id}.json"
        if out.exists() and not args.force:
            previous = read_json(out)
            before = len(previous.get("tracks", {})) if isinstance(previous, dict) else 0
            if len(snapshot["tracks"]) < fetch.SHRINK_MIN * before:
                print(
                    f"{out}: {len(snapshot['tracks'])} faixas contra {before} do anterior; "
                    "nada foi gravado (confira e use --force)",
                    file=sys.stderr,
                )
                failed += 1
                continue
        for kind, found in (("músicas", snapshot["songs"]), ("álbuns", snapshot["albums"])):
            if len(found) >= fetch.ARTIST_LIMIT:
                print(
                    f"aviso: {artist_id}: o lookup de {kind} veio no limite ({fetch.ARTIST_LIMIT});"
                    " pode haver mais",
                    file=sys.stderr,
                )
        changed = write_if_changed(out, dumps(snapshot))
        print(
            f"{out}: {len(snapshot['tracks'])} faixas, {len(snapshot['albums'])} álbuns, "
            f"{len(snapshot['songs'])} no lookup de músicas" + ("" if changed else "; sem mudanças")
        )
    return 1 if failed else 0


def _fetched_at(text: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", text):
        raise argparse.ArgumentTypeError("use AAAA-MM-DDTHH:MM:SSZ (UTC)")
    return text


def romanize_each(
    texts: Sequence[str], romanize: Callable[[str], tuple[str, ...]]
) -> tuple[dict[str, tuple[str, ...]], list[str]]:
    """Romaji de cada texto. O que a biblioteca não lê (um 々 sozinho, um alfabeto que ela não
    conhece) fica com o próprio texto, que serve à busca e o build não usa como latino
    (Curation.latin), e vai para a lista de avisos: corrija no aliases.toml. Um texto assim não
    pode travar o robô semanal toda semana enquanto a faixa estiver na parada."""
    done: dict[str, tuple[str, ...]] = {}
    failed: list[str] = []
    for text in texts:
        try:
            done[text] = romanize(text)
        except ValueError:
            done[text] = (text,)
            failed.append(text)
    return done, failed


def partial_reads(done: Mapping[str, tuple[str, ...]], failed: Sequence[str] = ()) -> list[str]:
    """Os textos lidos cuja leitura ainda tem letra fora de a-z (ME84): o kanji que o cutlet pula
    e o hangul, que ele devolve igual ("가끔씩") ou só sem os espaços ("우주를줄게"), sem erro. A
    leitura fica no cache, porque ajuda a busca ("Higashi 亰 cannibalism"), e o build não a exibe
    (Curation.latin). Os que deram erro (`failed`) já têm o aviso deles."""
    return [t for t, variants in done.items() if t not in failed and needs_romaji(variants[0])]


def _artist_texts(provider_name: str) -> list[str]:
    """Os textos das músicas que ficam no modo por artista (as canônicas de cada um)."""
    provider = ARTIST_PROVIDERS[provider_name]()
    rules = load_artist_list(artist_paths(provider_name).artists)
    picked = selections(
        provider_name, artist_snapshots(provider, rules), _artist_curation(provider_name), []
    )
    return collect_track_texts(song.canonical for _, _, songs in picked for song in songs)


def _romanize(args: argparse.Namespace) -> int:
    if args.cache:
        path = resolve(args.cache)
    elif args.artists:
        path = artist_paths(args.provider).romaji
    else:
        path = provider_paths(args.provider).romaji
    cache = load_cache(path)
    if args.artists:
        texts = _artist_texts(args.provider)
    else:
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
    done, failed = romanize_each(todo, romaji.romanize)
    entries.update(done)
    for text in failed:
        print(
            f"aviso: o romaji não leu {text!r}; ficou o próprio texto (corrija no aliases.toml)",
            file=sys.stderr,
        )
    for text in partial_reads(done, failed):
        print(
            f"aviso: a leitura de {text!r} ({done[text][0]!r}) ainda tem letra fora do latino; "
            "fica para a busca, mas não vira latino (corrija no aliases.toml)",
            file=sys.stderr,
        )
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
    build.add_argument("--romaji", type=Path, help="cache de romaji (padrão: o do provedor)")
    build.add_argument("--aliases", type=Path, help="curadoria (padrão: a do provedor)")
    build.set_defaults(func=_build)

    validate = sub.add_parser("validate", help="confere um catalog.json (e a agenda, se pedir)")
    validate.add_argument("path", type=Path)
    validate.add_argument("--schedule", type=Path, help="schedule.json a conferir com o catálogo")
    validate.set_defaults(func=_validate)

    schedule = sub.add_parser("schedule", help="acrescenta dias à agenda (nunca altera dia)")
    schedule.add_argument("--catalog", type=Path, required=True)
    schedule.add_argument("--out", type=Path, required=True, help="schedule.json")
    schedule.add_argument(
        "--today",
        type=date.fromisoformat,
        required=True,
        help="data de hoje em Brasília (dia anterior a ela nunca é gerado, P44)",
    )
    schedule.add_argument("--epoch", type=date.fromisoformat, help="desafio nº 1 (agenda nova)")
    schedule.add_argument("--days", type=int, default=HORIZON_DAYS, help="dias à frente de hoje")
    schedule.set_defaults(func=_schedule)

    assets = sub.add_parser("fake-assets", help="gera WAV e SVG sintéticos (só provedor fixture)")
    assets.add_argument("--catalog", type=Path, required=True)
    assets.add_argument("--public", type=Path, default=Path("web/public"), help="pasta pública")
    assets.set_defaults(func=_fake_assets)

    check = sub.add_parser("schedule-check", help="confere que a agenda só cresceu")
    check.add_argument(
        "--path",
        type=Path,
        action="append",
        help="agenda a conferir; repita para várias (padrão: a fictícia e a real)",
    )
    base = check.add_mutually_exclusive_group(required=True)
    base.add_argument("--base-ref", help="revisão do git, ex.: origin/main")
    base.add_argument("--base", type=Path, help="arquivo de base (ausente = vazio)")
    check.add_argument(
        "--today",
        type=date.fromisoformat,
        help="hoje em Brasília: dia novo não pode ter passado nem deixar buraco a mais (P44)",
    )
    check.add_argument(
        "--catalog",
        type=Path,
        help="catálogo para regerar os dias novos (padrão: o catalog.json ao lado da agenda)",
    )
    check.set_defaults(func=_schedule_check)

    fetch = sub.add_parser("fetch", help="busca a parada real do dia (único comando com rede)")
    fetch.add_argument("--provider", choices=["apple"], required=True)
    fetch.add_argument(
        "--today", type=date.fromisoformat, help="hoje em Brasília (obrigatório na parada)"
    )
    fetch.add_argument(
        "--artists", action="store_true", help="busca os artistas do modo por artista (M13)"
    )
    fetch.add_argument(
        "--artist", action="append", help="com --artists: só este id (repita para vários)"
    )
    fetch.add_argument(
        "--force", action="store_true", help="com --artists: grava mesmo se o snapshot encolheu"
    )
    fetch.add_argument(
        "--fetched-at", type=_fetched_at, required=True, help="agora em UTC: AAAA-MM-DDTHH:MM:SSZ"
    )
    fetch.set_defaults(func=_fetch)

    romanize = sub.add_parser("romanize", help="completa o cache de romaji (extra [romaji])")
    romanize.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    romanize.add_argument("--cache", type=Path, help="cache de romaji (padrão: o do provedor)")
    romanize.add_argument(
        "--artists", action="store_true", help="os textos do modo por artista (cache próprio)"
    )
    mode = romanize.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="só confere se falta texto (código 1)")
    mode.add_argument("--refresh", action="store_true", help="refaz todas as entradas")
    romanize.set_defaults(func=_romanize)

    artists = sub.add_parser("build-artists", help="gera os arquivos do modo por artista (M13)")
    artists.add_argument("--provider", choices=sorted(ARTIST_PROVIDERS), required=True)
    artists.add_argument("--out-dir", type=Path, help="pasta de saída (padrão: a do provedor)")
    artists.set_defaults(func=_build_artists)

    check_artists = sub.add_parser(
        "validate-artists", help="confere a pasta publicada do modo por artista"
    )
    check_artists.add_argument("--provider", choices=sorted(ARTIST_PROVIDERS), required=True)
    check_artists.add_argument("--dir", type=Path, help="pasta (padrão: a do provedor)")
    check_artists.set_defaults(func=_validate_artists)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except InputError as exc:
        print(f"entrada inválida:\n{exc}", file=sys.stderr)
        return 1
    except ScheduleError as exc:
        print(f"agenda: {exc}", file=sys.stderr)
        return 1
