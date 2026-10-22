"""O ranking do MyAnimeList (M14, PR B): o módulo só da biblioteca padrão que a tarefa anime-mal
do robô roda sozinha, e o `fetch --anime --ranks-file` que lê o arquivo dela. Sem rede."""

from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
import urllib.error
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from musicle_pipeline import fetch, mal_ranking
from musicle_pipeline import fetch_anime as fa
from musicle_pipeline.cli import main as cli_main
from musicle_pipeline.io_json import read_json
from test_fetch_anime import NOW, ROMAJI, FakeWeb

MODULE = Path(mal_ranking.__file__)
# Um valor falso, só destes testes: o Client ID de verdade nunca entra em arquivo.
FAKE_ID = "client-id-falso-de-teste-1234"


# --- só a biblioteca padrão (a máquina da anime-mal não tem o pacote nem o pip) ------------------


def test_the_module_only_imports_the_standard_library():
    tree = ast.parse(MODULE.read_text(encoding="utf-8"))
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, "import relativo puxaria o pacote"
            roots.add((node.module or "").split(".")[0])
    outside = sorted(r for r in roots if r not in sys.stdlib_module_names and r != "__future__")
    assert outside == []


def test_it_runs_isolated_by_path_without_the_secret(tmp_path):
    # Como na tarefa anime-mal: pelo caminho, com o -I e o -S. O -S tira o site-packages (onde o
    # .venv tem o pacote instalado): o módulo roda, então só precisa da biblioteca padrão. Sem a
    # variável, sai com 0 e sem arquivo.
    env = {k: v for k, v in os.environ.items() if k != "MAL_CLIENT_ID"}
    out = tmp_path / "ranks.json"
    done = subprocess.run(
        [sys.executable, "-I", "-S", str(MODULE), "--out", str(out)],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert done.returncode == 0, done.stderr
    assert "sem MAL_CLIENT_ID" in done.stdout
    assert not out.exists()


def test_the_user_agent_is_the_one_of_the_fetch():
    assert mal_ranking.USER_AGENT == fetch.USER_AGENT


# --- o Client ID só no cabeçalho -----------------------------------------------------------------


class Response:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size):
        return self.body


def ranking_page(offset: int) -> bytes:
    data = (
        [
            {"node": {"id": 5114, "title": "x"}, "ranking": {"rank": 2}},
            {"node": {"id": 38000}, "ranking": {"rank": 1}},
            {"node": {"id": "x"}, "ranking": {"rank": 3}},  # fora da forma: fica de fora
            "lixo",
        ]
        if offset == 0
        else []
    )
    return json.dumps({"data": data}).encode()


def test_the_client_id_only_goes_in_the_header(monkeypatch, tmp_path, capsys):
    sent: list = []

    def fake_urlopen(request, timeout):
        sent.append(request)
        offset = int(parse_qs(urlsplit(request.full_url).query)["offset"][0])
        return Response(ranking_page(offset))

    monkeypatch.setattr(mal_ranking.urllib.request, "urlopen", fake_urlopen)
    out = tmp_path / "ranks.json"
    code = mal_ranking.main(
        ["--out", str(out)], environ={"MAL_CLIENT_ID": FAKE_ID}, sleep=lambda _s: None
    )
    assert code == 0
    assert len(sent) == 2  # a página com os animes e a vazia, que para
    for request in sent:
        assert request.get_header("X-mal-client-id") == FAKE_ID
        assert FAKE_ID not in request.full_url
        assert "ranking_type=bypopularity" in request.full_url
    text = out.read_text(encoding="utf-8")
    assert text == '{"38000":1,"5114":2}\n'  # só id e posição, em ordem
    captured = capsys.readouterr()
    assert FAKE_ID not in captured.out + captured.err + text


def test_a_redirect_never_carries_the_client_id(monkeypatch):
    # O cabeçalho "não redirecionado": o pedido que o urllib monta para um 30x não o leva.
    sent: list = []

    def fake_urlopen(request, timeout):
        sent.append(request)
        return Response(b'{"data": []}')

    monkeypatch.setattr(mal_ranking.urllib.request, "urlopen", fake_urlopen)
    mal_ranking.mal_get(FAKE_ID)("https://api.myanimelist.net/v2/anime/ranking?offset=0")
    (request,) = sent
    assert request.unredirected_hdrs.get("X-mal-client-id") == FAKE_ID
    assert "X-mal-client-id" not in request.headers
    handler = urllib.request.HTTPRedirectHandler()
    moved = handler.redirect_request(
        request, None, 302, "Found", {}, "https://outro.example/ranking"
    )
    assert moved is not None
    assert moved.get_header("X-mal-client-id") is None
    assert FAKE_ID not in repr(moved.header_items())
    assert moved.get_header("User-agent") == mal_ranking.USER_AGENT


