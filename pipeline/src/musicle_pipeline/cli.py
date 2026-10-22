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
from musicle_pipeline.anime import build_anime_catalog, chart_artists
from musicle_pipeline.anime_schedule import (
    generate_anime,
    rule_problems,
    short_pools,
    validate_anime_schedule,
)
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
    anime_paths,
    apple_snapshots_dir,
    artist_paths,
    known_schedules,
    provider_paths,
    repo_root,
    resolve,
)
from musicle_pipeline.providers import ANIME_PROVIDERS, ARTIST_PROVIDERS, PROVIDERS
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
    Generator,
    ScheduleError,
    check_dates,
    compare,
    generate,
    read_base_ref,
    regenerate_problems,
    validate_schedule,
)
from musicle_pipeline.validate import validate_catalog
from musicle_pipeline.validate_anime import validate_anime_catalog
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


def _anime_curation(provider: str) -> Curation:
    paths = anime_paths(provider)
    return Curation(romaji=load_cache(paths.romaji), aliases=load_aliases(paths.aliases))


def _build_anime(args: argparse.Namespace) -> int:
    paths = anime_paths(args.provider)
    out = (resolve(args.out) if args.out else paths.public_dir / "catalog.json").resolve()
    # A mesma trava do build: dentro de web/public, cada provedor só grava na pasta dele.
    public = (repo_root() / "web" / "public").resolve()
    if out.is_relative_to(public) and out.parent != paths.public_dir.resolve():
        print(
            f"o provedor {args.provider} grava em {paths.public_dir}, não em {out}", file=sys.stderr
        )
        return 1
    provider = ANIME_PROVIDERS[args.provider]()
    # O ícone pelo artista da parada (P274) é só da Apple: os animes fictícios citam as faixas
    # da parada fictícia, e toda música deles seria ícone.
    icons = (
        chart_artists(args.provider, PROVIDERS[args.provider]().snapshots())
        if args.provider == "apple"
        else frozenset()
    )
    notes: list[str] = []
    catalog = build_anime_catalog(
        provider.name,
        provider.storefront,
        provider.source(),
        _anime_curation(args.provider),
        notes,
        icon_artists=icons,
    )
    for message in provider.warnings:
        print(f"aviso: {message}", file=sys.stderr)
    for message in notes:
        print(message)
    text = dumps(catalog)
    problems = validate_anime_catalog(catalog, text.encode("utf-8"))
    if problems:
        print("catálogo inválido, nada foi gravado:", *problems, sep="\n  ", file=sys.stderr)
        return 1
    changed = write_if_changed(out, text)
    size = len(text.encode("utf-8"))
    print(f"{out}: {len(catalog['tracks'])} faixa(s), {size} bytes", end="")
    print("" if changed else "; sem mudanças")
    return 0


def _validate_anime(args: argparse.Namespace) -> int:
    path = (
        resolve(args.path) if args.path else anime_paths(args.provider).public_dir / "catalog.json"
    )
    if not path.exists():
        return _report(path, ["arquivo ausente (rode o build-anime)"])
    catalog = read_json(path)
    code = _report(path, validate_anime_catalog(catalog, path.read_bytes()))
    # A agenda ao lado do catálogo, se existir (ou a do --schedule, que precisa existir).
    spath = resolve(args.schedule) if args.schedule else path.with_name("schedule.json")
    if code or (args.schedule is None and not spath.exists()):
        return code
    if not spath.exists():
        return _report(spath, ["arquivo ausente (rode o schedule-anime)"])
    schedule = read_json(spath)
    problems = validate_anime_schedule(schedule, catalog)
    warnings = short_pools(catalog)
    if not problems:
        errors, old = rule_problems(schedule, catalog)
        problems += errors
        warnings += [f"{w} (catálogo mudou depois do dia)" for w in old]
        if dumps(schedule).encode("utf-8") != spath.read_bytes():
            problems.append("arquivo fora da forma canônica (regere com o pipeline)")
    for message in warnings:
        print(f"aviso: {message}", file=sys.stderr)
    return _report(spath, problems)


