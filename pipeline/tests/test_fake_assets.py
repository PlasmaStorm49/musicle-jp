from __future__ import annotations

import copy
import io
import wave
import xml.etree.ElementTree as ET
from itertools import pairwise

import pytest

from musicle_pipeline.fake_assets import NOTES, SAMPLE_RATE, generate_assets, note_sequence
from musicle_pipeline.models import InputError


@pytest.fixture(scope="module")
def public(tmp_path_factory, fixture_catalog):
    root = tmp_path_factory.mktemp("public")
    generate_assets(fixture_catalog, root)
    return root


def _wav(public, track_id):
    data = (public / "fixtures" / "audio" / f"{track_id}.wav").read_bytes()
    return wave.open(io.BytesIO(data), "rb")


def test_every_file_cited_by_the_catalog_exists(public, fixture_catalog):
    for t in fixture_catalog["tracks"]:
        if t["preview"]:
            assert (public / t["preview"]["url"]).is_file(), t["preview"]["url"]
    for al in fixture_catalog["albums"]:
        if al["artworkUrl"]:
            assert (public / al["artworkUrl"]).is_file(), al["artworkUrl"]
    # A variante -v2 de tr09 também, porque vem do catálogo e não da parada.
    assert (public / "fixtures" / "audio" / "tr09-v2.wav").is_file()


def test_wav_format_and_duration(public):
    with _wav(public, "tr01") as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, SAMPLE_RATE)
        assert w.getnframes() == 30 * SAMPLE_RATE
    with _wav(public, "tr11") as w:  # preview de 10 s
        assert w.getnframes() == 10 * SAMPLE_RATE


def _dominant_frequency(samples: list[int]) -> float:
    # Uma senoide de f Hz cruza o zero 2f vezes por segundo.
    crossings = sum(1 for a, b in pairwise(samples) if a < 0 <= b or b < 0 <= a)
    return crossings / 2


def test_one_note_per_second(public, fixture_catalog):
    track_id = "fixture:tr:tr01"
    expected = note_sequence(track_id, 30)
    with _wav(public, "tr01") as w:
        raw = w.readframes(w.getnframes())
    samples = [int.from_bytes(raw[i : i + 2], "little", signed=True) for i in range(0, len(raw), 2)]
    for second, note in enumerate(expected[:5]):
        chunk = samples[second * SAMPLE_RATE : (second + 1) * SAMPLE_RATE]
        assert abs(_dominant_frequency(chunk) - NOTES[note]) < 3, f"segundo {second}"
    assert all(a != b for a, b in pairwise(expected))  # nunca a mesma nota em seguida


def test_svg_is_valid_xml_even_with_ampersand(public):
    # al05 é de "夜風シアター & 青井ユウ": sem escape, o & quebraria o XML.
    root = ET.fromstring((public / "fixtures" / "art" / "al05.svg").read_bytes())
    texts = [t.text for t in root.iter("{http://www.w3.org/2000/svg}text")]
    assert "夜風シアター & 青井ユウ" in texts


def test_second_run_writes_nothing(public, fixture_catalog):
    report = generate_assets(fixture_catalog, public)
    assert report.written == [] and report.removed == []
    assert report.unchanged > 0


def test_orphans_are_removed(tmp_path, fixture_catalog):
    generate_assets(fixture_catalog, tmp_path)
    orphan = tmp_path / "fixtures" / "audio" / "velho.wav"
    orphan.write_bytes(b"x")
    report = generate_assets(fixture_catalog, tmp_path)
    assert report.removed == [orphan]
    assert not orphan.exists()


@pytest.mark.parametrize(
    "url", ["../../.claude/settings.json", "fixtures/audio/../../x.wav", "fixtures/audio/a b.wav"]
)
def test_unsafe_urls_are_refused(tmp_path, fixture_catalog, url):
    catalog = copy.deepcopy(fixture_catalog)
    catalog["tracks"][0]["preview"]["url"] = url
    with pytest.raises(InputError, match="URL de asset"):
        generate_assets(catalog, tmp_path)
    assert not (tmp_path / ".claude").exists()


def test_real_provider_is_refused(tmp_path, fixture_catalog):
    catalog = copy.deepcopy(fixture_catalog)
    catalog["provider"] = "apple"
    with pytest.raises(InputError, match="fixture"):
        generate_assets(catalog, tmp_path)
