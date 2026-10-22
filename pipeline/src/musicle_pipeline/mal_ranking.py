"""O ranking de popularidade do MyAnimeList (P256), só com a biblioteca padrão.

Serve em dois lugares:

- o `fetch --anime` (a carga, no terminal do usuário) o importa pelo `fetch_anime.py`, com o
  Client ID da variável `MAL_CLIENT_ID`;
- a tarefa `anime-mal` do robô semanal (`.github/workflows/update-catalog.yml`) o roda sozinho,
  numa máquina sem `pip install`, com o segredo `MAL_CLIENT_ID` só no ambiente desse passo:

      python -I -S pipeline/src/musicle_pipeline/mal_ranking.py --out <ranks.json>

  Pelo caminho, e não com `-m`: o `-I` ignora o `PYTHONPATH` e as outras variáveis `PYTHON*` e
  deixa a pasta do script fora do `sys.path`, e o `-S`, o `site-packages`. Na máquina do robô,
  só a biblioteca padrão é importável, e por isso este módulo não importa nada do pacote (um
  teste confere). A tarefa que gera lê o arquivo com o `fetch --anime --ranks-file`, sem o
  segredo.

O arquivo tem só o que o repositório já guarda do MAL (P254, P256): o nível de 0 a 9 de cada
anime (`mal_level`) e a ordem de popularidade, uma lista de ids do mais popular ao menos (o
sorteio só precisa da ordem). A posição bruta no ranking nunca vai para ele (P12 do PR B):

      {"levels": {"38000": 9, "5114": 9}, "order": [38000, 5114]}

O Client ID vai só no cabeçalho `X-MAL-CLIENT-ID`, que um redirecionamento não repassa: nunca na
URL, na saída, no arquivo ou numa mensagem de erro (as mensagens do `main` ainda passam pelo
`_hide`, por garantia). Um teste confere tudo isso. No robô, o ranking inteiro tem um prazo
(`RANKING_DEADLINE_SEC`), para a tarefa nunca passar dos 5 min dela.
"""

from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

MAL_RANKING_URL = "https://api.myanimelist.net/v2/anime/ranking"
MAL_PAGE = 500  # o máximo por página do ranking (a carga de teste, C1, usou 500)
POOL_SIZE = 3000  # os mais populares de todos os tempos e os do meio (P256)
PACE_SEC = 1  # o MAL não publica limite (cláusula 6: carga razoável)
TRIES = 3
# O mesmo do fetch.py (um teste confere): este módulo não pode importá-lo.
USER_AGENT = "musicle-jp-pipeline (+https://github.com/PlasmaStorm49/musicle-jp)"
TIMEOUT_SEC = 30
# Na tarefa anime-mal (main), que tem 5 min no total: um prazo para o ranking inteiro e um
# timeout menor por pedido. O pior caso (o prazo, um pedido no fim e o checkout antes) cabe nos 5.
RANKING_DEADLINE_SEC = 180
ROBOT_TIMEOUT_SEC = 20
MAX_BYTES = 5 * 1024 * 1024
# O arquivo lido pelo --ranks-file: mais que isso não é o ranking que este módulo grava.
MAX_RANKS = 20_000
_ID = re.compile(r"[1-9][0-9]{0,8}")
# A posição no ranking de popularidade do MAL → o nível de 0 a 9 (P254): o topo de todos os
# tempos é 9. Fica aqui, e não no fetch_anime, porque o arquivo da anime-mal já sai com o nível.
_MAL_RANKS = (50, 150, 300, 600, 1000, 1600, 2500, 4000, 6000)

Transport = Callable[[str], bytes]


class MalError(RuntimeError):
    """O ranking não veio, ou o arquivo dele não tem a forma esperada."""


def mal_level(rank: int) -> int:
    """1º a 50º: 9; ... ; além do 6.000º: 0."""
    return sum(rank <= limit for limit in _MAL_RANKS)


