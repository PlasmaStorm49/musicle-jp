"""O latino das músicas do Anime nos Hits e nos artistas (o usuário, 24/10/2026)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from helpers import track_by_id
from musicle_pipeline import cli
from musicle_pipeline.aliases import parse_aliases
from musicle_pipeline.anime_latin import AnimeLatin, extract_latin, latin_file, load_latin
from musicle_pipeline.artists import build_artists, load_artist_list
from musicle_pipeline.catalog import Curation, anime_latin_key, build_catalog
from musicle_pipeline.cli import _anime_curation, _artist_curation, main
from musicle_pipeline.io_json import dumps, read_json
from musicle_pipeline.models import InputError
from musicle_pipeline.normalize import search_key
from musicle_pipeline.paths import anime_paths, artist_paths
from musicle_pipeline.providers import ARTIST_PROVIDERS
from musicle_pipeline.romaji_cache import RomajiCache


def _track(title: str, latin: str | None, source: str | None, artist: str = "apple:ar:1"):
    return {"title": title, "titleLatin": latin, "latinSource": source, "artistIds": [artist]}


def _catalog(*tracks) -> dict:
    return {"catalogVersion": "2026-10-24.0000abcd", "provider": "apple", "tracks": list(tracks)}


def test_only_the_latin_made_by_people_comes_from_the_anime():
    names, notes = extract_latin(
        _catalog(
            _track("明け星", "Akeboshi", "provider"),
            _track("残響散歌", "Zankyou Zanka", "manual"),
            _track("紅蓮華", None, None),
            _track("夜に駆ける", "Yoru ni kakeru", "cutlet"),
        )
    )
    assert names == {
        anime_latin_key("明け星", "apple:ar:1"): "Akeboshi",
        anime_latin_key("残響散歌", "apple:ar:1"): "Zankyou Zanka",
    }
    assert notes == []


def test_the_title_with_a_version_or_credit_suffix_is_left_out():
    # O latino do AnimeThemes é o do tema: "X (TV Size)" ficaria com o nome pela metade. O
    # travessão curto também é sufixo (o NFKC não o troca pelo hífen; visto no Anime real).
    names, _ = extract_latin(
        _catalog(
            _track("夜明けのメロディ (TV Size)", "Yoake no Melody", "provider"),
            _track("風になる (feat. ナナ)", "Kaze ni Naru", "provider"),
            _track("リフレインボーイ –TV size-", "Refrain Boy", "provider"),
            _track("♡", "Heart", "provider"),
        )
    )
    assert names == {}


def test_the_key_is_the_whole_normalized_title_and_the_first_artist():
    two = {**_track("ｱｲﾉｳﾀ", "Ai no Uta", "provider"), "artistIds": ["apple:ar:9", "apple:ar:8"]}
    names, _ = extract_latin(_catalog(two))
    # A meia largura e a largura normal são a mesma chave; só o 1º artista entra nela.
    assert names == {anime_latin_key("アイノウタ", "apple:ar:9"): "Ai no Uta"}


def test_two_latins_for_the_same_song_leave_it_out_with_a_warning():
    names, notes = extract_latin(
        _catalog(_track("明け星", "Akeboshi", "provider"), _track("明け星", "Ake Hoshi", "manual"))
    )
    assert names == {}
    assert len(notes) == 1
    assert "Ake Hoshi" in notes[0] and "Akeboshi" in notes[0]


def test_the_file_names_its_catalog_and_reads_back(tmp_path):
    data, _ = latin_file(_catalog(_track("明け星", "Akeboshi", "provider")))
    assert data["catalogVersion"] == "2026-10-24.0000abcd"
    assert data["provider"] == "apple"
    path = tmp_path / "latin.json"
    path.write_bytes(dumps(data).encode("utf-8"))
    assert load_latin(path, "apple") == AnimeLatin(data["tracks"], "2026-10-24.0000abcd")


@pytest.mark.parametrize(
    ("text", "match"),
    [
        ('{"provider": "apple", "catalogVersion": "v", "tracks": {"x|apple:ar:1": ""}}', "tracks"),
        ('{"provider": "apple", "tracks": {}}', "tracks"),
        # O do outro provedor: as chaves nunca casariam, e os latinos sumiriam sem erro.
        ('{"provider": "fixture", "catalogVersion": "v", "tracks": {}}', "provedor apple"),
        ("[]", "provedor apple"),
    ],
)
def test_a_bad_file_is_refused(tmp_path, text, match):
    bad = tmp_path / "latin.json"
    bad.write_text(text, encoding="utf-8")
    with pytest.raises(InputError, match=match):
        load_latin(bad, "apple")


def test_a_missing_file_is_no_latin(tmp_path):
    assert load_latin(tmp_path / "nao-existe.json", "apple") == AnimeLatin()


def _key(catalog, provider_id: str) -> str:
    t = track_by_id(catalog, provider_id)
    return anime_latin_key(t["title"], t["artistIds"][0])


def test_the_anime_latin_beats_the_romaji_and_searches(fixture_snapshots, fixture_catalog):
    romaji = RomajiCache(engine="cutlet", entries={"ガラスの靴": ("garasu no kutsu",)})
    anime = {_key(fixture_catalog, "tr16"): "Glass Slipper"}
    cur = Curation(romaji=romaji, anime_latin=anime)
    t = track_by_id(build_catalog(fixture_snapshots, "fixture", "jp", cur), "tr16")
    assert (t["titleLatin"], t["latinSource"]) == ("Glass Slipper", "provider")
    # O romaji continua na busca, ao lado do latino do Anime.
    assert {search_key("Glass Slipper"), "garasunokutsu"} <= set(t["search"]["title"])


def test_the_apple_latin_and_the_manual_one_beat_the_anime(fixture_snapshots, fixture_catalog):
    anime = {
        _key(fixture_catalog, "tr22"): "Tokyo Raitsu",
        _key(fixture_catalog, "tr16"): "Glass Slipper",
    }
    aliases = parse_aliases('[tracks."fixture:tr:tr16"]\nlatin = "Garasu no Kutsu"\n', "t")
    cur = Curation(aliases=aliases, anime_latin=anime)
    catalog = build_catalog(fixture_snapshots, "fixture", "jp", cur)
    apple = track_by_id(catalog, "tr22")
    assert (apple["titleLatin"], apple["latinSource"]) == ("Tōkyō Lights", "provider")
    manual = track_by_id(catalog, "tr16")
    assert (manual["titleLatin"], manual["latinSource"]) == ("Garasu no Kutsu", "manual")
    # Nas duas, o latino do Anime ainda acha a música.
    assert search_key("Tokyo Raitsu") in apple["search"]["title"]
    assert search_key("Glass Slipper") in manual["search"]["title"]


def test_the_artist_files_read_the_anime_latin_too():
    paths = artist_paths("fixture")
    provider = ARTIST_PROVIDERS["fixture"]()
    rules = load_artist_list(paths.artists)
    cur = _artist_curation("fixture")
    before = build_artists(provider, rules, replace(cur, anime_latin={}), [])
    t = next(t for t in before["ar02.json"]["tracks"] if t["title"] == "カーテンコール")
    anime = {anime_latin_key(t["title"], t["artistIds"][0]): "Curtain Call!"}
    after = build_artists(ARTIST_PROVIDERS["fixture"](), rules, replace(cur, anime_latin=anime), [])
    u = next(u for u in after["ar02.json"]["tracks"] if u["id"] == t["id"])
    assert (u["titleLatin"], u["latinSource"]) == ("Curtain Call!", "provider")
    assert search_key("Curtain Call!") in u["search"]["title"]
    # O manual dos artistas também vence o do Anime, que fica na busca.
    aliases = parse_aliases(f'[tracks."{t["id"]}"]\nlatin = "Kaaten Kooru"\n', "t")
    manual = replace(cur, aliases=aliases, anime_latin=anime)
    files = build_artists(ARTIST_PROVIDERS["fixture"](), rules, manual, [])
    m = next(m for m in files["ar02.json"]["tracks"] if m["id"] == t["id"])
    assert (m["titleLatin"], m["latinSource"]) == ("Kaaten Kooru", "manual")
    assert search_key("Curtain Call!") in m["search"]["title"]


def test_a_latin_version_suffix_keeps_the_versions_alike(fixture_snapshots, fixture_catalog):
    """tr01, tr02 e tr03 são a mesma música de ar01 (fixtures/README.md): a tr03 é a "(TV Size)"
    e leva o latino do Anime com o sufixo, e o single dela (al01), o mesmo da faixa."""
    anime = {_key(fixture_catalog, "tr01"): "Yoake no Melody"}
    catalog = build_catalog(fixture_snapshots, "fixture", "jp", Curation(anime_latin=anime))
    assert track_by_id(catalog, "tr01")["titleLatin"] == "Yoake no Melody"
    tv = track_by_id(catalog, "tr03")
    assert (tv["titleLatin"], tv["latinSource"]) == ("Yoake no Melody (TV Size)", "provider")
    single = next(a for a in catalog["albums"] if a["id"] == "fixture:al:al01")
    assert (single["titleLatin"], single["latinSource"]) == ("Yoake no Melody", "provider")
    # O álbum completo não é a faixa: fica sem o latino dela.
    full = next(a for a in catalog["albums"] if a["id"] == "fixture:al:al02")
    assert full["titleLatin"] != "Yoake no Melody"
    # A mesma música de outro artista (a tr04, de ar14) não é a do Anime.
    assert track_by_id(catalog, "tr04")["titleLatin"] is None


def test_a_suffix_with_kana_gets_no_anime_latin(fixture_snapshots, fixture_catalog):
    # "風になる (feat. ナナ)": o "Kaze ni Naru" do Anime perderia o crédito.
    t = track_by_id(fixture_catalog, "tr27")
    anime = {anime_latin_key("風になる", t["artistIds"][0]): "Kaze ni Naru"}
    catalog = build_catalog(fixture_snapshots, "fixture", "jp", Curation(anime_latin=anime))
    assert track_by_id(catalog, "tr27")["latinSource"] is None


def test_the_anime_build_never_reads_its_own_extract():
    # O Anime dependeria de um arquivo tirado dele mesmo.
    assert _anime_curation("fixture").anime_latin == {}


def test_the_build_warns_when_the_extract_is_behind(tmp_path, monkeypatch, capsys):
    real = anime_paths("fixture")
    old = tmp_path / "latin.json"
    old.write_text(
        '{"provider": "fixture", "catalogVersion": "2026-01-01.00000000", "tracks": {}}',
        encoding="utf-8",
    )
    monkeypatch.setattr(cli, "anime_paths", lambda _provider: replace(real, latin=old))
    out = tmp_path / "catalog.json"
    assert main(["build", "--provider", "fixture", "--out", str(out)]) == 0
    err = capsys.readouterr().err
    assert "saiu do catálogo do Anime 2026-01-01.00000000" in err
    assert "rode o anime-latin" in err


def test_the_command_extracts_from_the_published_anime_catalog(tmp_path, capsys):
    out = tmp_path / "latin.json"
    assert main(["anime-latin", "--provider", "fixture", "--out", str(out)]) == 0
    assert "rode o build e o build-artists" in capsys.readouterr().out
    published = read_json(anime_paths("fixture").public_dir / "catalog.json")
    assert out.read_bytes() == dumps(latin_file(published)[0]).encode("utf-8")
    assert main(["anime-latin", "--provider", "fixture", "--out", str(out)]) == 0
    assert "sem mudanças" in capsys.readouterr().out


def test_the_command_refuses_a_missing_or_foreign_catalog(tmp_path, capsys):
    out = tmp_path / "latin.json"
    missing = ["--catalog", str(tmp_path / "nao-existe.json")]
    assert main(["anime-latin", "--provider", "fixture", *missing, "--out", str(out)]) == 1
    assert "rode o build-anime" in capsys.readouterr().err
    fixture = str(anime_paths("fixture").public_dir / "catalog.json")
    assert (
        main(["anime-latin", "--provider", "apple", "--catalog", fixture, "--out", str(out)]) == 1
    )
    assert "não do apple" in capsys.readouterr().err
    assert not out.exists()


def test_the_committed_fixture_file_is_up_to_date():
    """O latin.json das fixtures é o que o anime-latin tira do catálogo do Anime fictício. O da
    Apple fica de fora de propósito: o robô refaz o catálogo do Anime real sem ele, e o latino
    dos Hits só muda num PR à mão (anime-latin, build e build-artists). Se falhar, rode o
    anime-latin --provider fixture e os dois builds."""
    paths = anime_paths("fixture")
    published = read_json(paths.public_dir / "catalog.json")
    assert paths.latin.read_bytes() == dumps(latin_file(published)[0]).encode("utf-8")