def test_the_robot_uses_a_short_timeout_per_request(monkeypatch, tmp_path):
    timeouts: list[float] = []

    def fake_urlopen(request, timeout):
        timeouts.append(timeout)
        return Response(b'{"data": []}')

    monkeypatch.setattr(mal_ranking.urllib.request, "urlopen", fake_urlopen)
    mal_ranking.main(
        ["--out", str(tmp_path / "r.json")],
        environ={"MAL_CLIENT_ID": FAKE_ID},
        sleep=lambda _s: None,
    )
    assert timeouts == [mal_ranking.ROBOT_TIMEOUT_SEC]


def test_the_deadline_stops_the_ranking_and_writes_nothing(tmp_path, capsys):
    # Um MAL lento: o relógio passa do prazo depois da 1ª página, e nada é gravado.
    ticks = iter([0.0, 0.0, mal_ranking.RANKING_DEADLINE_SEC + 1])
    urls: list[str] = []

    def get(url: str) -> bytes:
        urls.append(url)
        page = [{"node": {"id": 1000 + i}, "ranking": {"rank": i + 1}} for i in range(500)]
        return json.dumps({"data": page}).encode()

    out = tmp_path / "ranks.json"
    code = mal_ranking.main(
        ["--out", str(out)],
        environ={"MAL_CLIENT_ID": FAKE_ID},
        get=get,
        sleep=lambda _s: None,
        clock=lambda: next(ticks),
    )
    assert code == 1
    assert len(urls) == 1
    assert "prazo do ranking venceu" in capsys.readouterr().err
    assert not out.exists()


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError("https://x", 401, f"negado para {FAKE_ID}", None, None),
        urllib.error.URLError(f"falhou com {FAKE_ID}"),
        RuntimeError(f"inesperado {FAKE_ID}"),
    ],
)
def test_errors_never_show_the_client_id(monkeypatch, tmp_path, capsys, error):
    def fake_urlopen(request, timeout):
        raise error

    monkeypatch.setattr(mal_ranking.urllib.request, "urlopen", fake_urlopen)
    out = tmp_path / "ranks.json"
    code = mal_ranking.main(
        ["--out", str(out)], environ={"MAL_CLIENT_ID": FAKE_ID}, sleep=lambda _s: None
    )
    assert code == 1
    captured = capsys.readouterr()
    assert "nada foi gravado" in captured.err
    assert FAKE_ID not in captured.out + captured.err
    assert not out.exists()


def test_an_empty_ranking_writes_nothing(tmp_path, capsys):
    out = tmp_path / "ranks.json"
    code = mal_ranking.main(
        ["--out", str(out)],
        environ={"MAL_CLIENT_ID": FAKE_ID},
        get=lambda url: b'{"data": []}',
        sleep=lambda _s: None,
    )
    assert code == 1
    assert "veio vazio" in capsys.readouterr().err
    assert not out.exists()


def test_the_ranking_pages_and_stops_at_the_size():
    urls: list[str] = []

    def get(url: str) -> bytes:
        urls.append(url)
        offset = int(parse_qs(urlsplit(url).query)["offset"][0])
        limit = int(parse_qs(urlsplit(url).query)["limit"][0])
        page = [
            {"node": {"id": 1000 + i}, "ranking": {"rank": i + 1}}
            for i in range(offset, offset + limit)
        ]
        return json.dumps({"data": page}).encode()

    pauses: list[float] = []
    ranks = mal_ranking.fetch_ranking(get, pauses.append, size=1200)
    assert len(ranks) == 1200 and ranks[1000] == 1 and ranks[2199] == 1200
    limits = [parse_qs(urlsplit(u).query)["limit"][0] for u in urls]
    assert limits == ["500", "500", "200"]  # páginas de 500, e a última só com o que falta
    assert pauses == [1, 1]  # 1 s entre os pedidos


def test_a_429_waits_and_tries_again():
    calls = {"n": 0}

    def get(url: str) -> bytes:
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.HTTPError(url, 429, "devagar", None, None)
        return ranking_page(0) if "offset=0" in url else b'{"data": []}'

    waits: list[float] = []
    assert mal_ranking.fetch_ranking(get, waits.append, size=10) == {38000: 1, 5114: 2}
    assert waits[0] == 5