def _schedule_anime(args: argparse.Namespace) -> int:
    paths = anime_paths(args.provider)
    catalog_path = resolve(args.catalog) if args.catalog else paths.public_dir / "catalog.json"
    out = (resolve(args.out) if args.out else paths.public_dir / "schedule.json").resolve()
    # A mesma trava do build: dentro de web/public, cada provedor só grava na pasta dele.
    public = (repo_root() / "web" / "public").resolve()
    if out.is_relative_to(public) and out.parent != paths.public_dir.resolve():
        print(
            f"o provedor {args.provider} grava em {paths.public_dir}, não em {out}", file=sys.stderr
        )
        return 1
    if not catalog_path.exists():
        return _report(catalog_path, ["arquivo ausente (rode o build-anime)"])
    catalog = read_json(catalog_path)
    if _report(catalog_path, validate_anime_catalog(catalog, catalog_path.read_bytes())):
        return 1
    if catalog["provider"] != args.provider:
        print(
            f"{catalog_path}: o catálogo é do provedor {catalog['provider']!r}, "
            f"não {args.provider!r}",
            file=sys.stderr,
        )
        return 1
    existing = read_json(out) if out.exists() else None
    result = generate_anime(catalog, existing, args.today, args.epoch, args.days)
    for message in [*short_pools(catalog), *result.warnings]:
        print(f"aviso: {message}", file=sys.stderr)
    for message in result.relaxations:
        print(f"afrouxamento: {message}", file=sys.stderr)
    changed = write_if_changed(out, dumps(result.schedule))
    span = f" ({result.added[0]} a {result.added[-1]})" if result.added else ""
    total = len(result.schedule["days"])
    print(f"{out}: {len(result.added)} dia(s) novo(s){span}, {total} no total", end="")
    print("" if changed else "; sem mudanças")
    return 0


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
    # Com --path, o tipo sai do conteúdo (o "kind" da agenda do Anime).
    targets = [(resolve(p), None) for p in args.path] if args.path else known_schedules()
    results = [
        code
        for code in (_check_one(path, kind, args) for path, kind in targets)
        if code is not None
    ]
    if not results:
        print("nenhuma agenda para conferir (nem aqui nem na base)")
        return 0
    return max(results)


# O gerador de cada tipo de agenda, para regerar os dias novos (ME51).
_GENERATORS: dict[str, Generator] = {"hits": generate, "anime": generate_anime}


def _is_fixture(path: Path) -> bool:
    return path.resolve().is_relative_to(provider_paths("fixture").public_dir.resolve())


def _check_one(path: Path, kind: str | None, args: argparse.Namespace) -> int | None:
    """0 = só cresceu, 1 = quebrou, None = a agenda não existe aqui nem na base. Despacha pelo
    tipo (os Hits ou o Anime): o compare e o check_dates são os mesmos; o gerador que refaz os
    dias novos, com o catálogo ao lado da agenda, é o do tipo."""
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
    if kind is None:
        kind = "anime" if current.get("kind") == "anime" else "hits"
    problems = compare(base, current)
    if args.today is not None:
        if base is None and _is_fixture(path):
            # A agenda fictícia nova pode nascer com dias passados (a do Anime, com as datas da
            # dos Hits, que o e2e usa): ninguém a joga. Depois de criada, o P44 vale para ela.
            print(f"{path}: agenda fictícia nova; o --today não vale para os dias dela")
        else:
            problems += check_dates(base, current, args.today)
    # Os dias novos precisam ser os do gerador, com o catálogo ao lado da agenda (o do mesmo PR).
    catalog_path = resolve(args.catalog) if args.catalog else path.with_name("catalog.json")
    if not problems:
        if catalog_path.exists():
            problems += regenerate_problems(
                base, current, read_json(catalog_path), _GENERATORS[kind]
            )
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

    if args.anime:
        if args.today is not None or args.artists:
            print("--anime é uma busca à parte: sem --today e sem --artists", file=sys.stderr)
            return 1
        return _fetch_anime(args)
    anime_only = (
        args.personal,
        args.out_dir,
        args.max_songs,
        args.target_per_tier,
        args.max_anime,
        args.pool_size,
        args.deadline_min,
        args.ranks_file,
    )
    if any(value is not None for value in anime_only):
        print(
            "--personal, --out-dir, --max-songs, --target-per-tier, --max-anime, --pool-size, "
            "--deadline-min e --ranks-file só valem com --anime",
            file=sys.stderr,
        )
        return 1
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


