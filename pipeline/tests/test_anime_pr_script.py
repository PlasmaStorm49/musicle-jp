"""Testes da conferência do Anime na tarefa catalog-pr (`.github/scripts/check-anime-pr.sh`) e
do passo que junta os Hits e o Anime no mesmo PR (`catalog-pr.sh`), M14, PR B.

Os dois rodam com o token de escrita por perto e só usam jq e coreutils. As agendas do Anime
destes testes são montadas em relação ao "hoje" deles (o dos testes dos Hits), sem copiar a
agenda real, que o robô faz crescer; o catálogo é o real, com os snapshots trocados por um
sintético. Sem bash e jq (o Windows de desenvolvimento), pulam; a CI tem os dois e roda todos.
"""

from __future__ import annotations

import copy
import os
import shutil
import subprocess
from datetime import date, timedelta
from pathlib import Path

import pytest

import test_catalog_pr_script as hits
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import JSON
from musicle_pipeline.paths import repo_root

SCRIPTS = repo_root() / ".github" / "scripts"
BASH = shutil.which("bash")
JQ = shutil.which("jq")
# Na CI (CI=true) não pula: sem o jq, a proteção da tarefa com token não pode sumir calada.
pytestmark = pytest.mark.skipif(
    not (BASH and JQ) and not os.environ.get("CI"), reason="precisa de bash e jq (a CI tem)"
)

TODAY = hits.TODAY
T = date.fromisoformat(TODAY)
ANIME = {
    "ANIME_SNAPSHOTS": "pipeline/data/apple/anime/snapshots",
    "ANIME_CATALOG": "web/public/data/anime/catalog.json",
    "ANIME_SCHEDULE": "web/public/data/anime/schedule.json",
    "ANIME_FIXTURE_CATALOG": "web/public/fixtures/anime/catalog.json",
    "ANIME_FIXTURE_SCHEDULE": "web/public/fixtures/anime/schedule.json",
    "ANIME_MIXED": "web/public/data/anime/mixed.json",
    "ANIME_FIXTURE_MIXED": "web/public/fixtures/anime/mixed.json",
    "ANIME_QUIZ": "web/public/data/anime/quiz",
    "ANIME_FIXTURE_QUIZ": "web/public/fixtures/anime/quiz",
}
CATALOG = ANIME["ANIME_CATALOG"]
SCHEDULE = ANIME["ANIME_SCHEDULE"]
FIXTURE_SCHEDULE = ANIME["ANIME_FIXTURE_SCHEDULE"]
MIXED = ANIME["ANIME_MIXED"]
FIXTURE_MIXED = ANIME["ANIME_FIXTURE_MIXED"]
NOW = f"{TODAY}T12:00:00Z"  # 09:00 em Brasília: o mesmo dia
SNAP_ID = f"{TODAY}T120000Z"
SNAPSHOT = f"{ANIME['ANIME_SNAPSHOTS']}/{SNAP_ID}.json"
OLD = (T - timedelta(days=14)).isoformat()
OLD_ID, OLD_AT = f"{OLD}T000000Z", f"{OLD}T00:00:00Z"
NEW_VERSION = f"{TODAY}.deadbeef"
TIERS = ("facil", "medio", "dificil")
RUN_URL = "https://github.com/x/y/actions/runs/1"


def iso(days: int) -> str:
    return (T + timedelta(days=days)).isoformat()


def base_catalog() -> JSON:
    """O catálogo real do Anime como a "main", com um snapshot sintético (anterior a hoje)."""
    cat = copy.deepcopy(read_json(repo_root() / CATALOG))
    cat["snapshots"] = [{"id": OLD_ID, "fetchedAt": OLD_AT}]
    cat["generatedAt"] = OLD_AT
    return cat


def new_catalog(snap_id: str = SNAP_ID, fetched_at: str = NOW) -> JSON:
    """O da main com a busca de agora no fim e uma faixa nova."""
    cat = base_catalog()
    cat["snapshots"].append({"id": snap_id, "fetchedAt": fetched_at})
    cat["generatedAt"] = fetched_at
    cat["catalogVersion"] = NEW_VERSION
    cat["tracks"].append({**cat["tracks"][0], "id": "apple:tr:999999999"})
    return cat


def fixture_catalog() -> JSON:
    return read_json(repo_root() / ANIME["ANIME_FIXTURE_CATALOG"])


def day(catalog: JSON, number: int) -> JSON:
    rounds = [{"answer": t["id"]} for t in catalog["tracks"][:3]]
    return {
        "number": number,
        "catalogVersion": catalog["catalogVersion"],
        "musica": {tier: copy.deepcopy(rounds) for tier in TIERS},
        "titulo": {tier: copy.deepcopy(rounds) for tier in TIERS},
    }


def schedule(catalog: JSON, last: int, count: int = 40) -> JSON:
    """Uma agenda do Anime com `count` dias até hoje + `last`."""
    first = T + timedelta(days=last - count + 1)
    return {
        "schemaVersion": 1,
        "kind": "anime",
        "timezone": "America/Sao_Paulo",
        "epoch": first.isoformat(),
        "days": {
            (first + timedelta(days=i)).isoformat(): day(catalog, i + 1) for i in range(count)
        },
    }


def new_days(base: JSON, until: int, today: str = TODAY) -> list[str]:
    """Os dias que a geração acrescentaria até hoje + `until`: do seguinte ao fim, ou de hoje."""
    start = max(
        date.fromisoformat(max(base["days"])) + timedelta(days=1), date.fromisoformat(today)
    )
    end = T + timedelta(days=until)
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def grown(base: JSON, catalog: JSON, days: list[str]) -> JSON:
    new = copy.deepcopy(base)
    count = len(new["days"])
    for i, d in enumerate(days):
        new["days"][d] = day(catalog, count + i + 1)
    return new


def main_files(ahead: int = 14, fixture_ahead: int = 10) -> dict[str, JSON]:
    """A main: a agenda do Anime com `ahead` dias depois de hoje (14 numa semana normal)."""
    return {
        CATALOG: base_catalog(),
        SCHEDULE: schedule(base_catalog(), ahead),
        ANIME["ANIME_FIXTURE_CATALOG"]: fixture_catalog(),
        FIXTURE_SCHEDULE: schedule(fixture_catalog(), fixture_ahead),
    }


def new_snapshot(snap_id: str = SNAP_ID, fetched_at: str = NOW) -> JSON:
    return {
        "provider": "apple",
        "storefront": "jp",
        "id": snap_id,
        "fetchedAt": fetched_at,
        "anime": [{"malId": 1, "themes": [{"result": "matched"}, {"result": "no-match"}]}],
        "artists": {},
        "resolved": {},
        "tracks": {},
    }


def full_change(main: dict[str, JSON] | None = None, until: int = 28) -> dict[str, JSON]:
    """Uma semana de geração: a busca, o catálogo e as duas agendas até hoje + 28."""
    main = main or main_files()
    return {
        SNAPSHOT: new_snapshot(),
        CATALOG: new_catalog(),
        SCHEDULE: grown(main[SCHEDULE], new_catalog(), new_days(main[SCHEDULE], until)),
        FIXTURE_SCHEDULE: grown(
            main[FIXTURE_SCHEDULE], fixture_catalog(), new_days(main[FIXTURE_SCHEDULE], until)
        ),
    }


def schedules_only(main: dict[str, JSON] | None = None, until: int = 28) -> dict[str, JSON]:
    """Sem a busca: as duas agendas crescem com o acervo de antes."""
    main = main or main_files()
    return {
        SCHEDULE: grown(main[SCHEDULE], base_catalog(), new_days(main[SCHEDULE], until)),
        FIXTURE_SCHEDULE: grown(
            main[FIXTURE_SCHEDULE], fixture_catalog(), new_days(main[FIXTURE_SCHEDULE], until)
        ),
    }