@dataclass(frozen=True)
class RankingFile:
    """O arquivo da anime-mal, lido: a ordem de popularidade (do mais popular ao menos) e o
    nível de cada anime. Sem a posição bruta (P254)."""

    order: tuple[int, ...]
    levels: Mapping[int, int]

    def draw_ranks(self) -> dict[int, int]:
        """A ordem como o sorteio a usa (o 1º vale 1, o 2º vale 2...). Não é a posição no
        ranking: o sorteio só compara, e o nível vem de `levels`."""
        return {mal_id: i + 1 for i, mal_id in enumerate(self.order)}


def mal_get(client_id: str, timeout: float = TIMEOUT_SEC) -> Transport:
    """GET no MAL com o Client ID só no cabeçalho (P256): a URL, que vai para as mensagens de
    erro, nunca o tem. O cabeçalho é "não redirecionado": um 30x para outro endereço nunca
    leva o Client ID junto."""

    def get(url: str) -> bytes:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        request.add_unredirected_header("X-MAL-CLIENT-ID", client_id)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise MalError(f"resposta maior que {MAX_BYTES} bytes: {url}")
        return body

    return get


def _never() -> bool:
    return False


def _page(
    url: str,
    get: Transport,
    sleep: Callable[[float], None],
    expired: Callable[[], bool] = _never,
) -> dict:
    """Uma página do ranking, com as repetições do 429 e do 5xx (como o `get_any` do fetch).
    Com o prazo vencido, para antes do pedido seguinte."""
    last = ""
    for attempt in range(TRIES):
        if expired():
            raise MalError(f"o prazo do ranking venceu antes de {url}")
        try:
            data = json.loads(get(url).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise MalError(f"JSON inválido em {url}: {exc}") from None
        except urllib.error.HTTPError as exc:
            # 429 (limite) e 5xx passam com o tempo; 4xx não: repetir só atrasaria o erro.
            if exc.code != 429 and exc.code < 500:
                raise MalError(f"HTTP {exc.code} em {url}") from None
            last = f"HTTP {exc.code}"
        except (
            urllib.error.URLError,
            http.client.HTTPException,
            TimeoutError,
            ConnectionError,
        ) as exc:
            last = str(exc)
        else:
            if not isinstance(data, dict):
                raise MalError(f"resposta com forma inesperada em {url}")
            return data
        if attempt + 1 < TRIES:
            sleep(5 * (attempt + 1))
    raise MalError(f"falha de rede em {url}: {last}")


def fetch_ranking(
    get: Transport,
    sleep: Callable[[float], None],
    size: int = POOL_SIZE,
    expired: Callable[[], bool] = _never,
) -> dict[int, int]:
    """O id do MAL → a posição no ranking de popularidade, dos `size` primeiros, em páginas de
    500 e com 1 s entre os pedidos. `expired` diz se o prazo venceu (o pacote não lê o relógio:
    quem chama o passa; o padrão é sem prazo)."""
    ranks: dict[int, int] = {}
    offset = 0
    while offset < size:
        if offset:
            sleep(PACE_SEC)
        limit = min(MAL_PAGE, size - offset)
        query = urlencode({"ranking_type": "bypopularity", "limit": limit, "offset": offset})
        data = _page(f"{MAL_RANKING_URL}?{query}", get, sleep, expired).get("data")
        if not isinstance(data, list) or not data:
            break
        for item in data:
            node = item.get("node") if isinstance(item, dict) else None
            ranking = item.get("ranking") if isinstance(item, dict) else None
            if not isinstance(node, dict) or not isinstance(ranking, dict):
                continue
            mal_id, rank = node.get("id"), ranking.get("rank")
            if _positive(mal_id) and _positive(rank):
                ranks.setdefault(mal_id, rank)
        offset += len(data)
    return top_ranks(ranks, size)


def _positive(value: object) -> bool:
    return type(value) is int and value >= 1


def top_ranks(ranks: Mapping[int, int], size: int) -> dict[int, int]:
    """Os `size` primeiros pela posição (o desempate pelo id), em ordem."""
    ordered = sorted(ranks.items(), key=lambda kv: (kv[1], kv[0]))
    return dict(ordered[:size])


def write_ranks(path: Path, ranks: Mapping[int, int]) -> None:
    """Grava o arquivo da anime-mal, sem a posição bruta (P254): a ordem de popularidade (os
    ids, do mais popular ao menos) e o nível de 0 a 9 de cada anime, em UTF-8 com \\n, num
    arquivo temporário trocado no fim."""
    order = list(top_ranks(ranks, len(ranks)))
    data = {
        "levels": {str(mal_id): mal_level(ranks[mal_id]) for mal_id in sorted(order)},
        "order": order,
    }
    text = json.dumps(data, separators=(",", ":")) + "\n"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(text.encode("utf-8"))
    os.replace(tmp, path)


def load_ranks(path: Path) -> RankingFile:
    """O arquivo da tarefa anime-mal → a ordem e os níveis. Ele chega de outra máquina, por um
    artefato: qualquer outra forma é recusada (ids repetidos, nível fora de 0 a 9, um id na
    ordem sem nível ou o contrário, outra chave)."""
    where = f"{path.name}: fora da forma {{levels: {{id: nível}}, order: [ids]}}"
    try:
        data = json.loads(path.read_bytes().decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MalError(f"{path.name}: não deu para ler ({type(exc).__name__})") from None
    if not isinstance(data, dict) or set(data) != {"levels", "order"}:
        raise MalError(where)
    order, levels = data["order"], data["levels"]
    if not isinstance(order, list) or not 0 < len(order) <= MAX_RANKS:
        raise MalError(f"{path.name}: esperada uma ordem com 1 a {MAX_RANKS} animes")
    if not all(_positive(m) and m < 10**9 for m in order) or len(set(order)) != len(order):
        raise MalError(where)
    if not isinstance(levels, dict) or len(levels) != len(order):
        raise MalError(where)
    parsed: dict[int, int] = {}
    for key, value in levels.items():
        if not _ID.fullmatch(key) or type(value) is not int or not 0 <= value <= 9:
            raise MalError(where)
        parsed[int(key)] = value
    if set(parsed) != set(order):
        raise MalError(where)
    return RankingFile(order=tuple(order), levels=parsed)


def _hide(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] = os.environ,
    get: Transport | None = None,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> int:
    """A tarefa anime-mal: o ranking com o prazo total e o timeout curto por pedido."""
    for stream in (sys.stdout, sys.stderr):
        with contextlib.suppress(AttributeError, ValueError):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    parser = argparse.ArgumentParser(
        prog="mal_ranking",
        description="Baixa o ranking de popularidade do MyAnimeList (o Client ID vem da variável"
        " MAL_CLIENT_ID) e grava só a ordem e o nível de 0 a 9 de cada anime, sem a posição.",
    )
    parser.add_argument("--out", type=Path, required=True, help="o JSON de saída")
    parser.add_argument(
        "--size", type=int, default=POOL_SIZE, help=f"quantos do topo ({POOL_SIZE})"
    )
    args = parser.parse_args(argv)
    if args.size < 1:
        parser.error("--size precisa ser positivo")
    client_id = environ.get("MAL_CLIENT_ID", "").strip()
    if not client_id:
        print("sem MAL_CLIENT_ID: o ranking não foi baixado (a busca segue com as fontes abertas)")
        return 0
    start = clock()

    def expired() -> bool:
        return clock() - start >= RANKING_DEADLINE_SEC

    try:
        transport = get or mal_get(client_id, ROBOT_TIMEOUT_SEC)
        ranks = fetch_ranking(transport, sleep, args.size, expired)
        if not ranks:
            raise MalError("o ranking veio vazio")
        write_ranks(args.out, ranks)
    except Exception as exc:  # qualquer falha: a mensagem passa pelo _hide
        print(
            f"ranking do MAL: {_hide(f'{type(exc).__name__}: {exc}', client_id)}; nada foi gravado",
            file=sys.stderr,
        )
        return 1
    print(f"{args.out.name}: {len(ranks)} anime(s) do ranking de popularidade do MAL")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
