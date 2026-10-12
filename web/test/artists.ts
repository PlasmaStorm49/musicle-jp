// Os arquivos do modo por artista (M13), fictícios e reais, para os testes que os usam. À parte
// de fixtures.ts: só quem importa daqui lê os arquivos (os reais somam cerca de 1 MB).
import type { ArtistCatalog, ArtistList } from "../src/core/types.ts";
import { readJson } from "./fixtures.ts";

/** Os artistas da lista, na ordem dela, com o arquivo de cada um. */
function artistsOf(dir: string): { list: ArtistList; files: ArtistCatalog[] } {
  const list = readJson<ArtistList>("artists/index.json", dir);
  const files = list.artists.map((a) => readJson<ArtistCatalog>(`artists/${a.file}`, dir));
  return { list, files };
}

/** Os artistas fictícios (pipeline/fixtures/artists). */
export const artists = artistsOf("fixtures");
/** Os artistas reais (web/public/data/artists), buscados à mão (README). */
export const realArtists = artistsOf("data");
