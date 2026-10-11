from __future__ import annotations

import copy
import json

from musicle_pipeline.io_json import dumps
from musicle_pipeline.validate import validate_catalog


def test_valid_catalog_and_canonical_bytes_pass(fixture_catalog):
    assert validate_catalog(fixture_catalog, dumps(fixture_catalog).encode("utf-8")) == []


def test_broken_album_reference_fails(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    cat["tracks"][0]["albumId"] = "fixture:al:nao-existe"
    problems = validate_catalog(cat)
    assert any("álbum inexistente" in p for p in problems)


def test_extra_field_fails_the_schema(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    cat["tracks"][0]["campoNovo"] = 1
    problems = validate_catalog(cat)
    assert problems and all(p.startswith("schema:") for p in problems)


def test_hand_edited_content_is_caught_by_catalog_version(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    cat["tracks"][0]["title"] = "Editado à mão"
    assert any("catalogVersion" in p for p in validate_catalog(cat))


def test_non_canonical_bytes_fail(fixture_catalog):
    raw = json.dumps(fixture_catalog, ensure_ascii=False, indent=4).encode("utf-8")
    assert any("forma canônica" in p for p in validate_catalog(fixture_catalog, raw))


def test_incoherent_eligibility_fails_the_schema(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    cat["tracks"][0]["eligible"] = {"daily": True, "reason": "no-preview"}
    assert any(p.startswith("schema:") for p in validate_catalog(cat))


def test_in_latest_must_match_last_seen(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    track = next(t for t in cat["tracks"] if t["chart"]["inLatest"] is False)
    track["chart"]["inLatest"] = True
    assert any("inLatest" in p for p in validate_catalog(cat))


def test_urls_must_stay_on_the_provider_hosts(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    track = next(t for t in cat["tracks"] if t["preview"] is not None)
    track["preview"]["url"] = "javascript:alert(1)"
    track["storeUrl"] = "https://music.apple.com/jp/song/1"  # a fixture não tem loja
    cat["albums"][0]["artworkUrl"] = "https://evil.example/a.svg"
    problems = validate_catalog(cat)
    assert any("prévia fora dos hosts" in p for p in problems)
    assert any("link da loja fora dos hosts" in p for p in problems)
    assert any("capa fora dos hosts" in p for p in problems)


def test_unknown_provider_has_no_url_rule(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    cat["provider"] = "outro"
    assert "provider 'outro' sem regra de URLs" in validate_catalog(cat)


def test_fixture_paths_cannot_climb_folders(fixture_catalog):
    cat = copy.deepcopy(fixture_catalog)
    track = next(t for t in cat["tracks"] if t["preview"] is not None)
    track["preview"]["url"] = "fixtures/audio/..x.wav"
    assert any("prévia fora dos hosts" in p for p in validate_catalog(cat))
