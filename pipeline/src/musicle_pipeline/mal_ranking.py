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

O arquivo tem o nível de 0 a 9 de cada anime (`mal_level`), o mesmo que o repositório guarda
(P254, P256), e a ordem de popularidade, uma lista de ids do mais popular ao menos (o sorteio só
precisa da ordem). O número da posição não vai para ele (o usuário, 22/10/2026), mas a ordem
equivale à posição, porque o ranking do MAL é contínuo: aceito pelo usuário, porque o arquivo só
vive no artefato de 1 dia da anime-mal e nunca entra no repositório:

      {"levels": {"38000": 9, "5114": 9}, "order": [38000, 5114]}

O Client ID vai só no cabeçalho `X-MAL-CLIENT-ID`, que um redirecionamento não repassa: nunca na
URL, na saída, no arquivo ou numa mensagem de erro (as mensagens do `main` ainda passam pelo
`_hide`, por garantia). Um teste confere tudo isso. No robô, o ranking inteiro tem um prazo
(`RANKING_DEADLINE_SEC`), para a tarefa nunca passar dos 5 min dela.

Com o `--quiz-out`, os mesmos pedidos levam os campos do quiz do dia (M18, `QUIZ_FIELDS`), e um
segundo arquivo sai na forma que o `schedule-quiz --mal-file` lê (o `load_mal` do pacote): os
gêneros, a nota, os membros, a fonte e os estúdios de cada anime. São os números brutos do MAL,
e por isso nunca vão ao repositório (P380): vivem só no artefato da anime-mal, que o robô apaga
depois do uso, ou num arquivo fora do repositório, na carga do terminal.
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
# Os ids do MAL que o arquivo aceita (até 9 dígitos): a busca descarta os outros, para um id
# estranho do MAL não invalidar o arquivo inteiro na leitura.
MAX_ID = 10**9
_ID = re.compile(r"[1-9][0-9]{0,8}")
# A posição no ranking de popularidade do MAL → o nível de 0 a 9 (P254): o topo de todos os
# tempos é 9. Fica aqui, e não no fetch_anime, porque o arquivo da anime-mal já sai com o nível.
_MAL_RANKS = (50, 150, 300, 600, 1000, 1600, 2500, 4000, 6000)
# Os campos do quiz do dia (M18), pedidos nas mesmas páginas do ranking: nenhum pedido a mais.
QUIZ_FIELDS = "genres,mean,num_list_users,source,studios"
QUIZ_SCHEMA = 1  # o schemaVersion que o load_mal do pacote exige
# Com o --quiz-out, o padrão é a escala inteira do nível (a do MAL_LEVEL_SIZE do fetch_anime): o
# acervo do Anime vai além dos 3.000 do sorteio, que o --pool-size da busca ainda corta.
QUIZ_SIZE = 6000
# A raiz do repositório (este arquivo fica em pipeline/src/musicle_pipeline/): os dois arquivos
# têm números do MAL e nunca são gravados dentro dela (P254, P380).
REPO_ROOT = Path(__file__).resolve().parents[3]

Transport = Callable[[str], bytes]


class MalError(RuntimeError):
    """O ranking não veio, ou o arquivo dele não tem a forma esperada."""


def mal_level(rank: int) -> int:
    """1º a 50º: 9; ... ; além do 6.000º: 0."""
    return sum(rank <= limit for limit in _MAL_RANKS)


@dataclass(frozen=True)
class RankingFile:
    """O arquivo da anime-mal, lido: a ordem de popularidade (do mais popular ao menos) e o
    nível de cada anime. Sem o número da posição (P254)."""

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
    quiz: dict[int, dict] | None = None,
) -> dict[int, int]:
    """O id do MAL → a posição no ranking de popularidade, dos `size` primeiros, em páginas de
    500 e com 1 s entre os pedidos. `expired` diz se o prazo venceu (o pacote não lê o relógio:
    quem chama o passa; o padrão é sem prazo). Com o `quiz`, os pedidos levam os campos do quiz
    do dia, e ele recebe os dados de cada anime (`quiz_entry`)."""
    ranks: dict[int, int] = {}
    offset = 0
    while offset < size:
        if offset:
            sleep(PACE_SEC)
        limit = min(MAL_PAGE, size - offset)
        params: dict[str, object] = {
            "ranking_type": "bypopularity",
            "limit": limit,
            "offset": offset,
        }
        if quiz is not None:
            params["fields"] = QUIZ_FIELDS
        data = _page(f"{MAL_RANKING_URL}?{urlencode(params)}", get, sleep, expired).get("data")
        if not isinstance(data, list) or not data:
            break
        for item in data:
            node = item.get("node") if isinstance(item, dict) else None
            ranking = item.get("ranking") if isinstance(item, dict) else None
            if not isinstance(node, dict) or not isinstance(ranking, dict):
                continue
            mal_id, rank = node.get("id"), ranking.get("rank")
            if _positive(mal_id) and mal_id < MAX_ID and _positive(rank):
                ranks.setdefault(mal_id, rank)
                if quiz is not None:
                    quiz.setdefault(mal_id, quiz_entry(node))
        offset += len(data)
    return top_ranks(ranks, size)