def write(path: Path, data: JSON | str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((data if isinstance(data, str) else dumps(data)).encode("utf-8"))


def setup_anime(
    repo: Path,
    temp: Path,
    changes: dict[str, JSON],
    main: dict[str, JSON] | None,
    *,
    declared: list[str] | None = None,
    extra_files: dict[str, str] | None = None,
    avisos: str | None = None,
    main_snapshots: tuple[str, ...] = (OLD_ID,),
) -> None:
    for path, data in (main or main_files()).items():
        write(repo / path, data)
    (repo / ANIME["ANIME_SNAPSHOTS"]).mkdir(parents=True, exist_ok=True)
    for snap in main_snapshots:
        write(repo / ANIME["ANIME_SNAPSHOTS"] / f"{snap}.json", "{}\n")
    art = temp / "anime-artifact"
    (art / "files").mkdir(parents=True, exist_ok=True)
    for path, data in changes.items():
        write(art / "files" / path, data)
    for path, text in (extra_files or {}).items():
        write(art / "files" / path, text)
    if avisos is not None:
        write(art / "avisos.txt", avisos)
    listed = declared if declared is not None else list(changes)
    write(art / "changed.txt", "".join(f"{p}\n" for p in listed))


def anime_env(
    temp: Path, today: str, generated: str | None, fetch: str, songs: str
) -> dict[str, str]:
    return {
        **ANIME,
        "TODAY": today,
        "ANIME_GENERATED_TODAY": today if generated is None else generated,
        "ANIME_FETCH": fetch,
        "ANIME_SONGS": songs,
        "RUNNER_TEMP": str(temp),
        "GITHUB_OUTPUT": str(temp / "github-output"),
    }


def run(
    tmp_path: Path,
    changes: dict[str, JSON],
    main: dict[str, JSON] | None = None,
    *,
    today: str = TODAY,
    generated: str | None = None,
    fetch: str = "success",
    songs: str = "success",
    **setup: object,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    """Monta a main e o artefato do Anime e roda o check-anime-pr.sh."""
    repo, temp = tmp_path / "repo", tmp_path / "runner"
    temp.mkdir(parents=True, exist_ok=True)
    (temp / "github-output").write_bytes(b"")
    setup_anime(repo, temp, changes, main, **setup)  # type: ignore[arg-type]
    env = {**os.environ, **anime_env(temp, today, generated, fetch, songs)}
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / "check-anime-pr.sh")],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return done, repo, temp


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def section(temp: Path) -> str:
    return read(temp / "anime-section.md")


def rejects(tmp_path: Path, changes: dict[str, JSON], message: str, **kwargs: object) -> None:
    done, repo, temp = run(tmp_path, changes, **kwargs)  # type: ignore[arg-type]
    assert done.returncode == 1, done.stdout + done.stderr
    assert message in done.stdout
    assert not (temp / "anime-section.md").exists()
    # O script só confere: nada do artefato entra na árvore (quem copia é o catalog-pr.sh).
    snap = repo / SNAPSHOT
    assert not snap.exists() or read(snap) == "{}\n"  # só o da main, quando o teste o põe lá


# --- check-anime-pr.sh ---------------------------------------------------------------------------


def test_a_full_anime_run_passes_without_touching_the_tree(tmp_path):
    changes = full_change()
    done, repo, temp = run(tmp_path, changes)
    assert done.returncode == 0, done.stdout + done.stderr
    text = section(temp)
    assert (
        "- **Busca do Anime de hoje:** 1 anime(s) tentado(s), 2 tema(s), 1 achado(s) na Apple;"
        " **1 música(s) nova(s)** no acervo" in text
    )
    assert f"- **Agenda do Anime:** 14 dia(s) novo(s), de {iso(15)} a {iso(28)}" in text
    assert f"(a da main vai até {iso(14)})" in text
    assert "- **Agenda fictícia do Anime (só desenvolvimento):** 18 dia(s) novo(s)" in text
    assert "Atenção" not in text
    output = read(temp / "github-output")
    assert f"title=chore: Anime de {TODAY} (agenda até {iso(28)})" in output
    assert f"suffix=e Anime (agenda até {iso(28)})" in output
    assert not (repo / SNAPSHOT).exists()
    assert read_json(repo / CATALOG) == base_catalog()


def test_only_the_schedules_when_the_search_failed(tmp_path):
    done, _, temp = run(tmp_path, schedules_only(), fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "- **Busca do Anime:** falhou hoje" in section(temp)


def test_a_search_that_broke_the_catalog_brings_only_the_schedules(tmp_path):
    done, _, temp = run(tmp_path, schedules_only(), songs="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "quebrou o acervo ou a agenda" in section(temp)


def test_a_search_that_stopped_with_an_error_keeps_what_it_saved(tmp_path):
    done, _, temp = run(tmp_path, full_change(), fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "A busca parou com erro" in section(temp)


def test_a_search_left_out_cannot_bring_its_snapshot(tmp_path):
    rejects(tmp_path, full_change(), "ANIME_SONGS=failure", songs="failure")


def test_the_fixture_schedule_is_optional(tmp_path):
    changes = full_change()
    del changes[FIXTURE_SCHEDULE]
    done, _, temp = run(tmp_path, changes)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "Agenda fictícia" not in section(temp)


def test_accepts_new_days_up_to_today_plus_35(tmp_path):
    done, _, _ = run(tmp_path, full_change(until=35))
    assert done.returncode == 0, done.stdout + done.stderr


# --- só quando a main precisava (P237) e no dia certo (ME44) ---


def test_rejects_when_the_main_already_had_21_days(tmp_path):
    main = main_files(ahead=21)
    rejects(tmp_path, full_change(main), "já tem 21 dia(s) à frente", main=main)


def test_rejects_without_the_main_schedule(tmp_path):
    main = main_files()
    changes = full_change(main)
    del main[SCHEDULE]
    rejects(tmp_path, changes, "a main não tem a agenda do Anime", main=main)


def test_rejects_a_generation_day_that_is_not_today(tmp_path):
    rejects(tmp_path, full_change(), "a tarefa do Anime gerou para outro dia", generated=iso(1))


def test_rejects_an_odd_today(tmp_path):
    rejects(tmp_path, full_change(), "data inválida", today=f"{TODAY}; rm -rf /")


# --- a lista fechada e o artefato ---


@pytest.mark.parametrize(
    ("path", "message"),
    [
        ("web/public/data/schedule.json", "fora da lista fechada do Anime"),  # um arquivo dos Hits
        ("pipeline/data/apple/anime/romaji.json", "fora da lista fechada do Anime"),
        (".github/workflows/ci.yml", "fora da lista fechada do Anime"),
        (f"{ANIME['ANIME_SNAPSHOTS']}/x/{SNAP_ID}.json", "nome fora do formato"),
        (f"{ANIME['ANIME_SNAPSHOTS']}/{TODAY}T1200Z.json", "nome fora do formato"),
        (f"{ANIME['ANIME_SNAPSHOTS']}/../{SNAP_ID}.json", "nome fora do formato"),
    ],
)
def test_rejects_a_path_outside_the_closed_list(tmp_path, path, message):
    changes = full_change()
    changes[path] = {"x": 1}
    rejects(tmp_path, changes, message)


def test_rejects_two_snapshots(tmp_path):
    changes = full_change()
    changes[f"{ANIME['ANIME_SNAPSHOTS']}/{TODAY}T130000Z.json"] = new_snapshot()
    rejects(tmp_path, changes, "mais de um snapshot")


def test_rejects_a_file_that_was_not_declared(tmp_path):
    changes = full_change()
    declared = [p for p in changes if p != FIXTURE_SCHEDULE]
    rejects(tmp_path, changes, "não batem com a lista declarada", declared=declared)


def test_rejects_a_declared_file_that_did_not_come(tmp_path):
    changes = full_change()
    declared = list(changes)
    del changes[FIXTURE_SCHEDULE]
    rejects(tmp_path, changes, "não batem com a lista declarada", declared=declared)


def test_rejects_an_artifact_without_the_real_schedule(tmp_path):
    changes = full_change()
    del changes[SCHEDULE]
    rejects(tmp_path, changes, "não traz a agenda real")


def test_rejects_a_file_with_two_json_documents(tmp_path):
    changes = full_change()
    catalog = changes.pop(CATALOG)
    rejects(
        tmp_path,
        changes,
        "precisa ser um JSON só",
        declared=[*changes, CATALOG],
        extra_files={CATALOG: dumps(catalog) + dumps(catalog)},
    )


def test_rejects_a_symlink(tmp_path):
    if os.name == "nt":
        pytest.skip("link simbólico no Windows pede permissão")
    changes = full_change()
    repo, temp = tmp_path / "repo", tmp_path / "runner"
    temp.mkdir()
    (temp / "github-output").write_bytes(b"")
    setup_anime(repo, temp, changes, None)
    (temp / "anime-artifact" / "files" / "web" / "link").symlink_to("/etc/passwd")
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / "check-anime-pr.sh")],
        cwd=repo,
        env={**os.environ, **anime_env(temp, TODAY, None, "success", "success")},
        capture_output=True,
        text=True,
    )
    assert done.returncode == 1
    assert "não é arquivo comum" in done.stdout