def _fetch_anime(args: argparse.Namespace) -> int:
    """Um snapshot novo do Anime (M14): sorteia, junta as fontes e casa com a Apple. O Client ID
    do MyAnimeList vem da variável MAL_CLIENT_ID (P256), nunca de um argumento (iria para o
    histórico do terminal); sem ela, o sorteio é pelas playlists do AnimeThemes. Com o
    --ranks-file (o ranking que a tarefa anime-mal do robô baixou), o sorteio e o nível do MAL
    saem do arquivo, e a variável é ignorada: nenhum pedido vai ao MAL."""
    import os

    from musicle_pipeline import fetch, fetch_anime, mal_ranking

    directory = resolve(args.out_dir) if args.out_dir else anime_paths("apple").source
    tried, resolved, official = fetch_anime.tried_and_resolved(directory)
    personal: tuple[list[int], list[int]] = ([], [])
    if args.personal:
        personal = fetch_anime.parse_personal_list(resolve(args.personal).read_text("utf-8"))
        print(f"lista pessoal: {len(personal[0])} com nota 8 ou mais, {len(personal[1])} outros")
    mal_file = None
    if args.ranks_file:
        try:
            mal_file = mal_ranking.load_ranks(resolve(args.ranks_file))
        except mal_ranking.MalError as exc:
            print(f"--ranks-file: {exc}; nada foi gravado", file=sys.stderr)
            return 1
        print(f"o ranking do MAL do --ranks-file: {len(mal_file.order)} anime(s)")
    client_id = "" if mal_file is not None else os.environ.get("MAL_CLIENT_ID", "").strip()
    import time

    from musicle_pipeline.providers.apple_anime import snapshot_id

    out = directory / f"{snapshot_id(args.fetched_at)}.json"
    if out.exists():
        print(f"{out}: já existe (outra busca no mesmo segundo); nada foi gravado", file=sys.stderr)
        return 1

    def save(partial: dict) -> None:
        # O snapshot parcial depois de cada anime, com escrita atômica: se a busca parar (a rede,
        # o Ctrl+C, o PC), rodar de novo continua, porque os animes já tentados ficam de fora.
        write_if_changed(out, dumps(partial))

    io = fetch_anime.AnimeFetch(
        mal=fetch_anime.mal_get(client_id) if client_id else None,
        mal_file=mal_file,
        sleep=time.sleep,
        log=print,
        clock=time.monotonic,
        deadline=None if args.deadline_min is None else args.deadline_min * 60,
        save=save,
    )
    try:
        snapshot = fetch_anime.fetch_anime_snapshot(
            args.fetched_at,
            fetch_anime.cached_romanizer(),
            tried,
            resolved,
            official,
            io,
            personal=personal,
            target_per_tier=18 if args.target_per_tier is None else args.target_per_tier,
            max_songs=70 if args.max_songs is None else args.max_songs,
            max_anime=400 if args.max_anime is None else args.max_anime,
            pool_size=3000 if args.pool_size is None else args.pool_size,
        )
    except fetch.FetchError as exc:
        # O snapshot parcial já foi gravado depois de cada anime (o `save`): rodar de novo continua.
        kept = f"o que já veio ficou em {out}" if out.exists() else "nada foi gravado"
        print(f"fetch --anime: {exc}; {kept}", file=sys.stderr)
        return 1
    if not snapshot["anime"]:
        # As fontes não deram nenhum anime (o AnimeThemes fora do ar, a Apple caindo no 1º): um
        # snapshot vazio entraria no catálogo e ficaria para sempre (os snapshots só crescem).
        print("fetch --anime: nenhum anime veio; nada foi gravado", file=sys.stderr)
        return 1
    write_if_changed(out, dumps(snapshot))
    themes = [t for a in snapshot["anime"] for t in a["themes"]]
    matched = sum(t["result"] == "matched" for t in themes)
    print(
        f"{out}: {len(snapshot['anime'])} anime(s), {len(themes)} tema(s), "
        f"{matched} música(s) achada(s) na Apple"
    )
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
        help="agenda a conferir; repita para várias (padrão: a fictícia e a real, dos Hits e do"
        " Anime)",
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
        "--anime", action="store_true", help="busca os animes do M14 (MAL_CLIENT_ID opcional)"
    )
    fetch.add_argument(
        "--personal", type=Path, help="com --anime, só na 1ª carga: o XML exportado do MAL"
    )
    fetch.add_argument("--out-dir", type=Path, help="com --anime: a pasta dos snapshots")
    fetch.add_argument("--max-songs", type=int, help="com --anime: para nesse total (70)")
    fetch.add_argument(
        "--target-per-tier", type=int, help="com --anime: músicas por modo e faixa (18)"
    )
    fetch.add_argument("--max-anime", type=int, help="com --anime: animes tentados (400)")
    fetch.add_argument(
        "--pool-size", type=int, help="com --anime: sorteia entre os N mais populares (3000)"
    )
    fetch.add_argument(
        "--deadline-min", type=float, help="com --anime: para e grava depois de N minutos"
    )
    fetch.add_argument(
        "--ranks-file",
        type=Path,
        help="com --anime: o ranking do MAL já baixado (o do robô); nenhum pedido ao MAL",
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

    anime = sub.add_parser("build-anime", help="gera o catálogo do Anime (M14)")
    anime.add_argument("--provider", choices=sorted(ANIME_PROVIDERS), required=True)
    anime.add_argument("--out", type=Path, help="catalog.json de saída (padrão: o do provedor)")
    anime.set_defaults(func=_build_anime)

    check_anime = sub.add_parser(
        "validate-anime", help="confere o catálogo do Anime (e a agenda ao lado, se existir)"
    )
    check_anime.add_argument("--provider", choices=sorted(ANIME_PROVIDERS), required=True)
    check_anime.add_argument("--path", type=Path, help="catalog.json (padrão: o do provedor)")
    check_anime.add_argument(
        "--schedule", type=Path, help="schedule.json (padrão: o do lado do catálogo, se existir)"
    )
    check_anime.set_defaults(func=_validate_anime)

    anime_schedule = sub.add_parser(
        "schedule-anime", help="acrescenta dias à agenda do Anime (nunca altera dia)"
    )
    anime_schedule.add_argument("--provider", choices=sorted(ANIME_PROVIDERS), required=True)
    anime_schedule.add_argument(
        "--today",
        type=date.fromisoformat,
        required=True,
        help="data de hoje em Brasília (dia anterior a ela nunca é gerado, P44)",
    )
    anime_schedule.add_argument(
        "--epoch", type=date.fromisoformat, help="diário nº 1 (agenda nova)"
    )
    anime_schedule.add_argument(
        "--days",
        type=int,
        default=HORIZON_DAYS,
        help="dias à frente de hoje (hoje e amanhã: 1; a carga de teste usa 2)",
    )
    anime_schedule.add_argument(
        "--catalog", type=Path, help="catalog.json do Anime (padrão: o do provedor)"
    )
    anime_schedule.add_argument("--out", type=Path, help="schedule.json (padrão: o do provedor)")
    anime_schedule.set_defaults(func=_schedule_anime)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except InputError as exc:
        print(f"entrada inválida:\n{exc}", file=sys.stderr)
        return 1
    except ScheduleError as exc:
        print(f"agenda: {exc}", file=sys.stderr)
        return 1
