"""Áudio (WAV) e capas (SVG) sintéticos para a parada fictícia, gerados a partir do catálogo.

O áudio toca UMA NOTA POR SEGUNDO: o trecho de 1 s soa como 1 nota, o de 4 s como 4 notas.
Assim dá para conferir de ouvido se o jogo corta o trecho no tempo certo.

Nada disso vai para o Git (é regenerado). Só funciona com o provedor "fixture": no catálogo
real as URLs são da Apple e nunca se baixa nem se guarda áudio (termos de uso).
"""

from __future__ import annotations

import colorsys
import io
import math
import re
import struct
import unicodedata as ud
import wave
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from xml.sax.saxutils import escape

from musicle_pipeline.io_json import write_bytes_if_changed
from musicle_pipeline.models import JSON, InputError
from musicle_pipeline.prng import fnv1a32, seeded

SAMPLE_RATE = 11025
DEFAULT_SECONDS = 30
ENVELOPE = 110  # 10 ms de subida e de descida em cada nota, contra estalos
AMPLITUDE = 0.3 * 32767
# Pentatônica de dó em duas oitavas (MIDI 60..81): soa bem em qualquer sequência.
NOTES = tuple(440 * 2 ** ((m - 69) / 12) for m in (60, 62, 64, 67, 69, 72, 74, 76, 79, 81))

_SAFE_URL = re.compile(r"fixtures/(audio|art)/[A-Za-z0-9_-]+\.(wav|svg)")
_SAFE_COVER = re.compile(r"fixtures/anime/(small|large)-cover/[a-z0-9_]+\.svg")


@cache
def _note_second(index: int) -> bytes:
    """1 segundo de uma nota em PCM 16 bits; calculado uma vez e reaproveitado."""
    freq = NOTES[index]
    samples = []
    for i in range(SAMPLE_RATE):
        env = min(1.0, i / ENVELOPE, (SAMPLE_RATE - 1 - i) / ENVELOPE)
        samples.append(round(AMPLITUDE * env * math.sin(2 * math.pi * freq * i / SAMPLE_RATE)))
    return struct.pack(f"<{SAMPLE_RATE}h", *samples)


def note_sequence(track_id: str, seconds: int) -> list[int]:
    """Índices das notas, sorteados pelo ID da faixa, sem repetir a nota anterior."""
    rng = seeded(track_id)
    notes: list[int] = []
    for _ in range(seconds):
        n = rng.randint(len(NOTES))
        if notes and n == notes[-1]:
            n = (n + 1) % len(NOTES)
        notes.append(n)
    return notes