# --- o arquivo: {id do MAL: posição} -------------------------------------------------------------


def test_write_and_load_round_trip(tmp_path):
    path = tmp_path / "ranks.json"
    mal_ranking.write_ranks(path, {5114: 2, 38000: 1})
    assert path.read_bytes() == b'{"38000":1,"5114":2}\n'
    assert mal_ranking.load_ranks(path) == {38000: 1, 5114: 2}


@pytest.mark.parametrize(
    "text",
    [
        "[]",
        "{}",
        '{"x": 1}',
        '{"01": 1}',
        '{"1": true}',
        '{"1": 0}',
        '{"1": 1.5}',
        '{"1": "1"}',
        '{"1": 2000000}',
        "não é JSON",
    ],
)
def test_load_refuses_other_shapes(tmp_path, text):
    path = tmp_path / "ranks.json"
    path.write_bytes(text.encode("utf-8"))
    with pytest.raises(mal_ranking.MalError):
        mal_ranking.load_ranks(path)


def test_top_ranks_keeps_the_first_by_position():
    assert mal_ranking.top_ranks({7: 3, 5: 1, 9: 2}, 2) == {5: 1, 9: 2}


# --- o fetch --anime com o arquivo ---------------------------------------------------------------


def test_the_ranks_file_draws_and_levels_without_calling_the_mal():
    web = FakeWeb()
    io = fa.AnimeFetch(get=web.get, post=web.post, mal=None, mal_ranks={38000: 3}, apple_pace=0)
    snap = fa.fetch_anime_snapshot(
        NOW, lambda t: ROMAJI.get(t, (t,)), set(), {}, {}, io, target_per_tier=1
    )
    assert web.mal_urls == []
    assert not any("Popular" in p.get("query", "") for _, p in web.posts)  # nem o AnimeThemes
    assert snap["anime"][0]["levels"] == {"mal": 9}  # o 3º do ranking


def test_the_cli_reads_the_ranks_file_and_ignores_the_variable(monkeypatch, tmp_path, capsys):
    # Com o --ranks-file, nenhum pedido ao MAL, mesmo com a variável definida.
    monkeypatch.setenv("MAL_CLIENT_ID", FAKE_ID)
    ranks = tmp_path / "ranks.json"
    mal_ranking.write_ranks(ranks, {38000: 3})
    seen: dict = {}

    def fake_snapshot(fetched_at, romanize, tried, resolved, official, io, **kwargs):
        seen.update(mal=io.mal, mal_ranks=dict(io.mal_ranks), kwargs=kwargs)
        return {
            "provider": "apple",
            "storefront": "jp",
            "id": "2026-10-22T010000Z",
            "fetchedAt": fetched_at,
            "anime": [],
            "artists": {},
            "resolved": {},
            "tracks": {},
        }

    monkeypatch.setattr(fa, "fetch_anime_snapshot", fake_snapshot)
    monkeypatch.setattr(fa, "cached_romanizer", lambda: lambda t: (t,))
    out_dir = tmp_path / "snapshots"
    args = ["fetch", "--provider", "apple", "--anime", "--fetched-at", NOW]
    args += ["--ranks-file", str(ranks), "--out-dir", str(out_dir), "--max-songs", "12"]
    assert cli_main(args) == 0
    assert seen["mal"] is None and seen["mal_ranks"] == {38000: 3}
    assert seen["kwargs"]["max_songs"] == 12
    assert read_json(out_dir / "2026-10-22T010000Z.json")["anime"] == []
    captured = capsys.readouterr()
    assert FAKE_ID not in captured.out + captured.err


def test_the_cli_refuses_a_bad_ranks_file_before_the_network(monkeypatch, tmp_path, capsys):
    def no_network(*args, **kwargs):
        raise AssertionError("não deveria buscar")

    monkeypatch.setattr(fa, "fetch_anime_snapshot", no_network)
    bad = tmp_path / "ranks.json"
    bad.write_bytes(b'{"1": "x"}')
    args = ["fetch", "--provider", "apple", "--anime", "--fetched-at", NOW]
    assert cli_main([*args, "--ranks-file", str(bad), "--out-dir", str(tmp_path)]) == 1
    assert "--ranks-file:" in capsys.readouterr().err


def test_the_ranks_file_needs_anime(capsys):
    args = ["fetch", "--provider", "apple", "--fetched-at", NOW, "--today", "2026-10-22"]
    assert cli_main([*args, "--ranks-file", "x.json"]) == 1
    assert "--ranks-file só valem com --anime" in capsys.readouterr().err