# --- o snapshot ---


def test_rejects_a_snapshot_that_already_exists_in_main(tmp_path):
    rejects(tmp_path, full_change(), "já existe na main", main_snapshots=(OLD_ID, SNAP_ID))


def test_rejects_a_snapshot_not_after_the_last_in_main(tmp_path):
    later = f"{TODAY}T130000Z"
    rejects(tmp_path, full_change(), "não vem depois do último da main", main_snapshots=(later,))


@pytest.mark.parametrize(
    ("snap_id", "fetched_at"),
    [
        (f"{iso(-1)}T120000Z", f"{iso(-1)}T12:00:00Z"),  # ontem
        pytest.param(
            f"{TODAY}T023000Z",
            f"{TODAY}T02:30:00Z",  # 23:30 de ontem em Brasília
            # O date do Git Bash ignora o TZ (mostra UTC); o do Linux da CI tem o fuso.
            marks=pytest.mark.skipif(os.name == "nt", reason="o date do Git Bash ignora o TZ"),
        ),
    ],
)
def test_rejects_a_snapshot_that_is_not_from_today_in_brasilia(tmp_path, snap_id, fetched_at):
    main = main_files()
    changes = full_change(main)
    path = f"{ANIME['ANIME_SNAPSHOTS']}/{snap_id}.json"
    changes[path] = new_snapshot(snap_id, fetched_at)
    del changes[SNAPSHOT]
    changes[CATALOG] = new_catalog(snap_id, fetched_at)
    rejects(tmp_path, changes, "não é de hoje em Brasília", main=main)


def test_rejects_a_snapshot_with_an_impossible_time(tmp_path):
    snap_id = f"{TODAY}T996100Z"
    changes = full_change()
    changes[f"{ANIME['ANIME_SNAPSHOTS']}/{snap_id}.json"] = changes.pop(SNAPSHOT)
    rejects(tmp_path, changes, "hora impossível")


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("segredo", "x"),  # chave fora das 8 do snapshot
        ("provider", "fixture"),
        ("fetchedAt", f"{TODAY}T12:00:01Z"),  # não bate com o id
        ("anime", {}),
    ],
)
def test_rejects_a_snapshot_out_of_shape(tmp_path, key, value):
    changes = full_change()
    changes[SNAPSHOT][key] = value
    rejects(tmp_path, changes, "snapshot do Anime fora da forma esperada")


def test_rejects_a_snapshot_over_the_size_cap(tmp_path):
    changes = full_change()
    changes[SNAPSHOT]["tracks"] = {"1": {"trackName": "x" * (2 * 1024 * 1024)}}
    rejects(tmp_path, changes, "passa de")


def test_rejects_a_snapshot_without_a_catalog(tmp_path):
    changes = full_change()
    del changes[CATALOG]
    rejects(tmp_path, changes, "snapshot do Anime novo sem catálogo novo")


# --- o catálogo ---


def test_rejects_a_catalog_change_without_a_search(tmp_path):
    changes = full_change()
    del changes[SNAPSHOT]
    rejects(tmp_path, changes, "o catálogo do Anime mudou sem busca nova")


@pytest.mark.parametrize("kind", ["tracks", "albums", "artists", "franchises"])
def test_rejects_a_catalog_that_loses_an_id(tmp_path, kind):
    changes = full_change()
    changes[CATALOG][kind] = changes[CATALOG][kind][1:]
    rejects(tmp_path, changes, "perde ids")


@pytest.mark.parametrize(
    ("where", "url"),
    [
        ("preview", "https://evil.test/a.m4a"),
        ("preview", "javascript:alert(1)"),
        ("store", "https://music.apple.com.evil.test/x"),
        ("store", "https://music.apple.com/jp/song/1\njavascript:alert(1)"),
        ("artwork", "http://is1-ssl.mzstatic.com/a.jpg"),
    ],
)
def test_rejects_urls_outside_the_apple_hosts(tmp_path, where, url):
    changes = full_change()
    catalog = changes[CATALOG]
    if where == "preview":
        catalog["tracks"][0]["preview"] = {"durationSec": 30, "startSec": 0, "url": url}
    elif where == "store":
        catalog["tracks"][0]["storeUrl"] = url
    else:
        catalog["albums"][0]["artworkUrl"] = url
    rejects(tmp_path, changes, "hosts da Apple")


def test_rejects_another_schema_version(tmp_path):
    changes = full_change()
    changes[CATALOG]["schemaVersion"] = 2
    rejects(tmp_path, changes, "muda o esquema")


@pytest.mark.parametrize("what", ["old", "last", "generated"])
def test_rejects_a_catalog_that_does_not_match_the_snapshots(tmp_path, what):
    changes = full_change()
    catalog = changes[CATALOG]
    if what == "old":
        catalog["snapshots"][0]["fetchedAt"] = f"{OLD}T00:00:01Z"
    elif what == "last":
        catalog["snapshots"][-1]["fetchedAt"] = f"{TODAY}T12:00:01Z"
    else:
        catalog["generatedAt"] = OLD_AT
    rejects(tmp_path, changes, "não bate com os snapshots")


# --- as agendas ---


def test_rejects_a_schedule_that_changes_an_old_day(tmp_path):
    changes = full_change()
    first = min(changes[SCHEDULE]["days"])
    changes[SCHEDULE]["days"][first]["number"] = 999
    rejects(tmp_path, changes, "altera o que já existe")


def test_rejects_a_schedule_with_another_header(tmp_path):
    changes = full_change()
    changes[FIXTURE_SCHEDULE]["epoch"] = iso(-100)
    rejects(tmp_path, changes, "altera o que já existe")


def test_rejects_an_answer_outside_the_catalog(tmp_path):
    changes = full_change()
    changes[SCHEDULE]["days"][iso(20)]["titulo"]["medio"][1]["answer"] = "apple:tr:1"
    rejects(tmp_path, changes, "cita faixa fora do catálogo")


