from __future__ import annotations

import shutil
import subprocess

import pytest

from musicle_pipeline.io_json import read_json
from musicle_pipeline.paths import repo_root
from musicle_pipeline.prng import Mulberry32, fnv1a32, seeded

VECTORS_PATH = repo_root() / "shared" / "vectors" / "prng.json"
REFERENCE = repo_root() / "shared" / "vectors" / "prng_reference.mjs"
VECTORS = read_json(VECTORS_PATH)


@pytest.mark.parametrize(
    ("text", "expected"),
    [("", 0x811C9DC5), ("a", 0xE40C292C), ("foobar", 0xBF9CF968)],
)
def test_fnv1a32_official_values(text, expected):
    # Valores publicados do FNV-1a de 32 bits: não dependem da nossa referência em JS.
    assert fnv1a32(text) == expected


@pytest.mark.parametrize("case", VECTORS["fnv1a32"], ids=lambda c: repr(c["input"]))
def test_fnv1a32_vectors(case):
    assert fnv1a32(case["input"]) == case["output"]


@pytest.mark.parametrize("case", VECTORS["mulberry32"], ids=lambda c: str(c["seed"]))
def test_mulberry32_vectors(case):
    rng = Mulberry32(case["seed"])
    assert [rng.next_u32() for _ in range(10)] == case["first10"]
    for _ in range(10, 999):
        rng.next_u32()
    assert rng.next_u32() == case["at1000"]


@pytest.mark.parametrize("case", VECTORS["randint"], ids=lambda c: f"n={c['n']}")
def test_randint_vectors(case):
    rng = Mulberry32(case["seed"])
    assert [rng.randint(case["n"]) for _ in range(10)] == case["values"]


@pytest.mark.parametrize("case", VECTORS["shuffle"], ids=lambda c: str(c["seed"]))
def test_shuffle_vectors(case):
    items = list(case["input"])
    Mulberry32(case["seed"]).shuffle(items)
    assert items == case["output"]


def test_random_is_in_unit_interval():
    rng = Mulberry32(0xFFFFFFFF)
    assert all(0 <= rng.random() < 1 for _ in range(1000))


def test_randint_rejects_empty_range():
    with pytest.raises(ValueError):
        Mulberry32(1).randint(0)


def test_seeded_uses_the_text_hash():
    assert seeded("musicle-jp").next_u32() == Mulberry32(fnv1a32("musicle-jp")).next_u32()


@pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")
def test_vectors_match_a_fresh_run_of_the_reference(tmp_path):
    out = tmp_path / "prng.json"
    subprocess.run(["node", str(REFERENCE), str(out)], check=True, capture_output=True)
    assert read_json(out) == VECTORS