def _names(value: object) -> list[str]:
    """Os nomes de uma lista do MAL (`[{"id", "name"}]`), na ordem, sem os vazios nem os
    repetidos."""
    names: list[str] = []
    for item in value if isinstance(value, list) else []:
        name = item.get("name") if isinstance(item, dict) else None
        if isinstance(name, str) and name.strip() and name not in names:
            names.append(name)
    return names


def quiz_entry(node: Mapping[str, object]) -> dict:
    """Os dados do quiz de um anime do ranking, na forma do `load_mal` do pacote. O campo que o
    MAL não traz, ou traz fora da forma, fica de fora: os gêneros e os estúdios ausentes são "não
    sei" (a música sai da pergunta), e não "não tem"; a nota fora de 0 a 10 (o NaN e o infinito
    também, porque falham na comparação) não entra."""
    entry: dict = {}
    for field in ("genres", "studios"):
        if isinstance(node.get(field), list):
            entry[field] = _names(node.get(field))
    mean, members, source = node.get("mean"), node.get("num_list_users"), node.get("source")
    # A faixa antes de qualquer conta: um inteiro enorme não vira float (o isfinite estouraria).
    if type(mean) in (int, float) and 0 <= mean <= 10:
        entry["mean"] = mean
    if type(members) is int and members >= 0:
        entry["members"] = members
    if isinstance(source, str) and source.strip():
        entry["source"] = source
    return entry


def _positive(value: object) -> bool:
    return type(value) is int and value >= 1


def top_ranks(ranks: Mapping[int, int], size: int) -> dict[int, int]:
    """Os `size` primeiros pela posição (o desempate pelo id), em ordem."""
    ordered = sorted(ranks.items(), key=lambda kv: (kv[1], kv[0]))
    return dict(ordered[:size])


def write_ranks(path: Path, ranks: Mapping[int, int]) -> None:
    """Grava o arquivo da anime-mal, sem o número da posição (P254): a ordem de popularidade (os
    ids, do mais popular ao menos) e o nível de 0 a 9 de cada anime, em UTF-8 com \\n, num
    arquivo temporário trocado no fim."""
    order = list(top_ranks(ranks, len(ranks)))
    data = {
        "levels": {str(mal_id): mal_level(ranks[mal_id]) for mal_id in sorted(order)},
        "order": order,
    }
    text = json.dumps(data, separators=(",", ":")) + "\n"
    _write(path, text)


def write_quiz(path: Path, quiz: Mapping[int, dict]) -> None:
    """Grava os dados do quiz do dia (M18) na forma que o `schedule-quiz --mal-file` lê:
    `{"schemaVersion": 1, "anime": {"<id>": {genres, mean, members, source, studios}}}`."""
    data = {"schemaVersion": QUIZ_SCHEMA, "anime": {str(m): quiz[m] for m in sorted(quiz)}}
    _write(path, json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


def _write(path: Path, text: str) -> None:
    """Em UTF-8 com \\n, num arquivo temporário trocado no fim."""
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
    if not all(_positive(m) and m < MAX_ID for m in order) or len(set(order)) != len(order):
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
        "--size",
        type=int,
        help=f"quantos do topo ({POOL_SIZE}; com o --quiz-out, {QUIZ_SIZE})",
    )
    parser.add_argument(
        "--quiz-out",
        type=Path,
        help="os dados do quiz do dia (M18) de cada anime, nos mesmos pedidos; nunca no Git",
    )
    args = parser.parse_args(argv)
    if args.size is None:
        args.size = QUIZ_SIZE if args.quiz_out is not None else POOL_SIZE
    if args.size < 1:
        parser.error("--size precisa ser positivo")
    for path in (p for p in (args.out, args.quiz_out) if p is not None):
        if path.resolve().is_relative_to(REPO_ROOT):
            parser.error(f"{path}: dentro do repositório; os números do MAL nunca vão a ele (P380)")
    client_id = environ.get("MAL_CLIENT_ID", "").strip()
    if not client_id:
        print("sem MAL_CLIENT_ID: o ranking não foi baixado (a busca segue com as fontes abertas)")
        return 0
    start = clock()

    def expired() -> bool:
        return clock() - start >= RANKING_DEADLINE_SEC

    quiz: dict[int, dict] | None = {} if args.quiz_out is not None else None
    wrote_quiz = False
    try:
        transport = get or mal_get(client_id, ROBOT_TIMEOUT_SEC)
        ranks = fetch_ranking(transport, sleep, args.size, expired, quiz)
        if not ranks:
            raise MalError("o ranking veio vazio")
        # O do quiz antes: o ranks.json é o sinal de pronto (a anime-mal só segue com ele), e um
        # erro depois do 1º apaga o do quiz, para nada ficar pela metade.
        if quiz is not None:
            write_quiz(args.quiz_out, {m: quiz[m] for m in ranks if m in quiz})
            wrote_quiz = True
        write_ranks(args.out, ranks)
    except Exception as exc:  # qualquer falha: a mensagem passa pelo _hide
        if wrote_quiz:
            with contextlib.suppress(OSError):
                args.quiz_out.unlink()
        print(
            f"ranking do MAL: {_hide(f'{type(exc).__name__}: {exc}', client_id)}; nada foi gravado",
            file=sys.stderr,
        )
        return 1
    print(f"{args.out.name}: {len(ranks)} anime(s) do ranking de popularidade do MAL")
    if quiz is not None:
        print(f"{args.quiz_out.name}: os dados do quiz do dia de {len(ranks)} anime(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