def test_rejects_new_days_with_another_catalog_version(tmp_path):
    changes = full_change()
    changes[SCHEDULE]["days"][iso(20)]["catalogVersion"] = "2026-01-01.00000000"
    rejects(tmp_path, changes, "cita faixa fora do catálogo")


def test_rejects_a_gap_between_new_days(tmp_path):
    main = main_files()
    changes = full_change(main)
    days = new_days(main[SCHEDULE], 28)
    changes[SCHEDULE] = grown(main[SCHEDULE], new_catalog(), days[:3] + days[4:])
    rejects(tmp_path, changes, "buraco entre os dias novos", main=main)


def test_rejects_new_days_that_skip_the_expected_first(tmp_path):
    main = main_files()
    changes = full_change(main)
    changes[SCHEDULE] = grown(main[SCHEDULE], new_catalog(), new_days(main[SCHEDULE], 28)[1:])
    rejects(tmp_path, changes, "o 1º dia novo deveria ser", main=main)


def test_rejects_new_days_beyond_today_plus_35(tmp_path):
    rejects(tmp_path, full_change(until=36), "passa de hoje + 35")


def test_warns_about_the_gap_when_the_schedule_ran_out(tmp_path):
    main = main_files(ahead=-4)
    done, _, temp = run(tmp_path, full_change(main), main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    assert (
        f"> **Atenção (Agenda do Anime):** 3 dia(s) ficaram sem diário depois de {iso(-4)}"
        in section(temp)
    )


def test_warns_to_merge_today_when_the_schedule_ended_yesterday(tmp_path):
    main = main_files(ahead=-1)
    done, _, temp = run(tmp_path, full_change(main), main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "> **Atenção (Agenda do Anime):** a agenda acabou ontem" in section(temp)


def test_the_warnings_go_to_a_code_block(tmp_path):
    avisos = "aviso: musica facil: 11 música(s)\nafrouxamento: x ~~~ @alguém\n"
    done, _, temp = run(tmp_path, full_change(), avisos=avisos)
    assert done.returncode == 0, done.stdout + done.stderr
    text = section(temp)
    assert "(2 sem repetir; até 50 aqui)" in text
    assert "afrouxamento: x --- @alguém" in text
    assert text.count("~~~") == 2


def test_the_warnings_are_capped_in_lines_and_characters(tmp_path):
    # O corpo do PR nunca chega perto do limite do GitHub (65.536 caracteres): até 50 linhas de
    # até 300 caracteres, cortadas por caractere (o japonês não se parte), sem controle.
    long = "aviso: \x1b" + "長" * 1000
    avisos = "".join(f"{long}\n" for _ in range(80)) + "aviso: depois do corte\n"
    done, _, temp = run(tmp_path, full_change(), avisos=avisos)
    assert done.returncode == 0, done.stdout + done.stderr
    text = section(temp)
    block = text.split("~~~text\n")[1].split("\n~~~")[0].splitlines()
    assert len(block) == 50
    assert block[0] == "aviso: " + "長" * 292  # 300 caracteres, menos o de controle
    assert "\x1b" not in text and "depois do corte" not in text
    assert "(81 sem repetir; até 50 aqui)" in text
    assert len(text) < 20_000


def test_rejects_a_path_with_a_control_character_without_echoing_it(tmp_path):
    changes = full_change()
    odd = f"{CATALOG}\x1b]8;;evil"
    done, _, _ = run(tmp_path, changes, declared=[*changes, odd])
    assert done.returncode == 1
    assert "caractere de controle" in done.stdout
    assert "evil" not in done.stdout and "\x1b" not in done.stdout


# --- as recusas que faltavam (revisão do PR B) ---


def test_rejects_an_empty_changed_list(tmp_path):
    rejects(tmp_path, full_change(), "sem arquivos", declared=[])


def test_rejects_an_artifact_without_files(tmp_path):
    changes = full_change()
    repo, temp = tmp_path / "repo", tmp_path / "runner"
    temp.mkdir()
    (temp / "github-output").write_bytes(b"")
    setup_anime(repo, temp, changes, None)
    shutil.rmtree(temp / "anime-artifact" / "files")
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / "check-anime-pr.sh")],
        cwd=repo,
        env={**os.environ, **anime_env(temp, TODAY, None, "success", "success")},
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert done.returncode == 1
    assert "sem files/" in done.stdout


def test_rejects_a_snapshot_whose_id_is_not_the_file_name(tmp_path):
    changes = full_change()
    changes[SNAPSHOT]["id"] = f"{TODAY}T120001Z"
    rejects(tmp_path, changes, "snapshot do Anime fora da forma esperada")


def test_rejects_a_catalog_over_5_mb(tmp_path):
    changes = full_change()
    changes[CATALOG]["tracks"][0]["title"] = "x" * (5 * 1024 * 1024)
    rejects(tmp_path, changes, "o catálogo do Anime passa de")


@pytest.mark.parametrize(("key", "value"), [("provider", "fixture"), ("storefront", "us")])
def test_rejects_a_catalog_from_another_provider_or_store(tmp_path, key, value):
    changes = full_change()
    changes[CATALOG][key] = value
    rejects(tmp_path, changes, "muda o esquema")


def test_ignores_warnings_that_are_a_symlink(tmp_path):
    if os.name == "nt":
        pytest.skip("link simbólico no Windows pede permissão")
    secret = tmp_path / "fora.txt"
    secret.write_bytes(b"aviso: o que nao devia sair\n")
    changes = full_change()
    repo, temp = tmp_path / "repo", tmp_path / "runner"
    temp.mkdir()
    (temp / "github-output").write_bytes(b"")
    setup_anime(repo, temp, changes, None)
    (temp / "anime-artifact" / "avisos.txt").symlink_to(secret)
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / "check-anime-pr.sh")],
        cwd=repo,
        env={**os.environ, **anime_env(temp, TODAY, None, "success", "success")},
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert "o que nao devia sair" not in section(temp)


# --- catalog-pr.sh: os Hits e o Anime no mesmo PR -------------------------------------------------