def wav_bytes(track_id: str, seconds: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(b"".join(_note_second(n) for n in note_sequence(track_id, seconds)))
    return buffer.getvalue()


def _color(entity_id: str) -> str:
    r, g, b = colorsys.hls_to_rgb((fnv1a32(entity_id) % 360) / 360, 0.22, 0.45)
    return f"#{round(r * 255):02x}{round(g * 255):02x}{round(b * 255):02x}"


def _clean_text(text: str) -> str:
    # Caractere de controle é proibido em XML; o resto o escape resolve (& < >).
    return escape("".join(c for c in text if ud.category(c) != "Cc"))


def svg_text(album: JSON) -> str:
    title = _clean_text(album["title"])
    artist = _clean_text(album["artistDisplay"])
    size = 56 if len(album["title"]) <= 9 else max(22, 56 * 9 // len(album["title"]))
    fonts = "'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif"
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">\n'
        f'  <rect width="600" height="600" fill="{_color(album["id"])}"/>\n'
        '  <circle cx="300" cy="250" r="150" fill="none" stroke="#ffffff" '
        'stroke-opacity="0.15" stroke-width="40"/>\n'
        f'  <text x="300" y="470" font-family="{fonts}" font-size="{size}" fill="#ffffff" '
        f'text-anchor="middle">{title}</text>\n'
        f'  <text x="300" y="530" font-family="{fonts}" font-size="26" fill="#ffffff" '
        f'fill-opacity="0.8" text-anchor="middle">{artist}</text>\n'
        "</svg>\n"
    )


@dataclass
class Report:
    written: list[Path] = field(default_factory=list)
    unchanged: int = 0
    removed: list[Path] = field(default_factory=list)


def _target(public: Path, url: str) -> Path:
    """Caminho em disco de uma URL do catálogo, recusando qualquer coisa fora de fixtures/."""
    if not _SAFE_URL.fullmatch(url):
        raise InputError(f"URL de asset fora do padrão fixtures/(audio|art)/<nome>: {url!r}")
    root = (public / "fixtures").resolve()
    path = (public / url).resolve()
    if not path.is_relative_to(root):
        raise InputError(f"URL de asset sai da pasta fixtures/: {url!r}")
    return path


def generate_assets(catalog: JSON, public: Path) -> Report:
    if catalog["provider"] != "fixture":
        raise InputError("fake-assets só roda com o provedor fixture (áudio real nunca é gravado)")
    wanted: dict[Path, bytes] = {}
    for t in catalog["tracks"]:
        if t["preview"]:
            seconds = round(t["preview"]["durationSec"] or DEFAULT_SECONDS)
            wanted[_target(public, t["preview"]["url"])] = wav_bytes(t["id"], seconds)
    for al in catalog["albums"]:
        if al["artworkUrl"]:
            wanted[_target(public, al["artworkUrl"])] = svg_text(al).encode("utf-8")

    report = Report()
    # O comando é dono destas pastas: apaga o que o catálogo não cita mais.
    _write(wanted, (("audio", ".wav"), ("art", ".svg")), public, report)
    return report


def _write(
    wanted: dict[Path, bytes], folders: tuple[tuple[str, str], ...], public: Path, report: Report
) -> None:
    for path, data in sorted(wanted.items()):
        if write_bytes_if_changed(path, data):
            report.written.append(path)
        else:
            report.unchanged += 1
    for folder, suffix in folders:
        directory = public / "fixtures" / folder
        for orphan in sorted(directory.glob(f"*{suffix}")) if directory.is_dir() else ():
            if orphan.resolve() not in wanted:
                orphan.unlink()
                report.removed.append(orphan)


# As capas falsas dos animes fictícios (o Anime Royale): em retrato, como as do AnimeThemes.
_COVER_FOLDERS = (("anime/small-cover", ".svg"), ("anime/large-cover", ".svg"))
_COVER_SIZES = {"small": (100, 141), "large": (460, 650)}


def cover_svg(name: str, slug: str, size: str) -> str:
    """A capa falsa de um anime: a cor sai do slug, e o nome fica embaixo. As duas têm o mesmo
    desenho, em tamanhos diferentes."""
    width, height = _COVER_SIZES[size]
    text = _clean_text(name)
    font = 44 if len(name) <= 12 else max(20, 44 * 12 // len(name))
    fonts = "'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        'viewBox="0 0 460 650">\n'
        f'  <rect width="460" height="650" fill="{_color(slug)}"/>\n'
        '  <polygon points="230,120 360,330 100,330" fill="none" stroke="#ffffff" '
        'stroke-opacity="0.2" stroke-width="36"/>\n'
        f'  <text x="230" y="560" font-family="{fonts}" font-size="{font}" fill="#ffffff" '
        f'text-anchor="middle">{text}</text>\n'
        "</svg>\n"
    )


def generate_anime_covers(catalog: JSON, public: Path) -> Report:
    """As capas falsas que o catálogo fictício do Anime cita, em fixtures/anime/; apaga as que ele
    não cita mais."""
    if catalog["provider"] != "fixture":
        raise InputError("as capas falsas são só do provedor fixture")
    wanted: dict[Path, bytes] = {}
    for t in catalog["tracks"]:
        for theme in t["anime"]["themes"]:
            for size, path in (theme["cover"] or {}).items():
                url = f"fixtures/{path}"
                match = _SAFE_COVER.fullmatch(url)
                if match is None or match.group(1) != size:
                    raise InputError(
                        f"capa fora do padrão fixtures/anime/<tamanho>-cover/: {url!r}"
                    )
                slug = path.rsplit("/", 1)[1].removesuffix(".svg")
                wanted[(public / url).resolve()] = cover_svg(theme["anime"], slug, size).encode()
    report = Report()
    _write(wanted, _COVER_FOLDERS, public, report)
    return report