def run_pr(
    tmp_path: Path,
    hits_changes: dict[str, JSON] | None,
    anime_changes: dict[str, JSON] | None,
    *,
    hits_result: str = "success",
    anime_result: str = "success",
    anime_expected: bool | None = None,
    main: dict[str, JSON] | None = None,
    **anime_setup: object,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    """A main com os arquivos dos Hits (cópias dos de verdade) e os do Anime (os de `main`, ou os
    de sempre), os artefatos que vieram e o passo inteiro. Sem `anime_expected`, o Anime é
    esperado quando o artefato veio."""
    expected = anime_changes is not None if anime_expected is None else anime_expected
    repo, temp = tmp_path / "repo", tmp_path / "runner"
    temp.mkdir(parents=True)
    (temp / "github-output").write_bytes(b"")
    for key in ("ROMAJI", "CATALOG", "SCHEDULE", "FIXTURE_SCHEDULE"):
        write(repo / hits.PATHS[key], read(repo_root() / hits.PATHS[key]))
    (repo / hits.PATHS["SNAPSHOTS"]).mkdir(parents=True)
    if hits_changes is not None:
        art = temp / "artifact"
        for path, data in hits_changes.items():
            write(art / "files" / path, data)
        write(art / "changed.txt", "".join(f"{p}\n" for p in hits_changes))
    if anime_changes is not None:
        setup_anime(repo, temp, anime_changes, main, **anime_setup)  # type: ignore[arg-type]
    else:
        for path, data in (main or main_files()).items():
            write(repo / path, data)
    env = {
        **os.environ,
        **hits.PATHS,
        **anime_env(temp, TODAY, None, "success", "success"),
        "GENERATED_TODAY": TODAY,
        "FETCH": "success",
        "CHART": "success",
        "HITS_RESULT": hits_result,
        "ANIME_RESULT": anime_result,
        "ANIME_EXPECTED": "true" if expected else "false",
        "RUN_URL": RUN_URL,
    }
    done = subprocess.run(
        [BASH or "bash", str(SCRIPTS / "catalog-pr.sh")],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return done, repo, temp


def changed_list(temp: Path) -> list[str]:
    return read(temp / "changed.txt").split()


def test_hits_only_is_the_same_pr_as_before(tmp_path):
    changes = hits.full_change()
    done, repo, temp = run_pr(tmp_path / "pr", changes, None)
    assert done.returncode == 0, done.stdout + done.stderr
    alone_done, _, alone_temp = hits.run(tmp_path / "alone", changes)
    assert alone_done.returncode == 0
    assert read(temp / "pr-body.md") == read(alone_temp / "pr-body.md")
    output = read(temp / "github-output")
    assert hits.outputs(alone_temp).strip() in output  # o mesmo branch e o mesmo título
    assert "anime_rejected=false" in output
    assert changed_list(temp) == list(changes)
    for path, data in changes.items():
        assert read_json(repo / path) == data


def test_anime_only_builds_its_own_body_and_lands_in_the_tree(tmp_path):
    changes = full_change()
    done, repo, temp = run_pr(tmp_path, None, changes)
    assert done.returncode == 0, done.stdout + done.stderr
    body = read(temp / "pr-body.md")
    assert body.startswith(f"Anime de {TODAY} (gerado pela Action `update-catalog.yml`).")
    assert "- **Hits:** nada novo nesta execução" in body
    assert "**Busca do Anime de hoje:**" in body
    assert "**Para publicar:**" in body and RUN_URL in body
    output = read(temp / "github-output")
    assert f"branch=catalogo/{TODAY}" in output
    assert f"title=chore: Anime de {TODAY} (agenda até {iso(28)})" in output
    assert changed_list(temp) == list(changes)
    for path, data in changes.items():
        assert read_json(repo / path) == data


def test_anime_only_says_when_the_hits_job_failed(tmp_path):
    done, _, temp = run_pr(tmp_path, None, full_change(), hits_result="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "`catalog-generate` não terminou bem" in read(temp / "pr-body.md")


def test_hits_and_anime_in_one_pr(tmp_path):
    hits_changes, anime_changes = hits.full_change(), full_change()
    done, repo, temp = run_pr(tmp_path, hits_changes, anime_changes)
    assert done.returncode == 0, done.stdout + done.stderr
    body = read(temp / "pr-body.md")
    assert "**Parada da Apple de hoje:**" in body
    assert body.count("**Para publicar:**") == 1
    assert body.index("**Anime**") < body.index("**Para publicar:**")
    assert body.index("Agenda das fixtures") < body.index("**Anime**")
    real_last = max(hits_changes[hits.PATHS["SCHEDULE"]]["days"])
    output = read(temp / "github-output")
    assert (
        f"title=chore: parada de {TODAY} (agenda até {real_last}) e Anime (agenda até {iso(28)})"
        in output
    )
    assert "anime_rejected=false" in output
    assert changed_list(temp) == [*hits_changes, *anime_changes]
    for path, data in {**hits_changes, **anime_changes}.items():
        assert read_json(repo / path) == data


def test_a_rejected_anime_leaves_the_hits_pr(tmp_path):
    hits_changes, anime_changes = hits.full_change(), full_change()
    anime_changes[".github/workflows/ci.yml"] = {"x": 1}
    done, repo, temp = run_pr(tmp_path, hits_changes, anime_changes)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "fora da lista fechada do Anime" in done.stdout
    body = read(temp / "pr-body.md")
    assert "> **Anime:** a conferência recusou o artefato do Anime" in body
    assert body.index("> **Anime:**") < body.index("**Para publicar:**")
    output = read(temp / "github-output")
    assert "anime_rejected=true" in output
    assert changed_list(temp) == list(hits_changes)
    # Nada do Anime entrou na árvore: a main continua como estava.
    assert not (repo / SNAPSHOT).exists()
    assert read_json(repo / CATALOG) == base_catalog()
    assert not (repo / ".github").exists()


def test_a_rejected_anime_without_the_hits_fails(tmp_path):
    anime_changes = full_change()
    anime_changes[".github/workflows/ci.yml"] = {"x": 1}
    done, _, _ = run_pr(tmp_path, None, anime_changes)
    assert done.returncode == 1
    assert "nada a pôr no PR" in done.stdout


def test_rejected_hits_stop_everything(tmp_path):
    hits_changes = hits.full_change()
    hits_changes["web/src/main.json"] = {"x": 1}
    done, repo, _ = run_pr(tmp_path, hits_changes, full_change())
    assert done.returncode == 1
    assert "fora da lista fechada" in done.stdout
    assert not (repo / SNAPSHOT).exists()


def test_nothing_came(tmp_path):
    done, _, _ = run_pr(tmp_path, None, None)
    assert done.returncode == 1
    assert "nada a pôr no PR" in done.stdout


def test_an_expected_anime_artifact_that_did_not_arrive_leaves_the_hits_pr(tmp_path):
    # O download do artefato do Anime falhou (continue-on-error): os Hits seguem, e a tarefa
    # fica vermelha depois de abrir o PR.
    hits_changes = hits.full_change()
    done, _, temp = run_pr(tmp_path, hits_changes, None, anime_expected=True)
    assert done.returncode == 0, done.stdout + done.stderr
    body = read(temp / "pr-body.md")
    assert "> **Anime:** o artefato do Anime não chegou" in body
    assert body.index("> **Anime:**") < body.index("**Para publicar:**")
    assert "anime_rejected=true" in read(temp / "github-output")
    assert changed_list(temp) == list(hits_changes)


def test_a_partial_anime_artifact_is_a_rejection(tmp_path):
    hits_changes = hits.full_change()
    anime_changes = full_change()
    done, _, temp = run_pr(tmp_path, hits_changes, anime_changes, declared=[])
    assert done.returncode == 0, done.stdout + done.stderr
    assert "anime_rejected=true" in read(temp / "github-output")
    assert changed_list(temp) == list(hits_changes)


@pytest.mark.parametrize("result", ["failure", "cancelled"])
def test_says_when_the_anime_job_did_not_finish(tmp_path, result):
    hits_changes = hits.full_change()
    done, _, temp = run_pr(tmp_path, hits_changes, None, anime_result=result)
    assert done.returncode == 0, done.stdout + done.stderr
    body = read(temp / "pr-body.md")
    assert "> **Anime:** a tarefa `anime-generate` não terminou bem nesta semana" in body
    assert "anime_rejected=false" in read(temp / "github-output")


@pytest.mark.parametrize("result", ["success", "skipped"])
def test_says_nothing_when_the_anime_was_not_due(tmp_path, result):
    hits_changes = hits.full_change()
    done, _, temp = run_pr(tmp_path, hits_changes, None, anime_result=result)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "**Anime" not in read(temp / "pr-body.md")


# --- as Misturadas (M17, PR C) -------------------------------------------------------------------


def mixed_day(catalog: JSON, number: int) -> JSON:
    """Um dia das Misturadas: 4 rodadas de 2, 2, 2 e 3 faixas do catálogo."""
    ids = [t["id"] for t in catalog["tracks"][:9]]
    rounds = [
        {"answers": ids[0:2]},
        {"answers": ids[2:4]},
        {"answers": ids[4:6]},
        {"answers": ids[6:9]},
    ]
    return {
        "number": number,
        "catalogVersion": catalog["catalogVersion"],
        "musica": copy.deepcopy(rounds),
        "titulo": copy.deepcopy(rounds),
    }


def mixed_schedule(catalog: JSON, last: int, count: int = 7) -> JSON:
    """Uma agenda das Misturadas com `count` dias até hoje + `last`."""
    first = T + timedelta(days=last - count + 1)
    return {
        "schemaVersion": 1,
        "kind": "anime-mixed",
        "timezone": "America/Sao_Paulo",
        "epoch": first.isoformat(),
        "days": {
            (first + timedelta(days=i)).isoformat(): mixed_day(catalog, i + 1) for i in range(count)
        },
    }


def grown_mixed(base: JSON, catalog: JSON, days: list[str]) -> JSON:
    new = copy.deepcopy(base)
    count = len(new["days"])
    for i, d in enumerate(days):
        new["days"][d] = mixed_day(catalog, count + i + 1)
    return new


def main_with_mixed(ahead: int = 14, mixed_ahead: int = 6) -> dict[str, JSON]:
    """A main com as Misturadas: a delas mais curta que a do Anime, como na estreia."""
    main = main_files(ahead)
    # Uma semana antes de hoje e os dias à frente: a folga é a contagem dos dias depois de hoje.
    main[MIXED] = mixed_schedule(base_catalog(), mixed_ahead, count=mixed_ahead + 7)
    main[FIXTURE_MIXED] = mixed_schedule(fixture_catalog(), 10)
    return main


def mixed_change(main: dict[str, JSON], until: int = 28) -> dict[str, JSON]:
    """Uma semana de geração com as Misturadas: elas crescem até o fim da do Anime (P332)."""
    changes = full_change(main, until)
    changes[MIXED] = grown_mixed(main[MIXED], new_catalog(), new_days(main[MIXED], until))
    changes[FIXTURE_MIXED] = grown_mixed(
        main[FIXTURE_MIXED], fixture_catalog(), new_days(main[FIXTURE_MIXED], until)
    )
    return changes


def test_the_mixed_schedules_grow_with_the_anime(tmp_path):
    main = main_with_mixed()
    done, _, temp = run(tmp_path, mixed_change(main), main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    text = section(temp)
    assert f"- **Agenda das Misturadas:** 22 dia(s) novo(s), de {iso(7)} a {iso(28)}" in text
    assert "- **Agenda fictícia das Misturadas (só desenvolvimento):** 18 dia(s) novo(s)" in text


def test_only_the_mixed_when_the_anime_is_far(tmp_path):
    # A estreia das Misturadas: a do Anime com 25 dias à frente, a delas com 6. O robô gera, e só a
    # das Misturadas cresce, até o fim da do Anime, com o acervo de antes.
    main = main_with_mixed(ahead=25, mixed_ahead=6)
    changes = {MIXED: grown_mixed(main[MIXED], base_catalog(), new_days(main[MIXED], 25))}
    done, _, temp = run(tmp_path, changes, main=main, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert f"- **Agenda das Misturadas:** 19 dia(s) novo(s), de {iso(7)} a {iso(25)}" in section(
        temp
    )
    assert f"title=chore: Anime de {TODAY} (agenda até {iso(25)})" in read(temp / "github-output")


def test_rejects_when_the_anime_and_the_mixed_had_21_days(tmp_path):
    main = main_with_mixed(ahead=25, mixed_ahead=21)
    changes = {MIXED: grown_mixed(main[MIXED], base_catalog(), new_days(main[MIXED], 25))}
    rejects(tmp_path, changes, "já tem 25 dia(s) à frente, e a das Misturadas, 21", main=main)


def test_rejects_mixed_days_beyond_the_anime_schedule(tmp_path):
    main = main_with_mixed(ahead=25, mixed_ahead=6)
    changes = {MIXED: grown_mixed(main[MIXED], base_catalog(), new_days(main[MIXED], 26))}
    rejects(tmp_path, changes, "passa do fim da agenda do Anime", main=main)


def test_rejects_a_mixed_schedule_that_changes_an_old_day(tmp_path):
    main = main_with_mixed()
    changes = mixed_change(main)
    first = min(changes[MIXED]["days"])
    changes[MIXED]["days"][first]["number"] = 999
    rejects(tmp_path, changes, "altera o que já existe", main=main)


def test_rejects_a_mixed_answer_outside_the_catalog(tmp_path):
    main = main_with_mixed()
    changes = mixed_change(main)
    changes[MIXED]["days"][iso(20)]["titulo"][3]["answers"][2] = "apple:tr:1"
    rejects(tmp_path, changes, "cita faixa fora do catálogo", main=main)


def test_rejects_a_mixed_schedule_of_another_kind(tmp_path):
    main = main_with_mixed()
    changes = mixed_change(main)
    main[MIXED]["kind"] = "anime"
    changes[MIXED]["kind"] = "anime"
    rejects(tmp_path, changes, "altera o que já existe", main=main)


def test_rejects_a_mixed_schedule_that_the_main_does_not_have(tmp_path):
    main = main_with_mixed()
    changes = mixed_change(main)
    del main[MIXED]
    rejects(tmp_path, changes, "a main não tem a agenda das Misturadas", main=main)


# --- o quiz do dia (M18, PR C2) ------------------------------------------------------------------

QUIZ = ANIME["ANIME_QUIZ"]
FIXTURE_QUIZ = ANIME["ANIME_FIXTURE_QUIZ"]
QUIZ_LINE = "o mês do quiz muda o cabeçalho ou um dia que já existe"


def quiz_day(catalog: JSON, number: int) -> JSON:
    """Um dia do quiz: 2 rodadas, cada uma com 2 faixas do catálogo (a e b)."""
    ids = [t["id"] for t in catalog["tracks"][:4]]
    return {
        "number": number,
        "catalogVersion": catalog["catalogVersion"],
        "family": "ano",
        "direction": "max",
        "mal": False,
        "rounds": [
            {"a": ids[0], "b": ids[1], "answer": "a", "info": {"seasons": [SPRING_01, FALL_00]}},
            {"a": ids[2], "b": ids[3], "answer": "b", "info": {"seasons": [FALL_00, SPRING_01]}},
        ],
    }


SPRING_01 = {"season": "spring", "year": 2001}
FALL_00 = {"season": "fall", "year": 2000}
# A forma de um dia de cada família (o schema e o validate_quiz_schedule): a direção, o MAL, o
# parâmetro e o dado da revelação de cada rodada (None: a rodada sem o dado).
SHAPES: dict[str, tuple[str, bool, object, dict[str, object] | None]] = {
    "ano": ("min", False, None, {"seasons": [SPRING_01, FALL_00]}),
    "ano_x": ("tem", False, 2005, {"years": [2005, 2011]}),
    "playlists": ("max", False, None, {"playlists": [15, 1067]}),
    "amq": ("min", False, None, {"rates": [41.5, 0]}),
    "tema": ("nao", False, None, {"themes": ["OP", "ED12"]}),
    "nota": ("max", True, None, {"diff": 0.42}),
    "membros": ("min", True, None, {"diff": 125000}),
    "rotulo": ("tem", True, "Slice of Life", None),
    "fonte": ("nao", True, "light_novel", None),
    "estudio": ("tem", True, "Kyoto Animation", None),
}


def shaped(day: JSON, family: str) -> JSON:
    """O dia com a forma da família."""
    direction, mal, param, info = SHAPES[family]
    new = {**copy.deepcopy(day), "family": family, "direction": direction, "mal": mal}
    if param is not None:
        new["param"] = param
    for rnd in new["rounds"]:
        rnd.pop("info")
        if info is not None:
            rnd["info"] = copy.deepcopy(info)
    return new


def quiz_folder(folder: str, catalog: JSON, last: int, count: int = 40) -> dict[str, JSON]:
    """A agenda do quiz com `count` dias até hoje + `last`, um arquivo por mês (P379): com 40
    dias, sempre mais de um mês."""
    first = T + timedelta(days=last - count + 1)
    header = {
        "schemaVersion": 1,
        "kind": "anime-quiz",
        "timezone": "America/Sao_Paulo",
        "epoch": first.isoformat(),
    }
    files: dict[str, JSON] = {}
    for i in range(count):
        d = (first + timedelta(days=i)).isoformat()
        month = files.setdefault(f"{folder}/{d[:7]}.json", {**header, "month": d[:7], "days": {}})
        month["days"][d] = quiz_day(catalog, i + 1)
    return files


def months_of(main: dict[str, JSON], folder: str) -> dict[str, JSON]:
    return {p: m for p, m in main.items() if p.startswith(folder + "/")}


def joined(months: dict[str, JSON]) -> JSON:
    return {"days": {d: v for m in months.values() for d, v in m["days"].items()}}


def grown_quiz(months: dict[str, JSON], catalog: JSON, days: list[str]) -> dict[str, JSON]:
    """Os meses que mudam com os dias novos: o da main que cresce e os novos, com o cabeçalho
    dos da main."""
    folder = next(iter(months)).rsplit("/", 1)[0]
    header = {k: v for k, v in next(iter(months.values())).items() if k not in ("days", "month")}
    count = len(joined(months)["days"])
    changed: dict[str, JSON] = {}
    for i, d in enumerate(days):
        path = f"{folder}/{d[:7]}.json"
        if path not in changed:
            empty = {**header, "month": d[:7], "days": {}}
            changed[path] = copy.deepcopy(months.get(path, empty))
        changed[path]["days"][d] = quiz_day(catalog, count + i + 1)
    return changed


def main_with_quiz(ahead: int = 14, mixed_ahead: int = 14, quiz_ahead: int = 6) -> dict[str, JSON]:
    """A main com as Misturadas e o quiz: o do quiz mais curto, como na estreia dele."""
    main = main_with_mixed(ahead, mixed_ahead)
    main.update(quiz_folder(QUIZ, base_catalog(), quiz_ahead))
    main.update(quiz_folder(FIXTURE_QUIZ, fixture_catalog(), 10))
    return main


def quiz_change(main: dict[str, JSON], until: int = 28) -> dict[str, JSON]:
    """Uma semana de geração com o quiz: ele cresce até o fim das do Anime e das Misturadas."""
    changes = mixed_change(main, until)
    real, fake = months_of(main, QUIZ), months_of(main, FIXTURE_QUIZ)
    changes.update(grown_quiz(real, new_catalog(), new_days(joined(real), until)))
    changes.update(grown_quiz(fake, fixture_catalog(), new_days(joined(fake), until)))
    return changes


def month_with(changes: dict[str, JSON], day_str: str) -> JSON:
    """O mês do artefato que tem o dia."""
    return next(m for p, m in changes.items() if p.startswith(QUIZ + "/") and day_str in m["days"])


def month_turn() -> tuple[int, int]:
    """Os dias à frente de uma main do quiz que acaba 2 dias antes de um mês novo (o 1º dia de
    mês depois de hoje + 2) e os de uma geração que passa dele: o mês da main cresce e o seguinte
    nasce, seja qual for o hoje dos testes (o da agenda real, que anda toda semana)."""
    start = T + timedelta(days=3)
    turn = start if start.day == 1 else (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return (turn - T).days - 2, max(28, (turn - T).days)


def test_the_quiz_grows_with_the_anime_and_the_mixed(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    done, repo, temp = run(tmp_path, changes, main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    text = section(temp)
    assert (
        f"- **Agenda do quiz do dia:** 22 dia(s) novo(s), de {iso(7)} a {iso(28)}"
        f" (a da main vai até {iso(6)})" in text
    )
    assert "- **Agenda fictícia do quiz do dia (só desenvolvimento):** 18 dia(s) novo(s)" in text
    # As perguntas dos dias novos da agenda real (e só dela), para quem lê o PR.
    assert "**As perguntas dos dias novos do quiz do dia**" in text
    assert f"\n{iso(7)} ano max (2 rodadas)\n" in text
    assert text.count(" ano max (2 rodadas)") == 22
    # Só confere: os meses da main continuam como estavam, e os novos não entram na árvore.
    for path, data in months_of(main, QUIZ).items():
        assert read_json(repo / path) == data
    assert not any((repo / p).exists() for p in changes if p not in main)


def test_a_quiz_month_grows_and_the_next_one_is_born(tmp_path):
    ahead, until = month_turn()
    main = main_with_quiz(quiz_ahead=ahead)
    changes = quiz_change(main, until)
    real = months_of(changes, QUIZ)
    assert len(real) == 2
    assert sum(path in main for path in real) == 1  # o da main, que cresce, e o novo
    done, _, temp = run(tmp_path, changes, main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    assert (
        f"- **Agenda do quiz do dia:** {until - ahead} dia(s) novo(s),"
        f" de {iso(ahead + 1)} a {iso(until)}" in section(temp)
    )


def test_only_the_quiz_when_the_anime_and_the_mixed_are_far(tmp_path):
    # A estreia do quiz (o PR B do M18): o Anime e as Misturadas com 25 dias à frente, o quiz com
    # 6. O robô gera, e só o quiz cresce, até o fim das duas, com o acervo de antes.
    main = main_with_quiz(ahead=25, mixed_ahead=25, quiz_ahead=6)
    real = months_of(main, QUIZ)
    changes = grown_quiz(real, base_catalog(), new_days(joined(real), 25))
    done, _, temp = run(tmp_path, changes, main=main, fetch="failure")
    assert done.returncode == 0, done.stdout + done.stderr
    assert f"- **Agenda do quiz do dia:** 19 dia(s) novo(s), de {iso(7)} a {iso(25)}" in section(
        temp
    )


def test_rejects_when_the_anime_the_mixed_and_the_quiz_had_21_days(tmp_path):
    main = main_with_quiz(ahead=25, mixed_ahead=25, quiz_ahead=21)
    real = months_of(main, QUIZ)
    changes = grown_quiz(real, base_catalog(), new_days(joined(real), 25))
    message = "já tem 25 dia(s) à frente, e a das Misturadas, 25, e a do quiz do dia, 21"
    rejects(tmp_path, changes, message, main=main)


@pytest.mark.parametrize(
    ("mixed_ahead", "until", "message"),
    [
        (25, 26, "passa do fim da agenda do Anime"),  # P378
        (20, 22, "passa do fim da agenda das Misturadas"),  # a das Misturadas não cresceu
    ],
)
def test_rejects_quiz_days_beyond_the_anime_or_the_mixed(tmp_path, mixed_ahead, until, message):
    main = main_with_quiz(ahead=25, mixed_ahead=mixed_ahead, quiz_ahead=6)
    real = months_of(main, QUIZ)
    changes = grown_quiz(real, base_catalog(), new_days(joined(real), until))
    rejects(tmp_path, changes, message, main=main, fetch="failure")


def test_rejects_a_quiz_that_the_main_does_not_have(tmp_path):
    # A agenda real do quiz nasce com a tela (PR B do M18), nunca pelo robô.
    main = main_with_quiz()
    changes = quiz_change(main)
    for path in months_of(main, QUIZ):
        del main[path]
    rejects(tmp_path, changes, "a main não tem a agenda do quiz do dia", main=main)


def test_rejects_a_quiz_without_the_mixed_schedule(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    del main[MIXED]
    del changes[MIXED]
    rejects(tmp_path, changes, "o quiz do dia lê a agenda das Misturadas", main=main)


@pytest.mark.parametrize(
    ("path", "message"),
    [
        (f"{QUIZ}/2026-13.json", "mês do quiz do dia com nome fora do formato"),
        (f"{QUIZ}/notas.json", "mês do quiz do dia com nome fora do formato"),
        (f"{QUIZ}/velho/2026-11.json", "mês do quiz do dia fora da pasta dele"),
        (f"{FIXTURE_QUIZ}/2026-1.json", "mês do quiz do dia com nome fora do formato"),
    ],
)
def test_rejects_a_quiz_file_that_is_not_a_month(tmp_path, path, message):
    main = main_with_quiz()
    changes = quiz_change(main)
    changes[path] = {"days": {}}
    rejects(tmp_path, changes, message, main=main)


@pytest.mark.parametrize("what", ["epoch", "month", "old day", "other month", "same"])
def test_rejects_a_quiz_month_that_breaks_its_header_or_its_days(tmp_path, what):
    main = main_with_quiz()
    changes = quiz_change(main)
    grown = month_with(changes, iso(28))
    if what == "epoch":
        grown["epoch"] = iso(-100)
    elif what == "month":
        grown["month"] = "2000-01"
    elif what == "other month":
        grown["days"]["2000-01-01"] = quiz_day(new_catalog(), 1)
    else:
        # O 1º mês da main, que nunca cresce: igual, ou com um dia antigo mudado.
        first = min(months_of(main, QUIZ))
        changes[first] = copy.deepcopy(main[first])
        if what == "old day":
            day_str = min(changes[first]["days"])
            changes[first]["days"][day_str]["number"] = 999
    rejects(tmp_path, changes, QUIZ_LINE, main=main)


def test_rejects_a_new_quiz_month_before_the_last_of_main(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    header = {k: v for k, v in main[min(months_of(main, QUIZ))].items() if k != "days"}
    changes[f"{QUIZ}/2000-01.json"] = {
        **header,
        "month": "2000-01",
        "days": {"2000-01-01": quiz_day(new_catalog(), 1)},
    }
    rejects(tmp_path, changes, "o mês novo do quiz precisa vir depois do último da main", main=main)


def test_rejects_a_quiz_answer_outside_the_catalog(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    month_with(changes, iso(20))["days"][iso(20)]["rounds"][1]["b"] = "apple:tr:1"
    rejects(tmp_path, changes, "cita faixa fora do catálogo", main=main)


def test_rejects_quiz_days_with_another_catalog_version(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    month_with(changes, iso(20))["days"][iso(20)]["catalogVersion"] = "2026-01-01.00000000"
    rejects(tmp_path, changes, "cita faixa fora do catálogo", main=main)


def test_rejects_a_gap_between_new_quiz_days(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    del month_with(changes, iso(15))["days"][iso(15)]
    rejects(tmp_path, changes, "há buraco entre os dias novos", main=main)


def test_rejects_a_quiz_month_over_the_size_cap(tmp_path):
    main = main_with_quiz()
    changes = quiz_change(main)
    month_with(changes, iso(28))["padding"] = "x" * (2 * 1024 * 1024)
    rejects(tmp_path, changes, "o mês do quiz passa de 2097152 bytes", main=main)


def test_rejects_a_quiz_day_off_the_calendar(tmp_path):
    # O último dia de um mês trocado por um impossível do mesmo mês: o formato, a ordem, a conta e
    # o mês do arquivo batem, e só o calendário pega. A main acaba um dia antes do month_turn, e
    # o último dia do mês é o 2º dia novo (o 1º tem a regra dele).
    ahead, until = month_turn()
    main = main_with_quiz(quiz_ahead=ahead - 1)
    changes = quiz_change(main, until)
    last = iso(ahead + 1)
    month = month_with(changes, last)
    month["days"][f"{last[:8]}32"] = month["days"].pop(last)
    rejects(tmp_path, changes, f"dia novo fora do calendário: {last[:8]}32", main=main)


@pytest.mark.parametrize("family", sorted(SHAPES))
def test_accepts_a_quiz_day_of_each_family(tmp_path, family):
    main = main_with_quiz()
    changes = quiz_change(main)
    month = month_with(changes, iso(20))
    month["days"][iso(20)] = shaped(month["days"][iso(20)], family)
    done, _, temp = run(tmp_path, changes, main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    param = SHAPES[family][2]
    line = f"{iso(20)} {family} {SHAPES[family][0]}{'' if param is None else f' {param}'}"
    assert f"\n{line} (2 rodadas)\n" in section(temp)


def _no_info(day: JSON) -> None:
    for rnd in day["rounds"]:
        rnd.pop("info", None)


@pytest.mark.parametrize(
    ("family", "change"),
    [
        ("ano", lambda d: d.update(param="Drama")),  # a comparação não tem parâmetro
        ("ano", lambda d: d.update(direction="tem")),
        ("ano", lambda d: d.update(numero=1)),  # chave a mais
        ("ano", lambda d: d["rounds"][0].update(answer="c")),
        ("ano", lambda d: d["rounds"][0].update(b=d["rounds"][0]["a"])),
        ("ano", lambda d: d["rounds"][0]["info"].update(diff=1)),  # dois dados
        ("ano", lambda d: d["rounds"][0]["info"]["seasons"][0].update(month=4)),
        ("ano", lambda d: d["rounds"][0].update(info={"years": [2001, 2000]})),  # o de outra
        ("ano", _no_info),
        ("nota", lambda d: d.update(mal=False)),  # a família do MAL sem o MAL
        ("nota", lambda d: d["rounds"][0].update(info={"diff": -1})),
        ("amq", lambda d: d["rounds"][0].update(info={"rates": [101, 2]})),
        ("playlists", lambda d: d["rounds"][0].update(info={"playlists": [1.5, 3]})),
        ("tema", lambda d: d["rounds"][0].update(info={"themes": ["OPX", "ED"]})),
        ("ano_x", lambda d: d.update(param="2005")),
        ("fonte", lambda d: d.update(param="novel_mangá")),
        ("rotulo", lambda d: d.update(param="x" * 41)),
        ("rotulo", lambda d: d.update(param="<b>Drama</b>")),
        ("rotulo", lambda d: d.update(param="Drama\nveja https://x.y")),
        ("estudio", lambda d: d.update(param="https://x.y")),
        ("estudio", lambda d: d.update(param="")),
        ("estudio", lambda d: d.update(rounds=d["rounds"] * 16)),  # 32: o especial vai até 30
    ],
)
def test_rejects_a_quiz_day_out_of_shape(tmp_path, family, change):
    main = main_with_quiz()
    changes = quiz_change(main)
    month = month_with(changes, iso(20))
    day = shaped(month["days"][iso(20)], family)
    change(day)
    month["days"][iso(20)] = day
    rejects(tmp_path, changes, "um dia novo do quiz fora da forma", main=main)


def test_the_quiz_months_land_in_the_tree(tmp_path):
    # O mês que cresceu substitui o da main, e o novo entra na pasta.
    ahead, until = month_turn()
    main = main_with_quiz(quiz_ahead=ahead)
    changes = quiz_change(main, until)
    done, repo, temp = run_pr(tmp_path, None, changes, main=main)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "**Agenda do quiz do dia:**" in read(temp / "pr-body.md")
    assert changed_list(temp) == list(changes)
    for path, data in changes.items():
        assert read_json(repo / path) == data
